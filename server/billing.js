// Subscriptions. Talks to Stripe's REST API directly (no SDK) when a secret key
// is configured; otherwise runs a fully-working DEMO mode where plan changes
// apply instantly with no charge — so the whole billing UX is testable before
// you wire real keys. Plan → tool-deck entitlements live in config.plans.
import { config } from './config.js';
import { getUser, updateUser, publicUser, audit } from './auth.js';

import { CAPABILITIES } from './catalog.js';

export const billingLive = () => Boolean(config.stripe.secret);
export const plans = () => Object.values(config.plans).map((p) => ({ ...p, capabilities: capsForPlan(p) }));
export function planFor(user) {
  return config.plans[user?.subscription?.plan || user?.plan || 'free'] || config.plans.free;
}

// The full capability set a plan unlocks: base + anything whose tier the plan includes.
export function capsForPlan(plan) {
  const caps = new Set(plan.base || []);
  for (const c of Object.values(CAPABILITIES)) {
    if (!c.tier || (plan.tiers || []).includes(c.tier)) caps.add(c.id);
  }
  return [...caps];
}
// Does this account's plan include a given capability?
export function entitled(user, capability) {
  return capsForPlan(planFor(user)).includes(capability);
}
// Intro pricing: 60% off the first N months.
export function introPrice(price) {
  const d = config.introDiscount;
  if (!price || !d) return price;
  return Math.round(price * (1 - d.percent / 100));
}

async function stripe(path, method = 'POST', form = null) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripe.secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form ? new URLSearchParams(form) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `stripe ${res.status}`);
  return data;
}

// Start a checkout. Live → a Stripe Checkout Session URL. Demo → we flip the
// plan immediately and hand back a local "success" URL.
export async function startCheckout(user, planId, baseUrl) {
  const plan = config.plans[planId];
  if (!plan || planId === 'free') throw new Error('Pick a paid plan.');

  if (!billingLive()) {
    setPlan(user.id, planId, { status: 'active', demo: true });
    audit('billing', `DEMO subscribe ${user.email} → ${planId}`);
    return { url: `${baseUrl}/?billing=success&demo=1`, demo: true };
  }

  const priceMap = { starter: config.stripe.priceStarter, pro: config.stripe.pricePro, growth: config.stripe.priceGrowth };
  const price = priceMap[planId];
  if (!price) throw new Error(`No Stripe price configured for ${planId}. Add STRIPE_PRICE_${planId.toUpperCase()}.`);

  let customer = user.subscription?.stripeCustomer;
  if (!customer) {
    const c = await stripe('customers', 'POST', { email: user.email, name: user.name, 'metadata[userId]': user.id });
    customer = c.id;
    updateUser(user.id, (u) => { u.subscription.stripeCustomer = customer; });
  }
  const session = await stripe('checkout/sessions', 'POST', {
    mode: 'subscription',
    customer,
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    success_url: `${baseUrl}/?billing=success`,
    cancel_url: `${baseUrl}/?billing=cancel`,
    'metadata[userId]': user.id,
    'metadata[plan]': planId,
  });
  return { url: session.url, demo: false };
}

export async function cancel(user) {
  if (billingLive() && user.subscription?.stripeSub) {
    await stripe(`subscriptions/${user.subscription.stripeSub}`, 'DELETE').catch(() => {});
  }
  setPlan(user.id, 'free', { status: 'active' });
  audit('billing', `cancel ${user.email} → free`);
}

export function setPlan(userId, planId, extra = {}) {
  return updateUser(userId, (u) => {
    u.plan = planId;
    u.subscription = { ...u.subscription, plan: planId, status: 'active', since: Date.now(), ...extra };
  });
}

// Stripe webhook (checkout.session.completed / subscription updates). Signature
// verification is best-effort here; harden with the signing secret in prod.
export function handleWebhook(event) {
  const obj = event?.data?.object || {};
  const userId = obj.metadata?.userId;
  if (event.type === 'checkout.session.completed' && userId) {
    setPlan(userId, obj.metadata?.plan || 'pro', { status: 'active', stripeSub: obj.subscription });
    audit('billing', `stripe subscribed userId=${userId} → ${obj.metadata?.plan}`);
  }
  if (event.type === 'customer.subscription.deleted') {
    const u = getUser(userId);
    if (u) setPlan(userId, 'free', { status: 'canceled' });
  }
}

export function billingState(user) {
  const plan = planFor(user);
  return {
    live: billingLive(),
    plan: plan.id, planName: plan.name,
    status: user.subscription?.status || 'active',
    since: user.subscription?.since || user.createdAt,
    agents: plan.agents,
    capabilities: capsForPlan(plan),
    intro: config.introDiscount,
  };
}

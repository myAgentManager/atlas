// Subscriptions. Talks to Stripe's REST API directly (no SDK) when a secret key
// is configured; otherwise runs a fully-working DEMO mode where plan changes
// apply instantly with no charge — so the whole billing UX is testable before
// you wire real keys. Plan → tool-deck entitlements live in config.plans.
import crypto from 'node:crypto';
import { config } from './config.js';
import { getUser, updateUser, publicUser, audit } from './auth.js';
import { getPlatform } from './platform.js';
import { businessIdFor, ownerOf } from './teams.js';

import { CAPABILITIES } from './catalog.js';

// The subscription belongs to the business OWNER — team members share it. Any
// plan/capability/limit question resolves to the owner's account.
function ownerUser(user) {
  if (!user) return user;
  const ownerId = ownerOf(businessIdFor(user.id));
  return ownerId === user.id ? user : (getUser(ownerId) || user);
}

// Keys pasted into Operations → Payments win; env vars remain the fallback,
// so going live never needs a redeploy.
const stripeCfg = () => {
  const p = getPlatform().stripe || {};
  return {
    secret: p.secretKey || config.stripe.secret,
    priceStarter: p.priceStarter || config.stripe.priceStarter,
    pricePro: p.pricePro || config.stripe.pricePro,
    priceGrowth: p.priceGrowth || config.stripe.priceGrowth,
  };
};

export const billingLive = () => Boolean(stripeCfg().secret);
export const plans = () => Object.values(config.plans).map((p) => ({ ...p, capabilities: capsForPlan(p) }));
export function planFor(user) {
  const o = ownerUser(user);
  return config.plans[o?.subscription?.plan || o?.plan || 'free'] || config.plans.free;
}

// The full capability set a plan unlocks: base + anything whose tier the plan includes.
export function capsForPlan(plan) {
  const caps = new Set(plan.base || []);
  for (const c of Object.values(CAPABILITIES)) {
    if (!c.tier || (plan.tiers || []).includes(c.tier)) caps.add(c.id);
  }
  return [...caps];
}
// Does this account's plan include a given capability? Founders (Atlas Networks
// staff) get everything, comped — no subscription required.
export function entitled(user, capability) {
  if (ownerUser(user)?.founder) return true;
  return capsForPlan(planFor(user)).includes(capability);
}
// How many agents this business may run. Founders effectively unlimited.
export function agentLimit(user) {
  return ownerUser(user)?.founder ? 999 : planFor(user).agents;
}
// Team seats: any paid plan is unlimited; the free plan allows two people.
export function seatLimit(user) {
  if (ownerUser(user)?.founder) return 999;
  return planFor(user).id === 'free' ? 2 : Infinity;
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
      Authorization: `Bearer ${stripeCfg().secret}`,
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

  const sc = stripeCfg();
  const priceMap = { starter: sc.priceStarter, pro: sc.pricePro, growth: sc.priceGrowth };
  const price = priceMap[planId];
  if (!price) throw new Error(`No Stripe price configured for ${planId}. Add it in Operations → Payments (or STRIPE_PRICE_${planId.toUpperCase()}).`);

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

// Verify a Stripe webhook signature (t=…,v1=… → HMAC-SHA256 of "t.body" with
// the signing secret). Without a configured secret we trust NOTHING — otherwise
// anyone could POST a fake "subscription completed" and upgrade for free.
export function verifyWebhook(rawBody, sigHeader) {
  const secret = getPlatform().stripe?.webhookSecret || config.stripe.webhookSecret;
  if (!secret) return false;
  const parts = Object.fromEntries(String(sigHeader || '').split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false; // 5-min replay window
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected)); } catch { return false; }
}

// Stripe webhook (checkout.session.completed / subscription updates).
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
  const owner = ownerUser(user);
  const founder = Boolean(owner?.founder);
  const seats = seatLimit(user);
  return {
    live: billingLive(),
    plan: plan.id, planName: plan.name,
    status: owner?.subscription?.status || 'active',
    since: owner?.subscription?.since || user.createdAt,
    agents: agentLimit(user),
    seatLimit: seats === Infinity ? null : seats, // null = unlimited
    capabilities: founder ? Object.keys(CAPABILITIES) : capsForPlan(plan),
    intro: config.introDiscount,
    founder,
    comped: founder,
    sharedByOwner: ownerOf(businessIdFor(user.id)) !== user.id, // this account is on someone else's plan
  };
}

// The platform catalog: the CONNECTORS a business plugs in (their integration
// tools), and the CAPABILITIES an agent can be given (each needs certain
// connectors to actually run). Shared by the API and the UI so both agree.

// Integration tools a business configures once, then agents draw on them.
export const CONNECTORS = {
  imap: {
    id: 'imap', name: 'Email inbox (IMAP)', icon: 'file',
    blurb: 'Let agents read and triage your incoming email.',
    fields: [
      { key: 'host', label: 'IMAP host', placeholder: 'imap.gmail.com' },
      { key: 'port', label: 'Port', placeholder: '993' },
      { key: 'user', label: 'Username', placeholder: 'you@business.com' },
      { key: 'pass', label: 'Password / app password', secret: true },
    ],
    required: ['host', 'user', 'pass'],
  },
  smtp: {
    id: 'smtp', name: 'Email sending (SMTP)', icon: 'send',
    blurb: 'Let agents send replies, reminders and follow-ups from your address.',
    fields: [
      { key: 'host', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', placeholder: '587' },
      { key: 'user', label: 'Username', placeholder: 'you@business.com' },
      { key: 'pass', label: 'Password / app password', secret: true },
      { key: 'from', label: 'From address', placeholder: 'hello@business.com' },
    ],
    required: ['host', 'from'],
  },
  twilio: {
    id: 'twilio', name: 'Twilio — SMS & Voice', icon: 'chat',
    blurb: 'Let agents text customers and answer phone calls.',
    fields: [
      { key: 'sid', label: 'Account SID', placeholder: 'AC…' },
      { key: 'token', label: 'Auth token', secret: true },
      { key: 'from', label: 'Twilio number', placeholder: '+15555550123' },
    ],
    required: ['sid', 'token', 'from'],
  },
  calendar: {
    id: 'calendar', name: 'Calendar', icon: 'calendar',
    blurb: 'Let agents check availability and book appointments.',
    fields: [
      { key: 'url', label: 'Calendar / scheduling URL', placeholder: 'https://cal.com/you' },
    ],
    required: ['url'],
  },
  webhook: {
    id: 'webhook', name: 'CRM / Webhook', icon: 'plug',
    blurb: 'Push captured leads, orders and trends into your own systems.',
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://your-system/hook' },
    ],
    required: ['url'],
  },
};

// What an agent can be told to do. `needs` lists connectors required for it to
// run for real (empty = works out of the box).
export const CAPABILITIES = {
  email: { id: 'email', name: 'Respond to emails', icon: 'send', needs: ['imap', 'smtp'] },
  phone: { id: 'phone', name: 'Answer phone calls', icon: 'chat', needs: ['twilio'], tier: 'growth' },
  sms: { id: 'sms', name: 'Text (SMS)', icon: 'chat', needs: ['twilio'], tier: 'pro' },
  webchat: { id: 'webchat', name: 'Live website chat', icon: 'globe', needs: [] },
  bookings: { id: 'bookings', name: 'Appointments & bookings', icon: 'calendar', needs: [] },
  orders: { id: 'orders', name: 'Take orders & requests', icon: 'bolt', needs: [] },
  faq: { id: 'faq', name: 'Answer FAQs', icon: 'chat', needs: [] },
  sales: { id: 'sales', name: 'Pitch sales & product info', icon: 'spark', needs: [] },
  crm: { id: 'crm', name: 'Capture leads & trends', icon: 'user', needs: [] },
  reminders: { id: 'reminders', name: 'Reminders & follow-ups', icon: 'clock', needs: ['smtp'] },
  multilingual: { id: 'multilingual', name: 'Every language', icon: 'globe', needs: [], tier: 'pro' },
  afterhours: { id: 'afterhours', name: 'After-hours coverage', icon: 'clock', needs: [], tier: 'pro' },
  alerts: { id: 'alerts', name: 'Alert staff to issues', icon: 'bell', needs: ['smtp'], tier: 'pro' },
};

// Given the connector configs an account has saved, which are "connected".
export function connectorStatus(saved = {}) {
  const out = {};
  for (const [id, def] of Object.entries(CONNECTORS)) {
    const cfg = saved[id] || {};
    out[id] = def.required.every((k) => String(cfg[k] || '').trim());
  }
  return out;
}

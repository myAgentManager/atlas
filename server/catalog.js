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
  slack: {
    id: 'slack', name: 'Slack', icon: 'chat',
    blurb: 'Ping your team in Slack when an agent flags an issue or a hot lead.',
    fields: [{ key: 'url', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/services/…' }],
    required: ['url'],
  },
  whatsapp: {
    id: 'whatsapp', name: 'WhatsApp', icon: 'chat',
    blurb: 'Let agents chat with customers on WhatsApp (via your provider).',
    fields: [
      { key: 'phone', label: 'WhatsApp number', placeholder: '+15555550123' },
      { key: 'token', label: 'API token', secret: true },
    ],
    required: ['phone', 'token'],
  },
  website: {
    id: 'website', name: 'Website knowledge', icon: 'globe',
    blurb: 'Point agents at your site so they learn your products and pages.',
    fields: [{ key: 'url', label: 'Website URL', placeholder: 'https://yourbusiness.com' }],
    required: ['url'],
  },
  sheets: {
    id: 'sheets', name: 'Google Sheets', icon: 'file',
    blurb: 'Log leads, orders and bookings into a spreadsheet automatically.',
    fields: [{ key: 'url', label: 'Sheet webhook / Apps Script URL', placeholder: 'https://script.google.com/…' }],
    required: ['url'],
  },
  payments: {
    id: 'payments', name: 'Payments (Stripe)', icon: 'spark',
    blurb: 'Let agents send payment links and take deposits on bookings.',
    fields: [{ key: 'key', label: 'Stripe secret key', secret: true, placeholder: 'sk_live_…' }],
    required: ['key'],
  },
  instagram: {
    id: 'instagram', name: 'Instagram DMs', icon: 'chat',
    blurb: 'Let agents answer Instagram direct messages through your Meta app.',
    fields: [
      { key: 'pageId', label: 'Instagram business account ID' },
      { key: 'token', label: 'Access token', secret: true },
    ],
    required: ['pageId', 'token'],
  },
  square: {
    id: 'square', name: 'Square POS', icon: 'bolt',
    blurb: 'Let agents check items, prices, and orders from your Square catalog.',
    fields: [
      { key: 'token', label: 'Access token', secret: true },
      { key: 'location', label: 'Location ID', placeholder: 'L…' },
    ],
    required: ['token'],
  },
  pbx: {
    id: 'pbx', name: 'PBX / VoIP extension', icon: 'plug',
    blurb: 'Register Atlas as an extension on your FreePBX/Asterisk. Test the connection here; calls are answered through the IVR bridge below.',
    fields: [
      { key: 'host', label: 'SIP host (public IP or domain you port-forward)', placeholder: 'pbx.yourbusiness.com' },
      { key: 'port', label: 'SIP port (UDP)', placeholder: '5060' },
      { key: 'ext', label: 'Extension', placeholder: '200' },
      { key: 'user', label: 'Auth user (usually same as extension)', placeholder: '200' },
      { key: 'secret', label: 'Extension secret', secret: true },
      { key: 'token', label: 'IVR token (leave blank — Atlas generates one)', secret: true, placeholder: 'auto-generated on save' },
    ],
    required: ['host', 'ext'],
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
  voip: { id: 'voip', name: 'VoIP calls (PBX extension)', icon: 'plug', needs: ['pbx'], tier: 'starter' },
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

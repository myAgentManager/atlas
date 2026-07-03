// Content guard — measured, not preachy. Catches the clearly-out-of-bounds
// requests (explicit adult content, weapons/drug manufacturing, malicious
// hacking, targeted harm, hate) and lets everything else through. ATLAS
// declines politely and offers to help with something else.

const RULES = [
  { topic: 'explicit adult content', re: /\b(porn(ography)?|xxx|nsfw|nudes?|onlyfans clone|erotic (story|site|fiction)|escort (site|service))\b/i },
  { topic: 'weapons or drug manufacturing', re: /\b(build|make|making|assemble|synthesi[sz]e|manufactur\w*|3d[- ]?print)\b[\s\S]{0,40}\b(bomb|explosive|ghost gun|silencer|suppressor|meth(amphetamine)?|fentanyl|heroin|nerve agent)\b/i },
  { topic: 'malicious hacking', re: /\b(hack into|break into|ddos|denial of service attack|steal (passwords|credentials|credit cards?)|phishing (kit|page|site)|keylogger|ransomware|credential stuffing)\b/i },
  { topic: 'harming someone', re: /\b(how to|help me|plan to)\b[\s\S]{0,30}\b(kill|poison|stalk|kidnap|hurt)\b[\s\S]{0,30}\b(someone|a person|my (ex|neighbor|boss|wife|husband|teacher))\b/i },
  { topic: 'graphic violence', re: /\b(gore|beheading|snuff|torture (video|content))\b/i },
  { topic: 'hate content', re: /\b(white power|racial slur|ethnic cleansing|deport all|gas the)\b/i },
];

export function checkContent(text) {
  const t = String(text || '');
  for (const rule of RULES) {
    if (rule.re.test(t)) return { ok: false, topic: rule.topic };
  }
  return { ok: true };
}

export function declineMessage(topic) {
  return `I keep the Atlas Network above board, so ${topic} isn't something I'll take on. Point me at anything else — sites, research, writing — and I'm on it.`;
}

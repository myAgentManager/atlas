// Input formatters. US/Canada numbers become +1 (555) 555-0100; anything with
// another country code (or too few digits to be sure) is left as typed.
export function formatPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return raw;
  const hasOtherCountry = /^\+(?!1)/.test(raw);
  if (hasOtherCountry) return raw;
  const digits = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length !== 10) return raw;
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

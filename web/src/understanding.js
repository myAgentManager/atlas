// One-liner of how Atlas will run a given kind of business — shown in the
// setup wizard, the Business page, and the agent builder so the owner can SEE
// that Atlas understands what it's operating, not just what it's called.
export function grasp(a) {
  if (!a) return '';
  const plural = a.bookNoun === 'class' ? 'classes' : `${a.bookNoun}s`;
  if (!a.bookable) return `Got it — you're walk-in, so I won't push bookings. I'll handle ${plural}, questions, and follow-ups, and tell people to just come by.`;
  if (a.visit === 'reservation') return `Got it — you take reservations. I'll collect dates, times, and party details to hold ${plural}, and answer questions.`;
  return `Got it — you run on ${plural}. I'll book them, send reminders, and answer questions.`;
}

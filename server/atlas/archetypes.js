// Atlas's own knowledge: what different KINDS of business actually do, so it
// understands what it's running. A coffee shop is walk-in — you can't "book" a
// coffee. A salon runs on appointments. A restaurant takes reservations. Each
// archetype tells Atlas how to read customer intent, what words to use, which
// capabilities make sense, and gives it starter knowledge to open with.
// `detect` words let Atlas classify a business from its own name/about text.

export const ARCHETYPES = {
  cafe: {
    id: 'cafe', name: 'Coffee shop / Café', icon: 'spark',
    bookable: false, visit: 'walkin', bookNoun: 'order',
    detect: ['cafe', 'café', 'coffee', 'espresso', 'latte', 'roaster', 'roastery', 'bakery', 'beans', 'brew', 'pastry', 'pastries', 'donut', 'bagel', 'tea', 'juice', 'smoothie', 'gelato', 'ice cream'],
    caps: ['webchat', 'faq', 'orders', 'crm', 'email', 'reminders'],
    starters: [
      { topic: 'walk in visit', fact: "We're walk-in — no reservation needed, just come by during opening hours." },
      { topic: 'catering orders', fact: "We cater! Share your date, headcount, and what you'd like and we'll put a quote together." },
    ],
  },
  restaurant: {
    id: 'restaurant', name: 'Restaurant / Bar', icon: 'spark',
    bookable: true, visit: 'reservation', bookNoun: 'table',
    detect: ['restaurant', 'bistro', 'grill', 'diner', 'eatery', 'pizzeria', 'pizza', 'sushi', 'taqueria', 'bar', 'pub', 'brewery', 'steakhouse', 'kitchen', 'brunch', 'dinner', 'menu', 'chef'],
    caps: ['webchat', 'faq', 'bookings', 'orders', 'crm', 'email', 'reminders'],
    starters: [
      { topic: 'reservation booking', fact: "We take reservations — tell us your date, time, and party size and we'll hold a table." },
      { topic: 'walk in', fact: "Walk-ins are welcome too, though weekends can have a wait." },
    ],
  },
  salon: {
    id: 'salon', name: 'Salon / Barber / Spa', icon: 'user',
    bookable: true, visit: 'appointment', bookNoun: 'appointment',
    detect: ['salon', 'barber', 'barbershop', 'spa', 'hair', 'haircut', 'stylist', 'nails', 'manicure', 'lashes', 'brows', 'waxing', 'massage', 'facial', 'tattoo', 'piercing', 'grooming'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email'],
    starters: [
      { topic: 'appointment booking', fact: "We're appointment-based — tell us the service and a day/time and we'll book you in." },
    ],
  },
  clinic: {
    id: 'clinic', name: 'Clinic / Dental / Vet', icon: 'shield',
    bookable: true, visit: 'appointment', bookNoun: 'appointment',
    detect: ['clinic', 'dental', 'dentist', 'doctor', 'medical', 'health', 'therapy', 'therapist', 'chiropract', 'vet', 'veterinar', 'physio', 'optometr', 'urgent care', 'patients', 'wellness', 'counseling'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email', 'afterhours'],
    starters: [
      { topic: 'appointment booking', fact: "New and returning patients are seen by appointment — share what you need and a preferred day." },
    ],
  },
  retail: {
    id: 'retail', name: 'Shop / Retail', icon: 'bolt',
    bookable: false, visit: 'walkin', bookNoun: 'order',
    detect: ['shop', 'store', 'boutique', 'retail', 'market', 'goods', 'apparel', 'clothing', 'gifts', 'books', 'bookstore', 'florist', 'flowers', 'hardware', 'grocery', 'vintage', 'thrift', 'records'],
    caps: ['webchat', 'faq', 'orders', 'crm', 'email'],
    starters: [
      { topic: 'walk in hours', fact: "Come by anytime during opening hours — no appointment needed." },
      { topic: 'stock availability order', fact: "Ask us to check stock or place an order and we'll sort it out." },
    ],
  },
  services: {
    id: 'services', name: 'Home & Field Services', icon: 'plug',
    bookable: true, visit: 'appointment', bookNoun: 'visit',
    detect: ['plumbing', 'plumber', 'electric', 'electrician', 'hvac', 'roofing', 'landscap', 'cleaning', 'cleaners', 'pest', 'handyman', 'contractor', 'painting', 'moving', 'repair', 'installation', 'lawn', 'garage'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email', 'sales'],
    starters: [
      { topic: 'quote estimate visit', fact: "Share your address and what you need, and we'll set up a visit and a free quote." },
    ],
  },
  fitness: {
    id: 'fitness', name: 'Gym / Fitness Studio', icon: 'bolt',
    bookable: true, visit: 'appointment', bookNoun: 'class',
    detect: ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'training', 'trainer', 'workout', 'studio', 'martial arts', 'boxing', 'dance', 'cycling', 'climbing', 'swim'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email'],
    starters: [
      { topic: 'class booking', fact: "Reserve a class spot by telling us which class and when — drop-ins welcome if there's room." },
    ],
  },
  professional: {
    id: 'professional', name: 'Professional Services', icon: 'file',
    bookable: true, visit: 'appointment', bookNoun: 'consultation',
    detect: ['law', 'lawyer', 'attorney', 'legal', 'accounting', 'accountant', 'tax', 'bookkeeping', 'consulting', 'consultant', 'agency', 'insurance', 'realty', 'real estate', 'realtor', 'financial', 'notary', 'design studio', 'marketing'],
    caps: ['webchat', 'faq', 'bookings', 'crm', 'email', 'sales'],
    starters: [
      { topic: 'consultation booking', fact: "We start with a consultation — tell us briefly what it's about and your availability." },
    ],
  },
  hospitality: {
    id: 'hospitality', name: 'Hotel / Lodging', icon: 'home',
    bookable: true, visit: 'reservation', bookNoun: 'room',
    detect: ['hotel', 'motel', 'inn', 'lodge', 'lodging', 'hostel', 'bnb', 'b&b', 'bed and breakfast', 'resort', 'suites', 'guesthouse', 'cabins', 'rooms', 'stay'],
    caps: ['webchat', 'faq', 'bookings', 'crm', 'email', 'reminders', 'multilingual'],
    starters: [
      { topic: 'room reservation booking', fact: "To check availability, share your dates and number of guests and we'll find you a room." },
    ],
  },
  other: {
    id: 'other', name: 'Something else', icon: 'globe',
    bookable: true, visit: 'appointment', bookNoun: 'appointment',
    detect: [],
    caps: ['webchat', 'faq', 'bookings', 'crm', 'email'],
    starters: [],
  },
};

export const archetype = (id) => ARCHETYPES[id] || ARCHETYPES.other;

// Classify a business from its own words (name + tagline + about + services).
// Whole-word keyword scoring — name hits count double since "Luna Beans Cafe"
// says more about what you are than a stray word in the about text.
export function detectArchetype(nameText, aboutText = '') {
  const scoreOf = (text, weight) => {
    const low = ` ${String(text || '').toLowerCase()} `;
    const scores = {};
    for (const a of Object.values(ARCHETYPES)) {
      for (const w of a.detect) {
        // whole-word-ish match; allow the keyword as a prefix (chiropract → chiropractor)
        if (new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(low)) {
          scores[a.id] = (scores[a.id] || 0) + weight;
        }
      }
    }
    return scores;
  };
  const total = scoreOf(nameText, 2);
  for (const [id, s] of Object.entries(scoreOf(aboutText, 1))) total[id] = (total[id] || 0) + s;
  let best = null, bestScore = 0;
  for (const [id, s] of Object.entries(total)) if (s > bestScore) { best = id; bestScore = s; }
  return bestScore >= 2 ? best : null; // needs a name hit or two body hits to be sure
}

// Public list for the UI (no need to ship starter facts to the client).
export const archetypeList = () =>
  Object.values(ARCHETYPES).map((a) => ({ id: a.id, name: a.name, icon: a.icon, bookable: a.bookable, visit: a.visit, bookNoun: a.bookNoun, caps: a.caps }));

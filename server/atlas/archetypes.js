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
    pack: {
      services: 'espresso drinks, drip coffee, teas, fresh pastries, breakfast sandwiches, catering',
      about: 'A neighborhood café serving specialty coffee and fresh-baked goods. Walk in anytime — we also cater meetings and events.',
      faqs: [
        { q: 'Do you have wifi?', a: 'Yes — free wifi for customers, no time limit.' },
        { q: 'Do you have dairy-free milk?', a: 'We carry oat, almond, and soy at no extra charge.' },
        { q: 'Can I order ahead?', a: 'Call or message us your order and a pickup time and we\'ll have it ready.' },
      ],
    },
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
    pack: {
      services: 'lunch and dinner service, takeout, reservations, private events, catering',
      about: 'A full-service restaurant. We take reservations, welcome walk-ins, and host private events.',
      faqs: [
        { q: 'Do you take reservations?', a: 'Yes — tell us your date, time, and party size and we\'ll hold a table.' },
        { q: 'Do you do takeout?', a: 'Yes, order by phone or message and we\'ll have it ready for pickup.' },
        { q: 'Can you handle dietary restrictions?', a: 'Absolutely — tell us what you need and the kitchen will accommodate.' },
      ],
    },
  },
  salon: {
    id: 'salon', name: 'Salon / Barber / Spa', icon: 'user',
    bookable: true, visit: 'appointment', bookNoun: 'appointment',
    detect: ['salon', 'barber', 'barbershop', 'spa', 'hair', 'haircut', 'stylist', 'nails', 'manicure', 'lashes', 'brows', 'waxing', 'massage', 'facial', 'tattoo', 'piercing', 'grooming'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email'],
    starters: [
      { topic: 'appointment booking', fact: "We're appointment-based — tell us the service and a day/time and we'll book you in." },
    ],
    pack: {
      services: 'haircuts, color, styling, blowouts, treatments',
      about: 'An appointment-based salon. Book ahead for the best times — we\'ll confirm and send a reminder.',
      faqs: [
        { q: 'How do I book?', a: 'Message us the service you want and a day/time that works — we\'ll confirm right away.' },
        { q: 'What if I need to cancel?', a: 'No problem — just give us 24 hours notice so we can offer the slot to someone else.' },
        { q: 'Do you take walk-ins?', a: 'When there\'s a free chair, yes — but booking ahead guarantees your spot.' },
      ],
    },
  },
  clinic: {
    id: 'clinic', name: 'Clinic / Dental / Vet', icon: 'shield',
    bookable: true, visit: 'appointment', bookNoun: 'appointment',
    detect: ['clinic', 'dental', 'dentist', 'doctor', 'medical', 'health', 'therapy', 'therapist', 'chiropract', 'vet', 'veterinar', 'physio', 'optometr', 'urgent care', 'patients', 'wellness', 'counseling'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email', 'afterhours'],
    starters: [
      { topic: 'appointment booking', fact: "New and returning patients are seen by appointment — share what you need and a preferred day." },
    ],
    pack: {
      services: 'consultations, checkups, follow-up visits, new patient intake',
      about: 'Patients are seen by appointment. New patients welcome — we\'ll get you set up on your first visit.',
      faqs: [
        { q: 'Are you taking new patients?', a: 'Yes — share your name and what you need and we\'ll get your first appointment booked.' },
        { q: 'What insurance do you accept?', a: 'Send us your provider and plan and we\'ll confirm coverage before your visit.' },
        { q: 'What should I bring to my first visit?', a: 'A photo ID, your insurance card, and any current medication list.' },
      ],
    },
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
    pack: {
      services: 'in-store shopping, special orders, gift cards, holds and pickups',
      about: 'Come by anytime during opening hours. We check stock, take special orders, and hold items for pickup.',
      faqs: [
        { q: 'Can you check if something is in stock?', a: 'Tell us the item and we\'ll check right away — we can hold it for you too.' },
        { q: 'What is your return policy?', a: 'Returns within 30 days with receipt for a full refund or exchange.' },
        { q: 'Do you sell gift cards?', a: 'Yes, any amount — in store or we can arrange one over the phone.' },
      ],
    },
  },
  services: {
    id: 'services', name: 'Home & Field Services', icon: 'plug',
    bookable: true, visit: 'appointment', bookNoun: 'visit',
    detect: ['plumbing', 'plumber', 'electric', 'electrician', 'hvac', 'roofing', 'landscap', 'cleaning', 'cleaners', 'pest', 'handyman', 'contractor', 'painting', 'moving', 'repair', 'installation', 'lawn', 'garage'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email', 'sales'],
    starters: [
      { topic: 'quote estimate visit', fact: "Share your address and what you need, and we'll set up a visit and a free quote." },
    ],
    pack: {
      services: 'estimates, repairs, installations, maintenance visits, emergency callouts',
      about: 'We come to you. Share your address and the job, and we\'ll schedule a visit and a free quote.',
      faqs: [
        { q: 'How much will it cost?', a: 'Every job is different — describe it (photos help) and we\'ll give you a free estimate.' },
        { q: 'Do you handle emergencies?', a: 'Yes — tell us what\'s happening and we\'ll get someone out as fast as possible.' },
        { q: 'Are you licensed and insured?', a: 'Fully licensed and insured — documentation available on request.' },
      ],
    },
  },
  fitness: {
    id: 'fitness', name: 'Gym / Fitness Studio', icon: 'bolt',
    bookable: true, visit: 'appointment', bookNoun: 'class',
    detect: ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'training', 'trainer', 'workout', 'studio', 'martial arts', 'boxing', 'dance', 'cycling', 'climbing', 'swim'],
    caps: ['webchat', 'faq', 'bookings', 'reminders', 'crm', 'email'],
    starters: [
      { topic: 'class booking', fact: "Reserve a class spot by telling us which class and when — drop-ins welcome if there's room." },
    ],
    pack: {
      services: 'group classes, open gym, personal training, memberships, day passes',
      about: 'Classes and open training. Reserve a class spot ahead — drop-ins welcome when there\'s room.',
      faqs: [
        { q: 'How do I try a class?', a: 'Your first class is on us — tell us which one and we\'ll save you a spot.' },
        { q: 'What memberships do you offer?', a: 'Monthly and annual memberships plus class packs and day passes — ask and we\'ll find your fit.' },
        { q: 'Can I freeze my membership?', a: 'Yes — memberships can be paused; just let us know the dates.' },
      ],
    },
  },
  professional: {
    id: 'professional', name: 'Professional Services', icon: 'file',
    bookable: true, visit: 'appointment', bookNoun: 'consultation',
    detect: ['law', 'lawyer', 'attorney', 'legal', 'accounting', 'accountant', 'tax', 'bookkeeping', 'consulting', 'consultant', 'agency', 'insurance', 'realty', 'real estate', 'realtor', 'financial', 'notary', 'design studio', 'marketing'],
    caps: ['webchat', 'faq', 'bookings', 'crm', 'email', 'sales'],
    starters: [
      { topic: 'consultation booking', fact: "We start with a consultation — tell us briefly what it's about and your availability." },
    ],
    pack: {
      services: 'consultations, ongoing engagements, document review, advisory',
      about: 'Work starts with a consultation. Tell us briefly what you need and your availability and we\'ll set it up.',
      faqs: [
        { q: 'How much do you charge?', a: 'It depends on the engagement — the initial consultation is where we scope it and quote you.' },
        { q: 'Is my information confidential?', a: 'Completely. Everything you share with us stays between us.' },
        { q: 'How soon can we meet?', a: 'Usually within a few business days — share your availability and we\'ll confirm a slot.' },
      ],
    },
  },
  hospitality: {
    id: 'hospitality', name: 'Hotel / Lodging', icon: 'home',
    bookable: true, visit: 'reservation', bookNoun: 'room',
    detect: ['hotel', 'motel', 'inn', 'lodge', 'lodging', 'hostel', 'bnb', 'b&b', 'bed and breakfast', 'resort', 'suites', 'guesthouse', 'cabins', 'rooms', 'stay'],
    caps: ['webchat', 'faq', 'bookings', 'crm', 'email', 'reminders', 'multilingual'],
    starters: [
      { topic: 'room reservation booking', fact: "To check availability, share your dates and number of guests and we'll find you a room." },
    ],
    pack: {
      services: 'room bookings, group reservations, event hosting, late checkout on request',
      about: 'Share your dates and number of guests and we\'ll check availability and hold your room.',
      faqs: [
        { q: 'What time is check-in and check-out?', a: 'Check-in from 3pm, check-out by 11am — early or late by request when we can.' },
        { q: 'Is parking available?', a: 'Yes, on-site parking for guests.' },
        { q: 'Are pets allowed?', a: 'Small pets are welcome in select rooms — mention it when booking.' },
      ],
    },
  },
  other: {
    id: 'other', name: 'Something else', icon: 'globe',
    bookable: true, visit: 'appointment', bookNoun: 'appointment',
    detect: [],
    caps: ['webchat', 'faq', 'bookings', 'crm', 'email'],
    starters: [],
    pack: {
      services: '',
      about: '',
      faqs: [
        { q: 'How do I reach a real person?', a: 'Ask anytime — say "talk to a human" and we\'ll connect you with the team.' },
      ],
    },
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

// Public list for the UI. Includes the starter pack so the Business page can
// offer one-click "typical setup" fills (no need to ship KB starter facts).
export const archetypeList = () =>
  Object.values(ARCHETYPES).map((a) => ({ id: a.id, name: a.name, icon: a.icon, bookable: a.bookable, visit: a.visit, bookNoun: a.bookNoun, caps: a.caps, pack: a.pack }));

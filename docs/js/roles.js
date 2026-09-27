// Who each timeline stop involves. Drives the per-vendor views and printouts. Pure, no DOM.

export const ROLES = [
  ['couple', 'Couple'],
  ['party', 'Wedding party'],
  ['family', 'Family'],
  ['guests', 'Guests'],
  ['planner', 'Planner'],
  ['venue', 'Venue'],
  ['photo', 'Photographer'],
  ['video', 'Videographer'],
  ['hmua', 'Hair & makeup'],
  ['florist', 'Florist'],
  ['catering', 'Catering & bar'],
  ['music', 'Band / DJ'],
  ['officiant', 'Officiant'],
  ['transport', 'Transportation'],
  ['rentals', 'Rentals'],
];

export const roleLabel = (key) => (ROLES.find(([k]) => k === key) || [key, key])[1];

// Keyword guesses for stops saved before roles existed (or added from documents).
const HINTS = [
  ['couple', /ceremony|first look|portrait|first dance|last dance|entrance|\bhair\b|makeup|cake|toast|send-off|exit|rehearsal|vows/i],
  ['party', /wedding party|bridesmaid|groomsm|rehearsal|entrance|\bhair\b|makeup/i],
  ['family', /family|parent/i],
  ['guests', /guest|welcome party|cocktail|brunch|shuttle|seating|prelude|reception|dinner/i],
  ['venue', /venue|load-in|load in|load-out|load out|access|setup|set up|barn/i],
  ['photo', /photo|portrait|first look|golden hour/i],
  ['video', /video/i],
  ['hmua', /\bhair\b|makeup/i],
  ['florist', /floral|flower|boutonniere|centerpiece/i],
  ['catering', /cater|dinner|cocktail|\bbar\b|cake|dessert|brunch|food|appetizer|reception/i],
  ['music', /\bband\b|\bdj\b|music|dance|prelude|song|toast|speech|entrance/i],
  ['officiant', /ceremony|rehearsal|officiant|vows/i],
  ['transport', /shuttle|\bbus\b|transport|pickup|drop-off|limo/i],
  ['rentals', /tent|rental|linen|chairs|tables/i],
];

export function inferRoles(item) {
  const text = `${item.title || ''} ${item.detail || ''} ${item.source || ''}`;
  const roles = HINTS.filter(([, re]) => re.test(text)).map(([k]) => k);
  return ['planner', ...roles.filter(r => r !== 'planner')];
}

export const rolesOf = (item) => (Array.isArray(item.roles) ? item.roles : inferRoles(item));

// '' means the full timeline; the planner sees every stop.
export function itemInView(item, role) {
  return !role || role === 'planner' || rolesOf(item).includes(role);
}

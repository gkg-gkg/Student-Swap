// Regions, cities and universities are data. Add a region here to launch a new one.
// NOTE: verify each email domain before launch; the Cognito pre-sign-up Lambda must enforce it too.

/** @type {import('../types/index.js').Region[]} */
export const regions = [{ id: 'midlands', name: 'Midlands', live: true }];

/** @type {import('../types/index.js').City[]} */
export const cities = [
  { id: 'birmingham', regionId: 'midlands', name: 'Birmingham' },
  { id: 'coventry', regionId: 'midlands', name: 'Coventry' },
  { id: 'nottingham', regionId: 'midlands', name: 'Nottingham' },
  { id: 'leicester', regionId: 'midlands', name: 'Leicester' },
  { id: 'loughborough', regionId: 'midlands', name: 'Loughborough' },
  { id: 'keele', regionId: 'midlands', name: 'Keele' },
];

/** @type {import('../types/index.js').University[]} */
export const universities = [
  {
    id: 'birmingham',
    cityId: 'birmingham',
    name: 'University of Birmingham',
    short: 'Birmingham',
    emailDomains: ['bham.ac.uk'],
  },
  { id: 'aston', cityId: 'birmingham', name: 'Aston University', short: 'Aston', emailDomains: ['aston.ac.uk'] },
  { id: 'bcu', cityId: 'birmingham', name: 'Birmingham City University', short: 'BCU', emailDomains: ['bcu.ac.uk'] },
  {
    id: 'warwick',
    cityId: 'coventry',
    name: 'University of Warwick',
    short: 'Warwick',
    emailDomains: ['warwick.ac.uk'],
  },
  {
    id: 'coventry',
    cityId: 'coventry',
    name: 'Coventry University',
    short: 'Coventry',
    emailDomains: ['coventry.ac.uk'],
  },
  {
    id: 'nottingham',
    cityId: 'nottingham',
    name: 'University of Nottingham',
    short: 'Nottingham',
    emailDomains: ['nottingham.ac.uk'],
  },
  {
    id: 'ntu',
    cityId: 'nottingham',
    name: 'Nottingham Trent University',
    short: 'NTU',
    emailDomains: ['my.ntu.ac.uk'],
  },
  {
    id: 'leicester',
    cityId: 'leicester',
    name: 'University of Leicester',
    short: 'Leicester',
    emailDomains: ['leicester.ac.uk'],
  },
  { id: 'dmu', cityId: 'leicester', name: 'De Montfort University', short: 'DMU', emailDomains: ['dmu.ac.uk'] },
  {
    id: 'loughborough',
    cityId: 'loughborough',
    name: 'Loughborough University',
    short: 'Loughborough',
    emailDomains: ['lboro.ac.uk'],
  },
  { id: 'keele', cityId: 'keele', name: 'Keele University', short: 'Keele', emailDomains: ['keele.ac.uk'] },
];

// Venues events can be held at. Admins pick from this list when creating an event (or type "Other venue").
// Researched October 2026 from student guides and listings, NOT confirmed with the venues: check each one is open,
// its name and its area before launch. Leamington Spa venues sit under Coventry because Warwick students go out there.
/** @type {import('../types/index.js').Venue[]} */
export const venues = [
  // Birmingham
  { id: 'rosies-birmingham', name: 'Rosies', cityId: 'birmingham', area: 'Broad Street', kind: 'club' },
  { id: 'pryzm-birmingham', name: 'PRYZM Birmingham', cityId: 'birmingham', area: 'Broad Street', kind: 'club' },
  { id: 'popworld-birmingham', name: 'Popworld Birmingham', cityId: 'birmingham', area: 'Broad Street', kind: 'club' },
  { id: 'snobs-birmingham', name: 'Snobs', cityId: 'birmingham', area: 'City centre', kind: 'club' },
  { id: 'tunnel-club-birmingham', name: 'The Tunnel Club', cityId: 'birmingham', area: 'City centre', kind: 'club' },
  { id: 'lab11-birmingham', name: 'Lab11', cityId: 'birmingham', area: 'Digbeth', kind: 'club' },
  { id: 'xoyo-birmingham', name: 'XOYO Birmingham', cityId: 'birmingham', area: 'Digbeth', kind: 'club' },
  {
    id: 'o2-institute-birmingham',
    name: 'O2 Institute Birmingham',
    cityId: 'birmingham',
    area: 'Digbeth',
    kind: 'live_venue',
  },
  { id: 'night-owl-birmingham', name: 'The Night Owl', cityId: 'birmingham', area: 'Digbeth', kind: 'club' },
  {
    id: 'guild-birmingham',
    name: 'Guild of Students',
    cityId: 'birmingham',
    area: 'Edgbaston',
    kind: 'students_union',
  },
  // Coventry, Warwick campus and Leamington Spa
  { id: 'kasbah-coventry', name: 'Kasbah', cityId: 'coventry', area: 'City centre', kind: 'club' },
  { id: 'hmv-empire-coventry', name: 'HMV Empire', cityId: 'coventry', area: 'City centre', kind: 'live_venue' },
  { id: 'jjs-coventry', name: "JJ's", cityId: 'coventry', area: 'City centre', kind: 'club' },
  {
    id: 'copper-rooms-warwick',
    name: 'Copper Rooms, Warwick SU',
    cityId: 'coventry',
    area: 'Warwick campus',
    kind: 'students_union',
  },
  { id: 'smack-leamington', name: 'Smack', cityId: 'coventry', area: 'Leamington Spa', kind: 'club' },
  { id: 'neon-leamington', name: 'Neon', cityId: 'coventry', area: 'Leamington Spa', kind: 'club' },
  { id: 'assembly-leamington', name: 'The Assembly', cityId: 'coventry', area: 'Leamington Spa', kind: 'live_venue' },
  // Nottingham
  { id: 'rock-city-nottingham', name: 'Rock City', cityId: 'nottingham', area: 'City centre', kind: 'live_venue' },
  {
    id: 'rescue-rooms-nottingham',
    name: 'Rescue Rooms',
    cityId: 'nottingham',
    area: 'City centre',
    kind: 'live_venue',
  },
  { id: 'pryzm-nottingham', name: 'PRYZM Nottingham', cityId: 'nottingham', area: 'City centre', kind: 'club' },
  { id: 'ink-nottingham', name: 'Ink', cityId: 'nottingham', area: 'City centre', kind: 'club' },
  { id: 'ocean-nottingham', name: 'Ocean', cityId: 'nottingham', area: 'City centre', kind: 'club' },
  { id: 'stealth-nottingham', name: 'Stealth', cityId: 'nottingham', area: 'City centre', kind: 'club' },
  { id: 'bierkeller-nottingham', name: 'The Bierkeller', cityId: 'nottingham', area: 'City centre', kind: 'club' },
  // Leicester
  // O2 Academy Leicester is due to close at the end of 2026 (University of Leicester announcement, April 2026).
  {
    id: 'o2-academy-leicester',
    name: 'O2 Academy Leicester',
    cityId: 'leicester',
    area: 'University of Leicester',
    kind: 'live_venue',
  },
  { id: 'republic-leicester', name: 'Club Republic', cityId: 'leicester', area: 'City centre', kind: 'club' },
  { id: 'fan-club-leicester', name: 'Fan Club', cityId: 'leicester', area: 'City centre', kind: 'club' },
  // Loughborough
  {
    id: 'lsu-loughborough',
    name: "Loughborough Students' Union",
    cityId: 'loughborough',
    area: 'Campus',
    kind: 'students_union',
  },
  { id: 'echos-loughborough', name: "Echo's", cityId: 'loughborough', area: 'Town centre', kind: 'club' },
  { id: 'fire-fly-loughborough', name: 'Fire-fly', cityId: 'loughborough', area: 'Town centre', kind: 'club' },
  // Keele
  { id: 'keele-su', name: 'Keele SU', cityId: 'keele', area: 'Campus', kind: 'students_union' },
];

export const venuesInCity = (/** @type {string} */ cityId) => venues.filter((v) => v.cityId === cityId);

export const getRegion = (/** @type {string} */ id) => regions.find((r) => r.id === id);
export const universitiesInRegion = (/** @type {string} */ regionId) => {
  const cityIds = new Set(cities.filter((c) => c.regionId === regionId).map((c) => c.id));
  return universities.filter((u) => cityIds.has(u.cityId));
};

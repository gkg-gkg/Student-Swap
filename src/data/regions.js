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

export const getRegion = (/** @type {string} */ id) => regions.find((r) => r.id === id);
export const universitiesInRegion = (/** @type {string} */ regionId) => {
  const cityIds = new Set(cities.filter((c) => c.regionId === regionId).map((c) => c.id));
  return universities.filter((u) => cityIds.has(u.cityId));
};

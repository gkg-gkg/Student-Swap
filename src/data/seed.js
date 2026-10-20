// Fictional mock database. No real venues, clubs, brands or people.
// Dates are relative to "now" so there is always something happening tonight.
import { pricing } from '../config/pricing.js';
import { buyerTotal, sellerPayout } from '../lib/fees.js';
import { londonYmd, londonToUtc, addDaysYmd } from '../lib/time.js';

const HOUR = 3600000;

/** Small deterministic PRNG so seed data is stable between loads. @param {number} seed */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MOCK_PASSWORD = 'Password1!';
export const DB_VERSION = 6;

/** @param {Date} [nowDate] */
export function buildSeed(nowDate = new Date()) {
  const now = nowDate.getTime();
  const rand = rng(42);
  /** @param {number} h */
  const at = (h) => new Date(now + h * HOUR).toISOString();
  /**
   * Start time as a London wall-clock slot, `dayOffset` days from today. Most events start on a half hour
   * between 9:00 pm and 11:30 pm. An event "today" that has already finished rolls to tomorrow.
   * @param {number} dayOffset @param {string} hhmm @param {number} durH
   */
  const slot = (dayOffset, hhmm, durH) => {
    const [hh, mm] = hhmm.split(':').map(Number);
    let iso = londonToUtc(addDaysYmd(londonYmd(nowDate), dayOffset), hh, mm);
    if (dayOffset === 0 && new Date(iso).getTime() + durH * HOUR <= now)
      iso = londonToUtc(addDaysYmd(londonYmd(nowDate), 1), hh, mm);
    return iso;
  };
  const pick = (/** @type {ReadonlyArray<any>} */ arr) => arr[Math.floor(rand() * arr.length)];

  // ----- users -----
  const tones = /** @type {const} */ (['coral', 'blue', 'amber', 'mint', 'night']);
  /** @param {string} id @param {string} name @param {string} uni @param {number} sales @param {number} rating */
  const user = (id, name, uni, sales, rating, extra = {}) => ({
    id,
    email: `${id}@${uni === 'ntu' ? 'my.ntu.ac.uk' : uni === 'birmingham' ? 'bham.ac.uk' : uni + '.ac.uk'}`,
    password: MOCK_PASSWORD,
    confirmed: true,
    displayName: name,
    universityId: uni,
    avatar: {
      tone: pick(tones),
      initials: name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    },
    role: 'user',
    createdAt: at(-24 * (60 + Math.floor(rand() * 400))),
    profileComplete: true,
    ageConfirmed: true,
    ratingAvg: rating,
    ratingCount: sales,
    completedSales: sales,
    notificationPrefs: { offers: true, orders: true, alerts: true, marketing: false },
    ...extra,
  });
  const users = [
    user('u-demo', 'Alex Demo', 'birmingham', 4, 4.8, {
      email: 'demo@bham.ac.uk',
      avatar: { tone: 'blue', initials: 'AD' },
    }),
    user('u-admin', 'Admin Sam', 'birmingham', 0, 0, {
      email: 'admin@bham.ac.uk',
      role: 'admin',
      avatar: { tone: 'night', initials: 'AS' },
    }),
    user('u-s1', 'Maya Patel', 'birmingham', 23, 4.9),
    user('u-s2', 'Josh Okafor', 'aston', 11, 4.7),
    user('u-s3', 'Priya Nair', 'warwick', 31, 5.0),
    user('u-s4', 'Tom Hughes', 'nottingham', 8, 4.5),
    user('u-s5', 'Lena Fischer', 'ntu', 15, 4.8),
    user('u-s6', 'Ravi Shah', 'leicester', 6, 4.6),
    user('u-s7', 'Ella Brooks', 'dmu', 19, 4.9),
    user('u-s8', 'Callum Reid', 'loughborough', 12, 4.4),
    user('u-s9', 'Zara Ahmed', 'coventry', 3, 4.7),
    user('u-s10', 'Ben Walker', 'keele', 9, 4.6),
    user('u-s11', 'Chloe Evans', 'bcu', 14, 4.8),
  ];
  const sellers = users.filter((u) => u.id.startsWith('u-s'));

  // ----- events (admin-curated) -----
  /** @param {string} id @param {string} title @param {string} venue @param {string} cityId @param {string[]} unis @param {'club_night'|'ball'|'social'|'gig'} type @param {string} startsAt ISO start @param {number} durH @param {[string, number][]} tiers @param {string} tone @param {string} desc */
  const ev = (id, title, venue, cityId, unis, type, startsAt, durH, tiers, tone, desc) => ({
    id,
    title,
    description: desc,
    venue,
    cityId,
    universityIds: unis,
    type,
    startsAt,
    lastEntryAt: new Date(new Date(startsAt).getTime() + Math.min(2, durH - 1) * HOUR).toISOString(),
    endsAt: new Date(new Date(startsAt).getTime() + durH * HOUR).toISOString(),
    ageRestriction: '18+',
    idRequirement: 'Photo ID and student card may be checked on the door.',
    tiers: tiers.map(([name, face], i) => ({ id: `${id}-t${i + 1}`, name, faceValuePence: face })),
    tone,
  });
  const events = [
    ev(
      'evt-fresh-fling',
      'Fresh Fling: Rooftop Party',
      'Cloud Nine Terrace',
      'nottingham',
      ['nottingham', 'ntu'],
      'social',
      slot(0, '21:00', 6),
      6,
      [
        ['General release', 1100],
        ['Early entry', 1400],
      ],
      'amber',
      'Sunset sets and rooftop views. Dress for the weather, dance like it is not raining.',
    ),
    ev(
      'evt-neon-rewind',
      'Neon Rewind: Noughties Night',
      'The Foundry Rooms',
      'birmingham',
      ['birmingham', 'aston', 'bcu'],
      'club_night',
      slot(0, '22:00', 7),
      7,
      [
        ['General release', 1200],
        ['Fast track', 1800],
      ],
      'coral',
      'Two rooms of noughties anthems. Glow paint provided. Sing every word.',
    ),
    ev(
      'evt-sunrise',
      'Sunrise Social',
      'The Glasshouse',
      'coventry',
      ['warwick', 'coventry'],
      'social',
      slot(1, '21:30', 6),
      6,
      [['General release', 800]],
      'mint',
      'A relaxed social with cocktails, games and a chill-out room.',
    ),
    ev(
      'evt-pastel-ball',
      'Pastel Ball: Spring Formal',
      'Grand Assembly Hall',
      'nottingham',
      ['nottingham', 'ntu'],
      'ball',
      slot(1, '19:30', 8),
      8,
      [
        ['Standard', 4500],
        ['Premium table seat', 6500],
      ],
      'amber',
      'Black tie meets pastel. Three-course meal, live band and a late-night disco.',
    ),
    ev(
      'evt-bassline',
      'Bassline Sessions',
      'Warehouse Nine',
      'leicester',
      ['leicester', 'dmu'],
      'club_night',
      slot(2, '22:30', 7),
      7,
      [
        ['General release', 1500],
        ['Early bird', 1200],
      ],
      'blue',
      'Bass-heavy sets from rising student DJs across two floors.',
    ),
    ev(
      'evt-midnight-disco',
      'Midnight Disco Club',
      'Skyline Hall',
      'birmingham',
      ['birmingham', 'aston'],
      'club_night',
      slot(3, '23:00', 6),
      6,
      [['General release', 1000]],
      'night',
      'Mirrorballs, funk and soul. Sparkle encouraged.',
    ),
    ev(
      'evt-battle-bands',
      'Battle of the Bands',
      'The Basement Social',
      'loughborough',
      ['loughborough'],
      'gig',
      slot(4, '20:00', 5),
      5,
      [['Entry', 700]],
      'coral',
      'Six student bands, one winner. Cheer for your favourites.',
    ),
    ev(
      'evt-boiler-ball',
      'Boiler Room Ball',
      'Union Ballroom',
      'keele',
      ['keele'],
      'ball',
      slot(5, '19:00', 8),
      8,
      [
        ['Standard', 3500],
        ['VIP', 5500],
      ],
      'blue',
      'Industrial glam ball with a live band and a silent disco after midnight.',
    ),
    ev(
      'evt-lights-out',
      'Lights Out: Glow Party',
      'Neon Barn',
      'birmingham',
      ['bcu', 'birmingham'],
      'club_night',
      slot(6, '21:30', 6),
      6,
      [['General release', 900]],
      'mint',
      'UV everything. White clothes recommended.',
    ),
    ev(
      'evt-varsity',
      'Varsity Afterparty',
      'The Exchange',
      'nottingham',
      ['nottingham', 'ntu'],
      'social',
      slot(7, '22:00', 7),
      7,
      [
        ['General release', 1300],
        ['Fast track', 1900],
      ],
      'coral',
      'The big rivalry, then the bigger party.',
    ),
    ev(
      'evt-acoustic',
      'Acoustic Under the Stars',
      'Quad Gardens',
      'coventry',
      ['warwick', 'coventry'],
      'gig',
      slot(9, '19:30', 4),
      4,
      [['Entry', 600]],
      'amber',
      'Blankets, fairy lights and student songwriters.',
    ),
    ev(
      'evt-halloween-hall',
      'Haunted Hall Halloween',
      'Skyline Hall',
      'birmingham',
      ['birmingham', 'aston', 'bcu'],
      'club_night',
      slot(10, '23:30', 7),
      7,
      [
        ['General release', 1600],
        ['Fast track', 2200],
      ],
      'night',
      'Costume contest, scare actors and a very loud DJ.',
    ),
    // Past events (for completed orders / reports demos)
    ev(
      'evt-past-recent',
      'Retro Rave Reloaded',
      'Warehouse Nine',
      'leicester',
      ['leicester', 'dmu'],
      'club_night',
      slot(-1, '22:00', 6),
      6,
      [['General release', 1000]],
      'blue',
      "Last night's retro rave.",
    ),
    ev(
      'evt-past-old',
      'Welcome Week Warm-Up',
      'The Foundry Rooms',
      'birmingham',
      ['birmingham'],
      'club_night',
      slot(-6, '22:30', 6),
      6,
      [['General release', 900]],
      'coral',
      'A previous event.',
    ),
  ];

  // ----- listings -----
  /** @type {any[]} */
  const listings = [];
  let lid = 1;
  const upcoming = events.filter((e) => new Date(e.endsAt).getTime() > now);
  for (const e of upcoming) {
    for (const t of e.tiers) {
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const discount = Math.floor(rand() * 7) * 0.05; // 0-30% below face
        const price = Math.max(100, Math.round((t.faceValuePence * (1 - discount)) / 50) * 50);
        const delivery = rand() > 0.35 ? 'pdf' : 'transfer';
        listings.push({
          id: `l-${lid++}`,
          eventId: e.id,
          tierId: t.id,
          sellerId: pick(sellers).id,
          quantity: 1 + Math.floor(rand() * 3),
          pricePence: Math.min(price, t.faceValuePence),
          faceValuePence: t.faceValuePence,
          delivery,
          ...(delivery === 'pdf'
            ? { fileKey: `tickets/seed-${lid}.pdf`, fileName: 'ticket.pdf', barcodeCheck: 'passed' }
            : { transferPlatform: pick(['Fatsoma', 'FIXR', 'Ticketmaster']) }),
          status: 'active',
          createdAt: at(-Math.floor(rand() * 72) - 1),
        });
      }
    }
  }
  const evOf = (/** @type {string} */ id) => /** @type {any} */ (events.find((e) => e.id === id));
  const tier0 = (/** @type {string} */ id) => evOf(id).tiers[0];
  /** @param {string} id @param {string} eventId @param {string} sellerId @param {number} price @param {string} status @param {any} [extra] */
  const mk = (id, eventId, sellerId, price, status, extra = {}) => ({
    id,
    eventId,
    tierId: tier0(eventId).id,
    sellerId,
    quantity: 2,
    pricePence: price,
    faceValuePence: tier0(eventId).faceValuePence,
    delivery: 'pdf',
    fileKey: `tickets/${id}.pdf`,
    fileName: 'my-ticket.pdf',
    barcodeCheck: 'passed',
    status,
    createdAt: at(-30),
    ...extra,
  });
  // Demo user's listings across every status; plus items in the admin review queue.
  listings.push(
    mk('l-demo-active', 'evt-bassline', 'u-demo', 1400, 'active'),
    mk('l-demo-review', 'evt-midnight-disco', 'u-demo', 900, 'under_review', {
      barcodeCheck: 'needs_review',
      reviewReasons: [{ source: 'barcode', code: 'needs_review', message: 'Barcode could not be read automatically.' }],
    }),
    mk('l-demo-sold', 'evt-past-recent', 'u-demo', 900, 'sold'),
    mk('l-demo-sold2', 'evt-past-old', 'u-demo', 800, 'sold'),
    mk('l-demo-expired', 'evt-past-old', 'u-demo', 800, 'expired'),
    mk('l-review-1', 'evt-neon-rewind', 'u-s2', 1000, 'under_review', {
      barcodeCheck: 'needs_review',
      fileName: 'ticket-screenshot.pdf',
      reviewReasons: [
        { source: 'barcode', code: 'needs_review', message: 'Barcode could not be read automatically (screenshot).' },
      ],
    }),
    mk('l-review-2', 'evt-pastel-ball', 'u-s4', 4200, 'under_review', {
      barcodeCheck: 'passed',
      quantity: 1,
      aiAssisted: true,
      reviewReasons: [
        {
          source: 'ai',
          code: 'details_mismatch',
          severity: 'high',
          message: 'The ticket says "Pastel Gala", but the listing is for "Pastel Ball: Spring Formal".',
        },
        {
          source: 'ai',
          code: 'looks_edited',
          severity: 'medium',
          message: 'Text near the barcode has inconsistent fonts and spacing.',
        },
      ],
    }),
    mk('l-review-3', 'evt-boiler-ball', 'u-s10', 3200, 'under_review', {
      barcodeCheck: 'needs_review',
      quantity: 1,
      reviewReasons: [
        {
          source: 'duplicate',
          code: 'near_duplicate',
          message: 'Visually 94% similar to another listed ticket.',
          detail: { listingId: 'l-offer-target', kind: 'image_hash', distance: 4 },
        },
      ],
    }),
    // Listings that back the demo user's purchases
    mk('l-bought-1', 'evt-neon-rewind', 'u-s1', 1100, 'sold', { quantity: 2 }),
    mk('l-bought-2', 'evt-past-recent', 'u-s7', 900, 'sold', { quantity: 1 }),
    mk('l-bought-3', 'evt-past-old', 'u-s3', 800, 'sold', { quantity: 1 }),
    mk('l-bought-4', 'evt-past-recent', 'u-s11', 800, 'sold', {
      quantity: 1,
      delivery: 'transfer',
      transferPlatform: 'FIXR',
      fileKey: undefined,
      fileName: undefined,
      barcodeCheck: undefined,
    }),
    // Offer targets
    mk('l-offer-target', 'evt-pastel-ball', 'u-s4', 4500, 'active', { quantity: 2 }),
    mk('l-offer-target2', 'evt-halloween-hall', 'u-s9', 1600, 'active', { quantity: 2 }),
  );

  // ----- orders / payouts / reports -----
  /** @type {any[]} */ const orders = [];
  /** @type {any[]} */ const payouts = [];
  /** @type {any[]} */ const reports = [];
  /** @param {string} id @param {string} listingId @param {string} buyerId @param {string} status @param {any} [extra] */
  const order = (id, listingId, buyerId, status, extra = {}) => {
    const l = /** @type {any} */ (listings.find((x) => x.id === listingId));
    const e = evOf(l.eventId);
    const { buyerFee, total } = buyerTotal(l.pricePence * l.quantity);
    const o = {
      id,
      listingId,
      eventId: l.eventId,
      buyerId,
      sellerId: l.sellerId,
      quantity: l.quantity,
      unitPence: l.pricePence,
      buyerFeePence: buyerFee,
      totalPence: total,
      status,
      delivery: l.delivery,
      transferPlatform: l.transferPlatform,
      createdAt: at(-60),
      paidAt: at(-59),
      deliveredAt: status === 'paid' ? undefined : at(-58),
      payoutReleaseAt: new Date(
        new Date(e.endsAt).getTime() + pricing.payoutReleaseHoursAfterEvent * HOUR,
      ).toISOString(),
      ...extra,
    };
    orders.push(o);
    const { sellerFee, payout } = sellerPayout(l.pricePence * l.quantity);
    payouts.push({
      id: `p-${id}`,
      orderId: id,
      sellerId: l.sellerId,
      grossPence: l.pricePence * l.quantity,
      sellerFeePence: sellerFee,
      amountPence: payout,
      status: status === 'completed' ? 'released' : status === 'reported' ? 'frozen' : 'held',
      releaseAt: o.payoutReleaseAt,
      releasedAt: status === 'completed' ? o.payoutReleaseAt : undefined,
    });
    return o;
  };
  order('o-1', 'l-bought-1', 'u-demo', 'delivered'); // upcoming
  order('o-2', 'l-bought-3', 'u-demo', 'completed'); // long past
  order('o-3', 'l-bought-2', 'u-demo', 'delivered'); // ended recently: still reportable
  const o4 = order('o-4', 'l-bought-4', 'u-demo', 'reported', { reportId: 'r-1' });
  reports.push({
    id: 'r-1',
    orderId: o4.id,
    reporterId: 'u-demo',
    reason: 'not_received',
    description: 'The seller never sent the FIXR transfer.',
    evidenceNames: ['fixr-inbox.png'],
    status: 'open',
    createdAt: at(-4),
  });
  order('o-5', 'l-demo-sold', 'u-s1', 'delivered'); // demo as seller, event just ended
  order('o-6', 'l-demo-sold2', 'u-s3', 'completed'); // demo as seller, paid out
  // Flagged report waiting in the admin queue
  const o7 = order('o-7', 'l-offer-target2', 'u-s5', 'reported', { reportId: 'r-2', payoutReleaseAt: at(30) });
  reports.push({
    id: 'r-2',
    orderId: o7.id,
    reporterId: 'u-s5',
    reason: 'not_valid',
    description: 'The QR code says already scanned.',
    evidenceNames: ['scan-error.jpg'],
    status: 'open',
    createdAt: at(-2),
  });
  const l7 = /** @type {any} */ (listings.find((l) => l.id === 'l-offer-target2'));
  l7.status = 'sold';

  // ----- offers -----
  const offers = [
    {
      id: 'of-1',
      listingId: 'l-demo-active',
      buyerId: 'u-s5',
      sellerId: 'u-demo',
      amountPence: 1200,
      lastActor: 'buyer',
      status: 'open',
      createdAt: at(-3),
      expiresAt: at(21),
      history: [{ actor: 'buyer', amountPence: 1200, at: at(-3) }],
    },
    {
      id: 'of-2',
      listingId: 'l-demo-active',
      buyerId: 'u-s8',
      sellerId: 'u-demo',
      amountPence: 1300,
      lastActor: 'buyer',
      status: 'open',
      createdAt: at(-1),
      expiresAt: at(23),
      history: [{ actor: 'buyer', amountPence: 1300, at: at(-1) }],
    },
    {
      id: 'of-3',
      listingId: 'l-offer-target',
      buyerId: 'u-demo',
      sellerId: 'u-s4',
      amountPence: 4000,
      lastActor: 'buyer',
      status: 'accepted',
      createdAt: at(-14),
      expiresAt: at(10),
      checkoutDeadline: at(10),
      history: [
        { actor: 'buyer', amountPence: 4000, at: at(-14) },
        { actor: 'seller', amountPence: 4000, at: at(-2) },
      ],
    },
  ];
  const openTarget = /** @type {any} */ (listings.find((l) => l.id === 'l-offer-target'));
  offers.push({
    id: 'of-4',
    listingId: openTarget.id,
    buyerId: 'u-s6',
    sellerId: 'u-s4',
    amountPence: 3800,
    lastActor: 'buyer',
    status: 'declined',
    createdAt: at(-20),
    expiresAt: at(4),
    history: [{ actor: 'buyer', amountPence: 3800, at: at(-20) }],
  });
  const someActive = /** @type {any} */ (
    listings.find(
      (l) => l.status === 'active' && l.sellerId !== 'u-demo' && l.pricePence > 1000 && l.id !== 'l-offer-target',
    )
  );
  offers.push({
    id: 'of-5',
    listingId: someActive.id,
    buyerId: 'u-demo',
    sellerId: someActive.sellerId,
    amountPence: someActive.pricePence - 200,
    lastActor: 'buyer',
    status: 'open',
    createdAt: at(-2),
    expiresAt: at(22),
    history: [{ actor: 'buyer', amountPence: someActive.pricePence - 200, at: at(-2) }],
  });

  // ----- notifications -----
  /** @param {string} id @param {'offer'|'order'|'alert'|'system'} kind @param {string} title @param {string} body @param {number} agoH @param {string} href @param {boolean} [read] */
  const note = (id, kind, title, body, agoH, href, read = false) => ({
    id,
    userId: 'u-demo',
    kind,
    title,
    body,
    createdAt: at(-agoH),
    read,
    href,
  });
  /** @type {import('../types/index.js').Notification[]} */
  const notifications = [
    note(
      'n-1',
      'offer',
      'New offer on your listing',
      'Someone offered £13 on your Bassline Sessions tickets.',
      1,
      '#/account/offers',
    ),
    note(
      'n-2',
      'offer',
      'Your offer was accepted',
      'Complete checkout within 12 hours to secure your Pastel Ball tickets.',
      2,
      '#/account/offers',
    ),
    note(
      'n-3',
      'order',
      'Your tickets are ready',
      'Retro Rave Reloaded tickets are in My tickets.',
      58,
      '#/account/tickets',
      true,
    ),
    note(
      'n-4',
      'system',
      'Welcome to StudentSwap',
      'Verified students, face-value prices, money held until after the event.',
      24 * 60,
      '#/how-it-works',
      true,
    ),
  ];

  return {
    version: DB_VERSION,
    users,
    events,
    listings,
    offers,
    orders,
    payouts,
    reports,
    notifications,
    alerts: /** @type {{ userId: string, eventId: string }[]} */ ([]),
    eventRequests: /** @type {any[]} */ ([]),
    files: /** @type {Record<string, { name: string, size: number }>} */ ({}),
    /** Duplicate-detection registry: one fingerprint per listed ticket file. @type {import('../lib/ticket-fingerprint.js').RegistryEntry[]} */
    ticketFingerprints: [],
    counters: { listing: 1000, offer: 1000, order: 1000, report: 1000, payout: 1000, user: 1000, notification: 1000 },
  };
}

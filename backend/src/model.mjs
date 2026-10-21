// Row -> API object mappers. The shapes match what src/api/*.mock.js returns (the contract the UI is built on) and
// src/types/index.js. Column lists live next to their mapper so every query selects the same fields.

/** @param {Date | string | null | undefined} d */
export const iso = (d) => (d == null ? undefined : new Date(d).toISOString());

export const USER_COLS = `u.id, u.email, u.display_name, u.university_id, u.avatar_tone, u.avatar_initials,
  u.profile_complete, u.age_confirmed_at, u.rating_avg::float8 as rating_avg, u.rating_count, u.completed_sales,
  u.notification_prefs, u.connect_status, u.created_at`;

/** Public view of a seller: never the email. @param {any} r */
export const sellerSummary = (r) => ({
  id: r.id,
  displayName: r.display_name ?? '',
  universityId: r.university_id ?? '',
  avatar: { tone: r.avatar_tone ?? 'blue', initials: r.avatar_initials ?? '' },
  ratingAvg: Number(r.rating_avg ?? 0),
  ratingCount: r.rating_count ?? 0,
  completedSales: r.completed_sales ?? 0,
  createdAt: iso(r.created_at),
});

/** The signed-in user's own view (GET /me). Role comes from the token's Cognito groups. @param {any} r @param {'user' | 'admin'} role */
export const privateUser = (r, role) => ({
  ...sellerSummary(r),
  email: r.email,
  role,
  profileComplete: !!r.profile_complete,
  ageConfirmed: !!r.age_confirmed_at,
  notificationPrefs: r.notification_prefs,
  connectStatus: r.connect_status,
});

export const EVENT_COLS = `e.id, e.title, e.description, e.venue, e.venue_id, e.city_id, e.university_ids, e.type,
  e.starts_at, e.last_entry_at, e.ends_at, e.age_restriction, e.id_requirement, e.tone`;

/** @param {any} r @param {any[]} tierRows */
export const eventRecord = (r, tierRows) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  venue: r.venue,
  venueId: r.venue_id ?? null,
  cityId: r.city_id,
  universityIds: r.university_ids ?? [],
  type: r.type,
  startsAt: iso(r.starts_at),
  lastEntryAt: iso(r.last_entry_at),
  endsAt: iso(r.ends_at),
  ageRestriction: r.age_restriction,
  idRequirement: r.id_requirement,
  tiers: tierRows
    .filter((t) => t.event_id === r.id)
    .sort((a, b) => a.position - b.position)
    .map(tier),
  tone: r.tone,
});

/** @param {any} t */
export const tier = (t) => ({ id: t.id, name: t.name, faceValuePence: t.face_value_pence });

/**
 * Event + live market stats, as `eventSummary` in src/api/mock/helpers.js.
 * @param {ReturnType<typeof eventRecord>} e @param {{ available: number, lowest: number } | undefined} stats
 */
export function eventSummary(e, stats) {
  const available = stats?.available ?? 0;
  return {
    ...e,
    faceValuePence: Math.min(...e.tiers.map((t) => t.faceValuePence)),
    lowestPricePence: stats?.lowest ?? 0,
    ticketsAvailable: available,
    // The mock also counts "sold in the last 48h"; that needs orders, which arrive with the Stripe step.
    sellingFast: available > 0 && available <= 6,
  };
}

export const LISTING_COLS = `l.id, l.event_id, l.tier_id, l.seller_id, l.quantity, l.price_pence, l.face_value_pence,
  l.delivery, l.transfer_platform, l.file_key, l.file_name, l.barcode_check, l.status, l.review_note,
  l.review_reasons, l.ai_assisted, l.created_at`;

/**
 * @param {any} r
 * @param {boolean} privateView seller or admin: includes the file key and review details
 */
export function listing(r, privateView) {
  const base = {
    id: r.id,
    eventId: r.event_id,
    tierId: r.tier_id,
    sellerId: r.seller_id,
    quantity: r.quantity,
    pricePence: r.price_pence,
    faceValuePence: r.face_value_pence,
    delivery: r.delivery,
    transferPlatform: r.transfer_platform ?? undefined,
    fileName: r.file_name ?? undefined,
    status: r.status,
    aiAssisted: !!r.ai_assisted,
    createdAt: iso(r.created_at),
  };
  if (!privateView) return base;
  return {
    ...base,
    fileKey: r.file_key ?? undefined,
    barcodeCheck: r.barcode_check ?? undefined,
    reviewNote: r.review_note ?? undefined,
    reviewReasons: r.review_reasons ?? [],
  };
}

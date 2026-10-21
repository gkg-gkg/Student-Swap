// Reference data (regions, cities, universities, venues) comes from the frontend's data file, so the site and the
// database can't drift apart. Upserts: safe to run on every deploy. Rows are never deleted here, because events
// and users point at them; retire a venue by editing it, not by removing it from regions.js.
import { regions, cities, universities, venues } from '../../src/data/regions.js';

/** @param {import('../src/db.mjs').Db} db */
export async function seedReferenceData(db) {
  await db.tx(async (tx) => {
    for (const r of regions)
      await tx.query(
        `insert into regions (id, name, live) values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, live = excluded.live`,
        [r.id, r.name, r.live],
      );
    for (const c of cities)
      await tx.query(
        `insert into cities (id, region_id, name) values ($1, $2, $3)
         on conflict (id) do update set region_id = excluded.region_id, name = excluded.name`,
        [c.id, c.regionId, c.name],
      );
    for (const u of universities)
      await tx.query(
        `insert into universities (id, city_id, name, short, email_domains) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set city_id = excluded.city_id, name = excluded.name, short = excluded.short,
           email_domains = excluded.email_domains`,
        [u.id, u.cityId, u.name, u.short, u.emailDomains],
      );
    for (const v of venues)
      await tx.query(
        `insert into venues (id, name, city_id, area, kind) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set name = excluded.name, city_id = excluded.city_id, area = excluded.area,
           kind = excluded.kind`,
        [v.id, v.name, v.cityId, v.area, v.kind],
      );
  });
}

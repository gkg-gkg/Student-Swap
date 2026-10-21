// Applies pending migrations, then upserts reference data. Run on every deploy by a CDK Trigger (see infra/stack.mjs).
import pg from 'pg';
import { migrations } from './migrations.mjs';
import { seedReferenceData } from './seed.mjs';

/** @param {import('../src/db.mjs').Db} db @returns {Promise<string[]>} ids applied this run */
export async function migrate(db) {
  await db.query(
    `create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`,
  );
  const done = new Set((await db.query('select id from schema_migrations')).map((r) => r.id));
  const applied = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.tx(async (tx) => {
      for (const statement of splitStatements(m.sql)) await tx.query(statement);
      await tx.query('insert into schema_migrations (id) values ($1)', [m.id]);
    });
    applied.push(m.id);
  }
  await seedReferenceData(db);
  return applied;
}

/** Prepared statements take one command at a time. Our migrations have no semicolons inside strings or bodies. @param {string} sql */
export const splitStatements = (sql) =>
  sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

/**
 * Lambda entry point. It connects as the RDS master user (its password is resolved into this function's environment by
 * CloudFormation from Secrets Manager), creates the IAM-authenticated `app` user the API uses, then migrates.
 */
export const handler = async () => {
  const client = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_MASTER_USER,
    password: process.env.DB_MASTER_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  /** @type {import('../src/db.mjs').Db} */
  const db = {
    query: async (t, p) => (await client.query(t, p)).rows,
    one: async (t, p) => (await client.query(t, p)).rows[0] ?? null,
    async tx(fn) {
      await client.query('BEGIN');
      try {
        const out = await fn(db);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },
  };
  try {
    const appUser = /** @type {string} */ (process.env.DB_USER);
    if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) throw new Error('DB_USER must be a plain identifier');
    await client.query(`do $$ begin
      if not exists (select from pg_roles where rolname = '${appUser}') then create role ${appUser} login; end if;
    end $$`);
    await client.query(`grant rds_iam to ${appUser}`);
    const applied = await migrate(db);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${appUser}`);
    console.log(JSON.stringify({ msg: 'migrated', applied }));
    return { applied };
  } finally {
    await client.end();
  }
};

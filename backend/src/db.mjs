// Database access. Everything else talks to the small `Db` interface below, so the same code runs against RDS
// Postgres in Lambda (pg + IAM auth tokens) and against an in-process Postgres (PGlite) in the tests.
import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

/**
 * @typedef {(text: string, params?: unknown[]) => Promise<any[]>} Query  returns the result rows
 * @typedef {object} Db
 * @property {Query} query
 * @property {(text: string, params?: unknown[]) => Promise<any | null>} one  first row or null
 * @property {<T>(fn: (tx: { query: Query, one: (text: string, params?: unknown[]) => Promise<any | null> }) => Promise<T>) => Promise<T>} tx
 *   Runs `fn` in one transaction; rolls back if it throws.
 */

/** @param {Query} query */
const withOne = (query) => ({
  query,
  one: async (/** @type {string} */ t, /** @type {unknown[]} */ p) => (await query(t, p))[0] ?? null,
});

/**
 * RDS Postgres with IAM database authentication: the password is a 15-minute token signed locally from the Lambda's
 * role, so there is no database password to store and no network call to Secrets Manager.
 * RDS's CA certificates ship with the Lambda Node.js runtime; NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem loads them.
 * @param {{ host: string, port?: number, user: string, database: string, region: string }} o
 * @returns {Db}
 */
export function createRdsDb({ host, port = 5432, user, database, region }) {
  const signer = new Signer({ hostname: host, port, username: user, region });
  const pool = new pg.Pool({
    host,
    port,
    user,
    database,
    password: () => signer.getAuthToken(),
    ssl: { rejectUnauthorized: true },
    max: 2, // one Lambda handles one request at a time
    idleTimeoutMillis: 60_000,
  });
  /** @type {Query} */
  const query = async (text, params) => (await pool.query(text, params)).rows;
  return {
    ...withOne(query),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        /** @type {Query} */
        const q = async (text, params) => (await client.query(text, params)).rows;
        const out = await fn(withOne(q));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Wraps a PGlite instance (tests and local runs) in the same interface.
 * @param {{ query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }>, transaction: (fn: (tx: any) => Promise<any>) => Promise<any> }} lite
 * @returns {Db}
 */
export function fromPglite(lite) {
  /** @type {Query} */
  const query = async (text, params) => (await lite.query(text, params)).rows;
  return {
    ...withOne(query),
    tx: (fn) =>
      lite.transaction(async (/** @type {any} */ t) => {
        /** @type {Query} */
        const q = async (text, params) => (await t.query(text, params)).rows;
        return fn(withOne(q));
      }),
  };
}

/** Lambda-wide database, created on first use from the environment the CDK stack sets. @type {Db | null} */
let shared = null;
export function dbFromEnv() {
  shared ??= createRdsDb({
    host: /** @type {string} */ (process.env.DB_HOST),
    port: Number(process.env.DB_PORT ?? 5432),
    user: /** @type {string} */ (process.env.DB_USER),
    database: /** @type {string} */ (process.env.DB_NAME),
    region: /** @type {string} */ (process.env.AWS_REGION),
  });
  return shared;
}

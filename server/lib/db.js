// PostgreSQL access through a connection pool.
// Point POSTGRES_URL at Supabase's *pooled* connection string (Supavisor, port 6543) so the app, the Docker
// replicas and the serverless functions share a small number of real connections.
import pg from 'pg';

const URL = () => process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';

let pool = null;

export const hasDb = () => Boolean(URL());

export function getPool() {
  if (!hasDb()) return null;
  if (!pool) {
    const url = URL();
    pool = new pg.Pool({
      connectionString: url,
      // serverless: a handful per instance is plenty behind a pooler; Docker replicas set DB_POOL_MAX higher
      max: Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 10),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 8_000,
      allowExitOnIdle: true,
      ssl: /localhost|127\.0\.0\.1|@db[:/]|sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    });
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

/** Parameterised query helper. Never interpolate user input into `text`. */
export async function query(text, params = []) {
  const p = getPool();
  if (!p) throw Object.assign(new Error('database not configured'), { code: 'NO_DB' });
  return p.query(text, params);
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

/** run `fn(client)` inside a transaction (commit on success, rollback on any error) */
export async function tx(fn) {
  const p = getPool();
  if (!p) throw Object.assign(new Error('database not configured'), { code: 'NO_DB' });
  const client = await p.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

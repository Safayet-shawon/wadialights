// Applies db/schema.sql and upserts the demonstration catalogue.
//   POSTGRES_URL=postgres://... npm run db:migrate
// Works against Supabase (use the pooled connection string) or any PostgreSQL 13+.
import { readFileSync } from 'node:fs';
import { getPool, closePool, hasDb } from '../server/lib/db.js';
import { PRODUCT_SEED } from '../server/lib/seed.js';

if (!hasDb()) {
  console.error('No database URL. Set POSTGRES_URL (Supabase: Project Settings → Database → Connection pooling).');
  process.exit(1);
}

const pool = getPool();
const client = await pool.connect();
try {
  await client.query('begin');
  await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  for (const p of PRODUCT_SEED) {
    await client.query(
      `insert into products (slug, name, category, description, sort, is_demo)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (slug) do update set name = excluded.name, category = excluded.category,
         description = excluded.description, sort = excluded.sort`,
      [p.slug, p.name, p.category, p.description, p.sort, p.is_demo],
    );
  }
  await client.query('commit');
  const { rows } = await client.query('select count(*)::int as n from products');
  console.log(`schema applied · ${rows[0].n} products`);
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await closePool();
}

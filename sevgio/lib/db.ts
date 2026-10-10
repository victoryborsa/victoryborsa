import pg from "pg";

// Return DATE columns as "YYYY-MM-DD" strings so no time zone shifting ever happens.
pg.types.setTypeParser(1082, (v: string) => v);
// numeric -> number (ratings, bathrooms)
pg.types.setTypeParser(1700, (v: string) => Number(v));
// bigint counts -> number
pg.types.setTypeParser(20, (v: string) => Number(v));

const globalForPool = globalThis as unknown as { __sevgioPool?: pg.Pool };

export const pool =
  globalForPool.__sevgioPool ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || 5), idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== "production") globalForPool.__sevgioPool = pool;

export type Db = pg.Pool | pg.PoolClient;

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const res = await db.query(text, params as unknown[]);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const rows = await q<T>(text, params, db);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const { Pool } = require('pg');
require('dotenv').config();

// ---- Postgres ----
// Supports both legacy `POSTGRES_*` env vars and optional `DB_*` aliases, plus Neon connection strings.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
        port: process.env.POSTGRES_PORT
          ? Number(process.env.POSTGRES_PORT)
          : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432),
        user: process.env.POSTGRES_USER || process.env.DB_USER || 'postgres',
        password:
          process.env.POSTGRES_PASSWORD ??
          process.env.DB_PASSWORD ??
          undefined,
        database: process.env.POSTGRES_DB || process.env.DB_NAME || 'zivarr',
        ssl: { rejectUnauthorized: false },
      }
);

async function listUsers() {
  const { rows } = await pool.query(
    'SELECT id, name, email, created_at FROM users ORDER BY id DESC'
  );

  if (!rows.length) {
    console.log('No registered users found.');
    return;
  }

  console.table(
    rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      created_at: u.created_at,
    }))
  );
}

(async () => {
  try {
    await listUsers();
  } catch (err) {
    console.error('Failed to read users from DB:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();


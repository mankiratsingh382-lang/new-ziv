const { Pool } = require('pg');
require('dotenv').config();

// This script is intended as a quick check of Postgres product data.
// It uses the same env var conventions as server.js, with Neon connection strings supported.
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

async function main() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, price, material, description, badge, sort_order, created_at
       FROM products
       ORDER BY sort_order, name`
    );

    console.log(`Database: ${process.env.POSTGRES_DB || process.env.DB_NAME || 'zivarr'}`);
    console.log(`Products found: ${rows.length}`);
    console.table(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        price: r.price,
        badge: r.badge,
        material: r.material,
        sort_order: r.sort_order,
        created_at: r.created_at,
      }))
    );
  } catch (err) {
    console.error('Failed to read products from Postgres:', err);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();





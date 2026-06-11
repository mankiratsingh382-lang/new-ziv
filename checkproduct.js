const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_NAME = process.env.DB_NAME || 'zivarr';
const DB_PATH = path.join(DATA_DIR, `${DB_NAME}.db`);

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH, { fileMustExist: false });

function main() {
  try {
    const rows = db
      .prepare(`
        SELECT id, name, category, price, material, description, badge, sort_order, created_at
        FROM products
        ORDER BY sort_order, name
      `)
      .all();

    console.log(`Database: ${DB_PATH}`);
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
    console.error('Failed to read products table:', err);
    process.exitCode = 1;
  }
}

main();


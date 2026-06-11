const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_NAME = process.env.DB_NAME || 'zivarr';
const DB_PATH = path.join(DATA_DIR, `${DB_NAME}.db`);

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });

function listUsers() {
  const users = db
    .prepare('SELECT id, name, email, created_at FROM users ORDER BY id DESC')
    .all();

  if (!users.length) {
    console.log('No registered users found.');
    return;
  }

  console.table(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    created_at: u.created_at,
  })));
}

try {
  listUsers();
} catch (err) {
  console.error('Failed to read users from DB:', err.message);
  process.exitCode = 1;
}


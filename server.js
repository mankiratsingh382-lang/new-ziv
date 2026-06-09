const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'zivarr.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      material TEXT,
      description TEXT,
      badge TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      total_price INTEGER NOT NULL,
      shipping_price INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      shipping_name TEXT,
      shipping_phone TEXT,
      shipping_address TEXT,
      shipping_city TEXT,
      shipping_pincode TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  const seedProducts = db.prepare(`
    INSERT OR IGNORE INTO products (id, name, category, price, material, description, badge, sort_order)
    VALUES
      (1, 'Seraphine Choker', 'Necklaces', 3499, 'Sterling Silver · Rhodium', 'Signature choker with sculpted sparkle and elegant drape.', 'New', 1),
      (2, 'Luna Drop Earrings', 'Earrings', 2199, '18K Gold Plated', 'Lightweight drop earrings with luminous movement and a subtle shine.', 'Bestseller', 2),
      (3, 'Aurore Tennis Bracelet', 'Bracelets', 4799, '18K Gold Plated', 'Tennis bracelet finished in a polished sheen for all-day elegance.', 'New', 3),
      (4, 'Celeste Solitaire Ring', 'Rings', 1899, 'Sterling Silver', 'A refined solitaire ring designed for daily wear and evening glow.', 'Featured', 4),
      (5, 'Bloom Stud Earrings', 'Earrings', 999, 'Sterling Silver', 'Simple, elegant studs with a polished finish for everyday wear.', 'Classic', 5),
      (6, 'Crescent Pendant Necklace', 'Necklaces', 3299, 'Gold vermeil', 'A graceful pendant necklace with a soft moonlit silhouette.', 'Limited', 6)
  `);

  seedProducts.run();
}

initializeDatabase();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const session = db.prepare(`
    SELECT s.user_id, s.session_token, s.expires_at, u.email, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = ?
  `).get(token);

  if (!session || session.expires_at <= Date.now()) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  req.user = {
    id: session.user_id,
    email: session.email,
    name: session.name,
    token,
  };

  next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: DB_PATH });
});

app.get('/api/products', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, category, price, material, description, badge, sort_order
    FROM products
    ORDER BY sort_order, name
  `).all();

  res.json(rows);
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const normalizedEmail = normalizeEmail(email);

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  const userResult = insertUser.run(name.trim(), normalizedEmail, passwordHash);

  const token = uuidv4();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)')
    .run(userResult.lastInsertRowid, token, expiresAt);

  res.status(201).json({
    user: {
      id: userResult.lastInsertRowid,
      name: name.trim(),
      email: normalizedEmail,
    },
    token,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(normalizedEmail);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = uuidv4();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)')
    .run(user.id, token, expiresAt);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    token,
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const {
    product_id,
    quantity = 1,
    shipping_name,
    shipping_phone,
    shipping_address,
    shipping_city,
    shipping_pincode,
    notes,
  } = req.body || {};

  if (!product_id) {
    return res.status(400).json({ error: 'product_id is required.' });
  }

  const product = db.prepare('SELECT id, price, name FROM products WHERE id = ?').get(Number(product_id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const qty = Number(quantity) > 0 ? Number(quantity) : 1;
  const shippingPrice = 149;
  const totalPrice = product.price * qty + shippingPrice;

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      user_id, product_id, quantity, total_price, shipping_price, status,
      shipping_name, shipping_phone, shipping_address, shipping_city, shipping_pincode, notes
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
  `);

  const result = insertOrder.run(
    req.user.id,
    product.id,
    qty,
    totalPrice,
    shippingPrice,
    shipping_name || req.user.name,
    shipping_phone || '',
    shipping_address || '',
    shipping_city || '',
    shipping_pincode || '',
    notes || ''
  );

  res.status(201).json({
    id: result.lastInsertRowid,
    product_id: product.id,
    product_name: product.name,
    quantity: qty,
    total_price: totalPrice,
    shipping_price: shippingPrice,
    status: 'pending',
  });
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT o.id, o.product_id, p.name AS product_name, o.quantity, o.total_price, o.shipping_price, o.status,
           o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_city, o.shipping_pincode, o.notes, o.created_at
    FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);

  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`Zivarr backend running at http://localhost:${PORT}`);
});

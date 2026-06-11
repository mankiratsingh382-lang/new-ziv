const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ---- Postgres ----
// Supports both legacy `POSTGRES_*` env vars and optional `DB_*` aliases.
const pool = new Pool({
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
});




function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureSchema() {
  // Use your init.sql structure (CREATE TABLE IF NOT EXISTS already done there).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token TEXT NOT NULL UNIQUE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      price INTEGER NOT NULL,
      material VARCHAR(255),
      description TEXT,
      badge VARCHAR(100),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1,
      total_price INTEGER NOT NULL,
      shipping_price INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      shipping_name VARCHAR(150),
      shipping_phone VARCHAR(50),
      shipping_address TEXT,
      shipping_city VARCHAR(150),
      shipping_pincode VARCHAR(30),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed products (idempotent)
  await pool.query(`
    INSERT INTO products (id, name, category, price, material, description, badge, sort_order)
    VALUES
      (1, 'Seraphine Choker', 'Necklaces', 3499, 'Sterling Silver · Rhodium', 'Signature choker with sculpted sparkle and elegant drape.', 'New', 1),
      (2, 'Luna Drop Earrings', 'Earrings', 2199, '18K Gold Plated', 'Lightweight drop earrings with luminous movement and a subtle shine.', 'Bestseller', 2),
      (3, 'Aurore Tennis Bracelet', 'Bracelets', 4799, '18K Gold Plated', 'Tennis bracelet finished in a polished sheen for all-day elegance.', 'New', 3),
      (4, 'Celeste Solitaire Ring', 'Rings', 1899, 'Sterling Silver', 'A refined solitaire ring designed for daily wear and evening glow.', 'Featured', 4),
      (5, 'Bloom Stud Earrings', 'Earrings', 999, 'Sterling Silver', 'Simple, elegant studs with a polished finish for everyday wear.', 'Classic', 5),
      (6, 'Crescent Pendant Necklace', 'Necklaces', 3299, 'Gold vermeil', 'A graceful pendant necklace with a soft moonlit silhouette.', 'Limited', 6)
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const { rows } = await pool.query(
      `SELECT s.user_id, s.session_token, s.expires_at, u.email, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.session_token = $1`,
      [token]
    );

    const session = rows[0];
    if (!session || Number(session.expires_at) <= Date.now()) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      token,
    };

    next();
  } catch (e) {
    return res.status(500).json({ error: 'Auth lookup failed.' });
  }
}

// ---- Public APIs ----
app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', database: process.env.POSTGRES_DB || null });
});

app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, price, material, description, badge, sort_order
       FROM products
       ORDER BY sort_order, name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

// ---- Auth (sessions table) ----
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const normalizedEmail = normalizeEmail(email);
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email',
      [name.trim(), normalizedEmail, passwordHash]
    );

    const token = uuidv4();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await pool.query(
      'INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1,$2,$3)',
      [userResult.rows[0].id, token, expiresAt]
    );

    res.status(201).json({
      user: {
        id: userResult.rows[0].id,
        name: userResult.rows[0].name,
        email: userResult.rows[0].email,
      },
      token,
    });
  } catch (e) {
    // Likely unique constraint race
    return res.status(500).json({ error: 'Register failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const userRes = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [normalizedEmail]
    );

    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = uuidv4();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await pool.query(
      'INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1,$2,$3)',
      [user.id, token, expiresAt]
    );

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (e) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ---- Orders ----
app.post('/api/orders', authMiddleware, async (req, res) => {
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

  if (!product_id) return res.status(400).json({ error: 'product_id is required.' });

  try {
    const productRes = await pool.query('SELECT id, price, name FROM products WHERE id = $1', [Number(product_id)]);
    const product = productRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const qty = Number(quantity) > 0 ? Number(quantity) : 1;
    const shippingPrice = 149;
    const totalPrice = product.price * qty + shippingPrice;

    const result = await pool.query(
      `INSERT INTO orders (
        user_id, product_id, quantity, total_price, shipping_price, status,
        shipping_name, shipping_phone, shipping_address, shipping_city, shipping_pincode, notes
      ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11)
      RETURNING id`,
      [
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
        notes || '',
      ]
    );

    res.status(201).json({
      id: result.rows[0].id,
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      total_price: totalPrice,
      shipping_price: shippingPrice,
      status: 'pending',
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.product_id, p.name AS product_name, o.quantity, o.total_price, o.shipping_price, o.status,
              o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_city, o.shipping_pincode,
              o.notes, o.created_at
       FROM orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// ---- Admin ----
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Admin authentication required.' });
  next();
}

app.get('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, price, material, description, badge, sort_order, created_at
       FROM products
       ORDER BY sort_order, name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

app.post('/api/admin/products', adminAuth, async (req, res) => {
  const body = req.body || {};
  const { id, name, category, price, material, description, badge, sort_order } = body;

  if (!name || !category || price === undefined || price === null || Number(price) <= 0) {
    return res.status(400).json({ error: 'name, category, and valid price are required.' });
  }

  const pid = id !== undefined && id !== null && String(id).trim() !== '' ? Number(id) : null;
  const sortOrderValue = sort_order !== undefined && sort_order !== null && String(sort_order).trim() !== '' ? Number(sort_order) : 0;

  try {
    if (pid) {
      const existing = await pool.query('SELECT id FROM products WHERE id = $1', [pid]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Product not found.' });

      await pool.query(
        `UPDATE products
         SET name=$1, category=$2, price=$3, material=$4, description=$5, badge=$6, sort_order=$7
         WHERE id=$8`,
        [
          String(name).trim(),
          String(category).trim(),
          Number(price),
          material ?? null,
          description ?? null,
          badge ?? null,
          sortOrderValue,
          pid,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO products (name, category, price, material, description, badge, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          String(name).trim(),
          String(category).trim(),
          Number(price),
          material ?? null,
          description ?? null,
          badge ?? null,
          sortOrderValue,
        ]
      );
    }

    const targetId = pid || null;
    const rows = await pool.query(
      `SELECT id, name, category, price, material, description, badge, sort_order, created_at
       FROM products
       ORDER BY sort_order, name`
    );

    const first = targetId ? rows.rows.find(r => Number(r.id) === Number(targetId)) : rows.rows[0];
    res.json(first || { ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save product.' });
  }
});

app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id.' });

  try {
    const existing = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Product not found.' });

    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id,
              o.user_id,
              u.email,
              u.name AS user_name,
              o.product_id,
              p.name AS product_name,
              o.quantity,
              o.total_price,
              o.status,
              o.created_at
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

app.post('/api/admin/orders/:id/status', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};

  if (!id) return res.status(400).json({ error: 'Invalid order id.' });
  if (!status || typeof status !== 'string') return res.status(400).json({ error: 'status is required.' });

  const allowed = new Set(['pending', 'processing', 'shipped', 'delivered', 'cancelled']);
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status.' });

  try {
    const existing = await pool.query('SELECT id FROM orders WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Order not found.' });

    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);

    const updated = await pool.query(
      `SELECT id, user_id, product_id, quantity, total_price, status, created_at
       FROM orders WHERE id = $1`,
      [id]
    );

    res.json(updated.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// ---- Start ----
ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Zivarr backend running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });


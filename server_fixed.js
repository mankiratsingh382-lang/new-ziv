const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.POSTGRES_PORT
    ? Number(process.env.POSTGRES_PORT)
    : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432),
  user: process.env.POSTGRES_USER || process.env.DB_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD ?? undefined,
  database: process.env.POSTGRES_DB || process.env.DB_NAME || 'zivarr',
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureSchema() {
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

    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      alt_text VARCHAR(255),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS product_images_product_order_idx
      ON product_images(product_id, sort_order);

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

  // Seed placeholder image URLs.
  // Replace /images/IMG_6489.JPG with your real URLs later.
  await pool.query(`
    INSERT INTO product_images (product_id, image_url, alt_text, sort_order)
    VALUES
      (1, '/images/IMG_6489.JPG', 'Seraphine Choker - Image 1', 1),
      (2, '/images/IMG_6489.JPG', 'Luna Drop Earrings - Image 1', 1),
      (3, '/images/IMG_6489.JPG', 'Aurore Tennis Bracelet - Image 1', 1),
      (4, '/images/IMG_6489.JPG', 'Celeste Solitaire Ring - Image 1', 1),
      (5, '/images/IMG_6489.JPG', 'Bloom Stud Earrings - Image 1', 1),
      (6, '/images/IMG_6489.JPG', 'Crescent Pendant Necklace - Image 1', 1)
    ON CONFLICT DO NOTHING;
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

    req.user = { id: session.user_id, email: session.email, name: session.name, token };
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Auth lookup failed.' });
  }
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', database: process.env.POSTGRES_DB || null });
});

// UPDATED: return images[] per product
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
         p.id, p.name, p.category, p.price, p.material, p.description, p.badge, p.sort_order,
         COALESCE(
           json_agg(
             json_build_object(
               'id', pi.id,
               'image_url', pi.image_url,
               'alt_text', pi.alt_text,
               'sort_order', pi.sort_order
             ) ORDER BY pi.sort_order
           ) FILTER (WHERE pi.id IS NOT NULL),
           '[]'::json
         ) AS images
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id
       GROUP BY p.id
       ORDER BY p.sort_order, p.name`
    );

    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      price: r.price,
      material: r.material,
      description: r.description,
      badge: r.badge,
      sort_order: r.sort_order,
      images: Array.isArray(r.images) ? r.images : JSON.parse(r.images || '[]'),
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

// Auth (sessions table)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
  const normalizedEmail = normalizeEmail(email);
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters long.' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email',
      [name.trim(), normalizedEmail, passwordHash]
    );

    const token = uuidv4();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await pool.query('INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1,$2,$3)', [userResult.rows[0].id, token, expiresAt]);

    res.status(201).json({
      user: { id: userResult.rows[0].id, name: userResult.rows[0].name, email: userResult.rows[0].email },
      token,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Register failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const normalizedEmail = normalizeEmail(email);

  try {
    const userRes = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [normalizedEmail]);
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = uuidv4();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await pool.query('INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1,$2,$3)', [user.id, token, expiresAt]);

    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (e) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Orders
app.post('/api/orders', authMiddleware, async (req, res) => {
  const { product_id, quantity = 1, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_pincode, notes } = req.body || {};
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

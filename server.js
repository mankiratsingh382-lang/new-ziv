 const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Razorpay = require('razorpay');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3000;

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error('Missing Razorpay credentials. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file.');
}

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; media-src 'self' https:; manifest-src 'self' https:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; connect-src 'self' https: https://checkout.razorpay.com; frame-src https://*.razorpay.com https://checkout.razorpay.com; upgrade-insecure-requests;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Uploads for product images (admin uses file upload)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    const safeExt = ext.match(/^\.(jpg|jpeg|png|gif|webp|svg)$/i) ? ext : '.jpg';
    const filename = `product_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  // Allow larger uploads for admin panel image uploads
  // (was 5MB; some of the existing images exceed that)
  limits: { fileSize: 15 * 1024 * 1024 },
});

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_CONNECTION_STRING || process.env.NEON_DATABASE_URL;

function buildPool(connectionStringOverride) {
  const resolvedConnectionString = connectionStringOverride || connectionString;
  const sslConfig = resolvedConnectionString?.includes('neon.tech') || resolvedConnectionString?.includes('sslmode=') || process.env.VERCEL || process.env.PGSSLMODE === 'require'
    ? { rejectUnauthorized: false }
    : false;

  return new Pool(
    resolvedConnectionString
      ? {
          connectionString: resolvedConnectionString,
          ssl: sslConfig,
          connectionTimeoutMillis: 3000,
        }
      : {
          host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
          port: process.env.POSTGRES_PORT
            ? Number(process.env.POSTGRES_PORT)
            : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432),
          user: process.env.POSTGRES_USER || process.env.DB_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD ?? undefined,
          database: process.env.POSTGRES_DB || process.env.DB_NAME || 'zivarr',
          ssl: sslConfig,
          connectionTimeoutMillis: 3000,
        }
  );
}

const pool = buildPool();

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

    CREATE TABLE IF NOT EXISTS addresses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      address TEXT NOT NULL,
      city VARCHAR(150) NOT NULL,
      pincode VARCHAR(30) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );


    -- Password reset tokens (demo/local flow)
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
      ON password_reset_tokens(user_id);
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

app.get('/api/products', async (req, res) => {
  const neonConnectionString = req.headers['x-neon-connection'] || req.headers['x-neon-connection-string'];
  const requestPool = neonConnectionString ? buildPool(String(neonConnectionString)) : pool;

  try {
    const { rows } = await requestPool.query(
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

    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        price: r.price,
        material: r.material,
        description: r.description,
        badge: r.badge,
        sort_order: r.sort_order,
        images: Array.isArray(r.images) ? r.images : JSON.parse(r.images || '[]'),
      }))
    );
  } catch (e) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

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

app.post('/api/razorpay/create-order', authMiddleware, async (req, res) => {
  const { amount, currency = 'INR', receipt } = req.body || {};
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'A valid amount is required.' });
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(numericAmount),
      currency,
      receipt: receipt || `zivarr_${Date.now()}`,
      notes: {
        user_email: req.user.email,
        user_name: req.user.name,
      },
    });

    res.json(order);
  } catch (error) {
  res.status(500).json({ error: 'Unable to create Razorpay order.' });
  }
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  const {
    product_id,
    quantity = 1,
    address_id,
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

    let resolved = {
      shipping_name: shipping_name || req.user.name,
      shipping_phone: shipping_phone || '',
      shipping_address: shipping_address || '',
      shipping_city: shipping_city || '',
      shipping_pincode: shipping_pincode || '',
    };

    // If address_id is provided, prefer it; otherwise fall back to raw shipping_* fields.
    if (address_id !== undefined && address_id !== null && String(address_id).trim() !== '') {
      const addressIdNum = Number(address_id);
      if (Number.isFinite(addressIdNum) && addressIdNum > 0) {
        const addrRes = await pool.query(
          `SELECT id, name, phone, address, city, pincode
           FROM addresses
           WHERE id = $1 AND user_id = $2`,
          [addressIdNum, req.user.id]
        );

        const addr = addrRes.rows[0];
        if (addr) {
          resolved = {
            shipping_name: addr.name,
            shipping_phone: addr.phone,
            shipping_address: addr.address,
            shipping_city: addr.city,
            shipping_pincode: addr.pincode,
          };
        }
      }
    }

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
        resolved.shipping_name,
        resolved.shipping_phone,
        resolved.shipping_address,
        resolved.shipping_city,
        resolved.shipping_pincode,
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

// ── Addresses (per user) ───────────────────────────────────────────────
app.get('/api/addresses', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, address, city, pincode, notes, created_at
       FROM addresses
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load addresses.' });
  }
});

app.post('/api/addresses', authMiddleware, async (req, res) => {
  const { name, phone, address, city, pincode, notes } = req.body || {};

  if (!name || !phone || !address || !city || !pincode) {
    return res.status(400).json({ error: 'name, phone, address, city, and pincode are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO addresses (user_id, name, phone, address, city, pincode, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, phone, address, city, pincode, notes, created_at`,
      [
        req.user.id,
        String(name).trim(),
        String(phone).trim(),
        String(address).trim(),
        String(city).trim(),
        String(pincode).trim(),
        notes ? String(notes).trim() : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create address.' });
  }
});


const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Zivarradmin@123';
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

    const first = targetId ? rows.rows.find((r) => Number(r.id) === Number(targetId)) : rows.rows[0];
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


// Admin: product images
app.get('/api/admin/products/:id/images', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid product id.' });

  try {
    const existing = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Product not found.' });

    const { rows } = await pool.query(
      `SELECT id, image_url, alt_text, sort_order, created_at
       FROM product_images
       WHERE product_id = $1
       ORDER BY sort_order, created_at`,
      [id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load product images.' });
  }
});

app.post('/api/admin/products/:id/images', adminAuth, upload.single('image'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid product id.' });
  if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

  const alt_text = (req.body?.alt_text || '').trim() || null;
  const sort_order_raw = (req.body?.sort_order ?? '').toString().trim();
  const sort_order = sort_order_raw === '' ? 0 : Number(sort_order_raw);

  try {
    const existing = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Product not found.' });

    // Save URL (server is serving __dirname statically, so uploads are publicly accessible)
    const image_url = `/uploads/${req.file.filename}`;

    await pool.query(
      `INSERT INTO product_images (product_id, image_url, alt_text, sort_order)
       VALUES ($1,$2,$3,$4)`,
      [id, image_url, alt_text, Number.isFinite(sort_order) ? sort_order : 0]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save product image.' });
  }
});

app.delete('/api/admin/product-images/:imageId', adminAuth, async (req, res) => {
  const imageId = Number(req.params.imageId);
  if (!imageId) return res.status(400).json({ error: 'Invalid image id.' });

  try {
    const existing = await pool.query('SELECT id FROM product_images WHERE id = $1', [imageId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Image not found.' });

    await pool.query('DELETE FROM product_images WHERE id = $1', [imageId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete product image.' });
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
              o.shipping_address,
              o.shipping_city,
              o.shipping_pincode,
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

// Ensure schema is ready on cold start (Vercel serverless) or local boot
const serverReady = ensureSchema().catch(err => {
  console.error('Schema init failed:', err);
});

if (!process.env.VERCEL) {
  serverReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Zivarr backend running at http://localhost:${PORT}`);
      });
    })
    .catch(() => process.exit(1));
}

// Middleware to wait for schema before handling requests
app.use(async (req, res, next) => {
  try {
    await serverReady;
  } catch (e) {
    return res.status(500).json({ error: 'Database not ready.' });
  }
  next();
});

// ── Password reset flow ─────────────────────────────────────────────────────

function randomResetToken(){
  // URL-safe token
  return uuidv4() + uuidv4();
}

function makeResetExpiryMs(){
  // 15 minutes
  return Date.now() + 15 * 60 * 1000;
}


app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};

  if (!email) return res.status(400).json({ error: 'Email is required.' });


  const normalizedEmail = normalizeEmail(email);


  try {
    const userRes = await pool.query('SELECT id, email FROM users WHERE email = $1', [normalizedEmail]);
    const user = userRes.rows[0];

    // Always return the same message to avoid account enumeration.
    const responsePayload = { message: 'If the email exists, you will receive reset instructions shortly.' };

    if (!user) {
      return res.json(responsePayload);
    }

    const resetToken = randomResetToken();
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const expiresAt = makeResetExpiryMs();

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
      [user.id, resetTokenHash, expiresAt]
    );

    // DEMO: return the token so the frontend can show a local reset UI without email delivery.
    return res.json({
      ...responsePayload,
      resetToken,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to initiate password reset.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, token, and newPassword are required.' });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    const user = userRes.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid email or reset token.' });

    // Find candidate tokens for user (most recent first)
    const candidatesRes = await pool.query(
      'SELECT id, token_hash, expires_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [user.id]
    );

    const candidates = candidatesRes.rows || [];
    let matched = null;

    for (const c of candidates) {
      if (Number(c.expires_at) <= Date.now()) continue;
      const ok = await bcrypt.compare(String(token), c.token_hash);
      if (ok) {
        matched = c;
        break;
      }
    }

    if (!matched) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);

    // Revoke tokens for this user after successful reset
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
});

module.exports = app;




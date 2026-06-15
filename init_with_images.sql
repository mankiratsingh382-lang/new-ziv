-- ZIVARR PostgreSQL / pgAdmin initialization script (with product images)
-- Run this in pgAdmin Query Tool on your target database.

DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
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

CREATE TABLE product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_images_product_order_idx
  ON product_images(product_id, sort_order);

CREATE TABLE orders (
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

INSERT INTO products (id, name, category, price, material, description, badge, sort_order)
VALUES
  (1, 'Seraphine Choker', 'Necklaces', 3499, 'Sterling Silver · Rhodium', 'Signature choker with sculpted sparkle and elegant drape.', 'New', 1),
  (2, 'Luna Drop Earrings', 'Earrings', 2199, '18K Gold Plated', 'Lightweight drop earrings with luminous movement and a subtle shine.', 'Bestseller', 2),
  (3, 'Aurore Tennis Bracelet', 'Bracelets', 4799, '18K Gold Plated', 'Tennis bracelet finished in a polished sheen for all-day elegance.', 'New', 3),
  (4, 'Celeste Solitaire Ring', 'Rings', 1899, 'Sterling Silver', 'A refined solitaire ring designed for daily wear and evening glow.', 'Featured', 4),
  (5, 'Bloom Stud Earrings', 'Earrings', 999, 'Sterling Silver', 'Simple, elegant studs with a polished finish for everyday wear.', 'Classic', 5),
  (6, 'Crescent Pendant Necklace', 'Necklaces', 3299, 'Gold vermeil', 'A graceful pendant necklace with a soft moonlit silhouette.', 'Limited', 6)
ON CONFLICT (id) DO NOTHING;

-- Seed placeholder image rows (URL-based). You can replace URLs anytime.
-- IMPORTANT: your app must serve static files from /images (server.js uses express.static(__dirname)).
INSERT INTO product_images (product_id, image_url, alt_text, sort_order)
VALUES
  (1, '/images/IMG_6489.JPG', 'Seraphine Choker - Image 1', 1),
  (2, '/images/IMG_6489.JPG', 'Luna Drop Earrings - Image 1', 1),
  (3, '/images/IMG_6489.JPG', 'Aurore Tennis Bracelet - Image 1', 1),
  (4, '/images/IMG_6489.JPG', 'Celeste Solitaire Ring - Image 1', 1),
  (5, '/images/IMG_6489.JPG', 'Bloom Stud Earrings - Image 1', 1),
  (6, '/images/IMG_6489.JPG', 'Crescent Pendant Necklace - Image 1', 1)
ON CONFLICT DO NOTHING;

SELECT 'Database initialized successfully (with product_images).' AS status;


# TODO

- [ ] Connect backend to PostgreSQL (live connection) instead of SQLite.
- [ ] Refactor `server.js` database layer: replace better-sqlite3 with `pg`.
- [ ] Ensure all existing endpoints still work: /api/products, /api/auth/register, /api/auth/login, /api/auth/me, /api/orders, /api/admin/*.
- [ ] Add DB initialization (CREATE TABLE IF NOT EXISTS) for PostgreSQL using existing schema from `init.sql`.
- [ ] Update `package.json` dependencies (add `pg`).
- [ ] Add env variables support: DATABASE_URL or PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE.
- [ ] Stop running server on port 3000 before restarting with DB changes.
- [ ] Test: call /api/health and /api/products and verify admin endpoints.


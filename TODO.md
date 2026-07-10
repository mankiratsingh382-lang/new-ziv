# TODO - addresses + address_id orders

## Backend (server.js)
- [ ] Add `addresses` table in `ensureSchema()`.
- [ ] Implement `GET /api/addresses` (auth) to list saved addresses for current user.
- [ ] Implement `POST /api/addresses` (auth) to add a new address.
- [ ] (Skip DELETE for now per decision) 
- [ ] Update `POST /api/orders` to accept `address_id` and fall back to raw shipping_* fields.

## Frontend (dashboard.html)
- [ ] Add address UI: dropdown of saved addresses + toggle “Use new address” + keep current raw fields.
- [ ] On dashboard load, fetch `/api/addresses` (when signed in) and populate dropdown.
- [ ] On submit, send `address_id` if an existing address is selected; otherwise send raw shipping_* fields.
- [ ] After adding/selecting addresses, refresh dropdown (at least after successful address add).

## Quick test
- [ ] Responsive layout intact.
- [ ] Address dropdown loads and persists selection.
- [ ] Order placement works with selected address.
- [ ] Order placement works in “new address” mode (fallback).


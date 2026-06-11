# ZIVARR Premium Jewelry Storefront Architecture

## 1. Route Map
- / — cinematic home with hero, collections, bestselling cards, cart drawer, and story
- /collections — curated category landing page for All, Necklaces, Rings, Earrings, Turkish Collection
- /product/:id — product detail page with gallery, specifications, sizing, care, and add-to-cart / buy-now flows
- /account — account landing page linking to login/register and order history
- /cart — cart summary and delivery notes
- /checkout — secure multi-step checkout placeholder with payment gateway stub
- /about — brand story and artisan sourcing vision
- /contact — customer care and concierge form
- /policies — shipping, returns, privacy, and care policy

## 2. UI / UX Specification
- Visual style: dark, minimalist, luxury-first palette with soft blush highlights and glassmorphism cards.
- Motion: subtle 3D hover, scroll-reveal transitions, and floating ornaments to create depth without clutter.
- Interaction rules:
  - Product cards support 3D tilt and quick add-to-cart feedback.
  - Cart drawer is accessible from every page.
  - Forms use clear status messaging and guest/login switching.

## 3. Frontend Component Plan
- AppShell: shared top nav, preloader, cursor ring, scroll progress, glassmorphic cart drawer
- HeroSection: cinematic image treatment, CTA, stats
- CollectionGrid: category cards and featured edit cards
- ProductCard: image, material, price, rating, add-to-cart action
- ProductDetail: image gallery, accordion specs, sizing, care, CTA actions
- AccountPanel: login/register, order history, guest path
- CheckoutFlow: address review, payment placeholder, order confirmation

## 4. Backend API Contract
- GET /api/products — list all jewelry inventory
- POST /api/auth/register — create customer account
- POST /api/auth/login — customer login
- GET /api/auth/me — session validation
- POST /api/orders — create an order
- GET /api/orders — return user order history

## 5. Design Notes for React Migration
- Use React Router for the route map above.
- Split the UI into reusable components: Header, Hero, ProductCard, ProductDetail, CartDrawer, CheckoutStep, AccountPanel.
- Keep the current localStorage cart logic as a fallback until the REST API is fully connected to payment and order management.

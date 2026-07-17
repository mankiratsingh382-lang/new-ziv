## Goal
Fix CSP violations blocking loading:
- Hero video: `https://www.zivarr.com/images/IMG_6920.MP4`
- Web manifest: `https://www.zivarr.com/site.webmanifest`

## Information gathered
- `server.js` sets a very restrictive CSP header:
  - `default-src 'none'`
  - allows `img-src` only, but no `media-src` and no `manifest-src`
  - so `media-src` and `manifest` fall back to `default-src 'none'` => blocked.
- `index.html` uses `<link rel="manifest" href="site.webmanifest">` and `<source src="images/IMG_6920.MP4">`.
- `site.webmanifest` exists locally.

## Edit plan (file-by-file)
### 1) `server.js`
Update CSP header string to include:
- `media-src 'self' https:;` (video is a type of media)
- `manifest-src 'self' https:;` (or `manifest-src 'self'` if manifest is always same-origin)
- Optionally `worker-src` / `font-src` remain as-is.

Safer approach:
- Keep current strictness but add the missing directives.

### 2) Optional `index.html`
If production serves assets from `https://www.zivarr.com/` while HTML is loaded from another origin, switch asset URLs to absolute `https://www.zivarr.com/...` or ensure same-origin routing.

### 3) `hero-bg.jpg` 404
Search for `hero-bg.jpg` reference and ensure the file exists in `images/` or update the reference.

## Dependent files to edit
- `server.js` (required)
- Possibly `index.html` and the file referencing `hero-bg.jpg` (optional)

## Followup steps
- Run server locally and verify CSP console errors disappear.
- Load homepage and confirm video + manifest load.


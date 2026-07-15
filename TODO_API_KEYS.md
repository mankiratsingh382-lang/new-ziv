# API Key / Secret Security Checklist

- [x] Added `.env.example` with required variables.
- [x] Removed hardcoded Razorpay credentials from `server.js`.
- [x] Made the app fail fast if `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` is missing.
- [ ] (Next) Ensure you create a local `.env` (not committed) with real values.


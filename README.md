# Nice OS + Nice Studio — Supabase & Vercel Edition v5

Arabic RTL printing/advertising shop and internal visual editor.

- **Production database:** Supabase PostgreSQL via `pg`, parameterized queries and real transactions.
- **Production media:** Supabase Storage, two buckets: `nice-public` (public product/site images) and `nice-private` (private receipts/customer files).
- **Frontend & API:** Vercel static public directory + Node.js serverless function.
- **Local dev:** built-in SQLite (`node:sqlite`) and local uploads if production variables are absent.
- **Owner tools:** Products, square-meter pricing, quantity tiers, quote requests, group orders, Nice Studio.

**[Arabic deployment guide](DEPLOY_SUPABASE_VERCEL_AR.md)** covers the Supabase configuration, Vercel environment variables, bucket access, password and data migration warnings.

### Start locally

Install Node.js 22.5+, run `npm install`, then `npm start`. Without `SUPABASE_DB_URL` local SQLite files are created under `data/` automatically. **Never use local mode on Vercel.**

### Safety

The Supabase database string and secret key must remain on the server, never in any `public/` file or public GitHub repository. Supabase RLS is enabled on the application tables with no public policies. Private payment files are served only through `/private-media/:filename` after Nice admin authentication. Do not treat this release as third-party audited for payment processing; perform a real-cloud end-to-end test before live customer payments. Back up PostgreSQL and both Storage buckets offsite.

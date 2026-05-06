# Monthly Cost Guard Checklist

Run this at the start of each month before paying the Render/Neon invoice.

## 1. Check Neon dashboard (database egress)
- [ ] Log in to https://console.neon.tech and check "Data Transfer" for the month
- [ ] **Alert if > 10 GB** — investigate before paying
- Common causes: a new SELECT * on a blob/text table, a scraper running queries, or a frontend polling loop

## 2. Check Render dashboard (compute + bandwidth)
- [ ] Log in to https://render.com and check "Usage" for the month
- [ ] **Alert if public network transfer > 50 GB** — gzip compression should keep it much lower
- [ ] **Alert if compute > 50 hours** — the server should scale to zero when unused

## 3. Verify gzip compression is active
- [ ] Open the deployed site in browser DevTools → Network tab
- [ ] Click any API response (e.g. `/api/bookings`) and check Response Headers
- [ ] Confirm `Content-Encoding: gzip` is present
- If missing, check that `require('compression')` is still the **first** middleware in `backend/server.js`

## 4. Check for new SELECT * on blob tables
- [ ] Search the codebase for any new `SELECT *` on these high-risk tables:
  - `uploads` (has a `raw_data` column storing full HTML pages — **never** SELECT * in list endpoints)
  - `recipes` (has `instructions`, `ingredients_display` text columns)
  - `kamar_timetable` (full timetable dump, can be large)
- [ ] Run: `grep -rn "SELECT \*" backend/routes/ backend/server.js`
- [ ] Any new `SELECT *` on the above tables should be replaced with named columns

## 5. Check for unintended polling
- [ ] Search frontend JS for any new `setInterval` that calls an API endpoint:
  - `grep -rn "setInterval" backend/public/`
- [ ] Any interval faster than 60 seconds hitting the API is a red flag

## 6. Check raw_data column size in Neon
Run this SQL in Neon console to see how much space raw_data is using:
```sql
SELECT
  COUNT(*) AS total_uploads,
  pg_size_pretty(SUM(octet_length(raw_data))) AS total_raw_data_size,
  pg_size_pretty(AVG(octet_length(raw_data))::bigint) AS avg_raw_data_size
FROM uploads
WHERE raw_data IS NOT NULL;
```
- [ ] If total_raw_data_size > 100 MB, consider clearing old `raw_data` values for processed recipes
  (raw_data is only needed during recipe extraction — once extracted it can be nulled out)

## 7. Optional: Clear stale raw_data after extraction
Once a recipe has been fully extracted (ingredients + instructions saved), the raw HTML is no longer needed.
You can free up space and reduce accidental egress by running:
```sql
-- Null out raw_data for uploads that have a matching processed recipe
UPDATE uploads
SET raw_data = NULL
WHERE id IN (
  SELECT uploaded_recipe_id FROM recipes
  WHERE uploaded_recipe_id IS NOT NULL
    AND ingredients_display IS NOT NULL
);
```
Only run this if you are sure extraction is complete.

---

## What was fixed (history)

| Date | Fix | Impact |
|---|---|---|
| 2026-05-06 | Added gzip compression middleware | Reduces HTML/JSON transfer by ~70% |
| 2026-05-06 | Added 1-day browser cache headers for static files | Eliminates repeat downloads of JS/CSS/images |
| 2026-05-06 | Fixed `GET /api/uploads` to exclude `raw_data` column | Was sending full HTML blobs (~500KB each) on every list page load — likely the main cause of 518 GB egress |
| 2026-05-06 | Fixed `sync-from-uploads` to only SELECT needed columns | Same issue — raw_data was fetched unnecessarily |
| 2026-05-06 | Upgraded nodemailer (SMTP injection CVEs) | Security fix |
| 2026-05-06 | Fixed basic-ftp, path-to-regexp, ip-address, qs | Security fixes |

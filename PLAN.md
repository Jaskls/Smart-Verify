# Smart-Verify: Development Roadmap

Smart-Verify is built in seven stages, **in order**. Each stage is finished and
tested before the next one starts.

Technology is limited to **HTML, CSS, vanilla JavaScript and Supabase**. It's
hosted on Netlify and deployed from GitHub. There are no frameworks, no
TypeScript and no build step.

| Stage | What it delivers | Status |
| ----- | ---------------- | ------ |
| 1 | Basic HTML / CSS / JS interface with sample data | ✅ Built, waiting for your testing |
| 2 | Supabase connection, database tables, Row Level Security, equipment photo storage bucket | ⏭ Next |
| 3 | Real sign-in (Supabase Auth), admin and student roles, protected pages | Planned |
| 4 | Equipment management saved to the database: add / edit / delete, photo upload, quantities, search and filter | Planned |
| 5 | Borrowing saved to the database: due dates, returns, component checklists, transaction history | Planned |
| 6 | QR scanning of student IDs and equipment tags, plus student PIN verification | Planned |
| 7 | Full end-to-end testing and production deploy through Netlify + GitHub | Planned |

---

## Stage 1: Interface ✅
Pages: `index.html` (sign in), `dashboard.html`, `equipment.html`, `borrow.html`,
`history.html`, `student.html`. All data comes from `js/sample-data.js` and
nothing is saved.

## Stage 2: Supabase foundation (next)
- You: create a Supabase project and copy the **Project URL** and **anon (public) key**.
  The anon key is safe in the browser *only because* Row Level Security (RLS) is on.
  The **service-role key must never go in any file in this repo.**
- Add `js/supabase-client.js` that loads `@supabase/supabase-js` from a CDN as an ES module.
- SQL script (`supabase/schema.sql`) that you run in the Supabase SQL editor:
  - `profiles` (id → auth.users, full_name, role `admin|student`, student_no, course, year)
  - `equipment` (tag unique, name, category, location, total_qty, available_qty, condition, photo_path)
  - `equipment_components` (equipment_id, name, sort order)
  - `transactions` (student_id, equipment_id, quantity, borrowed_at, due_at, returned_at, notes, processed_by)
  - `transaction_components` (transaction_id, component name, checked_out, checked_in)
  - check constraints, e.g. `0 <= available_qty <= total_qty`
- RLS policies: admins can read/write everything; students can read equipment
  and only *their own* profile and transactions.
- Storage bucket `equipment-photos`: anyone can read, only admins can upload.
- Test: a small connection check that reads the `equipment` table.

## Stage 3: Authentication and roles
- Sign-in form calls `supabase.auth.signInWithPassword`; sign out; password reset.
- Role read from `profiles.role`; each page checks the session and sends
  students away from admin pages. The **database RLS stays the real protection**.
  The page checks just improve the experience.
- Replace `getPreviewRole()` / `previewStudentId` with the real session.

## Stage 4: Equipment management
- Swap `equipment` sample data for Supabase queries in `equipment.js` and `dashboard.js`.
- Upload photos to the `equipment-photos` bucket. Save the path on the row.
- Search and filter run as database queries.

## Stage 5: Borrowing and returns
- Borrow and return go through Postgres functions (RPC) so the stock count
  and the transaction are updated together and can't drift apart.
- History and the student portal read real transactions.

## Stage 6: QR and PIN
- Browser camera QR scanning (a small vanilla JS QR library from a CDN).
- QR codes on student ID cards and equipment tags.
- Student PIN stored **hashed**, checked by a database function, never sent back to the browser.

## Stage 7: Test and deploy
- A written test checklist for every flow, for both roles.
- Connect the GitHub repo to Netlify, add the Supabase URL and anon key, and deploy.

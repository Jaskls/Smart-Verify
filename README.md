# Smart-Verify

Smart-Verify is a laboratory equipment borrowing app designed to help staff
track equipment from checkout to return. It brings student verification,
equipment checklists, due dates, and transaction history into one interface.

Students sign in with their Student ID and PIN. Staff and administrators sign
in with an approved email and password.

## Features

- **Student portal:** View borrowed equipment and a QR code for student
  identification.
- **Equipment management:** Browse, add, edit, and remove equipment in the
  inventory interface.
- **Borrow and return workflow:** Scan student and equipment QR codes, verify
  items and components, and record due dates and returns.
- **Equipment checklists:** Track individual components so staff can verify
  what is returned.
- **History and dashboard:** Review borrowing activity and see equipment and
  loan summaries.
- **QR stickers:** Create and print QR labels for equipment.
- **Account security:** Student accounts require a verified `@kld.edu.ph`
  email and use a four-digit PIN. Admin accounts require an approved email.

## Current project status

Supabase stores accounts, student PIN credentials, equipment inventory, and
borrow/return transactions. Inventory changes and loan records are shared
between signed-in staff and students. Equipment photo selection is currently a
local preview only; the QR print queue is saved in this browser.
Overdue-loan checks are enforced by the database. Administrators can generate
one-use supervisor codes for an approved exception; those codes are stored and
consumed in Supabase.

Student self-registration checks that the student can verify a `@kld.edu.ph`
email, but it does **not** verify that their entered name or Student ID matches
official school records. Confirm each student's identity and Student ID at
the counter before issuing equipment.

## Technologies

- **HTML, CSS, and vanilla JavaScript** using native ES modules; no build step.
- **Supabase** for authentication, profiles, shared inventory and loans, and
  the student PIN function.
- **Netlify** for static hosting and deployment from GitHub.
- **Browser localStorage** for theme preference and QR print queue.

## Project structure

```text
index.html                         Sign-in and account creation
dashboard.html                     Admin dashboard
equipment.html                     Equipment inventory
borrow.html                        Borrow and return workflow
history.html                       Transaction history
student.html                       Student portal
qr-stickers.html                   QR sticker queue and print preview
qr-sheet.html                      Printable QR sheet
css/styles.css                     Application styles
js/app.js                          Shared layout and UI helpers
js/auth.js                         Profile access and role checks
js/supabase.js                     Supabase client configuration
js/sample-data.js                  Initial UI data shapes and demo fixtures
js/store.js                        Supabase data loading and equipment writes
js/scan.js                         Camera QR scanning
js/qr-queue.js                     Browser-local sticker queue
js/pages/*.js                      Page-specific behavior
supabase-setup.sql                 Supabase account, inventory, and loan schema
supabase/functions/student-pin-auth/index.ts
                                   Student PIN setup and sign-in
netlify.toml                       Static hosting configuration
```

Camera scanning requires HTTPS or localhost and permission to use the camera.
You can also host the static site with Netlify.

## Run locally

JavaScript modules need to be served over HTTP; opening `index.html` directly
with `file://` will not work. From the project folder, run:

```powershell
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Supabase setup

Configure the project URL and publishable key in `js/supabase.js`, then run
the latest `supabase-setup.sql` in the Supabase SQL Editor. This creates and
seeds the example equipment inventory, creates shared loan tables and secure
checkout/return database functions, and updates account policies. Existing
inventory IDs are not overwritten by the seed; adjust the quantities and
details to match the real lab inventory before using it operationally.
The starter rows begin with all listed units available and no loan history;
replace those quantities with an accurate count before real checkouts.

Deploy the updated `student-pin-auth` Edge Function so staff can search
verified student accounts and verify student PINs at checkout:

```powershell
npx.cmd supabase functions deploy student-pin-auth --no-verify-jwt
```

In **Edge Functions → Secrets**, make sure `APP_ORIGINS` includes the exact
site origin (for local testing, such as `http://localhost:8766`) and
`PIN_RATE_LIMIT_SECRET` is set. Keep service-role keys, SMTP credentials, and
other private secrets in Supabase—not in frontend code or GitHub.

Students register with a confirmed KLD email, name, Student ID, and account
password, then create a PIN. Admin emails must be added to the private
`staff_admin_allowlist` before they can create an administrator account.

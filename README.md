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

Supabase is currently used for account authentication and profiles. Equipment,
student, and borrowing records are still sample data saved in the browser;
they are not shared between devices or stored in Supabase. Equipment photos
and the QR print queue are also browser-local.

Student self-registration checks that the student can verify a `@kld.edu.ph`
email, but it does **not** verify that their entered name or Student ID matches
official school records. Do not use the current sample inventory and borrowing
data as a production source of truth.

## Technologies

- **HTML, CSS, and vanilla JavaScript** using native ES modules; no build step.
- **Supabase** for authentication, account profiles, and the student PIN
  function.
- **Netlify** for static hosting and deployment from GitHub.
- **Browser localStorage** for sample inventory changes, transactions, theme
  preference, and QR print queue.

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
js/sample-data.js                  Example inventory, students, and loans
js/store.js                        Browser storage for sample records
js/scan.js                         Camera QR scanning
js/qr-queue.js                     Browser-local sticker queue
js/pages/*.js                      Page-specific behavior
supabase-setup.sql                 Supabase tables, policies, and triggers
supabase/functions/student-pin-auth/index.ts
                                   Student PIN setup and sign-in
netlify.toml                       Static hosting configuration
```

## Run locally

JavaScript modules need to be served over HTTP; opening `index.html` directly
with `file://` will not work. From the project folder, run:

```powershell
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).
## Photos, scanning and offline
- **Equipment photos:** each sample item has a picture in `images/equipment/`. Admins can upload their own
  photo when adding or editing equipment (it is shrunk and saved in the browser). Staff see a large
  photo pop-up and must tap Confirm after scanning a tool, on both borrow and return.
- **Scanner:** `js/scan.js` reads QR codes and common barcodes (Code 128/39, EAN, UPC) with the camera.
- **Borrow timer:** open loans show a live count of how long the tool has been out.
- **Offline:** `sw.js` saves the app on the device so it opens without internet. Borrows and returns are
  saved on the device and listed as waiting to sync, then sync when the connection returns.

## Run it locally
ES modules don't load from `file://`, so serve the folder with any static server:

Camera scanning requires HTTPS or localhost and permission to use the camera.
You can also host the static site with Netlify.

## Supabase setup

To run the app with Supabase authentication, configure the project URL and
publishable key in `js/supabase.js`, run `supabase-setup.sql` in the Supabase
SQL Editor, and deploy the `student-pin-auth` Edge Function. Keep service-role
keys, SMTP credentials, and other private secrets in Supabase—not in frontend
code or GitHub.

Students register with a confirmed KLD email, name, Student ID, and account
password, then create a PIN. Admin emails must be added to the private
`staff_admin_allowlist` before they can create an administrator account.

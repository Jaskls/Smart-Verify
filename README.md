# Smart-Verify

Smart-Verify is a laboratory equipment borrowing system. Administrators check
equipment out to students, record due dates, and verify every component when
items come back. Students see what they've borrowed and when it's due.

**Current stage: 1 of 7. The interface is built and uses sample data.**
See [PLAN.md](PLAN.md) for the full roadmap.

## Technologies
- **HTML, CSS, vanilla JavaScript.** Plain files with no framework and no build step.
  JavaScript uses native ES modules (`<script type="module">`).
- **Supabase** for the database, authentication and photo storage (from Stage 2).
- **Netlify** for hosting, deployed from **GitHub**.

## Project structure
```
index.html          Sign-in page
dashboard.html      Admin overview
equipment.html      Inventory (admin manages, students browse with ?view=student)
borrow.html         Borrow & Return workflow
history.html        Transaction history
student.html        Student portal
qr-stickers.html    Admin QR sticker queue and print preview
css/styles.css      All styles
js/app.js           Shared helpers: sidebar, icons, dates, status tags, toasts
js/sample-data.js   Sample data (replaced by Supabase in later stages)
js/qr-queue.js      Browser-local QR sticker queue
js/pages/*.js       One script per page
netlify.toml        Netlify settings (static site, no build)
```

## QR equipment stickers
Admins can select **Add to QR Print Queue** when creating equipment, print a
single sticker from the equipment list or detail view, or manage a batch from
**QR Stickers** in the sidebar. The queue is stored in this browser's
`localStorage` for the demo; it is not synced to a database. QR codes are
generated in the browser and contain the equipment asset tag.

Transaction history keeps records when a student is removed. Borrower name and
student number are stored with new transactions, and existing records are
backfilled from available student data; when no saved identity is available,
the record is labelled **Former or removed student**.

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

```bash
# Option A: Netlify CLI
netlify dev

# Option B: Python
python3 -m http.server 8000
```
Then open the printed address, for example http://localhost:8000.

## What's left
Stages 2 to 7: the Supabase database and security, real sign-in, saved
equipment, saved loans, QR and PIN verification, then final testing and
deploy. Details are in [PLAN.md](PLAN.md).

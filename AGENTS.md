# AGENTS.md: notes for AI agents working on Smart-Verify

## Hard rules from the owner
- **Only HTML, CSS, vanilla JavaScript and Supabase.** No React, Vue, Angular,
  Next.js, TypeScript, bundlers or frontend frameworks. No build step.
- Use the Supabase JS client (loaded from a CDN as an ES module) for data, auth and storage.
- **Never** put the Supabase service-role key or any secret in browser code.
  Only the project URL and anon key may be used in the browser, and security relies on Row Level Security.
- Work **one stage at a time** in the order in `PLAN.md`. Don't skip ahead.
  After each stage, report the files changed, the setup tasks for the owner, and the tests to run.
- Inspect files before changing them. Preserve the existing design. Explain things simply for a beginner.
- Never claim something works unless it was implemented and tested.

## Architecture
- Multi-page static site. Each `*.html` page loads `js/pages/<page>.js` as a module.
- `js/app.js` provides shared UI: `renderShell()` injects the sidebar and preview banner into
  `<aside id="sidebar">` and `.main`, plus helpers (`escapeHtml`, `statusTag`, `toast`, dialogs).
- `js/sample-data.js` is the **single source of stub data**. Stage 2+ replaces these
  exports with Supabase calls. Keep data access out of the HTML.
- Loan status (active / overdue / returned) is **derived** from dates in `loanStatus()`, not stored.
- Preview role (admin or student) is kept in `sessionStorage` (`getPreviewRole` and `setPreviewRole`).
  This is a Stage 1 placeholder that Stage 3 replaces with the Supabase session.
- Modals use native `<dialog>`. Any element with `data-close` closes its dialog.

## Conventions
- Always pass user-entered text through `escapeHtml()` before using `innerHTML`.
- Design tokens are CSS variables at the top of `css/styles.css`. Fonts are IBM Plex Sans and IBM Plex Mono.
- Monospace (`.mono`, `.code-tag`) is used for IDs, asset tags and quantities.
- Comments are short and plain. The owner is a beginner.

## Continue from
`PLAN.md`: Stage 1 is complete, so the next stage is **Stage 2 (Supabase foundation)**.

# CYBERSTALK Behaviour Pattern Detector

A local demonstration workspace for explainable, defensive cyberstalking behaviour triage. It ships with synthetic observations and does not collect data from real accounts or platforms.

## Included pages
- Secure access (`login.html`)
- Data-driven command dashboard (`dashboard.html`)
- Timestamped report builder (`report.html`)

## Tech stack
- HTML, CSS, and browser JavaScript
- Node.js HTTP server (no external runtime dependencies)
- Explainable weighted risk scoring with deterministic results
- Per-analyst local JSON persistence in `data/db.json`

## Run locally

Install Node.js 18 or newer. From the project folder, run:

```bash
cd "c:\Users\ravin\OneDrive\Desktop\cyberstalking behaviour pattern"
npm start
```

If PowerShell blocks `npm.ps1`, run `npm.cmd start` instead. Keep the terminal open while using the app. Stop the server with Ctrl+C.

Then open:
- http://localhost:8000/ (opens secure access)

The first sign-in with a new email creates a local analyst account. Passwords must contain at least 8 characters. The **Demo access** button uses the local account `demo@cyberstalk.local`.

The pages also work offline: open `login.html` directly when the server is unavailable. Offline users, sessions, analysis, evidence, case updates, and reports are stored in that browser's local storage. Data created offline is separate from the server's `data/db.json` and is not automatically synchronized later.

Run the scoring and input-validation tests with:

```bash
npm test
```

## Backend behavior

- The first valid login creates a local analyst account. Later logins verify the stored password hash.
- Sessions use an HttpOnly cookie and expire after 24 hours.
- `POST /api/analyze` calculates a deterministic score from the submitted observations and saves the result, events, and generated alerts.
- `GET /api/dashboard` returns the current case state and statistics.
- Evidence, alert reviews/resolution, case status, and analyst notes are persisted locally.
- Reports are saved by `POST /api/reports`, listed with `GET /api/reports`, and individually retrieved with `GET /api/reports/:id`.
- `data/db.json` is generated at runtime and ignored by Git.

Risk levels are triage signals only, not evidence of intent or a substitute for investigation. This local demo is not a production service; production deployment requires a managed database, hardened authentication/session storage, HTTPS, CSRF defenses, authorization, audit controls, and a security review.

# CYBERSTALK Behaviour Pattern Detector

A futuristic cybersecurity dashboard prototype for behavioural threat analysis and digital risk monitoring.

## Included pages
- Landing page
- Login screen
- Command dashboard
- Report generation view

## Tech stack
- HTML, CSS, and browser JavaScript
- Node.js HTTP server with cookie sessions
- JSON file persistence in the local `data/` directory

## Run locally

Install Node.js 18 or newer, then run:

```bash
cd "c:\Users\ravin\OneDrive\Desktop\cyberstalking behaviour pattern"
npm start
```

Then open:
- http://localhost:8000/login.html

## Notes
## Backend behavior

- The first valid login creates a local analyst account. Later logins verify the stored password hash.
- Sessions use an HttpOnly cookie and expire after 24 hours.
- Dashboard statistics are served by `GET /api/dashboard`.
- Reports are saved by `POST /api/reports` and can be listed with `GET /api/reports`.
- `data/db.json` is generated at runtime and ignored by Git.

This remains a local demonstration system. It does not connect to real intelligence feeds and should not be used as a production security service without a proper database, password policy, CSRF protection, HTTPS, and authorization model.

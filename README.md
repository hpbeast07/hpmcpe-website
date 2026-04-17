# HPmcpe Website

Static Minecraft server website with a real Node.js backend for:

- account registration
- login and logout
- session restore with `HttpOnly` cookies
- password reset verification
- player data persistence in `data/users.json`

## Project structure

- `index.html`: main page markup
- `style.css`: site styling
- `script.js`: frontend behavior and auth API calls
- `server.js`: backend server and auth API
- `data/users.json`: runtime user database, created automatically

## Requirements

- Node.js 18+ recommended

## Run locally

```powershell
$env:SESSION_SECRET="replace-this-with-a-long-random-secret"
node server.js
```

Then open:

```text
http://localhost:3000
```

## Environment variables

- `PORT`: optional server port, defaults to `3000`
- `SESSION_SECRET`: required for real deployments, used to secure reset tokens and sessions
- `NODE_ENV=production`: enables secure cookie behavior when served over HTTPS

## Data storage

User records are saved in:

```text
data/users.json
```

Each user entry stores:

- `ign`
- `email`
- `passwordHash`
- `registered`
- `lastLogin`

Sessions are kept in memory and reset when the server restarts.

## Auth endpoints

- `GET /api/health`
- `GET /api/auth/lookup?ign=...`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/auth/forgot/verify`
- `POST /api/auth/forgot/reset`

## Production notes

- Replace the default `SESSION_SECRET` before deploying.
- Serve the app behind HTTPS.
- The current reset flow verifies by IGN and email on-site. If you want email reset links, wire in an SMTP provider next.
- Rate limiting is enabled for auth endpoints, but users and sessions are still file and memory based. For larger scale, move to SQLite or PostgreSQL.

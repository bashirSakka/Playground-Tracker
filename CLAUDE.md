# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

There are **two separate servers** that must both be running:

```bash
# Auth + dashboard server (port 5008)
node server.js

# Real-time BLE tracking server (port 3000)
node serverMain.js
```

No build step. No test suite. Dependencies: `npm install`.

## Environment setup

Copy and fill in `.env` at the project root before starting either server:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=tracking_system
DB_PORT=3306
```

`dotenv` is loaded inside `DB/connection.js` — both servers share this module for DB access.

## Architecture

### Two-server design

| Server | File | Port | Responsibility |
|--------|------|------|----------------|
| Auth server | `server.js` | 5008 | Login, session management, serves dashboard HTML |
| Tracking server | `serverMain.js` | 3000 | BLE data ingestion, trilateration, WebSocket broadcasts |

The two servers are **completely independent** — they do not communicate with each other. The auth server guards access to the Home.html dashboard; the tracking server handles all real-time data regardless of auth state.

### Auth server (`server.js`)

- Serves `View/Auth/` as static files and `View/Home/` for the dashboard
- Single route: `POST /Login` → `Controller/AuthController.js` → queries `user_admin` table → sets `req.session.userId` → redirects to `/home`
- Session store is in-memory (express-session, 1-hour TTL)
- Body parsing: `express.urlencoded` only — form fields are `uname` and `pass`

### Tracking server (`serverMain.js`)

Self-contained — all tracking logic lives in this single file. Key concepts:

**BLE anchors** — 3 fixed receivers at known coordinates:
- A → (0, 3), B → (3, 0), D → (0, 0) forming a triangle over a 3×3 m playground

**Tags** — up to 3 child trackers: `ChildTag_01`, `ChildTag_02`, `ChildTag_03`

**Data flow:**
1. Anchors POST `{ anchorID, tagID, rssi }` to `/anchor-data`
2. RSSI → distance via path-loss model: `10^((txPower − rssi) / (10 × n))`, n=2.7
3. RSSI buffered (window=10) and smoothed before trilateration
4. Position calculated via Cramer's Rule trilateration once all 3 anchors are online for a tag
5. Position buffered (window=5) and smoothed
6. Boundary check: zone X[0–3] Y[0–3] with ±0.3 m margin; 5 consecutive outside readings trigger alert, 3 inside readings clear it
7. State broadcast via WebSocket to all connected browser clients

**WebSocket message types:** `fullState` (on connect), `anchorUpdate`, `alert`, `anchorOffline`

**REST endpoints:** `GET /test` (full state dump), `GET /stats` (per-anchor RSSI statistics)

### Database (`DB/connection.js`)

Uses `mysql2/promise` pool. Always use `await db.query(sql, params)` — callbacks are not supported. Result rows are in `results[0]` after destructuring: `const [results] = await db.query(...)`.

Known tables: `user_admin` (id, username, password).

### Frontend (`View/Home/`)

`Home.js` is the client-side script (~900 lines). It opens a WebSocket to `ws://localhost:3000`, listens for tracking events, and updates the SVG map and UI panels. Child registration calls `POST /api/children`; check-in/out calls `/api/checkin` and `/api/checkout` — these routes must be added to `serverMain.js` to function.

### Views layout

```
View/
  Auth/
    Admin-Login/    ← served by server.js on port 5008
    Parent-Login/   ← static only, no backend route yet
  Home/             ← dashboard, served after login
```

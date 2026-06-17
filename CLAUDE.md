# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

```bash
npm install        # first time only
node server.js     # single server on port 5008
```

For development with auto-restart: `npm run dev` (uses nodemon).

No build step. No test suite.

## Environment setup

`.env` at the project root (never committed):

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=playground_tracker
DB_PORT=3306

TELEGRAM_TOKEN=<bot token>
TELEGRAM_CHAT_ID=<chat id>
```

`dotenv` is loaded once inside `DB/connection.js` — importing that module anywhere in the process loads all env vars. Seed the database with `node seed.js`.

The project runs on **Laragon (MySQL 8.4.3, port 3306)** with `STRICT_TRANS_TABLES` enabled. String values inserted into integer columns, or any strict-mode violation, will throw a 500 — not silently coerce like MariaDB did.

## Architecture

Single server (`server.js`, port 5008) handles everything: auth, REST API, WebSocket, and static files.

### Request flow

```
browser → server.js
              ├── routes/AuthRoutes.js       POST /Login
              ├── Routes/ChildRoutes.js      /api/children, /api/children/:id/sessions
              └── Routes/AnchorRoutes.js     POST /anchor-data, POST /api/checkin, POST /api/checkout
                        └── Tracking/        shared state + business logic
```

### Tracking module (`Tracking/`)

Three files that must be understood together:

- **`config.js`** — all constants: anchor coordinates/txPower, tag IDs, trilateration parameters, boundary dimensions, vote thresholds, offline timeout
- **`state.js`** — in-memory singleton objects: `anchorData` (per-anchor per-tag RSSI/distance/online), `tagState` (per-tag position buffer + zone status), `activeSessions` (checked-in children). **All state is lost on server restart.**
- **`trackingService.js`** — exports `init(server)` which attaches the WebSocket server. Also exports `broadcast`, `rssiToDistance`, `getSmoothedDistance`, `trilaterate`, `checkBoundary` — all used by `AnchorRoutes.js`.

`trackingService.init(server)` is called once in `server.js` immediately after `http.createServer`.

### BLE data pipeline (triggered by `POST /anchor-data`)

1. Anchor POSTs `{ anchorID, tagID, rssi }` — valid IDs defined in `Tracking/config.js`
2. RSSI → distance: `10^((txPower − rssi) / (10 × 2.7))`
3. RSSI buffered (window 10), smoothed average used for trilateration
4. Trilateration via Cramer's Rule using anchors A(0,3), B(3,0), D(0,0)
5. Position buffered (window 5) and smoothed
6. Boundary check: zone X[0–3] Y[0–3] ±0.3 m margin; 5 consecutive outside votes → alert, 3 inside → clear
7. `broadcast({ type: "anchorUpdate" | "alert" })` sent to all WebSocket clients

Anchors are marked offline after 5 s of silence (`OFFLINE_TIMEOUT`), which broadcasts `anchorOffline`.

### WebSocket messages (server → browser)

| type | when |
|------|------|
| `fullState` | on connect — seeds `anchorData`, `tagState`, `checkedIn`, `playTimers` |
| `anchorUpdate` | every BLE packet — includes position + zoneStatus |
| `alert` | boundary vote threshold crossed |
| `anchorOffline` | anchor silent for 5 s |
| `checkin` / `checkout` / `autoCheckout` | session lifecycle |
| `timerTick` | every 1 s while sessions are active |

The browser connects to `ws://` + `location.host` (same origin as the page, port 5008).

### Session lifecycle

`activeSessions` in `Tracking/state.js` is the source of truth for who is currently checked in. On `POST /api/checkin` a record is written to `play_sessions` (DB) and a `checkin` broadcast goes out. On timeout the auto-checkout interval in `trackingService.js` fires, closes the DB record, broadcasts `autoCheckout`, and sends a Telegram alert.

### Frontend (`View/Home/`)

`Home.ejs` is rendered server-side (EJS) and includes partials from `View/Home/partials/`. All client logic is in `Home.js`. Key client-side state objects mirror the server: `tagState`, `anchorState`, `checkedIn`, `checkedOut`, `clientTimers`.

`checkedOut` is **client-side only** — tags moved here on checkout remain on the map (grayed out) until the admin explicitly calls `eraseFromMap()`. The server never knows about this state.

`tagState[tag].zoneStatus.lastSeen` (`{ x, y, timestamp }`) is updated by the server each time a tag is confirmed inside the zone and is sent in both `fullState` and `anchorUpdate`. The UI displays it via `fmtRelative(isoStr)` in the active children list and child detail modal.

### Database tables

- `user_admin` — admin login credentials
- `parents` — father/mother name, phone, emergency phone
- `children` — child profile + `tag_id VARCHAR(50)` (nullable, one of `ChildTag_01/02/03`) + `parent_id`
- `play_sessions` — `child_id`, `check_in` (datetime), `check_out` (datetime, null while active)
- `tags` — exists in schema but is not used by the tracking logic; tag identity comes from `Tracking/config.js`

Always destructure query results: `const [rows] = await db.execute(sql, params)`.

`children.tag_id` is `VARCHAR(50)` — never `INT`. The BLE tag identifiers are strings (`ChildTag_01` etc.) and MySQL 8 strict mode will reject any attempt to store them in an integer column.

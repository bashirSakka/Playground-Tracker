# Playground Guardian

A real-time child tracking system for playgrounds using BLE (Bluetooth Low Energy) trilateration. Staff can check children in and out, monitor their position on a live map, and receive instant alerts if a child exits the safe zone.

---

## Features

- **Live position map** — children's positions updated in real time via WebSocket
- **Check-in / check-out** — only checked-in children appear on the map
- **Boundary alerts** — audio + visual alert when a child leaves the safe zone
- **Play timers** — set a time limit per session; auto check-out when time expires
- **Session history** — view today's check-in/out times per child
- **Admin erase** — checked-out children stay visible (grayed out) until manually removed by admin

---

## Architecture

Two concerns handled by one server (`server.js` on port **5008**):

| Layer | File(s) | Responsibility |
|-------|---------|---------------|
| Auth | `Routes/AuthRoutes.js` | Login, session management |
| Children | `Routes/ChildRoutes.js` | CRUD for child records |
| BLE / Tracking | `Routes/AnchorRoutes.js` + `Tracking/` | Anchor data ingestion, trilateration, WebSocket |
| Frontend | `View/Home/` | Dashboard (EJS + vanilla JS) |

**BLE anchors** — 3 fixed receivers at known coordinates:

```
A (0, 3) ─────── B (3, 0)
     \           /
      D (0, 0)
```

**Data flow:**
1. BLE anchor POSTs `{ anchorID, tagID, rssi }` to `/anchor-data`
2. RSSI → distance via path-loss model (`n = 2.7`)
3. RSSI buffered (window = 10) and smoothed before trilateration
4. Position calculated via Cramer's Rule once all 3 anchors are online
5. Position buffered (window = 5) and smoothed
6. Boundary checked — 5 consecutive outside readings trigger alert, 3 inside clear it
7. State broadcast via WebSocket to all connected dashboard clients

---

## Setup

### Prerequisites
- Node.js 18+
- MySQL 8+

### Install
```bash
npm install
```

### Environment
Create a `.env` file in the project root:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=tracking_system
DB_PORT=3306
```

### Database
Run the seed file to create the required tables:
```bash
node seed.js
```

### Run
```bash
node server.js
```

Open [http://localhost:5008](http://localhost:5008) and log in with your admin credentials.

---

## BLE Anchor Integration

Each physical anchor should POST to `http://<server-ip>:5008/anchor-data` with:
```json
{ "anchorID": "A", "tagID": "ChildTag_01", "rssi": -65 }
```

Valid anchor IDs: `A`, `B`, `D`  
Valid tag IDs: `ChildTag_01`, `ChildTag_02`, `ChildTag_03`

---

## Project Structure

```
├── Controller/        Business logic (auth, children, tags)
├── DB/                MySQL connection pool
├── Model/             (reserved)
├── Routes/            Express routers
├── Tracking/          Shared BLE state, trilateration, WebSocket service
├── Trilateration/     Arduino firmware for anchors
├── View/
│   ├── Auth/          Login page
│   └── Home/          Dashboard (EJS, JS, CSS)
├── server.js          Entry point (port 5008)
└── seed.js            Database setup
```

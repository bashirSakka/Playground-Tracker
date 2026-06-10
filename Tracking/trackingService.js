const WebSocket = require("ws");
const db = require("../DB/connection");
const {
  X_MIN, X_MAX, Y_MIN, Y_MAX,
  BOUNDARY_MARGIN, VOTES_TO_ALERT, VOTES_TO_CLEAR,
  PATH_LOSS_N, RSSI_AVERAGE_WINDOW, OFFLINE_TIMEOUT,
  anchorConfig, TRILAT_ANCHORS, TRACKED_TAGS,
} = require("./config");
const { anchorData, tagState, activeSessions } = require("./state");

let browserClients = [];

function broadcast(data) {
  browserClients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
  });
}

function init(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("[WS] Dashboard connected");
    browserClients.push(ws);

    const now = Date.now();
    const playTimers = {};
    const checkedIn  = {};
    Object.entries(activeSessions).forEach(([tag, s]) => {
      const remainingMs = Math.max(0, s.allowedMs - (now - s.startTime));
      playTimers[tag] = { childName: s.childName, allowedMinutes: s.allowedMs / 60000, remainingMs, checkInTime: s.startTime };
      checkedIn[tag]  = { childName: s.childName, emoji: s.emoji };
    });

    ws.send(JSON.stringify({ type: "fullState", anchorData, tagState, playTimers, checkedIn }));
    ws.on("close", () => {
      browserClients = browserClients.filter((c) => c !== ws);
    });
  });

  // Auto-checkout when play timer expires
  setInterval(() => {
    const now = Date.now();
    Object.entries(activeSessions).forEach(([tagID, s]) => {
      const remainingMs = s.allowedMs - (now - s.startTime);
      if (remainingMs <= 0) {
        const { childName, sessionId } = s;
        delete activeSessions[tagID];
        if (sessionId) {
          db.execute("UPDATE play_sessions SET check_out = NOW() WHERE id = ?", [sessionId])
            .catch((err) => console.error("[autoCheckout] DB error:", err.message));
        }
        broadcast({ type: "autoCheckout", tagID, childName });
      } else {
        broadcast({ type: "timerTick", tagID, childName: s.childName, allowedMinutes: s.allowedMs / 60000, remainingMs, checkInTime: s.startTime });
      }
    });
  }, 1000);

  // Mark anchors offline after OFFLINE_TIMEOUT ms of silence
  setInterval(() => {
    const now = Date.now();
    Object.keys(anchorData).forEach((id) => {
      TRACKED_TAGS.forEach((tag) => {
        const lastSeen = anchorData[id].lastSeen[tag];
        if (anchorData[id].online[tag] && lastSeen && now - lastSeen > OFFLINE_TIMEOUT) {
          console.log(`[OFFLINE] Anchor ${id} — ${tag}`);
          anchorData[id].online[tag]     = false;
          anchorData[id].distance[tag]   = null;
          anchorData[id].rssiBuffer[tag] = [];
          broadcast({ type: "anchorOffline", anchorID: id, tagID: tag });
        }
      });
    });
  }, 5000);
}

function rssiToDistance(rssi, txPower) {
  return Math.pow(10.0, (txPower - rssi) / (10.0 * PATH_LOSS_N));
}

function getSmoothedDistance(anchorID, tagID) {
  const buf = anchorData[anchorID].rssiBuffer[tagID];
  if (buf.length < 3) return anchorData[anchorID].distance[tagID];
  const avgRssi = buf.reduce((a, b) => a + b, 0) / buf.length;
  return rssiToDistance(avgRssi, anchorConfig[anchorID].txPower);
}

function trilaterate(tagID) {
  const ready = TRILAT_ANCHORS.every(
    (id) => anchorData[id].online[tagID] && anchorData[id].distance[tagID] !== null,
  );
  if (!ready) {
    const missing = TRILAT_ANCHORS.filter(
      (id) => !anchorData[id].online[tagID] || anchorData[id].distance[tagID] === null,
    );
    console.log(`  [trilat][${tagID}] Waiting for: ${missing.join(", ")}`);
    return null;
  }

  const xA = anchorData["A"].x, yA = anchorData["A"].y, dA = getSmoothedDistance("A", tagID);
  const xB = anchorData["B"].x, yB = anchorData["B"].y, dB = getSmoothedDistance("B", tagID);
  const xD = anchorData["D"].x, yD = anchorData["D"].y, dD = getSmoothedDistance("D", tagID);

  const a = 2 * (xB - xA), b = 2 * (yB - yA);
  const e = dA * dA - dB * dB - xA * xA + xB * xB - yA * yA + yB * yB;
  const c = 2 * (xD - xA), d = 2 * (yD - yA);
  const f = dA * dA - dD * dD - xA * xA + xD * xD - yA * yA + yD * yD;

  const delta = a * d - b * c;
  if (Math.abs(delta) < 0.0001) {
    console.log(`  [trilat][${tagID}] Singular — anchors collinear`);
    return null;
  }

  return {
    x: parseFloat(((e * d - b * f) / delta).toFixed(3)),
    y: parseFloat(((a * f - e * c) / delta).toFixed(3)),
  };
}

function checkBoundary(tagID, pos) {
  const state      = tagState[tagID];
  const zoneStatus = state.zoneStatus;

  const inside =
    pos.x >= X_MIN - BOUNDARY_MARGIN &&
    pos.x <= X_MAX + BOUNDARY_MARGIN &&
    pos.y >= Y_MIN - BOUNDARY_MARGIN &&
    pos.y <= Y_MAX + BOUNDARY_MARGIN;

  if (!inside) { state.alertVotes++; state.clearVotes = 0; }
  else         { state.clearVotes++; state.alertVotes = 0; }

  let violatedWall = null;
  if (!inside) {
    if      (pos.x < X_MIN - BOUNDARY_MARGIN) violatedWall = "Left wall";
    else if (pos.x > X_MAX + BOUNDARY_MARGIN) violatedWall = "Right wall";
    else if (pos.y < Y_MIN - BOUNDARY_MARGIN) violatedWall = "Bottom wall";
    else if (pos.y > Y_MAX + BOUNDARY_MARGIN) violatedWall = "Top wall";
  }

  console.log(
    `  [check ][${tagID}] X:${pos.x.toFixed(2)} Y:${pos.y.toFixed(2)} | ` +
    `${inside ? "INSIDE " : "OUTSIDE"} | ` +
    `alert:${state.alertVotes} clear:${state.clearVotes}` +
    (violatedWall ? ` | ${violatedWall}` : ""),
  );

  if (!zoneStatus.alertActive && state.alertVotes >= VOTES_TO_ALERT) {
    zoneStatus.alertActive  = true;
    zoneStatus.childInside  = false;
    zoneStatus.triggeredAt  = new Date().toISOString();
    zoneStatus.violatedWall = violatedWall;
    console.log(`\n🚨 [${tagID}] OUTSIDE — ${violatedWall}`);
    broadcast({ type: "alert", status: "OUTSIDE", tagID, position: pos, violatedWall, lastSeen: zoneStatus.lastSeen, zoneStatus });
  }

  if (zoneStatus.alertActive && state.clearVotes >= VOTES_TO_CLEAR) {
    zoneStatus.alertActive  = false;
    zoneStatus.childInside  = true;
    zoneStatus.triggeredAt  = null;
    zoneStatus.violatedWall = null;
    state.alertVotes = 0;
    console.log(`\n✅  [${tagID}] INSIDE — child returned`);
    broadcast({ type: "alert", status: "INSIDE", tagID, position: pos, lastSeen: zoneStatus.lastSeen, zoneStatus });
  }

  if (inside) {
    zoneStatus.lastSeen = { x: pos.x, y: pos.y, timestamp: new Date().toISOString() };
  }
  zoneStatus.position = { x: pos.x, y: pos.y };
}

module.exports = { init, broadcast, rssiToDistance, getSmoothedDistance, trilaterate, checkBoundary };

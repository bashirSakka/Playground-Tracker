const express = require("express");
const router = express.Router();
const db = require("../DB/connection");
const { anchorData, tagState, activeSessions } = require("../Tracking/state");
const { broadcast, rssiToDistance, getSmoothedDistance, trilaterate, checkBoundary } = require("../Tracking/trackingService");
const {
  anchorConfig, TRACKED_TAGS, TRILAT_ANCHORS,
  RSSI_AVERAGE_WINDOW, POSITION_WINDOW,
  X_MIN, X_MAX, Y_MIN, Y_MAX,
  BOUNDARY_MARGIN, VOTES_TO_ALERT, VOTES_TO_CLEAR, PATH_LOSS_N,
} = require("../Tracking/config");

router.post("/anchor-data", (req, res) => {
  const { anchorID, tagID, rssi } = req.body;
  if (!anchorData[anchorID]) return res.sendStatus(400);
  if (!tagState[tagID]) return res.sendStatus(400);
  if (rssi == null) return res.sendStatus(400);

  const txPower = anchorConfig[anchorID].txPower;
  const distance = rssiToDistance(rssi, txPower);
  const anchor = anchorData[anchorID];

  anchor.rssi[tagID] = rssi;
  anchor.distance[tagID] = distance;
  anchor.lastSeen[tagID] = Date.now();
  anchor.online[tagID] = true;

  anchor.rssiBuffer[tagID].push(rssi);
  if (anchor.rssiBuffer[tagID].length > RSSI_AVERAGE_WINDOW) anchor.rssiBuffer[tagID].shift();
  anchor.rssiHistory[tagID].push(rssi);
  if (anchor.rssiHistory[tagID].length > 50) anchor.rssiHistory[tagID].shift();

  console.log(
    `Anchor ${anchorID.padEnd(4)} | ${tagID} | ` +
    `RSSI: ${rssi} dBm | ` +
    `Raw: ${distance.toFixed(2)}m | ` +
    `Smooth: ${getSmoothedDistance(anchorID, tagID).toFixed(2)}m`,
  );

  const pos = trilaterate(tagID);
  const state = tagState[tagID];

  if (pos) {
    state.positionBuffer.push(pos);
    if (state.positionBuffer.length > POSITION_WINDOW) state.positionBuffer.shift();
    const smoothX = state.positionBuffer.reduce((a, b) => a + b.x, 0) / state.positionBuffer.length;
    const smoothY = state.positionBuffer.reduce((a, b) => a + b.y, 0) / state.positionBuffer.length;
    state.position = { x: parseFloat(smoothX.toFixed(3)), y: parseFloat(smoothY.toFixed(3)) };
    console.log(`  [trilat][${tagID}] Raw:(${pos.x},${pos.y}) Smooth:(${state.position.x},${state.position.y})`);
    checkBoundary(tagID, state.position);
  }

  broadcast({
    type: "anchorUpdate",
    anchorID, tagID, rssi,
    distance: parseFloat(distance.toFixed(2)),
    online: true,
    position: state.position,
    zoneStatus: state.zoneStatus,
  });

  res.sendStatus(200);
});

router.get("/test", (req, res) => {
  res.json({
    status: "running",
    config: {
      trilatAnchors: TRILAT_ANCHORS,
      trackedTags: TRACKED_TAGS,
      boundary: `X:[${X_MIN},${X_MAX}] Y:[${Y_MIN},${Y_MAX}]`,
      boundaryMargin: BOUNDARY_MARGIN + "m",
      rssiWindow: RSSI_AVERAGE_WINDOW,
      positionWindow: POSITION_WINDOW,
      votesToAlert: VOTES_TO_ALERT,
      votesToClear: VOTES_TO_CLEAR,
      pathLossN: PATH_LOSS_N,
    },
    anchorData,
    tagState,
  });
});

router.get("/stats", (req, res) => {
  const stats = {};
  Object.keys(anchorData).forEach((id) => {
    stats[id] = {};
    TRACKED_TAGS.forEach((tag) => {
      const h = anchorData[id].rssiHistory[tag];
      if (h.length < 5) { stats[id][tag] = { message: "Not enough data" }; return; }
      const tx = anchorConfig[id].txPower;
      const max = Math.max(...h), min = Math.min(...h);
      const avg = h.reduce((a, b) => a + b, 0) / h.length;
      stats[id][tag] = {
        rssiMax: `${max} dBm → ${rssiToDistance(max, tx).toFixed(2)}m`,
        rssiMin: `${min} dBm → ${rssiToDistance(min, tx).toFixed(2)}m`,
        rssiAvg: `${avg.toFixed(1)} dBm → ${rssiToDistance(avg, tx).toFixed(2)}m`,
        rssiSwing: `${max - min} dBm`,
        currentRaw: anchorData[id].distance[tag]?.toFixed(2) + "m",
        currentSmoothed: getSmoothedDistance(id, tag)?.toFixed(2) + "m",
        bufferSize: anchorData[id].rssiBuffer[tag].length + `/${RSSI_AVERAGE_WINDOW}`,
      };
    });
  });
  res.json({
    perAnchorPerTag: stats,
    tagState,
    boundaryFormula: `INSIDE if: ${X_MIN} ≤ x ≤ ${X_MAX}  AND  ${Y_MIN} ≤ y ≤ ${Y_MAX}`,
  });
});

router.post("/api/checkin", async (req, res) => {
  const { tagID, childId, childName, allowedMinutes, emoji } = req.body;
  if (!tagID || !childName || !childId) return res.status(400).json({ error: "Missing fields" });
  activeSessions[tagID] = {
    childName,
    emoji: emoji || "🧒",
    allowedMs: allowedMinutes * 60000,
    startTime: Date.now(),
    childId,
    sessionId: null,
  };
  try {
    const [result] = await db.execute(
      "INSERT INTO play_sessions (child_id, check_in) VALUES (?, NOW())",
      [childId],
    );
    activeSessions[tagID].sessionId = result.insertId;
  } catch (err) {
    console.error("[checkin] DB error:", err.message);
  }
  broadcast({ type: "checkin", tagID, childName, emoji: activeSessions[tagID].emoji, allowedMinutes, checkInTime: activeSessions[tagID].startTime });
  res.json({ success: true });
});

router.post("/api/checkout", async (req, res) => {
  const { tagID } = req.body;
  if (!activeSessions[tagID]) return res.status(404).json({ error: "Not checked in" });
  const { childName, sessionId } = activeSessions[tagID];
  delete activeSessions[tagID];
  if (sessionId) {
    try {
      await db.execute("UPDATE play_sessions SET check_out = NOW() WHERE id = ?", [sessionId]);
    } catch (err) {
      console.error("[checkout] DB error:", err.message);
    }
  }
  broadcast({ type: "checkout", tagID, childName });
  res.json({ success: true });
});

module.exports = router;

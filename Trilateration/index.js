// const express = require("express");
// const WebSocket = require("ws");
// const http = require("http");

// const app = express();
// const server = http.createServer(app);
// const wss = new WebSocket.Server({ server });

// app.use(express.static("public"));
// app.use(express.json());

// // ═════════════════════════════════════
// // CONFIGURATION
// // ═════════════════════════════════════
// const DISTANCE_THRESHOLD = 3.5; // corner anchors: above this = far
// const INTERIOR_WEAK_THRESHOLD = 3.0; // interior anchors: above this = weak (child left)
// const VOTES_TO_ALERT = 7; // consecutive "both corner far" readings needed
// const VOTES_TO_CLEAR = 5; // consecutive "not both far" readings to clear
// const PATH_LOSS_N = 2.7;
// const OFFLINE_TIMEOUT = 10000;

// // ═════════════════════════════════════
// // BOUNDARY PAIRS — corner anchors only
// // ═════════════════════════════════════
// const BOUNDARY_PAIRS = {
//   bottom: { anchors: ["A", "B"], label: "Top wall" },
//   top: { anchors: ["C", "D"], label: "Bottom wall" },
//   left: { anchors: ["C", "A"], label: "Left wall" },
//   right: { anchors: ["D", "B"], label: "Right wall" },
// };

// // ═════════════════════════════════════
// // ANCHOR CONFIG
// //
// //  A (0,3) ──────── B (3,3)
// //    |    in_1(2,2)     |
// //    |    in_2(2,1)     |
// //  C (0,0) ──────── D (3,0)
// //
// // type: "boundary" → used in pair voting
// // type: "interior" → used as confirmation gate
// // ═════════════════════════════════════
// const anchorConfig = {
//   A: { x: 0, y: 0, txPower: -74, type: "boundary" },
//   B: { x: 3, y: 0, txPower: -73, type: "boundary" },
//   C: { x: 0, y: 3, txPower: -74, type: "boundary" },
//   D: { x: 3, y: 3, txPower: -73, type: "boundary" },
//   in_1: { x: 2, y: 2, txPower: -74, type: "interior" },
//   in_2: { x: 2, y: 1, txPower: -74, type: "interior" },
// };

// // ═════════════════════════════════════
// // STATE
// // ═════════════════════════════════════
// const anchorData = {};
// Object.keys(anchorConfig).forEach((id) => {
//   anchorData[id] = {
//     x: anchorConfig[id].x,
//     y: anchorConfig[id].y,
//     type: anchorConfig[id].type,
//     rssi: null,
//     distance: null,
//     lastSeen: null,
//     online: false,
//     isFar: false,
//   };
// });

// const boundaryState = {};
// Object.keys(BOUNDARY_PAIRS).forEach((name) => {
//   boundaryState[name] = { alertVotes: 0, clearVotes: 0, triggered: false };
// });

// let zoneStatus = {
//   childInside: true,
//   alertActive: false,
//   triggeredBoundaries: [],
//   triggeredLabel: null,
//   triggeredAt: null,
//   interiorConfirmed: false, // true when interior anchors also read weak
//   lastSeen: {
//     boundary: null,
//     label: null,
//     anchorA: null,
//     anchorB: null,
//     distA: null,
//     distB: null,
//     timestamp: null,
//   },
// };

// const rssiHistory = {};
// Object.keys(anchorConfig).forEach((id) => {
//   rssiHistory[id] = [];
// });

// let browserClients = [];

// // ═════════════════════════════════════
// // WEBSOCKET
// // ═════════════════════════════════════
// wss.on("connection", (ws) => {
//   console.log("[WS] Dashboard connected");
//   browserClients.push(ws);
//   ws.send(JSON.stringify({ type: "fullState", anchorData, zoneStatus }));
//   ws.on("close", () => {
//     browserClients = browserClients.filter((c) => c !== ws);
//   });
// });

// function broadcast(data) {
//   browserClients.forEach((c) => {
//     if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
//   });
// }

// // ═════════════════════════════════════
// // RSSI → DISTANCE
// // ═════════════════════════════════════
// function rssiToDistance(rssi, txPower) {
//   return Math.pow(10.0, (txPower - rssi) / (10.0 * PATH_LOSS_N));
// }

// // ═════════════════════════════════════
// // INTERIOR CONFIRMATION CHECK
// //
// // Returns true if AT LEAST ONE interior anchor
// // is online AND reads above INTERIOR_WEAK_THRESHOLD.
// //
// // Logic: if the child has truly left the area,
// // interior anchors lose signal (distance goes high).
// // If they still read strong → child is still inside
// // → corner pair alert was a false alarm → suppress it.
// // ═════════════════════════════════════
// function interiorConfirmsExit() {
//   const interiorAnchors = Object.keys(anchorConfig).filter(
//     (id) => anchorConfig[id].type === "interior",
//   );

//   // If no interior anchors are online → skip confirmation (don't block alert)
//   const onlineInterior = interiorAnchors.filter(
//     (id) => anchorData[id].online && anchorData[id].distance !== null,
//   );
//   if (onlineInterior.length === 0) {
//     console.log(
//       "  [interior] No interior anchors online — confirmation skipped",
//     );
//     return true;
//   }

//   // Check if at least one interior anchor reads weak (child has moved away)
//   const weakInterior = onlineInterior.filter(
//     (id) => anchorData[id].distance > INTERIOR_WEAK_THRESHOLD,
//   );

//   console.log(
//     `  [interior] Online: ${onlineInterior.length} | ` +
//       `Weak: ${weakInterior.length} | ` +
//       onlineInterior
//         .map((id) => `${id}:${anchorData[id].distance.toFixed(2)}m`)
//         .join(" | "),
//   );

//   return weakInterior.length > 0;
// }

// // ═════════════════════════════════════
// // BOUNDARY CHECK
// //
// // TWO-STAGE ALERT:
// //
// //   Stage 1 — Corner pair voting (existing logic):
// //     Both anchors on a wall > DISTANCE_THRESHOLD
// //     for VOTES_TO_ALERT consecutive readings → pair wants to trigger
// //
// //   Stage 2 — Interior confirmation (new):
// //     At least one interior anchor also reads weak
// //     (distance > INTERIOR_WEAK_THRESHOLD)
// //     → confirms child has actually left the area
// //     → alert fires
// //
// //   If corner pair votes but interior anchors still strong
// //   → false alarm suppressed → alert does NOT fire
// //
// // CLEAR: when pair is no longer both far for VOTES_TO_CLEAR readings
// // ═════════════════════════════════════
// function checkBoundaries() {
//   const wasInside = zoneStatus.childInside;

//   // ── Stage 1: Corner pair voting ─────────────────────────
//   for (const [name, pair] of Object.entries(BOUNDARY_PAIRS)) {
//     const [idA, idB] = pair.anchors;
//     const state = boundaryState[name];
//     const ancA = anchorData[idA];
//     const ancB = anchorData[idB];

//     if (!ancA?.online || !ancB?.online) continue;
//     if (ancA.distance === null || ancB.distance === null) continue;

//     const bothFar = ancA.isFar && ancB.isFar;

//     if (bothFar) {
//       state.alertVotes++;
//       state.clearVotes = 0;

//       // Corner pair has enough votes — now check interior confirmation
//       if (!state.triggered && state.alertVotes >= VOTES_TO_ALERT) {
//         if (interiorConfirmsExit()) {
//           state.triggered = true;
//           console.log(`⚠️  TRIGGERED : ${pair.label} (interior confirmed)`);
//           console.log(
//             `   ${idA}: ${ancA.distance.toFixed(2)}m | ${idB}: ${ancB.distance.toFixed(2)}m`,
//           );
//         } else {
//           console.log(
//             `🛡️  SUPPRESSED: ${pair.label} — interior anchors still strong (false alarm blocked)`,
//           );
//           // Reset votes so it needs to re-accumulate
//           state.alertVotes = 0;
//         }
//       }
//     } else {
//       state.clearVotes++;
//       state.alertVotes = 0;

//       if (state.triggered && state.clearVotes >= VOTES_TO_CLEAR) {
//         state.triggered = false;
//         console.log(`✅  CLEARED   : ${pair.label}`);
//       }
//     }

//     console.log(
//       `  [${name.padEnd(6)}] ` +
//         `${idA}:${ancA.distance.toFixed(2)}m${ancA.isFar ? "↑" : " "} | ` +
//         `${idB}:${ancB.distance.toFixed(2)}m${ancB.isFar ? "↑" : " "} | ` +
//         `alert:${state.alertVotes} clear:${state.clearVotes} triggered:${state.triggered}`,
//     );
//   }

//   // ── Overall zone status ──────────────────────────────────
//   const triggeredList = Object.entries(boundaryState)
//     .filter(([, s]) => s.triggered)
//     .map(([n]) => n);
//   const childIsOutside = triggeredList.length > 0;

//   // ── Last-seen (updated while inside) ────────────────────
//   if (!childIsOutside) {
//     let maxCombined = -1,
//       nearestBoundary = null;
//     for (const [name, pair] of Object.entries(BOUNDARY_PAIRS)) {
//       const [idA, idB] = pair.anchors;
//       if (!anchorData[idA]?.online || !anchorData[idB]?.online) continue;
//       if (
//         anchorData[idA].distance === null ||
//         anchorData[idB].distance === null
//       )
//         continue;
//       const combined = anchorData[idA].distance + anchorData[idB].distance;
//       if (combined > maxCombined) {
//         maxCombined = combined;
//         nearestBoundary = name;
//       }
//     }
//     if (nearestBoundary) {
//       const [idA, idB] = BOUNDARY_PAIRS[nearestBoundary].anchors;
//       zoneStatus.lastSeen = {
//         boundary: nearestBoundary,
//         label: BOUNDARY_PAIRS[nearestBoundary].label,
//         anchorA: idA,
//         anchorB: idB,
//         distA: anchorData[idA].distance.toFixed(2) + "m",
//         distB: anchorData[idB].distance.toFixed(2) + "m",
//         timestamp: new Date().toISOString(),
//       };
//     }
//   }

//   // ── Update zone status ───────────────────────────────────
//   zoneStatus.childInside = !childIsOutside;
//   zoneStatus.alertActive = childIsOutside;
//   zoneStatus.triggeredBoundaries = triggeredList;
//   zoneStatus.triggeredLabel =
//     triggeredList.map((n) => BOUNDARY_PAIRS[n].label).join(", ") || null;
//   zoneStatus.interiorConfirmed = childIsOutside;
//   if (childIsOutside && !zoneStatus.triggeredAt)
//     zoneStatus.triggeredAt = new Date().toISOString();
//   if (!childIsOutside) zoneStatus.triggeredAt = null;

//   // ── Broadcast on state change ────────────────────────────
//   if (wasInside && childIsOutside) {
//     console.log(
//       `\n🚨 OUTSIDE — ${zoneStatus.triggeredLabel} | Last seen: ${zoneStatus.lastSeen?.label}\n`,
//     );
//     broadcast({
//       type: "alert",
//       status: "OUTSIDE",
//       label: zoneStatus.triggeredLabel,
//       lastSeen: zoneStatus.lastSeen,
//       zoneStatus,
//     });
//   } else if (!wasInside && !childIsOutside) {
//     console.log(`\n✅  INSIDE — all clear\n`);
//     broadcast({
//       type: "alert",
//       status: "INSIDE",
//       label: null,
//       lastSeen: zoneStatus.lastSeen,
//       zoneStatus,
//     });
//   }
// }

// // ═════════════════════════════════════
// // POST /anchor-data
// // Body: { anchorID, rssi, tagID }
// // ═════════════════════════════════════
// app.post("/anchor-data", (req, res) => {
//   const { anchorID, rssi } = req.body;

//   if (!anchorData[anchorID]) return res.sendStatus(400);
//   if (rssi == null) return res.sendStatus(400);

//   const txPower = anchorConfig[anchorID].txPower;
//   const distance = rssiToDistance(rssi, txPower);
//   const anchor = anchorData[anchorID];

//   anchor.rssi = rssi;
//   anchor.distance = distance;
//   anchor.lastSeen = Date.now();
//   anchor.online = true;

//   // isFar threshold depends on anchor type
//   anchor.isFar =
//     anchorConfig[anchorID].type === "interior"
//       ? distance > INTERIOR_WEAK_THRESHOLD
//       : distance > DISTANCE_THRESHOLD;

//   rssiHistory[anchorID].push(rssi);
//   if (rssiHistory[anchorID].length > 50) rssiHistory[anchorID].shift();

//   console.log(
//     `Anchor ${anchorID.padEnd(4)} | ` +
//       `RSSI: ${rssi} dBm | ` +
//       `Dist: ${distance.toFixed(2)}m | ` +
//       `Type: ${anchor.type} | ` +
//       `Far: ${anchor.isFar ? "YES ↑" : "no"}`,
//   );

//   checkBoundaries();

//   broadcast({
//     type: "anchorUpdate",
//     anchorID,
//     rssi,
//     distance: parseFloat(distance.toFixed(2)),
//     isFar: anchor.isFar,
//     online: true,
//     zoneStatus,
//   });

//   res.sendStatus(200);
// });

// // ═════════════════════════════════════
// // OFFLINE DETECTION
// // ═════════════════════════════════════
// setInterval(() => {
//   const now = Date.now();
//   Object.keys(anchorData).forEach((id) => {
//     const a = anchorData[id];
//     if (a.online && a.lastSeen && now - a.lastSeen > OFFLINE_TIMEOUT) {
//       console.log(`[OFFLINE] Anchor ${id}`);
//       a.online = false;
//       a.isFar = false;
//       a.distance = null;
//       if (anchorConfig[id].type === "boundary") {
//         Object.entries(BOUNDARY_PAIRS).forEach(([name, pair]) => {
//           if (pair.anchors.includes(id)) {
//             boundaryState[name].alertVotes = 0;
//             boundaryState[name].clearVotes = 0;
//             boundaryState[name].triggered = false;
//           }
//         });
//       }
//       broadcast({ type: "anchorOffline", anchorID: id });
//     }
//   });
// }, 5000);

// // ═════════════════════════════════════
// // GET /test
// // ═════════════════════════════════════
// app.get("/test", (req, res) => {
//   res.json({
//     status: "running",
//     config: {
//       DISTANCE_THRESHOLD,
//       INTERIOR_WEAK_THRESHOLD,
//       VOTES_TO_ALERT,
//       VOTES_TO_CLEAR,
//       PATH_LOSS_N,
//     },
//     anchorsOnline: Object.keys(anchorData).filter(
//       (id) => anchorData[id].online,
//     ),
//     anchorData,
//     boundaryState,
//     zoneStatus,
//   });
// });

// // ═════════════════════════════════════
// // GET /stats
// // ═════════════════════════════════════
// app.get("/stats", (req, res) => {
//   const stats = {};
//   Object.keys(rssiHistory).forEach((id) => {
//     const h = rssiHistory[id];
//     if (h.length < 5) {
//       stats[id] = { message: "Not enough data" };
//       return;
//     }
//     const tx = anchorConfig[id].txPower;
//     const max = Math.max(...h),
//       min = Math.min(...h);
//     const avg = h.reduce((a, b) => a + b, 0) / h.length;
//     stats[id] = {
//       type: anchorConfig[id].type,
//       rssiMax: `${max} dBm → ${rssiToDistance(max, tx).toFixed(2)}m`,
//       rssiMin: `${min} dBm → ${rssiToDistance(min, tx).toFixed(2)}m`,
//       rssiAvg: `${avg.toFixed(1)} dBm → ${rssiToDistance(avg, tx).toFixed(2)}m`,
//       rssiSwing: `${max - min} dBm`,
//       currentDistance: anchorData[id].distance?.toFixed(2) + "m",
//       isFar: anchorData[id].isFar,
//       threshold:
//         anchorConfig[id].type === "interior"
//           ? INTERIOR_WEAK_THRESHOLD + "m"
//           : DISTANCE_THRESHOLD + "m",
//     };
//   });
//   res.json({
//     perAnchor: stats,
//     boundaryState,
//     zoneStatus,
//     calibration: [
//       "CORNER anchors — stand at wall edge, note distance, set DISTANCE_THRESHOLD just above it",
//       "INTERIOR anchors — stand at center, note distance, set INTERIOR_WEAK_THRESHOLD just above it",
//     ],
//   });
// });

// // ═════════════════════════════════════
// // START
// // ═════════════════════════════════════
// server.listen(3000, () => {
//   console.log("═══════════════════════════════════════════");
//   console.log("  Playground Guardian                      ");
//   console.log("  http://localhost:3000                    ");
//   console.log(`  Corner threshold  : ${DISTANCE_THRESHOLD}m               `);
//   console.log(
//     `  Interior threshold: ${INTERIOR_WEAK_THRESHOLD}m               `,
//   );
//   console.log(`  Votes to alert    : ${VOTES_TO_ALERT}                    `);
//   console.log(`  Votes to clear    : ${VOTES_TO_CLEAR}                    `);
//   console.log("  Interior confirmation: ACTIVE            ");
//   console.log("═══════════════════════════════════════════");
// });

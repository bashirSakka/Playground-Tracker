const { anchorConfig, TRACKED_TAGS } = require("./config");

const anchorData = {};
Object.keys(anchorConfig).forEach((id) => {
  anchorData[id] = {
    x: anchorConfig[id].x,
    y: anchorConfig[id].y,
    rssi: {},
    distance: {},
    rssiBuffer: {},
    rssiHistory: {},
    lastSeen: {},
    online: {},
  };
  TRACKED_TAGS.forEach((tag) => {
    anchorData[id].rssi[tag] = null;
    anchorData[id].distance[tag] = null;
    anchorData[id].rssiBuffer[tag] = [];
    anchorData[id].rssiHistory[tag] = [];
    anchorData[id].lastSeen[tag] = null;
    anchorData[id].online[tag] = false;
  });
});

const tagState = {};
TRACKED_TAGS.forEach((tag) => {
  tagState[tag] = {
    alertVotes: 0,
    clearVotes: 0,
    positionBuffer: [],
    position: { x: null, y: null },
    zoneStatus: {
      childInside: true,
      alertActive: false,
      triggeredAt: null,
      violatedWall: null,
      position: { x: null, y: null },
      lastSeen: { x: null, y: null, timestamp: null },
    },
  };
});

const activeSessions = {};
// tagID → { childName, emoji, allowedMs, startTime }

module.exports = { anchorData, tagState, activeSessions };

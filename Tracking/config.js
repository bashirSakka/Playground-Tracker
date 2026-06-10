const anchorConfig = {
  A: { x: 0, y: 3, txPower: -74 },
  B: { x: 3, y: 0, txPower: -73 },
  D: { x: 0, y: 0, txPower: -74 },
};

const TRACKED_TAGS    = ["ChildTag_01", "ChildTag_02", "ChildTag_03"];
const TRILAT_ANCHORS  = ["A", "B", "D"];
const RSSI_AVERAGE_WINDOW = 10;
const POSITION_WINDOW     = 5;
const X_MIN = 0, X_MAX = 3;
const Y_MIN = 0, Y_MAX = 3;
const BOUNDARY_MARGIN = 0.3;
const VOTES_TO_ALERT  = 5;
const VOTES_TO_CLEAR  = 3;
const PATH_LOSS_N     = 2.7;
const OFFLINE_TIMEOUT = 5000;

module.exports = {
  anchorConfig, TRACKED_TAGS, TRILAT_ANCHORS,
  RSSI_AVERAGE_WINDOW, POSITION_WINDOW,
  X_MIN, X_MAX, Y_MIN, Y_MAX,
  BOUNDARY_MARGIN, VOTES_TO_ALERT, VOTES_TO_CLEAR,
  PATH_LOSS_N, OFFLINE_TIMEOUT,
};

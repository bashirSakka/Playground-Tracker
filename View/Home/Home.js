// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TRACKED_TAGS = ["ChildTag_01", "ChildTag_02", "ChildTag_03"];
const ANCHORS = ["A", "B", "D"];

// Map coordinate → SVG pixel
// Zone: 0-3m → x: 53-266px, y: 35-235px (y inverted: 0m=bottom=235, 3m=top=35)
function toSVG(x, y) {
  const svgX = 53 + (x / 3) * 213;
  const svgY = 235 - (y / 3) * 200;
  return { x: svgX, y: svgY };
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const tagState = {};
TRACKED_TAGS.forEach((t) => {
  tagState[t] = {
    zoneStatus: {
      childInside: true,
      alertActive: false,
      position: { x: null, y: null },
      lastSeen: { x: null, y: null, timestamp: null },
    },
    online: false,
  };
});

const anchorState = {};
ANCHORS.forEach((id) => {
  anchorState[id] = { online: {}, rssi: {}, distance: {} };
});

// clientTimers: keyed by tagID, stores { childName, checkInTime, allowedMs, remainingMs }
const clientTimers = {};

// checkedIn: tagID → { childName, emoji }
const checkedIn = {};
// checkedOut: tagID → { childName, emoji } — checked out but not yet erased by admin
const checkedOut = {};

// children list from API
let allChildren = [];
let selectedChildId = null;
let muted = false;
let audioCtx = null;
let beeping = false;
let anyAlert = false;

// ─── CLOCK ───────────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

function fmtRelative(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function describePosition(x, y) {
  if (x === null || y === null) return null;
  const NEAR = 0.7;
  const dA = Math.hypot(x - 0, y - 3);
  const dB = Math.hypot(x - 3, y - 0);
  const dD = Math.hypot(x - 0, y - 0);
  if (dA < NEAR) return "Near anchor A";
  if (dB < NEAR) return "Near anchor B";
  if (dD < NEAR) return "Near anchor D";
  const sorted = [{ n: "A", d: dA }, { n: "B", d: dB }, { n: "D", d: dD }]
    .sort((a, b) => a.d - b.d);
  if (sorted[1].d - sorted[0].d < 0.8) return `Between ${sorted[0].n} and ${sorted[1].n}`;
  return `Near ${sorted[0].n} side`;
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function goPage(name) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.getElementById("nav-" + name).classList.add("active");
  const titles = {
    monitor: "Live Monitor",
    children: "Children",
    add: "Add Child",
  };
  document.getElementById("pageTitle").textContent = titles[name] || name;
  if (name === "children") loadChildren();
  if (name === "add") loadFormTags();
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
function initWS() {
  const ws = new WebSocket("ws://" + location.host);
  ws.onopen = () => {
    document.getElementById("wsLed").className = "ws-led on";
    document.getElementById("wsText").textContent = "Connected";
  };
  ws.onclose = () => {
    document.getElementById("wsLed").className = "ws-led";
    document.getElementById("wsText").textContent =
      "Disconnected — retrying...";
    setTimeout(initWS, 3000);
  };
  ws.onmessage = (e) => handleMsg(JSON.parse(e.data));
}

function handleMsg(msg) {
  switch (msg.type) {
    case "fullState":
      if (msg.tagState) {
        Object.keys(msg.tagState).forEach((tag) => {
          if (tagState[tag])
            tagState[tag].zoneStatus = msg.tagState[tag].zoneStatus;
        });
      }
      if (msg.anchorData) {
        Object.keys(msg.anchorData).forEach((id) => {
          if (anchorState[id]) {
            Object.assign(anchorState[id].online, msg.anchorData[id].online);
            Object.assign(anchorState[id].rssi, msg.anchorData[id].rssi);
            Object.assign(
              anchorState[id].distance,
              msg.anchorData[id].distance,
            );
          }
        });
      }
      Object.keys(checkedIn).forEach((k) => delete checkedIn[k]);
      Object.keys(clientTimers).forEach((k) => delete clientTimers[k]);
      if (msg.checkedIn) {
        Object.assign(checkedIn, msg.checkedIn);
      }
      if (msg.playTimers) {
        Object.entries(msg.playTimers).forEach(([tag, t]) => {
          if (t.remainingMs > 0) {
            clientTimers[tag] = {
              childName: t.childName,
              checkInTime: Date.now(),
              allowedMs: t.allowedMinutes * 60000,
              remainingMs: t.remainingMs,
            };
          }
        });
      }
      renderAll();
      break;

    case "anchorUpdate":
      if (anchorState[msg.anchorID] && msg.tagID) {
        anchorState[msg.anchorID].online[msg.tagID] = true;
        anchorState[msg.anchorID].rssi[msg.tagID] = msg.rssi;
        anchorState[msg.anchorID].distance[msg.tagID] = msg.distance;
        tagState[msg.tagID].online = true;
      }
      if (msg.tagID && msg.zoneStatus)
        tagState[msg.tagID].zoneStatus = msg.zoneStatus;
      renderAll();
      break;

    case "anchorOffline":
      if (anchorState[msg.anchorID] && msg.tagID) {
        anchorState[msg.anchorID].online[msg.tagID] = false;
      }
      renderAnchorDots();
      updateStatAnchors();
      break;

    case "alert":
      if (msg.tagID && msg.zoneStatus)
        tagState[msg.tagID].zoneStatus = msg.zoneStatus;
      updateAlertBanner();
      renderActiveList();
      renderTagStatus();
      renderMap();
      updateStats();
      break;

    case "timerTick":
      if (msg.remainingMs > 0) {
        clientTimers[msg.tagID] = {
          childName: msg.childName,
          allowedMs: msg.allowedMinutes * 60000,
          remainingMs: msg.remainingMs,
          checkInTime: Date.now(),
        };
      }
      break;

    case "timeUp":
      showToast(
        "⏰ " + msg.childName + "'s time is up! Auto check-out in 10s.",
      );
      updateAlertBanner(
        "timer",
        "⏰",
        msg.childName + "'s time is up!",
        msg.message,
      );
      if (!muted) beepOnce();
      break;

    case "autoCheckout":
      delete clientTimers[msg.tagID];
      if (checkedIn[msg.tagID]) checkedOut[msg.tagID] = checkedIn[msg.tagID];
      delete checkedIn[msg.tagID];
      showToast("🔴 " + msg.childName + " auto checked out.");
      renderActiveList();
      renderMap();
      updateStats();
      updateAlertBanner();
      break;

    case "checkin":
      checkedIn[msg.tagID] = {
        childName: msg.childName,
        emoji: msg.emoji || "🧒",
      };
      clientTimers[msg.tagID] = {
        childName: msg.childName,
        allowedMs: msg.allowedMinutes * 60000,
        remainingMs: msg.allowedMinutes * 60000,
        checkInTime: msg.checkInTime,
      };
      renderActiveList();
      updateStats();
      showToast(
        "✅ " +
          msg.childName +
          " checked in for " +
          msg.allowedMinutes +
          " min",
      );
      break;

    case "checkout":
      delete clientTimers[msg.tagID];
      if (checkedIn[msg.tagID]) checkedOut[msg.tagID] = checkedIn[msg.tagID];
      delete checkedIn[msg.tagID];
      renderActiveList();
      renderMap();
      updateStats();
      showToast("🔵 " + msg.childName + " checked out.");
      break;
  }
}

// ─── RENDER ALL ──────────────────────────────────────────────────────────────
function renderAll() {
  renderActiveList();
  renderAnchorDots();
  renderTagStatus();
  renderMap();
  updateStats();
  updateAlertBanner();
  updateStatAnchors();
}

// ─── ACTIVE LIST ─────────────────────────────────────────────────────────────
function renderActiveList() {
  const el = document.getElementById("activeList");
  const entries = Object.entries(checkedIn);
  if (!entries.length) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px">No children checked in</div>`;
    return;
  }
  el.innerHTML = entries
    .map(([tagID, info]) => {
      const zone = tagState[tagID]?.zoneStatus;
      const inside = zone?.childInside !== false;
      const timer = clientTimers[tagID];
      let timerHTML = "";
      if (timer) {
        const rem = Math.max(
          0,
          timer.remainingMs - (Date.now() - timer.checkInTime),
        );
        const m = Math.floor(rem / 60000);
        const s = Math.floor((rem % 60000) / 1000);
        const cls = rem <= 0 ? "expired" : rem <= 5 * 60000 ? "warn" : "";
        const txt =
          rem <= 0
            ? "Time up"
            : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} left`;
        timerHTML = `<div class="child-timer ${cls}" id="ctimer-${tagID}">${txt}</div>`;
      }
      const child = allChildren.find((c) => c.tag_id === tagID);
      const clickAttr = child
        ? `onclick="openDetail(${child.id})" style="cursor:pointer"`
        : "";
      const ls = zone?.lastSeen;
      const posLabel = ls ? describePosition(ls.x, ls.y) : null;
      const lastSeenHTML = ls?.timestamp
        ? `<div class="last-seen-txt">Last seen ${fmtRelative(ls.timestamp)}${posLabel ? ` · ${posLabel}` : ""}</div>`
        : "";
      return `<div class="child-row" ${clickAttr}>
      <div class="child-avatar">${info.emoji || "🧒"}</div>
      <div class="child-info">
        <div class="child-name">${info.childName}</div>
        ${timerHTML}
        ${lastSeenHTML}
      </div>
      <div class="zone-badge ${inside ? "in" : "out"}" id="zbadge-${tagID}">${inside ? "In" : "Out"}</div>
    </div>`;
    })
    .join("");
}

// ─── TIMER TICK — client-side 1s countdown ───────────────────────────────────
setInterval(() => {
  let mapDirty = false;
  Object.entries(clientTimers).forEach(([tagID, timer]) => {
    const el = document.getElementById("ctimer-" + tagID);
    const rem = Math.max(
      0,
      timer.remainingMs - (Date.now() - timer.checkInTime),
    );
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    const txt =
      rem <= 0
        ? "Time up"
        : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} left`;
    const cls =
      "child-timer" + (rem <= 0 ? " expired" : rem <= 5 * 60000 ? " warn" : "");
    if (el) {
      el.textContent = txt;
      el.className = cls;
    }
    if (rem === 0) mapDirty = true;

    if (currentDetailChild?.tag_id === tagID) {
      const dt = document.getElementById("detailTimerDisplay");
      const dr = document.getElementById("detailTimerRow");
      if (dt) {
        dt.textContent = txt;
        dt.className = cls;
      }
      if (dr) dr.style.display = "flex";
    }
  });
  if (mapDirty) renderMap();
}, 1000);

// ─── ANCHOR DOTS ─────────────────────────────────────────────────────────────
function renderAnchorDots() {
  ANCHORS.forEach((id) => {
    TRACKED_TAGS.forEach((tag, i) => {
      const dot = document.getElementById(`adot-${id}-${i}`);
      if (!dot) return;
      dot.className = "anc-dot" + (anchorState[id]?.online[tag] ? "" : " off");
    });
  });
}

// ─── TAG STATUS LIST ─────────────────────────────────────────────────────────
function renderTagStatus() {
  const el = document.getElementById("tagStatusList");
  el.innerHTML = TRACKED_TAGS.map((tag, i) => {
    const anyOnline = Object.values(anchorState).some((a) => a.online[tag]);
    const zone = tagState[tag]?.zoneStatus;
    const inside = zone?.childInside !== false;
    const cls = anyOnline ? (inside ? "in" : "out") : "off";
    const txt = anyOnline ? (inside ? "In" : "Out") : "—";
    return `<div class="tag-row">
      <div class="tag-dot ${cls}"></div>
      <div class="tag-name">Tag_0${i + 1}</div>
      <div class="tag-badge ${cls}">${txt}</div>
    </div>`;
  }).join("");
}

// ─── MAP ─────────────────────────────────────────────────────────────────────
const TAG_COLORS = ["#16a34a", "#2563eb", "#9333ea"];
const TAG_EMOJIS = ["👦", "👧", "👧"];

function renderMap() {
  const g = document.getElementById("childMarkers");
  g.innerHTML = TRACKED_TAGS.map((tag, i) => {
    if (!checkedIn[tag] && !checkedOut[tag]) return "";
    const pos = tagState[tag]?.zoneStatus?.position;
    if (!pos || pos.x === null) return "";
    const anyOnline = Object.values(anchorState).some((a) => a.online[tag]);
    if (!anyOnline) return "";
    const { x, y } = toSVG(pos.x, pos.y);
    const isCheckedOut = Boolean(checkedOut[tag]);
    const inside = tagState[tag]?.zoneStatus?.childInside !== false;
    const timer = clientTimers[tag];
    const rem = timer
      ? Math.max(0, timer.remainingMs - (Date.now() - timer.checkInTime))
      : null;
    const timeUp = rem !== null && rem === 0;
    const color = isCheckedOut
      ? "#9ca3af"
      : !inside || timeUp
        ? "#dc2626"
        : TAG_COLORS[i];
    const opacity = isCheckedOut ? "0.45" : "0.9";
    const name =
      checkedIn[tag]?.childName ||
      checkedOut[tag]?.childName ||
      tag.replace("ChildTag_", "Tag ");
    const child = allChildren.find((c) => c.tag_id === tag);
    const clickAttr = child
      ? `onclick="openDetail(${child.id})" style="cursor:pointer"`
      : "";
    return `<g ${clickAttr}>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="${color}" opacity="${opacity}"/>
      <text x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle"
        font-size="13" font-family="Outfit,sans-serif" opacity="${opacity}">${checkedIn[tag]?.emoji || checkedOut[tag]?.emoji || TAG_EMOJIS[i]}</text>
      <text x="${x.toFixed(1)}" y="${(y + 27).toFixed(1)}" text-anchor="middle"
        font-size="10" font-weight="600" fill="${color}"
        font-family="Outfit,sans-serif">${name}${isCheckedOut ? " ✓out" : ""}</text>
    </g>`;
  }).join("");
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats() {
  let inside = 0,
    outside = 0,
    active = 0;
  TRACKED_TAGS.forEach((tag) => {
    const anyOnline = Object.values(anchorState).some((a) => a.online[tag]);
    if (!anyOnline) return;
    active++;
    if (tagState[tag]?.zoneStatus?.childInside !== false) inside++;
    else outside++;
  });
  document.getElementById("statIn").textContent = inside;
  document.getElementById("statOut").textContent = outside;
  document.getElementById("statTags").txtContent = active;
}

function updateStatAnchors() {
  const on = ANCHORS.filter((id) =>
    Object.values(anchorState[id]?.online || {}).some((v) => v),
  ).length;
  document.getElementById("statAnc").textContent = `${on}/3`;
}

// ─── ALERT BANNER ────────────────────────────────────────────────────────────
function updateAlertBanner(forceType, forceIco, forceTitle, forceSub) {
  const banner = document.getElementById("alertBanner");
  const ico = document.getElementById("bannerIco");
  const title = document.getElementById("bannerTitle");
  const sub = document.getElementById("bannerSub");
  const mute = document.getElementById("muteBtn");
  const badge = document.getElementById("alertBadge");

  if (forceType) {
    banner.className = "alert-banner " + forceType;
    ico.textContent = forceIco;
    title.textContent = forceTitle;
    sub.textContent = forceSub || "";
    mute.style.display = "inline-block";
    badge.classList.add("show");
    anyAlert = true;
    if (!muted) startBeep();
    return;
  }

  const alerting = TRACKED_TAGS.filter(
    (t) => tagState[t]?.zoneStatus?.alertActive,
  );
  if (alerting.length) {
    anyAlert = true;
    banner.className = "alert-banner danger";
    ico.textContent = "🚨";
    const names = alerting
      .map((t) => checkedIn[t]?.childName || t.replace("ChildTag_", "Tag "))
      .join(", ");
    title.textContent = names + " outside the zone!";
    sub.textContent = "Boundary breach — move to check";
    mute.style.display = "inline-block";
    badge.classList.add("show");
    if (!muted) startBeep();
  } else {
    anyAlert = false;
    banner.className = "alert-banner safe";
    ico.textContent = "✅";
    title.textContent = "All children are inside";
    sub.textContent = "Zone monitoring active — no alerts";
    mute.style.display = "none";
    badge.classList.remove("show");
    stopBeep();
  }
}

// ─── AUDIO ───────────────────────────────────────────────────────────────────
function startBeep() {
  if (!beeping) {
    beeping = true;
    beepOnce();
  }
}
function stopBeep() {
  beeping = false;
}
function beepOnce() {
  if (!beeping || muted) return;
  if (!audioCtx) audioCtx = new AudioContext();
  const play = () => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
    setTimeout(beepOnce, 2000);
  };
  if (audioCtx.state === "suspended") audioCtx.resume().then(play);
  else play();
}
function toggleMute() {
  muted = !muted;
  document.getElementById("muteBtn").textContent = muted
    ? "🔊 Unmute"
    : "🔇 Mute";
  if (!muted && anyAlert) startBeep();
  else stopBeep();
}

// ─── CHECK IN / OUT ──────────────────────────────────────────────────────────
async function doCheckin() {
  const sel = document.getElementById("ciChild");
  const dur = parseInt(document.getElementById("ciDuration").value);
  const val = sel.value;
  if (!val) {
    showToast("Select a child first");
    return;
  }

  const [childId, tagID] = val.split("|");
  const child = allChildren.find((c) => String(c.id) === childId);
  if (!child) return;

  try {
    const r = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tagID,
        childId: child.id,
        childName: child.full_name,
        emoji: child.emoji || "🧒",
        allowedMinutes: dur,
      }),
    });
    if (!r.ok) {
      const e = await r.json();
      showToast("Error: " + e.error);
      return;
    }
    checkedIn[tagID] = {
      childName: child.full_name,
      emoji: child.emoji || "🧒",
    };
    document.getElementById("checkoutBtn").style.display = "block";
  } catch (e) {
    showToast("Server error");
  }
}

async function doCheckout() {
  const sel = document.getElementById("ciChild");
  const val = sel.value;
  if (!val) {
    showToast("Select a child first");
    return;
  }
  const [, tagID] = val.split("|");
  try {
    await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagID }),
    });
  } catch (e) {
    showToast("Server error");
  }
}

// ─── LOAD CHILDREN ───────────────────────────────────────────────────────────
async function loadChildren() {
  try {
    const r = await fetch("/api/children");
    if (!r.ok) return;
    allChildren = await r.json();
    renderChildrenGrid(allChildren);
    populateCheckinDropdown();
  } catch (e) {}
}

function populateCheckinDropdown() {
  const sel = document.getElementById("ciChild");
  sel.innerHTML =
    `<option value="">Select child...</option>` +
    allChildren
      .filter((c) => c.tag_id)
      .map((c) => {
        const label = `${c.full_name} — ${c.tag_id.replace("ChildTag_", "Tag ")}`;
        return `<option value="${c.id}|${c.tag_id}">${label}</option>`;
      })
      .join("");
}

function renderChildrenGrid(list) {
  const grid = document.getElementById("childrenGrid");
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🧒</div><p>No children registered yet.</p></div>`;
    return;
  }
  grid.innerHTML = list
    .map((c) => {
      const age = c.date_of_birth
        ? Math.floor((Date.now() - new Date(c.date_of_birth)) / 31557600000) +
          " yrs"
        : "—";
      return `<div class="child-card" onclick="openDetail(${c.id})">
      <div class="card-avatar">${c.emoji || "🧒"}</div>
      <div class="card-name">${c.full_name}</div>
      <div class="card-age">${age} · ${c.gender || "—"}</div>
      ${c.tag_id ? `<div class="card-tag">📡 ${String(c.tag_id).replace("ChildTag_", "Tag ")}</div>` : ""}
      <div class="card-actions">
        <button class="card-btn edit-btn" onclick="event.stopPropagation(); editChild(${c.id})">Edit</button>
        <button class="card-btn delete-btn" onclick="event.stopPropagation(); deleteChild(${c.id}, '${c.full_name}')">Delete</button>
      </div>
    </div>`;
    })
    .join("");
}

function filterChildren() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  const filtered = allChildren.filter(
    (c) =>
      c.full_name.toLowerCase().includes(q) ||
      c.tag_id?.toString().toLowerCase().includes(q) ||
      c.father_name?.toLowerCase().includes(q) ||
      c.mother_name?.toLowerCase().includes(q),
  );
  renderChildrenGrid(filtered);
}

// ─── DELETE / EDIT CHILD ─────────────────────────────────────────────────────
async function deleteChild(id, name) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    const r = await fetch(`/api/children/${id}`, { method: "DELETE" });
    if (!r.ok) {
      showToast("Failed to delete child");
      return;
    }
    showToast(`${name} deleted`);
    await loadChildren();
  } catch (e) {
    showToast("Server error");
  }
}

function editChild(id) {
  const c = allChildren.find((x) => x.id === id);
  if (!c) return;
  document.getElementById("f_name").value = c.full_name || "";
  document.getElementById("f_dob").value = c.date_of_birth
    ? c.date_of_birth.split("T")[0]
    : "";
  document.getElementById("f_gender").value = c.gender || "";
  document.getElementById("f_notes").value = c.notes || "";
  document.getElementById("f_father").value = c.father_name || "";
  document.getElementById("f_mother").value = c.mother_name || "";
  document.getElementById("f_phone").value = c.phone || "";
  document.getElementById("f_emergency").value = c.emergency_phone || "";
  pickEmoji(c.emoji || "🧒");
  document.getElementById("addChildForm").dataset.editId = id;
  document.querySelector("#addChildForm .btn-primary").textContent =
    "Update child";
  goPage("add");
}

// ─── DETAIL MODAL ────────────────────────────────────────────────────────────
let currentDetailChild = null;

async function openDetail(id) {
  currentDetailChild = allChildren.find((c) => c.id === id);
  if (!currentDetailChild) return;
  const c = currentDetailChild;
  document.getElementById("detailOverlay").classList.add("open");
  document.getElementById("detailAvatar").textContent = c.emoji || "🧒";
  document.getElementById("detailName").textContent = c.full_name;
  const age = c.date_of_birth
    ? Math.floor((Date.now() - new Date(c.date_of_birth)) / 31557600000) +
      " years old"
    : "—";
  document.getElementById("detailAge").textContent = age;
  document.getElementById("detailDob").textContent = c.date_of_birth || "—";
  document.getElementById("detailGender").textContent = c.gender || "—";
  document.getElementById("detailNotes").textContent = c.notes || "—";
  document.getElementById("detailFather").textContent = c.father_name || "—";
  document.getElementById("detailMother").textContent = c.mother_name || "—";
  document.getElementById("detailPhone").textContent = c.phone || "—";
  document.getElementById("detailEmergency").textContent =
    c.emergency_phone || "—";

  const tagEl = document.getElementById("detailTag");
  const tagTxt = document.getElementById("detailTagTxt");
  if (c.tag_id) {
    tagEl.style.display = "inline-block";
    tagTxt.textContent = String(c.tag_id).replace("ChildTag_", "Tag ");
  } else {
    tagEl.style.display = "none";
  }

  const tagID = c.tag_id;
  const isIn = tagID && checkedIn[tagID];
  const isOut = tagID && checkedOut[tagID];
  const status = document.getElementById("detailStatus");
  status.className = "status-pill " + (isIn ? "on" : "off");
  document.getElementById("detailStatusTxt").textContent = isIn
    ? "Checked in"
    : isOut
      ? "Checked out"
      : "Not checked in";
  document.getElementById("detailEraseBtn").style.display = isOut
    ? "inline-block"
    : "none";

  const zonePill = document.getElementById("detailZonePill");
  if (isIn && tagID) {
    zonePill.style.display = "inline-block";
    const inside = tagState[tagID]?.zoneStatus?.childInside !== false;
    zonePill.className = "zone-pill " + (inside ? "inside" : "outside");
    zonePill.textContent = inside ? "Inside zone" : "Outside zone";
  } else {
    zonePill.style.display = "none";
  }

  const lsRow = document.getElementById("detailLastSeen");
  const ls = tagID && tagState[tagID]?.zoneStatus?.lastSeen;
  if (ls?.timestamp) {
    lsRow.style.display = "block";
    const posLabel = describePosition(ls.x, ls.y);
    document.getElementById("detailLastSeenTxt").textContent =
      new Date(ls.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
      " (" + fmtRelative(ls.timestamp) + ")" +
      (posLabel ? ` · ${posLabel}` : "");
  } else {
    lsRow.style.display = "none";
  }

  document.getElementById("detailCheckinBtn").textContent = isIn
    ? "Check out"
    : "Check in";

  const timerRow = document.getElementById("detailTimerRow");
  const timerDisplay = document.getElementById("detailTimerDisplay");
  const timer = tagID ? clientTimers[tagID] : null;
  if (timer) {
    timerRow.style.display = "flex";
    const rem = Math.max(
      0,
      timer.remainingMs - (Date.now() - timer.checkInTime),
    );
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    timerDisplay.textContent =
      rem <= 0
        ? "Time up"
        : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} left`;
    timerDisplay.className =
      "child-timer" + (rem <= 0 ? " expired" : rem <= 5 * 60000 ? " warn" : "");
  } else {
    timerRow.style.display = "none";
  }
}

function closeDetail() {
  document.getElementById("detailOverlay").classList.remove("open");
  currentDetailChild = null;
}

function eraseFromMap() {
  if (!currentDetailChild?.tag_id) return;
  delete checkedOut[currentDetailChild.tag_id];
  renderMap();
  closeDetail();
}

async function toggleCheckin() {
  if (!currentDetailChild) return;
  const c = currentDetailChild;
  if (!c.tag_id) {
    showToast("No tag assigned to this child");
    return;
  }
  try {
    if (checkedIn[c.tag_id]) {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagID: c.tag_id }),
      });
      if (!r.ok) {
        showToast("Checkout failed");
        return;
      }
      // server broadcasts "checkout" → handleMsg clears checkedIn + clientTimers
    } else {
      const mins = 30;
      const r = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagID: c.tag_id,
          childId: c.id,
          childName: c.full_name,
          emoji: c.emoji || "🧒",
          allowedMinutes: mins,
        }),
      });
      if (!r.ok) {
        showToast("Check-in failed");
        return;
      }
      // server broadcasts "checkin" → handleMsg sets checkedIn + clientTimers
    }
  } catch (e) {
    showToast("Server error");
    return;
  }
  closeDetail();
}

// ─── ADD CHILD FORM ──────────────────────────────────────────────────────────
const EMOJIS = [
  "👦",
  "👧",
  "🧒",
  "👼",
  "🌟",
  "🎈",
  "🦁",
  "🐯",
  "🐻",
  "🦊",
  "🐼",
  "🐨",
];
let selectedEmoji = "🧒";
let selectedTag = null;

function initForm() {
  const picker = document.getElementById("formEmojiPicker");
  picker.innerHTML = EMOJIS.map(
    (e) =>
      `<div class="emoji-opt${e === selectedEmoji ? " sel" : ""}" onclick="pickEmoji('${e}')">${e}</div>`,
  ).join("");
}

function pickEmoji(e) {
  selectedEmoji = e;
  loadChildren;
  document.querySelectorAll(".emoji-opt").forEach((el) => {
    el.classList.toggle("sel", el.textContent === e);
  });
}

async function loadFormTags() {
  initForm();
  try {
    const r = await fetch("/api/tags/available");
    if (!r.ok) return;
    const tags = await r.json();
    const sel = document.getElementById("formTagSelector");
    if (!tags.length) {
      sel.innerHTML = `<div style="color:var(--text3);font-size:13px">No unassigned tags</div>`;
      return;
    }
    sel.innerHTML = tags
      .map(
        (t) =>
          `<div class="tag-opt" onclick="pickTag('${t.tag_id}',this)">${t.tag_id.replace("ChildTag_", "Tag ")}</div>`,
      )
      .join("");
  } catch (e) {}
}

function pickTag(id, el) {
  selectedTag = id;
  document
    .querySelectorAll(".tag-opt")
    .forEach((t) => t.classList.remove("sel"));
  el.classList.add("sel");
}

async function submitChild(event) {
  if (event) event.preventDefault();
  const name = document.getElementById("f_name").value.trim();
  const dob = document.getElementById("f_dob").value;
  const phone = document.getElementById("f_phone").value.trim();
  if (!name || !dob || !phone) {
    showToast("Name, DOB and phone are required");
    return;
  }

  const body = {
    full_name: name,
    date_of_birth: dob,
    gender: document.getElementById("f_gender").value,
    notes: document.getElementById("f_notes").value,
    father_name: document.getElementById("f_father").value,
    mother_name: document.getElementById("f_mother").value,
    phone,
    emergency_phone: document.getElementById("f_emergency").value,
    emoji: selectedEmoji,
    tag_id: selectedTag,
  };

  const editId = document.getElementById("addChildForm").dataset.editId;
  const isEdit = !!editId;
  const url = isEdit ? `/api/children/${editId}` : "/api/children";
  const method = isEdit ? "PUT" : "POST";

  try {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      showToast(isEdit ? "Failed to update child" : "Failed to register child");
      return;
    }
    showToast(isEdit ? `✅ ${name} updated!` : `✅ ${name} registered!`);
    resetForm();
    goPage("children");
  } catch (e) {
    showToast("Server error");
  }
}

function resetForm() {
  [
    "f_name",
    "f_dob",
    "f_notes",
    "f_father",
    "f_mother",
    "f_phone",
    "f_emergency",
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("f_gender").value = "";
  selectedEmoji = "🧒";
  selectedTag = null;
  const form = document.getElementById("addChildForm");
  delete form.dataset.editId;
  form.querySelector(".btn-primary").textContent = "Register child";
  initForm();
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("click", () => {
  if (!audioCtx) audioCtx = new AudioContext();
  else if (audioCtx.state === "suspended") audioCtx.resume();
}, { once: true });

initWS();
initForm();
loadChildren();

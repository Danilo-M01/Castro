/* ══════════════════════════════════════
   CASTRO DASHBOARD — dashboard.js
══════════════════════════════════════ */
const loginScreen        = document.getElementById("loginScreen");
const dashboardScreen    = document.getElementById("dashboardScreen");
const incomingOrdersEl   = document.getElementById("incomingOrders");
const activeOrdersEl     = document.getElementById("activeOrders");
const menuAvailabilityList = document.getElementById("menuAvailabilityList");
const categoryBulkActions  = document.getElementById("categoryBulkActions");
const menuSearchInput      = document.getElementById("menuSearch");
const orderHistoryList     = document.getElementById("orderHistoryList");
const socket = io();

let orders       = [];
let menuAvailability = {};
let menuItems    = [];
let menuSearch   = "";
let beepInterval = null;
let continuousBeepCtx = null;
let continuousBeepGain = null;
let muted        = false;
let selectedAcceptOrderId = null;
let selectedRejectOrderId = null;
let reconnectPoll = null;
let orderHistory = [];

// ── New-order chime ──
const chimeAudio   = new Audio("/olivia_parker-chime-alert-demo-309545.mp3");
chimeAudio.preload = "auto";
let isChimePlaying = false;
let knownOrderIds  = null; // null = first load, skip chime on initial state

function playChime() {
  if (muted || isChimePlaying) return;
  isChimePlaying = true;
  chimeAudio.currentTime = 0;
  chimeAudio.play().catch(() => {}); // silently ignore autoplay blocks
  chimeAudio.onended = () => { isChimePlaying = false; };
}


// ── Filters state ──
const filters = { year: String(new Date().getFullYear()), month: "", day: "", item: "" };

function openModal(id)  { document.getElementById(id)?.classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id)?.classList.add("hidden"); }
function closeAllModals(){ ["menuModal","acceptModal","rejectModal"].forEach(closeModal); }

/* ── Audio — ULTRA LOUD alarm (probija muziku) ── */
let continuousBeepOscillators = []; // multiple stacked oscillators

function startContinuousBeep() {
  if (continuousBeepOscillators.length) return; // vec pisti
  if (muted) return;
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return;
  continuousBeepCtx = new Ctx();

  // Compressor - maksimizuje percipiranu glasnocu
  const compressor = continuousBeepCtx.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 0;
  compressor.ratio.value = 20;
  compressor.attack.value = 0;
  compressor.release.value = 0.01;
  compressor.connect(continuousBeepCtx.destination);

  // Master gain - cranked DALEKO iznad maksimuma
  continuousBeepGain = continuousBeepCtx.createGain();
  continuousBeepGain.gain.value = 5.0; // 5x iznad normalnog maksimuma
  continuousBeepGain.connect(compressor);

  // Stack 3 oscilatora na razlicitim frekvencijama za probijajuci zvuk
  const freqs = [1000, 2000, 3000]; // visoke prodorne frekvencije
  freqs.forEach(freq => {
    const osc = continuousBeepCtx.createOscillator();
    const oscGain = continuousBeepCtx.createGain();
    osc.type = "square"; // najostiji talas
    osc.frequency.value = freq;
    oscGain.gain.value = 3.0; // svaki oscilator na 3x
    osc.connect(oscGain);
    oscGain.connect(continuousBeepGain);
    osc.start();
    continuousBeepOscillators.push(osc);
  });
}

function stopContinuousBeep() {
  continuousBeepOscillators.forEach(osc => {
    try { osc.stop(); } catch(_){}
  });
  continuousBeepOscillators = [];
  if (continuousBeepCtx) {
    try { continuousBeepCtx.close(); } catch(_){}
    continuousBeepCtx = null;
  }
  continuousBeepGain = null;
}

function fmtTime(ms) {
  const s = Math.max(ms, 0);
  const m = String(Math.floor(s / 60000)).padStart(2,"0");
  const sc = String(Math.floor((s % 60000) / 1000)).padStart(2,"0");
  return `${m}:${sc}`;
}

function timerClass(ms) {
  if (ms <= 30000)  return "urgent-30s";
  if (ms <= 60000)  return "urgent-1m";
  if (ms <= 120000) return "urgent-2m";
  return "";
}
function timerColorClass(ms) {
  if (ms <= 60000) return "t-urgent";
  if (ms <= 120000) return "t-warn";
  return "";
}

function normalizeSearch(v) {
  return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function fuzzyIncludes(text, q) {
  if (!q) return true;
  return normalizeSearch(text).includes(normalizeSearch(q));
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

async function api(path, method="GET", body=null) {
  const r = await fetch(path, { method, headers:{"Content-Type":"application/json"}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Greška");
  return d;
}

async function refreshHistory() {
  try {
    const d = await api("/api/orders/history");
    orderHistory = d.history || [];
    renderHistory();
  } catch(_){}
}

/* ── Stats ── */
function renderStats() {
  const total   = orders.length;
  const pending = orders.filter(o => o.status === "new").length;
  const rev     = orders.filter(o => !["rejected","missed"].includes(o.status))
                        .reduce((a,o) => a + o.items.reduce((s,i) => s + i.qty*(i.price + (i.addons||[]).reduce((as,ad)=>as+ad.price*ad.qty,0)), 0), 0);

  // Missed today — deduplicate across active orders + history
  const today = new Date().toISOString().split("T")[0];
  const missedIds = new Set([
    ...orders.filter(o => o.status === "missed").map(o => o.id),
    ...orderHistory.filter(o => o.status === "missed" && (o.createdAt || o.updatedAt || "").startsWith(today)).map(o => o.id)
  ]);

  document.getElementById("statOrders").textContent  = `${total} porudžbina`;
  document.getElementById("statPending").textContent = `${pending} na čekanju`;
  document.getElementById("statMissed").textContent  = `${missedIds.size} propuštene`;
  document.getElementById("statRevenue").textContent = `${rev.toLocaleString("sr-Latn")} RSD`;
  const inc = orders.filter(o => o.status === "new").length;
  const act = orders.filter(o => ["accepted","preparing","almost_ready","ready"].includes(o.status)).length;
  document.getElementById("incomingCount").textContent = inc;
  document.getElementById("activeCount").textContent   = act;
}

/* ── Incoming ── */
function renderIncoming() {
  const incoming = orders.filter(o => o.status === "new");
  if (!incoming.length) {
    incomingOrdersEl.innerHTML = `<p class="empty-msg">Nema novih porudžbina</p>`;
    document.title = "Castro Dashboard";
    if (beepInterval) { clearInterval(beepInterval); beepInterval = null; }
    stopContinuousBeep();
    return;
  }
  document.title = `🔔 ${incoming.length} novih`;
  incomingOrdersEl.innerHTML = incoming.map(o => {
    const leftMs = Math.max(3*60000 - (Date.now() - new Date(o.createdAt).getTime()), 0);
    const total  = o.items.reduce((s,i) => s + i.qty*(i.price + (i.addons||[]).reduce((as,ad)=>as+ad.price*ad.qty,0)), 0);
    const items  = o.items.map(i => {
      let str = `${i.qty}× ${escapeHtml(i.name)}`;
      if (i.addons && i.addons.length) {
        const addonStr = i.addons.map(a => `${escapeHtml(a.name)}${a.qty > 1 ? ' x'+a.qty : ''}`).join(', ');
        str += `<br><small style="color:#aaa;padding-left:12px;">+ ${addonStr}</small>`;
      }
      return str;
    }).join("<br>");
    const addr   = o.type === "Dostava" && o.address ? `<span>📍 ${escapeHtml(o.address)}</span>` : "";
    const note   = o.note ? `<span>📝 ${escapeHtml(o.note)}</span>` : "";
    return `
    <article class="order-card ${timerClass(leftMs)}">
      <div class="ocard-top">
        <div>
          <div class="ocard-id">${escapeHtml(o.id)}</div>
          <span class="ocard-badge">🔔 NOVA</span>
        </div>
        <div class="ocard-timer ${timerColorClass(leftMs)}">${fmtTime(leftMs)}</div>
      </div>
      <div class="ocard-meta">
        ${o.scheduledTime ? `<span style="background:var(--red);color:#fff;font-weight:bold;border:none;">⏰ ZAKAZANO ZA ${escapeHtml(o.scheduledTime)}</span>` : ""}
        <span>🕐 ${new Date(o.createdAt).toLocaleTimeString("sr-RS")}</span>
        <span>🧑 ${escapeHtml(o.customerName)||"Gost"}</span>
        <span>📞 ${escapeHtml(o.phone)||"-"}</span>
        <span>🛵 ${escapeHtml(o.type)||"Preuzimanje"}</span>
        ${addr}${note}
      </div>
      <div class="ocard-items">${items}</div>
      <div class="ocard-total">${total.toLocaleString("sr-Latn")} RSD</div>
      <div class="ocard-actions">
        <button class="btn-accept" data-accept="${escapeHtml(o.id)}">✓ Prihvati</button>
        <button class="btn-reject" data-reject="${escapeHtml(o.id)}">✗ Odbij</button>
      </div>
    </article>`;
  }).join("");

  // Konstantno pistanje dok ima novih porudzbina
  startContinuousBeep();
}

/* ── Active ── */
function statusLabel(s) {
  return {accepted:"Prihvaćeno",preparing:"U pripremi",almost_ready:"Skoro gotovo",ready:"Spremno!"}[s] || s;
}
function renderActive() {
  const active = orders
    .filter(o => ["accepted","preparing","almost_ready","ready"].includes(o.status))
    .sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt));
  if (!active.length) {
    activeOrdersEl.innerHTML = `<p class="empty-msg">Nema aktivnih porudžbina</p>`;
    return;
  }
  activeOrdersEl.innerHTML = active.map(o => {
    const acc     = o.acceptedAt || o.updatedAt;
    const leftMs  = new Date(acc).getTime() + o.prepMinutes*60000 - Date.now();
    const prog    = Math.max(0, Math.min(100, Math.round(((Date.now()-new Date(acc).getTime())/(o.prepMinutes*60000))*100)));
    const addr    = o.type === "Dostava" && o.address ? `<span>📍 ${escapeHtml(o.address)}</span>` : "";
    return `
    <article class="order-card">
      <div class="ocard-top">
        <div>
          <div class="ocard-id">${escapeHtml(o.id)}</div>
          <span class="ocard-status-badge">${statusLabel(o.status)}</span>
        </div>
        <div class="ocard-timer">${fmtTime(leftMs)}</div>
      </div>
      <div class="ocard-meta">
        ${o.scheduledTime ? `<span style="background:var(--red);color:#fff;font-weight:bold;border:none;">⏰ ZAKAZANO ZA ${escapeHtml(o.scheduledTime)}</span>` : ""}
        <span>🧑 ${escapeHtml(o.customerName)||"Gost"}</span>
        <span>🛵 ${escapeHtml(o.type)||"Preuzimanje"}</span>
        ${addr}
      </div>
      <div class="ocard-prog-wrap">
        <div class="ocard-prog"><div class="ocard-prog-fill" style="width:${prog}%"></div></div>
        <span class="ocard-time-left">${prog}%</span>
      </div>
      <div class="ocard-controls">
        <div class="prep-row">
          <button data-adjust="${escapeHtml(o.id)}" data-delta="-5">−5min</button>
          <input class="prep-input" type="number" min="5" max="240" value="${o.prepMinutes}" data-prep="${escapeHtml(o.id)}">
          <button data-adjust="${escapeHtml(o.id)}" data-delta="5">+5min</button>
        </div>
        <select class="status-select" data-status="${escapeHtml(o.id)}">
          <option value="preparing"    ${["preparing","accepted"].includes(o.status)?"selected":""}>U pripremi</option>
          <option value="almost_ready" ${o.status==="almost_ready"?"selected":""}>Skoro gotovo</option>
          <option value="ready"        ${o.status==="ready"?"selected":""}>${o.type === "Dostava" ? "Spremno za isporuku" : "Spremno za preuzimanje"}</option>
        </select>
      </div>
    </article>`;
  }).join("");
}

/* ── History ── */
function filterHistory() {
  return orderHistory.filter(o => {
    const d = new Date(o.createdAt || o.updatedAt || 0);
    if (filters.year  && d.getFullYear() !== parseInt(filters.year))   return false;
    if (filters.month && (d.getMonth()+1) !== parseInt(filters.month)) return false;
    if (filters.day) {
      const oDay = (o.createdAt||o.updatedAt||"").split("T")[0];
      if (oDay !== filters.day) return false;
    }
    if (filters.item) {
      const match = Array.isArray(o.items) && o.items.some(i => fuzzyIncludes(i.name, filters.item));
      if (!match) return false;
    }
    return true;
  });
}

function renderHistory() {
  if (!orderHistoryList) return;
  const filtered = filterHistory();

  // Stats row
  const statsRow = document.getElementById("historyStatsRow");
  if (statsRow) {
    const totalRev = filtered
      .filter(o => o.status === "completed")
      .reduce((a,o) => a + (Array.isArray(o.items) ? o.items.reduce((s,i) => s+(i.qty||1)*((i.price||0) + (i.addons||[]).reduce((as,ad)=>as+(ad.price||0)*(ad.qty||1),0)),0) : 0), 0);
    const completed = filtered.filter(o => o.status === "completed").length;
    const rejected  = filtered.filter(o => ["rejected","missed"].includes(o.status)).length;
    statsRow.innerHTML = `
      <div class="h-stat"><strong>${filtered.length}</strong>Ukupno</div>
      <div class="h-stat"><strong>${completed}</strong>Završene</div>
      <div class="h-stat"><strong>${rejected}</strong>Odbijene</div>
      <div class="h-stat"><strong>${totalRev.toLocaleString("sr-Latn")} RSD</strong>Promet</div>`;
  }

  if (!filtered.length) {
    orderHistoryList.innerHTML = `<p class="empty-msg">Nema porudžbina za izabrane filtere</p>`;
    return;
  }

  orderHistoryList.innerHTML = filtered.slice(0,60).map(o => {
    const total = Array.isArray(o.items) ? o.items.reduce((s,i) => s+(i.qty||1)*((i.price||0) + (i.addons||[]).reduce((as,ad)=>as+(ad.price||0)*(ad.qty||1),0)),0) : 0;
    const itemsList = Array.isArray(o.items) ? o.items.map(i => {
      let str = `${i.qty}× ${escapeHtml(i.name)}`;
      if (i.addons && i.addons.length) {
        str += ` (+ ${i.addons.map(a => a.name).join(', ')})`;
      }
      return str;
    }).join(", ") : "";
    const createdStr = o.createdAt ? new Date(o.createdAt).toLocaleString("sr-RS") : "—";
    const updatedStr = o.updatedAt ? new Date(o.updatedAt).toLocaleString("sr-RS") : "—";
    const sCls = o.status === "completed" ? "s-completed" : o.status === "rejected" ? "s-rejected" : "s-missed";
    const sLbl = o.status === "completed" ? "Završena" : o.status === "rejected" ? "Odbijena" : "Propuštena";
    return `
    <div class="h-card">
      <div class="h-card-top">
        <span class="h-card-id">${escapeHtml(o.id)}</span>
        <span class="h-card-status ${sCls}">${sLbl}</span>
      </div>
      <div class="h-card-meta">
        <div>🧑 ${escapeHtml(o.customerName)||"Gost"} · ${escapeHtml(o.phone)||"-"}</div>
        <div>🛵 ${escapeHtml(o.type)||"Preuzimanje"}</div>
        <div>📅 ${createdStr}</div>
        <div>✅ ${updatedStr}</div>
      </div>
      <div class="h-card-items">${itemsList}</div>
      <div class="h-card-total">${total.toLocaleString("sr-Latn")} RSD</div>
    </div>`;
  }).join("");
}

/* ── Menu ── */
function renderAvailability() {
  const filtered = menuItems.filter(i => fuzzyIncludes(i.name, menuSearch))
                            .sort((a,b) => a.name.localeCompare(b.name,"sr"));
  menuAvailabilityList.innerHTML = filtered.map(item => {
    const av = menuAvailability[item.name] !== false;
    return `
    <div class="availability-item">
      <div class="item-meta">
        <span class="status-dot ${av?"available":"unavailable"}"></span>
        <span>${item.name}</span>
        <span class="category-tag">${item.category}</span>
      </div>
      <button class="${av?"available":"unavailable"}" data-item="${item.name}" data-toggle="${av?"off":"on"}">
        ${av?"ON":"OFF"}
      </button>
    </div>`;
  }).join("");
}

function renderCategoryBulkActions() {
  const groups = menuItems.reduce((acc,i) => { if(!acc[i.category]) acc[i.category]=[]; acc[i.category].push(i.name); return acc; }, {});
  categoryBulkActions.innerHTML = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b,"sr")).map(([cat,names]) => `
    <div class="category-row">
      <strong>${cat}</strong>
      <div class="group-buttons">
        <button data-category='${JSON.stringify(names)}' data-category-toggle="off">Isključi sve</button>
        <button data-category='${JSON.stringify(names)}' data-category-toggle="on">Uključi sve</button>
      </div>
    </div>`).join("");
}

function renderAll() { renderStats(); renderIncoming(); renderActive(); renderAvailability(); renderHistory(); }

/* ── Socket ── */
/* ── Socket ── */
socket.on("orders:state", p => {
  if (dashboardScreen.classList.contains("hidden")) return;

  const incoming = p.orders || [];

  // Detect genuinely new orders — only trigger chime when we have an established baseline
  if (knownOrderIds !== null) {
    const hasNew = incoming.some(o => o.status === "new" && !knownOrderIds.has(o.id));
    if (hasNew) playChime();
  }

  // Update known IDs set
  knownOrderIds = new Set(incoming.map(o => o.id));

  orders = incoming;
  renderAll();
});
socket.on("menu:availability", p => { menuAvailability = p.menuAvailability||{}; renderAvailability(); });
socket.on("disconnect", () => {
  if (!reconnectPoll) reconnectPoll = setInterval(async () => {
    try { const d = await api("/api/orders"); orders = d.orders||[]; renderAll(); } catch(_){}
  }, 5000);
});
socket.on("connect", () => { if (reconnectPoll){clearInterval(reconnectPoll);reconnectPoll=null;} });

/* ── Timers ── */
setInterval(() => {
  if (dashboardScreen.classList.contains("hidden")) return;
  renderStats(); renderIncoming();
  const focused = document.activeElement;
  if (!focused || (!focused.classList.contains("status-select") && !focused.classList.contains("prep-input")))
    renderActive();
}, 1000);
setInterval(() => {
  if (!dashboardScreen.classList.contains("hidden")) refreshHistory();
}, 30000);

/* ── Click delegation ── */
document.body.addEventListener("click", async e => {
  const t = e.target.closest("[data-accept],[data-reject],[data-item],[data-toggle],[data-category],[data-category-toggle],[data-close-modal],[data-adjust],.t-chip,.confirm-btn--green,.confirm-btn--red,#menuManageBtn,#muteBtn,#logoutBtn,#clearFiltersBtn");
  if (!t) return;

  if (t.dataset.closeModal) closeModal(t.dataset.closeModal);

  if (t.classList.contains("t-chip")) {
    document.querySelectorAll(".t-chip").forEach(c => c.classList.remove("selected"));
    t.classList.add("selected");
    document.getElementById("acceptPrepInput").value = t.dataset.min;
  }

  if (t.dataset.accept) {
    selectedAcceptOrderId = t.dataset.accept;
    document.getElementById("acceptOrderLabel").textContent = `Porudžbina ${t.dataset.accept}`;
    document.querySelectorAll(".t-chip").forEach(c => c.classList.remove("selected"));
    openModal("acceptModal");
  }

  if (t.dataset.reject) {
    selectedRejectOrderId = t.dataset.reject;
    openModal("rejectModal");
  }

  if (t.dataset.item && t.dataset.toggle) {
    await api("/api/menu-availability/item","PATCH",{itemName:t.dataset.item,available:t.dataset.toggle==="on"});
  }

  if (t.dataset.categoryToggle && t.dataset.category) {
    await api("/api/menu-availability/category","PATCH",{items:JSON.parse(t.dataset.category),available:t.dataset.categoryToggle==="on"});
  }

  if (t.dataset.adjust) {
    const o = orders.find(x => x.id === t.dataset.adjust);
    if (o) await api(`/api/orders/${encodeURIComponent(t.dataset.adjust)}`,"PATCH",{prepMinutes:Math.max(5,(o.prepMinutes||20)+Number(t.dataset.delta||0))});
  }

  if (t.id === "menuManageBtn") openModal("menuModal");

  if (t.id === "muteBtn") {
    muted = !muted;
    if (muted) {
      stopContinuousBeep();
    } else if (orders.some(o => o.status === "new")) {
      startContinuousBeep();
    }
    t.innerHTML = muted
      ? `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Bez zvuka`
      : `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Zvuk`;
  }

  if (t.id === "logoutBtn") {
    await api("/api/auth/logout","POST");
    dashboardScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    closeAllModals();
  }

  if (t.id === "clearFiltersBtn") {
    const curYear = String(new Date().getFullYear());
    filters.year=curYear; filters.month=""; filters.day=""; filters.item="";
    document.getElementById("filterYear").value  = curYear;
    document.getElementById("filterMonth").value = "";
    document.getElementById("filterDay").value   = "";
    document.getElementById("filterItem").value  = "";
    renderHistory();
  }

  if (t.id === "confirmAcceptBtn") {
    if (!selectedAcceptOrderId) return;
    const mins = Number(document.getElementById("acceptPrepInput").value||20);
    await api(`/api/orders/${encodeURIComponent(selectedAcceptOrderId)}/accept`,"POST",{prepMinutes:mins});
    await refreshHistory();
    closeModal("acceptModal");
  }

  if (t.id === "confirmRejectBtn") {
    if (!selectedRejectOrderId) return;
    const reason = document.getElementById("rejectReasonOther").value.trim() || document.getElementById("rejectReason").value;
    await api(`/api/orders/${encodeURIComponent(selectedRejectOrderId)}/reject`,"POST",{reason});
    await refreshHistory();
    closeModal("rejectModal");
  }
});

/* ── Change delegation ── */
document.body.addEventListener("change", async e => {
  const prepId   = e.target.dataset.prep;
  const statusId = e.target.dataset.status;
  if (prepId)   await api(`/api/orders/${encodeURIComponent(prepId)}`,"PATCH",{prepMinutes:Number(e.target.value)});
  if (statusId) { await api(`/api/orders/${encodeURIComponent(statusId)}`,"PATCH",{status:e.target.value}); await refreshHistory(); }
});

/* ── Filter listeners ── */
document.getElementById("filterYear").addEventListener("change",  e => { filters.year  = e.target.value; renderHistory(); });
document.getElementById("filterMonth").addEventListener("change", e => { filters.month = e.target.value; renderHistory(); });
document.getElementById("filterDay").addEventListener("change",   e => { filters.day   = e.target.value; renderHistory(); });
document.getElementById("filterItem").addEventListener("input",   e => { filters.item  = e.target.value; renderHistory(); });

/* ── Menu search ── */
menuSearchInput.addEventListener("input", e => { menuSearch = e.target.value||""; renderAvailability(); });

/* ── Keyboard shortcuts ── */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAllModals();
  if (e.key.toLowerCase() === "m" && !e.ctrlKey) openModal("menuModal");
  if (e.ctrlKey && e.key.toLowerCase() === "m") { e.preventDefault(); document.getElementById("muteBtn")?.click(); }
  if (e.key.toLowerCase() === "a") {
    const first = orders.find(o => o.status === "new");
    if (first) { selectedAcceptOrderId = first.id; openModal("acceptModal"); }
  }
  if (e.key.toLowerCase() === "r") {
    const first = orders.find(o => o.status === "new");
    if (first) { selectedRejectOrderId = first.id; openModal("rejectModal"); }
  }
});

/* ── Login ── */
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const pwd = document.getElementById("password").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  try {
    await api("/api/auth/login","POST",{password:pwd});
    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");
    const [od, md] = await Promise.all([api("/api/orders"), api("/api/menu-items")]);
    orders = od.orders||[];
    knownOrderIds = new Set(orders.map(o => o.id));
    menuItems = md.menuItems||[];
    menuAvailability = md.menuAvailability||{};
    await refreshHistory();
    renderCategoryBulkActions();
    renderAll();
  } catch(err) { errEl.textContent = err.message; }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/auth/logout","POST");
  dashboardScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  closeAllModals();
});

/* ── Init ── */
function initYearFilter() {
  const curYear = new Date().getFullYear();
  const sel = document.getElementById("filterYear");
  sel.innerHTML = `<option value="">Sve godine</option>`;
  for (let y = 2025; y <= curYear; y++) {
    sel.innerHTML += `<option value="${y}" ${y === curYear ? "selected" : ""}>${y}</option>`;
  }
  filters.year = String(curYear);
}

(async function init() {
  initYearFilter();
  const auth = await api("/api/auth/me");
  if (!auth.isAuthenticated) return;
  loginScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  const [od, md] = await Promise.all([api("/api/orders"), api("/api/menu-items")]);
  orders = od.orders||[];
  knownOrderIds = new Set(orders.map(o => o.id));
  menuItems = md.menuItems||[];
  menuAvailability = md.menuAvailability||{};
  await refreshHistory();
  renderCategoryBulkActions();
  renderAll();
})();

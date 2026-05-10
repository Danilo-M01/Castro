const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "Castro12@!?poZareVac.";
const SESSION_SECRET = process.env.SESSION_SECRET || "castro-session-secret-change-me";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACCEPT_TIMEOUT_MS = 3 * 60 * 1000;
const COMPLETED_KEEP_MS = 10 * 60 * 1000;

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = supabaseEnabled ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cookieParser());

const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: SESSION_TIMEOUT_MS }
});

app.use(sessionMiddleware);
io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

const orders = [];
const orderHistory = [];
const menuItems = [];
const menuAvailability = {};
let orderCounter = 0; // Sekvencijalni brojač porudžbina
let lastOrderDate = new Date().toISOString().split('T')[0];
let isRestaurantPaused = false; // Za manuelno pauziranje restorana (Što pre)

// Basic in-memory rate limiting for orders
const orderRateLimits = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  const map = {
    new: "new",
    accepted: "accepted",
    preparing: "preparing",
    almost_ready: "almost_ready",
    ready: "ready",
    completed: "completed",
    rejected: "rejected",
    missed: "missed"
  };
  return map[status] || "new";
}

function requireAuth(req, res, next) {
  if (req.session?.isAuthenticated) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function orderPublicView(order) {
  return {
    id: order.id,
    status: order.status,
    prepMinutes: order.prepMinutes,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    updatedAt: order.updatedAt
  };
}

function emitOrders() {
  io.to("admin").emit("orders:state", { orders });
}

function emitMenuAvailability() {
  io.emit("menu:availability", { menuAvailability });
}

function notifyCustomer(order, message) {
  io.to(`order:${order.id}:${order.customerToken}`).emit("order:notification", {
    order: orderPublicView(order),
    message
  });
}

function archiveOrder(order) {
  const existing = orderHistory.find((item) => item.id === order.id);
  if (existing) {
    Object.assign(existing, order);
    return;
  }
  orderHistory.unshift({ ...order });
}

function parseMenu() {
  const html = fs.readFileSync(path.join(__dirname, "meni.html"), "utf-8");
  const categoryLabels = {
    pizze: "Pizze",
    obroci: "Obroci",
    paste: "Paste",
    tortilje: "Tortilje",
    palacinka: "Palacinke",
    salate: "Salate",
    sendvici: "Sendvici",
    dezerti: "Dezerti"
  };
  const sectionRegex = /<section class="cat" id="([^"]+)">([\s\S]*?)<\/section>/g;
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const categoryId = sectionMatch[1];
    const sectionBody = sectionMatch[2];
    const itemRegex = /data-name="([^"]+)"/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(sectionBody)) !== null) {
      const name = itemMatch[1];
      if (!menuItems.some((item) => item.name === name)) {
        menuItems.push({ name, categoryId, category: categoryLabels[categoryId] || categoryId });
      }
      menuAvailability[name] = true;
    }
  }
}

async function upsertOrder(order) {
  if (!supabaseEnabled) return;
  await supabase.from("orders").upsert({
    id: order.id,
    customer_token: order.customerToken,
    customer_name: order.customerName,
    phone: order.phone,
    type: order.type,
    address: order.address,
    note: order.note,
    items: order.items,
    status: order.status,
    prep_minutes: order.prepMinutes,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    accepted_at: order.acceptedAt,
    ready_at: order.readyAt,
    completed_at: order.completedAt,
    rejected_at: order.rejectedAt,
    rejection_reason: order.rejectionReason
  });
}

async function upsertMenu() {
  if (!supabaseEnabled) return;
  const rows = menuItems.map((item) => ({
    name: item.name,
    category_id: item.categoryId,
    category: item.category,
    is_available: menuAvailability[item.name] !== false
  }));
  if (rows.length) {
    await supabase.from("menu_items").upsert(rows, { onConflict: "name" });
  }
}

async function upsertHistory(order) {
  if (!supabaseEnabled) return;
  await supabase.from("order_history").upsert({
    id: order.id,
    customer_name: order.customerName,
    phone: order.phone,
    type: order.type,
    status: order.status,
    items: order.items,
    created_at: order.createdAt,
    updated_at: order.updatedAt
  });
}

async function loadFromSupabase() {
  if (!supabaseEnabled) return;
  const [{ data: dbOrders }, { data: dbMenu }, { data: dbHistory }] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("menu_items").select("*"),
    supabase.from("order_history").select("*").order("updated_at", { ascending: false }).limit(500)
  ]);

  if (Array.isArray(dbOrders)) {
    orders.length = 0;
    dbOrders.forEach((row) => {
      let parsedScheduledTime = null;
      let cleanNote = row.note || "";
      const noteMatch = cleanNote.match(/^\[ZAKAZANO:\s*([^\]]+)\]\s*(.*)$/);
      if (noteMatch) {
        parsedScheduledTime = noteMatch[1];
        cleanNote = noteMatch[2];
      }

      orders.push({
        id: row.id,
        customerToken: row.customer_token,
        customerName: row.customer_name,
        phone: row.phone,
        type: row.type || "Preuzimanje",
        scheduledTime: parsedScheduledTime,
        address: row.address || "",
        note: cleanNote,
        items: row.items || [],
        status: row.status || "new",
        prepMinutes: row.prep_minutes || 20,
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
        acceptedAt: row.accepted_at,
        readyAt: row.ready_at,
        completedAt: row.completed_at,
        rejectedAt: row.rejected_at,
        rejectionReason: row.rejection_reason || ""
      });
    });
    // Inicijalizuj brojač na osnovu najvećeg postojećeg broja za današnji dan
    const today = new Date().toISOString().split('T')[0];
    const dayStr = today.split('-')[2];
    const monthStr = today.split('-')[1];
    const datePrefix = `${dayStr}${monthStr}`;
    dbOrders.forEach((row) => {
      const match = String(row.id || '').match(new RegExp(`^#${datePrefix}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > orderCounter) orderCounter = num;
      }
    });
  }

  if (Array.isArray(dbMenu) && dbMenu.length > 0) {
    // HTML je source of truth za artikle (vec parsirano), baza za availability
    dbMenu.forEach((row) => {
      if (menuItems.some((item) => item.name === row.name)) {
        menuAvailability[row.name] = row.is_available !== false;
      }
    });
    // Upsert kako bi nove stavke iz HTML-a (npr. dodate u kod) otisle u bazu
    await upsertMenu();
  } else {
    await upsertMenu();
  }

  if (Array.isArray(dbHistory)) {
    orderHistory.length = 0;
    dbHistory.forEach((row) => {
      orderHistory.push({
        id: row.id,
        customerName: row.customer_name,
        phone: row.phone,
        type: row.type,
        status: row.status,
        items: row.items || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    });
  }
}

function scheduleAutoMiss(order) {
  setTimeout(async () => {
    const current = orders.find((item) => item.id === order.id);
    if (!current || current.status !== "new") return;
    current.status = "missed";
    current.updatedAt = nowIso();
    archiveOrder(current);
    await Promise.all([upsertOrder(current), upsertHistory(current)]);
    notifyCustomer(current, "Nazalost, porudzbina nije prihvacena na vreme.");
    emitOrders();
  }, ACCEPT_TIMEOUT_MS);
}

// ── Redirect .html → clean URLs ──
const htmlRedirects = {
  "/index.html":     "/home",
  "/meni.html":      "/meni",
  "/dashboard.html": "/admin-dostava",
  "/track.html":     "/"
};
app.use((req, res, next) => {
  const target = htmlRedirects[req.path];
  if (target) return res.redirect(301, target);
  next();
});

// ── Clean URL page routes ──
app.get("/",              (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/home",          (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/meni",          (_, res) => res.sendFile(path.join(__dirname, "meni.html")));
app.get("/admin-dostava", (_, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/dashboard",     (_, res) => res.redirect(301, "/admin-dostava"));
app.get("/admin-dashboard",(_, res) => res.redirect(301, "/admin-dostava"));
app.get("/pozerevac-admin",(_, res) => res.redirect(301, "/admin-dostava"));
app.get("/dashboard.js",  (_, res) => res.sendFile(path.join(__dirname, "dashboard.js")));
app.get("/dashboard.css", (_, res) => res.sendFile(path.join(__dirname, "dashboard.css")));
app.get("/olivia_parker-chime-alert-demo-309545.mp3", (_, res) => res.sendFile(path.join(__dirname, "olivia_parker-chime-alert-demo-309545.mp3")));
app.get("/track/:orderId",(_, res) => res.sendFile(path.join(__dirname, "track.html")));

app.post("/api/auth/login", (req, res) => {
  if ((req.body?.password || "") !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Pogresna lozinka." });
  }
  req.session.isAuthenticated = true;
  return res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => res.json({ isAuthenticated: Boolean(req.session?.isAuthenticated) }));
app.get("/api/menu-availability", (_, res) => res.json({ menuAvailability }));
app.get("/api/menu-items", requireAuth, (_, res) => res.json({ menuItems, menuAvailability }));
app.get("/api/orders", requireAuth, (_, res) => res.json({ orders }));
app.get("/api/orders/history", requireAuth, (_, res) => res.json({ history: orderHistory.slice(0, 500) }));

app.get("/api/track/:orderId", (req, res) => {
  const order = orders.find((item) => item.id === req.params.orderId);
  if (!order || req.query.token !== order.customerToken) {
    return res.status(404).json({ error: "Porudzbina nije pronadjena." });
  }
  return res.json({ order });
});

app.post("/api/orders", async (req, res) => {
  // Rate limiting check
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const nowMs = Date.now();
  const limitData = orderRateLimits.get(ip) || { count: 0, firstOrderAt: nowMs };
  if (nowMs - limitData.firstOrderAt > 15 * 60 * 1000) {
    limitData.count = 1;
    limitData.firstOrderAt = nowMs;
  } else {
    limitData.count += 1;
  }
  orderRateLimits.set(ip, limitData);
  if (limitData.count > 6) {
    return res.status(429).json({ error: "Previše porudžbina u kratkom roku. Molimo pokušajte ponovo kasnije." });
  }

  const { items, customerName, phone, type, scheduledTime, address, note } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Korpa je prazna." });
  const blocked = items.find((item) => menuAvailability[item.name] === false);
  if (blocked) return res.status(409).json({ error: `Artikal "${blocked.name}" trenutno nije na stanju.` });

  // Radno vreme check
  const now = new Date();
  const day = now.getDay();
  const isWeekend = (day === 5 || day === 6);
  const openTime = new Date(now); openTime.setHours(7, 0, 0, 0);
  const closeTime = new Date(now);
  if (isWeekend) closeTime.setHours(23, 59, 59, 999);
  else closeTime.setHours(23, 30, 0, 0);
  const isOpen = now >= openTime && now <= closeTime;

  if (scheduledTime === "asap" && (!isOpen || isRestaurantPaused)) {
    return res.status(400).json({ error: "Restoran trenutno ne prima porudžbine za odmah. Molimo vas da zakažete za kasnije." });
  }

  let finalNote = note || "";
  if (scheduledTime && scheduledTime !== "asap") {
    finalNote = `[ZAKAZANO: ${scheduledTime}] ` + finalNote;
  }

  const todayObj = new Date();
  const todayIso = todayObj.toISOString().split('T')[0];
  if (lastOrderDate !== todayIso) {
    orderCounter = 0;
    lastOrderDate = todayIso;
  }
  
  orderCounter += 1;
  const dayStr = String(todayObj.getDate()).padStart(2, '0');
  const monthStr = String(todayObj.getMonth() + 1).padStart(2, '0');
  const paddedNum = String(orderCounter).padStart(3, '0');
  
  const order = {
    id: `#${dayStr}${monthStr}-${paddedNum}`,
    customerToken: uuidv4(),
    customerName: customerName || null,
    phone: phone || null,
    type: type || "Preuzimanje",
    scheduledTime: scheduledTime && scheduledTime !== "asap" ? scheduledTime : null,
    address: address || "",
    note: finalNote,
    items: items.map((item) => ({ name: item.name, price: Number(item.price) || 0, qty: Number(item.qty) || 1 })),
    status: "new",
    prepMinutes: 20,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    rejectedAt: null,
    rejectionReason: ""
  };

  orders.unshift(order);
  await upsertOrder(order);
  scheduleAutoMiss(order);
  emitOrders();
  return res.json({ ok: true, orderId: order.id, customerToken: order.customerToken, trackUrl: `/track/${order.id}?token=${order.customerToken}` });
});

app.post("/api/orders/:id/accept", requireAuth, async (req, res) => {
  const order = orders.find((item) => item.id === req.params.id);
  if (!order || order.status !== "new") return res.status(400).json({ error: "Porudzbina nije dostupna." });
  order.status = "accepted";
  order.prepMinutes = Math.max(5, Math.min(240, Number(req.body?.prepMinutes) || 20));
  order.acceptedAt = nowIso();
  order.updatedAt = nowIso();
  await upsertOrder(order);
  notifyCustomer(order, `Porudzbina je prihvacena. Procena: ${order.prepMinutes} min.`);
  emitOrders();
  return res.json({ ok: true });
});

app.post("/api/orders/:id/reject", requireAuth, async (req, res) => {
  const order = orders.find((item) => item.id === req.params.id);
  if (!order || order.status !== "new") return res.status(400).json({ error: "Porudzbina nije dostupna." });
  order.status = "rejected";
  order.rejectionReason = String(req.body?.reason || "").trim();
  order.rejectedAt = nowIso();
  order.updatedAt = nowIso();
  archiveOrder(order);
  await Promise.all([upsertOrder(order), upsertHistory(order)]);
  notifyCustomer(order, order.rejectionReason ? `Porudzbina je odbijena. Razlog: ${order.rejectionReason}` : "Porudzbina je odbijena.");
  emitOrders();
  return res.json({ ok: true });
});

app.patch("/api/orders/:id", requireAuth, async (req, res) => {
  const order = orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Porudzbina nije pronadjena." });

  if (typeof req.body?.prepMinutes === "number" && req.body.prepMinutes > 0 && req.body.prepMinutes <= 240) {
    order.prepMinutes = req.body.prepMinutes;
  }
  if (typeof req.body?.status === "string") {
    const normalized = normalizeStatus(req.body.status);
    if (["accepted", "preparing", "almost_ready", "ready", "completed"].includes(normalized)) {
      order.status = normalized;
      if (normalized === "ready") {
        order.readyAt = nowIso();
        order.status = "completed";
        order.completedAt = nowIso();
        notifyCustomer(order, order.type === "Dostava" ? "Porudzbina je spremna za isporuku!" : "Porudzbina je gotova i spremna za preuzimanje. Prijatno!");
        archiveOrder(order);
        await upsertHistory(order);
      } else if (normalized === "almost_ready") {
        notifyCustomer(order, "Porudzbina je skoro spremna.");
      } else if (normalized === "preparing") {
        notifyCustomer(order, "Porudzbina je u pripremi.");
      } else if (normalized === "completed") {
        order.completedAt = nowIso();
        notifyCustomer(order, "Porudzbina je zavrsena. Prijatno!");
        archiveOrder(order);
        await upsertHistory(order);
      }
    }
  }
  order.updatedAt = nowIso();
  await upsertOrder(order);
  emitOrders();
  return res.json({ ok: true });
});

app.patch("/api/menu-availability/item", requireAuth, async (req, res) => {
  if (!req.body?.itemName || typeof req.body?.available !== "boolean") return res.status(400).json({ error: "Neispravan zahtev." });
  menuAvailability[req.body.itemName] = req.body.available;
  await upsertMenu();
  emitMenuAvailability();
  return res.json({ ok: true });
});

app.patch("/api/menu-availability/category", requireAuth, async (req, res) => {
  if (!Array.isArray(req.body?.items) || typeof req.body?.available !== "boolean") return res.status(400).json({ error: "Neispravan zahtev." });
  req.body.items.forEach((itemName) => { menuAvailability[itemName] = req.body.available; });
  await upsertMenu();
  emitMenuAvailability();
  return res.json({ ok: true });
});

app.use(express.static(__dirname));

io.on("connection", (socket) => {
  // Only send sensitive order data to authenticated admin sessions
  if (socket.request.session?.isAuthenticated) {
    socket.join("admin");
    socket.emit("orders:state", { orders });
  }
  socket.emit("menu:availability", { menuAvailability });
  socket.on("order:subscribe", ({ orderId, customerToken }) => {
    if (orderId && customerToken) socket.join(`order:${orderId}:${customerToken}`);
  });
});

setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (let i = orders.length - 1; i >= 0; i -= 1) {
    const order = orders[i];
    const completedAt = order.completedAt ? new Date(order.completedAt).getTime() : 0;
    const createdAt = new Date(order.createdAt).getTime();

    // Remove old completed orders
    if (order.status === "completed" && completedAt && now - completedAt > COMPLETED_KEEP_MS) {
      archiveOrder(order);
      await upsertHistory(order);
      orders.splice(i, 1);
      changed = true;
    }
    // Handle missed orders
    else if (order.status === "new" && now - createdAt > ACCEPT_TIMEOUT_MS) {
      order.status = "missed";
      order.updatedAt = nowIso();
      archiveOrder(order);
      await Promise.all([upsertOrder(order), upsertHistory(order)]);
      notifyCustomer(order, "Restoran nije odgovorio na vreme. Molimo pokušajte ponovo.");
      orders.splice(i, 1);
      changed = true;
    }
  }
  if (changed) emitOrders();
}, 30000);

async function startServer() {
  parseMenu();
  if (supabaseEnabled) {
    await loadFromSupabase();
    console.log("Supabase mode enabled.");
  } else {
    console.log("Supabase env missing. Running in memory mode.");
  }
  server.listen(PORT, () => console.log(`Castro server running on http://localhost:${PORT}`));
}

startServer().catch((error) => {
  console.error("Startup error:", error);
  process.exit(1);
});

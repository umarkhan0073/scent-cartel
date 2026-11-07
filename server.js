"use strict";
require("dotenv").config();
const path = require("path"), crypto = require("crypto");
const express = require("express"), helmet = require("helmet"), rateLimit = require("express-rate-limit");
const cfg = require("./lib/config"), db = require("./lib/db"), mail = require("./lib/mail"), jc = require("./lib/jazzcash");
const { HttpError, sha, safeEq, clean, EMAIL, phone, slugify, genNo, sign, verify } = require("./lib/util");
const { price } = require("./lib/pricing");

const METHODS = { cod: "Cash on Delivery", bank: "Bank Transfer", jazzcash: "JazzCash" };
const ORDER_ST = { new: "Pending confirmation", confirmed: "Confirmed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
const PAY_ST = { pending: "Pending", awaiting_payment: "Awaiting payment", paid: "Paid", failed: "Failed", refunded: "Refunded" };
const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Kashmir"];
const enabled = () => ({ cod: cfg.cod, bank: cfg.bank, jazzcash: cfg.jc.on });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const iso = (d) => (d && d.toDate ? d.toDate() : d instanceof Date ? d : new Date(d)).toISOString();
const pesos = (n) => "PKR " + Number(n).toLocaleString("en-PK");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: {
  "default-src": ["'self'"], "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], "font-src": ["https://fonts.gstatic.com"],
  "img-src": ["'self'", "data:"], "connect-src": ["'self'"],
  "form-action": ["'self'", ...(cfg.jc.on ? [new URL(cfg.jc.url).origin] : [])],
  "frame-ancestors": ["'none'"], "base-uri": ["'self'"], "object-src": ["'none'"] } } }));
app.use(express.json({ limit: "50kb" }));
app.use("/api/pay", express.urlencoded({ extended: false, limit: "50kb" }));
const rl = (min, max, msg) => rateLimit({ windowMs: min * 60000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
app.use("/api", rl(15, 300, "Too many requests. Please slow down."));

function publicOrder(o) {
  const c = o.customer;
  return {
    id: o.orderNo, date: iso(o.createdAt), name: c.name, email: c.email, phone: c.phone,
    addr: [c.addr, c.city, c.prov + (c.zip ? " " + c.zip : "")].join(", "), pay: METHODS[o.payment.method],
    items: o.items.map((l) => ({ n: l.name + " " + l.sz + "ml", q: l.qty, p: l.unit })), t: o.totals,
    status: ORDER_ST[o.status] || o.status, paid: PAY_ST[o.payment.status] || o.payment.status
  };
}

/* ---------- public API ---------- */
app.get("/api/health", (q, r) => r.json({ ok: true }));
app.get("/api/config", (q, r) => r.json({
  shipFee: cfg.shipFee, freeOver: cfg.freeOver, maxQty: cfg.maxQty,
  methods: Object.entries(enabled()).filter(([, on]) => on).map(([id]) => ({ id, label: METHODS[id] }))
}));
app.get("/api/products", h(async (q, r) => {
  const s = await db.collection("products").where("active", "==", true).get();
  r.set("Cache-Control", "public, max-age=60");
  r.json(s.docs.map((d) => d.data()).filter((p) => !p.soldOut).sort((a, b) => a.id - b.id).map((p) => ({ id: p.id, n: p.name, g: p.gender, p5: p.p5, p10: p.p10, slug: p.slug })));
}));

app.post("/api/orders", rl(60, 20, "Too many orders from this connection. Please try again later."), h(async (req, res) => {
  const b = req.body || {};
  const c = { name: clean(b.name, 80), email: clean(b.email, 120).toLowerCase(), phone: phone(b.phone), addr: clean(b.addr, 200), city: clean(b.city, 60), prov: clean(b.prov, 40), zip: clean(b.zip, 10), notes: clean(b.notes, 300) };
  if (c.name.length < 2) throw new HttpError(400, "Enter your full name.");
  if (!EMAIL.test(c.email)) throw new HttpError(400, "Enter a valid email address.");
  if (!c.phone) throw new HttpError(400, "Enter a valid Pakistani mobile number, e.g. +923001234567.");
  if (c.addr.length < 5) throw new HttpError(400, "Enter your house and street.");
  if (c.city.length < 2) throw new HttpError(400, "Enter your city.");
  if (!PROVINCES.includes(c.prov)) throw new HttpError(400, "Select your province.");
  const method = String(b.pay);
  if (!enabled()[method]) throw new HttpError(400, "That payment method is not available.");
  const key = clean(b.key, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new HttpError(400, "Missing request key. Please refresh and try again.");
  const priced = await price(b.items, clean(b.coupon, 30).toUpperCase());
  const token = crypto.randomBytes(24).toString("hex");
  const out = await db.runTransaction(async (t) => {
    const ik = db.collection("idem").doc(key);
    if ((await t.get(ik)).exists) return { dup: (await t.get(ik)).data().orderNo };
    let no, ref;
    for (let i = 0; i < 5; i++) { no = genNo(); ref = db.collection("orders").doc(no); if (!(await t.get(ref)).exists) break; }
    const order = { orderNo: no, tokenHash: sha(token), customer: c, items: priced.lines, totals: priced.totals, coupon: priced.coupon,
      payment: { method, status: method === "jazzcash" ? "awaiting_payment" : "pending", ref: "" }, status: "new", createdAt: new Date() };
    t.create(ref, order); t.create(ik, { orderNo: no, at: new Date() });
    return { order };
  });
  if (out.dup) return res.json({ duplicate: true, id: out.dup });
  const o = out.order;
  const lines = o.items.map((l) => "- " + l.name + " " + l.sz + "ml x" + l.qty + " = " + pesos(l.total)).join("\n");
  const summary = "Order " + o.orderNo + "\n" + lines + "\nSubtotal " + pesos(o.totals.sub) + "\nDiscount -" + pesos(o.totals.disc) + "\nShipping " + pesos(o.totals.ship) + "\nTotal " + pesos(o.totals.total) + "\nPayment: " + METHODS[method];
  mail.send(cfg.mail.owner, "New order " + o.orderNo, summary + "\n\nCustomer: " + c.name + "\n" + c.phone + "\n" + c.email + "\n" + c.addr + ", " + c.city + ", " + c.prov + " " + c.zip + "\nNotes: " + c.notes, c.email);
  mail.send(c.email, "Your Scent Cartel order " + o.orderNo, "Thank you, " + c.name + ".\n\n" + summary + (method === "bank" ? "\n\nBank details:\n" + cfg.bankDetails : ""));
  const body = { id: o.orderNo, token, order: publicOrder(o) };
  if (method === "bank") body.bank = cfg.bankDetails;
  if (method === "jazzcash") body.redirect = jc.build(o);
  res.status(201).json(body);
}));

async function ownedOrder(req) {
  const id = clean(req.params.id, 20), tok = String((req.query.token || (req.body && req.body.token)) || "");
  const s = await db.collection("orders").doc(id).get();
  if (!s.exists || !tok || !safeEq(sha(tok), s.data().tokenHash)) throw new HttpError(404, "Order not found.");
  return s;
}
app.get("/api/orders/:id", h(async (req, res) => { res.json(publicOrder((await ownedOrder(req)).data())); }));
app.post("/api/orders/:id/payment-reference", h(async (req, res) => {
  const s = await ownedOrder(req);
  if (s.data().payment.method !== "bank") throw new HttpError(400, "This order is not a bank transfer.");
  const ref = clean(req.body.reference, 60);
  if (!ref) throw new HttpError(400, "Enter your payment reference.");
  await s.ref.update({ "payment.ref": ref });
  res.json({ ok: true });
}));

/* JazzCash return URL: the ONLY place an online order can become "paid", and only after the hash is verified */
app.post("/api/pay/jazzcash/return", h(async (req, res) => {
  if (!cfg.jc.on) return res.sendStatus(404);
  const f = req.body || {}, ref = String(f.pp_TxnRefNo || "");
  if (!/^TSC[A-Z0-9]{8}$/.test(ref)) return res.redirect("/#/");
  const no = "TSC-" + ref.slice(3), dr = db.collection("orders").doc(no), valid = jc.verify(f);
  if (!valid) console.warn("JazzCash hash mismatch for", no);
  await db.runTransaction(async (t) => {
    const s = await t.get(dr);
    if (!s.exists) return;
    const o = s.data();
    if (o.payment.method !== "jazzcash" || o.payment.status === "paid" || !valid) return;
    const good = f.pp_ResponseCode === "000" && String(f.pp_Amount) === String(o.totals.total * 100);
    t.update(dr, { "payment.status": good ? "paid" : "failed", "payment.gatewayCode": clean(f.pp_ResponseCode, 10), "payment.gatewayMsg": clean(f.pp_ResponseMessage, 120), "payment.verified": true, ...(good ? { paidAt: new Date() } : {}) });
  });
  res.redirect("/#/order/" + no);
}));

app.post("/api/contact", rl(60, 5, "You have sent several messages recently. Please try again later."), h(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot: bots fill this hidden field
  const m = { name: clean(b.name, 80), email: clean(b.email, 120).toLowerCase(), phone: b.phone ? phone(b.phone) : "", subject: clean(b.subject, 120), message: clean(b.message, 2000), createdAt: new Date(), read: false };
  if (m.name.length < 2 || !EMAIL.test(m.email) || !m.subject || m.message.length < 10) throw new HttpError(400, "Enter your name, a valid email, a subject and a message of at least 10 characters.");
  if (b.phone && !m.phone) throw new HttpError(400, "Enter a valid Pakistani mobile number or leave it empty.");
  await db.collection("messages").add(m);
  mail.send(cfg.mail.owner, "Contact form: " + m.subject, m.name + " <" + m.email + "> " + m.phone + "\n\n" + m.message, m.email);
  res.json({ ok: true });
}));
app.post("/api/newsletter", rl(60, 10, "Too many requests."), h(async (req, res) => {
  const e = clean(req.body && req.body.email, 120).toLowerCase();
  if (!EMAIL.test(e)) throw new HttpError(400, "Enter a valid email address.");
  await db.collection("newsletter").doc(sha(e)).set({ email: e, at: new Date() }, { merge: true });
  res.json({ ok: true });
}));

/* ---------- admin API ---------- */
const cookie = (req, n) => { const m = (req.headers.cookie || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(n + "=")); return m ? decodeURIComponent(m.slice(n.length + 1)) : ""; };
const setCookie = (res, v, age) => res.set("Set-Cookie", "tsc_admin=" + encodeURIComponent(v) + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + age + (cfg.prod ? "; Secure" : ""));
const adm = express.Router();
adm.use((req, res, next) => (req.method !== "GET" && !req.is("application/json") ? res.status(415).json({ error: "JSON required." }) : next()));
adm.post("/login", rl(15, 10, "Too many login attempts. Try again later."), (req, res) => {
  if (!safeEq(sha(String((req.body || {}).password || "")), sha(cfg.adminPassword))) return res.status(401).json({ error: "Wrong password." });
  setCookie(res, sign({ exp: Date.now() + 8 * 3600e3 }, cfg.secret), 8 * 3600);
  res.json({ ok: true });
});
adm.post("/logout", (req, res) => { setCookie(res, "", 0); res.json({ ok: true }); });
adm.use((req, res, next) => { const p = verify(cookie(req, "tsc_admin"), cfg.secret); return p && p.exp > Date.now() ? next() : res.status(401).json({ error: "Not signed in." }); });
const audit = (action, detail) => db.collection("audit").add({ action, detail, at: new Date() }).catch((e) => console.error("audit failed", e.message));
const strip = (d) => { const x = d.data(); delete x.tokenHash; for (const k of ["createdAt", "paidAt"]) if (x[k]) x[k] = iso(x[k]); return x; };
adm.get("/me", (q, r) => r.json({ ok: true }));
adm.get("/orders", h(async (q, r) => { r.json((await db.collection("orders").orderBy("createdAt", "desc").limit(200).get()).docs.map(strip)); }));
adm.patch("/orders/:id", h(async (req, res) => {
  const b = req.body || {}, u = {};
  if (b.status !== undefined) { if (!ORDER_ST[b.status]) throw new HttpError(400, "Bad status."); u.status = b.status; }
  if (b.paymentStatus !== undefined) { if (!PAY_ST[b.paymentStatus]) throw new HttpError(400, "Bad payment status."); u["payment.status"] = b.paymentStatus; }
  if (b.paymentRef !== undefined) u["payment.ref"] = clean(b.paymentRef, 60);
  const ref = db.collection("orders").doc(clean(req.params.id, 20));
  if (!(await ref.get()).exists) throw new HttpError(404, "Order not found.");
  await ref.update(u); audit("order.update", { id: req.params.id, ...u });
  res.json({ ok: true });
}));
adm.get("/messages", h(async (q, r) => { r.json((await db.collection("messages").orderBy("createdAt", "desc").limit(200).get()).docs.map((d) => ({ id: d.id, ...d.data(), createdAt: iso(d.data().createdAt) }))); }));
adm.get("/products", h(async (q, r) => { r.json((await db.collection("products").get()).docs.map((d) => d.data()).sort((a, b) => a.id - b.id)); }));
adm.put("/products/:id", h(async (req, res) => {
  const id = +req.params.id, b = req.body || {}, name = clean(b.name, 100);
  if (!Number.isInteger(id) || id < 1 || id > 100000) throw new HttpError(400, "Bad id.");
  if (!name || !["men", "women", "unisex"].includes(b.gender)) throw new HttpError(400, "Name and category are required.");
  const p5 = +b.p5, p10 = +b.p10;
  if (![p5, p10].every((n) => Number.isInteger(n) && n > 0 && n <= 1000000)) throw new HttpError(400, "Prices must be whole numbers above 0.");
  const doc = { id, name, slug: slugify(name), gender: b.gender, p5, p10, active: !!b.active, soldOut: !!b.soldOut };
  await db.collection("products").doc(String(id)).set(doc); audit("product.save", doc);
  res.json(doc);
}));
adm.get("/coupons", h(async (q, r) => { r.json((await db.collection("coupons").get()).docs.map((d) => ({ code: d.id, ...d.data() }))); }));
adm.put("/coupons/:code", h(async (req, res) => {
  const code = clean(req.params.code, 30).toUpperCase(), pct = +req.body.pct;
  if (!/^[A-Z0-9_-]{1,30}$/.test(code) || !Number.isInteger(pct) || pct < 1 || pct > 90) throw new HttpError(400, "Code must be letters/numbers and the percentage 1 to 90.");
  await db.collection("coupons").doc(code).set({ pct, active: !!req.body.active }); audit("coupon.save", { code, pct, active: !!req.body.active });
  res.json({ ok: true });
}));
app.use("/api/admin", adm);

/* ---------- static site + errors ---------- */
app.get("/admin", (q, r) => r.sendFile(path.join(__dirname, "public", "admin.html")));
app.use(express.static(path.join(__dirname, "public"), { index: "index.html" }));
app.use("/api", (q, r) => r.status(404).json({ error: "Not found." }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

module.exports = app;
if (require.main === module) app.listen(cfg.port, () => console.log("The Scent Cartel backend listening on " + cfg.port));

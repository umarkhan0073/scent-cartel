"use strict";
const db = require("./db"), cfg = require("./config");
const { HttpError } = require("./util");
const SIZES = [5, 10];
// Recomputes everything from the database. Prices sent by the browser are never used.
async function price(items, code) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 40) throw new HttpError(400, "Your cart is empty.");
  const m = new Map();
  for (const it of items) {
    const id = Number(it && it.id), sz = Number(it && it.sz), q = Number(it && it.q);
    if (!Number.isInteger(id) || id < 1 || !SIZES.includes(sz) || !Number.isInteger(q) || q < 1) throw new HttpError(400, "Invalid cart item.");
    const k = id + ":" + sz, cur = m.get(k) || { id, sz, q: 0 };
    cur.q += q;
    if (cur.q > cfg.maxQty) throw new HttpError(400, "Maximum " + cfg.maxQty + " per item.");
    m.set(k, cur);
  }
  const rows = [...m.values()];
  const ids = [...new Set(rows.map((r) => r.id))];
  const snaps = await db.getAll(...ids.map((i) => db.collection("products").doc(String(i))));
  const prod = new Map(snaps.filter((s) => s.exists).map((s) => [s.data().id, s.data()]));
  const lines = rows.map((r) => {
    const p = prod.get(r.id);
    if (!p || !p.active || p.soldOut) throw new HttpError(400, "One of the items in your cart is no longer available.");
    const unit = r.sz === 10 ? p.p10 : p.p5;
    return { id: r.id, name: p.name, sz: r.sz, qty: r.q, unit, total: unit * r.q };
  });
  const sub = lines.reduce((a, l) => a + l.total, 0);
  let disc = 0;
  if (code) {
    if (!/^[A-Z0-9_-]{1,30}$/.test(code)) throw new HttpError(400, "Invalid coupon code.");
    const c = await db.collection("coupons").doc(code).get();
    if (!c.exists || !c.data().active) throw new HttpError(400, "Invalid coupon code.");
    disc = Math.round(sub * c.data().pct / 100);
  }
  const ship = sub - disc >= cfg.freeOver ? 0 : cfg.shipFee;
  return { lines, totals: { sub, disc, ship, total: sub - disc + ship }, coupon: code || "" };
}
module.exports = { price };

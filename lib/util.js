"use strict";
const crypto = require("crypto");
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function phone(p) {
  const s = String(p || "").replace(/[\s-]/g, "");
  return /^(\+92|0092|0)3\d{9}$/.test(s) ? "+92" + s.slice(-10) : null;
}
const slugify = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const AL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genNo() { let s = ""; for (const x of crypto.randomBytes(8)) s += AL[x % AL.length]; return "TSC-" + s; }
function sign(payload, secret) {
  const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return b + "." + crypto.createHmac("sha256", secret).update(b).digest("base64url");
}
function verify(tok, secret) {
  const [b, sig] = String(tok || "").split(".");
  if (!b || !sig) return null;
  const good = crypto.createHmac("sha256", secret).update(b).digest("base64url");
  if (!safeEq(sig, good)) return null;
  try { return JSON.parse(Buffer.from(b, "base64url").toString()); } catch (e) { return null; }
}
module.exports = { HttpError, sha, safeEq, clean, EMAIL, phone, slugify, genNo, sign, verify };

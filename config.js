"use strict";
const e = process.env;
const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes)$/i.test(v));
const num = (v, d) => (v === undefined || v === "" || isNaN(+v) ? d : +v);
const cfg = {
  prod: e.NODE_ENV === "production",
  port: num(e.PORT, 8080),
  baseUrl: (e.BASE_URL || "").replace(/\/$/, ""),
  shipFee: num(e.SHIP_FEE, 250),
  freeOver: num(e.FREE_OVER, 8000),
  maxQty: 20,
  cod: bool(e.PAY_COD, true),
  bankDetails: (e.BANK_DETAILS || "").replace(/\\n/g, "\n"),
  jc: {
    merchant: e.JAZZCASH_MERCHANT_ID, password: e.JAZZCASH_PASSWORD, salt: e.JAZZCASH_SALT,
    url: e.JAZZCASH_URL || "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
    txnType: e.JAZZCASH_TXN_TYPE || ""
  },
  adminPassword: e.ADMIN_PASSWORD || "",
  secret: e.SESSION_SECRET || "",
  mail: { host: e.SMTP_HOST, port: num(e.SMTP_PORT, 587), user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.MAIL_FROM, owner: e.OWNER_EMAIL }
};
cfg.bank = bool(e.PAY_BANK, false) && !!cfg.bankDetails;
cfg.jc.on = !!(cfg.jc.merchant && cfg.jc.password && cfg.jc.salt && cfg.baseUrl);
if (cfg.adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must be set (12+ characters).");
if (cfg.secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters).");
if (cfg.jc.merchant && !cfg.baseUrl) throw new Error("BASE_URL is required when JazzCash is configured.");
module.exports = cfg;

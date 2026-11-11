"use strict";
// JazzCash hosted-checkout (HTTP POST redirect) adapter.
// IMPORTANT: verify the field list and URL against YOUR JazzCash integration guide and sandbox
// before going live. Field requirements differ between Card, Wallet and Voucher products.
const crypto = require("crypto");
const cfg = require("./config");
const { safeEq } = require("./util");
function pkt(d) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return p.year + p.month + p.day + p.hour + p.minute + p.second;
}
function hash(f) {
  const s = Object.keys(f).filter((k) => k !== "pp_SecureHash" && f[k] !== "" && f[k] != null).sort().map((k) => f[k]).join("&");
  return crypto.createHmac("sha256", cfg.jc.salt).update(cfg.jc.salt + "&" + s).digest("hex").toUpperCase();
}
function build(order) {
  const now = new Date(), ref = order.orderNo.replace("-", "");
  const f = {
    pp_Version: "1.1", pp_TxnType: cfg.jc.txnType, pp_Language: "EN", pp_MerchantID: cfg.jc.merchant, pp_SubMerchantID: "",
    pp_Password: cfg.jc.password, pp_BankID: "TBANK", pp_ProductID: "RETL", pp_TxnRefNo: ref,
    pp_Amount: String(order.totals.total * 100), pp_TxnCurrency: "PKR", pp_TxnDateTime: pkt(now), pp_BillReference: ref,
    pp_Description: "Order " + ref, pp_TxnExpiryDateTime: pkt(new Date(now.getTime() + 3600e3)),
    pp_ReturnURL: cfg.baseUrl + "/api/pay/jazzcash/return", ppmpf_1: "", ppmpf_2: "", ppmpf_3: "", ppmpf_4: "", ppmpf_5: ""
  };
  f.pp_SecureHash = hash(f);
  return { url: cfg.jc.url, fields: f };
}
function verify(f) {
  if (!f || !f.pp_SecureHash) return false;
  return safeEq(hash(f), String(f.pp_SecureHash).toUpperCase());
}
module.exports = { build, verify, hash };

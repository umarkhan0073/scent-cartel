"use strict";
const nodemailer = require("nodemailer");
const cfg = require("./config");
const tx = cfg.mail.host ? nodemailer.createTransport({
  host: cfg.mail.host, port: cfg.mail.port, secure: cfg.mail.port === 465,
  auth: cfg.mail.user ? { user: cfg.mail.user, pass: cfg.mail.pass } : undefined
}) : null;
async function send(to, subject, text, replyTo) {
  if (!tx || !to) return;
  try { await tx.sendMail({ from: cfg.mail.from || cfg.mail.user, to, subject, text, replyTo }); }
  catch (e) { console.error("mail failed:", e.message); }
}
module.exports = { send };

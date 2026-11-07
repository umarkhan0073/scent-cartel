const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "scentcartel693@gmail.com",
    pass: "bnjkczubaljfpjki",
  },
});

async function testEmail() {
  try {
    console.log("Testing SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!");

    const info = await transporter.sendMail({
      from: "The Scent Cartel <scentcartel693@gmail.com>",
      to: "scentcartel693@gmail.com",
      subject: "Test Email from The Scent Cartel",
      text: "If you receive this, your Gmail App Password and SMTP config are fully working!",
    });
    console.log("✅ Email sent successfully! Message ID:", info.messageId);
  } catch (err) {
    console.error("❌ FAILED to send email:", err);
  }
}

testEmail();
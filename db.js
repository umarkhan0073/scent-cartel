const admin = require('firebase-admin');

let credential;
if (process.env.GOOGLE_CREDENTIALS) {
  credential = admin.credential.cert(JSON.parse(process.env.GOOGLE_CREDENTIALS));
} else {
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential });
const db = admin.firestore();
module.exports = db;

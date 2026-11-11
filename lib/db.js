"use strict";
const { Firestore } = require("@google-cloud/firestore");
const db = new Firestore(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : {});
db.settings({ ignoreUndefinedProperties: true });
module.exports = db;

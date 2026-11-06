/**
 * Adds Firebase to the Android build once google-services.json is in this folder. Android only
 * delivers push notifications through Firebase Cloud Messaging, so without it the app cannot get
 * a push token and no alert ever reaches the phone. Kept conditional so a build still works (just
 * without push) before the file is added. Everything else lives in app.json.
 */
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } };
};

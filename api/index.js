// Vercel serverless entry that boots the Expo Router server bundle (which
// includes the `/oddalerts` API route). The Expo web client is served from
// dist/client; every other request is handled here.
const path = require('path');
const { createRequestHandler } = require('@expo/server/adapter/vercel');

module.exports = createRequestHandler({
  build: path.join(__dirname, '../frontend/dist/server'),
});

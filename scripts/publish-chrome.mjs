// Publishes the packaged extension zip to the Chrome Web Store via the v2 API.
// Auth: service-account JWT-bearer flow (no extra dependencies, Node >= 20).
//
// Required env:
//   CWS_SERVICE_ACCOUNT_JSON  - Google Cloud service account key JSON (secret)
//   CWS_PUBLISHER_ID          - developer account ID from the CWS dashboard
//   CWS_ITEM_ID               - the extension's item ID
//   EXTENSION_ZIP             - path to the zip produced by web-ext build
//   VERSION                   - version being released (for idempotency check)

import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const {
  CWS_SERVICE_ACCOUNT_JSON,
  CWS_PUBLISHER_ID,
  CWS_ITEM_ID,
  EXTENSION_ZIP,
  VERSION,
} = process.env;

for (const [k, v] of Object.entries({ CWS_SERVICE_ACCOUNT_JSON, CWS_PUBLISHER_ID, CWS_ITEM_ID, EXTENSION_ZIP, VERSION })) {
  if (!v) throw new Error(`Missing env var ${k}`);
}

const sa = JSON.parse(CWS_SERVICE_ACCOUNT_JSON);

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const jwt = `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), sa.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const token = await accessToken();
const base = `https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_ITEM_ID}`;
const headers = { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' };

// Idempotency: skip if this version is already the live/draft version.
const item = await (await fetch(base, { headers })).json();
const live = item?.version ?? item?.draftVersion;
if (live === VERSION) {
  console.log(`Version ${VERSION} already present on the store — nothing to do.`);
  process.exit(0);
}

// Upload the package.
const upload = await fetch(
  `https://chromewebstore.googleapis.com/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_ITEM_ID}:upload`,
  { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: readFileSync(EXTENSION_ZIP) },
);
if (!upload.ok) throw new Error(`Upload failed: ${upload.status} ${await upload.text()}`);
console.log('Uploaded, waiting for processing...');

// Poll until the upload is processed.
let state;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const status = await (await fetch(`${base}:fetchStatus`, { headers })).json();
  state = status.lastAsyncUploadState;
  if (state === 'SUCCEEDED') break;
  if (state === 'FAILED') throw new Error(`Store rejected the package: ${JSON.stringify(status)}`);
}
if (state !== 'SUCCEEDED') throw new Error(`Timed out waiting for upload state, last: ${state}`);

// Publish (goes to review unless the account is trusted).
const publish = await fetch(`${base}:publish`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: '{}',
});
if (!publish.ok) throw new Error(`Publish failed: ${publish.status} ${await publish.text()}`);
console.log(`Published version ${VERSION} to the Chrome Web Store.`);

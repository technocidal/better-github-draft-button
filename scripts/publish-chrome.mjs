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

let sa;
try {
  sa = JSON.parse(CWS_SERVICE_ACCOUNT_JSON);
} catch {
  // Sanitized diagnostic — never prints secret contents.
  const v = CWS_SERVICE_ACCOUNT_JSON;
  throw new Error(
    `CWS_SERVICE_ACCOUNT_JSON is not valid JSON ` +
    `(length=${v.length}, starts with ${JSON.stringify(v.slice(0, 12))}). ` +
    `Paste the raw contents of the service-account key .json file.`,
  );
}
if (!sa.client_email || !sa.private_key) {
  throw new Error('CWS_SERVICE_ACCOUNT_JSON is missing client_email/private_key — not a service-account key?');
}

// Fetches a googleapis.com endpoint and parses JSON, surfacing HTTP status and
// a body snippet (never headers/JWT) when the response isn't JSON.
async function apiJson(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2', ...(init.headers || {}) },
  });
  const body = await res.text();
  if (!body.trimStart().startsWith('{')) {
    throw new Error(`API ${init.method || 'GET'} ${url} -> HTTP ${res.status}, content-type=${res.headers.get('content-type')}, body starts: ${body.slice(0, 200)}`);
  }
  return { status: res.status, ok: res.ok, data: JSON.parse(body) };
}

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
  const body = await res.text();
  if (!res.ok || !body.trimStart().startsWith('{')) {
    throw new Error(`Token request failed: HTTP ${res.status}, content-type=${res.headers.get('content-type')}, body starts: ${body.slice(0, 200)}`);
  }
  return JSON.parse(body).access_token;
}

const token = await accessToken();
console.log('Got access token.');
const base = `https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_ITEM_ID}`;

// Idempotency: skip if this version is already the live/draft version.
const item = await apiJson(base, token);
if (!item.ok) throw new Error(`fetch item failed: HTTP ${item.status} ${JSON.stringify(item.data).slice(0, 300)}`);
const live = item.data?.version ?? item.data?.draftVersion;
if (live === VERSION) {
  console.log(`Version ${VERSION} already present on the store — nothing to do.`);
  process.exit(0);
}

// Upload the package.
const upload = await apiJson(
  `https://chromewebstore.googleapis.com/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_ITEM_ID}:upload`,
  token,
  { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: readFileSync(EXTENSION_ZIP) },
);
if (!upload.ok) throw new Error(`Upload failed: HTTP ${upload.status} ${JSON.stringify(upload.data).slice(0, 300)}`);
console.log('Uploaded, waiting for processing...');

// Poll until the upload is processed.
let state;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const status = await apiJson(`${base}:fetchStatus`, token);
  state = status.data.lastAsyncUploadState;
  if (state === 'SUCCEEDED') break;
  if (state === 'FAILED') throw new Error(`Store rejected the package: ${JSON.stringify(status.data).slice(0, 300)}`);
}
if (state !== 'SUCCEEDED') throw new Error(`Timed out waiting for upload state, last: ${state}`);

// Publish (goes to review unless the account is trusted).
const publish = await apiJson(`${base}:publish`, token, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
if (!publish.ok) throw new Error(`Publish failed: HTTP ${publish.status} ${JSON.stringify(publish.data).slice(0, 300)}`);
console.log(`Published version ${VERSION} to the Chrome Web Store.`);

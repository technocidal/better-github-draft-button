// Checks whether VERSION already exists on AMO for this add-on.
// Prints exists=true/false to $GITHUB_OUTPUT when set, and exits 0 either way.
//
// Env: AMO_API_KEY (JWT issuer), AMO_API_SECRET (HS256 secret), VERSION.
// The add-on GUID is read from manifest.json (browser_specific_settings.gecko.id).

import { readFileSync, appendFileSync } from 'node:fs';
import crypto from 'node:crypto';

const { AMO_API_KEY, AMO_API_SECRET, VERSION, GITHUB_OUTPUT } = process.env;
for (const [k, v] of Object.entries({ AMO_API_KEY, AMO_API_SECRET, VERSION })) {
  if (!v) throw new Error(`Missing env var ${k}`);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const guid = manifest.browser_specific_settings?.gecko?.id;
if (!guid) throw new Error('manifest.json is missing browser_specific_settings.gecko.id');

const now = Math.floor(Date.now() / 1000);
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
  iss: AMO_API_KEY,
  iat: now,
  exp: now + 300,
})}.${crypto.createHmac('sha256', AMO_API_SECRET).update(`${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ iss: AMO_API_KEY, iat: now, exp: now + 300 })}`).digest('base64url')}`;

const res = await fetch(`https://api.addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(guid)}/versions/`, {
  headers: { Authorization: `JWT ${jwt}` },
});
if (!res.ok) throw new Error(`AMO versions list failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
const data = await res.json();
const exists = (data.results ?? []).some((v) => v.version === VERSION);
console.log(exists ? `Version ${VERSION} already exists on AMO — skipping sign.` : `Version ${VERSION} not on AMO yet.`);
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `exists=${exists}\n`);

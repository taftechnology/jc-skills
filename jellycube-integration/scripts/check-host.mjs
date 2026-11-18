#!/usr/bin/env node
/**
 * Jellycube host checker. Node 18+, no dependencies.
 *
 *   node check-host.mjs --base <public URL>/jellycube [--tenant <tenantRef>] [--site <siteRef>]
 *                       [--origin <admin origin>] [--env-file <path>] [--ping] [--json]
 *   node check-host.mjs --self-test
 *
 * Calls a running host handler the way Jellycube and the browser do, and checks the answers:
 * sign-in discovery and keys, the token route and its CORS, signature checks (unsigned,
 * tampered, replayed, old), webhooks, and, with keys and a tenant, the theme, every
 * collection page and item, and every island script (CORS and integrity).
 *
 * Keys are read from the environment (or --env-file), never from arguments:
 *   JELLYCUBE_HOST_ID, JELLYCUBE_KEY_ID, JELLYCUBE_KEY_SECRET, and JELLYCUBE_API_URL for --ping.
 * Nothing secret is printed.
 *
 * Exit code: 0 with no errors, 1 with errors, 2 on bad usage.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < argv.length && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
};

const jsonMode = flag('json');
const results = [];
const report = (level, check, message) => {
  results.push({ level, check, message });
  if (!jsonMode) console.log(`${level.padEnd(5)} ${check}: ${message}`);
};

function usage() {
  console.error('Usage: node check-host.mjs --base <public URL>/jellycube [--tenant <tenantRef>] [--site <siteRef>] [--origin <admin origin>] [--env-file <path>] [--ping] [--json]');
  console.error('       node check-host.mjs --self-test');
  process.exit(2);
}

// ---------------------------------------------------------------- JC-SIG-v1

const SIGNING_PREFIX = 'JC-SIG-v1';
const EMPTY_SHA256 = createHash('sha256').update(Buffer.alloc(0)).digest('hex');

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(search) {
  const pairs = [...new URLSearchParams(search).entries()];
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([name, value]) => `${rfc3986(name)}=${rfc3986(value)}`).join('&');
}

function stringToSign({ method, url, hostId, tenantRef, siteRef, timestamp, nonce, body }) {
  const parsed = new URL(url);
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body ?? Buffer.alloc(0);
  const bodyHash = bytes.length === 0 ? EMPTY_SHA256 : createHash('sha256').update(bytes).digest('hex');
  return [SIGNING_PREFIX, method.toUpperCase(), parsed.pathname, canonicalQuery(parsed.search), hostId, tenantRef, siteRef ?? '', String(timestamp), nonce, bodyHash].join('\n');
}

function signature(secret, text) {
  return `v1=${createHmac('sha256', Buffer.from(secret, 'utf8')).update(Buffer.from(text, 'utf8')).digest('hex')}`;
}

function newNonce() {
  return randomBytes(16).toString('base64url');
}

function signedHeaders(keys, { method, url, tenantRef, siteRef = '', body = '', timestamp, nonce }) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const n = nonce ?? newNonce();
  const text = stringToSign({ method, url, hostId: keys.hostId, tenantRef, siteRef, timestamp: ts, nonce: n, body });
  return {
    'Jellycube-Key-Id': keys.keyId,
    'Jellycube-Timestamp': String(ts),
    'Jellycube-Nonce': n,
    'Jellycube-Tenant': tenantRef,
    'Jellycube-Site': siteRef,
    'Jellycube-Signature': signature(keys.keySecret, text),
  };
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', 'references', 'test-vectors.json');
  if (!existsSync(file)) {
    report('ERROR', 'self-test', `test vectors not found at ${file}`);
    return;
  }
  const { shared, vectors } = JSON.parse(readFileSync(file, 'utf8'));
  for (const vector of vectors) {
    const text = stringToSign({
      method: vector.method,
      url: vector.url,
      hostId: vector.hostId ?? shared.hostId,
      tenantRef: vector.tenantRef ?? shared.tenantRef,
      siteRef: vector.siteRef ?? '',
      timestamp: vector.timestamp ?? shared.timestamp,
      nonce: vector.nonce ?? shared.nonce,
      body: vector.body ?? '',
    });
    const computed = signature(vector.secret ?? shared.secret, text);
    if (vector.expectValid) {
      const textOk = vector.stringToSign === undefined || vector.stringToSign === text;
      const sigOk = computed === vector.signature;
      report(textOk && sigOk ? 'OK' : 'ERROR', 'self-test', `${vector.name}: ${textOk && sigOk ? 'matches' : 'does not match'}`);
    } else {
      report(computed !== vector.signature ? 'OK' : 'ERROR', 'self-test', `${vector.name}: ${computed !== vector.signature ? 'rejected' : 'wrongly accepted'}`);
    }
  }
}

// ---------------------------------------------------------------- helpers

const FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Source Sans 3', 'Nunito', 'system-ui'];
const COLOR_KEYS = ['primary', 'primaryForeground', 'background', 'foreground', 'muted', 'border'];
const FIELD_TYPES = ['text', 'longText', 'number', 'boolean', 'date', 'url', 'email', 'image', 'choice', 'tags'];
const RESERVED_FIELDS = ['slug', 'body', 'id', 'status', 'version', 'createdAt', 'updatedAt', 'publishedAt'];
const KEY = /^[A-Za-z0-9._-]{1,128}$/;
const COLLECTION_NAME = /^[a-z][a-z0-9-]{0,47}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const TAG = /^[a-z][a-z0-9-]{1,40}$/;
const MAX_PAGES = 20;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 5000;

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost') || hostname.endsWith('.test');
}

function webUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}

async function call(url, init = {}) {
  try {
    const response = await fetch(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(15000) });
    const buffer = Buffer.from(await response.arrayBuffer());
    let json = null;
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, buffer, json };
  } catch (error) {
    return { status: 0, headers: new Headers(), buffer: Buffer.alloc(0), json: null, error: error instanceof Error ? error.message : String(error) };
  }
}

const codeOf = (answer) => (answer.json && typeof answer.json.code === 'string' ? answer.json.code : null);
const describe = (answer) => (answer.status === 0 ? `no answer (${answer.error})` : `${answer.status}${codeOf(answer) ? ` ${codeOf(answer)}` : ''}`);

function loadEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`--env-file: ${path} not found`);
    process.exit(2);
  }
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?(JELLYCUBE_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    }
  }
}

// ---------------------------------------------------------------- checks

async function checkDiscovery(base) {
  const discovery = await call(`${base}/.well-known/openid-configuration`);
  if (discovery.status === 404) {
    report('INFO', 'discovery', '404: the handler uses an own sign-in provider (getIdToken), or nothing is mounted here (see the signature checks below)');
    return;
  }
  if (discovery.status !== 200 || discovery.json === null) {
    report('ERROR', 'discovery', `expected 200 JSON, got ${describe(discovery)}`);
    return;
  }
  const { issuer, jwks_uri: jwksUri } = discovery.json;
  report(issuer === base ? 'OK' : 'ERROR', 'discovery', issuer === base ? `issuer ${issuer}` : `issuer is ${issuer}, but the handler is at ${base}. JELLYCUBE_PUBLIC_URL must equal the public URL on the Developers page, and the handler must be mounted at <public URL>/jellycube`);
  report(jwksUri === `${issuer}/.well-known/jwks.json` ? 'OK' : 'ERROR', 'discovery', `jwks_uri ${jwksUri}`);

  const jwks = await call(jwksUri ?? `${base}/.well-known/jwks.json`);
  const keys = jwks.json && Array.isArray(jwks.json.keys) ? jwks.json.keys : null;
  if (jwks.status !== 200 || keys === null || keys.length === 0) {
    report('ERROR', 'jwks', `expected 200 with keys, got ${describe(jwks)}`);
    return;
  }
  for (const key of keys) {
    if ('d' in key) {
      report('ERROR', 'jwks', `key ${key.kid} exposes its PRIVATE part ("d"). Replace the sign-in key now`);
      continue;
    }
    const shape = key.kty === 'EC' && key.crv === 'P-256' && key.alg === 'ES256' && typeof key.x === 'string' && typeof key.y === 'string';
    const thumbprint = shape
      ? createHash('sha256').update(JSON.stringify({ crv: 'P-256', kty: 'EC', x: key.x, y: key.y })).digest('base64url').slice(0, 16)
      : null;
    if (!shape) report('ERROR', 'jwks', `key ${key.kid} is not an ES256 P-256 public key`);
    else if (key.kid !== thumbprint) report('WARN', 'jwks', `kid ${key.kid} is not the first 16 characters of the key's RFC 7638 thumbprint (${thumbprint})`);
    else report('OK', 'jwks', `public key ${key.kid}`);
  }
}

async function checkTokenRoute(base, adminOrigin) {
  const url = `${base}/token`;
  const anonymous = await call(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ siteId: 'run_0000000000000000' }) });
  if (anonymous.status === 401) report('OK', 'token', 'answers 401 without a signed-in user');
  else if (anonymous.status === 200) report('ERROR', 'token', 'issued a token with no session: getUser must return null when nobody is signed in');
  else if (anonymous.status === 400 || anonymous.status === 415) report('ERROR', 'token', `${describe(anonymous)}: a body parser probably runs before the handler (mount /jellycube first)`);
  else report('ERROR', 'token', `expected 401, got ${describe(anonymous)}`);

  const foreign = 'https://not-your-admin.example';
  const preflight = await call(url, { method: 'OPTIONS', headers: { origin: foreign, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  const allowed = preflight.headers.get('access-control-allow-origin');
  if (allowed === foreign || allowed === '*') report('ERROR', 'token', `CORS allows ${allowed} on /token. Remove any global CORS middleware in front of /jellycube`);
  else report('OK', 'token', 'does not answer CORS for an unknown origin');

  if (adminOrigin) {
    const own = await call(url, { method: 'OPTIONS', headers: { origin: adminOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, authorization' } });
    const ownAllowed = own.headers.get('access-control-allow-origin');
    if (ownAllowed === adminOrigin) report('OK', 'token', `answers CORS for ${adminOrigin}`);
    else if (new URL(base).origin === adminOrigin) report('OK', 'token', 'admin is on the same origin, no CORS needed');
    else report('WARN', 'token', `no CORS for ${adminOrigin}. If the admin calls a tokenUrl on this origin, add it to browserOrigins`);
  }
}

async function checkUnsigned(base) {
  const unsigned = await call(`${base}/collections`);
  if (unsigned.status === 401) report('OK', 'signature', `unsigned request refused (${codeOf(unsigned) ?? '401'})`);
  else if (unsigned.status === 404 && codeOf(unsigned) !== null) report('INFO', 'signature', 'collections not offered (404 not_found)');
  else if (unsigned.status === 200) report('ERROR', 'signature', 'an UNSIGNED request to /collections got 200: signatures are not checked');
  else report('ERROR', 'signature', `unsigned /collections: expected 401, got ${describe(unsigned)}. Is the handler mounted at ${base}?`);

  const hook = await call(`${base}/webhooks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (hook.status === 401) report('OK', 'webhooks', 'unsigned webhook refused');
  else if (hook.status === 404) report('WARN', 'webhooks', 'not handled (404): pass onEvent to keep the host in step with site changes');
  else if (hook.status >= 200 && hook.status < 300) report('ERROR', 'webhooks', `an UNSIGNED webhook was accepted (${hook.status})`);
  else report('ERROR', 'webhooks', `unsigned webhook: expected 401, got ${describe(hook)}`);
}

async function signedGet(keys, url, tenantRef, siteRef) {
  return call(url, { headers: signedHeaders(keys, { method: 'GET', url, tenantRef, siteRef }) });
}

async function checkSignatureRules(keys, base, tenantRef, siteRef) {
  // Use the first signed route the host offers, so the checks reach the verifier.
  let url = null;
  let headers = null;
  let first = null;
  for (const path of ['/collections', '/islands', '/theme']) {
    const candidate = `${base}${path}`;
    const candidateHeaders = signedHeaders(keys, { method: 'GET', url: candidate, tenantRef, siteRef });
    const answer = await call(candidate, { headers: candidateHeaders });
    if (answer.status === 401) {
      report('ERROR', 'signature', `a correctly signed request to ${path} was refused (${codeOf(answer)}). The host's JELLYCUBE_HOST_ID / KEY_ID / KEY_SECRET differ from the ones used here, or its clock is off`);
      return;
    }
    if (answer.status !== 404 || path === '/theme') {
      url = candidate;
      headers = candidateHeaders;
      first = answer;
      if (answer.status !== 404) break;
    }
  }
  if (first.status === 404) report('INFO', 'signature', 'no signed route offered (theme, collections, islands); checking the verifier on /theme anyway');
  const replay = await call(url, { headers });
  report(replay.status === 401 && codeOf(replay) === 'replayed_request' ? 'OK' : 'ERROR', 'signature', `replayed nonce → ${describe(replay)} (expected 401 replayed_request)`);

  const tampered = { ...signedHeaders(keys, { method: 'GET', url, tenantRef, siteRef }) };
  tampered['Jellycube-Signature'] = `v1=${'0'.repeat(64)}`;
  const bad = await call(url, { headers: tampered });
  report(bad.status === 401 ? 'OK' : 'ERROR', 'signature', `wrong signature → ${describe(bad)} (expected 401)`);

  const otherTenant = { ...signedHeaders(keys, { method: 'GET', url, tenantRef, siteRef }), 'Jellycube-Tenant': `${tenantRef}-other` };
  const swapped = await call(url, { headers: otherTenant });
  report(swapped.status === 401 ? 'OK' : 'ERROR', 'signature', `tenant changed after signing → ${describe(swapped)} (expected 401)`);

  const old = signedHeaders(keys, { method: 'GET', url, tenantRef, siteRef, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  const stale = await call(url, { headers: old });
  report(stale.status === 401 && codeOf(stale) === 'timestamp_out_of_range' ? 'OK' : 'ERROR', 'signature', `hour-old timestamp → ${describe(stale)} (expected 401 timestamp_out_of_range)`);
}

async function checkTheme(keys, base, tenantRef, siteRef) {
  const answer = await signedGet(keys, `${base}/theme`, tenantRef, siteRef);
  if (answer.status === 404) return report('INFO', 'theme', 'not offered, or null for this tenant (Jellycube uses its neutral look)');
  if (answer.status === 500) return report('ERROR', 'theme', 'the package refused the theme it was given (500 host_error). Read onError on the host: it names the field. Common: logoUrl left out (use null), or not https: on the public URL origin');
  if (answer.status !== 200 || answer.json === null) return report('ERROR', 'theme', `expected 200, got ${describe(answer)}`);
  const theme = answer.json;
  const colors = theme.tokens?.colors ?? {};
  for (const key of COLOR_KEYS) {
    if (!/^#[0-9a-fA-F]{6}$/.test(colors[key] ?? '')) report('ERROR', 'theme', `tokens.colors.${key} must be #rrggbb (got ${JSON.stringify(colors[key])})`);
  }
  if (!FONTS.includes(theme.tokens?.fontFamily)) report('ERROR', 'theme', `fontFamily must be one of ${FONTS.join(', ')}`);
  if (typeof theme.tokens?.radius !== 'string' || !/^\d+(\.\d+)?rem$/.test(theme.tokens.radius)) report('WARN', 'theme', `radius should look like 0.5rem (got ${JSON.stringify(theme.tokens?.radius)})`);
  if (theme.logoUrl !== null) {
    let logo = null;
    try {
      logo = new URL(theme.logoUrl);
    } catch {
      logo = null;
    }
    if (logo === null || logo.protocol !== 'https:' || theme.logoUrl.length > 512) report('ERROR', 'theme', 'logoUrl must be null or an https: address (at most 512 characters)');
    else if (logo.origin !== new URL(base).origin) report('WARN', 'theme', `logoUrl is on ${logo.origin}, not the public URL's origin: allowed only if that origin is in browserOrigins`);
  }
  if (typeof theme.productName !== 'string' || theme.productName.length < 1 || theme.productName.length > 60) report('ERROR', 'theme', 'productName must be 1 to 60 characters');
  report('OK', 'theme', `served${theme.editor?.useHostTheme === true ? ', editor themed' : ''}`);
}

function checkValue(field, value) {
  switch (field.type) {
    case 'text': return typeof value === 'string' && value.length <= 2000 ? null : 'text, at most 2,000 characters';
    case 'longText': return typeof value === 'string' && value.length <= 100000 ? null : 'text, at most 100,000 characters';
    case 'number': return typeof value === 'number' && Number.isFinite(value) ? null : 'a number';
    case 'boolean': return typeof value === 'boolean' ? null : 'true or false';
    case 'date': return typeof value === 'string' && DATE.test(value) ? null : 'a date as YYYY-MM-DD';
    case 'url': return typeof value === 'string' && /^https?:\/\//i.test(value) && value.length <= 2048 ? null : 'a full https:// address';
    case 'email': return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'an email address';
    case 'image': return typeof value === 'string' && value.trim() !== '' && value.length <= 2048 ? null : 'an image address or path';
    case 'choice': return Array.isArray(field.options) && field.options.includes(value) ? null : `one of ${JSON.stringify(field.options)}`;
    case 'tags': return Array.isArray(value) && value.length <= 100 && value.every((tag) => typeof tag === 'string') ? null : 'an array of at most 100 strings';
    default: return null;
  }
}

function checkItem(where, collection, item, problems) {
  if (typeof item?.slug !== 'string' || !SLUG.test(item.slug)) {
    problems.push(`${where}: slug ${JSON.stringify(item?.slug)} must be lowercase letters, digits and hyphens, at most 80 (map IDs like "svc_1" to "svc-1", and use the same slug in notifySourceChanged)`);
    return;
  }
  const fields = item.fields ?? {};
  for (const field of collection.fields) {
    const value = fields[field.name];
    if (value === undefined || value === null) {
      if (field.required) problems.push(`${where} "${item.slug}": required field ${field.name} is missing`);
      continue;
    }
    if (value === '' && field.type !== 'text' && field.type !== 'longText') {
      problems.push(`${where} "${item.slug}": ${field.name} is "" — leave optional ${field.type} fields out instead`);
      continue;
    }
    const wrong = checkValue(field, value);
    if (wrong !== null) problems.push(`${where} "${item.slug}": ${field.name} must be ${wrong} (got ${JSON.stringify(value).slice(0, 60)})`);
  }
  for (const name of Object.keys(fields)) {
    if (!collection.fields.some((field) => field.name === name)) problems.push(`${where} "${item.slug}": field ${name} is not declared`);
  }
  if (collection.hasBody && item.body !== undefined && item.body !== null && (typeof item.body !== 'string' || item.body.length > 100000)) problems.push(`${where} "${item.slug}": body must be Markdown text, at most 100,000 characters`);
  for (const key of ['updatedAt', 'publishedAt']) {
    if (item[key] !== undefined && item[key] !== null && !(typeof item[key] === 'string' && ISO.test(item[key]))) problems.push(`${where} "${item.slug}": ${key} must be an ISO date-time like 2026-10-01T09:00:00Z`);
  }
}

async function checkCollections(keys, base, tenantRef, siteRef) {
  const answer = await signedGet(keys, `${base}/collections`, tenantRef, siteRef);
  if (answer.status === 404) return report('INFO', 'collections', 'not offered');
  if (answer.status !== 200 || !Array.isArray(answer.json?.items)) return report('ERROR', 'collections', `expected 200 { items }, got ${describe(answer)}`);
  const list = answer.json.items;
  report(list.length > 0 ? 'OK' : 'WARN', 'collections', `${list.length} collection(s) for tenant ${tenantRef}`);

  for (const collection of list) {
    const tag = `collection ${collection.key}`;
    const name = typeof collection.key === 'string' ? collection.key.toLowerCase().replace(/[._]/g, '-') : '';
    if (!KEY.test(collection.key ?? '')) report('ERROR', tag, 'key must match [A-Za-z0-9._-]{1,128}');
    if (!COLLECTION_NAME.test(name)) report('ERROR', tag, `binds as "${name}", which is not a valid collection name: start the key with a letter, at most 48 characters`);
    else report('INFO', tag, `bind it in the template as data-cms-list="${name}"`);
    if (!Array.isArray(collection.fields) || collection.fields.length < 1 || collection.fields.length > 50) {
      report('ERROR', tag, 'needs 1 to 50 fields');
      continue;
    }
    for (const field of collection.fields) {
      if (!FIELD_NAME.test(field.name ?? '')) report('ERROR', tag, `field name ${JSON.stringify(field.name)} must be a letter, then letters, digits or underscores`);
      if (RESERVED_FIELDS.includes(field.name)) report('ERROR', tag, `field name ${field.name} is reserved`);
      if (!FIELD_TYPES.includes(field.type)) report('ERROR', tag, `field ${field.name}: type ${JSON.stringify(field.type)} is not one of ${FIELD_TYPES.join(', ')}`);
      if (field.type === 'choice' && (!Array.isArray(field.options) || field.options.length === 0)) report('ERROR', tag, `choice field ${field.name} needs options`);
    }
    for (const key of ['editUrlTemplate']) {
      const value = collection[key];
      if (value === undefined || value === null) continue;
      if (!value.includes('{slug}')) report('ERROR', tag, `${key} must contain {slug} (don't encode it)`);
      if (!webUrl(value.replace('{slug}', 'x'))) report('ERROR', tag, `${key} must be https:`);
    }
    if (collection.editUrlTemplate == null && collection.manageUrl == null) report('INFO', tag, 'no editUrl/manageUrl: the editor offers no "Edit in …" for it');
    if (typeof collection.itemsUrl !== 'string' || !collection.itemsUrl.startsWith(`${base}/collections/`)) {
      report('ERROR', tag, `itemsUrl ${collection.itemsUrl} is not under ${base}/collections/ (check JELLYCUBE_PUBLIC_URL)`);
      continue;
    }

    const problems = [];
    const seen = new Set();
    let url = collection.itemsUrl;
    let pages = 0;
    let firstSlug = null;
    while (url !== null && pages < MAX_PAGES) {
      const page = await signedGet(keys, url, tenantRef, siteRef);
      pages += 1;
      if (page.status !== 200 || page.json === null) {
        problems.push(page.status === 500
          ? `page ${pages}: the package refused the host's own items (500 host_error). Read onError on the host: it names the item and field (often a slug made from a raw ID, or "" in a typed field)`
          : `page ${pages}: expected 200, got ${describe(page)}`);
        url = null;
        break;
      }
      if (page.buffer.length > MAX_PAGE_BYTES) problems.push(`page ${pages} is over 4 MB`);
      if (page.json.jellycube !== 'content-source/v1') problems.push(`page ${pages}: "jellycube" must be "content-source/v1"`);
      for (const item of page.json.items ?? []) {
        checkItem(`page ${pages}`, collection, item, problems);
        if (typeof item?.slug === 'string') {
          if (seen.has(item.slug)) problems.push(`slug ${item.slug} appears twice`);
          seen.add(item.slug);
          firstSlug ??= item.slug;
        }
      }
      const next = page.json.next ?? null;
      if (next !== null && (typeof next !== 'string' || !next.startsWith(collection.itemsUrl))) {
        problems.push(`page ${pages}: next must be null or a full URL under itemsUrl (got ${JSON.stringify(next)})`);
        break;
      }
      url = next;
    }
    if (url !== null) problems.push(`more than ${MAX_PAGES} pages: Jellycube reads at most ${MAX_PAGES}`);
    if (seen.size > MAX_ITEMS) problems.push(`${seen.size} items: Jellycube keeps at most ${MAX_ITEMS}`);

    if (firstSlug !== null && typeof collection.itemUrlTemplate === 'string') {
      const one = await signedGet(keys, collection.itemUrlTemplate.replace('{slug}', encodeURIComponent(firstSlug)), tenantRef, siteRef);
      const got = one.json?.items?.[0]?.slug;
      if (one.status !== 200 || got !== firstSlug) problems.push(`single item "${firstSlug}": expected 200 with that slug, got ${describe(one)}`);
      const missing = await signedGet(keys, collection.itemUrlTemplate.replace('{slug}', 'jellycube-check-missing-item'), tenantRef, siteRef);
      if (missing.status !== 404) problems.push(`an unknown slug should answer 404, got ${describe(missing)}`);
    }

    for (const problem of problems.slice(0, 25)) report('ERROR', tag, problem);
    if (problems.length > 25) report('ERROR', tag, `…and ${problems.length - 25} more`);
    if (problems.length === 0) report('OK', tag, `${seen.size} item(s) on ${pages} page(s), all valid${seen.size === 0 ? ' (empty for this tenant: is that expected?)' : ''}`);
  }
}

async function checkIslands(keys, base, tenantRef, siteRef) {
  const answer = await signedGet(keys, `${base}/islands`, tenantRef, siteRef);
  if (answer.status === 404) return report('INFO', 'islands', 'not offered');
  if (answer.status !== 200 || !Array.isArray(answer.json?.items)) return report('ERROR', 'islands', `expected 200 { items }, got ${describe(answer)}`);
  for (const island of answer.json.items) {
    const tag = `island ${island.tag}`;
    if (!TAG.test(island.tag ?? '') || !island.tag.includes('-')) report('ERROR', tag, 'tag must be a custom element name with a hyphen, [a-z][a-z0-9-]{1,40}');
    const script = webUrl(island.script ?? '');
    if (!script) {
      report('ERROR', tag, 'script must be an https: address');
      continue;
    }
    if (script.origin !== new URL(base).origin) report('ERROR', tag, `script is on ${script.origin}; it must be on the public URL's origin ${new URL(base).origin}`);
    for (const list of ['connect', 'forms']) {
      for (const origin of island[list] ?? []) {
        const parsed = webUrl(origin);
        if (!parsed || parsed.origin !== origin) report('ERROR', tag, `${list} entry ${origin} must be a bare https: origin (no path, slash or wildcard)`);
      }
    }
    const match = /^(sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(island.integrity ?? '');
    if (!match) {
      report('ERROR', tag, 'integrity must be sha384-… or sha512-… (use jellycube-server sri <file>)');
      continue;
    }
    const fetched = await call(script.toString(), { headers: { origin: 'https://site-check.jellycube.example' } });
    if (fetched.status !== 200) {
      report('ERROR', tag, `script ${script} answered ${describe(fetched)}`);
      continue;
    }
    const cors = fetched.headers.get('access-control-allow-origin');
    report(cors === '*' || cors === 'https://site-check.jellycube.example' ? 'OK' : 'ERROR', tag, cors ? `script CORS: ${cors}` : 'script has no Access-Control-Allow-Origin: browsers refuse it as a module with integrity. Serve /islands/* with Access-Control-Allow-Origin: *');
    const digest = createHash(match[1]).update(fetched.buffer).digest('base64');
    report(digest === match[2] ? 'OK' : 'ERROR', tag, digest === match[2] ? 'integrity matches the served bytes' : `integrity does not match the served bytes (served: ${match[1]}-${digest}). Something changed the file, or the hash is for another file`);
    const type = fetched.headers.get('content-type') ?? '';
    if (!/javascript|ecmascript/.test(type)) report('WARN', tag, `script content-type is "${type}"; serve it as text/javascript`);
  }
  if (answer.json.items.length === 0) report('INFO', 'islands', 'empty list');
}

async function ping(keys, tenantRef) {
  const apiUrl = (process.env.JELLYCUBE_API_URL ?? '').trim().replace(/\/+$/, '');
  if (apiUrl === '') return report('ERROR', 'ping', 'JELLYCUBE_API_URL is not set');
  const url = `${apiUrl}/ping`;
  const answer = await signedGet(keys, url, tenantRef, '');
  if (answer.status === 200 && answer.json?.ok === true) report('OK', 'ping', `Jellycube accepts the keys (host ${answer.json.hostId})`);
  else report('ERROR', 'ping', `${describe(answer)}${answer.json?.detail ? `: ${answer.json.detail}` : ''}`);
}

// ---------------------------------------------------------------- main

async function main() {
  if (flag('self-test')) {
    selfTest();
  } else {
    const baseArg = option('base');
    if (baseArg === null) usage();
    const envFile = option('env-file');
    if (envFile !== null) loadEnvFile(envFile);
    let base;
    try {
      base = new URL(baseArg).toString().replace(/\/+$/, '');
    } catch {
      usage();
    }
    const tenantRef = option('tenant');
    const siteRef = option('site') ?? '';
    const keys = {
      hostId: (process.env.JELLYCUBE_HOST_ID ?? '').trim(),
      keyId: (process.env.JELLYCUBE_KEY_ID ?? '').trim(),
      keySecret: (process.env.JELLYCUBE_KEY_SECRET ?? '').trim(),
    };
    const haveKeys = keys.hostId !== '' && keys.keyId !== '' && keys.keySecret !== '';

    selfTest();
    if (results.some((r) => r.level === 'ERROR')) {
      report('ERROR', 'self-test', 'the checker\'s own signing failed; stopping');
    } else {
      if (!base.endsWith('/jellycube')) report('WARN', 'base', `${base} doesn't end in /jellycube: pass <public URL>/jellycube unless basePath was changed`);
      await checkDiscovery(base);
      await checkTokenRoute(base, option('origin'));
      await checkUnsigned(base);
      if (!haveKeys || tenantRef === null) {
        report('INFO', 'signed', 'set JELLYCUBE_HOST_ID, JELLYCUBE_KEY_ID, JELLYCUBE_KEY_SECRET (or --env-file) and pass --tenant <tenantRef> to check the signed routes');
      } else {
        await checkSignatureRules(keys, base, tenantRef, siteRef);
        await checkTheme(keys, base, tenantRef, siteRef);
        await checkCollections(keys, base, tenantRef, siteRef);
        await checkIslands(keys, base, tenantRef, siteRef);
        if (flag('ping')) await ping(keys, tenantRef);
      }
    }
  }

  const errors = results.filter((r) => r.level === 'ERROR').length;
  const warnings = results.filter((r) => r.level === 'WARN').length;
  if (jsonMode) console.log(JSON.stringify({ errors, warnings, results }, null, 2));
  else console.log(`\n${errors} error(s), ${warnings} warning(s).`);
  // Let Node end on its own: process.exit() right after fetch can abort on Windows.
  process.exitCode = errors > 0 ? 1 : 0;
}

main();

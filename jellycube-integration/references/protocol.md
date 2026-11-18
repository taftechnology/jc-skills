# The wire protocol (Host SDK contract v1)

For a host whose language has no package, or when debugging below the package. The packages
implement all of this. If one exists for your stack, use it.

## JC-SIG-v1 signing

Every request between Jellycube and a host, **in either direction**, carries six headers:

| Header | Value |
| --- | --- |
| `Jellycube-Key-Id` | The key that signed it, `hk_…` |
| `Jellycube-Timestamp` | Unix seconds, digits only |
| `Jellycube-Nonce` | 16 random bytes, base64url without padding (22 characters), new for each request |
| `Jellycube-Tenant` | The `tenantRef` |
| `Jellycube-Site` | The `siteRef`, or empty when the request isn't about one site. **Always sent**, even when empty |
| `Jellycube-Signature` | `v1=` + lowercase hex HMAC-SHA256 |

**String to sign:** these ten lines joined with `\n`, with no newline at the end:

```
JC-SIG-v1
<METHOD, uppercase>
<path: the URL's pathname exactly as sent, still percent-encoded, not normalised>
<canonical query>
<host ID, hst_…>
<tenantRef>
<siteRef, or empty>
<timestamp>
<nonce>
<SHA-256 of the raw body bytes, lowercase hex; of zero bytes when there is no body>
```

The SHA-256 of zero bytes is
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

**Canonical query:**
1. Parse the query string like `URLSearchParams`: `+` means a space, and percent escapes are
   decoded.
2. Sort the pairs by name, then by value, by UTF-16 code units (JavaScript `<`; in other
   languages, compare UTF-16 sequences, not UTF-8 bytes or locale order).
3. Encode each name and value with `encodeURIComponent`, then also encode `!'()*` as `%21 %27
   %28 %29 %2A`. Only `A-Z a-z 0-9 - _ . ~` stay unencoded.
4. Join as `name=value` with `&`. No query gives an empty line.

**Key:** the key secret string (`hks_` + 64 hex) as UTF-8 bytes. HMAC-SHA256 over the UTF-8
bytes of the string to sign.

**Receiver**, in this order:
1. All six headers present, else `401 signature_missing`.
2. Timestamp is digits and within 300 seconds of now, else `401 timestamp_out_of_range`.
3. Nonce is 22 base64url characters, else `401 signature_missing`.
4. Key ID is the host's own key (or a rotation key), else `401 signature_invalid`.
5. Recompute the signature and compare in **constant time**, else `401 signature_invalid`.
6. Store `(keyId, nonce)` for 10 minutes. If it's already stored, `401 replayed_request`. Store
   only **after** the signature passes.
7. Use the tenant and site from the verified headers to scope the answer.

The hard parts are reproducing the path byte for byte (keep the encoding as sent, and use the
path the client actually signed even behind a proxy that rewrites prefixes) and hashing the
**raw** body bytes before any parsing.

Prove an implementation against **`test-vectors.json`** (next to this file) before anything else.
Five vectors must reproduce `stringToSign` and `signature` exactly, and three tampered ones must
fail. The shared values (secret, host ID, tenant, timestamp, nonce) are at the top of the file.

Constant-time comparison: `crypto.timingSafeEqual` (Node), `hmac.compare_digest` (Python),
`hash_equals` (PHP), `subtle.ConstantTimeCompare` (Go), `MessageDigest.isEqual` (Java),
`CryptographicOperations.FixedTimeEquals` (.NET), `Rack::Utils.secure_compare` (Ruby).

## Calls the host makes (Jellycube API)

Base: `JELLYCUBE_API_URL`, for example `https://api.jellycube.cc/api/sdk/v1`. Each call is signed,
with `Jellycube-Tenant` set and `Jellycube-Site` empty. JSON bodies use
`content-type: application/json`. Answers are JSON, or `204` with no body.

| Method and path | Body or query | Answer |
| --- | --- | --- |
| `GET /ping` | — | `{ ok, hostId, tenantRef }` |
| `POST /sessions/revoke` | `{ sub }` or `{ tenantRef }` | `204` |
| `GET /templates` | — | `{ items: [{ templateId, name, description }] }` (ready only) |
| `POST /templates?name=…&description=…` | zip bytes, `content-type: application/zip` | `{ templateId, status: 'checking', warnings? }` |
| `GET /templates/{templateId}` | — | `{ templateId, name, description, status, failedRoutes, error, createdAt }` |
| `POST /sites` + `Idempotency-Key` header | `{ siteRef, label, templateId }` | `202 { siteId, status: 'creating', address }` |
| `POST /sites?siteRef=…&label=…&templateName=…` + `Idempotency-Key` | zip bytes, `application/zip` | as above |
| `GET /sites/check-address?label=…` | — | `{ available, code?, suggestions? }` |
| `GET /sites/{siteId}` | — | `{ siteId, siteRef, status, address, createdAt, live, publishedAt }` |
| `GET /sites/{siteId}/progress` | — | `{ siteId, status, phase, percent, stage, stages, live }` |
| `POST /sites/{siteId}/suspend`, `/resume` | — | `{ status: 'suspended' }` / `{ status: 'active' }` |
| `PUT /sites/{siteId}/address` | `{ label }` | `{ address }` |
| `DELETE /sites/{siteId}` | — | `202 { status: 'deleted' }` |
| `PUT /sites/{siteId}/preview-password` | `{ password }` (string ≥8, or `null`) | `204` |
| `GET`, `POST`, `DELETE /sites/{siteId}/preview-link` | — | `{ url, createdAt, passwordProtected }`, or `204` for `DELETE` |
| `GET /domain`, `PUT /domain` `{ domain }`, `DELETE /domain` | — | `{ domain, status, setBy, records, problem, checkedAt, verifiedAt }` |
| `POST /notifications` | `{ type: 'website.source.changed.v1', source, ids, contentVersion }` | `202 { accepted: true, duplicate }` |

- `siteRef`: 1 to 128 characters of `[A-Za-z0-9._:-]`, and `tenantRef` the same. `siteId`:
  `run_` + 16 to 64 lowercase letters or digits.
- Retry a create **only** with the same `Idempotency-Key` and the same input.
- Time out requests (the packages use a fixed timeout) and treat a network failure as "unknown".
  For creates, retry with the same key.

## Routes the host serves (under `<public URL>/jellycube`)

### Built-in sign-in

- `POST /token`, `content-type: application/json`, body `{ siteId }`. Check the host's own
  session. Then answer `200 { idToken }` with `Cache-Control: no-store`, or
  `401 { code: 'not_signed_in' }`. Check `Origin` when present: it must be the public URL's
  origin or an allowed admin origin. For an allowed cross-origin admin, answer the CORS
  preflight (`OPTIONS`) and set `Access-Control-Allow-Origin: <that origin>`,
  `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Headers: content-type,
  authorization`, `Access-Control-Allow-Methods: POST` and `Vary: Origin`. Never reflect any
  other origin.
- `GET /.well-known/openid-configuration` → `{ issuer, jwks_uri, id_token_signing_alg_values_supported: ['ES256'] }`.
  `issuer` = `<public URL>/jellycube` exactly. `jwks_uri` = issuer + `/.well-known/jwks.json`.
- `GET /.well-known/jwks.json` → `{ keys: [{ kty: 'EC', crv: 'P-256', x, y, kid, alg: 'ES256', use: 'sig' }] }`.
  Never include the private `d`.
- **ID token**: a JWT signed ES256 (or RS256 with your own provider). Header
  `{ alg: 'ES256', kid, typ: 'JWT' }`. Claims: `iss` (the issuer), `aud` (`jellycube`, or the
  audience registered for your own provider), `sub` (stable user ID), `tenant_ref`, `site_ref`,
  `role` (a role in the role table), `iat`, and `exp` (`iat + 300`). No name, no email. ES256
  signatures in a JWT are raw `r‖s` (64 bytes), **not** DER: most crypto libraries output DER and
  need converting.
- `kid`: the first 16 characters of the RFC 7638 JWK thumbprint, which is base64url of SHA-256 over
  exactly `{"crv":"P-256","kty":"EC","x":"…","y":"…"}` (that key order, no spaces).

### Webhooks

`POST /webhooks`, signed by Jellycube with the host's key: `Jellycube-Tenant` is the event's
tenant, and `Jellycube-Site` its `siteRef`. Verify, then drop duplicate `id`s for 24 hours, handle
the event and answer `204`. Answer an error to have it retried (for up to 24 hours). Body:
`{ id: 'evt_…', type, occurredAt, tenantRef, siteRef, siteId, data }`.

### Host API (signed by Jellycube; verify every request)

| Route | Answer |
| --- | --- |
| `GET /theme` | `{ tokens: { colors: { primary, primaryForeground, background, foreground, muted, border }, fontFamily, radius }, logoUrl, productName, editor? }`, or `404` |
| `GET /collections` | `{ items: [{ key, label, hasBody, fields, itemsUrl, itemUrlTemplate, editUrlTemplate, manageUrl }] }` |
| `GET /collections/{key}/items[?cursor=…]` | A `content-source/v1` page (below) |
| `GET /collections/{key}/items/{slug}` | A page holding one item, or `404` |
| `GET /islands` | `{ items: [{ tag, version, script, integrity, connect, forms, needsConsent, props }] }` |

- `itemsUrl` = `<public URL>/jellycube/collections/<key>/items`, `itemUrlTemplate` = that +
  `/{slug}`, and `editUrlTemplate` is the admin edit address containing `{slug}`. Use `null` when
  there isn't one.
- A page:

```json
{
  "jellycube": "content-source/v1",
  "collection": { "label": "Events", "hasBody": true, "fields": [{ "name": "title", "type": "text", "required": true }] },
  "items": [{ "slug": "harvest-supper", "fields": { "title": "Harvest Supper" }, "body": "Markdown", "updatedAt": "2026-10-01T09:00:00.000Z" }],
  "next": "https://admin.example.com/jellycube/collections/engagement.events/items?cursor=abc"
}
```

  `next` is the **full URL** of the next page, or `null`. Field and item rules are in
  `host-data.md`.
- Unknown routes answer `404`. A host error answers `500` with a problem body and no internal
  detail.

## Problems

Errors are RFC 9457 problem details (`application/problem+json`):
`{ type, title, status, code, detail? }`. `type` is `https://jellycube.dev/problems/<code>`.

| Code | Status | Meaning |
| --- | --- | --- |
| `bad_request` | 400 | Malformed input. `detail` says which |
| `signature_missing` | 401 | A signing header is missing or malformed |
| `signature_invalid` | 401 | Wrong key or wrong signature. Check the key ID and secret, and the string to sign (path, query, body hash) |
| `timestamp_out_of_range` | 401 | Clock more than 5 minutes off. Sync the server clock (NTP) |
| `replayed_request` | 401 | Nonce reused within 10 minutes. Make a new nonce per request, and don't replay signed requests on retry: sign again |
| `token_invalid`, `token_expired` | 401 | The editor's ID token failed (issuer, audience, `kid`, signature, expiry) |
| `session_revoked` | 401 | The session was revoked |
| `not_signed_in` | 401 | (host's token route) `getUser` returned nothing |
| `tenant_mismatch` | 403 | The site doesn't belong to that `tenantRef` |
| `role_not_allowed` | 403 | The role isn't in the role table |
| `host_suspended` | 403 | Jellycube suspended the host app |
| `site_limit_reached` | 403 | The host app's site limit |
| `site_not_found` | 404 | No such site for this host and tenant |
| `address_taken` | 409 | The label (or domain) is used or held |
| `idempotency_conflict` | 409 | Same `Idempotency-Key`, different input |
| `domain_limit_reached` | 409 | The host already has a domain |
| `address_invalid`, `address_reserved` | 422 | Label shape, or a reserved name |
| `site_unavailable` | 423 | The site is suspended or busy for that action |
| `rate_limited` | 429 | Wait for `Retry-After` |
| `sdk_not_configured` | 503 | That Jellycube environment has the integration (or a domain for the host) turned off |
| `host_error` | 500 | (host's handler) a callback threw, or returned data breaking the contract |
| `not_found` | 404 | (host's handler) route or option not offered |

Receivers ignore fields and event types they don't know. The contract only grows within v1.

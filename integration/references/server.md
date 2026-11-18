# The server package

## Create it once

```ts
import { createJellycube } from '@jellycube/server';
export const jellycube = createJellycube(); // reads the JELLYCUBE_* env vars (setup.md)
```

```python
from jellycube_host import create_jellycube
jellycube = create_jellycube()
```

```php
use Jellycube\Host\Jellycube;
$jellycube = Jellycube::create();
```

Create one instance per process and reuse it. It holds the in-memory nonce and webhook
stores, which must persist across requests.

## The handler

`jellycube.handler(options)` returns one Web-standard handler, `(Request) => Promise<Response>`,
that serves everything under `basePath` (default `/jellycube`):

| Route | Called by | Option it needs | Answers |
| --- | --- | --- | --- |
| `POST /token`, body `{ siteId }` (and `OPTIONS /token`) | The admin page (`@jellycube/client`) | `getUser` or `getIdToken` | `200 { idToken }`, `Cache-Control: no-store`; `401 not_signed_in` when no user |
| `GET /.well-known/openid-configuration` | Jellycube | built-in sign-in | `{ issuer, jwks_uri, id_token_signing_alg_values_supported: ['ES256'] }` |
| `GET /.well-known/jwks.json` | Jellycube | built-in sign-in | The public key (`kid`, `alg`, `use: 'sig'`) |
| `POST /webhooks` | Jellycube, signed | `onEvent` | `204`; calls `onEvent` once per event ID (duplicates dropped) |
| `GET /theme` | Jellycube, signed | `theme` | The host theme, or `404` for `null` |
| `GET /collections`, `/collections/{key}/items`, `/collections/{key}/items/{slug}` | Jellycube, signed | `collections` | Collection list, item pages, one item |
| `GET /islands` | Jellycube, signed | `islands` | The island list |

- A route whose option isn't given answers `404 not_found`. Any other path answers `404`, so
  the handler can be mounted on a wildcard.
- Every signed route checks the signature, timestamp, nonce and key, then passes
  `{ tenantRef, siteRef, request }` from the **verified** headers to the callback. Always
  scope data by that `tenantRef`; never by anything in the query.
- A callback that throws answers `500 host_error` with no detail, and the error goes to
  `onError` (default `console.error`). A callback that returns data breaking the contract
  answers `500 host_error`, and `onError` gets a `JellycubeError` naming the field. **Read
  `onError` output** when Jellycube reports that it couldn't refresh.

Options:

| Option | Purpose |
| --- | --- |
| `getUser(request, { siteId })` | Built-in sign-in: who is signed in, for which site (below) |
| `getIdToken(request, { siteId })` | Instead of `getUser`, with the host's own OIDC provider |
| `onEvent(event)` | Webhooks (`sites.md`, "Webhooks") |
| `theme({ tenantRef, siteRef, request })` | `host-data.md`, "Theme" |
| `collections: { [key]: definition }` | `host-data.md`, "Host collections" |
| `islands({ tenantRef, siteRef, request })` | `host-data.md`, "Islands" |
| `browserOrigins: string[]` | Extra origins allowed to call `/token` (an admin on another origin than the server) |
| `nonceStore`, `eventStore` | Shared stores when there's more than one server process (below) |
| `extraKeys: [{ keyId, keySecret }]` | An old key still accepted during key rotation |
| `onError(error)` | Where callback failures go |

## `getUser`

The browser package POSTs `{ siteId }` to `/jellycube/token` with the admin page's own
credentials: same-origin cookies, or the headers from its `getHeaders` option. `getUser`
decides whether that person may open that site's editor:

```ts
getUser: async (request, { siteId }) => {
  const user = await myAuth(request);                       // the host's existing session check
  if (!user) return null;
  const community = await findCommunityBySiteId(siteId);    // the community storing this siteId
  if (!community) return null;
  const role = roleOf(user, community);                     // null when they have no access
  if (!role) return null;
  return { id: user.id, tenantRef: community.id, siteRef: community.website.siteRef, role };
}
```

- Return `null` for anyone who may not open **that** site. Never return a `tenantRef` the user
  doesn't belong to: that's the line between communities.
- `id` is a stable, opaque user ID. Never send an email or name. Jellycube stores none and
  shows the current user as "You".
- `role` is the host's own role name, exactly as written in the role table on the
  Developers page. Organisation-level roles (an owner of many communities) must be in the
  table too, or those users get `403 role_not_allowed`.
- `siteRef` must be the same value used in `sites.create`.
- The package turns this into a 5-minute ES256 ID token
  (`iss`, `aud: 'jellycube'`, `sub`, `tenant_ref`, `site_ref`, `role`, `iat`, `exp`). The editor
  asks again before its session runs out, so a role change or removal takes effect at the next
  refresh. Revoking is immediate (below).
- Python receives a neutral request (`method`, `url`, `headers` with lowercase names, `body`,
  and `raw`, the framework's own request). PHP gets the same, with `$request->raw` when there is
  one.

## Mounting

**Mount `/jellycube` before any body-parsing middleware.** The handler reads the raw body
itself, both for the token route and to check webhook signatures. If `express.json()`, a
framework's request parser or CSRF middleware runs first, those calls fail.

| Stack | Mount |
| --- | --- |
| Express | `app.use('/jellycube', jellycube.toNodeHandler(jellycubeHandler));` placed **above** `app.use(express.json())` |
| NestJS (Express) | `NestFactory.create(AppModule, { bodyParser: false })`, then `app.use('/jellycube', jellycube.toNodeHandler(jellycubeHandler))`, then add the JSON parser back with `app.use(express.json())` |
| Node `http` | In the request listener: `if (url.pathname === '/jellycube' \|\| url.pathname.startsWith('/jellycube/')) return toNode(req, res);` before reading the body |
| Fastify | An `onRequest` hook that, for `/jellycube/*` paths, calls `reply.hijack()` and then `toNode(request.raw, reply.raw)`, so Fastify never parses the body |
| Hono, Cloudflare Workers, Deno, Bun | `app.all('/jellycube/*', (c) => jellycubeHandler(c.req.raw))`, or in `fetch`: `if (path.startsWith('/jellycube')) return jellycubeHandler(request)`. Pass the **untouched** `Request` |
| Next.js App Router | `app/jellycube/[...path]/route.ts`: `export const GET = (r: Request) => jellycubeHandler(r); export const POST = GET; export const OPTIONS = GET;` |
| FastAPI, Starlette | `app.mount("/jellycube", jellycube.asgi_app(handler))` |
| Flask | `app.wsgi_app = DispatcherMiddleware(app.wsgi_app, {"/jellycube": jellycube.wsgi_app(handler)})` |
| Django | `re_path(r"^jellycube/", jellycube.django_view(handler))` in `urls.py` (the view is CSRF-exempt) |
| Plain PHP, WordPress | Route `/jellycube/*` to a file that runs `$jellycube->serveGlobals($handler);`. In WordPress, do it in an early hook (`parse_request`) and `exit` after |
| Laravel | `Route::any('/jellycube/{any?}', fn (Request $r) => \Jellycube\Host\Adapters\Laravel::handle($handler, $r))->where('any', '.*');`. Put it where the CSRF middleware doesn't run (`routes/api.php`, or add `jellycube/*` to the CSRF exceptions) |

The handler must be reachable at exactly `JELLYCUBE_PUBLIC_URL + basePath`. If a reverse proxy
or framework strips or adds a prefix, check with `scripts/check-host.mjs`: the discovery
document's `issuer` must equal the URL you registered plus `/jellycube`.

Body size: the Python adapters refuse bodies over 1 MiB with `413` (Django applies its own
limit first). Jellycube's calls to the host are small. Template zips go **from** the host to
Jellycube through methods, never through the handler.

## Signed calls the host makes

Every method signs the request, sends it to `JELLYCUBE_API_URL`, and returns the parsed JSON.
Every call names the `tenantRef` it acts for. Host-wide calls (templates, domain) accept any
of the host's tenants.

| Method | Use |
| --- | --- |
| `ping({ tenantRef })` | Connection check: keys, URL, clock |
| `sessions.revoke({ tenantRef, sub })` / `({ tenantRef })` | End one user's editor sessions, or a whole community's, within 30 seconds. Call it when a member is removed or loses access |
| `templates.list / upload / get` | `sites.md` |
| `sites.create / get / progress / checkAddress / suspend / resume / changeAddress / delete` | `sites.md` |
| `sites.setPreviewPassword / previewLink / createPreviewLink / stopPreviewLink` | `sites.md` |
| `domain.get / claim / remove` | `sites.md` |
| `notifySourceChanged({ tenantRef, source, ids, contentVersion })` | `host-data.md` |

Python: `jellycube.sites.create(tenant_ref=..., site_ref=..., ...)`. PHP:
`$jellycube->sites->create(tenantRef: ..., siteRef: ..., ...)`.

## Errors

- A refused call throws `JellycubeError { status, code, title, detail }`, built from Jellycube's
  problem answer (`protocol.md`, "Problem codes").
- A network failure throws `JellycubeError` with **`status: 0`**, `code: 'network_error'`.
- Configuration problems throw `JellycubeConfigError { variable }`.

Map them for the host's own API. Don't pass them straight through:

| Jellycube answer | Host answer |
| --- | --- |
| `status 0` (network) | `502`/`503` "Website service unreachable, try again". **Never** create an HTTP response with status 0: most frameworks throw, and a Node server can crash |
| `401` (`signature_*`, `timestamp_out_of_range`, `replayed_request`) | `500`/`502` and an alert: keys, URL or server clock are wrong. **Don't** answer `401` to the browser, because the host's front end may sign the user out |
| `403 host_suspended`, `site_limit_reached`, `tenant_mismatch`, `role_not_allowed` | `403` with a clear message. These are real situations, not sign-in failures |
| `404 site_not_found` | The site is gone (deleted elsewhere, or a lost delete answer). Clear the stored `siteId` and show "create website" again |
| `409 address_taken`, `422 address_invalid` / `address_reserved` | Show the message, and the suggestions from `sites.checkAddress` |
| `409 idempotency_conflict` | The same idempotency key was reused with different input (`sites.md`) |
| `429 rate_limited` | Retry after the `Retry-After` time |

## Own sign-in provider

A host that already runs OIDC (Auth0, Clerk, Cognito, Keycloak and so on) passes `getIdToken`
instead of `getUser` and leaves `JELLYCUBE_SIGNIN_KEY` unset:

```ts
jellycube.handler({
  getIdToken: async (request, { siteId }) => {
    const user = await myAuth(request);
    const community = await findCommunityBySiteId(siteId);
    return user && community && roleOf(user, community) ? await mintTokenFor(user, community) : null;
  },
});
```

- The token must be ES256 or RS256, and carry `iss`, `aud`, `sub`, `tenant_ref`, `site_ref`,
  `role`, `iat` and `exp`. Most providers need a custom claim or token template for `tenant_ref`,
  `site_ref` and `role`.
- On the Developers page, open "I use my own sign-in provider" and set the provider's issuer,
  JWKS URL and audience.
- The discovery and JWKS routes answer `404` in this mode.

Built-in sign-in is simpler and usually the right choice. It doesn't replace the host's own
login; it only signs a short-lived token for the editor.

## More than one server process

Nonces (replay protection) and webhook event IDs are kept **in memory** in JavaScript and
Python, and **in files** under the system temp folder in PHP (PHP forgets memory between
requests). With several processes or machines behind a load balancer, a replayed request
could reach another process. Pass shared stores:

```ts
jellycube.handler({
  getUser,
  nonceStore: { claim: async (keyId, nonce, ttlSeconds) => redisSetNx(`jc:nonce:${keyId}:${nonce}`, ttlSeconds) },
  eventStore: {
    claim: async (id, ttlSeconds) => redisSetNx(`jc:event:${id}`, ttlSeconds),
    release: async (id) => redisDel(`jc:event:${id}`),
  },
});
```

`claim` returns `true` when the value is new. On serverless platforms (Workers, Lambda), use a
shared store such as KV, Redis or a database table with a unique key. PHP on long-running
servers (Swoole, RoadRunner) can use memory or a shared store instead of files.

## Key rotation

1. On the Developers page, create a second key and copy its secret.
2. Deploy it as `JELLYCUBE_KEY_ID` / `JELLYCUBE_KEY_SECRET`, with the old key in
   `extraKeys: [{ keyId, keySecret }]`.
3. Retire the old key on the Developers page. Retiring takes effect at once and can't be
   undone. Then remove it from `extraKeys`.

## Security checklist

- The key secret and sign-in key live only on the server, never in the admin bundle.
- The token route answers only the public URL's origin and `browserOrigins`, and never
  reflects any other origin. Don't add a CORS middleware in front of `/jellycube` that
  reflects origins.
- Use shared stores with more than one process.
- Call `sessions.revoke` when someone loses access.
- Log `JellycubeError.code` and `status`. The package never puts secrets in errors, and the
  host's code shouldn't either.

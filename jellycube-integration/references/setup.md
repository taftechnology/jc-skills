# Setup: packages, registration, environment

## The pieces

| Piece | Runs | What it does |
| --- | --- | --- |
| Server package | The host's backend | Signs every call to Jellycube; serves `/jellycube/*`: the editor's sign-in token, sign-in discovery and keys, the webhook receiver, and the Host API (theme, collections, islands). It checks every signature from Jellycube itself |
| `@jellycube/client` | The host's admin page (browser) | Puts the editor in an iframe, gets the sign-in token from the server package, passes events back |
| Jellycube | Jellycube's servers | The editor, builds, hosting of the sites, previews, images |

Jellycube's API base is `…/api/sdk/v1`. Every call between Jellycube and the host, in either
direction, is signed with **JC-SIG-v1** (HMAC-SHA256 with the host's key secret).

## Packages

| Language | Install | Import | Status (Nov 2026) |
| --- | --- | --- | --- |
| JavaScript / TypeScript server: Node 20+, Bun, Deno, Cloudflare Workers | `npm install @jellycube/server@next` | `import { createJellycube } from '@jellycube/server'` | On npm, `1.0.0-alpha.5`. No dependencies |
| Browser | `npm install @jellycube/client@next`, or a `<script>` from jsDelivr that sets `window.JellycubeClient` | `import { mountJellycubeEditor } from '@jellycube/client'` | On npm, `1.0.0-alpha.5`. No dependencies. Works with any server language |
| Python 3.10+ (WSGI, ASGI, Django) | `pip install jellycube-host` | `from jellycube_host import create_jellycube` | Built and tested, **not on PyPI yet** |
| PHP 8.1+ (plain PHP, WordPress, Laravel) | `composer require jellycube/host`, or the bundled `autoload.php` | `use Jellycube\Host\Jellycube;` | Built and tested, **not on Packagist yet** |
| Anything else | — | — | Implement `protocol.md` by hand |

- **Pin an exact version** while the packages are alpha (for example `1.0.0-alpha.5`), and
  read the package README on npm for the version you install. Server and client share one
  version number, so keep them in step.
- **Check availability first:** `npm view @jellycube/server dist-tags`, `pip index versions
  jellycube-host`, `composer show -a jellycube/host`.
- **No Python or PHP package available?** Give the user these options and let them choose:
  1. ask Jellycube for the package source and install it from a local path;
  2. implement the protocol by hand (`protocol.md`: about 150 lines, standard library only);
  3. run a small Node service with `@jellycube/server` next to the main app, with
     `getUser` calling the main app to check the session.
- The three server packages behave the same on the wire and share one test suite. Names
  follow each language: `tenantRef` is `tenant_ref` in Python, `getUser` is `get_user`, and
  so on. PHP uses named arguments with camelCase names.

## Register the host app

A developer signs in to the Jellycube dashboard, opens **Developers** and creates a
**host app**. Only the developer needs a Jellycube account; the host's users never get one.

| Field | What to enter |
| --- | --- |
| Name | Any name. Only the developer sees it |
| Public URL | The origin where the server package's handler is reachable, for example `https://admin.example.com`. Jellycube derives: issuer `<public URL>/jellycube`, JWKS `<issuer>/.well-known/jwks.json`, Host API `<issuer>`, webhooks `<issuer>/webhooks` |
| Admin origins (1 to 10) | Every origin whose pages show the embedded editor. Filled in from the public URL; change it if the admin lives elsewhere |
| Role table | The host's own role names, spelled exactly as `getUser` returns them, each mapped to a tier: **full** (edit, publish, site settings, preview sharing and password), **editor** (edit pages and content, share previews), **viewer** (look only). A role that isn't listed can't open the editor (`403 role_not_allowed`) |
| "I use my own sign-in provider" (optional) | Issuer, JWKS URL and audience of the host's own OIDC provider (`server.md`, "Own sign-in provider") |

What the developer gets, **shown once**, with copy buttons and an env file to download:

```
JELLYCUBE_API_URL=https://…/api/sdk/v1
JELLYCUBE_HOST_ID=hst_…
JELLYCUBE_KEY_ID=hk_…
JELLYCUBE_KEY_SECRET=hks_…
```

Jellycube stores only the encrypted secret, so a lost secret means creating a new key.

Rules and limits:
- Public URL and admin origins must be `https:` with a public hostname. `localhost`,
  `127.0.0.1` and `.test` are refused on Jellycube's production service (see "Local
  development").
- A host app works as soon as it's created. There's no approval step.
- At most 3 host apps per Jellycube account, and 2 active keys per host app (rotation:
  `server.md`).
- Each host app starts with a limit of **25 sites** (`403 site_limit_reached` past it; deleted
  sites don't count). Ask Jellycube to raise it.
- Jellycube controls the shared content domain, reserved labels, the site limit, the host's
  status, and the features `nativeCms`, `customCode` and `cookieNotice`. A host can claim
  **its own** content domain itself (`sites.md`, "Own domain").
- A host app can be deleted only when it has no sites.
- Changes on the Developers page reach every Jellycube server within 60 seconds.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `JELLYCUBE_API_URL` | yes | From the Developers page. There's no default, so a host never calls production by accident |
| `JELLYCUBE_HOST_ID` | yes | `hst_…` |
| `JELLYCUBE_KEY_ID` | yes | `hk_…` |
| `JELLYCUBE_KEY_SECRET` | yes | `hks_…`. Never logged, never in an error |
| `JELLYCUBE_PUBLIC_URL` | for `handler()` | The same public URL as on the Developers page, with no path and no trailing slash |
| `JELLYCUBE_SIGNIN_KEY` | with built-in sign-in | ES256 private key from `npx jellycube-server keygen --out .env.jellycube` (Python `python -m jellycube_host keygen`, PHP `vendor/bin/jellycube-host keygen`). It writes the file and prints only the path |

Each can be passed as an option to `createJellycube({ apiUrl, hostId, keyId, keySecret,
publicUrl, signinKey, basePath })` instead. `basePath` defaults to `/jellycube`. A missing or
malformed value throws `JellycubeConfigError { variable }` naming the variable, never its
value, **at first use**, so the app still starts when the integration isn't configured yet.
Use that to show "Website builder isn't set up" instead of crashing.

The browser needs two non-secret values: `hostId` and the **editor origin**. On Jellycube's
production service the editor origin is `https://api.jellycube.cc`, the same origin as the
API URL the Developers page shows. Expose them through the admin's normal public config,
for example `VITE_…` or `NEXT_PUBLIC_…`.

## Where sites go live

- **Default:** `https://<label>.jellycube.cc`, with images on `assets.jellycube.cc`. This works
  with no setup.
- **The host's own domain:** for example `https://<label>.sites.example.org`, with images on
  `assets.sites.example.org`. The host claims it once and proves it in DNS (`sites.md`, "Own
  domain").
- **Sites keep the domain they were created on.** A site made before the host's own domain is
  active stays on `jellycube.cc`, and moving it isn't supported. If the host wants its own
  domain, claim it **before** creating real sites.

## Local development

Jellycube's servers call the host (sign-in keys, theme, collections, islands, webhooks), and
the editor only loads inside frames on registered `https:` admin origins. So a host on
`localhost` can't be registered with production Jellycube. Options:

1. **A tunnel** (Cloudflare Tunnel, ngrok and similar) that gives the local server and admin a
   public `https:` hostname. Register a separate "dev" host app with that hostname as the
   public URL and admin origin. Use a stable hostname, because the host app records it.
2. **A deployed staging host**, with its own host app and keys.
3. Keep production and development as **separate host apps**, each with its own keys, and
   never share keys between them.

The browser checks (token route, editor mounting) can run on any origin that is registered as
an admin origin. The handler's routes can be tested locally with `scripts/check-host.mjs`
against `http://localhost:…` (`verify.md`).

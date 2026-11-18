# Troubleshooting: symptom → cause → fix

These came up while building and testing the reference host integration from scratch with the
published packages. Start with `scripts/check-host.mjs` (`verify.md`). It catches most of them
in one run.

## Connection and keys

| Symptom | Cause | Fix |
| --- | --- | --- |
| `JellycubeConfigError` naming a variable | Env var missing or malformed (often a stray quote or newline from copy-paste) | Set it and restart. Read env with `.trim()` |
| Every call: `401 signature_invalid` | Key ID and secret don't belong together (one updated, the other not), a stale copy of the secret in another file, a retired key, or an API URL for a different Jellycube environment | `jellycube.ping({ tenantRef })` after each change. Keep **one** source for the four values. If the secret is lost, create a new key on the Developers page |
| `401 timestamp_out_of_range` | Server clock more than 5 minutes off (VMs, containers and WSL after sleep) | Sync the clock with NTP |
| `401 replayed_request` on calls to Jellycube | A retry wrapper (axios-retry, a fetch wrapper, a queue) re-sends the **same signed request** | Retry through the package method, which signs each attempt, or sign again for each attempt |
| `503 sdk_not_configured` | That Jellycube environment has the integration off, or the API URL points at the wrong environment | Use the API URL from the Developers page of the environment you registered on |
| `403 host_suspended` | Jellycube suspended the host app | Contact Jellycube. Live sites keep serving |
| The host's API process crashes when Jellycube is unreachable | `JellycubeError.status` is `0` for network errors, and the code passed it to the HTTP response (`new Response(…, { status: 0 })` throws) | Map `status 0` to `502`/`503` (`server.md`, "Errors") |
| Users get signed out of the host app when a Jellycube call fails | A Jellycube `401` (keys or signing) was passed straight through to the browser | Answer `502`/`500` for Jellycube `401`s; show `403` messages as they are |
| Can't register `http://localhost` on the Developers page | Production Jellycube requires public `https:` URLs | Use a tunnel or a staging deploy (`setup.md`, "Local development") |

## Mounting the handler

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/jellycube/token` answers `400`/`415` "body could not be read", or webhooks fail signature checks while signed calls work | A body parser (`express.json()`, `bodyParser`, a framework's request parsing) consumed the body before the handler | Mount `/jellycube` **before** any parser (`server.md`, "Mounting") |
| Laravel: `419` on `/jellycube/token` or `/jellycube/webhooks` | The CSRF middleware | Register the route in `routes/api.php` or exclude `jellycube/*` from CSRF |
| `/jellycube/...` answers the admin's HTML, or `404` from the web server | An SPA fallback or static host catches the path before the API | Route `/jellycube/*` to the server first (reverse proxy rule, rewrite, framework route order) |
| The editor fails with `token_invalid`, but `/token` answers `200` | The discovery `issuer` doesn't equal the issuer Jellycube has: `JELLYCUBE_PUBLIC_URL` differs from the Developers page (`http`/`https`, `www`, port, trailing slash), or a proxy changes the path prefix | `check-host.mjs` prints the issuer. Make the env value and the registered public URL identical, and keep the handler at `<public URL>/jellycube` |
| `/token` preflight fails or sends odd CORS headers | A global CORS middleware answers `/jellycube/*` first | Exclude `/jellycube/*` from it. The package answers its own preflight for `browserOrigins` |
| `500 host_error` from a route | A callback threw, or returned data that breaks the contract | Read `onError`: it names the collection, field or island. Fix the data, not the check |
| Random `replayed_request` or duplicate webhook handling with several instances | In-memory nonce and event stores aren't shared | Pass shared `nonceStore` and `eventStore` (`server.md`) |
| The `keygen` file isn't `0600` on Windows | Windows has no such file mode | Protect the file with folder permissions, or put the value straight into a secret store |

## The embedded editor

| Symptom | Cause | Fix |
| --- | --- | --- |
| Blank frame, "refused to connect", console error mentioning `frame-ancestors` | The page's origin isn't an admin origin on the Developers page (scheme, host and port must match exactly), or the admin page is itself inside another frame whose origin isn't registered | Add every origin in the frame chain. Changes take up to 60 seconds |
| `onError({ code: 'not_signed_in' })` | `getUser` returned `null`: the session cookie wasn't sent (cross-origin `tokenUrl`), the site lookup by `siteId` found nothing, or the user has no role there | Same origin: default `tokenUrl`. Cross-origin: `getHeaders` with a bearer token, or `browserOrigins` plus `SameSite=None; Secure` cookies. Log inside `getUser` while developing |
| Token request blocked by CORS | `tokenUrl` is on another origin, and that origin isn't in `browserOrigins` | Add the admin origin to `browserOrigins` |
| `403 role_not_allowed` | The `role` from `getUser` isn't in the role table exactly (case, spelling, organisation-level roles missing) | Add every role that may open the editor, with its tier |
| The editor shows but has no height | The container has no height. The iframe is `height: 100%` | Give the container an explicit height |
| The editor turns dark on dark-mode devices in a light-only admin | The default `colorMode` is `'system'` | Pass `colorMode: 'light'`, or call `setColorMode` from the app's own toggle |
| The editor reloads on every render | It's re-mounted because effect dependencies include new callbacks each render | Depend on `siteId` (and status) only. Read callbacks through refs |
| "This website is still being built" doesn't go away | The build is queued, starting or failed | Read `sites.progress`, and mount after `status: 'active'` (`sites.md`) |
| "Edit in …" does nothing | `onEditInHost` isn't passed. The editor never navigates by itself | Pass it, and open `url` |
| Removed members can still edit for a while | Sessions last up to 15 minutes | Call `sessions.revoke({ tenantRef, sub })` when access is removed |
| No Share button, publish or settings for some users | Their role maps to `editor` or `viewer` | Map it to `full` if they should have them |

## Sites, templates and domains

| Symptom | Cause | Fix |
| --- | --- | --- |
| The site is `active`, but its address answers `404` | It was never published | Press Publish in the editor (`full` access). Show "not published yet" from `live` |
| `percent` stays 0 for minutes | `phase` is `queued` or `starting`: the builder is waking up, or other builds are ahead | Show the phase, poll less often (every 10 seconds after the first minute), and don't time out early |
| The build fails (`status: 'failed'`) | The template doesn't import: no lockfile, server output, middleware, Astro too old, and so on | Run the `jellycube-template` skill's checker on the template. With `templates.upload`, read `failedRoutes` and `error` before creating sites |
| `409 address_taken` for a label that was just deleted | Deleted sites hold their address for 12 months | Use `checkAddress` and its `suggestions`, or a new label |
| `409 idempotency_conflict` | The same `idempotencyKey` was reused with a different label, `siteRef` or template (common after a delete and re-create) | Make the key from community **and** label, and a fresh one per new attempt |
| `404 site_not_found` for a stored `siteId` | The site was deleted elsewhere, or a delete's answer was lost | Clear the stored website and offer "create" again |
| `403 site_limit_reached` | The host app's site limit (25 to start) | Delete unused sites, or ask Jellycube to raise it |
| `409` on `templates.upload` | Another upload is still `checking` | Wait for `ready` or `failed`, then upload |
| `templates.get` answers `404` for a stored ID | The template belongs to a different host app (keys or host ID changed) | Upload again under the current host app, and skip unknown IDs when listing |
| New sites still use the old template | Templates are snapshots | Upload again (new `templateId`) or send the new zip. Existing sites never change |
| Sites stay on `jellycube.cc` after claiming a domain | They were created before the domain was `active` | Claim and activate the domain first. Moving existing sites isn't supported |
| The domain stays `pending` | `problem` says which record is missing. Often the CNAME is proxied (Cloudflare orange cloud), it isn't a **wildcard**, or the DNS panel appended the zone name twice (`_jellycube-challenge.sites.example.org.example.org`) | Fix the record exactly as given. Check with `dig TXT _jellycube-challenge.<domain>` and `dig CNAME anything.<domain>` |
| Webhooks never arrive | `onEvent` isn't passed (the route answers 404), the public URL isn't reachable from the internet, a WAF or bot protection blocks server-to-server POSTs, or a body parser runs first | Check with `check-host.mjs`. Allow-list `POST /jellycube/webhooks` in the WAF |

## Host data

| Symptom | Cause | Fix |
| --- | --- | --- |
| A new site shows the template's sample content, not the host's data | First discovery failed: the host was down or unreachable when the site was created (the next try is 15 minutes later), the template binds a different name, or `list` returned nothing for that `tenantRef` | Keep the host reachable while sites are created and allow about a minute after `active`. The bound name must be the key lowercased with `.`/`_` → `-`. Run `check-host.mjs --tenant <id>` |
| The editor says the data couldn't refresh | The host answered `500 host_error`: an invalid item (an empty string in a `date`, `url`, `email`, `image` or `number` field, a bad slug, a date not `YYYY-MM-DD`) | Read `onError`, fix the mapping, and leave out empty optional fields |
| `notifySourceChanged` → `400 bad_request` | An ID isn't a valid slug (raw IDs like `svc_marys_sun`, uppercase), more than 200 IDs, `contentVersion` not a positive integer, or an unknown `source` | Send the **same slugs the collection serves**. Use one slug function everywhere |
| Notifications always answer `duplicate: true` | `contentVersion` isn't higher than the last one Jellycube saw: the counter was reset (database reset, per-process memory counter), or the same value was sent twice | Persist the counter per `(tenantRef, source)` and increment it in the same transaction as the change, or use `Date.now()` as the version |
| The live site doesn't update after an edit | The notification was sent **before** the change was committed (Jellycube fetched the old data), that write path doesn't notify, or it used the wrong `tenantRef` | Notify after commit, from every write path, with the community's ID |
| Notifications sometimes fail with `429` | More than 600 per minute for the host | Batch slugs (≤200 per call) or send `ids: []` after bulk jobs |
| `editUrl` makes `/collections` fail with `500` | The slug was `encodeURIComponent`-ed (`%7Bslug%7D`), or the URL isn't `https:` on an admin origin | Plain concatenation, `https:`, the admin origin |

## Islands

| Symptom | Cause | Fix |
| --- | --- | --- |
| The island never appears | It's a stand-alone (non-host) site, `islands` isn't passed (`/islands` 404), the element tag doesn't equal `data-jc-island`, or `data-jc-props` fails the `props` schema | Check with `check-host.mjs`, and check the template (`jellycube-template` skill) |
| Console: script "blocked by CORS policy" | The script file has no `Access-Control-Allow-Origin` | Serve `/islands/*` with `Access-Control-Allow-Origin: *` |
| Console: "Failed to find a valid digest in the 'integrity' attribute" | The served bytes differ from the hashed bytes (minifier, CDN auto-minify, edited file, wrong file) or the hash was typed by hand | Hash the **served** file with `jellycube-server sri <file>` after downloading it, and turn off byte-changing optimisations for `/islands/*` |
| The island's `fetch` is blocked (CSP `connect-src`) | The API origin is missing from `connect` | List every origin the island calls |
| The island's POST fails the CORS preflight | The island's API doesn't allow the site origins or the `content-type` header | Answer CORS for the site origins with `Access-Control-Allow-Headers: content-type` |
| The island waits and never runs | `needsConsent: true`, and the visitor hasn't accepted the cookie notice | Expected. Use `false` only for features that set no cookies and don't track |
| `/islands` → `500 host_error` | The script isn't on the public URL's origin (a CDN, the admin's subdomain), an `http:` address, a `connect` entry with a path, trailing slash or wildcard, a tag without a hyphen, a bad `integrity` prefix, or an unsupported `props` keyword | Fix the entry. `onError` names it |

## Theme

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/theme` → `500 host_error` with `theme.logoUrl is invalid` | `logoUrl` was left out, is on a CDN or another domain, or is `http:` (even on localhost) | Use `null`, or an `https:` URL on the public URL's origin |
| `/theme` → `500 host_error` (another field) | A colour isn't `#rrggbb`, a font isn't on the list, the radius isn't like `0.5rem`, or the name is too long | Fix the value (`host-data.md`, "Theme"). `onError` names the field |
| The editor isn't themed | `editor: { useHostTheme: true }` is missing, or the greys don't contrast enough (they're then skipped by design) | Add it. Use a darker `foreground` on a light `background` |
| The font doesn't show | No web font is loaded. It shows only where the font is installed | Expected |

## When stuck

1. Run `scripts/check-host.mjs` with every option (`verify.md`).
2. `jellycube.ping({ tenantRef })` from the server: this checks keys, URL and clock.
3. Read `JellycubeError.code` and `detail`, and `onError` output, and look the code up in
   `protocol.md`, "Problems".
4. In the browser, check the console for CSP, CORS and `frame-ancestors` messages, and the
   network tab for `/jellycube/token`.
5. Still stuck: tell the user exactly what was checked, and what Jellycube answered (codes, not
   secrets).

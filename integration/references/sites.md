# Templates, sites, lifecycle, previews, domains

## Templates

Jellycube gives hosts **no** templates. The host builds its own Astro template, makes it
Jellycube-compatible, binds its host collections and places its islands. Use the `template`
skill (`npx skills add taftechnology/jc-skills/template`) and check the template with its
checker in `--host` mode.

There are two ways to use a template. Let the user choose:

| | A. Upload once, create by ID | B. Send the zip on each create |
| --- | --- | --- |
| Call | `templates.upload({ tenantRef, name, description, archive })` → `{ templateId, status: 'checking', warnings? }`; then `sites.create({ …, templateId })` | `sites.create({ …, archive, templateName })` |
| Checked | Yes: Jellycube test-imports it. Poll `templates.get({ tenantRef, templateId })` until `ready` or `failed` (`failedRoutes`, `error`) | No trial run: a bad template shows up as a failed site |
| Kept by | Jellycube, as a template of the host (`templates.list` lists the **ready** ones) | The host. Jellycube keeps only each site's own copy |
| Limits | 64 MB, 20,000 files, 20 templates per host, one upload `checking` at a time (`409`) | 64 MB per zip |

- `archive` is the zip's **bytes**: `Uint8Array` in JavaScript, `bytes` in Python, a binary
  string in PHP. Zipping is the host's job. Zip the project folder, with `package.json` and the
  lockfile at the root or in one top folder. Leave out `node_modules`, `dist`, `.astro` and
  `.git`.
- A template that mentions a Jellycube domain (`jellycube.cc`, `.dev`, `.com`), for example
  images on `assets.jellycube.cc`, is accepted with `warnings: [{ code: 'jellycube_domain',
  files, detail }]`. The site works, but visitors load those files from Jellycube. Point them
  at the template's own `public/` files if the site should be fully under the host's name.
- Templates belong to the host, not to one community. Any of the host's `tenantRef`s can upload,
  list or get them.
- **A template is a snapshot.** Changing the template's files changes nothing on Jellycube until
  the host uploads again (new `templateId`) or sends the new zip. **Existing sites never change**:
  each site keeps its own copy from the moment it was created. Hosts that ship a template with
  their code should upload again when its content hash changes.
- The trial import usually takes under a minute, and longer when builds are queued.

## Create a site

```ts
const { siteId, status, address } = await jellycube.sites.create({
  tenantRef: community.id,
  siteRef: `${community.id}:${label}`,      // the host's own ID for this website, 1 to 128 of [A-Za-z0-9._:-]
  label,                                    // the address label: <label>.<domain>
  templateId,                               // or: archive + templateName
  idempotencyKey: `${community.id}:${label}`,
});
// store { siteId, siteRef, label, address, status } on the community right away
```

- The community's Jellycube workspace is created automatically with its first site. Jellycube
  doesn't limit sites per community. "One website per community" is the host's own rule, if it
  wants one.
- **Idempotency:** pass a key that stays stable across retries and restarts (for example
  community + label). The same key with the same input replays the first answer, so a lost
  answer never creates two sites. The same key with **different** input (another label,
  `siteRef`, template or zip) is `409 idempotency_conflict`. Only successful creates are
  remembered, so a refused create can be retried with the same key. Without a key, the package
  uses a random one, but only for its own single retry.
- `403 site_limit_reached`: the host app's site limit (25 to start). Deleted sites don't count.

### Address labels

- 3 to 63 characters: lowercase letters, digits and single hyphens. Starts and ends with a
  letter or digit. No `--`, so no `xn--`. Not only digits.
- Reserved: `www`, `media`, `assets`, `static`, `cdn`, `builder`, `api`, `admin`, `app`, `auth`,
  `login`, `account`, `dashboard`, `ops`, `status`, `help`, `support`, `docs`, `mail`, `preview`,
  `staging`, `dev`, `test`, `internal`, `sites`, `jellycube`, plus any the host has.
- On the shared `jellycube.cc` domain, labels are shared with every other host and Jellycube's
  own sites, so common names are often taken. A host's own domain avoids that.
- Check first: `sites.checkAddress({ tenantRef, label })` → `{ available, code?, suggestions? }`.
  Suggest free labels from `suggestions`, and let the user edit the label before creating.
- Derive a default label from the community name (lowercase, hyphens), and keep it unique per
  attempt.

## Progress

Poll from the host's **server**, every 3 seconds at first, then every 10 seconds after about a
minute:

```ts
const p = await jellycube.sites.progress({ tenantRef, siteId });
// { status, phase, percent, stage, stages: [{ id, label, state, percent }], live }
```

| `phase` | Meaning | Show |
| --- | --- | --- |
| `queued` | Waiting for the builder (builds run one after another) | "Waiting to build…". `percent` is 0 |
| `starting` | The builder is waking up. This can take minutes | "Starting…". `percent` is 0 |
| `building` | Building. `stages` are `prepare`, `convert`, `check`, `finish` and so on | A bar and the stage labels |
| `done` | Built: `status: 'active'` | Mount the editor |
| `failed` | `status: 'failed'` | "This website couldn't be built": offer delete and create again |

`percent` stays at 99 or below until the build finishes. A typical build takes 1 to 3 minutes,
longer when builds are queued. The build runs on Jellycube's servers, so closing the page
doesn't stop it. On the next visit, read `sites.get` or `sites.progress` again.

## Live only after the first Publish

`status: 'active'` means built and editable, **not** published. A new site's address answers
`404` until someone with `full` access presses **Publish** in the editor. Nothing publishes
automatically. `sites.get` answers `live` and `publishedAt`. Show "Not published yet" until
`live` is true, and refresh it in `onPublished` or on the `site.published.v1` webhook.

## Lifecycle

| Call | Effect |
| --- | --- |
| `sites.get({ tenantRef, siteId })` | `{ siteId, siteRef, status, address, createdAt, live, publishedAt }`. `status`: `creating`, `active`, `suspended`, `deleted`, `failed` |
| `sites.suspend({ tenantRef, siteId })` | The live site shows a host-branded "unavailable" page (503). Previews, share links, the editor canvas, images and the content API are refused. Only lifecycle calls work |
| `sites.resume({ tenantRef, siteId })` | Back to `active`, served as before |
| `sites.changeAddress({ tenantRef, siteId, label })` | The new address works at once. The old one redirects permanently (path kept) and is never given to another site. Previews move with it |
| `sites.delete({ tenantRef, siteId })` | `deleted` at once: the address answers 404, and data and images are erased in the background. **The old label stays reserved for 12 months**, so check `checkAddress` before reusing it. Works on failed sites too |

- If the host itself is suspended by Jellycube, signed calls and new editor sessions answer
  `403 host_suspended`, but live sites keep serving.
- **Keep the host's record in step.** If `sites.get` or `sites.progress` answers
  `404 site_not_found`, or a `site.deleted.v1` webhook arrives, clear the stored `siteId` so the
  admin offers "create website" again instead of an error.

## Webhooks

Mount the handler with `onEvent`. Jellycube sends signed `POST <public URL>/jellycube/webhooks`
and retries with back-off for 24 hours. The package checks the signature, drops duplicate event
IDs and calls `onEvent(event)` once per event:

```ts
{ id: 'evt_…', type: 'site.published.v1', occurredAt: '2026-11-18T09:30:00Z', tenantRef, siteRef, siteId, data: {} }
```

| `type` | `data` |
| --- | --- |
| `site.created.v1` | — |
| `site.creation_failed.v1` | — |
| `site.published.v1` | — |
| `site.suspended.v1`, `site.resumed.v1` | — |
| `site.address_changed.v1` | old and new addresses |
| `site.deleted.v1` | — |
| `site.content_removed.v1` | `action`, `target`, `reasonCode`: Jellycube's support team removed an image, unpublished a page or suspended the site |

- Ignore unknown types and unknown fields. New ones may be added.
- Keep `onEvent` fast and idempotent: update a status or queue a job. If it throws, the package
  answers an error and Jellycube retries later.
- The webhook URL must be public `https:`.

## Preview links and password

| Call | Effect |
| --- | --- |
| `sites.createPreviewLink({ tenantRef, siteId })` | `{ url, createdAt, passwordProtected }`. One link per site, at `https://<address>/_preview/~s/<code>/`. Making a new link stops the old one |
| `sites.previewLink({ tenantRef, siteId })` | The current link; `url: null` when not shared |
| `sites.stopPreviewLink({ tenantRef, siteId })` | The link stops working at once |
| `sites.setPreviewPassword({ tenantRef, siteId, password })` | 8 or more characters, or `null` to remove. Changing it signs everyone out |

- The link shows the latest **saved** edits, view only, in a bar with Desktop, Tablet and Mobile
  sizes, with no Jellycube name. It's never indexed and never expires on its own.
- With a password set, the link (and `https://<address>/_preview/`) asks for it first, then sets
  a 24-hour cookie for that site's address only. Wrong guesses are rate-limited (5 per minute
  per IP, 30 failures per 10 minutes per site, then `429`).
- `full` users can also manage both from the editor's **Share** button. Restrict the host's own
  buttons to the same people.

## Own domain

By default, sites go on `<label>.jellycube.cc`. To use the host's own domain:

```ts
const claim = await jellycube.domain.claim({ tenantRef, domain: 'sites.example.org' });
// claim.records:
//   CNAME  *.sites.example.org                    → sites.jellycube.cc   (DNS only, not proxied)
//   TXT    _jellycube-challenge.sites.example.org → jellycube-verify=…
const now = await jellycube.domain.get({ tenantRef });
// { domain, status: 'none' | 'pending' | 'active', setBy, records, problem, checkedAt, verifiedAt }
```

- Publish **both** records in the host's DNS. The TXT record proves ownership. The **wildcard**
  CNAME sends every `<label>.<domain>` to Jellycube. In Cloudflare DNS, set it to "DNS only"
  (grey cloud). A proxied record doesn't verify.
- Ask again with `domain.get`. DNS is checked at most every 30 seconds. `problem` says what's
  missing: `ownership_record_missing`, `routing_record_missing`, `address_taken` (another host
  has it) or `saas_unavailable` (retry later).
- Once `active`, **new** sites go on `<label>.<domain>` and images on `assets.<domain>`, with
  certificates handled automatically. Existing sites keep their address, and moving them isn't
  supported. So **claim the domain before creating real sites.**
- One domain per host (`409 domain_limit_reached` for a second). It can't be a Jellycube domain,
  a local name, or one another host holds.
- Use a name dedicated to the websites (for example `sites.example.org`), not the admin's own
  hostname.
- `domain.remove({ tenantRef })`: a pending claim at any time; an active domain only when no
  site uses it. A domain Jellycube set up for the host can't be removed by the host.
- Read the domain from the host's config or an admin setting, and claim it from an admin
  action. Don't claim it automatically at start-up.

## Cookie notice

On by default for host sites. A notice appears only on pages that embed a third-party frame
(`www.youtube.com`, `youtube.com`, `player.vimeo.com`, `www.google.com`, `www.facebook.com`,
`twitter.com`, `platform.twitter.com`) or an island with `needsConsent: true`. Those stay blocked
until the visitor agrees. The choice is kept in the visitor's browser. `www.youtube-nocookie.com`
isn't on the list. Pages without such content never show a notice. Only Jellycube can turn the
notice off for a host.

## Security headers on host sites

Host sites get a content security policy built per site: the site's own origin, its image host,
any `https:` image, and exactly the `script`, `connect` and `forms` origins of the islands the
page uses. Third-party scripts that aren't islands won't run where the policy is enforced, so
put interactive features in islands (`host-data.md`).

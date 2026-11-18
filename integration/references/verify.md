# Verify: the checker, a manual test plan, go-live

## The checker

`scripts/check-host.mjs` (Node 18+, no install) calls a running host handler the way Jellycube
and the browser do:

```bash
node <skill>/scripts/check-host.mjs --base https://admin.example.com/jellycube
```

```bash
node <skill>/scripts/check-host.mjs --base https://admin.example.com/jellycube --tenant <a community ID> --env-file .env --origin https://admin.example.com --ping
```

| Option | Meaning |
| --- | --- |
| `--base` | `<public URL>/jellycube`, where the handler answers. `http://localhost:…` works for local runs |
| `--tenant` | A real `tenantRef` (community ID) with data, for the signed checks |
| `--site` | A `siteRef`, if the host's callbacks use it |
| `--env-file` | Reads `JELLYCUBE_HOST_ID`, `JELLYCUBE_KEY_ID`, `JELLYCUBE_KEY_SECRET` (and `JELLYCUBE_API_URL`). They can also come from the environment. Never pass secrets as arguments |
| `--origin` | The admin origin, to check the token route's CORS |
| `--ping` | Also calls Jellycube's `/ping` with the keys (needs `JELLYCUBE_API_URL`) |
| `--json` | Machine-readable output |
| `--self-test` | Checks the checker's own signing against `references/test-vectors.json` |

What it checks:
- **Signing self-test** against the official vectors.
- **Discovery and keys:** `issuer` equals `--base`, the JWKS has an ES256 public key with the
  right `kid`, and **no private part**.
- **Token route:** `401` with no session (a `400`/`415` means a body parser runs first), and no
  CORS for unknown origins.
- **Signature checks:** unsigned → `401`, wrong signature → `401`, tenant changed → `401`,
  replayed nonce → `401 replayed_request`, hour-old timestamp → `401 timestamp_out_of_range`, and
  an unsigned webhook is refused.
- **Theme:** colours, font, radius, `logoUrl`, product name.
- **Collections:** key and template binding name, fields, every page (paging, size, the `next`
  URL), every item (slug, required fields, value types, empty strings, dates), the single-item
  route, and `404` for an unknown slug.
- **Islands:** tag, script origin, `connect`/`forms` origins, the script's CORS header, and
  `integrity` against the **served bytes**.

With the official package, a `500` on theme, collections or islands means the package refused
the host's own data. The checker says so, and the host's `onError` log names the field.

Exit code: 1 when there are errors. Fix every `ERROR`. Read each `WARN` and `INFO`.

## Manual test plan

Run against the host's dev or staging host app (`setup.md`, "Local development"), in a
private window with third-party cookies blocked. Write down the result of each step.

1. **Connection:** `jellycube.ping({ tenantRef })` from the server answers `ok: true`.
2. **Template:** the template passes the `template` skill's checker in `--host` mode. If using
   upload, `templates.get` reaches `ready`.
3. **Create:** in the admin, create a website for a test community. The label check offers
   suggestions for a taken label, the progress shows its phases, and the status becomes
   `active`.
4. **Editor:** the editor appears on the admin page, with no Jellycube branding and the host's
   colour mode.
5. **Roles:** sign in as each role. `full` sees Publish and Share, `editor` edits but can't
   publish, `viewer` only looks, and an unlisted role can't open the editor.
6. **Publish:** before publishing, the site address answers 404 and the admin says "not
   published". Edit a heading, publish, and the address shows the edit. `onPublished` (or the
   webhook) updates the admin.
7. **Host data:** the site shows the community's real items, not the template samples. Change one
   item in the admin: the live page shows the change within about a minute, with no publish.
   Delete or unpublish one: it disappears.
8. **Isolation:** a second community's site never shows the first one's data, and a user of
   community A can't open community B's editor (`not_signed_in`).
9. **Edit in host:** on a bound block, "Edit in …" opens the right edit screen in the admin.
10. **Islands:** on the live site, the island renders and works (for example an RSVP posts and
    the count changes), with no CSP or CORS errors in the console. A `needsConsent` island waits
    for the cookie notice.
11. **Theme:** the status pages, and the editor if `useHostTheme` is set, use the host's
    colours.
12. **Previews:** create a share link, open it in another browser: view only, with device sizes.
    Set a password: the link asks for it. Stop sharing: the link stops working.
13. **Lifecycle:** suspend → the live site shows the unavailable page and the editor is
    read-only; resume → it's back. Rename → the old address redirects. Delete → the admin offers
    "create" again, and the old label is reported taken.
14. **Webhooks:** the host recorded `site.created.v1`, `site.published.v1`,
    `site.suspended.v1`, `site.resumed.v1`, `site.address_changed.v1` and `site.deleted.v1`.
15. **Revocation:** remove a member in the host. `sessions.revoke` ends their editor within 30
    seconds.
16. **Failure:** stop the host's API briefly. The live site keeps showing the last data, and the
    editor says the data couldn't refresh. The host's own pages show a friendly error, not a
    crash.

## Go-live checklist

- [ ] A **production** host app, separate from development, with its own keys stored as secrets.
- [ ] `JELLYCUBE_PUBLIC_URL` equals the registered public URL, and the checker passes against
      production with `--ping`.
- [ ] Admin origins list every origin that frames the editor, including any outer frame.
- [ ] The role table covers every role that should open the editor, including organisation-level
      roles.
- [ ] Shared nonce and event stores if there's more than one server process.
- [ ] The own content domain is claimed and `active` **before** real sites are created (if wanted).
- [ ] The template is uploaded to the production host app (`ready`), or its zip ships with the
      host.
- [ ] Every data write path sends `notifySourceChanged` after commit, with a persisted
      `contentVersion`.
- [ ] Island scripts are served from the public URL's origin with
      `Access-Control-Allow-Origin: *`, not altered by a CDN, and the hashes are checked against
      production.
- [ ] Jellycube errors are mapped (`server.md`, "Errors"), with network failures as `502`, and
      logged by `code`.
- [ ] `sessions.revoke` runs when access is removed.
- [ ] Webhooks are handled, and a WAF allows `POST /jellycube/webhooks`.
- [ ] The site limit is enough for launch (ask Jellycube to raise it beforehand).
- [ ] The manual test plan passed on staging.

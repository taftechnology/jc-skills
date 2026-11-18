# Host islands

A host island is an interactive feature a host app provides (RSVP, donate, a form, a live
total) as a versioned custom element. Templates **place** islands; the v1 editor can't add them.
Islands are injected only on **host sites** (sites served for a host app), not on stand-alone
Jellycube sites. Source: `docs/integrations/build/phase-4/4.4-islands-and-policies.md`,
`worker/src/sdk/islands/injectIslands.ts` (used only by `worker/src/sdk/domains/serveHostAddress.ts`),
`engines/sdk/islands.ts`.

## In the template

```html
<demo-rsvp data-jc-island="demo-rsvp" data-jc-props='{"eventSlug":"harvest-supper"}'></demo-rsvp>
```

- The element **is** the custom element: its tag name must equal the `data-jc-island` value,
  and that tag must be in the host's island list. Otherwise it is not treated as an island.
- Tag names: `^[a-z][a-z0-9-]{1,40}$` and containing a `-` (a valid custom element name).
- `data-jc-props` is a JSON object. HTML-entity-encoded JSON is fine (Astro writes
  `data-jc-props={JSON.stringify(x)}` as `{&quot;…&quot;}`; it is decoded before parsing).
- Props are validated against the island's schema. Only a subset is understood: `object`,
  `string` (with `maxLength`), `number` (finite), `boolean`, `enum`, `required`, nested
  `properties`. Unknown rule types fail closed. Invalid or unparseable props → the attribute is
  removed and the island renders its empty state.
- Don't add the island's `<script>` yourself. For each island used on a page, Jellycube appends
  one `<script type="module" src="…" integrity="…" crossorigin="anonymous">` before `</body>`.
- The import keeps `data-jc-island` and `data-jc-props` (all other `data-jc-*` are stripped).
  Source: `engines/import/conversion/attributes.ts`.

### Per-entry props on a collection page

Fill props from the entry with `data-cms-attr`. JSON braces pass through, only placeholders
are filled:

```html
<my-island data-jc-island="my-island"
  data-jc-props='{"eventSlug":"sample-slug"}'
  data-cms-attr='data-jc-props={"eventSlug":"{slug}"}'></my-island>
```

The JSON must not contain `;` (it separates `data-cms-attr` bindings). If a placeholder has no
value the attribute is removed (empty state). Wrap the section in `data-cms-if="<field>"` to show
it only for entries that turn the feature on. Source: `engines/content/template.ts`,
`binding.ts`.

## On the host side (what the host app must serve)

The host lists islands at `GET /islands` (signed). Each item:

```json
{ "tag": "demo-rsvp", "version": "1.0.0",
  "script": "https://admin.host.example/islands/rsvp.v1.0.0.js",
  "integrity": "sha384-…",
  "connect": ["https://api.host.example"], "forms": [], "needsConsent": false,
  "props": { "type": "object", "properties": { "eventSlug": { "type": "string", "maxLength": 128 } }, "required": ["eventSlug"] } }
```

- `script`: `https:` on the host's `apiBaseUrl` origin or one of its `allowedOrigins` (`http:` on a
  local hostname only in local development).
- `integrity`: `sha384-` or `sha512-` base64 of the exact file. Don't compute it by hand: the host
  packages print it (`jellycube-server sri <file>`, `python -m jellycube_host sri <file>`,
  `vendor/bin/jellycube-host sri <file>`).
- Serve script files with **`Access-Control-Allow-Origin: *`**: sites load them cross-origin as
  module scripts with an integrity check, which browsers refuse without it.
- `connect` and `forms`: plain `https:` origins (no path, query or wildcard). They are added to
  the site's policy (`connect-src`, `form-action`), together with the script origin.
- `needsConsent: true` puts the island behind the site's cookie notice.
- Anything failing a check is dropped and logged. The list is cached per host for 10 minutes.

Source: `engines/sdk/islands.ts` (`parseIslandList`, `validIntegrity`, `validateIslandProps`),
`packages/host/README.md` (islands section), step file 4.4.

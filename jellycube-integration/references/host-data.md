# Host data: collections, freshness, edit links, islands, theme

## Host collections

The host's own data (events, service times, notices, products, team members…) shows on its
sites, laid out by the template, while the data stays in the host. Jellycube fetches it
signed and keeps a read-only copy per site and community.

```ts
jellycube.handler({
  getUser,
  collections: {
    'engagement.events': {
      label: 'Events',
      hasBody: true,                                  // items carry a Markdown body
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'date', type: 'date' },
        { name: 'location', type: 'text' },
        { name: 'image', type: 'image' },
        { name: 'rsvp', type: 'boolean' },
      ],
      list: async ({ tenantRef, cursor }) => {        // one page: { items, next }
        const page = await db.events.publishedFor(tenantRef, { after: cursor, limit: 100 });
        return { items: page.rows.map(toItem), next: page.nextCursor ?? null };
      },
      get: async ({ tenantRef, slug }) => {           // one item, or null (404)
        const row = await db.events.publishedBySlug(tenantRef, slug);
        return row ? toItem(row) : null;
      },
      editUrl: (slug) => `https://admin.example.com/events/${slug}`,   // "Edit in <product>"
      manageUrl: 'https://admin.example.com/events',
    },
  },
});

const toItem = (row) => ({
  slug: row.slug,                                     // stable, URL-safe
  fields: { title: row.title, date: row.startsOn /* YYYY-MM-DD */, location: row.location ?? undefined, image: row.imageUrl ?? undefined, rsvp: row.rsvp },
  body: row.descriptionMarkdown ?? '',
  updatedAt: row.updatedAt.toISOString(),
});
```

**Always filter by the `tenantRef` the package passes in.** It comes from the verified
signature. Return only items that should be public (published, not drafts, not private).

### Rules

| Thing | Rule |
| --- | --- |
| Key | `^[A-Za-z0-9._-]{1,128}$`. The template binds it as a collection **name**: lowercased, with `.` and `_` turned into `-` (`engagement.events` → `engagement-events`). The name must match `^[a-z][a-z0-9-]{0,47}$`, so start the key with a letter and keep it short |
| Fields | 1 to 50. Name `^[A-Za-z][A-Za-z0-9_]{0,47}$`. Types: `text` (≤2,000 characters), `longText` (≤100,000), `number`, `boolean`, `date` (**`YYYY-MM-DD`**), `url` (full `https://` address), `email`, `image` (an `https://` address or a path), `choice` (with `options`, values must be one of them), `tags` (array of strings, ≤100). `required: true` means every item must have it. Don't use the reserved names `slug`, `body`, `id`, `status`, `version`, `createdAt`, `updatedAt`, `publishedAt` as field names |
| Item | `{ slug, fields, body?, updatedAt?, publishedAt? }`. `slug` matches `^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$`: lowercase, digits, hyphens, ≤80. `body` is Markdown, ≤100,000 characters. Dates are ISO date-times, like `2026-10-01T09:00:00Z` |
| Optional empty values | Leave the field out (or `undefined`). An empty string fails typed fields such as `date`, `url`, `email`, `image` and `number` |
| Paging | `list` returns `{ items, next }`. `next` is an opaque cursor string, or `null` on the last page. Jellycube reads at most 20 pages, 4 MB per page and 5,000 items per collection |
| Errors | An invalid item makes the handler answer `500 host_error`, and `onError` names the field. Jellycube then keeps the last good copy and the editor says the data couldn't refresh |

- **Slugs from IDs:** many databases use IDs like `svc_marys_sun` or `42`. Make a stable slug
  (`svc-marys-sun`, `event-42`, or a real URL slug), use the **same** function in `list`, `get`,
  the template and `notifySourceChanged`, and map it back in `get`.
- The package builds `itemsUrl`, `itemUrlTemplate`, `editUrlTemplate` and `manageUrl` itself
  from the public URL. Never write them by hand.
- The template binds these names before any data exists: its own sample content shows until
  the host serves data (`jellycube-template` skill, "Host collection names").

### When Jellycube reads it

- **Discovery:** shortly after a site is created, Jellycube fetches `GET /collections` and every
  collection's items. **Keep the host reachable then**: with the host up, a new site has its data
  within about a minute after `active`. If discovery fails, the next try is 15 minutes later.
- **Refresh:** on each freshness notification (below), plus a full backstop refresh about every
  6 hours.
- **Failures:** if the host is down, slow or returns bad data, the last good copy stays live and
  the editor shows that the data couldn't refresh. Nothing breaks on the live site.
- Live pages render the bound data **at request time**, so data changes show without a publish.

## Freshness notifications

Tell Jellycube when data changes, and the live site shows it within seconds:

```ts
await saveEvent(event);                               // 1. commit the change first
await jellycube.notifySourceChanged({                 // 2. then notify
  tenantRef: event.communityId,
  source: 'engagement.events',                        // the collection key
  ids: [event.slug],                                  // changed slugs; [] = the whole collection
  contentVersion: nextVersion(event.communityId, 'engagement.events'),
});
// → { accepted: true, duplicate: boolean }
```

- **Notify only after the change is committed.** Jellycube fetches the changed items straight
  away, so a notification sent before the commit (or inside the transaction) fetches the old
  data.
- **`contentVersion`**: a positive integer that rises with each change, per community and source.
  Keep the counter in the host's database (for example a row per `(tenantRef, source)`,
  incremented in the same transaction as the change). A repeated or lower version answers
  `duplicate: true` and does nothing.
- **`ids`** are the item **slugs** exactly as the collection serves them, at most 200. One bad
  slug (an ID with `_`, uppercase letters) makes the whole notification fail with
  `400 bad_request`. For a delete or unpublish, send the slug too: `get` now answers `null`, and
  Jellycube removes the item. Use `[]` after bulk imports.
- Send notifications for every write path: create, update, delete, publish and unpublish, bulk
  edits, imports, and background jobs.
- **Don't fail the user's save** if the notification fails. Log it, and optionally retry from a
  queue. The 6-hour backstop catches anything missed.
- Limit: 600 notifications per minute per host, then `429` with `Retry-After`. Batch slugs for
  bulk changes.
- Only communities that have a website need notifications. Skip the call when the community has
  no `siteId`.

## Edit in the host

The editor never edits host data. On a block bound to a host collection it offers **"Edit in
<your product>"**, which calls the admin's `onEditInHost({ collection, slug, url })`.

- `editUrl: (slug) => 'https://admin.example.com/events/' + slug` is called **once**, with the
  literal `'{slug}'`, to make a template. Build the URL by plain concatenation: don't
  `encodeURIComponent` the slug (an encoded `%7Bslug%7D` fails the package's check). The editor
  encodes the real slug when it fills the template in.
- `manageUrl` is the list screen, used when no single item is selected.
- Both must be `https:` addresses on the host's admin origins (or `http:` on a local name in
  local development). Otherwise the handler answers `500 host_error` naming the collection.
- In `onEditInHost`, route inside the admin when `url` is on the admin's own origin, else open
  it in a new tab. Make sure the target screen opens the item, for example `?edit=<slug>`
  opening the edit form.

## Islands

An island is an interactive feature (RSVP, donate, sign-up form, live total, map, video) that
the host ships as a versioned custom element and the template places on a page.

```ts
jellycube.handler({
  getUser,
  islands: async ({ tenantRef }) => [{
    tag: 'acme-rsvp',                                          // custom element name, has a hyphen
    version: '1.2.0',
    script: 'https://admin.example.com/islands/acme-rsvp.v1.2.0.js',
    integrity: 'sha384-…',                                     // npx jellycube-server sri <file>
    connect: ['https://api.example.com'],                      // origins the island may fetch
    forms: [],                                                 // origins it may submit forms to
    needsConsent: false,                                       // true: waits for cookie consent
    props: { type: 'object', properties: { eventSlug: { type: 'string', maxLength: 128 } }, required: ['eventSlug'] },
  }],
});
```

| Field | Rule |
| --- | --- |
| `tag` | `^[a-z][a-z0-9-]{1,40}$`, with at least one hyphen |
| `script` | `https:` on **the public URL's origin** exactly (the origin serving `/jellycube`), not a CDN or another subdomain. Versioned file name. `http:` only on a local name while developing |
| `integrity` | `sha384-…` or `sha512-…` of the **exact bytes served**. Make it with `npx jellycube-server sri <file>` (`python -m jellycube_host sri`, `vendor/bin/jellycube-host sri`). Never compute it by hand |
| `connect`, `forms` | Bare `https:` origins (`https://api.example.com`): no path, no trailing slash, no wildcard. The site's security policy allows exactly these for pages that use the island |
| `needsConsent` | `true` for anything that sets cookies or tracks (video, maps, social). The cookie notice holds it until the visitor agrees |
| `props` | JSON Schema subset: an `object` with `string`, `number`, `boolean`, `enum`, `maxLength` and `required`. The template's `data-jc-props` is validated against it |

**Serving the script**
- It's loaded as `<script type="module" crossorigin="anonymous" integrity="…">` from the site's
  origin, so the file **must** be served with `Access-Control-Allow-Origin: *`, or the browser
  refuses it. Static hosts: add a header rule for `/islands/*`, for example a Netlify or
  Cloudflare Pages `_headers` file, `vercel.json` headers, or nginx `add_header`.
- Serve it byte for byte as hashed. Minifiers, CDN "auto minify", compression rewrites and
  injected snippets change the bytes and break the integrity check.
- A new version means a new file name, a new `integrity` and a new `version`. Keep serving older
  versions for a while, because pages and caches may still request them. Cache versioned files
  as immutable.

**In the template** (details in the `jellycube-template` skill):

```html
<acme-rsvp data-jc-island="acme-rsvp" data-jc-props='{"eventSlug":"harvest-supper"}'></acme-rsvp>
```

The tag name must equal `data-jc-island`. Per-item props come from a binding such as
`data-cms-attr="data-jc-props={json}"` inside a bound list. Islands are injected only on **host
sites**, when the page is served. The editor can't add or remove them.

**Writing the island**
- A plain custom element (`customElements.define(tag, class extends HTMLElement {…})`), using a
  shadow root for its own styles. It runs on the site's origin, not the host's.
- Read props with `JSON.parse(this.getAttribute('data-jc-props') || '{}')`. Hide the island (or
  its section) when a required prop is missing.
- Find the host's API with `new URL(import.meta.url).origin`, or a URL listed in `connect`.
- **The API the island calls** must answer CORS for the **site origins**
  (`https://<label>.jellycube.cc` and/or `https://<label>.<own domain>`), including the
  preflight for JSON requests (`Access-Control-Allow-Headers: content-type`). Work out the
  community from the request's `Origin` (the site address stored at create and on
  `site.address_changed.v1`), never from a client-sent ID alone. Rate-limit it, because it's
  public and has no user session.
- Don't use cookies. Islands are third-party code on the site's origin.

## Theme

```ts
jellycube.handler({
  getUser,
  theme: async ({ tenantRef }) => ({
    tokens: {
      colors: { primary: '#1d4ed8', primaryForeground: '#ffffff', background: '#ffffff', foreground: '#0f172a', muted: '#f1f5f9', border: '#e2e8f0' },
      fontFamily: 'Inter',
      radius: '0.5rem',
    },
    logoUrl: 'https://admin.example.com/logo.svg',
    productName: 'Example Host',
    editor: { useHostTheme: true },   // optional: recolour the editor itself
  }),
});
```

- Return `null` when there's no branding: the route answers `404` and Jellycube's neutral look
  is used.
- Colours must be `#rrggbb`. The font must be one of `Inter`, `Roboto`, `Open Sans`, `Lato`,
  `Source Sans 3`, `Nunito` or `system-ui` (no web font is loaded, so it shows only where the
  font is installed). The radius looks like `0.5rem`.
- **`logoUrl` must always be set**: either `null` (no logo), or an `https:` address on the
  **public URL's origin** (or an origin in `browserOrigins`), at most 512 characters. Leaving it out,
  pointing it at a CDN or another domain, or using `http:` (even locally) answers
  `500 host_error` (`theme.logoUrl is invalid`). Serve the logo from the same origin as the
  handler, or use `null` while developing locally.
- `productName` is 1 to 60 characters. Anything else answers `500 host_error` naming the field:
  fix the value.
- Where it's used: status pages (suspended, not found, error), the embed's own screens, and the
  editor, but only with `editor.useHostTheme: true`. Then the brand colour comes from `primary`,
  darkened for readable white text, and light-mode greys from `background` and `foreground` when
  they contrast at 7:1 or more. The font and corner radius follow too. Status colours, dark-mode
  greys and the website in the canvas never change.
- Light or dark is set in the browser: `colorMode` or `editor.setColorMode()` (`editor.md`).
- Jellycube caches the theme for a few minutes. A per-community theme works: branch on
  `tenantRef`.

# CMS: content collections and the `data-cms-*` binding contract

Jellycube has two places content can live. A project can use either, both, or neither.

1. **Project content collections** (F6): Astro content collections in the project's own files.
   The CMS view edits the files; changes reach the site at the next publish.
2. **Database collections** (F31): collections kept by Jellycube (native, or external from a URL),
   plus **host collections** from a host app (SDK). Pages that carry `data-cms-*` attributes are
   filled from them **at request time**, with no rebuild.

Note: the first time a site's CMS opens, every collection the project declares is copied into
the database and managed there from then on (the project's files are untouched). So a project
collection that pages also bind with `data-cms-*` keeps working after that switch. Source:
`docs/features-overview/f31-database-cms.md` §9.

## 1. Project content collections (F6)

Source: `docs/features-overview/f6-structured-cms.md`, `engines/cms/`.

- Config: `src/content.config.ts` (or legacy `src/content/config.ts`). It is read as text, never
  run.
- Each collection needs a locatable folder: `glob({ base: "…" })` with literal strings, or
  `src/content/<key>`. A `file()` loader, or an imported or spread schema, makes the collection
  read-only in the CMS (listed with the reason).
- Fields are the top-level keys of one `z.object({...})`. Edited types: text, long text, number,
  true/false, date, link, email, image, choice, tags. Anything else is shown read-only and
  preserved exactly.
- Entries: Markdown/MDX front matter (round-trip, only changed fields written), JSON or YAML.
  The Markdown body is edited as formatted text unless it uses things the editor can't write
  back (MDX imports, components, expressions, HTML, tables, footnotes, reference links, task
  lists), in which case it opens as Markdown source.
- Image fields upload PNG, JPEG or WebP up to 8 MB and store the returned address. Fields using
  Astro's `image()` helper take a path only.
- New fields are inserted as optional; reserved and duplicate names are refused.
- Detail pages are collection templates (`[slug].astro`): see `editability.md`.

## 2. The binding contract (database, external and host collections)

Source: `engines/content/binding.ts` (the contract, `CMS_ATTRIBUTES`), `template.ts`
(placeholders, attribute rules, dates), `query.ts` (sort, filter, limits), `scope.ts` (roles),
`each.ts`, `fieldsBlock.ts`, `boundText.ts`, `pages.ts` (manifest); summary table in
`docs/features-overview/f31-database-cms.md`.

The page is built once by Astro with sample content. At request time the marked elements are
filled from the collection. **Built values stay as the fallback**: a list naming a collection
the site doesn't have keeps its built content, so the page never breaks for lack of data.
**Every known `data-cms-*` attribute is removed from served pages** (unknown `data-cms-*` names
are not in the list, so they are neither applied nor removed).

Bindings are ordinary attributes, so they never change the build or the import. They can be
literal or set from Astro expressions (for example a layout prop); only the built HTML matters.

### Lists

| Attribute | On | Syntax and limits |
| --- | --- | --- |
| `data-cms-list="events"` | container | Collection name (`^[a-z][a-z0-9-]{0,47}$`) or `@current` (the page's own collection). |
| `data-cms-sort="date:asc, title"` | list | Comma-separated `field` or `field:asc`/`field:desc`; field `^[A-Za-z][A-Za-z0-9_]{0,47}$`; at most 4 keys; others ignored. Missing values always sort last; ties break by slug. |
| `data-cms-filter="category=wine; featured!=false"` | list | `;`-separated `field=value` or `field!=value`; at most 8; case-insensitive; a tags field matches any tag. Values may read the page's entry: `section={section}`. |
| `data-cms-limit="3"`, `data-cms-offset="1"` | list | 1–6 digits, capped at 500. A page renders at most 2,000 items across all lists. |
| `data-cms-exclude="current"` | list | Leaves out the entry the page shows. Only `current` is meaningful. |
| `data-cms-start="after-current"` | list | Only entries after the page's own (in list order). `after-current-wrap` wraps round. |
| `data-cms-hide-empty` | list | Removes the whole list element when it has no entries. |
| `data-cms-item` | inside list | The **first** one is the template cloned per entry; every other built item is removed. `data-cms-item="first"` is a separate template used for the first entry only. |
| `data-cms-empty` | inside list | Kept only when the list is empty. |

Lists are bound outermost first. **A list nested inside another list's item keeps its built
content** (not supported).

### Values

| Attribute | Effect |
| --- | --- |
| `data-cms-field="title"` | Sets the element's text (on `<meta>`, its `content`). If the element's only child is inline formatting (`strong`, `b`, `em`, `i`, `u`, `s`, `span`, `code`, `mark`, `small`, `sub`, `sup`) wrapping all its text, the text goes inside it. |
| `data-cms-format="markdown"` / `"date"` | With `data-cms-field`: sanitized Markdown (bodies), or a formatted date. Default is plain text. |
| `data-cms-text="{title} \| Site"` | Text from placeholders. |
| `data-cms-attr="href=/events/{slug}; src={image}"` | Attributes from placeholders, `;`-separated `name=template`, at most 16. |
| `data-cms-if="image"` / `"!image"` | Keeps the element only when the value is present (or absent). Present means: not null/false, a non-blank string, or a non-empty list. |
| `data-cms-date="EEEE d MMMM yyyy"` | Date style: preset `full`, `long` (default), `medium`, `short`, `iso`, or a pattern of `yyyy MMMM MMM MM M dd d EEEE EEE` (max 64 chars). Always UTC. |
| `data-cms-locale="en-GB"` | Locale for dates; unsupported values fall back to `en-US`. |
| `data-cms-each="tags"` + `data-cms-each-item` | One item per value of a list field; the first item is the template. Mark it `hidden` so a page built with no values can show values later (the clone drops `hidden`). `data-cms-hide-empty` removes the element when there are none. |

`<script>` and `<style>` elements never take bound values.

### Placeholders

Pattern: `{name}`, `{name ?? fallback}`, each optionally `|url` (URL-encoded) or `|date`
(formatted with the element's `data-cms-date`/`data-cms-locale`). Names are
`@?[A-Za-z][A-Za-z0-9_]{0,47}`. Anything else in braces is **left as literal text**, so JSON
braces such as `{"eventSlug":"{slug}"}` pass through and only `{slug}` is filled. Other
modifiers (`{x|upper}`) are not placeholders and print literally.

In `data-cms-attr`, a `;` always separates bindings, so a template value can't contain `;`.

### Names a binding can read

- Fields of the entry.
- Built-ins on every entry: `slug`, `body`, `updatedAt`, `publishedAt`.
- Roles that adapt to any collection (for generic pages): `@title` (field named title, name,
  label or heading, else the first text field, else the slug), `@image` (first image field with
  a value), `@summary` (summary, description, excerpt, intro or subtitle, else the first long
  text), `@url` (the entry's page), `@label`, `@collection`, `@collectionUrl`.

Scope: bindings inside a list item read that item's entry. Bindings elsewhere read the page's
entry and collection on a collection or entry page, and keep their built content on every other
page. A list's own heading reads the page, not the items.

### Attribute safety

- Never bindable: `on*` handlers, `style`, `srcdoc`, `srcset`, `imagesrcset`, `is`, `xmlns*`,
  `data-cms-*`. Names must match `^[a-z][a-z0-9_.:-]{0,63}$` (case-insensitive).
- URL attributes (`href`, `src`, `action`, `formaction`, `poster`, `cite`, `data`, `background`,
  `ping`, `xlink:href`, `manifest`, `longdesc`, `usemap`) must pass the link rule (`http(s)`,
  `mailto`, `tel`, relative or `#`, no `//`, ≤2,048 chars) or the attribute is removed.
- An attribute whose placeholder has no value is removed.
- Values only ever become text or attribute values, never markup (Markdown bodies are sanitized).

### Fields block (fields added later)

```html
<dl data-cms-fields data-cms-fields-exclude="imageAlt" data-cms-hide-empty>
  <div data-cms-field-item hidden>
    <dt data-cms-field-label>Label</dt>
    <dd data-cms-field-value data-cms-image-class="…" data-cms-link-class="…">Value</dd>
  </div>
</dl>
```

Shows every field of the entry that the page doesn't otherwise show (`body` always counts as
shown), by type: images as `<img>`, URLs and emails as links, dates formatted, tags joined,
yes/no only when yes, empty fields skipped. Options: `data-cms-fields-exclude="a, b"`,
`data-cms-date`, `data-cms-locale`, `data-cms-hide-empty`. Mark the template row `hidden` so a
page served without the database shows no sample row. The classes on the generated `<img>` and
`<a>` come from `data-cms-image-class` / `data-cms-link-class`: use the project's own styling.

### Head bindings

`<title>` and `<meta>` take bindings like any element (`data-cms-text` on `<title>`,
`data-cms-attr="content=…"` or `data-cms-field` on `<meta>`), so entry and collection pages can
fill their own title and description. Source: `docs/templates-plan.md` rule 27 ("including the
detail page and its head"); `binding.ts` (`meta` → `content`).

## 3. Collection pages and `cms.json`

Every database collection automatically gets `/<collection>` (list) and `/<collection>/<slug>`
(entry) pages, rendered into pages the template built. The template says which pages in an
optional manifest at `public/_jellycube/cms.json` (served as `/_jellycube/cms.json`, read up to
64 KB). Source: `engines/content/pages.ts`, `worker/import-container/src/collectionPages.ts`.

```json
{
  "version": 1,
  "fallback": { "list": "/jellycube-cms/collection", "item": "/jellycube-cms/item" },
  "collections": {
    "events": { "list": "/events", "item": "/events/harvest-supper", "keep": ["a-hand-built-slug"] }
  }
}
```

- `collections` (at most 100): pages designed for one collection. `list` is a built list page;
  `item` is **one built entry page** whose markup every entry renders into. `keep` (≤200 slugs)
  lists entries whose hand-built page is served as is.
- `fallback`: generic pages any other collection renders into. They are never served at their
  own address. Use roles (`@title`, `@image`, `@summary`, `@url`, `@label`, `@collectionUrl`) on
  them so they fit any collection. The Jellycube starters put them in
  `src/pages/jellycube-cms/collection.astro` and `item.astro`; any path works.
- Paths: start with `/`, no `//`, `\`, `:`, `.` or `..` segments, ≤512 chars. Malformed pieces are
  dropped silently.
- A real page of the release at the same address wins over a fallback page (a collection named
  `about` never replaces `/about`). Unknown and draft entries get the site's own 404.

Collection names: `^[a-z][a-z0-9-]{0,47}$`. Slugs: lowercase letters, numbers and hyphens, up to
80 characters. Reserved field names: `slug`, `body`, `id`, `status`, `version`, `createdAt`,
`updatedAt`, `publishedAt`. Source: `engines/content/collections.ts`.

## 4. Host collections (templates for a host app)

A host's collection key becomes the collection name lowercased with `.` and `_` turned into `-`
(`engagement.events` → `engagement-events`), and must then match the collection name rule.
Bind it with `data-cms-list="<that name>"` and name it in `cms.json`. Bindings work before the
host serves the collection: the built sample content shows until then.
Source: `engines/sdk/collectionName.ts`, `DECISIONS.md` D-9.

## 5. External source format (for reference)

An external collection reads one JSON file (`"jellycube": "content-source/v1"`, a `collection`
with `fields`, and `items`). Field types: `text`, `longText`, `number`, `boolean`, `date`, `url`,
`email`, `image`, `choice` (with `options`), `tags`. Limits: public `https` only, 8 s timeout,
4 MB per page, 20 pages, 5,000 entries. Full format: F31 "The Content Source Contract".

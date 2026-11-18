# Styling, images and assets, routing, CSP and custom code

## Styling and Tailwind

Tailwind is **optional**. Any styling approach builds and imports; the v1 editor has no style
editing.

How Jellycube reads Tailwind:

- Found via the `tailwindcss` dependency, a Vite plugin whose name contains `tailwind`, a
  `tailwind.config.{js,mjs,ts}`, or a stylesheet at `src/styles/{global,globals,index}.css` or
  `src/{global,globals,index}.css` that contains `@import "tailwindcss"`, `@tailwind …` or `@config`.
- Mode: Tailwind v4 without plugins → `browser` (a version-pinned compiler styles the editor
  preview). Tailwind v3, or a config with plugins (v3 `plugins: [`, v4 `@plugin`/`@utility`/
  `@variant`/`@config`) → `built-only`. No Tailwind → `none`.
- The editor's text toolbar offers custom font, size, weight and colour as compiled Tailwind
  classes and reads text styles (h1–h6, paragraph) from the built site.

**Tailwind v4: use 4.1 or later.** The import writes JSON and runtime files into the project;
Tailwind v4 scans every file for class-like words. Jellycube appends an `@source not` block to
each stylesheet that imports Tailwind v4 to exclude its generated folders, and `@source not`
needs 4.1+. On older v4 the converted build can gain stray CSS rules, the stylesheet hash
changes and pages fail verification (code-only).

The deploy builds with the project's real Tailwind pipeline and checks preview CSS against it
(parity gate).

## Images and assets

- Editable images are elements whose `src`/`alt` are literal (see `editability.md`). Files in
  `public/` with a root-relative path, or absolute `https:` URLs, both work.
- Images rendered by `astro:assets` / `<Image />` / imported files work but their `src` is
  generated, so they can't be replaced in the editor.
- Uploads (editor and CMS): PNG, JPEG or WebP, up to 8 MB.
- Hashed `/_astro/` assets are compared by content hash during verification, so bundling
  differences don't fail a page.
- Host sites: `img-src` allows any `https:` image, `data:` and self.
- Host templates: referencing a Jellycube domain (`jellycube.cc`/`.dev`/`.com`) in checked files
  gives an upload **warning**; it still works.
- Size: the whole project must stay within the import limits (64 MB, 20,000 files).

## Routing

- File-based Astro routing. `index` collapses; `[param]` becomes `:param`.
- Static pages only (no `prerender = false`, no server output). Every dynamic route is
  pre-rendered with `getStaticPaths`.
- Dynamic routes: see `editability.md` (collection templates; rest and mixed routes stay code).
- Database collection pages live at `/<collection>` and `/<collection>/<slug>` and never replace
  a real page of the release.
- Edge order: hostname → site → redirects → pointer → asset → site 404. Ship a `404` page if you
  want a styled not-found page (Jellycube serves "the site's own 404 page" for unknown entries).
  Redirect rules are managed in the dashboard, not in the project.

## CSP and custom code

**Stand-alone Jellycube sites:** Jellycube's site policy generator and custom code slots are not built
yet. There is no site CSP to design around today; don't add one for
Jellycube's sake.

**Host sites** get a policy (report-only by default; a host can set sites to enforce). Directives:

| Directive | Allows |
| --- | --- |
| `default-src` | `'self'` |
| `script-src` | `'self' 'unsafe-inline'` + island script origins |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` |
| `img-src` | `'self' data: https:` (+ media host) |
| `font-src` | `'self' data: https://fonts.gstatic.com` |
| `connect-src` | `'self'` + island connect origins |
| `frame-src` | `https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.google.com` |
| `frame-ancestors` | `'self'` + editor origins |
| `form-action` | `'self'` + island form origins |
| `base-uri` | `'self'` |
| `object-src` | `'none'` |

What that means for a host template, if the host enforces: third-party scripts, stylesheets
other than Google Fonts, fetches to other origins, other iframes and forms posting to another
origin (for example a form service) are blocked unless they go through an island that declares
them. Under report-only they are reported, not blocked. Tell the user; don't remove their
features.

Cookie notice on host sites (on by default): `<iframe>`s to `www.youtube.com`, `youtube.com`,
`player.vimeo.com`, `www.google.com`, `www.facebook.com`, `twitter.com`,
`platform.twitter.com`, and islands with `needsConsent`, are held until the visitor agrees.
`www.youtube-nocookie.com` is not on the list.

**In the editor preview**, third-party scripts don't run and forms don't send; a share link
shows the real built site.

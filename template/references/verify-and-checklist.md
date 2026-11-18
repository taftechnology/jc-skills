# Verify locally, then the pre-upload checklist

## What the import keeps and strips

| Kept as is | Changed or removed |
| --- | --- |
| Your source files, frontmatter (verbatim), components, styles, `public/` | Page markup is stored as IR (`jellycube/ir`) and rendered through generated modules (`jellycube/pages`); a page that doesn't verify keeps its original source |
| `data-cms-*` attributes (removed only from **served** pages, at request time) | Every `data-jc-*` attribute except `data-jc-island` and `data-jc-props` |
| `data-jc-island`, `data-jc-props` | Tailwind v4 stylesheets get a marked `@source not` block during the converted build only (removed afterwards) |
| Scripts, styles, comments, expressions (as locked fragments, reproduced exactly) | — |

Sources: `engines/import/conversion/attributes.ts`, `conversion/astroToIr.ts`,
`pipeline/convertStage.ts`, `pipeline/tailwindSources.ts`, `engines/content/binding.ts`.

## Verify locally

1. Run the bundled checker (Node 18+, no dependencies):

   ```bash
   node <skill-folder>/scripts/check-template.mjs <project-folder>
   ```

   Add `--host` for a template made for a host app (turns on the Jellycube-domain warning),
   `--json` for machine-readable output. Errors are pre-flight refusals; warnings cost
   editability or a binding; info is context. Exit code 1 when there are errors.

2. Install and build the way the import does, from a clean copy:

   ```bash
   npm ci --ignore-scripts
   ./node_modules/.bin/astro build
   ```

   (Use your package manager's frozen-lockfile install with `--ignore-scripts`.) The build must
   succeed without lifecycle scripts and without your `build` script.

3. Build a second time into another folder and compare. Any difference is excluded from
   verification and is worth removing if it isn't intended:

   ```bash
   ./node_modules/.bin/astro build --outDir dist-2
   diff -r dist dist-2
   ```

4. If the project uses bindings, check the built HTML still carries them (`grep -r "data-cms-" dist`)
   and that `public/_jellycube/cms.json` is in `dist/_jellycube/cms.json`.

5. Zip without `node_modules`, `dist`, `.astro` and `.git`. Keep it under 64 MB unpacked and
   20,000 files.

6. Import it into Jellycube (dashboard import, or a host template upload, which runs a test
   import). Read the import report: pre-flight passes, and the per-page grades and "code-driven
   regions" notes match what you expect. A page reported `code-only` didn't verify; its
   mismatch is in the report.

## Pre-upload checklist

Hard requirements (refused otherwise):

- [ ] `package.json` at the project root, with `astro` 5 or later (4 is best effort)
- [ ] One lockfile at the root: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` or `bun.lockb` (not only `bun.lock`)
- [ ] Not a monorepo root (`packages/*/package.json`, `apps/*/package.json`)
- [ ] Static output: `output: "static"`, or no `output`/`adapter`/`...` anywhere in an inline `defineConfig({…})`
- [ ] No `onRequest` in the Astro config, no `src/middleware.*`, no `src/actions/`, no `.github/workflows/`
- [ ] No `export const prerender = false` in any page
- [ ] At least one `.astro` page in `src/pages/`
- [ ] ≤ 64 MB and ≤ 20,000 files
- [ ] Builds with `--ignore-scripts` and plain `astro build`

Jellycube compatibility (cost editability or a feature if missed):

- [ ] No own files under `jellycube/`, `.jellycube/`, `src/components/jellycube/`, `src/lib/jellycube/`; only `cms.json` in `public/_jellycube/`
- [ ] No authored `data-jc-*` except `data-jc-island` / `data-jc-props`
- [ ] Tailwind v4 is 4.1 or later (if Tailwind v4 is used)
- [ ] Content the user wants editable is literal markup with literal `src`/`alt`/`href` (where that fits their design)
- [ ] Dynamic routes the user wants editable use whole-segment params (`[slug].astro`) and build at least one page
- [ ] Every `data-cms-*` attribute is a known one with valid syntax (the checker reports this)
- [ ] `cms.json`, if present, is valid and names pages that exist
- [ ] Islands: tag name = `data-jc-island` value, contains `-`, props are a JSON object without `;` in bound templates
- [ ] Host template: the host serves island scripts with `Access-Control-Allow-Origin: *` and correct SRI; Jellycube-domain warnings are intended

Not required by Jellycube (don't impose these): a particular CSS framework, folder names for
components or layouts, a single layout, `og.png`, `--color-primary`, a fixed dependency list,
Google Fonts. These are house rules of Jellycube's own starter templates
(`docs/templates-plan.md`), not import requirements.

# Project setup: what makes an Astro project importable

Everything here is checked in **pre-flight**, before anything is built. A project that
breaks one of the "Refused" rules is not imported at all. Paths are relative to your
project root.

## Refused at pre-flight (hard requirements)

| # | Rule |
| --- | --- |
| P1 | A `package.json` at the project root. For a zip, zip the folder that contains `package.json` (a single top folder in the zip is fine for template uploads). |
| P2 | `astro` in `dependencies` or `devDependencies`. |
| P3 | Astro major **5 or later** (no upper bound). Major **4** is accepted "best effort" (some layouts may fall back to code-only). Anything else is refused. The major is the first number in the declared range (`^7.4.0` → 7). |
| P4 | A lockfile at the root: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` or `bun.lockb`. **Bun's text `bun.lock` is not recognised**, so a project with only `bun.lock` is refused. |
| P5 | Not a monorepo root: no `packages/*/package.json`, no `apps/*/package.json`, and not "no pages at `src/pages` but a nested `*/src/pages/`". |
| P6 | At most **64 MB** (64 × 1024 × 1024 bytes) of source and at most **20,000 files**. The template upload counts every entry in the zip, so leave `node_modules`, `dist` and `.astro` out. |
| P7 | Static output. `output` must be `"static"`, or provably left at Astro's default. The config is read as text, never run, so "provably default" means **all** of: the word `output` appears nowhere in the file (not even in a comment), the word `adapter` appears nowhere, the file contains no `...`, and it exports an inline object (`export default defineConfig({ … })` or `export default { … }`). No config file at all also counts as static. `server`, `hybrid` or anything unreadable is refused. |
| P8 | No middleware: no `src/middleware.ts` / `src/middleware.js`, and the word `onRequest` must not appear anywhere in the Astro config file (it is a plain text match, so a comment counts too). |
| P9 | No Astro Actions (`src/actions/`). |
| P10 | No `.github/workflows/` in the project. |
| P11 | No on-demand pages: no `export const prerender = false` in any `src/pages/**/*.astro`. |
| P12 | At least one `.astro` page under `src/pages/`. |

Notes only (never refused): no `packageManager` field (the lockfile decides the package
manager); no Tailwind (styling runs built-only).

The config file names read are `astro.config.mjs`, `.js`, `.ts`, `.mts`, `.cjs`
(first found wins).

## How the project is installed and built

Your `package.json` scripts are **not** used.

- Install from the lockfile only, with lifecycle scripts off:
  `npm ci --ignore-scripts --no-audit --no-fund` (npm), `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --package-import-method=copy`,
  `yarn install --frozen-lockfile --ignore-scripts`, `bun install --frozen-lockfile --ignore-scripts`.
- Only `esbuild`, `sharp`, `@parcel/watcher` and `lightningcss` get their native build step re-run
  (`SCRIPT_ALLOWLIST`). Any other dependency that needs a `postinstall` script to work will be
  broken in the build.
- The build is the project's own Astro binary: `./node_modules/.bin/astro build --outDir <dir>`.
  `prebuild`/`postbuild` scripts and a custom `build` script never run. Astro integrations in
  the config do run (they are part of `astro build`).
- The container runs Node 22.
- Time budgets: 8 minutes per command, 15 minutes for the whole container phase
  (`DEFAULT_IMPORT_LIMITS`).
- The original project is built **twice** ("double baseline"). Whatever differs between the two
  builds (a timestamp, a random id) is excluded from verification, so it cannot fail the import,
  but it is noise. Deterministic builds give the cleanest result.

## Folder layout Jellycube reads

Jellycube follows Astro's standard layout.

| Path | Meaning to Jellycube |
| --- | --- |
| `src/pages/**/*.astro` | Pages. Only `.astro` pages are converted into editable pages. |
| `src/layouts/`, `src/components/` | Listed for reporting; components are edited through their instances (see `editability.md`). |
| `src/content/`, `src/content.config.ts` (or legacy `src/content/config.ts` / `.js`) | Astro content collections for the structured CMS (see `cms-bindings.md`). |
| `public/` | Static files, served as they are. |
| `public/_jellycube/cms.json` | Optional manifest for database CMS collection pages (see `cms-bindings.md`). |

Nothing else about your folders is required. Name and organise components, layouts, styles
and libraries however the project already does.

### Paths Jellycube writes (don't use them for your own files)

The import writes its own files into the project. Keep these names free:

- `jellycube/` (IR in `jellycube/ir`, page modules in `jellycube/pages`, content edits as
  `jellycube/**/*.json`)
- `.jellycube/` (build scratch: baselines, converted output, parked pages)
- `src/components/jellycube/`, `src/lib/jellycube/` (editor runtime)
- `public/_jellycube/collection-routes.json`, `public/_jellycube/component-usage.json` (written
  beside the preview)
  `cms.json` in that folder is yours.
- Any URL segment starting with `__jellycube` (for example `__jellycube-entry`) is never served
  at its own address.

## Template-only checks (host template uploads)

When a host uploads a template zip (`POST /api/sdk/v1/templates`), Jellycube also:

- refuses a zip with no `package.json` or `astro.config.*` at its root or under one top folder;
- refuses over-limit zips (P6) from the zip headers, before inflating;
- **warns** (does not refuse) when `.astro`, `.html`, `.css`, `.ts`, `.js`, `.json` or `.md` files
  mention `jellycube.cc`, `jellycube.dev` or `jellycube.com` (`package.json`, lockfiles,
  `node_modules`, `dist` and `.astro` are skipped). Visitors' browsers would load those addresses
  from Jellycube. Paths like `jellycube-cms` and `_jellycube` are fine.
- runs a full test import; the template is `ready` only if it completes with no failing route.

A site created straight from a host's zip (`POST /api/sdk/v1/sites` with a zip body) skips the
upload checks and runs the ordinary import.

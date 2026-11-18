---
name: template
description: Build or check an Astro project so it imports, edits, serves and publishes correctly in Jellycube, as a stand-alone Jellycube site or as a template for a host app. Use when creating, converting, reviewing or preparing to upload a Jellycube template or site, or when working with data-cms-* bindings, public/_jellycube/cms.json, host islands (data-jc-island, data-jc-props) or the Jellycube import report (code-only pages, code-driven regions).
---

# Jellycube-compatible Astro templates and sites

Jellycube imports an Astro project, converts its pages into editable data, verifies the
converted HTML matches the original build, and serves it from Cloudflare. This skill lists what
Jellycube needs from the project. It adds those requirements; it decides nothing else.

## Ground rules (read first)

1. **The user's design, features, components, styling and project rules always win.** Never
   restyle, restructure, rename, add dependencies or remove features for Jellycube's sake unless
   the user asks. Only make changes a hard requirement below forces, and say why.
2. **Separate the three kinds of rules** and say which one applies:
   - **Hard requirement**: the import refuses the project (`references/project-setup.md`).
   - **Editability trade-off**: the project works, but a region is locked or a page is
     code-only (`references/editability.md`). Explain it; let the user choose.
   - **Optional feature**: CMS bindings, `cms.json`, islands. Add only when asked.
3. **When Jellycube allows several options, present them** instead of picking one (for example
   any styling approach, any lockfile of the four, literal markup or code-rendered lists).
4. If a Jellycube requirement conflicts with something the user wants, stop and ask.
5. Don't treat Jellycube's own starter-template house style (single layout, Tailwind only,
   `og.png`, fixed dependency list) as a requirement.

## Hard requirements (summary)

- `package.json` at the root with `astro` **5 or later** (4 best effort) and a lockfile:
  `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` or `bun.lockb`.
- **Static output**: `output: "static"`, or no `output`, `adapter` or `...` anywhere in an inline
  `defineConfig({…})` config. No `onRequest` in the config, no `src/middleware.*`,
  no `src/actions/`, no `.github/workflows/`, no `export const prerender = false`.
- At least one `.astro` page in `src/pages/`. Not a monorepo root.
- **≤ 64 MB and ≤ 20,000 files** (leave out `node_modules`, `dist`, `.astro`).
- Builds with lifecycle scripts off and plain `astro build` (your `build` script is not run).

Details: `references/project-setup.md`.

## Editability (summary)

The v1 editor edits text, images (`src`, `alt`) and links (`href`, `target`) that are
**literal** in the markup. `{expressions}`, loops (`.map`), `<script>`, `<style>` and comments
become locked regions; expression attributes aren't editable. Whole-segment dynamic routes
(`[slug].astro`) are edited as one template for every entry; data-rendered parts stay locked.
Don't author `data-jc-*` except `data-jc-island` and `data-jc-props`; keep the `jellycube/`,
`.jellycube/`, `src/components/jellycube/` and `src/lib/jellycube/` names free.
Details: `references/editability.md`.

## Optional features

- **CMS**: Astro content collections (edited in the CMS, published on rebuild) and the
  `data-cms-*` binding contract (lists and fields filled at request time from database,
  external or host collections), plus `public/_jellycube/cms.json`. Exact syntax, limits and
  built-in fields: `references/cms-bindings.md`.
- **Host islands** (templates for a host app): `<x-y data-jc-island="x-y" data-jc-props='{…}'>`,
  scripts with SRI served with `Access-Control-Allow-Origin: *`: `references/host-islands.md`.
- **Tailwind, images, routing, CSP and custom code**: `references/styling-assets-csp.md`.

## Workflow

1. Ask (or read from context) whether this is a stand-alone Jellycube site or a template for a
   host app, and which optional features the user wants.
2. Run the checker on the project:
   `node <this-skill>/scripts/check-template.mjs <project> [--host] [--json]`.
3. Fix **errors** (hard requirements) with the smallest change. Report **warnings** as
   trade-offs and change them only if the user agrees.
4. Add optional features only as requested, in the project's existing style.
5. Verify locally and walk the checklist: `references/verify-and-checklist.md`.

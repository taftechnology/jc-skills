# Editability: what the editor can change, and what stays code

An import never fails because of markup. Every page converts; anything the converter can't
express is kept verbatim as a locked **fragment**, and a page whose converted render differs
from the original is reverted to its source and reported **code-only**. So these rules decide
how much of a page a site owner can edit, not whether the site works.

None of this tells you how to design. Code-driven regions are fine wherever the user wants
logic, data or interactivity. Use this file to explain the trade-off, and to keep the parts the
user wants editable in an editable form.

## What the v1 editor edits

The v1 editor is **content edit mode**: text, images and links in place. No sidebars, no style
controls, no adding, removing or reordering sections. Source: `docs/features-overview/f29-content-edit-mode.md`,
`f2-real-time-visual-editing.md` (v1/v2 split).

| Thing | Editable when | Source |
| --- | --- | --- |
| Text | It is literal text in the markup (an element's own text, not `{expression}` output). | `engines/import/conversion/astroToIr.ts`, F29 |
| Formatted text | Written literally and inside the strict grammar: `strong`, `em`, `u`, links, `br`, classed `span`s, list items. Other mixed inline markup shows a "this part is code" hint. | F2 ("Formatted text"), F29 |
| Images | `src` and `alt` are literal attribute values on the element. Replace (upload or URL) and alt text. | F29, F2, `conversion/attributes.ts` |
| Links | `href` is a literal value. `href` and `target` are edited; new-tab writes `target="_blank" rel="noopener noreferrer"`. Accepted URLs: `http(s):`, `mailto:`, `tel:`, relative paths and `#` anchors, up to 2,048 characters. | F29, `engines/draft/links.ts` (`isSafeHref`) |

## What becomes a locked fragment

Source: `engines/import/conversion/astroToIr.ts` (`convertNode`, `fragmentReasonFor`),
`engines/import/types/ir.ts` (`IrFragmentReason`).

| Markup | Fragment reason |
| --- | --- |
| Any `{expression}` child (`{title}`, `{cond && <p/>}`) | `expression` |
| An expression containing `.map(`, `.filter(` or `for (` | `map-loop` |
| An expression containing `import(` | `dynamic-import` |
| `<script>…</script>` and `<style>…</style>` contents | `script` / `style` |
| HTML comments | `comment` |
| `<Fragment>` | the wrapper is kept as code; its children still convert |

Attributes: only quoted literal values are editable. Expression (`a={x}`), spread (`{...p}`),
shorthand (`{href}`) and template-literal values stay code ("come from expressions, so their
values are not editable until a developer makes them static"). `class:list` and other Astro
directives are kept verbatim. Source: `conversion/attributes.ts`, `grading/editability.ts`.

So, for example, an image rendered with `astro:assets` (`<Image src={photo} />`) or an imported
image file has a generated `src` and can't be replaced in the editor; a plain `<img src="/images/x.webp">`
can. That is a trade-off to explain, not a rule to enforce: keep `astro:assets` when the user wants
its optimisation. Source: `docs/templates-plan.md` rule 12 (Jellycube's own starter rules),
consistent with the attribute rules above.

## The editability grade

Per page: `score = (all nodes − fragments) / all nodes × 100`. `visual` at 90 or more,
`partial` above 0, `code-only` at 0 or when the page didn't verify. The run's score is the mean
across pages. The report lists, per page, how many regions are code-driven ("N region(s) are
code-driven and stay locked in the editor") and how many attributes come from expressions.
Source: `engines/import/grading/editability.ts`, `pipeline/convertStage.ts`.

## Verification (why a page can become code-only)

The converted project is built and every route's HTML is compared with the original build.
Before comparing, both sides are normalised: attribute order, whitespace outside
`script`/`style`/`pre`/`textarea`, class order, Jellycube's own `data-jc-*` editor attributes,
and content-hashed `/_astro/` file names (compared by hash). Regions that differed between the
two baseline builds are excused. Any other difference reverts that page to code-only.
Source: `engines/import/verification/routeGate.ts`, `verification/normalizeHtml.ts`,
`verification/doubleBaseline.ts`.

Things known to cause a difference: Tailwind v4 below 4.1 (see `styling-assets-csp.md`),
anything whose output depends on which modules exist in the project.

## Components

Component instances are edited in place. Text, images and links a component writes literally,
or from site-wide data (imports and constants, such as `{brand.name}` from a config file, and
markup under a condition on them), are shared: one edit reaches every instance on every page.
Props, `Astro`, loops and slots stay per instance. Source: F2 ("Shared component edits",
"Component edit mode").

Jellycube's own starter templates keep main page content in the page file and use components
for site chrome (`docs/templates-plan.md` rule 14). That is their house style, not a
requirement.

## Dynamic routes (collection templates)

Source: `engines/import/utils/paths.ts` (`isCollectionTemplatePath`, `routeFromPagePath`),
`pipeline/collectionRoutes.ts`, `docs/features-overview/f6-structured-cms.md` §6.

- A dynamic page whose every dynamic part is one whole segment (`blog/[slug].astro`,
  `[lang]/about.astro`) converts as a **collection template**. The route becomes `/blog/:slug`.
- Rest routes (`[...path].astro`) and mixed segments (`[a]-[b].astro`) stay code only.
- The template converts only if the original build produced at least one page for it and all
  of them verify. A static page file always owns its address; a built page two templates could
  both produce belongs to neither.
- In the editor it is listed as "<folder> entry". An edit to the template's own literal elements
  applies to every entry. Anything an entry's data rendered (`{entry.data.title}`, loop output,
  its images and links) has no editable node and takes no edit: it is code-driven and locked.
  Entry content is edited in the CMS (or the host app for host collections).
- `getStaticPaths` runs only inside the build sandbox, never in the converter.

## Jellycube's editor attributes

The editor adds `data-jc-*` attributes at render time (`data-jc-id`, `data-jc-editable`,
`data-jc-locked`, `data-jc-path`, `data-jc-kind`, `data-jc-c`, `data-jc-k`, `data-jc-ce`,
`data-jc-r`, `data-jc-rs`). The import **strips every `data-jc-*` attribute** from your source
except `data-jc-island` and `data-jc-props` (host islands). Don't author any other `data-jc-*`.
Source: `engines/import/conversion/attributes.ts` (`AUTHORED_JC_ATTRIBUTES`),
`verification/normalizeHtml.ts` (`EDITOR_ATTRIBUTES`).

## Editable-and-data-driven pattern

When a list is rendered from data but its design should stay editable, write the **first item
literally** in the page (it gets editor ids) and render the rest with code. With the database CMS
binding, mark both with `data-cms-item`: the first one is the template for every entry and the
others are removed at serve time (`engines/content/binding.ts`). This is how the reference host
template keeps its event card design editable. It's optional; a fully code-rendered list works,
it is just locked.

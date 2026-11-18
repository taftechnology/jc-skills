#!/usr/bin/env node
/**
 * Jellycube template checker. Node 18+, no dependencies, no network.
 *
 *   node check-template.mjs <project-folder> [--host] [--json]
 *
 * Mirrors Jellycube's import pre-flight (errors), and flags what costs
 * editability or a binding (warnings). Every check names the Jellycube source
 * file it follows; see the skill's references/ for the full rules.
 *
 * Exit code: 0 with no errors, 1 with errors, 2 on bad usage.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const root = args.find((arg) => !arg.startsWith('--'));
const hostMode = args.includes('--host');
const jsonMode = args.includes('--json');

if (root === undefined || !existsSync(root) || !statSync(root).isDirectory()) {
  console.error('Usage: node check-template.mjs <project-folder> [--host] [--json]');
  process.exit(2);
}

const findings = [];
const add = (level, code, message, file) => findings.push({ level, code, message, ...(file ? { file } : {}) });

// ---------------------------------------------------------------- files

const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', '.cache']);
const files = [];
let totalBytes = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (entry.isFile()) {
      files.push(relative(root, full).split(sep).join('/'));
      totalBytes += statSync(full).size;
    }
  }
}

walk(root);
files.sort();

const has = (path) => files.includes(path);
const read = (path) => readFileSync(join(root, path), 'utf8');

// ---------------------------------------------------------------- pre-flight (engines/import/analysis/preflight.ts)

const MAX_BYTES = 64 * 1024 * 1024; // engines/import/types/job.ts
const MAX_FILES = 20000;

let pkg = null;

if (!has('package.json')) {
  add('error', 'missing-package-json', 'No package.json at the project root.');
} else {
  try {
    pkg = JSON.parse(read('package.json'));
  } catch {
    add('error', 'not-an-astro-project', 'package.json is not valid JSON, so Astro cannot be found.', 'package.json');
  }
}

const deps = { ...(pkg?.devDependencies ?? {}), ...(pkg?.dependencies ?? {}) };
const astroRange = pkg?.dependencies?.astro ?? pkg?.devDependencies?.astro ?? null;

if (pkg !== null && astroRange === null) {
  add('error', 'not-an-astro-project', 'astro is not in dependencies or devDependencies.', 'package.json');
}

if (astroRange !== null) {
  const match = /(\d+)/.exec(astroRange);
  const major = match ? Number.parseInt(match[1], 10) : null;

  if (major === null || (major < 5 && major !== 4)) {
    add('error', 'unsupported-astro-version', `Astro ${astroRange} is not supported. Jellycube imports Astro 5 and every later major.`, 'package.json');
  } else if (major === 4) {
    add('warn', 'astro-4-best-effort', 'Astro 4 is converted best effort; some layouts may fall back to code-only.', 'package.json');
  }
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']; // analysis/buildManifest.ts
const lockfile = LOCKFILES.find(has);

if (lockfile === undefined) {
  add('error', 'missing-lockfile', has('bun.lock')
    ? 'Only bun.lock was found; the import recognises package-lock.json, pnpm-lock.yaml, yarn.lock or bun.lockb.'
    : 'No lockfile at the root (package-lock.json, pnpm-lock.yaml, yarn.lock or bun.lockb).');
}

if (files.some((path) => /^packages\/[^/]+\/package\.json$/.test(path))) add('error', 'monorepo-root', 'Monorepo root: packages/*/package.json found. Import the individual project.');
else if (files.some((path) => /^apps\/[^/]+\/package\.json$/.test(path))) add('error', 'monorepo-root', 'Monorepo root: apps/*/package.json found. Import the individual project.');

if (totalBytes > MAX_BYTES) add('error', 'source-too-large', `The project is ${(totalBytes / 1048576).toFixed(1)} MB (without node_modules, dist, .astro, .git); the limit is 64 MB.`);
if (files.length > MAX_FILES) add('error', 'source-too-large', `The project has ${files.length} files; the limit is ${MAX_FILES}.`);

// Astro config: read as text, never run (analysis/projectManifest.ts).
const CONFIG_NAMES = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts', 'astro.config.cjs'];
const configPath = CONFIG_NAMES.find(has);

if (configPath !== undefined) {
  const source = read(configPath);
  const declared = /(?:^|[\s,{])output\s*:\s*['"`]([^'"`]+)['"`]/.exec(source)?.[1] ?? null;
  const leavesDefault = !/\boutput\b/.test(source) && !/\badapter\b/.test(source) && !source.includes('...')
    && (/export\s+default\s+defineConfig\s*\(\s*\{/.test(source) || /export\s+default\s*\{/.test(source));
  const output = declared === 'static' || declared === 'server' || declared === 'hybrid' ? declared : leavesDefault ? 'static' : 'unknown';

  if (output !== 'static') {
    add('error', 'unsupported-output-mode', output === 'unknown'
      ? 'Output mode could not be proven static. Set output: "static", or remove every mention of "output", "adapter" and "..." (comments included) and export an inline defineConfig({ … }).'
      : `Output mode "${output}" is not supported. Set output: "static" and remove any adapter.`, configPath);
  }

  if (/\bonRequest\b/.test(source)) add('error', 'unsupported-feature', 'The word "onRequest" appears in the Astro config (middleware hook; comments count too).', configPath);
}

if (has('src/middleware.ts') || has('src/middleware.js')) add('error', 'unsupported-feature', 'Astro middleware (src/middleware.*) is not supported.');
if (files.some((path) => path.startsWith('src/actions/'))) add('error', 'unsupported-feature', 'Astro Actions (src/actions/) are not supported.');
if (files.some((path) => path.startsWith('.github/workflows/'))) add('error', 'unsupported-feature', '.github/workflows/ in the project is refused by the import.');

const pages = files.filter((path) => path.startsWith('src/pages/') && path.endsWith('.astro'));

if (pages.length === 0) {
  add('error', 'no-pages', 'No .astro pages under src/pages.');
  if (files.some((path) => path.includes('/src/pages/'))) add('error', 'monorepo-root', 'A nested src/pages was found: this looks like a monorepo root.');
}

for (const page of pages) {
  if (/export\s+const\s+prerender\s*=\s*false/.test(read(page))) add('error', 'unsupported-output-mode', 'On-demand page (export const prerender = false).', page);
}

if (pkg !== null && typeof pkg.packageManager !== 'string') add('info', 'no-package-manager', `No packageManager field; the lockfile (${lockfile ?? 'none'}) decides.`, 'package.json');

const lifecycle = Object.keys(pkg?.scripts ?? {}).filter((name) => /^(pre|post)?install$|^prepare$|^(pre|post)build$/.test(name));
if (lifecycle.length > 0) add('info', 'scripts-not-run', `The import never runs these scripts: ${lifecycle.join(', ')}. It installs with --ignore-scripts and runs astro build directly.`, 'package.json');

// ---------------------------------------------------------------- reserved paths (pipeline/tailwindSources.ts, convertStage.ts, collectionRoutes.ts)

for (const prefix of ['jellycube/', '.jellycube/', 'src/components/jellycube/', 'src/lib/jellycube/']) {
  const hit = files.find((path) => path.startsWith(prefix));
  if (hit) add('warn', 'reserved-path', `${prefix} is written by the Jellycube import; keep your own files out of it.`, hit);
}

for (const path of files.filter((p) => p.startsWith('public/_jellycube/') && p !== 'public/_jellycube/cms.json')) {
  add('warn', 'reserved-path', 'Only cms.json in public/_jellycube/ is authored; Jellycube writes the other files there.', path);
}

// ---------------------------------------------------------------- dynamic routes (utils/paths.ts)

for (const page of pages) {
  const segments = page.slice('src/pages/'.length, -'.astro'.length).split('/');
  const dynamic = segments.filter((segment) => segment.includes('[') || segment.includes(']'));

  if (dynamic.length > 0 && !dynamic.every((segment) => /^\[[A-Za-z_$][\w$]*\]$/.test(segment))) {
    add('warn', 'code-only-route', 'Rest ([...x]) or mixed ([a]-[b]) route: it stays code only in the editor.', page);
  }
}

// ---------------------------------------------------------------- Tailwind (analysis/tailwind.ts, pipeline/tailwindSources.ts)

const tailwindRange = deps.tailwindcss ?? null;

if (tailwindRange !== null) {
  const version = /(\d+)\.(\d+)/.exec(tailwindRange);
  const major = version ? Number(version[1]) : null;
  const minor = version ? Number(version[2]) : null;

  if (major === 4 && minor !== null && minor < 1) add('warn', 'tailwind-below-4-1', `Tailwind ${tailwindRange}: Jellycube needs 4.1+ to keep its generated files out of the class scan; below that pages can fail verification (code-only).`, 'package.json');
  if (major === 3) add('info', 'tailwind-built-only', 'Tailwind v3: the editor preview runs built-only (no in-browser compiler).', 'package.json');
}

// ---------------------------------------------------------------- markup scans

const MARKUP_FILES = files.filter((path) => /\.(astro|html)$/.test(path) && (path.startsWith('src/') || path.startsWith('public/')));

/** Opening tags with their attributes, from markup outside the frontmatter. */
function tagsOf(source) {
  const body = source.replace(/^---[\s\S]*?\n---/, (block) => block.replace(/[^\n]/g, ' '));
  const tags = [];
  const tagPattern = /<([a-zA-Z][\w.:-]*)((?:\s+(?:[^\s=>{"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|[^\s>]+))?|\{[^{}]*\}))*)\s*\/?>/g;
  let match;

  while ((match = tagPattern.exec(body)) !== null) {
    const line = body.slice(0, match.index).split('\n').length;
    const attrs = new Map();
    const attrPattern = /([^\s=>{"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|(\{(?:[^{}]|\{[^{}]*\})*\})|([^\s>]+)))?/g;
    let attr;

    while ((attr = attrPattern.exec(match[2])) !== null) {
      const value = attr[3] ?? attr[4] ?? attr[6] ?? (attr[5] !== undefined ? null : '');
      attrs.set(attr[1], { value, expression: attr[5] !== undefined });
    }

    tags.push({ name: match[1], attrs, line, index: match.index });
  }

  return { tags, body };
}

// engines/content/binding.ts CMS_ATTRIBUTES (+ fieldsBlock.ts FIELDS_ATTRIBUTES)
const CMS_ATTRIBUTES = new Set([
  'data-cms-list', 'data-cms-sort', 'data-cms-filter', 'data-cms-limit', 'data-cms-offset', 'data-cms-exclude', 'data-cms-hide-empty',
  'data-cms-item', 'data-cms-empty', 'data-cms-field', 'data-cms-format', 'data-cms-text', 'data-cms-attr',
  'data-cms-if', 'data-cms-date', 'data-cms-locale', 'data-cms-each', 'data-cms-each-item', 'data-cms-start',
  'data-cms-fields', 'data-cms-fields-exclude', 'data-cms-field-item', 'data-cms-field-label', 'data-cms-field-value', 'data-cms-image-class', 'data-cms-link-class',
]);
const COLLECTION_NAME = /^[a-z][a-z0-9-]{0,47}$/; // content/collections.ts
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,47}$/; // content/query.ts
const NAME = /^@?[A-Za-z][A-Za-z0-9_]{0,47}$/;
const PLACEHOLDER = /\{\s*(@?[A-Za-z][A-Za-z0-9_]{0,47})(?:\s*\?\?\s*(@?[A-Za-z][A-Za-z0-9_]{0,47}))?\s*(?:\|\s*(url|date)\s*)?\}/g; // content/template.ts
const BLOCKED_ATTRIBUTES = new Set(['style', 'srcdoc', 'srcset', 'imagesrcset', 'is', 'xmlns']);
const ISLAND_TAG = /^[a-z][a-z0-9-]{1,40}$/; // sdk/islands.ts
const DATE_PRESETS = new Set(['full', 'long', 'medium', 'short', 'iso']);

function checkPlaceholders(template, file, line, attribute) {
  const near = template.match(/\{\s*@?[A-Za-z][^{}"]*\}/g) ?? [];
  const valid = new Set((template.match(PLACEHOLDER) ?? []));

  for (const token of near) {
    if (!valid.has(token)) add('warn', 'cms-placeholder', `${attribute}: "${token}" is not a placeholder ({field}, {a ?? b}, |url, |date) and prints literally.`, `${file}:${line}`);
  }
}

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|quot|apos|amp|lt|gt);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    const named = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' }[lower];
    if (named) return named;
    const code = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

let usesBindings = false;
const listNames = new Set();

for (const file of MARKUP_FILES) {
  const source = read(file);
  const { tags, body } = tagsOf(source);
  const isPage = file.startsWith('src/pages/');

  // Editability (advisory): engines/import/conversion/astroToIr.ts, attributes.ts.
  if (file.endsWith('.astro')) {
    const frontmatter = /^---([\s\S]*?)\n---/.exec(source)?.[1] ?? '';

    if (/from\s+['"]astro:assets['"]/.test(frontmatter)) add('info', 'generated-image-src', 'Uses astro:assets: those images have generated src values the editor cannot replace (a trade-off, not an error).', file);
    if (isPage) {
      const loops = (body.match(/\{[^{}]*\.(map|filter)\s*\(/g) ?? []).length;
      if (loops > 0) add('info', 'locked-loop', `${loops} loop(s) in the markup render as locked code regions in the editor.`, file);
    }
  }

  for (const tag of tags) {
    const at = `${file}:${tag.line}`;
    const tagName = tag.name.toLowerCase();

    for (const [name, { value, expression }] of tag.attrs) {
      const lower = name.toLowerCase();

      if (lower.startsWith('data-jc-') && lower !== 'data-jc-island' && lower !== 'data-jc-props') {
        add('warn', 'editor-attribute', `${name} is a Jellycube editor attribute; the import strips it.`, at);
      }

      if (!lower.startsWith('data-cms-')) continue;
      usesBindings = true;

      if (!CMS_ATTRIBUTES.has(lower)) {
        add('warn', 'cms-unknown-attribute', `${name} is not part of the binding contract: it does nothing and stays on served pages.`, at);
        continue;
      }

      if (expression || value === null) continue; // Set from code: checked on the built HTML only.
      const text = value.trim();

      switch (lower) {
        case 'data-cms-list':
          if (text !== '@current' && !COLLECTION_NAME.test(text)) add('warn', 'cms-list-name', `data-cms-list="${value}" is not a collection name (^[a-z][a-z0-9-]{0,47}$) or @current.`, at);
          else listNames.add(text);
          break;
        case 'data-cms-sort':
          for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
            const [field = '', direction] = part.split(':').map((p) => p.trim());
            if (!FIELD.test(field) || (direction !== undefined && !/^(asc|desc)$/i.test(direction))) add('warn', 'cms-sort', `Sort key "${part}" is ignored (use field or field:asc|desc).`, at);
          }
          if (text.split(',').filter((p) => p.trim()).length > 4) add('warn', 'cms-sort', 'Only the first 4 sort keys are used.', at);
          break;
        case 'data-cms-filter':
          for (const part of text.split(';').filter((p) => p.trim())) {
            if (!/^\s*([A-Za-z][A-Za-z0-9_]{0,47})\s*(!=|=)\s*(.*?)\s*$/.test(part)) add('warn', 'cms-filter', `Filter "${part.trim()}" is ignored (use field=value or field!=value).`, at);
          }
          if (text.split(';').filter((p) => p.trim()).length > 8) add('warn', 'cms-filter', 'Only the first 8 filters are used.', at);
          break;
        case 'data-cms-limit':
        case 'data-cms-offset':
          if (!/^\d{1,6}$/.test(text)) add('warn', 'cms-count', `${name}="${value}" is ignored (digits only).`, at);
          else if (Number(text) > 500) add('info', 'cms-count', `${name} is capped at 500.`, at);
          break;
        case 'data-cms-exclude':
          if (text !== 'current') add('warn', 'cms-exclude', 'data-cms-exclude only understands "current".', at);
          break;
        case 'data-cms-start':
          if (text !== 'after-current' && text !== 'after-current-wrap') add('warn', 'cms-start', 'data-cms-start is "after-current" or "after-current-wrap".', at);
          break;
        case 'data-cms-item':
          if (text !== '' && text !== 'first') add('warn', 'cms-item', 'data-cms-item takes no value, or "first".', at);
          break;
        case 'data-cms-format':
          if (!['markdown', 'date', 'text'].includes(text)) add('warn', 'cms-format', 'data-cms-format is "markdown" or "date".', at);
          break;
        case 'data-cms-date':
          if (!DATE_PRESETS.has(text) && !/(yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE)/.test(text)) add('warn', 'cms-date', 'data-cms-date is a preset (full, long, medium, short, iso) or a yyyy/MMMM/MMM/MM/M/dd/d/EEEE/EEE pattern.', at);
          break;
        case 'data-cms-field':
        case 'data-cms-each':
          if (!NAME.test(text)) add('warn', 'cms-name', `${name}="${value}" is not a field, built-in or @role name.`, at);
          if (lower === 'data-cms-field' && (tagName === 'script' || tagName === 'style')) add('warn', 'cms-unbindable', '<script> and <style> never take bound values.', at);
          break;
        case 'data-cms-if':
          if (!NAME.test(text.replace(/^!\s*/, ''))) add('warn', 'cms-name', `data-cms-if="${value}" is not a field, built-in or @role name.`, at);
          break;
        case 'data-cms-text':
          checkPlaceholders(text, file, tag.line, name);
          if (tagName === 'script' || tagName === 'style') add('warn', 'cms-unbindable', '<script> and <style> never take bound values.', at);
          break;
        case 'data-cms-attr': {
          const parts = text.split(';').filter((p) => p.trim());
          if (parts.length > 16) add('warn', 'cms-attr', 'Only the first 16 attribute bindings are used.', at);
          for (const part of parts) {
            const index = part.indexOf('=');
            if (index <= 0) { add('warn', 'cms-attr', `"${part.trim()}" has no name= and is ignored (a ";" inside a value splits it).`, at); continue; }
            const attrName = part.slice(0, index).trim();
            const attrLower = attrName.toLowerCase();
            if (!/^[a-z][a-z0-9_.:-]{0,63}$/i.test(attrName) || attrLower.startsWith('on') || attrLower.startsWith('data-cms-') || attrLower.startsWith('xmlns') || BLOCKED_ATTRIBUTES.has(attrLower)) {
              add('warn', 'cms-attr', `"${attrName}" cannot be bound (event handlers, style, srcdoc, srcset, imagesrcset, is, xmlns, data-cms-*).`, at);
            }
            checkPlaceholders(part.slice(index + 1), file, tag.line, `${name} ${attrName}`);
          }
          break;
        }
        default:
          break;
      }
    }

    // Host islands: engines/sdk/islands.ts, worker/src/sdk/islands/injectIslands.ts.
    const island = tag.attrs.get('data-jc-island');

    if (island !== undefined) {
      if (island.expression || island.value === null) {
        add('info', 'island-dynamic', 'data-jc-island is set from code; check the built HTML.', at);
      } else if (island.value !== tagName) {
        add('warn', 'island-tag', `data-jc-island="${island.value}" must equal the element's own tag name (<${tagName}>).`, at);
      } else if (!ISLAND_TAG.test(tagName) || !tagName.includes('-')) {
        add('warn', 'island-tag', `<${tagName}> is not a valid island tag (^[a-z][a-z0-9-]{1,40}$ with a "-").`, at);
      }

      const props = tag.attrs.get('data-jc-props');

      if (props !== undefined && !props.expression && props.value !== null) {
        let parsed;
        try { parsed = JSON.parse(decodeEntities(props.value)); } catch { parsed = undefined; }
        if (parsed === undefined || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          add('warn', 'island-props', 'data-jc-props is not a JSON object: the island will render its empty state.', at);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- cms.json (engines/content/pages.ts)

function pagePathExists(path) {
  const parts = path.split('/').filter(Boolean);
  const candidates = pages.map((page) => page.slice('src/pages/'.length, -'.astro'.length).split('/').filter((s) => s !== 'index'));

  return candidates.some((segments) => segments.length === parts.length && segments.every((segment, i) => segment.startsWith('[') || segment === parts[i]))
    || files.some((file) => file === `src/pages/${parts.join('/')}.md` || file === `src/pages/${parts.join('/')}.html`);
}

function checkShellPath(value, label) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 512 || value.includes('\\') || value.includes(':')
    || value.split('/').some((s) => s === '.' || s === '..')) {
    add('warn', 'cms-manifest-path', `${label}: "${value}" is not a site path like /events/harvest-supper; it is dropped.`, 'public/_jellycube/cms.json');
  } else if (!pagePathExists(value)) {
    add('warn', 'cms-manifest-page', `${label}: no page in src/pages builds ${value}.`, 'public/_jellycube/cms.json');
  }
}

if (has('public/_jellycube/cms.json')) {
  let manifest;
  try { manifest = JSON.parse(read('public/_jellycube/cms.json')); } catch { manifest = undefined; }

  if (manifest === undefined || typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    add('warn', 'cms-manifest', 'cms.json is not a JSON object; Jellycube ignores it.', 'public/_jellycube/cms.json');
  } else {
    if (manifest.version !== 1) add('info', 'cms-manifest', 'cms.json has no "version": 1 (the documented shape).', 'public/_jellycube/cms.json');
    if (Buffer.byteLength(read('public/_jellycube/cms.json')) > 64 * 1024) add('warn', 'cms-manifest', 'cms.json is over 64 KB; the import does not read it.', 'public/_jellycube/cms.json');
    checkShellPath(manifest.fallback?.list, 'fallback.list');
    checkShellPath(manifest.fallback?.item, 'fallback.item');

    for (const [name, entry] of Object.entries(manifest.collections ?? {})) {
      if (!COLLECTION_NAME.test(name)) { add('warn', 'cms-manifest', `Collection "${name}" is not a valid name and is dropped.`, 'public/_jellycube/cms.json'); continue; }
      checkShellPath(entry?.list, `collections.${name}.list`);
      checkShellPath(entry?.item, `collections.${name}.item`);
      for (const slug of entry?.keep ?? []) {
        if (typeof slug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) add('warn', 'cms-manifest', `keep: "${slug}" is not a valid slug and is dropped.`, 'public/_jellycube/cms.json');
      }
      if (!listNames.has(name)) add('info', 'cms-manifest', `Collection "${name}" is named in cms.json but no literal data-cms-list="${name}" was found.`, 'public/_jellycube/cms.json');
    }
  }
} else if (usesBindings) {
  add('info', 'cms-manifest', 'Bindings are used but there is no public/_jellycube/cms.json; automatic collection pages then have no template pages.');
}

// ---------------------------------------------------------------- host templates (engines/sdk/templateCheck.ts)

if (hostMode) {
  const CHECK_EXTENSIONS = /\.(astro|html|css|ts|js|json|md)$/i;
  const SKIP = new Set(['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);
  const named = files.filter((path) => CHECK_EXTENSIONS.test(path) && !SKIP.has(path.split('/').pop()) && /jellycube\.(cc|dev|com)/i.test(read(path)));

  if (named.length > 0) add('warn', 'jellycube-domain', `Mentions a Jellycube domain (upload warning, still accepted): ${named.slice(0, 20).join(', ')}${named.length > 20 ? ` and ${named.length - 20} more` : ''}.`);
}

// ---------------------------------------------------------------- report

const counts = { error: 0, warn: 0, info: 0 };
for (const finding of findings) counts[finding.level] += 1;

if (jsonMode) {
  console.log(JSON.stringify({ root, files: files.length, bytes: totalBytes, pages: pages.length, counts, findings }, null, 2));
} else {
  console.log(`Jellycube template check: ${root}`);
  console.log(`${files.length} files, ${(totalBytes / 1048576).toFixed(2)} MB, ${pages.length} .astro page(s)${hostMode ? ', host template' : ''}\n`);
  for (const level of ['error', 'warn', 'info']) {
    for (const finding of findings.filter((f) => f.level === level)) {
      console.log(`${level.toUpperCase().padEnd(5)} ${finding.code}${finding.file ? `  ${finding.file}` : ''}\n      ${finding.message}`);
    }
  }
  console.log(`\n${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} note(s).`);
  console.log(counts.error === 0 ? 'Pre-flight requirements: pass.' : 'Pre-flight requirements: FAIL (the import would refuse this project).');
}

process.exit(counts.error > 0 ? 1 : 0);

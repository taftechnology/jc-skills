# The embedded editor

## Mount it

```ts
import { mountJellycubeEditor } from '@jellycube/client';

const editor = mountJellycubeEditor({
  element: document.getElementById('editor')!, // give it a real height; the iframe fills it 100% × 100%
  editorOrigin: 'https://api.jellycube.cc',    // Jellycube's editor origin (setup.md)
  hostId: 'hst_…',                             // public, not a secret
  siteId: community.website.siteId,            // run_…, from sites.create
});
// later
editor.navigate('/about/');
editor.destroy();
```

Without a bundler: load `https://cdn.jsdelivr.net/npm/@jellycube/client@<exact version>/dist/index.iife.js`,
then call `window.JellycubeClient.mountJellycubeEditor({ … })`.

| Option | Required | Meaning |
| --- | --- | --- |
| `element` | yes | The container. The iframe is `width: 100%; height: 100%; border: 0`, so the container needs an explicit height, for example `height: calc(100vh - <header height>)` |
| `editorOrigin` | yes | Jellycube's editor origin, exactly, with no path |
| `hostId` | yes | `hst_…` |
| `siteId` | yes | The site to edit. One editor shows one site |
| `getIdToken` | no | Your own function that returns the ID token. Without it the package POSTs `{ siteId }` to `tokenUrl` |
| `tokenUrl` | no | Default `/jellycube/token` on the page's own origin. Can be a full URL on the API's origin |
| `getHeaders` | no | Extra headers for the token request, for example `{ authorization: 'Bearer …' }` when the admin signs in with a bearer token rather than a cookie |
| `onPublished({ siteId })` | no | A publish finished. Refresh the host's own website status (`sites.get` → `live`, `publishedAt`) |
| `onEditInHost({ collection, slug, url })` | no | The user chose "Edit in <your product>" on a host-data block. Open `url`: route inside the SPA when it's on the admin's own origin, else open a new tab. The editor never navigates itself |
| `onClose()` | no | The user closed the editor |
| `onError({ code })` | no | `network_error`, `unexpected_response`, the token route's problem code (for example `not_signed_in`), or a frame failure such as `site_build_failed` |
| `colorMode` | no | `'light'`, `'dark'` or `'system'` (default: follows the device). The embedded editor has no light/dark toggle of its own. A light-only admin should pass `'light'` |

The handle has `navigate(route)`, `setColorMode(mode)`, `setTheme(theme)` and `destroy()`.

### In a component framework

Mount in an effect after the container exists, destroy in the cleanup, and re-mount only when
`siteId` changes. React example:

```tsx
useEffect(() => {
  if (!ref.current || site.status !== 'active') return;
  const editor = mountJellycubeEditor({ element: ref.current, editorOrigin, hostId, siteId: site.siteId, colorMode: 'light',
    onPublished: () => void reloadSite(), onEditInHost: ({ url }) => openInAdmin(url), onError: ({ code }) => showError(code) });
  return () => editor.destroy();
}, [site.siteId, site.status]);
```

Keep callbacks stable or read them through refs, so the editor isn't torn down on every
render. StrictMode's double mount is fine because `destroy()` cleans up. Vue: `onMounted` and
`onBeforeUnmount`. Svelte: `onMount` returning the cleanup. Angular: `ngAfterViewInit` and
`ngOnDestroy`.

## Sign-in flow

1. The iframe loads `<editorOrigin>/embed/<hostId>/sites/<siteId>?colorMode=<mode>` and sends
   `jc:ready`.
2. The package gets an ID token: `getIdToken()`, or `POST tokenUrl { siteId }` answered by the
   server package's `getUser`.
3. It posts the token to the iframe (`jc:token`) by `postMessage`, never in a URL or storage.
4. Jellycube checks the token against the host's issuer and keys, maps `role` to a tier
   through the role table, and opens an **embed session**: one site, at most 15 minutes, sent
   as a bearer header. No cookies are involved, so it works with third-party cookies blocked
   in every browser.
5. Before the session ends, the editor asks for a fresh token (`jc:token-refresh`). The role is
   read again each time, so access changes apply at the next refresh. `sessions.revoke` ends
   sessions within 30 seconds.

**Admin and API on different origins** (for example `admin.example.com` calling
`api.example.com`):
- set `tokenUrl: 'https://api.example.com/jellycube/token'`;
- list the admin origin in the handler's `browserOrigins`;
- either send the session as a header with `getHeaders` (simplest), or rely on cookies: the
  package then uses `credentials: 'include'`, which needs the API's session cookie to be sent
  cross-site (`SameSite=None; Secure`) when admin and API are on different sites.

## Where it may be framed

- Jellycube serves the embed with `frame-ancestors` set to the host's **admin origins**
  (Developers page). A page on any other origin gets a blank or refused frame.
- `frame-ancestors` applies to **every ancestor**. If the admin page is itself inside another
  iframe (a portal, a dashboard shell, a preview tool), that outer origin must be registered
  too.
- Messages are accepted only from the exact editor origin and the iframe the package created.

## Before the site is built

Mount the editor once `sites.get` / `sites.progress` reads `status: 'active'`, and draw your
own progress until then (`sites.md`, "Progress"). If the editor is mounted earlier, the frame
shows "This website is still being built" and turns into the editor by itself. A failed build
shows "This website couldn't be built" and sends `onError({ code: 'site_build_failed' })`
once. Offer delete and create again.

## What users can do in it (v1)

| Tier | Can |
| --- | --- |
| `viewer` | Look only |
| `editor` | Edit text, images and links in place; save drafts |
| `full` | Everything `editor` can, plus Publish, site settings, restoring earlier versions, and the Share button (preview link and preview password) |

- The editor is **content edit mode**: text, formatted text, images and links in place. There
  are no style controls and no adding or reordering sections in v1. What is editable is
  decided by the template (the `jellycube-template` skill).
- **Publish** makes the site live. A new site's address answers `404` until its first Publish
  (`sites.md`).
- **Images:** uploads belong to that one site. They're stored in three widths and served with
  `srcset`, and erased with the site. Copying an image from a web address is off in the embed.
- **Data:** host collections show read-only, with "Edit in <your product>" (`onEditInHost`).
  Jellycube's own CMS collections are off for hosts, unless Jellycube turned on `nativeCms`
  for the host. Collections synced from a third-party URL work.
- **Restore:** full-access users can put an earlier published version back into the editor,
  then publish it.
- **Custom domains per site** (for example `www.stmarys.org`) aren't available in the embed in
  v1. A host's own content domain is separate (`sites.md`).
- No Jellycube name or logo appears in the embed. The host's theme can recolour it
  (`host-data.md`, "Theme").

## Messages (for hosts not using `@jellycube/client`)

All by `postMessage`. Both sides check the sender's origin and name the exact target origin.

| Message | Direction | Body |
| --- | --- | --- |
| `jc:ready` | editor → host | `{ version: 1 }`: loaded, wants a token |
| `jc:token` | host → editor | `{ idToken }` |
| `jc:token-refresh` | editor → host | `{}`: send a fresh `jc:token` |
| `jc:navigate` | both | `{ route }`, for example `/about/` |
| `jc:published` | editor → host | `{ siteId }` |
| `jc:edit-in-host` | editor → host | `{ collection, slug \| null, url }` |
| `jc:close` | editor → host | `{}` |
| `jc:error` | editor → host | `{ code }` |
| `jc:color-mode` | host → editor | `{ mode }` |
| `jc:theme` | host → editor | the theme |

Use the package unless there's a strong reason not to. It's small, has no dependencies, and
also works as a `<script>` tag.

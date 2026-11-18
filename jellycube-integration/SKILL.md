---
name: jellycube-integration
description: Build, extend or debug a host app's integration with Jellycube (the Jellycube Host SDK), so the app's own users create, edit and publish Jellycube websites inside it. Covers registering a host app, the server package (@jellycube/server, Python jellycube-host, PHP jellycube/host) and its /jellycube handler, built-in or own-provider sign-in, the embedded editor (@jellycube/client), roles, site creation from templates, build progress, publishing, suspend/resume/rename/delete, webhooks, host collections, freshness notifications, Edit-in-host links, host islands, theme, preview links and passwords, the host's own content domain, the cookie notice, and implementing the signed protocol (JC-SIG-v1) by hand in any other language. Use whenever someone works on a Jellycube integration or hits a Jellycube SDK error.
license: MIT
---

# Jellycube host integration

A **host** is someone else's app (a community platform, a CMS, a SaaS product) whose users
get a website builder inside it. The host keeps its users, sign-in, data and screens.
Jellycube provides the website editor, the build and the hosting:

- **On the host's server:** one package, mounted at `/jellycube`, plus a few signed method calls.
- **In the host's admin page:** one call that shows the editor in an iframe.

The embedded editor is the **only** ready-made UI Jellycube gives. Everything else (site lists,
"create website" buttons, progress bars, settings) comes from methods, and the host draws it
in its own design.

## Ground rules

1. **The host's code, design and architecture win.** Fit the integration into the app's
   existing auth, routing, data layer, UI kit and conventions. Don't restyle, restructure or
   add frameworks for Jellycube's sake. Where Jellycube allows several options, present
   them to the user and let them choose.
2. **Use the official package for the stack** if one exists and can be installed
   (`references/setup.md`, "Packages"). Write signing, tokens or webhook checks by hand only
   when there is no package for the language, and then follow `references/protocol.md`
   exactly.
3. **Secrets stay secret.** The key secret (`hks_…`) and the sign-in key are passwords. They
   go in env or secret storage only. Never put them in a browser bundle, a log, a URL, an
   error message or git.
4. **Mapping:** `tenantRef` = the host's own ID for the community or customer that owns a
   site. `siteRef` = the host's own opaque ID for that website. `siteId` (`run_…`) = Jellycube's
   ID for the site. Store `siteId` on the host's community record.
5. **Ask, don't guess, about:** which role names map to which tier, which data becomes
   collections, the address label scheme, the content domain, and anything that publishes
   or deletes in production.

## Workflow

Do the steps in this order. Each one is testable on its own. Skip any the user doesn't need.

| # | Step | Reference |
| --- | --- | --- |
| 1 | Find out the stack (server language and framework, admin framework, auth, where it's deployed) and pick the package | `setup.md` |
| 2 | Register the host app on Jellycube's **Developers** page; put the 4 values plus `JELLYCUBE_PUBLIC_URL` and `JELLYCUBE_SIGNIN_KEY` in env | `setup.md` |
| 3 | Create `jellycube` once, mount `handler()` at `/jellycube` **before any body parser**, write `getUser` | `server.md` |
| 4 | Check the handler: `node <skill>/scripts/check-host.mjs --base <publicUrl>/jellycube` | `verify.md` |
| 5 | Templates: build a Jellycube-compatible Astro template (the `jellycube-template` skill), then upload it or keep the zip | `sites.md` |
| 6 | "Create website": `sites.create` → poll `sites.progress` → store `siteId` | `sites.md` |
| 7 | Show the editor with `mountJellycubeEditor` on an admin page | `editor.md` |
| 8 | Lifecycle buttons and webhooks: suspend, resume, rename, delete, `onEvent` | `sites.md` |
| 9 | Host data: `collections`, then `notifySourceChanged` after each save, plus edit links | `host-data.md` |
| 10 | Optional: `islands`, `theme`, preview links and password, own domain | `host-data.md`, `sites.md` |
| 11 | Run the checker with every option, then the manual test plan | `verify.md` |

**When something fails, read `references/troubleshooting.md` first.** It lists the real
problems hit while building the reference host, each with its cause and fix.

## Minimum working integration (JavaScript)

```ts
// server
import { createJellycube } from '@jellycube/server';
export const jellycube = createJellycube(); // reads JELLYCUBE_* env vars
export const jellycubeHandler = jellycube.handler({
  getUser: async (request, { siteId }) => {
    const user = await myAuth(request);                 // the host's own sign-in
    const community = await communityForSite(siteId);   // the community whose website this is
    if (!user || !community || !canOpenWebsite(user, community)) return null;
    return { id: user.id, tenantRef: community.id, siteRef: community.siteRef, role: roleIn(user, community) };
  },
});
app.use('/jellycube', jellycube.toNodeHandler(jellycubeHandler)); // before express.json()

// admin page
import { mountJellycubeEditor } from '@jellycube/client';
const editor = mountJellycubeEditor({ element, editorOrigin, hostId, siteId });
```

Python, PHP, other runtimes and other languages: `references/server.md` and
`references/protocol.md`.

## Files

- `references/setup.md`: packages and versions, registering a host app, env vars, the editor
  origin, local development, limits.
- `references/server.md`: the handler, `getUser`, mounting in each framework, own sign-in
  provider, multi-server stores, key rotation, errors.
- `references/editor.md`: `mountJellycubeEditor`, tokens, cross-origin admins, roles and
  sessions, colour mode, events, what users can do in the editor.
- `references/sites.md`: templates, creating sites, progress, publishing, lifecycle,
  addresses, webhooks, preview links, own domain, cookie notice, take-downs.
- `references/host-data.md`: host collections, freshness notifications, Edit-in-host links,
  islands, theme.
- `references/protocol.md`: the wire protocol for any language: JC-SIG-v1, ID tokens, every
  endpoint in both directions, problem codes, embed messages. Test vectors:
  `references/test-vectors.json`.
- `references/troubleshooting.md`: symptom → cause → fix, from real integrations.
- `references/verify.md`: the checker, the manual test plan and the go-live checklist.
- `scripts/check-host.mjs`: dependency-free Node 18+ checker for a running host handler.

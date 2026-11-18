# jellycube-integration (Jellycube Agent Skill)

An [Agent Skill](https://agentskills.io) that teaches a coding agent how to integrate an app with
Jellycube (the Jellycube Host SDK), so the app's own users create, edit and publish Jellycube
websites inside it. It covers every part of the integration, gives a fix for each problem hit
while building real integrations, and fits around the app's own code and design instead of
replacing them.

```
jellycube-integration/
  SKILL.md                     workflow, ground rules, the minimum integration
  references/
    setup.md                   packages, registering a host app, env vars, local development
    server.md                  the /jellycube handler, getUser, mounting per framework, errors
    editor.md                  the embedded editor (@jellycube/client), sessions, roles
    sites.md                   templates, sites, progress, publish, lifecycle, webhooks,
                               previews, own domain, cookie notice
    host-data.md               host collections, freshness, Edit-in-host, islands, theme
    protocol.md                the wire protocol for any language (JC-SIG-v1, ID tokens, routes)
    test-vectors.json          signing test vectors
    troubleshooting.md         symptom → cause → fix
    verify.md                  checker, manual test plan, go-live checklist
  scripts/check-host.mjs       dependency-free Node 18+ checker for a running host
```

## Install

With the [`skills`](https://skills.sh) CLI (any agent):

```bash
npx skills add taftechnology/jc-skills/jellycube-integration
```

In Claude Code: `/plugin marketplace add taftechnology/jc-skills`, then
`/plugin install jellycube-integration@jc-skills`.

By hand: copy this `jellycube-integration` folder into your agent's skills folder (`.claude/skills/`,
`.agents/skills/`, `.opencode/skills/` or `.cursor/skills/`). The folder name must stay
`jellycube-integration`. It matches `name` in `SKILL.md`.

Start a new agent session, then ask, for example: "Integrate our app with Jellycube so each
community can build its website", "Add host collections for our events", or "The embedded
editor shows a blank frame". Pair it with the [`jellycube-template`](../jellycube-template/) skill for the Astro
template.

## Use the checker on its own

```bash
node jellycube-integration/scripts/check-host.mjs --base https://admin.example.com/jellycube
```

Add `--tenant <community ID> --env-file .env` to check the signed routes (theme, collections,
islands), `--origin <admin origin>` for the token route's CORS, and `--ping` to check the keys
against Jellycube. Exit code 1 means there are errors.

## Keeping it current

The rules describe Jellycube's Host SDK contract v1 and the packages at `1.0.0-alpha.5`
(November 2026). When the packages or the contract change, update the matching reference and
the checker.

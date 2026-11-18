# Jellycube Agent Skills

[Agent Skills](https://agentskills.io) for coding agents working on Jellycube sites, templates
and integrations. They work in any harness that reads the open Agent Skills format (Claude Code,
OpenCode, Codex, Cursor and others). Each skill is a top-level folder in this repository.

| Skill | Install | What it does |
| --- | --- | --- |
| [`jellycube-template`](jellycube-template/SKILL.md) | `npx skills add taftechnology/jc-skills/jellycube-template` | Builds or checks an Astro project so it imports, edits, serves and publishes correctly in Jellycube, as a stand-alone site or a template for a host app. Adds only what Jellycube needs and never overrides your own design or project rules. Includes a dependency-free checker. |
| [`jellycube-integration`](jellycube-integration/SKILL.md) | `npx skills add taftechnology/jc-skills/jellycube-integration` | Integrates an app with Jellycube (the Host SDK) so its users build and publish websites inside it: registration, the server handler and sign-in, the embedded editor, sites and templates, webhooks, host collections, freshness, islands, theme, previews and the app's own domain. Includes the wire protocol for any language, a troubleshooting guide from real integrations, and a dependency-free checker for a running host. |

## Install

Any agent, with the [`skills`](https://skills.sh) CLI, from the project you're working in:

```bash
npx skills add taftechnology/jc-skills/jellycube-template
```

```bash
npx skills add taftechnology/jc-skills/jellycube-integration
```

Add `-g` to install for all your projects. To pick from every skill in this repository:

```bash
npx skills add taftechnology/jc-skills
```

Claude Code, from its plugin installer:

```
/plugin marketplace add taftechnology/jc-skills
/plugin install jellycube-template@jc-skills
/plugin install jellycube-integration@jc-skills
```

By hand: copy the skill's folder (for example `jellycube-integration/`) into your agent's skills folder
(`.claude/skills/`, `.agents/skills/`, `.opencode/skills/` or `.cursor/skills/`, in the project
or your home directory). See each skill's README.

### Renamed

The old skill names (`jc-skills/template` and `jc-skills/integration`) were renamed to
`jellycube-template` and `jellycube-integration` and the old commands no longer work. Existing
installs should remove the old names and add the new ones:

```bash
npx skills remove template integration
npx skills add taftechnology/jc-skills/jellycube-template
npx skills add taftechnology/jc-skills/jellycube-integration
```

## Checkers (no agent needed)

Node 18 or later, no install:

```bash
node jellycube-template/scripts/check-template.mjs <project-folder> [--host] [--json]
```

```bash
node jellycube-integration/scripts/check-host.mjs --base <public URL>/jellycube [--tenant <id>] [--env-file .env] [--ping]
```

Exit code 1 means errors: the import would refuse the project, or the host's integration
answers incorrectly.

## Adding a skill

Create a top-level folder whose name matches the `name` in its `SKILL.md`, add a row to the
table above, and add it to `.claude-plugin/marketplace.json`.

## License

[MIT](LICENSE)

# Jellycube Agent Skills

[Agent Skills](https://agentskills.io) for coding agents working on Jellycube sites, templates
and integrations. They work in any harness that reads the open Agent Skills format (Claude Code,
OpenCode, Codex, Cursor and others). Each skill is a top-level folder in this repository.

| Skill | Install | What it does |
| --- | --- | --- |
| [`template`](template/SKILL.md) | `npx skills add taftechnology/jc-skills/template` | Builds or checks an Astro project so it imports, edits, serves and publishes correctly in Jellycube, as a stand-alone site or a template for a host app. Adds only what Jellycube needs and never overrides your own design or project rules. Includes a dependency-free checker. |
| [`integration`](integration/SKILL.md) | `npx skills add taftechnology/jc-skills/integration` | Integrates an app with Jellycube (the Host SDK) so its users build and publish websites inside it: registration, the server handler and sign-in, the embedded editor, sites and templates, webhooks, host collections, freshness, islands, theme, previews and the app's own domain. Includes the wire protocol for any language, a troubleshooting guide from real integrations, and a dependency-free checker for a running host. |

## Install

Any agent, with the [`skills`](https://skills.sh) CLI, from the project you're working in:

```bash
npx skills add taftechnology/jc-skills/template
```

```bash
npx skills add taftechnology/jc-skills/integration
```

Add `-g` to install for all your projects. To pick from every skill in this repository:

```bash
npx skills add taftechnology/jc-skills
```

Claude Code, from its plugin installer:

```
/plugin marketplace add taftechnology/jc-skills
/plugin install template@jc-skills
/plugin install integration@jc-skills
```

By hand: copy the skill's folder (for example `integration/`) into your agent's skills folder
(`.claude/skills/`, `.agents/skills/`, `.opencode/skills/` or `.cursor/skills/`, in the project
or your home directory). See each skill's README.

## Checkers (no agent needed)

Node 18 or later, no install:

```bash
node template/scripts/check-template.mjs <project-folder> [--host] [--json]
```

```bash
node integration/scripts/check-host.mjs --base <public URL>/jellycube [--tenant <id>] [--env-file .env] [--ping]
```

Exit code 1 means errors: the import would refuse the project, or the host's integration
answers incorrectly.

## Adding a skill

Create a top-level folder whose name matches the `name` in its `SKILL.md`, add a row to the
table above, and add it to `.claude-plugin/marketplace.json`.

## License

[MIT](LICENSE)

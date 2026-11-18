# Jellycube Agent Skills

[Agent Skills](https://agentskills.io) for coding agents working on Jellycube sites and
templates. They work in any harness that reads the open Agent Skills format (Claude Code,
OpenCode, Codex, Cursor and others). Each skill is a top-level folder in this repository.

| Skill | Install | What it does |
| --- | --- | --- |
| [`template`](template/SKILL.md) | `npx skills add taftechnology/jc-skills/template` | Builds or checks an Astro project so it imports, edits, serves and publishes correctly in Jellycube, as a stand-alone site or a template for a host app. Adds only what Jellycube needs and never overrides your own design or project rules. Includes a dependency-free checker. |

## Install

Any agent, with the [`skills`](https://skills.sh) CLI, from the project you're working in:

```bash
npx skills add taftechnology/jc-skills/template
```

Add `-g` to install it for all your projects. To pick from every skill in this repository:

```bash
npx skills add taftechnology/jc-skills
```

Claude Code, from its plugin installer:

```
/plugin marketplace add taftechnology/jc-skills
/plugin install template@jc-skills
```

By hand: copy the skill's folder (for example `template/`) into your agent's skills folder
(`.claude/skills/`, `.agents/skills/`, `.opencode/skills/` or `.cursor/skills/`, in the project
or your home directory). See [the skill's README](template/README.md).

## Check a project without an agent

```bash
node template/scripts/check-template.mjs <project-folder> [--host] [--json]
```

Node 18 or later, no install. Exit code 1 means Jellycube's import would refuse the project.

## Adding a skill

Create a top-level folder whose name matches the `name` in its `SKILL.md`, add a row to the
table above, and add it to `.claude-plugin/marketplace.json`.

## License

[MIT](LICENSE)

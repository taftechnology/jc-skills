# Jellycube Agent Skills

[Agent Skills](https://agentskills.io) for coding agents working on Jellycube sites and
templates. They work in any harness that reads the open Agent Skills format (Claude Code,
OpenCode, Codex, Cursor and others).

| Skill | What it does |
| --- | --- |
| [`jellycube-template`](skills/jellycube-template/SKILL.md) | Builds or checks an Astro project so it imports, edits, serves and publishes correctly in Jellycube, as a stand-alone site or a template for a host app. Adds only what Jellycube needs and never overrides your own design or project rules. Includes a dependency-free checker. |

## Install

Any agent, with the [`skills`](https://skills.sh) CLI:

```bash
npx skills add taftechnology/Jellycube-skills
```

Claude Code, from its plugin installer:

```
/plugin marketplace add taftechnology/Jellycube-skills
/plugin install jellycube-template@jellycube-skills
```

By hand: copy `skills/jellycube-template/` into your agent's skills folder
(`.claude/skills/`, `.agents/skills/`, `.opencode/skills/` or `.cursor/skills/`, in the project
or your home directory). See [the skill's README](skills/jellycube-template/README.md).

## Check a project without an agent

```bash
node skills/jellycube-template/scripts/check-template.mjs <project-folder> [--host] [--json]
```

Node 18 or later, no install. Exit code 1 means Jellycube's import would refuse the project.

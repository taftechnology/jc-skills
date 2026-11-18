# jellycube-template (Jellycube Agent Skill)

An [Agent Skill](https://agentskills.io) that teaches a coding agent what an Astro project
needs to import, edit, serve and publish correctly in Jellycube, either as a stand-alone
Jellycube site or as a template for a host app. It adds only Jellycube's requirements and never
overrides the user's own design or project rules.

```
jellycube-template/
  SKILL.md                      short instructions, loaded when relevant
  references/                   the full rules
    project-setup.md            pre-flight requirements, install/build, limits, folder layout
    editability.md              editable vs code-driven (locked) regions, dynamic routes
    cms-bindings.md             content collections, every data-cms-* attribute, cms.json
    host-islands.md             data-jc-island / data-jc-props, SRI, CORS
    styling-assets-csp.md       Tailwind, images, routing, CSP and custom code
    verify-and-checklist.md     what the import keeps/strips, local checks, pre-upload checklist
  scripts/check-template.mjs    dependency-free Node 18+ checker
```

## Install

With the [`skills`](https://skills.sh) CLI (any agent):

```bash
npx skills add taftechnology/jc-skills/jellycube-template
```

In Claude Code: `/plugin marketplace add taftechnology/jc-skills`, then
`/plugin install jellycube-template@jc-skills`.

### By hand

Copy (or symlink) the whole `jellycube-template` folder. The folder name must stay
`jellycube-template` (it matches `name` in `SKILL.md`).

| Harness | Project-level folder | Personal (all projects) |
| --- | --- | --- |
| Claude Code | `.claude/skills/jellycube-template/` | `~/.claude/skills/jellycube-template/` |
| OpenCode | `.opencode/skills/jellycube-template/` (also reads `.claude/skills/` and `.agents/skills/`) | `~/.config/opencode/skills/jellycube-template/` |
| Codex | `.agents/skills/jellycube-template/` | `~/.agents/skills/jellycube-template/` (older versions: `~/.codex/skills/`) |
| Cursor | `.cursor/skills/jellycube-template/` (also reads `.agents/skills/`, `.claude/skills/`, `.codex/skills/`) | `~/.cursor/skills/jellycube-template/` |
| Any other Agent Skills reader | its skills folder | - |

`.agents/skills/` is read by OpenCode, Codex and Cursor, so one copy there covers all three
in a project. For example, from the project you're building:

```bash
mkdir -p .agents/skills && cp -r "<path-to-jc-skills>/jellycube-template" .agents/skills/
```

```bash
mkdir -p .claude/skills && cp -r "<path-to-jc-skills>/jellycube-template" .claude/skills/
```

Restart the agent (or start a new session) so it picks the skill up. It then loads on requests
like "make this Astro site Jellycube-compatible" or "check this template before upload", or by
name (`/jellycube-template` where the harness supports it).

## Use the checker on its own

```bash
node jellycube-template/scripts/check-template.mjs <project-folder>
```

Add `--host` for a host-app template and `--json` for machine-readable output. Exit code 1 means
the Jellycube import would refuse the project.

## Keeping it current

The rules describe Jellycube as of November 2026. When Jellycube's import, CMS bindings, host
islands or site policy change, update the matching reference and the checker.

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
  <img src="assets/logo.svg" width="72" height="72" alt="" />
</picture>

# Nest

**Stable projects, clear attention, inline agents.**

![bb ≥ 0.36](https://img.shields.io/badge/bb-%E2%89%A5%200.36-88C0D0?style=flat-square)
![any platform](https://img.shields.io/badge/platform-any-3FA266?style=flat-square)
![experimental slot](https://img.shields.io/badge/uses-experimental%20SDK%20slot-F1B467?style=flat-square)

</div>

Nest replaces the scrolling thread list in bb's left sidebar with a
compact project-first inbox designed for parallel agent work.

Projects and complete root/child families stay where you put them. Drag the
existing project header or a family's semantic status icon to sort, or use
Alt+Up/Alt+Down from the same focus targets. The browser-local order survives
reloads, children remain attached, and pinned roots retain their leading
partition. Sorting pauses during search, filtering, or bulk selection so hidden
rows never move implicitly.

Every family has an explicit **Failed**, **Needs you**, **Working**, **Unread**,
**Inactive**, or seven-day **Stale** state. Labels, distinct shapes, animation,
accessible help, and customizable semantic colors keep color from carrying the
meaning alone. Inactive and stale work recedes instead of using a bright unused
state, and Nest never invents Done for ordinary idle work.

When a root has child threads, the family expands inline as an agent stack with
provider marks for Codex, Claude, and other BB providers. Pull-request metadata
stays on the parent only, including semantic ready, merged, and blocked/error
states.

You clear the list with two email verbs: **snooze** a thread until a wake time, or
**settle** it when you are done. Both shelves collapse to one counted header.

## Nest in action

| Light | Dark |
|:--:|:--:|
| <img src="docs/media/nest-light.png" alt="Compact Nest sidebar in light mode showing project groups, Working, Unread, Needs you, Failed, Inactive, pull requests, and expanded child agents" width="317" /> | <img src="docs/media/nest-dark.png" alt="Compact Nest sidebar in dark mode with accessible semantic colors, project groups, pull requests, and expanded child agents" width="317" /> |

### Inline subagents

<p align="center">
  <img src="docs/media/nest-subagents.png" alt="Expanded Nest release family with three child agents and Codex, Claude, and Codex provider marks" width="634" />
</p>

## Nest in the sidebar

Two things are worth knowing before you tune it:

- Rows are denser than bb's own list by design — the tree carries groups and
  worktrees, so everything that is not the title is a dot, a count, or a
  tooltip. Everything visible can be turned off from Settings.
- The scroll area reserves its scrollbar width (`scrollbar-gutter: stable`), so
  the tree does not shift sideways the moment it grows past the viewport.

## Install

This fork is **not published** — it is installed from this repository as a local
path source. There is no marketplace entry and no upstream tag to track.

```sh
cd path/to/bb-plugin-nested-sidebar
npm install                       # runtime deps + the pinned @get-bb/plugin-sdk
bb plugin build .                 # writes dist/{server,app}
bb plugin install "path:$PWD" --yes
```

After an edit, `bb plugin build .` then `bb plugin reload nested-sidebar` is the
short loop; `bb plugin dev .` watches instead. `bb plugin remove nested-sidebar`
uninstalls it, and the local path source stays on disk.

The install used to fail with `Could not resolve "@bb/plugin-sdk"`: the tree
vendored SDK declarations under `types/`. It now depends on the
`@get-bb/plugin-sdk` package instead — see
[ADR 0002](../../docs/adr/0002-sidebar-fork-and-information-architecture.md).

## Requirements

- bb ≥ 0.36
- Nothing else. No accounts, keys, or external services.

## Usage

Installing does not change your sidebar by itself. Open **Settings → Appearance →
Sidebar** and choose **Nest (projects)**.

<picture><img src="docs/media/enable.png" alt="bb's Appearance settings where a sidebar replacement can be selected" width="100%" /></picture>

bb's own list stays the default, and comes back the moment you switch away or
disable the plugin.

### Groups

A **group** is a named bucket above projects, and it is the first level of the
tree: `group -> project -> worktree -> thread`. A project belongs to at most one
group; a project in no group lands in **Ungrouped**. Pick a group from the
horizontal strip above the tree (`All | Group A | Group B | Ungrouped`), or open
the folder button there to create, rename, reorder, and delete groups. Deleting a
group only releases its projects back to Ungrouped -- it never removes a project
or a thread.

The strip is a **scope selector, not a second tree**: choosing a group narrows
what the tree below draws, and projects are still the first level inside it.
**Ungrouped** only appears once groups exist; with none, it would just duplicate
**All**.

### Worktrees

The worktree level appears **only when a project's threads occupy more than one
workspace**. A project whose threads all sit in one checkout stays flat, exactly
like bb's own sidebar; the second worktree is what earns the level its space.
Worktree rows are labelled by branch (falling back to the environment name) and
are collapsed by default, because with many worktrees the point is to make them
navigable rather than to show them all at once. A child agent never splits from
its parent: families hang under the workspace of their **root**.

### Status that bubbles up

Every folded row -- group, project, or worktree -- reports what is underneath it
with one dot and a count: `2 needs you / 1 working`. The order is deliberately
`failed > needs you > working > unread > inactive > stale`, so **needs you**
outranks **working**: a folded row is skimmed, not read, and a blocked thread is
the one that must not hide. The badge is also a **jump button** -- click it to go
straight to the thread that produced the state, instead of expanding the branch
and hunting for it.

### New threads start from a row

Every project row and every worktree row has a **+** that opens a modal seeded
from that row: the project is filled in, and a worktree row additionally seeds
that exact environment. The seed is a seed, not a lock -- the project picker stays
editable, and the environment picker can still be aimed at another worktree or at
a **newly created** one from inside the dialog. Submitting spawns the thread
through the plugin, so it is attributed to Nest on the thread itself.

### Compact rows

The sidebar is the scarcest surface in bb, so a row says as little as it can
and each of those pieces can be turned off:

- **Thread row layout** — *One line* drops the branch beside the title and
  halves the row height; *Two lines* keeps the dedicated branch line.
- **Thread status marker** — *Dot* trades the per-state shape for a small
  coloured dot (still animated while working, still colour-coded). The state's
  name lives in the tooltip and the screen-reader label either way.
- **Show child thread count** — the disclosure beside a thread with agents.
- **Show thread branch or host** — the location line, or the inline branch in
  one-line layout.

Rollups on folded rows follow the same rule: a coloured dot plus the count
(`● 2  ● 1`) instead of `2 needs you · 1 working`, most urgent first. The
wording is still in the tooltip and the accessible label.

### Projects and parked shelves

- **Projects** — drag an existing project header to sort projects, or focus the
  same header and press Alt+Up/Alt+Down. No extra drag icon is added, and the
  browser-local project order survives reloads. Pinned roots remain first inside
  each project.
  Drag a family's semantic status icon, or focus it and press Alt+Up/Alt+Down, to move
  a complete root/child family inside its pinned or unpinned partition. The
  family order survives reloads. Clear search, choose the All filter, and
  exit bulk selection before sorting so hidden rows are never moved implicitly.
- **Snoozed** — hidden until the wake time you chose. A snoozed thread comes back early if it starts working or asks you something.
- **Settled** — work you are done with, collapsed to one line and shown for 24 hours. Settling also **archives the thread in bb**, so every other surface agrees, and new attention un-settles and unarchives it. After a day the row stops being drawn but stays archived.

An empty shelf disappears.

### Cards

Root rows always use exactly two compact lines. The first has a distinct semantic
icon, truncated title, and elapsed time. The second has a truncated branch and a
non-wrapping cluster with a readable status badge, parent-only PR metadata, and
child/provider controls. **Failed**, **Needs you**, **Working**, **Unread**,
**Inactive**, and seven-day **Stale** states have separate shapes, labels,
tooltips, and customizable colors. Inactive and stale work recede; Nest never
calls ordinary idle work Done. A Working family keeps the actual activity type
visible: runtime, workflow, background agent, command, plan, and goal each use a
different animated shape and customizable color. PR ticks and other PR icons use
their semantic color as a tinted background, so a ready tick is visibly green.
Hovering a quiet root swaps its elapsed time for the two park buttons without
adding a row.

### A working thread can never be parked

Workflows, background agents, background commands, plan mode, and goals all count as
live work. Any of them blocks parking and wakes a parked thread, so running work is
never hidden.

### Snoozing

The hover button snoozes until **09:00 tomorrow**.

### Inline agents

A root with child threads gets an agent count and disclosure. The stack opens by
default when the family is selected or a child is working, unread, or waiting for
you. Child rows keep their own provider mark (including Codex and Claude), branch,
age, working state, unread ring, context menu, split drag, and keyboard-readable
status help. Provider names are announced by the child disclosure without adding
nested tab stops. A parent chip in the thread header still gives a focused child
a direct route back up.

### The rest

- Collapsible project and agent groups.
- Right-click for open in split, mark read/unread, pin, archive, delete.
- Drag a card to a split pane, or Cmd/Ctrl-click to open one.
- Status-icon reordering is separate from BB's card-to-split drag target and
  adds no extra row icon.
- bb's search, its thread shortcuts, and modifier-click split-open all keep working.

## Switching from t3sidebar

Nest is a new plugin identity, not an in-place release of t3sidebar. It
uses a separate bb database and separate `nest:v1:*` browser keys, so it
starts with an empty Snoozed and Settled state. It does **not** migrate or
delete the old plugin's parked threads.

Keep t3sidebar installed but disabled until you no longer need its snoozed or
settled rows. You can re-enable it temporarily to inspect that state. Removing
the old plugin may remove its private database; Nest never performs that
removal for you.

Sidebar selection is per client. Choose **Nest (projects)** on each desktop,
browser, or remote client where you want to use it.

## Configuration

Nest Settings offers Default, High contrast, Colorblind-friendly, and Custom
semantic palettes. Every status, live activity type, and PR role is previewed;
custom values accept only six-digit hex colors and otherwise fall back safely.
You can also choose row density, default child expansion, provider marks,
parent-only PR metadata, and relative-time visibility.

The snooze presets still assume a 09:00 morning, an 18:00 evening, and a week
starting Monday in your local timezone. The settled shelf reaches back 24 hours.
Those timing constants are not configurable.

## Troubleshooting

**My sidebar looks the same after installing.** Choose Nest in Settings →
Appearance → Sidebar. Installing alone changes nothing.

**A thread I settled is not on the Settled shelf.** The shelf only reaches back 24
hours. Older work is still settled and still archived — look for it in bb's archived
view.

**A snoozed thread came back early.** That is the design: a snoozed thread wakes when
it starts working or asks you a question.

**Un-settling did not bring the thread back.** Archive and unarchive run on the
thread's host, which can be offline. When an unarchive fails, bb keeps the thread
archived and the thread leaves the sidebar until you unarchive it in bb yourself.

**Uninstalling left data behind.** The shelves live in the plugin's own database,
which bb removes with the plugin — but a copy of them is cached in the browser's
`localStorage` under `nest:v1:*` (thread ids, park timestamps, and legacy
provider metadata). bb's uninstall does not clear web storage. Clear site data
if that matters to you. The separate `t3sidebar:v1:*` keys belong to the old
plugin and are not claimed by Nest.

## Credits

This fork is built on **Dockside** by Mateo Cerquetella, which is itself derived
from bb's own example sidebar.

| | |
|---|---|
| Forked from | [`MateoCerquetella/bb-plugins` → `plugins/dockside`](https://github.com/MateoCerquetella/bb-plugins/tree/main/plugins/dockside) (MIT) |
| Dockside derived from | [`get-bb/bb` → `examples/plugins/t3sidebar`](https://github.com/get-bb/bb/tree/main/examples/plugins/t3sidebar) |
| License | MIT — see `LICENSE` and `THIRD_PARTY_NOTICES.md` |

Nest adds the group level, the worktree tree, status rollups, and the row-seeded
new-thread dialog on top. Why it was forked rather than written from scratch is
recorded in
[ADR 0002](../../docs/adr/0002-sidebar-fork-and-information-architecture.md).

The provider brand marks are vendored SVG geometry from `get-bb/bb` and depict
third-party brands. A host-served logo always wins over them, rendered as a muted
silhouette rather than in brand color — by design.

## Develop from source

Install as shown under [Install](#install), then check a change with:

```sh
npx tsc --noEmit
node --test --experimental-strip-types test/*.test.ts
```

The test script needs Node 22.6+. A few store tests need the `better-sqlite3`
native binding built for this Node; if a fresh `npm install` left it unbuilt they
fail with a bindings error, which says nothing about the plugin — at runtime bb
provides the database through `bb.storage`. Fix it once with:

```sh
npm approve-scripts better-sqlite3 && npm rebuild better-sqlite3
```

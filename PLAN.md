# Plan: BB Sidebar's motion, paging and working duration

Status: implemented and verified; see GATES.md.

## Goal

Nest replaces bb's sidebar but not its feel. Four things another sidebar gets
right are missing here, and they are all presentation, not structure:

- **Rows jump instead of moving.** A reorder, an insert, a remove and a shelf
  opening or closing all land instantly, so the user has to re-find the row they
  were watching.
- **Long lists draw everything.** A day of settling piles up on the shelf, and a
  long-running project piles up in the tree; at twenty-six threads a project
  stops being skimmable.
- **A working thread says that it is working, not for how long.** "Is it stuck?"
  is the question the sidebar should answer and cannot.
- **Expand and collapse do not move.** Auto-animate watches its own element for
  added, removed and reordered *direct children*. A disclosure changes the height
  of one child that stays exactly where it is — and in Nest the body is usually
  not a direct child of any animated container at all — so it is invisible to it,
  and every disclosure in the tree snaps. Once it does move, a bare height
  animation on the default easing reads as a box being pulled open rather than
  as rows arriving.

## Findings

The motion and the shelf's paging are ported from **BB Sidebar**
(`yusuf8834/bb-sidebar`, v0.2.19, commit `e3f60343fecb`, MIT) — the source the
user picked as the design to copy. Its source is not on disk under
`~/.bb/plugins/bb-sidebar` (only its database is), so the port was made against
a clone of that commit. Upstream has **no expand/collapse animation** either:
structurally it writes its shelf body the same way (`{expanded ? <ul>…</ul> :
null}` inside the row), so it has the same snap, and its only disclosure motion
is the chevron's 150ms rotation. The collapse is therefore written here, not
ported.

What the two plugins do not share is the shape of a drag, and that decides how
much of upstream's motion code can come over:

- Upstream reorders with a **pointer drag** it drives itself: it decides the
  insertion point from `getBoundingClientRect()` / `elementFromPoint()` while the
  pointer is down, so a row mid-animation reports where it *was* and the drop
  resolves against stale geometry. That is why it keeps a module-level registry
  of every live controller and a counted `suspendListAnimations` /
  `resumeListAnimations` pair, and holds them all still for the gesture.
- Nest reorders with **native HTML5 drag-and-drop**: `draggable` plus
  `onDragStart` / `onDragOver` / `onDrop`, with `before`/`after` decided in the
  drop handler from the static target row's own box. Nothing moves in the DOM
  until the drop.

So the registry and both functions have nothing to protect here. They are
dropped rather than ported as dead weight, and the hook says so.

Two smaller mismatches shaped the rest:

- **Nest has no CSS source file.** Upstream ships `src/settle-button.css` and
  imports it from a component; the plugin build collects that into
  `dist/app.css` after the Tailwind output. Nest needed the same mechanism plus a
  `declare module "*.css"` (and a `tsconfig` `include` entry) for `tsc`.
- **Nest's status is a glyph, and its text slot is the age.** Upstream draws the
  status as the row's text and has no glyph on the card. Nest's own rule for its
  status slot already reads *"the age only earns its place once the thread has
  nothing to say"*, which is exactly upstream's `StatusOrTime` — so the root
  row's text slot adopts it, and the duration lands where the rule already said
  status belongs.

## Design

1. **Auto-animate, without the drag machinery.** `useListAutoAnimate` is the
   callback-ref hook upstream uses, kept byte-for-byte in behaviour:
   `{ duration: 150, easing: "ease-out" }`, the `window.matchMedia` bail (which
   is what keeps it silent in a jsdom test), and `animation.destroy?.()` on
   cleanup — without the destroy, auto-animate keeps observers and a polling
   interval alive. The registry, the hold counter and both functions are gone.
2. **Attach it to every list that changes order.** Seven containers: the tree
   (group sections plus the shelves), a group's project list, a project's
   workspace list, a worktree's family list, the flat family list, a root's
   child-agent list, and the parked shelf's rows. The tree wrapper is a
   **classless** `<div>` rather than upstream's `flex flex-col`, because a
   group section's `mb-1` and a shelf header's `mt-3` collapse as block siblings
   and would add up in a flex column.
3. **Expand and collapse are the row animation, not a second one.** Every
   disclosure — group, project, worktree, a thread's inline agents, and a parked
   shelf — works by keeping its list mounted and putting the rows into it or
   taking them out. The rows then enter and leave through the very same
   auto-animate that plays a loaded page: `scale(.98) → scale(1)` with the
   opacity held at zero for the first half of a 225ms `add`, and
   `scale(1) → scale(.98)` with a fade over a 150ms `remove`. One mechanism, so
   there is no second animation to keep in step with it.
   That is the whole of the design, and it is what the user asked for after
   seeing both: a first attempt wrapped each body in a height-animated `Collapse`
   that glided the box and faded the contents as one block, and the two
   mechanisms cannot coexist. A smooth box height needs the leaving rows to stay
   **in flow** so the box can measure them as they go; auto-animate's row exit
   needs them **out of flow** — its `remove` re-inserts the node as
   `position: absolute` at its old coordinates, `z-index: 100`, so it can float
   and fade while the box has already closed behind it. Answering "make it like
   Load more" therefore deletes the height animation rather than tuning it.
   Three consequences fall out, and each is handled:
   - **The collapsed rows really do go.** They are unmounted, so they stop
     running a per-row git-host lookup each — the same property the height
     version had, for free.
   - **A closed list drops its connector line and padding.** A `border-l` and a
     `pb-0.5` on a zero-height element paint a stub of border under the row the
     list hangs from.
   - **A placeholder snaps.** `No threads yet` has no rows to animate, so it is
     simply there or not — the cheapest honest thing for a single muted line.

   Sources, since none of this was worth guessing at:
   [M3 easing and duration](https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration),
   [M3 easing tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs),
   [Radix Collapsible](https://www.radix-ui.com/primitives/docs/components/collapsible),
   [React Aria Disclosure](https://react-aria.adobe.com/Disclosure),
   [Chrome: styling `<details>`](https://developer.chrome.com/blog/styling-details),
   [Chrome: animate to `height: auto`](https://developer.chrome.com/docs/css-ui/animate-to-height-auto),
   [Emil Kowalski: Great Animations](https://emilkowalski.ski/ui/great-animations),
   [Josh Wootonn: Sidebar animation performance](https://www.joshuawootonn.com/sidebar-animation-performance).
   The height version followed Radix and React Aria, which both measure the body
   and hand the consumer a CSS variable to animate; it used M3's published
   `standard decelerate` / `standard accelerate` tokens at its `short4` / `short3`
   durations. That work is not in the tree any more, and the research is kept
   here because it is what made the trade-off legible: the box glided and the
   rows moved as one block, which is exactly what the row animation gives up.
4. **The settle sparkle ships with its own stylesheet.** Upstream's file is
   copied whole — the `clip-path` star, the five per-sparkle positions, delays
   (`0/100/160/70/130ms`) and travel vectors, the 750ms keyframes, and the
   `prefers-reduced-motion: no-preference` gate that leaves the stars visible but
   still. Every class **and the keyframe name** is re-prefixed `nest-settle`,
   because both plugins can be installed at once and this stylesheet is global.
   The settle button gains a `sparkle` prop so the snooze control, which shares
   the component, keeps its plain rendering.
5. **Long lists page.** Three lists draw a page at a time and offer **Load more**:
   the settled shelf, a project's own thread list, and a worktree's thread list.
   A page holds five rows by default, set by the **Rows per page** setting
   (1–100), and it is both what a list draws first and what each click adds — a
   five-row first page followed by a twenty-five-row jump would read as two
   different controls. Each count is held in *pages*, not rows, so changing the
   setting re-scales what is already on screen instead of leaving a limit that
   now means something else, and each list keeps its own count so opening a
   project does not consume another project's page.
   The paging itself is a filter — not a slice — so the open thread keeps its
   place past the limit and cannot be drawn twice, and a **search draws every
   match**, because results a list is holding back are the one case where a page
   works against the user. The shelf's limit counts its own rows, never its
   still-loading ones, and an empty list still reports itself as empty rather
   than as a list whose one page happened to be zero.
   A list that has drawn more than one page ends with **Show less** beside Load
   more, which goes back to the first page in one click rather than removing one
   page at a time: what it is for is putting an expanded list away, and four
   clicks to undo four is not putting it away. Both controls step aside while a
   search is running, because a control that cannot change what is on screen is
   worse than no control.
   Paging sits **per list**, not per project: a project that draws a workspace
   level pages each worktree's list, because a single limit spanning them would
   either drop a worktree row or draw it claiming to have no threads.
6. **One timing vocabulary.** 150ms `ease-out` on rows, 200ms on the settle
   button, and `motion-reduce:transition-none` / `motion-reduce:animate-none`
   wherever something moves. Nest had no
   `motion-reduce:` utility at all.
7. **A working thread counts.** `lib/working-since.ts` keeps the stamp the host
   does not report: set on the first render that sees a thread work, cleared when
   it stops, carried across a reload, and holding its identity when nothing
   changed so the minute tick does not re-render every row. `StatusOrTime` then
   reads `Working · 5m`, and the root row's text slot uses it.
8. **The row's shape is bb's; its palette is Nest's.** The card stopped being a box
   — one `rounded-md px-2.5 py-2` tint that moves with hover and with being open,
   no outline around the family and no second panel inside it — the title went to
   `text-sm`, a card's children are folded into a chip (their dots, count,
   providers, chevron, on a ground tinted by the subtree's state), and a child row
   says its verdict in words with an uppercase **Needs you** / **Working** flag
   over a ground of its own. All of that is bb-sidebar's shape
   (`src/ThreadCard.tsx`, `src/ChildThreadList.tsx`), with one deliberate
   divergence: **bb hard-codes Tailwind hues and Nest's palette is the user's to
   choose**, so every ground here is `bg-current/10` over the semantic status
   colour, or a `color-mix` of it — the way `FamilyStatusBadge` already drew one.
   Copying bb's literals would have left a user who recoloured "Stalled / waiting"
   with an amber row under a purple flag.
   The card's second line is bb's third: **the branch icon and name on the left,
   truncating, and at the right end everything that is not a word** — the age or
   the park buttons, the pin, the PR number, the children chip, the provider mark,
   and the row menu. Nest used to keep those in a column beside the two lines
   (`flex-col gap-0.5`), which spent width on a vertical run of glyphs and squeezed
   the title into what was left; the title now owns its line outright.
   `rowDetails` gained a third answer for this — **"In the row, no branch"**, the
   new default — which keeps the provider, the age, the controls and the status on
   the row and leaves out the branch and the machine, because a row shares its
   branch with every other row under the same workspace and the worktree row above
   already names it. It applies to child rows too: a child runs where its parent
   does. The four places that used to spell out "one line or details on hover" now
   all read one derived fact (`branchLineRenders`), so the cluster can never be
   left with neither a branch line to end nor a title line to ride — or a branch
   line with nothing in it. The menu is
   the only child of that cluster that is added and removed, so it goes **first**:
   the cluster is right aligned, and a menu appended to the end would shift every
   glyph to its left the moment it appeared on hover.

9. **A child can have children.** `lib/inbox.ts`'s `familyBranches` rebuilds the
   tree from each thread's `parentThreadId` for drawing, where ordering, selection
   and the rollup want the flat `family.children` they already had. Any depth
   works, a filter that hides a middle thread promotes its children rather than
   losing them — the rule `visibleRootOf` already applies one level up — and a row
   leading to the open thread always draws its children, which is the disclosure's
   version of "never hold back the open thread". bb draws exactly three levels from
   a flat list; this is Nest's own, at any depth.
10. **One menu, opened by right-click, at every level.** A group, a project, a
   worktree, a thread family, a child thread and a parked row all open the *same*
   surface (`RowMenu`), with the same item shape, the same dividers, the same
   icons, and the same keyboard route — `Shift+F10` and the context-menu key come
   from the Radix primitive, so they work wherever a right-click does. The items
   are described by the caller, so an action is written once: a thread's set lives
   in `useThreadMenuActions` and is reached through `ThreadRowMenu`, which is why
   a family, a child row and a shelf row cannot disagree about what a thread can
   do. Nest used to put a hover-revealed `⋯` on each row instead — one trigger,
   one hover state and one menu per level. That is a deliberate reversal, and two
   things fell out of it:
   - **The dropdown primitive is gone from the tree.** `components/ui/menu.tsx`
     keeps it for the surfaces that open from a button in a dialog (the view
     menu), and it now owns the item styling both primitives share
     (`MENU_ITEM_CLASS`, `MenuItemBody`, `MENU_SUBMENU_CLASS`) so a dropdown item
     and a context-menu item cannot drift.
   - **Hover state stopped being computed for three levels.** `useRowReveal`
     existed to reveal the trigger; with the trigger gone the group, project and
     worktree rows were running a React re-render on every pointer enter and leave
     to feed a value nothing read. It survives only on the thread card, where the
     park buttons still replace the age under the pointer.
   Nesting is why the primitive matters: a right-click on a thread bubbles to the
   project it sits in, and Radix's inner trigger calls `preventDefault()`, which
   is what stops the outer project menu opening underneath it.

11. **The arrow is its own control, and the worktree row got the card's shape.**
   Two things fell out of the menu unification and the user caught both:
   - **The disclosure came back.** The `⋯` trigger drew a chevron at rest and
     swapped it for three dots under the pointer, so it was also the only thing
     that said a row was open. `RowDisclosure` is that arrow as its own control:
     always visible, never swapped, rotating with `expanded`, wired to its list
     with `aria-controls`, and on the group, project and worktree rows.
   - **The worktree row now has the layout the thread card got.** The alias owns
     its line and the branch line carries the branch's icon and name on the left
     with the row's controls (rollup, `+`, arrow) at its right end. A row with a
     branch line is a worktree, so the branch icon says so — `FolderGit`, added to
     the icon map — and the kind icon is not repeated above it. A thread card's
     branch line uses the same two icons, from the same rule, so the mark means
     one thing at both levels.
   To put controls on the branch line the row needed the thread card's structure:
   a full-bleed absolute button as the click, drag and keyboard target, with the
   label drawn beside it rather than inside it — a control cannot live inside a
   button. The full-bleed button has no text, so it carries its own `aria-label`.

12. **A full-bleed target needs its own row to be positioned.** Putting the
   worktree row's controls on its branch line meant giving the row the thread
   card's structure: an `absolute inset-0` button as its click, drag and keyboard
   target. Its host was the one row in the tree that had never needed `relative`,
   and `position: absolute` resolves against the nearest *positioned* ancestor
   rather than the parent — so the button stretched across whatever was above it
   and became one giant hit target owned by one row. The light that showed it was
   the user noticing that hovering one row opened **another row's hover card**;
   the same button also meant a click toggled that row and a drag grabbed it. The
   fix is one word, and the affordances test now pins it: every row that hosts a
   full-bleed target must declare `relative` itself.

13. **The two park buttons are one gesture with two outcomes.** Both lift their
   artwork and light a tinted ground, because they are a pair — and then they
   part: settling is *over*, so it celebrates in emerald with five sparkles
   (ported, see `settle-button.css`); snoozing is *later*, so the clock nods and
   three marks drift off it, in violet (`snooze-button.css`, Nest's own — BB
   Sidebar's snooze control is a select, so there was nothing to follow). Their
   classes live in one `PARK_TONES` table, which is what makes them siblings
   rather than two buttons that happen to be adjacent.
   **The snooze effect was written twice, and the first one was wrong.** It began
   as a single expanding ring, and it read as a control moving rather than as
   something happening — the user's words were that it was not as fun to look at
   as the settle. The reason is structural: the sparkle's quality comes from
   *several* small elements, each with its own delay and its own path, and the
   ring was one element doing one smooth thing. So the marks use the sparkle's
   construction, and the pair is deliberately asymmetric — five sparkles against
   three marks — because settling is the celebration and snoozing is the quiet
   act. Matching five would have said they are the same thing.
   The hue is the one place a row writes a colour down instead of reading the
   user's palette, and the reason is that the palette's roles are *states* — the
   snooze is the user acting on the row, not the row reporting anything, so there
   is no role to read. Violet rather than the obvious sky: sky is what a working
   row says, and amber is the tint a waiting child row already wears, so either
   would read as a *status* rather than as an action. The row-shape test bans
   amber and sky on a row for that reason and names the park pair as the one
   exception, so the rule and the exception are both pinned.

14. **A row auto-animate abandons is swept away.** Its `remove` pulls a leaving row
   out of flow and waits for the animation's `finish` to run `cleanUp`, which is
   what finally takes the element out of the document. When that event never
   arrives the row stays for good, floating over the list it left — the overlap a
   user sees as an expand lands on the heels of a collapse. `useListAutoAnimate`
   now watches its own container and deletes a direct child that still carries all
   three exit styles **and** auto-animate's delete marker (`__aa_del`, which only
   `cleanUp` clears) once nothing is animating on it. Narrow on purpose: a false
   positive would delete a row React still owns. Upstream, open:
   [formkit/auto-animate#231](https://github.com/formkit/auto-animate/issues/231)
   — "Deleted elements are not removed from the document but instead overlay
   existing elements".

## Changes

| File | Change |
| --- | --- |
| `hooks/use-list-auto-animate.ts` | New. Upstream's hook minus the drag registry and suspend/resume, with the reason. |
| `components/inbox/settle-button.css` | New. Upstream's stylesheet, re-prefixed `nest-settle`. |
| `components/inbox/snooze-button.css` | New. Nest's own: the snooze button's tick and ripple. |
| `components/inbox/page-controls.tsx` | New. The controls every paged list ends with: Load more, and the Show less that puts the list away. |
| `lib/paging.ts` | New. The default and bounds, `resolvePageSize`, `visibleRows`, `hasMoreRows`, `nextPageSize`. |
| `lib/working-since.ts` | New. Ported `reconcileWorkingSince` / `statusWithDuration` / read / write, with `threadIsWorking` and Nest's injectable storage. |
| `hooks/use-working-since.ts` | New. `WorkingSinceContext` and the hook. |
| `styles.d.ts` | New. `declare module "*.css"`. |
| `components/inbox/thread-card.tsx` | `ParkButton` gains `sparkle`; the settle call site sets it; the stylesheet is imported; the root text slot uses `StatusOrTime`; `ThreadStatusLabel` is gone; the child list stays mounted with its connector line gated on the disclosure; the card is one borderless tint at `text-sm`; the children chip and the child status flag; the child row recurses. |
| `components/inbox/disc.tsx` | `Disc` gains `compact`; `DiscCluster` moves here from the header chip so the header and the row share one cluster. |
| `lib/inbox.ts` | `familyBranches` and `branchHoldsThread`: the family as the tree it forms, for drawing. |
| `hooks/use-list-auto-animate.ts` | The exit sweep for formkit/auto-animate#231, with the marker it keys off pinned against the installed library. |
| `components/inbox/thread-inbox.tsx` | Tree wrapper and `ParkedShelf` get the animate ref; the settled shelf is paged; `settledPages` state; `searching` in the tree handlers; the `WorkingSinceContext` provider. |
| `components/inbox/status-slot.tsx` | `ThreadStatus` gains `showsDuration`; `StatusOrTime` appends the elapsed bucket. |
| `server.ts`, `lib/preferences.ts`, `components/settings/nest-settings.tsx` | The **Rows per page** setting (`type: "number"`, default 5, bounded 1–100 on read), and **Thread details** gaining its third answer, `In the row, no branch`, as the default. |
| `components/inbox/row-context-menu.tsx` | Rewritten from the thread-only right-click menu into `RowMenu` + `RowMenuItem`: the one menu every level in the tree opens. |
| `components/inbox/thread-menu-items.tsx` | `ThreadMenuItem` is now `RowMenuItem`, and `ThreadRowMenu` wires the thread items to the shared surface for the card, a child row and a shelf row. |
| `components/ui/menu.tsx` | The item styling and the submenu surface are exported, so the dropdown and the context menu draw their rows from one place. |
| `components/inbox/group-section.tsx`, `project-node.tsx`, `tree-rows.tsx` | An animate ref on each list they own, kept mounted while its rows come and go; paging on the project's and the worktree's thread lists; the connector line and padding only while open. |
| `components/inbox/slim-row.tsx`, `row-actions.tsx`, `row-metadata.tsx`, `family-status.tsx`, `provider-glyph.tsx`, `rollup-badge.tsx`, `status-glyph.tsx`, `bulk-delete-dialog.tsx`, `remove-worktree-dialog.tsx` | Timing and reduced-motion on transitions, spinners and the shine. |
| `package.json`, `package-lock.json` | `@formkit/auto-animate@^0.9.0` as a runtime dependency. |
| `tsconfig.json` | `styles.d.ts` added to `include`. |
| `test/family-branches.test.ts`, `test/row-shape-contract.test.ts`, `test/disclosure-contract.test.ts`, `test/paging.test.ts`, `test/paging-contract.test.ts`, `test/working-since.test.ts`, `test/settle-button-contract.test.ts`, `test/list-auto-animate-contract.test.ts` | New. |
| `test/distribution-contract.test.ts` | The new dependency joins the unshimmed runtime set. |
| `THIRD_PARTY_NOTICES.md`, `README.md` | The port and its licence chain. |

## Non-goals

- **No change to the tree's structure**, to bb core, the SDK, or any persisted
  store shape. Nest's server gains one declarative setting and no new store; the
  page size is a drawing decision.
- **Paging sits per list, not per project.** A project that draws a workspace
  level pages each worktree's list, so a project with three worktrees can show
  three Load more controls. Per-project paging would have to decide what a
  truncated worktree row means, and drawing it as "No threads yet" would be a
  lie.
- **No `group-hover` reveal.** Nest tracks hover in React on purpose: rows nest,
  and CSS `group-hover` fires for every ancestor, which would light up a parent's
  menu while the pointer is on a child row.
- **No pointer-drag rewrite.** Upstream's drag auto-scroll and click suppression
  come with replacing Nest's native drag-and-drop. Porting the motion does not
  require it, and the tree's drop targets, MIME types and keyboard reordering are
  pinned by contract tests.
- **No open-ports discovery, no auto-settle schedule, no durable Woke marker.**
  Each is a feature of its own; the Woke marker in particular contradicts Nest's
  decision to un-settle a thread as soon as it has attention again.

## Risks

- **Two plugins, one global stylesheet.** Handled by re-prefixing every selector
  and the keyframe, and pinned by a test that asserts the upstream prefix no
  longer appears in the rules.
- **`settledPages` is never reset** (matching upstream's habit of keeping the
  limit), so after loading three pages the shelf keeps drawing three across
  collapses and searches. What *does* follow the setting is the page size, which
  is why the limit is counted in pages.
- **A page count survives being collapsed, but not being unmounted.** Each
  list's count lives in the component that owns the list, so collapsing a
  project or a worktree keeps its place; collapsing the *project above a
  worktree* unmounts that worktree's list and it starts at one page again.
  Holding the counts in the tree instead would survive it, at the cost of
  threading a map through three levels for a case that reads as "start fresh".
- **The `limit + 1` row.** Keeping the open thread past the limit means the drawn
  list can be one longer than the limit while `hasMore` still compares the total.
  Pinned by a unit test.
- **Show less jumps the list back, and its rows leave at once.** The rows past the
  first page unmount together, which auto-animate animates as a removal but which
  shortens the box in a single frame — so the rows *below* the list move up
  instantly. Load more has the same property in the other direction, so the two
  at least match; animating the box for a page change would mean routing it
  through the list is not worth it for an action the user just asked for.
- **A search asks for `Number.MAX_SAFE_INTEGER` rather than for "everything".**
  It is a sentinel a reader has to recognise, but it keeps one code path instead
  of a second one that remembers whether a search is running. `hasMore` falls out
  false on its own.
- **Emerald is hard-coded** in the ported settle motion, as upstream ships it,
  while Nest's palette is user-configurable. A recoloured palette still shows
  emerald on that one button — kept deliberately, as the upstream default.
- **The root row now names its status** where it used to show only the age, so a
  working row reads `[⟳] … Working · 5m`. That duplicates the glyph's meaning in
  words, which is upstream's own design, but it is the one visible change to a
  row's content here.
- **A collapsing list's rows float over what is below it.** Auto-animate takes a
  leaving row out of flow at its old coordinates with `z-index: 100` so it can
  fade there, while the content below has already moved up. That is exactly what
  a loaded page does, and it is the trade the row animation is: with seventeen
  rows leaving at once there are seventeen of them fading over the list's
  neighbours, rather than one panel gliding shut.
- **The box height snaps.** It follows the rows rather than gliding to meet
  them. There is no way to have both, since a smooth height needs the leaving
  rows to still be in flow and this animation needs them out of it.
- **A placeholder does not animate.** `No threads yet` is one muted line with no
  rows in it, so it appears and disappears outright. It was worth not building a
  second mechanism for.
- **The disclosure is not interruptible *as a height*.** Auto-animate cancels an
  in-flight animation for a row that changes again, so a rapid toggle resolves to
  the last state rather than getting stuck — but the departure is a Web Animation
  on each row, not a CSS transition, so it has none of the "reverse mid-flight"
  smoothness a transition gives a single property.
- **A spring is no longer available to swap in.** Material 3's expressive update
  moved its motion system to springs and `transition-timing-function: linear()`
  approximates one in pure CSS, but the timings here are auto-animate's own
  (225ms easing-in on entry, 150ms easing-out on exit) and adopting a spring
  would mean replacing the library's animation, not retuning a constant.
- **The exit sweep reads a private field.** `__aa_del` is auto-animate's own
  marker and could be renamed by an upgrade, which would silently disable the
  sweep. A test pins the name against the installed library so the failure is
  loud instead. The three exit styles it also checks are pinned the same way.
- **The sweep only runs after a mutation.** A row abandoned by a removal that
  nothing else follows stays until the next change to that list. It cannot be
  shorter than this without polling, and every abandoned row this was written for
  is created *by* a mutation, so that is the case it covers.
- **The menu is the only way in.** Removing the `⋯` triggers means a row's
  actions are reachable by right-click, `Shift+F10`, or the context-menu key — and
  by nothing else. A pointer without a right button (a touch device) has the
  long-press the primitive handles, and there is no visible control that says a
  row has a menu at all. That is the trade the user asked for; the frequent action
  on a project or a worktree row keeps its own button, which is also what makes
  the menu discoverable at those two levels.
- **Nesting changes what a collapsed family hides.** A child's own list follows
  the same preference and the same stored override as a family's, so
  `Default child expansion: Collapsed` now hides a level that used to be drawn
  flat. A row leading to the open thread draws its children regardless.
- **The nested override shares the family's stored field.** "Expanded by hand" is
  one map keyed by thread id, so a nested list persists exactly like a family —
  and the field is still named for families. Renaming it would drop the stored
  values of a persisted view state, which is not worth a tidier key.
- **Cost.** Seven auto-animate observers and one `localStorage` write per new
  stamp. Negligible, but the minute tick's identity guard in
  `reconcileWorkingSince` is what keeps it from costing a render per row. The exit
  sweep adds one timer per child-list mutation, each doing one pass over that
  container's direct children.

## Verification

See `GATES.md`.

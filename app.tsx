// bb-plugin-nested-sidebar — a project-first replacement for bb's sidebar thread
// list. Root threads keep a stable position and expand their child agents in
// place, so activity changes state without moving the user's navigation.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadInbox } from "@/components/inbox/thread-inbox";
import { ParentChip } from "@/components/inbox/parent-chip";
import { NestSettingsSection } from "@/components/settings/nest-settings";

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "appearance",
    title: "Appearance & behavior",
    description: "Preview the effective Nest palette and layout settings.",
    component: NestSettingsSection,
  });

  app.slots.experimental_threadList({
    id: "inbox",
    title: "Nest (projects)",
    description:
      "Stable project groups with expandable root threads and inline agents.",
    component: ThreadInbox,
  });

  // A child remains nested in the sidebar, and this is the direct route back
  // to its root while the user is focused in the thread itself.
  app.slots.experimental_threadHeaderAction({
    id: "parent",
    title: "Parent thread",
    component: ParentChip,
  });

  // The view menu can change filtering and ordering, but the display settings
  // (density, row layout, which metadata shows) are `bb.settings`, which the
  // frontend can read but not write. Rather than keep a second copy of them,
  // this is a one-click route to the page that owns them.
  app.slots.sidebarFooterAction({
    id: "settings",
    title: "Nest settings",
    icon: "Settings",
    run: (context) => context.openSettings(),
  });
});

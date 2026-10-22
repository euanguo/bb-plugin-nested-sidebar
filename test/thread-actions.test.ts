import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const hook = await readFile(
  new URL("../hooks/use-thread-actions.ts", import.meta.url),
  "utf8",
);
const menu = await readFile(
  new URL("../components/inbox/thread-menu-items.tsx", import.meta.url),
  "utf8",
);

describe("current bb thread actions", () => {
  it("adapts navigation and mutations over the current browser SDK", () => {
    assert.match(hook, /useBbNavigate/);
    assert.match(hook, /useSdk/);
    assert.match(hook, /navigate\.toThread/);
    assert.match(hook, /navigate\.toCompose/);
    assert.match(hook, /sdk\.threads\.pin/);
    assert.match(hook, /sdk\.threads\.unpin/);
    assert.match(hook, /sdk\.threads\.markRead/);
    assert.match(hook, /sdk\.threads\.markUnread/);
    assert.match(hook, /sdk\.threads\.update/);
    assert.match(hook, /sdk\.threads\.archive/);
  });

  it("does not import a sidebar action hook the host no longer exports", () => {
    assert.doesNotMatch(hook, /experimental_useSidebarThreadActions/);
    assert.doesNotMatch(menu, /experimental_useSidebarThreadActions/);
  });

  it("routes destructive deletion through bb's registered delete action", () => {
    assert.match(menu, /experimental_useThreadActions\(actionTarget\)/);
    assert.match(menu, /entry\.pluginId === "bb--core"/);
    assert.match(menu, /deleteAction\.action\.run\(\)/);
  });
});

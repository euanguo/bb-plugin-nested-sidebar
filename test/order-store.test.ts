import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { describe, it } from "node:test";
import { UNGROUPED_ORDER_SCOPE } from "../lib/manual-order.ts";
import { MANUAL_ORDER_MIGRATION, createOrderStore } from "../lib/order-store.ts";

function createStore() {
  const db = new Database(":memory:");
  db.exec(MANUAL_ORDER_MIGRATION);
  return { db, store: createOrderStore(db) };
}

describe("manual order store", () => {
  it("round-trips one scope per kind and drops rows on delete", () => {
    const { db, store } = createStore();
    try {
      assert.equal(store.setProjectOrder("g1", ["p2", "p1"]), true);
      assert.equal(store.setFamilyOrder("p1", ["t2", "t1"]), true);
      assert.deepEqual(store.list(), {
        projects: { g1: ["p2", "p1"] },
        families: { p1: ["t2", "t1"] },
      });
      store.removeGroup("g1");
      store.removeProject("p1");
      assert.deepEqual(store.list(), { projects: {}, families: {} });
    } finally {
      db.close();
    }
  });

  it("rejects duplicate ids and blank scopes", () => {
    const { db, store } = createStore();
    try {
      assert.equal(store.setProjectOrder("g1", ["p1", "p1"]), false);
      assert.equal(store.setProjectOrder("", ["p1"]), false);
      assert.equal(store.setFamilyOrder("p1", ["t1", "t1"]), false);
      assert.deepEqual(store.list(), { projects: {}, families: {} });
    } finally {
      db.close();
    }
  });

  it("seeds the legacy global order by splitting it over groups", () => {
    const { db, store } = createStore();
    try {
      const seeded = store.seed(
        { projectIds: ["p3", "p1", "p2"], families: { p1: ["t1"] } },
        { p1: "g1", p2: "g1" },
      );
      assert.equal(seeded, true);
      assert.deepEqual(store.list(), {
        projects: { g1: ["p1", "p2"], [UNGROUPED_ORDER_SCOPE]: ["p3"] },
        families: { p1: ["t1"] },
      });
      // A second device must not overwrite an arrangement already in place.
      assert.equal(store.seed({ projectIds: ["p9"], families: {} }, {}), false);
      assert.deepEqual(store.list().projects.g1, ["p1", "p2"]);
    } finally {
      db.close();
    }
  });

  it("does nothing when there is nothing to seed", () => {
    const { db, store } = createStore();
    try {
      assert.equal(store.seed({ projectIds: [], families: {} }, {}), false);
      assert.deepEqual(store.list(), { projects: {}, families: {} });
    } finally {
      db.close();
    }
  });

  it("skips a stored column this build cannot read", () => {
    const { db, store } = createStore();
    try {
      db.prepare(
        `INSERT INTO manual_order (scope_kind, scope_id, item_ids, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run("group", "g1", "not json", 0);
      assert.deepEqual(store.list().projects, {});
    } finally {
      db.close();
    }
  });
});

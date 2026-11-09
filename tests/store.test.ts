import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DomainError, Store } from "../lib/store.ts";
const valid = { jobId: "j-01", name: "Alex Morgan", email: "ALEX@EXAMPLE.COM", note: "I enjoy building accessible interfaces and reliable APIs with a thoughtful team." };
test("applications persist across database reopening; duplicate account/job submissions are rejected", () => {
  const directory = mkdtempSync(join(tmpdir(), "hireflow-test-"));
  const path = join(directory, "test.sqlite");
  let store = new Store(path, false);
  try {
    const first = store.apply(valid);
    assert.equal(first.email, "alex@example.com");
    assert.equal(first.status, "Submitted");
    store.save("j-01", true); store.save("j-01", true);
    store.close(); store = new Store(path, false);
    assert.equal(store.applications()[0].id, first.id);
    assert.deepEqual(store.saved(), ["j-01"]);
    assert.throws(() => store.apply({ ...valid, email: "another@example.com" }), (e) => e instanceof DomainError && e.status === 409);
    store.save("j-01", false); assert.deepEqual(store.saved(), []);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test("status workflow forbids skipped stages, stale moves and terminal-state reopening", () => {
  const store = new Store(":memory:", false);
  try {
    const application = store.apply(valid);
    assert.throws(() => store.move(application.id, "Hired", "employer"), /Cannot move/);
    for (const status of ["Reviewing", "Interview", "Offer", "Hired"]) assert.equal(store.move(application.id, status, "employer").status, status);
    assert.throws(() => store.move(application.id, "Reviewing", "employer"), /Cannot move/);
  } finally { store.close(); }
});
test("candidate withdrawal is restricted to their own active applications", () => {
  const store = new Store(":memory:");
  try {
    assert.throws(() => store.move("sample-0", "Withdrawn", "candidate"), (e) => e instanceof DomainError && e.status === 403);
    const own = store.apply(valid);
    assert.throws(() => store.move(own.id, "Reviewing", "candidate"), /only withdraw/);
    assert.throws(() => store.move(own.id, "Withdrawn", "employer"), /Only a candidate/);
    assert.equal(store.move(own.id, "Withdrawn", "candidate").status, "Withdrawn");
    assert.throws(() => store.move(own.id, "Reviewing", "employer"), /Cannot move/);
  } finally { store.close(); }
});
test("server validates application fields, missing jobs and unknown statuses", () => {
  const store = new Store(":memory:", false);
  try {
    assert.throws(() => store.apply({ ...valid, name: " " }), /name/);
    assert.throws(() => store.apply({ ...valid, email: "wrong" }), /email/);
    assert.throws(() => store.apply({ ...valid, note: "short" }), /introduction/);
    assert.throws(() => store.apply({ ...valid, jobId: "unknown" }), (e) => e instanceof DomainError && e.status === 404);
    assert.throws(() => store.save("unknown", true), /could not be found/);
    assert.throws(() => store.move("unknown", "invented", "employer"), /valid application stage/);
    assert.throws(() => store.move("unknown", "Reviewing", "employer"), (e) => e instanceof DomainError && e.status === 404);
    assert.equal(store.applications().length, 0);
  } finally { store.close(); }
});

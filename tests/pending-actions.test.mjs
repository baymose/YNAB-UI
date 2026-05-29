import assert from "node:assert/strict";
import { test } from "node:test";

const mod = await import("../src/lib/pending-actions.ts");

const {
  createPendingAction,
  verifyPendingAction,
  describePendingAction,
  isPendingActionExpired,
} = mod;

test("createPendingAction signs write-tool approval payloads without executing them", () => {
  const action = createPendingAction({
    toolName: "assign_to_category",
    input: { category_id: "cat-1", month: "2026-05-01", budgeted_dollars: 125 },
    userId: "user-1",
    chatId: "chat-1",
    now: 1_700_000_000_000,
    secret: "test-secret",
  });

  assert.equal(action.toolName, "assign_to_category");
  assert.deepEqual(action.input, {
    category_id: "cat-1",
    month: "2026-05-01",
    budgeted_dollars: 125,
  });
  assert.match(action.id, /^pa_/);
  assert.ok(action.token.length > 40);
  assert.equal(action.expiresAt, "2023-11-14T22:28:20.000Z");

  const verified = verifyPendingAction(action.token, {
    userId: "user-1",
    chatId: "chat-1",
    now: 1_700_000_000_000,
    secret: "test-secret",
  });

  assert.deepEqual(verified, {
    id: action.id,
    toolName: "assign_to_category",
    input: action.input,
    userId: "user-1",
    chatId: "chat-1",
    expiresAt: action.expiresAt,
  });
});

test("verifyPendingAction rejects tampered, wrong-user, and expired approvals", () => {
  const action = createPendingAction({
    toolName: "delete_memory",
    input: { id: "mem-1" },
    userId: "user-1",
    chatId: "chat-1",
    now: 1_700_000_000_000,
    secret: "test-secret",
  });

  assert.throws(
    () => verifyPendingAction(`${action.token}tampered`, {
      userId: "user-1",
      chatId: "chat-1",
      now: 1_700_000_000_000,
      secret: "test-secret",
    }),
    /Invalid pending action signature/,
  );

  assert.throws(
    () => verifyPendingAction(action.token, {
      userId: "someone-else",
      chatId: "chat-1",
      now: 1_700_000_000_000,
      secret: "test-secret",
    }),
    /does not belong to this chat/,
  );

  assert.throws(
    () => verifyPendingAction(action.token, {
      userId: "user-1",
      chatId: "chat-1",
      now: 1_700_000_000_000 + 16 * 60 * 1000,
      secret: "test-secret",
    }),
    /expired/,
  );
});

test("describePendingAction creates human-readable confirmation copy", () => {
  assert.deepEqual(
    describePendingAction("assign_to_category", {
      category_id: "cat-1",
      month: "2026-05-01",
      budgeted_dollars: 125,
    }),
    {
      title: "Confirm budget assignment",
      detail: "Set category cat-1 to $125.00 for 2026-05-01.",
      destructive: false,
    },
  );

  assert.deepEqual(
    describePendingAction("bulk_categorize_transactions", {
      updates: [
        { transaction_id: "tx-1", category_id: "cat-1" },
        { transaction_id: "tx-2", category_id: "cat-2" },
      ],
    }),
    {
      title: "Confirm 2 transaction category updates",
      detail: "Update 2 transactions to new categories.",
      destructive: false,
    },
  );

  assert.equal(isPendingActionExpired("2023-11-14T22:13:19.999Z", 1_700_000_000_000), true);
  assert.equal(isPendingActionExpired("2023-11-14T22:13:20.000Z", 1_700_000_000_000), false);
});

import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memories } from "@/db/schema";
import {
  assignToCategory,
  bulkCategorizeTransactions,
  categorizeTransaction,
  getAccounts,
  getBudgetSummary,
  getCategories,
  getMonth,
  getPayees,
  listTransactions,
} from "./ynab-api";

export type ToolContext = { userId: string };

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

export const tools: Anthropic.Tool[] = [
  {
    name: "get_budget_summary",
    description:
      "Returns top-level budget info: name, currency, first/last month, account count, category groups.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_accounts",
    description: "List all open, on/off-budget accounts with balances in dollars.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_categories",
    description:
      "List category groups for the current month with each category's budgeted, activity, and available (dollars), plus ready_to_assign and age_of_money.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_month",
    description:
      "Get summary for one budget month. Use 'current' for the current month, otherwise YYYY-MM-01.",
    input_schema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "'current' or YYYY-MM-01",
          default: "current",
        },
      },
    },
  },
  {
    name: "list_transactions",
    description:
      "List transactions. Filter by 'uncategorized' or 'unapproved', an ISO since_date (YYYY-MM-DD), or scope to a single account or category.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["uncategorized", "unapproved"] },
        since_date: { type: "string", description: "YYYY-MM-DD" },
        account_id: { type: "string" },
        category_id: { type: "string" },
        limit: {
          type: "number",
          description: "Max items returned (default 100).",
        },
      },
    },
  },
  {
    name: "get_payees",
    description: "List all payees.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "categorize_transaction",
    description: "Update a single transaction's category.",
    input_schema: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        category_id: { type: "string" },
      },
      required: ["transaction_id", "category_id"],
    },
  },
  {
    name: "bulk_categorize_transactions",
    description:
      "Update many transactions' categories at once. 'updates' is a list of { transaction_id, category_id }.",
    input_schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              transaction_id: { type: "string" },
              category_id: { type: "string" },
            },
            required: ["transaction_id", "category_id"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "save_memory",
    description:
      "Save a durable personal fact about the user (goals, holdings, account preferences, family info, recurring obligations, etc.) so you remember it in future chats. Use for things worth recalling later — not ephemeral questions or numbers you can fetch from YNAB. One fact per call; keep it concise.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The fact to remember, written in first person from the user's perspective (e.g. 'Saving for a trip to Florida in October 2026').",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "list_memories",
    description: "List everything you currently remember about the user. Useful when they ask what you know about them.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "delete_memory",
    description: "Delete a remembered fact by its id. Use when the user asks you to forget something.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The memory id returned from list_memories or save_memory." },
      },
      required: ["id"],
    },
  },
  {
    name: "assign_to_category",
    description: "Set a category's budgeted amount (in dollars) for a given month (YYYY-MM-01).",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string" },
        month: { type: "string" },
        budgeted_dollars: { type: "number" },
      },
      required: ["category_id", "month", "budgeted_dollars"],
    },
  },
];

export const handlers: Record<string, ToolHandler> = {
  get_budget_summary: () => getBudgetSummary(),
  get_accounts: () => getAccounts(),
  get_categories: () => getCategories(),
  get_month: (input) => getMonth((input.month as string) || "current"),
  list_transactions: (input) =>
    listTransactions({
      type: input.type as "uncategorized" | "unapproved" | undefined,
      since_date: input.since_date as string | undefined,
      account_id: input.account_id as string | undefined,
      category_id: input.category_id as string | undefined,
      limit: input.limit as number | undefined,
    }),
  get_payees: () => getPayees(),
  categorize_transaction: (input) =>
    categorizeTransaction(
      input.transaction_id as string,
      input.category_id as string,
    ),
  bulk_categorize_transactions: (input) =>
    bulkCategorizeTransactions(
      input.updates as Array<{ transaction_id: string; category_id: string }>,
    ),
  assign_to_category: (input) =>
    assignToCategory(
      input.category_id as string,
      input.month as string,
      input.budgeted_dollars as number,
    ),
  save_memory: async (input, ctx) => {
    const content = String(input.content ?? "").trim();
    if (!content) throw new Error("content is required");
    const [row] = await db()
      .insert(memories)
      .values({ userId: ctx.userId, content })
      .returning();
    return {
      id: row.id,
      content: row.content,
      summary: { title: "Saved a memory", detail: content },
    };
  },
  list_memories: async (_input, ctx) => {
    const rows = await db()
      .select()
      .from(memories)
      .where(eq(memories.userId, ctx.userId))
      .orderBy(asc(memories.createdAt));
    return {
      memories: rows.map((m) => ({ id: m.id, content: m.content })),
    };
  },
  delete_memory: async (input, ctx) => {
    const id = String(input.id ?? "");
    if (!id) throw new Error("id is required");
    const deleted = await db()
      .delete(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, ctx.userId)))
      .returning();
    if (deleted.length === 0) return { error: "Memory not found." };
    return {
      id,
      summary: { title: "Forgot a memory", detail: deleted[0].content },
    };
  },
};

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext = { userId: "" },
): Promise<unknown> {
  const fn = handlers[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  try {
    return await fn(input, ctx);
  } catch (err) {
    return { error: describeError(err) };
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const nested = (e.error ?? e.response) as Record<string, unknown> | undefined;
    const detail = nested?.detail ?? nested?.name ?? nested?.message;
    if (typeof detail === "string") return detail;
    if (typeof e.message === "string") return e.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export async function runToolForRoute(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext = { userId: "" },
): Promise<Response> {
  const result = await runTool(name, input, ctx);
  if (result && typeof result === "object" && "error" in result) {
    return Response.json(result, { status: 500 });
  }
  return Response.json(result);
}

export const WRITE_TOOLS = new Set<string>([
  "categorize_transaction",
  "bulk_categorize_transactions",
  "assign_to_category",
  "save_memory",
  "delete_memory",
]);

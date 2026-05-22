import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "./anthropic";
import { runTool, tools } from "./tools";
import { assignToCategory, getCategories } from "./ynab-api";

export type CoverMove = {
  from_category_id: string;
  from_name: string;
  to_category_id: string;
  to_name: string;
  amount_dollars: number;
  reason: string;
};

export type CoverPlan = {
  generated_at: string;
  summary: string;
  moves: CoverMove[];
  leftover_overspending: Array<{ category: string; amount_dollars: number }>;
};

export const READY_TO_ASSIGN_ID = "ready_to_assign";

const READ_ONLY_TOOLS: Anthropic.Tool[] = tools.filter((t) =>
  ["get_categories", "get_month"].includes(t.name),
);

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_cover_plan",
  description:
    "Submit the final plan to cover overspending. Call this exactly once when you are done.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "One short paragraph explaining the overall strategy.",
      },
      moves: {
        type: "array",
        description:
          "Money moves to fix overspending. Each move increases the target's budgeted amount by amount_dollars and decreases the source's by the same amount. For RTA, use from_category_id 'ready_to_assign'.",
        items: {
          type: "object",
          properties: {
            from_category_id: {
              type: "string",
              description:
                "Source category id, or 'ready_to_assign' to pull from Ready to Assign.",
            },
            from_name: { type: "string" },
            to_category_id: { type: "string" },
            to_name: { type: "string" },
            amount_dollars: {
              type: "number",
              description: "Positive dollar amount to move.",
            },
            reason: {
              type: "string",
              description: "One sentence justifying this specific move.",
            },
          },
          required: [
            "from_category_id",
            "from_name",
            "to_category_id",
            "to_name",
            "amount_dollars",
            "reason",
          ],
        },
      },
      leftover_overspending: {
        type: "array",
        description:
          "Overspent categories that could not be fully covered. Empty if everything is covered.",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            amount_dollars: {
              type: "number",
              description: "Remaining overspend in dollars (positive number).",
            },
          },
          required: ["category", "amount_dollars"],
        },
      },
    },
    required: ["summary", "moves", "leftover_overspending"],
  },
};

const SYSTEM = `You are Penny, a personal budget assistant. Your single task: propose money moves that cover every overspent (negative balance) category in the user's current YNAB month.

Rules:
- Call get_categories first to see all categories with budgeted/activity/balance and ready_to_assign.
- Only propose moves FROM categories with a strictly positive balance, OR from the synthetic source id "ready_to_assign" when ready_to_assign > 0.
- Never propose moving more than the source's current balance (or current ready_to_assign).
- Target categories MUST currently have a negative balance. Move just enough to bring them to exactly $0.
- Prefer pulling from Ready to Assign first if available; otherwise prefer same-group categories with the largest cushion; avoid draining categories with goals or near-zero balances.
- One move per (source, target) pair. Combine into the fewest moves needed.
- Each "reason" is ONE sentence. Be concrete (cite the cushion you're pulling from).
- If nothing is overspent, submit with moves=[] and a one-line summary.
- If some overspending cannot be fully covered, list the shortfall in leftover_overspending.

Finish by calling submit_cover_plan exactly once.`;

let inflight: Promise<CoverPlan> | null = null;

export function proposeCoverPlan(): Promise<CoverPlan> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      return await proposeInner();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function proposeInner(): Promise<CoverPlan> {
  const client = anthropic();
  const convo: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Propose a plan to cover all overspent categories this month. Then call submit_cover_plan.",
    },
  ];
  const allTools = [...READ_ONLY_TOOLS, SUBMIT_TOOL];

  for (let turn = 0; turn < 8; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: allTools,
      messages: convo,
    });

    convo.push({ role: "assistant", content: response.content });

    const submit = response.content.find(
      (b) => b.type === "tool_use" && b.name === "submit_cover_plan",
    );
    if (submit && submit.type === "tool_use") {
      const input = submit.input as {
        summary: string;
        moves: CoverMove[];
        leftover_overspending: Array<{ category: string; amount_dollars: number }>;
      };
      return {
        generated_at: new Date().toISOString(),
        summary: input.summary,
        moves: input.moves ?? [],
        leftover_overspending: input.leftover_overspending ?? [],
      };
    }

    if (response.stop_reason !== "tool_use") {
      throw new Error("Model stopped without submitting a cover plan");
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await runTool(
        block.name,
        (block.input ?? {}) as Record<string, unknown>,
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    convo.push({ role: "user", content: toolResults });
  }
  throw new Error("Cover plan exceeded turn limit");
}

function currentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export type ApplyResult = {
  applied: Array<{ from: string; to: string; amount: number }>;
  errors: Array<{ from: string; to: string; amount: number; error: string }>;
};

export async function applyCoverMoves(moves: CoverMove[]): Promise<ApplyResult> {
  const month = currentMonth();
  const cats = await getCategories();
  const byId = new Map<string, { name: string; budgeted: number; balance: number }>();
  for (const g of cats.groups) {
    for (const c of g.categories) {
      byId.set(c.id, { name: c.name, budgeted: c.budgeted, balance: c.balance });
    }
  }

  // Aggregate deltas per category so multiple moves on the same category combine.
  const deltas = new Map<string, number>();
  for (const mv of moves) {
    if (mv.amount_dollars <= 0) continue;
    if (mv.from_category_id !== READY_TO_ASSIGN_ID) {
      deltas.set(
        mv.from_category_id,
        (deltas.get(mv.from_category_id) ?? 0) - mv.amount_dollars,
      );
    }
    deltas.set(
      mv.to_category_id,
      (deltas.get(mv.to_category_id) ?? 0) + mv.amount_dollars,
    );
  }

  const applied: ApplyResult["applied"] = [];
  const errors: ApplyResult["errors"] = [];

  // Apply targets (increases) first so we don't transiently push a source negative.
  const ordered = [...deltas.entries()].sort((a, b) => b[1] - a[1]);
  for (const [categoryId, delta] of ordered) {
    const cur = byId.get(categoryId);
    if (!cur) {
      errors.push({
        from: "?",
        to: categoryId,
        amount: delta,
        error: "Unknown category",
      });
      continue;
    }
    const next = Number((cur.budgeted + delta).toFixed(2));
    try {
      await assignToCategory(categoryId, month, next);
      applied.push({ from: cur.name, to: cur.name, amount: delta });
    } catch (err) {
      errors.push({
        from: cur.name,
        to: cur.name,
        amount: delta,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errors };
}

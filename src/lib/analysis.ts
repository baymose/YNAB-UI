import { promises as fs } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "./anthropic";
import { runTool, tools } from "./tools";

export type Finding = {
  severity: "info" | "warn" | "alert";
  title: string;
  body: string;
  category?: string | null;
};

export type Analysis = {
  generated_at: string;
  summary: string;
  findings: Finding[];
};

const FILE = path.join(process.cwd(), "data", "analysis.json");
const DAY_MS = 24 * 60 * 60 * 1000;

const READ_ONLY_TOOLS: Anthropic.Tool[] = tools.filter((t) =>
  [
    "get_budget_summary",
    "get_accounts",
    "get_categories",
    "get_month",
    "list_transactions",
  ].includes(t.name),
);

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_analysis",
  description:
    "Submit the final daily budget analysis. Call this exactly once when you are done investigating.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One-paragraph plain-English summary of the budget's current state.",
      },
      findings: {
        type: "array",
        description:
          "Distinct issues, risks, or suggestions. Be specific — reference real categories, amounts, and dates.",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["info", "warn", "alert"] },
            title: { type: "string" },
            body: {
              type: "string",
              description: "1-3 sentences. Cite numbers.",
            },
            category: {
              type: "string",
              description: "Optional category name this relates to.",
            },
          },
          required: ["severity", "title", "body"],
        },
      },
    },
    required: ["summary", "findings"],
  },
};

const SYSTEM = `You are Penny, a personal budget analyst. You run once a day to inspect the user's YNAB budget and flag what deserves attention.

Use the read-only tools to gather data. Then call submit_analysis exactly once with your findings.

Look for:
- Overspent categories (negative available balance) — alert severity
- Categories likely to overspend before month-end based on pace — warn
- Uncategorized or unapproved transactions piling up — warn
- Unusually large transactions vs. that category's norm — info or warn
- "Ready to Assign" sitting unassigned more than a couple days into the month — warn
- Positive trends worth noting (savings, healthy balances) — info, but only mention if non-obvious

Be specific. Always cite real category names, dollar amounts (format like $123.45), and dates. No filler.
Aim for 3-8 findings. Skip anything trivial.`;

export async function loadAnalysis(): Promise<Analysis | null> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as Analysis;
  } catch {
    return null;
  }
}

export async function saveAnalysis(a: Analysis): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(a, null, 2));
}

export function isStale(a: Analysis | null): boolean {
  if (!a) return true;
  return Date.now() - new Date(a.generated_at).getTime() > DAY_MS;
}

let inflight: Promise<Analysis> | null = null;

export function runAnalysis(): Promise<Analysis> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      return await runAnalysisInner();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function runAnalysisInner(): Promise<Analysis> {
  const client = anthropic();
  const convo: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Run today's budget analysis. Gather what you need, then submit_analysis.",
    },
  ];
  const allTools = [...READ_ONLY_TOOLS, SUBMIT_TOOL];

  for (let turn = 0; turn < 12; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: allTools,
      messages: convo,
    });

    convo.push({ role: "assistant", content: response.content });

    const submit = response.content.find(
      (b) => b.type === "tool_use" && b.name === "submit_analysis",
    );
    if (submit && submit.type === "tool_use") {
      const input = submit.input as { summary: string; findings: Finding[] };
      const analysis: Analysis = {
        generated_at: new Date().toISOString(),
        summary: input.summary,
        findings: input.findings ?? [],
      };
      await saveAnalysis(analysis);
      return analysis;
    }

    if (response.stop_reason !== "tool_use") {
      throw new Error("Model stopped without submitting analysis");
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
  throw new Error("Analysis exceeded turn limit");
}

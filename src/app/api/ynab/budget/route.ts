import { runToolForRoute } from "@/lib/tools";

export const runtime = "nodejs";

export async function GET() {
  return runToolForRoute("get_budget_summary", {});
}

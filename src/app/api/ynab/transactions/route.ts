import { runToolForRoute } from "@/lib/tools";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const input: Record<string, unknown> = {};
  const type = url.searchParams.get("type");
  if (type === "uncategorized" || type === "unapproved") input.type = type;
  const since = url.searchParams.get("since_date");
  if (since) input.since_date = since;
  const limit = url.searchParams.get("limit");
  if (limit) input.limit = Number(limit);
  return runToolForRoute("list_transactions", input);
}

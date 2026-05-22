import { runToolForRoute } from "@/lib/tools";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || "current";
  return runToolForRoute("get_month", { month });
}

import { proposeCoverPlan } from "@/lib/auto-cover";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const plan = await proposeCoverPlan();
    return Response.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

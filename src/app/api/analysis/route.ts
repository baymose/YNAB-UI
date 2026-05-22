import { isStale, loadAnalysis, runAnalysis } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const cached = await loadAnalysis();
  if (cached && !isStale(cached)) {
    return Response.json({ analysis: cached, refreshing: false });
  }
  // Kick off regeneration in the background; return what we have (if any) immediately.
  runAnalysis().catch((err) => {
    console.error("daily analysis failed:", err);
  });
  return Response.json({ analysis: cached, refreshing: true });
}

export async function POST() {
  try {
    const analysis = await runAnalysis();
    return Response.json({ analysis, refreshing: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

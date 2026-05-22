import { applyCoverMoves, type CoverMove } from "@/lib/auto-cover";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { moves?: CoverMove[] };
    const moves = Array.isArray(body.moves) ? body.moves : [];
    const result = await applyCoverMoves(moves);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

import { ynabClient } from "@/lib/ynab";

export const runtime = "nodejs";

export async function GET() {
  try {
    const api = ynabClient();
    const { data } = await api.user.getUser();
    return Response.json({ ok: true, user: data.user });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: unknown };
    return Response.json(
      {
        ok: false,
        status: e?.status ?? null,
        message: e?.message ?? null,
        raw: e?.error ?? e,
      },
      { status: 500 },
    );
  }
}

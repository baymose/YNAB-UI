import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { memories } from "@/db/schema";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

async function addMemory(formData: FormData) {
  "use server";
  const userId = await requireUserId();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await db().insert(memories).values({ userId, content });
  revalidatePath("/memories");
}

async function deleteMemory(formData: FormData) {
  "use server";
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db()
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
  revalidatePath("/memories");
}

export default async function MemoriesPage() {
  const userId = await requireUserId();
  const rows = await db()
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(asc(memories.createdAt));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-background"
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              <span className="display text-xl leading-none">P</span>
            </div>
            <div className="leading-tight">
              <div className="display-tight text-base text-foreground">Penny</div>
              <div className="text-[11px] text-muted">your money, friendlier</div>
            </div>
          </Link>
          <Link
            href="/"
            className="rounded-2xl border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            ← Back to chat
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div
          className="rounded-3xl border border-border bg-panel/40 p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <h1 className="display text-2xl">Memories</h1>
          <p className="mt-1 text-sm text-muted">
            Facts Penny remembers about you across chats. She&apos;ll save these on her own when you share durable info, but you can add, review, and delete them here.
          </p>

          <form action={addMemory} className="mt-6 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Add a memory</span>
              <textarea
                name="content"
                required
                rows={2}
                placeholder="e.g. My 401k is mostly VTSAX"
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-2 text-sm font-medium text-background"
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              Save
            </button>
          </form>

          <div className="mt-8 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted">
              {rows.length === 0 ? "Nothing saved yet" : `${rows.length} saved`}
            </div>
            {rows.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{m.content}</div>
                  <div className="mt-1 text-[11px] text-muted">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <form action={deleteMemory}>
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
                  >
                    Forget
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

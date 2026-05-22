import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, messages } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [chat] = await db().select().from(chats).where(eq(chats.id, id));
  if (!chat) return new Response("Not found", { status: 404 });
  const msgs = await db()
    .select()
    .from(messages)
    .where(eq(messages.chatId, id))
    .orderBy(asc(messages.createdAt));
  return Response.json({ ...chat, messages: msgs });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db().delete(chats).where(eq(chats.id, id));
  return new Response(null, { status: 204 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { title } = (await req.json()) as { title: string };
  const [row] = await db()
    .update(chats)
    .set({ title, updatedAt: new Date() })
    .where(eq(chats.id, id))
    .returning();
  return Response.json(row);
}

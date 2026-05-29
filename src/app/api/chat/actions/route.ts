import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, messages as messagesTable } from "@/db/schema";
import { verifyPendingAction } from "@/lib/pending-actions";
import { runTool } from "@/lib/tools";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

type ActionRequest = {
  chatId: string;
  token: string;
  decision: "approve" | "reject";
};

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (r) {
    return r as Response;
  }

  const { chatId, token, decision } = (await req.json()) as ActionRequest;
  if (!chatId || !token || !["approve", "reject"].includes(decision)) {
    return Response.json({ error: "chatId, token, and decision are required" }, { status: 400 });
  }

  const [chat] = await db()
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  if (!chat) return Response.json({ error: "Chat not found" }, { status: 404 });

  let action;
  try {
    action = verifyPendingAction(token, { userId, chatId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }

  if (decision === "reject") {
    await db().insert(messagesTable).values({
      chatId,
      role: "assistant",
      content: `Rejected pending action: ${action.toolName}. No changes were made.`,
      tools: [{ name: action.toolName }],
    });
    return Response.json({
      decision: "rejected",
      mutated: false,
      action: { id: action.id, toolName: action.toolName },
    });
  }

  const result = await runTool(action.toolName, action.input, { userId });
  const summary =
    result && typeof result === "object" && "summary" in result
      ? (result as { summary: unknown }).summary
      : null;

  await db().insert(messagesTable).values({
    chatId,
    role: "assistant",
    content: `Approved pending action: ${action.toolName}.`,
    tools: [{ name: action.toolName }],
  });
  await db()
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.id, chatId));

  return Response.json({
    decision: "approved",
    mutated: true,
    action: { id: action.id, toolName: action.toolName },
    result,
    summary,
  });
}

import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { anthropic, MODEL, SYSTEM_PROMPT } from "@/lib/anthropic";
import { runTool, tools, WRITE_TOOLS } from "@/lib/tools";
import { db } from "@/db/client";
import { chats, messages as messagesTable } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { chatId, message } = (await req.json()) as {
    chatId: string;
    message: string;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const [chat] = await db()
          .select()
          .from(chats)
          .where(eq(chats.id, chatId));
        if (!chat) throw new Error("Chat not found");

        const history = await db()
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.chatId, chatId))
          .orderBy(asc(messagesTable.createdAt));

        await db()
          .insert(messagesTable)
          .values({ chatId, role: "user", content: message });

        const convo: Anthropic.MessageParam[] = [
          ...history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: message },
        ];

        let didMutate = false;
        let assistantText = "";
        const assistantTools: { name: string }[] = [];

        const client = anthropic();

        for (let turn = 0; turn < 10; turn++) {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: tools.map((t, i) =>
              i === tools.length - 1
                ? { ...t, cache_control: { type: "ephemeral" } }
                : t,
            ) as Anthropic.Tool[],
            messages: convo,
          });

          for (const block of response.content) {
            if (block.type === "text" && block.text) {
              send("text", { text: block.text });
              assistantText += block.text;
            } else if (block.type === "tool_use") {
              send("tool_use", { name: block.name, input: block.input });
              assistantTools.push({ name: block.name });
            }
          }

          if (response.stop_reason !== "tool_use") {
            convo.push({ role: "assistant", content: response.content });
            break;
          }

          convo.push({ role: "assistant", content: response.content });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            const result = await runTool(
              block.name,
              (block.input ?? {}) as Record<string, unknown>,
            );
            if (WRITE_TOOLS.has(block.name)) didMutate = true;
            const summary =
              result && typeof result === "object" && "summary" in result
                ? (result as { summary: unknown }).summary
                : null;
            send("tool_result", { name: block.name, result, summary });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
          convo.push({ role: "user", content: toolResults });
        }

        await db().insert(messagesTable).values({
          chatId,
          role: "assistant",
          content: assistantText,
          tools: assistantTools.length ? assistantTools : null,
        });
        await db()
          .update(chats)
          .set({ updatedAt: new Date() })
          .where(eq(chats.id, chatId));

        if (!chat.title && history.length === 0) {
          try {
            const titleResp = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 40,
              messages: [
                {
                  role: "user",
                  content: `Give a concise title (max 6 words, no quotes, no trailing punctuation) for this chat. Reply with only the title.\n\nUser: ${message}\n\nAssistant: ${assistantText.slice(0, 500)}`,
                },
              ],
            });
            const title = titleResp.content
              .filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("")
              .trim()
              .replace(/^["']|["']$/g, "")
              .slice(0, 80);
            if (title) {
              await db()
                .update(chats)
                .set({ title })
                .where(eq(chats.id, chatId));
              send("title", { title });
            }
          } catch {
            // title generation is best-effort
          }
        }

        send("done", { mutated: didMutate });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

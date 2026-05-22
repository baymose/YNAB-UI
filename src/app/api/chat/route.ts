import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL, SYSTEM_PROMPT } from "@/lib/anthropic";
import { runTool, tools, WRITE_TOOLS } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

type ClientMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ClientMessage[] };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const convo: Anthropic.MessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let didMutate = false;

      try {
        const client = anthropic();

        // Tool-use loop: at most N turns to keep things bounded.
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

          // Emit any text blocks immediately.
          for (const block of response.content) {
            if (block.type === "text" && block.text) {
              send("text", { text: block.text });
            } else if (block.type === "tool_use") {
              send("tool_use", { name: block.name, input: block.input });
            }
          }

          if (response.stop_reason !== "tool_use") {
            // Final assistant turn; append for completeness and exit.
            convo.push({ role: "assistant", content: response.content });
            break;
          }

          // Run each tool_use block, push tool_results, loop.
          convo.push({ role: "assistant", content: response.content });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            const result = await runTool(
              block.name,
              (block.input ?? {}) as Record<string, unknown>,
            );
            if (WRITE_TOOLS.has(block.name)) didMutate = true;
            send("tool_result", { name: block.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
          convo.push({ role: "user", content: toolResults });
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

import test from "node:test";
import assert from "node:assert/strict";
import { consumeChatStream } from "../chat-ui/chat-stream.mjs";

function streamFromByteChunks(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  return streamFromByteChunks(chunks.map((chunk) => encoder.encode(chunk)));
}

function frame(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

test("preserves events split across transport chunks and UTF-8 boundaries", async () => {
  const source = frame("first ") + frame("café 🌱") + "data: [DONE]\n\n";
  const bytes = new TextEncoder().encode(source);
  const beforeAccent = new TextEncoder().encode(source.slice(0, source.indexOf("é"))).length;
  const chunks = [
    bytes.slice(0, 13),
    bytes.slice(13, beforeAccent + 1),
    bytes.slice(beforeAccent + 1, -6),
    bytes.slice(-6),
  ];
  const deltas = [];

  const result = await consumeChatStream(streamFromByteChunks(chunks), (delta) => deltas.push(delta));

  assert.equal(result, "first café 🌱");
  assert.deepEqual(deltas, ["first ", "café 🌱"]);
});

test("supports CRLF event framing and multiple data lines", async () => {
  const event = JSON.stringify({ choices: [{ delta: { content: "hello" } }] });
  const split = Math.floor(event.length / 2);
  const source = `data: ${event.slice(0, split)}\r\ndata: ${event.slice(split)}\r\n\r\n`;

  assert.equal(await consumeChatStream(streamFromChunks([source]), () => {}), "hello");
});

test("flushes a final event without a trailing blank line", async () => {
  assert.equal(await consumeChatStream(streamFromChunks([frame("final").trimEnd()]), () => {}), "final");
});

test("reports malformed and error events instead of silently dropping them", async () => {
  const partialDeltas = [];
  await assert.rejects(
    consumeChatStream(
      streamFromChunks([frame("partial"), "data: {broken}\n\n"]),
      (delta) => partialDeltas.push(delta),
    ),
    /invalid response event from Ollama/,
  );
  assert.deepEqual(partialDeltas, ["partial"]);
  await assert.rejects(
    consumeChatStream(streamFromChunks(['data: {"error":{"message":"model stopped"}}\n\n']), () => {}),
    /model stopped/,
  );
});

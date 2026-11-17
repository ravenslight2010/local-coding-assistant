export async function consumeChatStream(body, onDelta) {
  if (!body) throw new Error("stream unavailable");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const dataLines = [];
  let buffer = "";
  let full = "";

  function dispatchEvent() {
    if (!dataLines.length) return;
    const data = dataLines.join("\n");
    dataLines.length = 0;
    if (data === "[DONE]") return;

    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("invalid response event from Ollama");
    }
    if (event.error) {
      const message = typeof event.error === "string" ? event.error : event.error.message;
      throw new Error(message || "Ollama stream failed");
    }

    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      full += delta;
      onDelta(delta);
    }
  }

  function processLine(line) {
    if (line === "") {
      dispatchEvent();
      return;
    }
    if (line.startsWith(":")) return;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    if (field !== "data") return;

    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    dataLines.push(value);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      processLine(line);
      newline = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    if (buffer.endsWith("\r")) buffer = buffer.slice(0, -1);
    processLine(buffer);
  }
  dispatchEvent();
  return full;
}

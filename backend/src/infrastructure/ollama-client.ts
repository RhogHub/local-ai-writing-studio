export type OllamaTokenHandler = (token: string) => void;

export class OllamaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly numCtx: number
  ) {}

  async listModels(): Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }> {
    const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Ollama tags endpoint returned ${response.status}`);
    return await response.json() as { models: Array<{ name: string; size: number; modified_at: string }> };
  }

  async streamChat(input: {
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    onToken: OllamaTokenHandler;
  }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: input.messages,
        stream: true,
        think: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "10m",
        options: {
          temperature: input.temperature,
          top_p: 0.9,
          num_ctx: this.numCtx
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama error ${response.status}: ${detail.slice(0, 1000)}`);
    }
    if (!response.body) throw new Error("Ollama returned an empty response stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean };
        if (chunk.error) throw new Error(chunk.error);
        const token = chunk.message?.content ?? "";
        if (token) {
          fullText += token;
          input.onToken(token);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const chunk = JSON.parse(buffer) as { message?: { content?: string }; error?: string };
      if (chunk.error) throw new Error(chunk.error);
      const token = chunk.message?.content ?? "";
      if (token) {
        fullText += token;
        input.onToken(token);
      }
    }
    return fullText.trim();
  }

  get modelName(): string { return this.model; }
}

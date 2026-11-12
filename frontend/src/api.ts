import type { ActionOption, Document, Project, Revision, WritingAction, Agent } from "./types";

const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function networkError(error: unknown): Error {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return new Error("Não foi possível conectar à API local. Verifique se os containers estão ativos com `docker compose ps`. Para investigar, execute `docker compose logs --tail=150 frontend api ollama`.");
  }
  return error instanceof Error ? error : new Error("Falha inesperada na comunicação com a API local.");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
    });
  } catch (error) {
    throw networkError(error);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown; message?: string };
    const message = typeof body.error === "string" ? body.error : body.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export const api = {
  health: () => request<{ ok: boolean; ollama: string; model: string; modelAvailable: boolean; installedModels: string[] }>("/api/health"),
  actions: async () => (await request<{ actions: ActionOption[] }>("/api/actions")).actions,
  projects: async () => (await request<{ projects: Project[] }>("/api/projects")).projects,
  createProject: async (name: string) => (await request<{ project: Omit<Project, "documents"> }>("/api/projects", { method: "POST", body: JSON.stringify({ name, language: "auto" }) })).project,
  updateProject: async (id: string, input: Partial<Pick<Project, "name" | "language" | "instructions">>) => (await request<{ project: Project }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) })).project,
  createDocument: async (projectId: string, title: string) => (await request<{ document: Document }>(`/api/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title, content: "" }) })).document,
  updateDocument: async (id: string, input: { title?: string; content?: string; action?: string }) => (await request<{ document: Document }>(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify(input) })).document,
  revisions: async (id: string) => (await request<{ revisions: Revision[] }>(`/api/documents/${id}/revisions`)).revisions,
  process: async (input: { agent: Agent; action: WritingAction; text: string; documentId: string; language: string; customInstructions: string; projectInstructions: string }, onToken: (token: string) => void) => {
    let response: Response;
    try {
      response = await fetch(`${API}/api/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
    } catch (error) {
      throw networkError(error);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      const message = body.error ?? body.message;
      if (message) throw new Error(message);
      if ([502, 503, 504].includes(response.status)) {
        throw new Error("O proxy local não conseguiu alcançar a API. Confira `docker compose ps` e `docker compose logs --tail=150 api frontend`.");
      }
      throw new Error(`Falha na API local (HTTP ${response.status}). Consulte ` + "`docker compose logs --tail=150 api`.");
    }
    if (!response.body) throw new Error("O navegador não recebeu o stream de resposta.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    type ProcessCompleted = { result: string; revisionId: string | null; model: string };
    let completed: ProcessCompleted | null = null;
    let streamError: string | null = null;

    const handleFrame = (frame: string) => {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) return;
      const payload = JSON.parse(data) as { token?: string; result?: string; revisionId?: string | null; model?: string; error?: string };
      if (event === "token" && payload.token) onToken(payload.token);
      if (event === "completed") completed = { result: payload.result ?? "", revisionId: payload.revisionId ?? null, model: payload.model ?? "" };
      if (event === "error") streamError = payload.error ?? "Falha durante a geração.";
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        frames.forEach(handleFrame);
      }
    } catch (error) {
      throw new Error("A conexão com a API local foi interrompida durante a geração. Consulte `docker compose logs --tail=150 api frontend ollama` e tente novamente.");
    }
    if (buffer.trim()) handleFrame(buffer);
    if (streamError) throw new Error(streamError);
    if (!completed) throw new Error("O modelo encerrou a conexão sem concluir a resposta.");
    return completed as ProcessCompleted;
  }
};

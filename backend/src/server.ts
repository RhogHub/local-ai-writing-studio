import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { repository } from "./infrastructure/database";
import { OllamaClient } from "./infrastructure/ollama-client";
import { ACTIONS, buildMessages } from "./application/prompts";
import type { WritingAction } from "./domain/types";

const port = Number(process.env.PORT ?? 3000);
const maxInputChars = Number(process.env.MAX_INPUT_CHARS ?? 30000);
const ollama = new OllamaClient(
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  process.env.OLLAMA_MODEL ?? "qwen3.5:9b",
  Number(process.env.OLLAMA_NUM_CTX ?? 32768)
);

const idParams = z.object({ id: z.string().uuid() });
const processSchema = z.object({
  agent: z.enum(["reviewer", "book-writer"]),
  action: z.string(),
  text: z.string().min(1),
  documentId: z.string().uuid().optional(),
  language: z.string().default("auto"),
  customInstructions: z.string().max(5000).optional(),
  projectInstructions: z.string().max(10000).optional()
});

function sse(raw: NodeJS.WritableStream, event: string, payload: unknown) {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
  await app.register(cors, { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" });

  app.get("/api/health", async () => {
    let ollamaStatus: "online" | "offline" = "offline";
    let modelAvailable = false;
    let models: string[] = [];
    try {
      const response = await ollama.listModels();
      ollamaStatus = "online";
      models = response.models.map((item) => item.name);
      modelAvailable = models.some((name) => name === ollama.modelName || name.startsWith(`${ollama.modelName}:`));
    } catch (error) {
      app.log.warn({ err: error }, "Ollama indisponível durante a verificação de saúde");
    }
    return {
      ok: true,
      service: "local-ai-writing-studio-api",
      ollama: ollamaStatus,
      model: ollama.modelName,
      modelAvailable,
      installedModels: models
    };
  });

  app.get("/api/models", async (_request, reply) => {
    try {
      const data = await ollama.listModels();
      return { configuredModel: ollama.modelName, models: data.models };
    } catch (error) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "Ollama unavailable" });
    }
  });

  app.get("/api/actions", async () => ({
    actions: Object.entries(ACTIONS).map(([id, value]) => ({ id, agent: value.agent, label: value.label }))
  }));

  app.get("/api/projects", async () => ({
    projects: repository.listProjects().map((project) => ({
      ...project,
      documents: repository.listDocuments(project.id)
    }))
  }));

  app.post("/api/projects", async (request, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(120), language: z.string().default("auto"), instructions: z.string().max(10000).default("") }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    return reply.code(201).send({ project: repository.createProject(body.data) });
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), language: z.string().optional(), instructions: z.string().max(10000).optional() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid project data" });
    const project = repository.updateProject(params.data.id, body.data);
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return { project };
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid project id" });
    const deleted = repository.deleteProject(params.data.id);
    if (!deleted) return reply.code(404).send({ error: "Project not found" });
    return reply.code(204).send();
  });

  app.post("/api/projects/:id/documents", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = z.object({ title: z.string().trim().min(1).max(200), content: z.string().default("") }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid document data" });
    if (!repository.getProject(params.data.id)) return reply.code(404).send({ error: "Project not found" });
    return reply.code(201).send({ document: repository.createDocument({ projectId: params.data.id, ...body.data }) });
  });

  app.get("/api/documents/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid document id" });
    const document = repository.getDocument(params.data.id);
    if (!document) return reply.code(404).send({ error: "Document not found" });
    return { document };
  });

  app.patch("/api/documents/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = z.object({ title: z.string().trim().min(1).max(200).optional(), content: z.string().optional(), action: z.string().default("manual_save") }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid document data" });
    const document = repository.updateDocument(params.data.id, { title: body.data.title, content: body.data.content }, body.data.action);
    if (!document) return reply.code(404).send({ error: "Document not found" });
    return { document };
  });

  app.delete("/api/documents/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid document id" });
    if (!repository.deleteDocument(params.data.id)) return reply.code(404).send({ error: "Document not found" });
    return reply.code(204).send();
  });

  app.get("/api/documents/:id/revisions", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid document id" });
    if (!repository.getDocument(params.data.id)) return reply.code(404).send({ error: "Document not found" });
    return { revisions: repository.listRevisions(params.data.id) };
  });

  app.post("/api/process", async (request, reply) => {
    const parsed = processSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const input = parsed.data;
    if (input.text.length > maxInputChars) {
      return reply.code(413).send({ error: `Texto acima do limite de ${maxInputChars.toLocaleString("pt-BR")} caracteres. Divida o conteúdo em capítulos menores.` });
    }
    const action = ACTIONS[input.action as WritingAction];
    if (!action || action.agent !== input.agent) return reply.code(400).send({ error: "Ação incompatível com o agente selecionado" });
    const document = input.documentId ? repository.getDocument(input.documentId) : undefined;
    if (input.documentId && !document) return reply.code(404).send({ error: "Document not found" });

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    reply.raw.flushHeaders?.();

    try {
      sse(reply.raw, "start", { model: ollama.modelName, action: input.action });
      const messages = buildMessages({
        action: input.action as WritingAction,
        text: input.text,
        language: input.language,
        customInstructions: input.customInstructions,
        projectInstructions: input.projectInstructions
      });
      const result = await ollama.streamChat({
        messages,
        temperature: action.temperature,
        onToken: (token) => sse(reply.raw, "token", { token })
      });
      if (!result.trim()) throw new Error("Ollama returned an empty result");
      let revisionId: string | null = null;
      if (document) {
        const revision = repository.createRevision({
          documentId: document.id,
          action: input.action,
          sourceText: input.text,
          resultText: result,
          model: ollama.modelName
        });
        revisionId = revision.id;
      }
      sse(reply.raw, "completed", { result, revisionId, model: ollama.modelName });
    } catch (error) {
      app.log.error({ err: error, requestId: request.id, agent: input.agent, action: input.action, model: ollama.modelName }, "Falha no processamento do agente");
      sse(reply.raw, "error", { error: error instanceof Error ? error.message : "Processing failed" });
    } finally {
      reply.raw.end();
    }
  });

  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ host: "0.0.0.0", port });
    app.log.info(`Writing Studio API listening on ${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (require.main === module) void start();

export { buildApp };

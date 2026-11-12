import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentId, WritingAction } from "../domain/types";

export type ActionDefinition = {
  agent: AgentId;
  label: string;
  temperature: number;
  promptFile: string;
};

export const ACTIONS: Record<WritingAction, ActionDefinition> = {
  spelling: { agent: "reviewer", label: "Revisar ortografia", temperature: 0.1, promptFile: "spelling.md" },
  grammar: { agent: "reviewer", label: "Melhorar gramática", temperature: 0.15, promptFile: "grammar.md" },
  clarity: { agent: "reviewer", label: "Melhorar clareza", temperature: 0.2, promptFile: "clarity.md" },
  professional: { agent: "reviewer", label: "Reescrever profissionalmente", temperature: 0.25, promptFile: "professional.md" },
  literary: { agent: "book-writer", label: "Transformar ideia em lição", temperature: 0.55, promptFile: "lesson.md" },
  develop: { agent: "book-writer", label: "Desenvolver conteúdo", temperature: 0.45, promptFile: "develop.md" },
  structure: { agent: "book-writer", label: "Estruturar capítulo", temperature: 0.3, promptFile: "structure.md" },
  dialogue: { agent: "book-writer", label: "Criar exemplos e exercícios", temperature: 0.4, promptFile: "examples-exercises.md" },
  "author-voice": { agent: "book-writer", label: "Preservar voz autoral", temperature: 0.3, promptFile: "author-voice.md" }
};

const promptsDirectory = process.env.PROMPTS_DIR ?? path.join(process.cwd(), "prompts");

function readPrompt(relativePath: string): string {
  const fullPath = path.join(promptsDirectory, relativePath);
  try {
    const prompt = readFileSync(fullPath, "utf8").trim();
    if (!prompt) throw new Error("arquivo vazio");
    return prompt;
  } catch (error) {
    throw new Error(`Não foi possível carregar o prompt \"${relativePath}\" em ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function buildMessages(input: {
  action: WritingAction;
  text: string;
  language: string;
  customInstructions?: string;
  projectInstructions?: string;
}) {
  const action = ACTIONS[input.action];
  const agentPrompt = readPrompt(path.join(action.agent, "agent.md"));
  const actionPrompt = readPrompt(path.join(action.agent, "actions", action.promptFile));
  const languageInstruction = input.language === "auto"
    ? "Detecte o idioma do texto de entrada e escreva o resultado no mesmo idioma, preservando variantes regionais (por exemplo, português brasileiro)."
    : `O idioma/variante editorial deste texto é ${input.language}. Revise e escreva nesse idioma, preservando o conteúdo e sem traduzir.`;

  const system = [
    agentPrompt,
    actionPrompt,
    languageInstruction,
    "REGRAS OBRIGATÓRIAS:",
    "1. Retorne somente o texto final editado. Não inclua introduções, comentários, justificativas, cercas Markdown ou análise do que fez.",
    "2. Preserve nomes próprios, números, datas, citações, fatos, relações causais e informações específicas.",
    "3. Não resuma nem omita trechos do texto de entrada, a menos que a operação peça explicitamente organização e a informação seja duplicada sem perda de sentido.",
    "4. Não altere a pessoa narrativa, o tempo verbal ou a intenção sem necessidade editorial.",
    "5. Se houver ambiguidade factual, não tente adivinhar: mantenha a formulação original tão fiel quanto possível.",
    input.projectInstructions?.trim() ? `DIRETRIZES DO PROJETO/AUTOR:\n${input.projectInstructions.trim()}` : "",
    input.customInstructions?.trim() ? `INSTRUÇÕES ADICIONAIS DESTA OPERAÇÃO:\n${input.customInstructions.trim()}` : ""
  ].filter(Boolean).join("\n\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `OPERAÇÃO: ${action.label}\n\nTEXTO ORIGINAL:\n<texto>\n${input.text}\n</texto>\n\nEdite o texto obedecendo às regras. Retorne o texto completo, sem omissões.` }
  ];
}

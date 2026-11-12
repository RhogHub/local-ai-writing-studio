import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, buildMessages } from "./prompts";

test("all declared actions map to an editable agent prompt and operation prompt", () => {
  for (const [key, value] of Object.entries(ACTIONS)) {
    assert.ok(key.length > 0);
    assert.ok(value.agent === "reviewer" || value.agent === "book-writer");
    assert.ok(value.promptFile.endsWith(".md"));
    const messages = buildMessages({ action: key as keyof typeof ACTIONS, text: "Texto de teste", language: "auto" });
    assert.ok(messages[0].content.length > 100);
  }
});

test("prompt preserves automatic input language and returns only the edited text", () => {
  const messages = buildMessages({ action: "clarity", text: "Texto de teste", language: "auto" });
  assert.match(messages[0].content, /mesmo idioma/);
  assert.match(messages[0].content, /somente o texto final editado/);
  assert.match(messages[1].content, /Texto de teste/);
});

test("book writer prompt includes project instructions and factual safeguards", () => {
  const messages = buildMessages({
    action: "literary",
    text: "Rascunho",
    language: "pt-BR",
    projectInstructions: "Primeira pessoa, tom autobiográfico"
  });
  assert.match(messages[0].content, /Primeira pessoa, tom autobiográfico/);
  assert.match(messages[0].content, /Não invente acontecimentos/);
});

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DocumentSummary, Project, Revision } from "../domain/types";

const databasePath = process.env.DATABASE_PATH ?? path.resolve("./data/writing-studio.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'auto',
    instructions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, sort_order);
  CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    source_text TEXT NOT NULL,
    result_text TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_revisions_document ON revisions(document_id, created_at DESC);
`);

const now = () => new Date().toISOString();
const toDocument = (row: any): DocumentSummary => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  content: row.content,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
const toProject = (row: any): Project => ({
  id: row.id,
  name: row.name,
  language: row.language,
  instructions: row.instructions,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
const toRevision = (row: any): Revision => ({
  id: row.id,
  documentId: row.document_id,
  action: row.action,
  sourceText: row.source_text,
  resultText: row.result_text,
  model: row.model,
  createdAt: row.created_at
});

export class WritingRepository {
  listProjects(): Project[] {
    return (db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as any[]).map(toProject);
  }

  getProject(id: string): Project | undefined {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
    return row ? toProject(row) : undefined;
  }

  createProject(input: { name: string; language?: string; instructions?: string }): Project {
    const timestamp = now();
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name,
      language: input.language ?? "auto",
      instructions: input.instructions ?? "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.prepare(`INSERT INTO projects (id, name, language, instructions, created_at, updated_at)
      VALUES (@id, @name, @language, @instructions, @createdAt, @updatedAt)`).run(project);
    return project;
  }

  updateProject(id: string, input: Partial<Pick<Project, "name" | "language" | "instructions">>): Project | undefined {
    const current = this.getProject(id);
    if (!current) return undefined;
    const updated = { ...current, ...input, updatedAt: now() };
    db.prepare(`UPDATE projects SET name=@name, language=@language, instructions=@instructions, updated_at=@updatedAt WHERE id=@id`).run({ id: updated.id, name: updated.name, language: updated.language, instructions: updated.instructions, updatedAt: updated.updatedAt });
    return updated;
  }

  deleteProject(id: string): boolean {
    return db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
  }

  listDocuments(projectId: string): DocumentSummary[] {
    return (db.prepare("SELECT * FROM documents WHERE project_id = ? ORDER BY sort_order, created_at").all(projectId) as any[]).map(toDocument);
  }

  getDocument(id: string): DocumentSummary | undefined {
    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as any;
    return row ? toDocument(row) : undefined;
  }

  createDocument(input: { projectId: string; title: string; content?: string }): DocumentSummary {
    const project = this.getProject(input.projectId);
    if (!project) throw new Error("Project not found");
    const timestamp = now();
    const count = (db.prepare("SELECT COUNT(*) AS count FROM documents WHERE project_id = ?").get(input.projectId) as any).count as number;
    const doc: DocumentSummary = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      title: input.title,
      content: input.content ?? "",
      sortOrder: count,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.prepare(`INSERT INTO documents (id, project_id, title, content, sort_order, created_at, updated_at)
      VALUES (@id, @projectId, @title, @content, @sortOrder, @createdAt, @updatedAt)`).run(doc);
    return doc;
  }

  updateDocument(id: string, input: { title?: string; content?: string }, action = "manual_save"): DocumentSummary | undefined {
    const current = this.getDocument(id);
    if (!current) return undefined;
    const next = { ...current, ...input, updatedAt: now() };
    const update = db.transaction(() => {
      if (input.content !== undefined && input.content !== current.content && action !== "autosave") {
        this.createRevision({
          documentId: id,
          action,
          sourceText: current.content,
          resultText: input.content,
          model: "manual"
        });
      }
      db.prepare("UPDATE documents SET title=?, content=?, updated_at=? WHERE id=?")
        .run(next.title, next.content, next.updatedAt, id);
    });
    update();
    return next;
  }

  deleteDocument(id: string): boolean {
    return db.prepare("DELETE FROM documents WHERE id = ?").run(id).changes > 0;
  }

  createRevision(input: { documentId: string; action: string; sourceText: string; resultText: string; model: string }): Revision {
    const revision: Revision = {
      id: crypto.randomUUID(),
      documentId: input.documentId,
      action: input.action,
      sourceText: input.sourceText,
      resultText: input.resultText,
      model: input.model,
      createdAt: now()
    };
    db.prepare(`INSERT INTO revisions (id, document_id, action, source_text, result_text, model, created_at)
      VALUES (@id, @documentId, @action, @sourceText, @resultText, @model, @createdAt)`).run(revision);
    return revision;
  }

  listRevisions(documentId: string): Revision[] {
    return (db.prepare("SELECT * FROM revisions WHERE document_id = ? ORDER BY created_at DESC LIMIT 50").all(documentId) as any[]).map(toRevision);
  }
}

export const repository = new WritingRepository();

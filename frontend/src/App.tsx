import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diffWordsWithSpace } from "diff";
import {
  BookOpen, Check, ChevronDown, Copy, Download, Feather,
  FileText, FolderPlus, History, LoaderCircle, Menu, MessageSquareText, PenLine,
  Plus, RefreshCw, Save, Settings2, SpellCheck, Trash2, WandSparkles, X
} from "lucide-react";
import { api } from "./api";
import type { ActionOption, Agent, Document, Project, Revision, WritingAction } from "./types";

type Health = { ollama: string; model: string; modelAvailable: boolean; installedModels: string[] };
type ViewMode = "result" | "diff";

const ACTION_HELP: Record<WritingAction, string> = {
  spelling: "Correções mínimas de ortografia, acentuação e pontuação.",
  grammar: "Concordância, regência, sintaxe e construção das frases.",
  clarity: "Mais clareza, coesão, fluidez e compreensão.",
  professional: "Tom profissional, precisão e linguagem natural.",
  literary: "Transforma ideias, anotações e rascunhos em uma lição clara e didática para um livro de não ficção.",
  develop: "Aprofunda conceitos e explicações, mantendo a distinção entre fatos, opiniões e experiências.",
  structure: "Organiza o conteúdo em uma sequência didática, com título e seções quando úteis.",
  dialogue: "Cria exemplos práticos, perguntas de reflexão e exercícios baseados nas ideias do autor.",
  "author-voice": "Refina o texto sem apagar seu estilo pessoal."
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function deleteApiResource(path: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, { method: "DELETE" });
  } catch (error: unknown) {
    console.error("[Writing Studio] Falha na chamada DELETE:", error);
    throw new Error("Não foi possível conectar à API local. Verifique os containers com `docker compose ps`.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.error ?? body.message ?? `Falha ao excluir (HTTP ${response.status}).`);
  }
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Novo capítulo");
  const [savedContent, setSavedContent] = useState("");
  const [savedTitle, setSavedTitle] = useState("Novo capítulo");
  const [agent, setAgent] = useState<Agent>("reviewer");
  const [action, setAction] = useState<WritingAction>("grammar");
  const [language, setLanguage] = useState("auto");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [result, setResult] = useState("");
  const [originalForResult, setOriginalForResult] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("result");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResultComplete, setIsResultComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [actions, setActions] = useState<ActionOption[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectInstructions, setProjectInstructions] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [booting, setBooting] = useState(true);
  const [tokenCount, setTokenCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const activeProject = projects.find((item) => item.id === projectId) ?? null;
  const currentActions = useMemo(() => actions.filter((item) => item.agent === agent), [actions, agent]);
  const dirty = draft !== savedContent || title !== savedTitle;
  const words = useMemo(() => draft.trim() ? draft.trim().split(/\s+/).length : 0, [draft]);

  const refreshHealth = useCallback(async () => {
    try {
      const currentHealth = await api.health();
      setHealth(currentHealth);
    } catch (error: unknown) {
      console.error("[Writing Studio] Não foi possível consultar a saúde dos serviços:", error);
      setHealth({
        ollama: "offline",
        model: "unknown",
        modelAvailable: false,
        installedModels: []
      });
    }
  }, []);

  const refreshProjects = useCallback(async (selectProject?: string, selectDocument?: string) => {
    const nextProjects = await api.projects();
    setProjects(nextProjects);
    const wantedProject = selectProject ?? projectId ?? nextProjects[0]?.id ?? null;
    setProjectId(wantedProject);
    const selected = nextProjects.find((item) => item.id === wantedProject);
    const wantedDocument = selectDocument ?? documentId ?? selected?.documents[0]?.id ?? null;
    setDocumentId(wantedDocument);
    const doc = selected && wantedDocument ? selected.documents.find((item) => item.id === wantedDocument) : undefined;
    if (selected && doc) {
      setDraft(doc.content);
      setSavedContent(doc.content);
      setTitle(doc.title);
      setSavedTitle(doc.title);
      setLanguage(selected.language || "auto");
      setProjectInstructions(selected.instructions || "");
      setResult("");
      setIsResultComplete(false);
      setOriginalForResult("");
    }
  }, [projectId, documentId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [loadedActions] = await Promise.all([api.actions(), refreshHealth()]);
        if (!mounted) return;
        setActions(loadedActions);
        let loadedProjects = await api.projects();
        if (!loadedProjects.length) {
          await api.createProject("Meu primeiro livro");
          loadedProjects = await api.projects();
        }
        let chosenProject = loadedProjects[0];
        if (!chosenProject.documents.length) {
          await api.createDocument(chosenProject.id, "Introdução");
          loadedProjects = await api.projects();
          chosenProject = loadedProjects[0];
        }
        if (!mounted) return;
        setProjects(loadedProjects);
        setProjectId(chosenProject.id);
        const doc = chosenProject.documents[0];
        setDocumentId(doc.id);
        setDraft(doc.content);
        setSavedContent(doc.content);
        setTitle(doc.title);
        setSavedTitle(doc.title);
        setLanguage(chosenProject.language || "auto");
        setProjectInstructions(chosenProject.instructions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível iniciar a aplicação.");
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, [refreshHealth]);

  useEffect(() => {
    if (!documentId) return;
    void api.revisions(documentId).then(setRevisions).catch(() => setRevisions([]));
  }, [documentId]);

  useEffect(() => {
    if (!documentId || !dirty || booting) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void saveDocument(true); }, 900);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // saveDocument reads current state when called; debounce tracks the edited fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, title, documentId, booting]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  async function saveDocument(silent = false) {
    if (!documentId) return;
    setIsSaving(true);
    try {
      const updated = await api.updateDocument(documentId, { title: title.trim() || "Sem título", content: draftRef.current, action: silent ? "autosave" : "manual_save" });
      setSavedContent(updated.content);
      setSavedTitle(updated.title);
      setProjects((current) => current.map((project) => ({
        ...project,
        documents: project.documents.map((doc) => doc.id === updated.id ? updated : doc)
      })));
      if (!silent) setNotice("Documento salvo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar documento.");
    } finally {
      setIsSaving(false);
    }
  }

  async function selectDocument(doc: Document) {
    if (dirty) await saveDocument(true);
    setDocumentId(doc.id);
    setDraft(doc.content);
    setSavedContent(doc.content);
    setTitle(doc.title);
    setSavedTitle(doc.title);
    setResult("");
    setIsResultComplete(false);
    setOriginalForResult("");
    setShowHistory(false);
    setError("");
  }

  async function createProject() {
    if (dirty) await saveDocument(true);
    const name = window.prompt("Nome do projeto:", "Novo livro");
    if (!name?.trim()) return;
    try {
      const project = await api.createProject(name.trim());
      const doc = await api.createDocument(project.id, "Introdução");
      await refreshProjects(project.id, doc.id);
      setProjectInstructions("");
      setNotice("Projeto criado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao criar projeto."); }
  }

  async function createChapter() {
    if (!projectId) return;
    if (dirty) await saveDocument(true);
    const chapterName = window.prompt("Nome do capítulo:", `Capítulo ${(activeProject?.documents.length ?? 0) + 1}`);
    if (!chapterName?.trim()) return;
    try {
      const doc = await api.createDocument(projectId, chapterName.trim());
      await refreshProjects(projectId, doc.id);
      setNotice("Capítulo criado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao criar capítulo."); }
  }

  async function deleteChapter(doc: Document) {
    if (!projectId || !activeProject) return;
    if (isProcessing || isSaving || deletingId) {
      setNotice("Aguarde a operação atual terminar antes de excluir.");
      return;
    }
    if (activeProject.documents.length <= 1) {
      setNotice("O projeto precisa manter pelo menos um capítulo. Crie outro antes de excluir este.");
      return;
    }

    const isCurrentDocument = doc.id === documentId;
    const unsavedWarning = isCurrentDocument && dirty
      ? "\n\nAs alterações ainda não salvas deste capítulo também serão descartadas."
      : "";
    const confirmed = window.confirm(
      `Excluir o capítulo "${doc.title}"?\n\nO texto e todo o histórico de versões serão excluídos permanentemente.${unsavedWarning}`
    );
    if (!confirmed) return;

    if (isCurrentDocument && autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }

    setDeletingId(doc.id);
    setError("");
    try {
      await deleteApiResource(`/api/documents/${encodeURIComponent(doc.id)}`);
      const remainingDocuments = activeProject.documents.filter((item) => item.id !== doc.id);
      setProjects((current) => current.map((project) => project.id === activeProject.id
        ? { ...project, documents: project.documents.filter((item) => item.id !== doc.id) }
        : project));

      if (isCurrentDocument) {
        const nextDocument = remainingDocuments[0];
        setDocumentId(nextDocument.id);
        setDraft(nextDocument.content);
        setSavedContent(nextDocument.content);
        setTitle(nextDocument.title);
        setSavedTitle(nextDocument.title);
        setResult("");
        setOriginalForResult("");
        setIsResultComplete(false);
        setRevisions([]);
        setShowHistory(false);
      }
      setNotice(`Capítulo "${doc.title}" excluído.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir o capítulo.");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteProject(project: Project) {
    if (isProcessing || isSaving || deletingId) {
      setNotice("Aguarde a operação atual terminar antes de excluir.");
      return;
    }

    const isCurrentProject = project.id === projectId;
    const unsavedWarning = isCurrentProject && dirty
      ? "\n\nAs alterações ainda não salvas do capítulo atual também serão descartadas."
      : "";
    const confirmed = window.confirm(
      `Excluir o projeto "${project.name}" e seus ${project.documents.length} capítulo(s)?\n\nTodos os textos e históricos de versões deste projeto serão excluídos permanentemente.${unsavedWarning}`
    );
    if (!confirmed) return;

    if (isCurrentProject && autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }

    setDeletingId(project.id);
    setError("");
    try {
      await deleteApiResource(`/api/projects/${encodeURIComponent(project.id)}`);

      if (!isCurrentProject) {
        setProjects(await api.projects());
        setNotice(`Projeto "${project.name}" excluído.`);
        return;
      }

      let remainingProjects = await api.projects();
      if (!remainingProjects.length) {
        const replacement = await api.createProject("Meu primeiro livro");
        await api.createDocument(replacement.id, "Introdução");
        remainingProjects = await api.projects();
        setNotice(`Projeto excluído. Um novo projeto vazio foi criado.`);
      } else {
        setNotice(`Projeto "${project.name}" excluído.`);
      }

      let nextProject = remainingProjects[0];
      if (!nextProject.documents.length) {
        await api.createDocument(nextProject.id, "Introdução");
        remainingProjects = await api.projects();
        nextProject = remainingProjects.find((item) => item.id === nextProject.id) ?? remainingProjects[0];
      }

      await refreshProjects(nextProject.id, nextProject.documents[0].id);
      setRevisions([]);
      setShowHistory(false);
      setShowProjectSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir o projeto.");
    } finally {
      setDeletingId(null);
    }
  }

  async function switchProject(nextId: string) {
    if (dirty) await saveDocument(true);
    let next = projects.find((item) => item.id === nextId);
    if (!next) return;
    if (!next.documents.length) {
      await api.createDocument(next.id, "Introdução");
      const loaded = await api.projects();
      setProjects(loaded);
      next = loaded.find((item) => item.id === nextId);
    }
    if (!next) return;
    setProjectId(next.id);
    const doc = next.documents[0];
    setDocumentId(doc.id);
    setDraft(doc.content);
    setSavedContent(doc.content);
    setTitle(doc.title);
    setSavedTitle(doc.title);
    setProjectInstructions(next.instructions);
    setLanguage(next.language || "auto");
    setResult("");
    setIsResultComplete(false);
    setOriginalForResult("");
  }

  function selectAgent(nextAgent: Agent) {
    setAgent(nextAgent);
    setAction(nextAgent === "reviewer" ? "grammar" : "literary");
    setResult("");
    setIsResultComplete(false);
    setOriginalForResult("");
  }

  async function runAction() {
    if (!documentId || !draft.trim() || isProcessing) return;
    setError("");
    setResult("");
    setIsResultComplete(false);
    setOriginalForResult(draft);
    setViewMode("result");
    setIsProcessing(true);
    setTokenCount(0);
    try {
      const completed = await api.process({
        agent,
        action,
        text: draft,
        documentId,
        language,
        customInstructions,
        projectInstructions
      }, (token) => {
        setResult((current) => current + token);
        setTokenCount((current) => current + 1);
      });
      setResult(completed.result);
      setIsResultComplete(true);
      const updatedRevisions = await api.revisions(documentId);
      setRevisions(updatedRevisions);
      setNotice(`Resultado gerado com ${completed.model}.`);
    } catch (e) {
      setResult("");
      setIsResultComplete(false);
      setError(e instanceof Error ? e.message : "Falha ao processar texto.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function applyResult() {
    if (!documentId || !result.trim() || !isResultComplete || isProcessing) return;
    setDraft(result);
    setSavedContent(result);
    setResult("");
    setIsResultComplete(false);
    setOriginalForResult("");
    try {
      const updated = await api.updateDocument(documentId, { title, content: result, action: "apply_agent_result" });
      setSavedContent(updated.content);
      setProjects((current) => current.map((project) => ({ ...project, documents: project.documents.map((doc) => doc.id === updated.id ? updated : doc) })));
      setNotice("Resultado aplicado e versão anterior preservada no histórico.");
      setRevisions(await api.revisions(documentId));
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao aplicar resultado."); }
  }

  function restoreRevision(revision: Revision) {
    setOriginalForResult(revision.sourceText);
    setResult(revision.resultText);
    setIsResultComplete(true);
    setViewMode("diff");
    setShowHistory(false);
  }

  function exportChapter() {
    downloadText(`${safeFilename(title)}.md`, `# ${title}\n\n${draft}`);
  }

  function exportProject() {
    if (!activeProject) return;
    const markdown = activeProject.documents.map((doc, index) => {
      const currentTitle = doc.id === documentId ? title : doc.title;
      const currentContent = doc.id === documentId ? draft : doc.content;
      return `${index ? "\n\n---\n\n" : ""}# ${currentTitle}\n\n${currentContent}`;
    }).join("");
    downloadText(`${safeFilename(activeProject.name)}.md`, `# ${activeProject.name}\n\n${markdown}`);
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setNotice("Resultado copiado.");
  }

  async function saveProjectSettings() {
    if (!projectId) return;
    try {
      await api.updateProject(projectId, { instructions: projectInstructions, language });
      setProjects((current) => current.map((project) => project.id === projectId ? { ...project, instructions: projectInstructions, language } : project));
      setShowProjectSettings(false);
      setNotice("Instruções do projeto salvas.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar instruções."); }
  }

  function renderDiff() {
    const parts = diffWordsWithSpace(originalForResult, result);
    return <div className="diff-content">{parts.map((part, index) => <span key={index} className={part.added ? "diff-added" : part.removed ? "diff-removed" : ""}>{part.value}</span>)}</div>;
  }

  const modelReady = health?.ollama === "online" && health.modelAvailable;

  if (booting) return <div className="boot-screen"><LoaderCircle className="spin" size={28}/><span>Preparando seu espaço de escrita...</span></div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="brand">
          <div className="brand-icon"><Feather size={20}/></div>
          <div><strong>Writing Studio</strong><small>IA local para escrita</small></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={17}/></button>
        </div>

        <button className="new-project-button" onClick={() => void createProject()}><FolderPlus size={16}/> Novo projeto</button>
        <div className="sidebar-label">SEUS PROJETOS</div>
        <div className="project-list">
          {projects.map((project) => (
            <div key={project.id} className={`project-group ${project.id === projectId ? "selected" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button className="project-row" style={{ flex: 1, minWidth: 0, width: "auto" }} onClick={() => void switchProject(project.id)}>
                  <BookOpen size={16}/><span>{project.name}</span><ChevronDown size={14}/>
                </button>
                <button
                  className="icon-button"
                  style={{ padding: 6, color: "#c98787", flex: "0 0 auto" }}
                  onClick={() => void deleteProject(project)}
                  disabled={deletingId === project.id || isProcessing || isSaving}
                  title={`Excluir projeto ${project.name}`}
                  aria-label={`Excluir projeto ${project.name}`}
                >
                  {deletingId === project.id ? <LoaderCircle size={13} className="spin"/> : <Trash2 size={13}/>}
                </button>
              </div>
              {project.id === projectId && <div className="chapter-list">
                {project.documents.map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
                    <button className={`chapter-row ${doc.id === documentId ? "active" : ""}`} style={{ flex: 1, minWidth: 0, width: "auto" }} onClick={() => void selectDocument(doc)}>
                      <FileText size={14}/><span>{doc.title}</span>
                    </button>
                    <button
                      className="icon-button"
                      style={{ padding: 5, color: "#bd8585", flex: "0 0 auto" }}
                      onClick={() => void deleteChapter(doc)}
                      disabled={project.documents.length <= 1 || deletingId === doc.id || isProcessing || isSaving}
                      title={project.documents.length <= 1 ? "Crie outro capítulo antes de excluir este" : `Excluir capítulo ${doc.title}`}
                      aria-label={`Excluir capítulo ${doc.title}`}
                    >
                      {deletingId === doc.id ? <LoaderCircle size={12} className="spin"/> : <Trash2 size={12}/>}
                    </button>
                  </div>
                ))}
                <button className="add-chapter" onClick={() => void createChapter()}><Plus size={13}/> Adicionar capítulo</button>
              </div>}
            </div>
          ))}
          {!projects.length && <div className="sidebar-empty">Nenhum projeto ainda.</div>}
        </div>

        <div className="sidebar-bottom">
          <button className="side-action" onClick={() => setShowProjectSettings(true)}><Settings2 size={16}/> Diretrizes do projeto</button>
          <div className={`connection ${health?.ollama === "online" ? "online" : "offline"}`}>
            <span className="connection-dot"/><span>{health?.ollama === "online" ? "Ollama conectado" : "Ollama desconectado"}</span>
            <button className="icon-button tiny" onClick={() => void refreshHealth()} title="Verificar conexão"><RefreshCw size={13}/></button>
          </div>
          <small className="model-name">Modelo: {health?.model ?? "verificando..."}</small>
        </div>
      </aside>

      {!sidebarOpen && <button className="floating-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={19}/></button>}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title"><span className="eyebrow">ESPAÇO DE TRABALHO</span><strong>{activeProject?.name ?? "Local AI Writing Studio"}</strong></div>
          <div className="topbar-actions">
            <div className={`model-pill ${modelReady ? "ready" : "warning"}`}><span className="connection-dot"/>{modelReady ? "Modelo pronto" : health?.ollama === "online" ? "Baixe o modelo" : "Ollama offline"}</div>
            <button className="secondary-button" onClick={exportProject} disabled={!activeProject}><Download size={15}/> Exportar projeto</button>
          </div>
        </header>

        {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}
        {notice && <div className="toast"><Check size={15}/>{notice}</div>}

        {!modelReady && health?.ollama === "online" && <div className="model-warning"><strong>Modelo ainda não instalado.</strong> Execute <code>docker compose exec ollama ollama pull {health.model}</code> no terminal. <button onClick={() => void refreshHealth()}>Verificar novamente</button></div>}
        {health?.ollama === "offline" && <div className="model-warning"><strong>Ollama não respondeu.</strong> Verifique se os containers estão ativos com <code>docker compose ps</code>. <button onClick={() => void refreshHealth()}>Tentar novamente</button></div>}

        <section className="document-heading">
          <div className="document-title-wrap">
            <input className="document-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Título do documento" />
            <div className="document-meta"><span>{words.toLocaleString("pt-BR")} palavras</span><span>·</span><span>{draft.length.toLocaleString("pt-BR")} caracteres</span><span>·</span><span>{dirty ? "Alterações não salvas" : "Salvo"}</span></div>
          </div>
          <div className="document-actions">
            <button className="icon-text-button" onClick={() => void saveDocument()} disabled={!dirty || isSaving}><Save size={15}/>{isSaving ? "Salvando" : "Salvar"}</button>
            <button className="icon-text-button" onClick={exportChapter}><Download size={15}/> Exportar .md</button>
            <button className="icon-text-button" onClick={() => { if (documentId) void api.revisions(documentId).then(setRevisions); setShowHistory((value) => !value); }}><History size={15}/> Histórico</button>
          </div>
        </section>

        <section className="agent-switcher">
          <button className={`agent-tab ${agent === "reviewer" ? "active" : ""}`} onClick={() => selectAgent("reviewer")}><SpellCheck size={17}/><span><strong>Revisor de textos</strong><small>Ortografia, gramática e clareza</small></span></button>
          <button className={`agent-tab ${agent === "book-writer" ? "active" : ""}`} onClick={() => selectAgent("book-writer")}><WandSparkles size={17}/><span><strong>Escritor de livros</strong><small>Narrativa, estilo e capítulos</small></span></button>
        </section>

        <section className="workspace">
          <div className="editor-column panel">
            <div className="panel-heading"><div><PenLine size={16}/><strong>Texto original</strong></div><span>EDITÁVEL</span></div>
            <textarea className="editor" value={draft} onChange={(event) => { setDraft(event.target.value); if (result) { setResult(""); setIsResultComplete(false); setOriginalForResult(""); } }} readOnly={isProcessing} placeholder="Escreva livremente ou cole seu texto bruto aqui. Depois escolha uma operação para o agente trabalhar sobre o conteúdo..." spellCheck lang={language === "auto" ? undefined : language}/>
            <div className="editor-footer"><span>Seu original nunca é substituído automaticamente.</span><button onClick={() => setDraft("")} disabled={!draft}>Limpar texto</button></div>
          </div>

          <div className="agent-column">
            <div className="agent-panel panel">
              <div className="panel-heading"><div><WandSparkles size={16}/><strong>{agent === "reviewer" ? "Operações de revisão" : "Operações de escrita"}</strong></div><span>{agent === "reviewer" ? "REVISOR" : "ESCRITOR"}</span></div>
              <div className="action-grid">
                {currentActions.map((option) => (
                  <button key={option.id} className={`action-card ${action === option.id ? "selected" : ""}`} onClick={() => { setAction(option.id); setResult(""); setIsResultComplete(false); setOriginalForResult(""); }}>
                    <span className="action-check">{action === option.id ? <Check size={13}/> : null}</span>
                    <strong>{option.label}</strong>
                    <small>{ACTION_HELP[option.id]}</small>
                  </button>
                ))}
              </div>
              <div className="operation-options">
                <label className="field-label" htmlFor="language">Idioma do texto</label>
                <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="auto">Automático (detectar pelo original)</option>
                  <option value="Português brasileiro">Português brasileiro</option>
                  <option value="English">English</option>
                  <option value="Español">Español</option>
                  <option value="Français">Français</option>
                  <option value="Deutsch">Deutsch</option>
                  <option value="Italiano">Italiano</option>
                  <option value="日本語">日本語</option>
                  <option value="中文">中文</option>
                  <option value="العربية">العربية</option>
                </select>
                <button className="instructions-toggle" onClick={() => setShowInstructions((value) => !value)}><Settings2 size={14}/>{showInstructions ? "Ocultar instruções" : "Instruções adicionais"}<ChevronDown size={13}/></button>
                {showInstructions && <textarea className="instructions-input" value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} placeholder="Ex.: mantenha um tom intimista, evite adjetivos excessivos, preserve termos regionais..." rows={3}/>}
              </div>
              <button className="run-button" onClick={() => void runAction()} disabled={!draft.trim() || isProcessing || !modelReady}>
                {isProcessing ? <><LoaderCircle size={17} className="spin"/> Processando...</> : <><WandSparkles size={17}/> {currentActions.find((item) => item.id === action)?.label ?? "Executar agente"}</>}
              </button>
              <div className="action-hint">{ACTION_HELP[action]}</div>
            </div>

            <div className="result-panel panel">
              <div className="result-heading">
                <div className="panel-heading"><div><MessageSquareText size={16}/><strong>Resultado da IA</strong></div>{isProcessing && <span className="generating"><i/> GERANDO</span>}</div>
                <div className="result-toolbar">
                  <button className={viewMode === "result" ? "active" : ""} onClick={() => setViewMode("result")}>Resultado</button>
                  <button className={viewMode === "diff" ? "active" : ""} onClick={() => setViewMode("diff")} disabled={!result || !originalForResult}>Comparar</button>
                </div>
              </div>
              <div className="result-content">
                {!result && !isProcessing && <div className="result-placeholder"><div className="placeholder-icon"><WandSparkles size={21}/></div><strong>Seu texto aprimorado aparecerá aqui</strong><p>Escolha uma operação e clique em executar. O resultado será exibido sem alterar o original.</p></div>}
                {result && viewMode === "result" && <div className="result-text">{result}</div>}
                {result && viewMode === "diff" && renderDiff()}
                {isProcessing && !result && <div className="result-placeholder"><LoaderCircle size={22} className="spin"/><strong>O modelo está trabalhando...</strong><p>Os primeiros tokens aparecerão assim que forem gerados.</p></div>}
                {isProcessing && result && <div className="stream-cursor"/>}
              </div>
              {result && isResultComplete && <div className="result-footer"><span>{tokenCount} blocos recebidos · resultado ainda não aplicado</span><div><button className="icon-text-button" onClick={() => void copyResult()}><Copy size={14}/> Copiar</button><button className="apply-button" onClick={() => void applyResult()}><Check size={15}/> Aplicar ao documento</button></div></div>}
            </div>
          </div>
        </section>
      </main>

      {showHistory && <div className="drawer-backdrop" onClick={() => setShowHistory(false)}><aside className="history-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-title"><div><History size={18}/><strong>Histórico de versões</strong></div><button className="icon-button" onClick={() => setShowHistory(false)}><X size={18}/></button></div>{revisions.length ? revisions.map((revision) => <button className="revision-item" key={revision.id} onClick={() => restoreRevision(revision)}><strong>{actionLabel(revision.action)}</strong><span>{formatDate(revision.createdAt)} · {revision.model}</span><small>{revision.resultText.slice(0, 120)}{revision.resultText.length > 120 ? "…" : ""}</small></button>) : <div className="empty-drawer">Ainda não há versões salvas para este capítulo.</div>}</aside></div>}

      {showProjectSettings && <div className="modal-backdrop" onClick={() => setShowProjectSettings(false)}><div className="settings-modal" onClick={(event) => event.stopPropagation()}><div className="drawer-title"><div><Settings2 size={18}/><strong>Diretrizes do projeto</strong></div><button className="icon-button" onClick={() => setShowProjectSettings(false)}><X size={18}/></button></div><p>Essas orientações serão consideradas pelo agente de escrita e pelo revisor em todos os capítulos deste projeto.</p><label className="field-label" htmlFor="project-language">Idioma padrão do projeto</label><select id="project-language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="auto">Automático (detectar pelo original)</option><option value="Português brasileiro">Português brasileiro</option><option value="English">English</option><option value="Español">Español</option><option value="Français">Français</option><option value="Deutsch">Deutsch</option><option value="Italiano">Italiano</option><option value="日本語">日本語</option><option value="中文">中文</option><option value="العربية">العربية</option></select><label className="field-label" htmlFor="project-instructions">Estilo, contexto e regras editoriais</label><textarea id="project-instructions" rows={7} value={projectInstructions} onChange={(event) => setProjectInstructions(event.target.value)} placeholder="Ex.: livro de desenvolvimento pessoal; linguagem acessível e reflexiva; explicar conceitos com exemplos práticos; evitar clichês e promessas exageradas; preservar minha experiência e voz autoral..."/><div className="modal-actions"><button className="secondary-button" onClick={() => setShowProjectSettings(false)}>Cancelar</button><button className="apply-button" onClick={() => void saveProjectSettings()}><Save size={15}/> Salvar diretrizes</button></div></div></div>}
    </div>
  );
}

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "documento";
}

function actionLabel(value: string) {
  const labels: Record<string, string> = {
    spelling: "Revisão ortográfica", grammar: "Melhoria gramatical", clarity: "Melhoria de clareza",
    professional: "Reescrita profissional", literary: "Transformar ideia em lição", develop: "Desenvolver conteúdo",
    structure: "Estruturar capítulo", dialogue: "Criar exemplos e exercícios", "author-voice": "Preservar voz autoral",
    manual_save: "Salvamento manual", apply_agent_result: "Resultado aplicado"
  };
  return labels[value] ?? value;
}

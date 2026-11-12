export type Document = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  language: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
  documents: Document[];
};

export type Revision = {
  id: string;
  documentId: string;
  action: string;
  sourceText: string;
  resultText: string;
  model: string;
  createdAt: string;
};

export type Agent = "reviewer" | "book-writer";
export type ReviewAction = "spelling" | "grammar" | "clarity" | "professional";
export type BookAction = "literary" | "develop" | "structure" | "dialogue" | "author-voice";
export type WritingAction = ReviewAction | BookAction;

export type ActionOption = {
  id: WritingAction;
  agent: Agent;
  label: string;
};

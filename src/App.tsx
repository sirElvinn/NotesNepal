import React, { useEffect, useState } from "react";

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "ts-notes-app-notes";

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Note[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  useEffect(() => {
    if (!selectedId) {
      setTitle("");
      setContent("");
      return;
    }
    const note = notes.find((n) => n.id === selectedId);
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
  }, [selectedId, notes]);

  const handleCreate = () => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled note",
      content,
      createdAt: now,
      updatedAt: now
    };
    setNotes((prev) => [newNote, ...prev]);
    setSelectedId(newNote.id);
  };

  const handleUpdate = () => {
    if (!selectedId) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedId
          ? {
              ...note,
              title: title.trim() || "Untitled note",
              content,
              updatedAt: now
            }
          : note
      )
    );
  };

  const handleDelete = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>TypeScript Notes</h1>
        <p className="app-subtitle">Lightweight notetaking in your browser</p>
      </header>
      <main className="app-main">
        <aside className="sidebar">
          <button className="primary-btn" onClick={handleCreate}>
            + New note
          </button>
          <ul className="note-list">
            {notes.map((note) => (
              <li
                key={note.id}
                className={
                  "note-list-item" +
                  (note.id === selectedId ? " note-list-item--active" : "")
                }
                onClick={() => handleSelect(note.id)}
              >
                <div className="note-list-title">
                  {note.title || "Untitled note"}
                </div>
                <div className="note-list-meta">
                  {new Date(note.updatedAt).toLocaleString()}
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(note.id);
                  }}
                  aria-label="Delete note"
                >
                  ×
                </button>
              </li>
            ))}
            {notes.length === 0 && (
              <li className="note-list-empty">No notes yet. Create one!</li>
            )}
          </ul>
        </aside>
        <section className="editor">
          <input
            className="title-input"
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="content-textarea"
            placeholder="Start typing your note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="editor-actions">
            <button className="primary-btn" onClick={handleUpdate} disabled={!selectedId}>
              Save changes
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from "react";

type Point = {
  x: number;
  y: number;
  t: number;
};

type Tool = "pen" | "eraser";

type Stroke = {
  id: string;
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
};

type Note = {
  id: string;
  title: string;
  content: string;
  strokes: Stroke[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "notenepal-notes-v2";
const LEGACY_STORAGE_KEY = "ts-notes-app-notes";

function normalizeNotes(input: unknown): Note[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Partial<Note>;
      if (!r.id || !r.createdAt || !r.updatedAt) return null;
      return {
        id: String(r.id),
        title: String(r.title ?? ""),
        content: String(r.content ?? ""),
        strokes: Array.isArray(r.strokes) ? (r.strokes as Stroke[]) : [],
        createdAt: String(r.createdAt),
        updatedAt: String(r.updatedAt)
      } satisfies Note;
    })
    .filter((n): n is Note => Boolean(n));
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    return normalizeNotes(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
  return { x, y, t: performance.now() };
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  canvas: HTMLCanvasElement,
  opts?: { onlyLastSegment?: boolean }
) {
  const points = stroke.points;
  if (points.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.size;

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }

  const startIndex = opts?.onlyLastSegment ? Math.max(0, points.length - 2) : 0;
  ctx.beginPath();
  const p0 = points[startIndex];
  ctx.moveTo(p0.x * w, p0.y * h);
  for (let i = startIndex + 1; i < points.length; i++) {
    const p = points[i];
    ctx.lineTo(p.x * w, p.y * h);
  }
  ctx.stroke();
  ctx.restore();
}

function redrawAll(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, strokes: Stroke[]) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((s) => drawStroke(ctx, s, canvas));
}

export const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tool, setTool] = useState<Tool>("pen");
  const [penColor, setPenColor] = useState("#1db954");
  const [penSize, setPenSize] = useState(4);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<Stroke | null>(null);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const selectedNote = useMemo(
    () => (selectedId ? notes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, notes]
  );

  useEffect(() => {
    if (!selectedId) {
      setTitle("");
      setContent("");
      return;
    }
    if (!selectedNote) return;
    setTitle(selectedNote.title);
    setContent(selectedNote.content);
  }, [selectedId, selectedNote]);

  const handleCreate = () => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled note",
      content,
      strokes: [],
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

  const handleUndoStroke = () => {
    if (!selectedId) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedId ? { ...note, strokes: note.strokes.slice(0, -1), updatedAt: now } : note
      )
    );
  };

  const handleClearCanvas = () => {
    if (!selectedId) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((note) => (note.id === selectedId ? { ...note, strokes: [], updatedAt: now } : note))
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvasCtxRef.current = ctx;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(260, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const strokes = selectedNote?.strokes ?? [];
      redrawAll(ctx, canvas, strokes);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [selectedNote?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    if (!canvas || !ctx) return;
    redrawAll(ctx, canvas, selectedNote?.strokes ?? []);
  }, [selectedNote?.strokes]);

  const commitStroke = (stroke: Stroke) => {
    if (!selectedId) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedId
          ? { ...note, strokes: [...(note.strokes ?? []), stroke], updatedAt: now }
          : note
      )
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selectedId) return;
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    if (!canvas || !ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    isDrawingRef.current = true;
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      tool,
      color: penColor,
      size: penSize,
      points: [getCanvasPoint(e, canvas)]
    };
    activeStrokeRef.current = stroke;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !ctx || !stroke) return;
    if ((e.buttons & 1) === 0) return;

    stroke.points.push(getCanvasPoint(e, canvas));
    drawStroke(ctx, stroke, canvas, { onlyLastSegment: true });
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke || stroke.points.length < 2) return;

    commitStroke(stroke);
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-left">
          <h1>NoteNepal</h1>
          <p className="app-subtitle">Write notes with your mouse or pen — saved on this device</p>
        </div>
        <div className="header-right">
          <span className="header-badge">{notes.length} notes</span>
        </div>
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
          <div className="editor-topbar">
            <input
              className="title-input"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!selectedId}
            />
            <div className="editor-actions">
              <button className="ghost-btn" onClick={handleUndoStroke} disabled={!selectedId || !(selectedNote?.strokes?.length)}>
                Undo
              </button>
              <button className="ghost-btn danger" onClick={handleClearCanvas} disabled={!selectedId || !(selectedNote?.strokes?.length)}>
                Clear
              </button>
              <button className="primary-btn" onClick={handleUpdate} disabled={!selectedId}>
                Save text
              </button>
            </div>
          </div>

          <div className="canvas-panel">
            <div className="canvas-toolbar" role="toolbar" aria-label="Drawing tools">
              <button
                className={"tool-btn" + (tool === "pen" ? " tool-btn--active" : "")}
                onClick={() => setTool("pen")}
                disabled={!selectedId}
              >
                Pen
              </button>
              <button
                className={"tool-btn" + (tool === "eraser" ? " tool-btn--active" : "")}
                onClick={() => setTool("eraser")}
                disabled={!selectedId}
              >
                Eraser
              </button>
              <label className="tool-field">
                <span>Size</span>
                <input
                  type="range"
                  min={2}
                  max={18}
                  value={penSize}
                  onChange={(e) => setPenSize(Number(e.target.value))}
                  disabled={!selectedId}
                />
              </label>
              <label className="tool-field">
                <span>Ink</span>
                <input
                  type="color"
                  value={penColor}
                  onChange={(e) => setPenColor(e.target.value)}
                  disabled={!selectedId || tool !== "pen"}
                />
              </label>
              <span className="tool-hint">{selectedId ? "Draw on the canvas (mouse/pen)" : "Create/select a note to draw"}</span>
            </div>
            <div className="canvas-surface">
              <canvas
                ref={canvasRef}
                className="drawing-canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
              />
            </div>
          </div>

          <textarea
            className="content-textarea"
            placeholder="Optional: type extra details here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!selectedId}
          />
        </section>
      </main>
    </div>
  );
};

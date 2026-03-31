"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
};

const STORAGE_KEY = "markdown-notes-app-notes";
const TAG_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
];

const createEmptyNote = (): Note => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "",
    content: "",
    tags: [],
    updatedAt: now,
  };
};

const readInitialState = (): { notes: Note[]; selectedNoteId: string | null } => {
  const savedNotes = localStorage.getItem(STORAGE_KEY);

  if (savedNotes) {
    try {
      const parsed = JSON.parse(savedNotes) as Note[];
      const safeNotes = parsed.filter(
        (note) =>
          note &&
          typeof note.id === "string" &&
          typeof note.title === "string" &&
          typeof note.content === "string" &&
          Array.isArray(note.tags) &&
          typeof note.updatedAt === "string",
      );

      if (safeNotes.length > 0) {
        return {
          notes: safeNotes,
          selectedNoteId: safeNotes[0].id,
        };
      }
    } catch {
      // ignore and fall back to default note
    }
  }

  const defaultNote = createEmptyNote();
  return { notes: [defaultNote], selectedNoteId: defaultNote.id };
};

const getTagColor = (tag: string) => {
  let total = 0;
  for (let i = 0; i < tag.length; i += 1) {
    total += tag.charCodeAt(i);
  }

  return TAG_COLORS[total % TAG_COLORS.length];
};

export default function Home() {
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");

  const createNote = useCallback(() => {
    const newNote = createEmptyNote();
    setNotes((previousNotes) => [newNote, ...previousNotes]);
    setSelectedNoteId(newNote.id);
  }, []);

  const saveNow = useCallback((notesToSave: Note[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notesToSave));
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const initialState = readInitialState();
      setNotes(initialState.notes);
      setSelectedNoteId(initialState.selectedNoteId);
      setHasHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveNow(notes);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated, notes, saveNow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const lowered = event.key.toLowerCase();

      if (lowered === "n") {
        event.preventDefault();
        createNote();
      }

      if (lowered === "s") {
        event.preventDefault();
        saveButtonRef.current?.focus();
        saveNow(notes);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote, notes, saveNow]);

  const visibleNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return notes
      .filter((note) => {
        if (activeTag && !note.tags.includes(activeTag)) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [activeTag, notes, searchQuery]);

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();

    notes.forEach((note) => {
      note.tags.forEach((tag) => tags.add(tag));
    });

    return [...tags];
  }, [notes]);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  const updateSelectedNote = useCallback(
    (changes: Partial<Pick<Note, "title" | "content" | "tags">>) => {
      if (!selectedNoteId) {
        return;
      }

      setNotes((previousNotes) =>
        previousNotes.map((note) =>
          note.id === selectedNoteId
            ? { ...note, ...changes, updatedAt: new Date().toISOString() }
            : note,
        ),
      );
    },
    [selectedNoteId],
  );

  const addTagToSelected = () => {
    if (!selectedNote) {
      return;
    }

    const normalized = newTagInput.trim();
    if (!normalized || selectedNote.tags.includes(normalized)) {
      setNewTagInput("");
      return;
    }

    updateSelectedNote({ tags: [...selectedNote.tags, normalized] });
    setNewTagInput("");
  };

  const removeTagFromSelected = (tag: string) => {
    if (!selectedNote) {
      return;
    }

    updateSelectedNote({ tags: selectedNote.tags.filter((t) => t !== tag) });
  };

  const deleteSelectedNote = () => {
    if (!selectedNote) {
      return;
    }

    const didConfirm = window.confirm("Delete this note permanently?");
    if (!didConfirm) {
      return;
    }

    setNotes((previousNotes) => {
      const filtered = previousNotes.filter((note) => note.id !== selectedNote.id);
      setSelectedNoteId(filtered[0]?.id ?? null);
      return filtered;
    });
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <aside className="w-full max-w-sm border-r border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Notes</h1>
          <button
            type="button"
            onClick={createNote}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            New (Ctrl+N)
          </button>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search notes..."
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {uniqueTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag((currentTag) => (currentTag === tag ? null : tag))}
              className={`rounded-full border px-2 py-1 text-xs ${
                activeTag === tag
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
        <div className="space-y-2 overflow-auto pb-4">
          {visibleNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => setSelectedNoteId(note.id)}
              className={`w-full rounded-md border p-3 text-left ${
                selectedNoteId === note.id
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    note.tags[0] ? getTagColor(note.tags[0]) : "bg-slate-300"
                  }`}
                />
                <span className="truncate text-sm font-medium">
                  {note.title || "Untitled note"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {new Date(note.updatedAt).toLocaleString()}
              </p>
            </button>
          ))}
          {visibleNotes.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
              No notes found.
            </p>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-4">
        {selectedNote ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="text"
                value={selectedNote.title}
                onChange={(event) => updateSelectedNote({ title: event.target.value })}
                placeholder="Note title"
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold outline-none focus:border-slate-500"
              />
              <button
                ref={saveButtonRef}
                type="button"
                onClick={() => saveNow(notes)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={deleteSelectedNote}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(event) => setNewTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTagToSelected();
                  }
                }}
                placeholder="Add a tag"
                className="w-56 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
              <button
                type="button"
                onClick={addTagToSelected}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Add tag
              </button>
              <div className="flex flex-wrap gap-2">
                {selectedNote.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <span className={`h-2 w-2 rounded-full ${getTagColor(tag)}`} />
                    {tag}
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() => removeTagFromSelected(tag)}
                      aria-label={`Remove ${tag} tag`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
              <textarea
                value={selectedNote.content}
                onChange={(event) => updateSelectedNote({ content: event.target.value })}
                className="h-full min-h-64 w-full resize-none rounded-md border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:border-slate-500"
                placeholder="Write markdown..."
              />
              <div className="prose max-w-none overflow-auto rounded-md border border-slate-300 bg-white p-3 text-sm">
                <ReactMarkdown>{selectedNote.content || "_Live preview_"}</ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-slate-500">
            Create a note to start writing.
          </div>
        )}
      </main>
    </div>
  );
}

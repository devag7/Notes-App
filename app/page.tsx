"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  pinned: boolean;
};

type DeletedNote = Note & {
  deletedAt: string;
};

type PersistedState = {
  notes: Note[];
  deletedNotes: DeletedNote[];
};

const STORAGE_KEY = "markdown-notes-app-notes";
const AUTO_RESTORE_DAYS = 7;
const AUTO_RESTORE_MS = AUTO_RESTORE_DAYS * 24 * 60 * 60 * 1000;
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

const TEMPLATES = {
  "Daily Journal": `# Daily Journal\n\n## Gratitude\n- \n\n## Priorities\n- \n\n## Notes\n\n`,
  "Meeting Notes": `# Meeting Notes\n\n## Agenda\n- \n\n## Discussion\n- \n\n## Action Items\n- [ ] \n\n`,
  "Bug Report": `# Bug Report\n\n## Summary\n\n## Steps to Reproduce\n1. \n2. \n\n## Expected Behavior\n\n## Actual Behavior\n\n## Environment\n- Browser: \n- OS: \n\n`,
} as const;

const createEmptyNote = (content = "", title = ""): Note => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title,
    content,
    tags: [],
    updatedAt: now,
    pinned: false,
  };
};

const normalizeNote = (candidate: unknown): Note | null => {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const note = candidate as Partial<Note>;
  if (
    typeof note.id !== "string" ||
    typeof note.title !== "string" ||
    typeof note.content !== "string" ||
    !Array.isArray(note.tags) ||
    typeof note.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags.filter((tag): tag is string => typeof tag === "string"),
    updatedAt: note.updatedAt,
    pinned: Boolean(note.pinned),
  };
};

const normalizeDeletedNote = (candidate: unknown): DeletedNote | null => {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const notePart = normalizeNote(candidate);
  const deletedAt = (candidate as { deletedAt?: string }).deletedAt;
  if (!notePart || typeof deletedAt !== "string") {
    return null;
  }

  return { ...notePart, deletedAt };
};

const sortNotes = (notes: Note[]) =>
  [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

const dedupeNotesById = (notes: Note[]) => {
  const byId = new Map<string, Note>();
  notes.forEach((note) => {
    const existing = byId.get(note.id);
    if (!existing) {
      byId.set(note.id, note);
      return;
    }

    if (new Date(note.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      byId.set(note.id, note);
    }
  });

  return [...byId.values()];
};

const readInitialState = (): { notes: Note[]; selectedNoteId: string | null; deletedNotes: DeletedNote[] } => {
  const savedNotes = localStorage.getItem(STORAGE_KEY);

  if (savedNotes) {
    try {
      const parsed = JSON.parse(savedNotes) as PersistedState | Note[];

        if (Array.isArray(parsed)) {
          const normalized = parsed.map(normalizeNote).filter((note): note is Note => note !== null);
          if (normalized.length > 0) {
            const ordered = sortNotes(dedupeNotesById(normalized));
            return {
              notes: ordered,
              selectedNoteId: ordered[0].id,
            deletedNotes: [],
          };
        }
      } else if (parsed && typeof parsed === "object") {
        const notes = Array.isArray(parsed.notes)
          ? parsed.notes.map(normalizeNote).filter((note): note is Note => note !== null)
          : [];
        const deletedNotes = Array.isArray(parsed.deletedNotes)
          ? parsed.deletedNotes
              .map(normalizeDeletedNote)
              .filter((note): note is DeletedNote => note !== null)
          : [];

        const ordered = sortNotes(dedupeNotesById(notes));

        if (ordered.length > 0 || deletedNotes.length > 0) {
          return {
            notes: ordered,
            selectedNoteId: ordered[0]?.id ?? null,
            deletedNotes,
          };
        }
      }
    } catch {
      // ignore and fall back to default state
    }
  }

  const defaultNote = createEmptyNote();
  return { notes: [defaultNote], selectedNoteId: defaultNote.id, deletedNotes: [] };
};

const getTagColor = (tag: string) => {
  let total = 0;
  for (let i = 0; i < tag.length; i += 1) {
    total += tag.charCodeAt(i);
  }

  return TAG_COLORS[total % TAG_COLORS.length];
};

const wordCountFromMarkdown = (content: string) => {
  const words = content
    .replace(/[`*_#>-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return words.length;
};

export default function Home() {
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<DeletedNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [zenMode, setZenMode] = useState(false);

  const createNote = useCallback((templateName?: keyof typeof TEMPLATES) => {
    const templateContent = templateName ? TEMPLATES[templateName] : "";
    const newNote = createEmptyNote(templateContent, templateName ?? "");
    setNotes((previousNotes) => sortNotes([newNote, ...previousNotes]));
    setSelectedNoteId(newNote.id);
  }, []);

  const saveNow = useCallback((notesToSave: Note[], deletedNotesToSave: DeletedNote[]) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notes: notesToSave, deletedNotes: deletedNotesToSave }),
    );
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const initialState = readInitialState();
      setNotes(initialState.notes);
      setDeletedNotes(initialState.deletedNotes);
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
      saveNow(notes, deletedNotes);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [deletedNotes, hasHydrated, notes, saveNow]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      let restoredNotes: Note[] = [];

      setDeletedNotes((previousDeleted) => {
        const toRestore = previousDeleted.filter(
          (note) => now - new Date(note.deletedAt).getTime() >= AUTO_RESTORE_MS,
        );

        if (toRestore.length > 0) {
          restoredNotes = toRestore.map((deletedNote) => ({
            id: deletedNote.id,
            title: deletedNote.title,
            content: deletedNote.content,
            tags: deletedNote.tags,
            pinned: deletedNote.pinned,
            updatedAt: new Date().toISOString(),
          }));
        }

        return previousDeleted.filter(
          (note) => now - new Date(note.deletedAt).getTime() < AUTO_RESTORE_MS,
        );
      });

      if (restoredNotes.length > 0) {
        setNotes((previousNotes) => {
          const existing = new Set(previousNotes.map((note) => note.id));
          const deduped = restoredNotes.filter((note) => !existing.has(note.id));
          return deduped.length > 0 ? sortNotes([...deduped, ...previousNotes]) : previousNotes;
        });
      }
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [hasHydrated]);

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
        saveNow(notes, deletedNotes);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote, deletedNotes, notes, saveNow]);

  const visibleNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortNotes(
      notes.filter((note) => {
        if (activeTag && !note.tags.includes(activeTag)) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query)
        );
      }),
    );
  }, [activeTag, notes, searchQuery]);

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();

    notes.forEach((note) => {
      note.tags.forEach((tag) => tags.add(tag));
    });

    return [...tags].sort();
  }, [notes]);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  const updateSelectedNote = useCallback(
    (changes: Partial<Pick<Note, "title" | "content" | "tags" | "pinned">>) => {
      if (!selectedNoteId) {
        return;
      }

      setNotes((previousNotes) =>
        sortNotes(
          previousNotes.map((note) =>
            note.id === selectedNoteId
              ? { ...note, ...changes, updatedAt: new Date().toISOString() }
              : note,
          ),
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

    const didConfirm = window.confirm("Move this note to Recently Deleted?");
    if (!didConfirm) {
      return;
    }

    const deletedAt = new Date().toISOString();
    setDeletedNotes((previousDeleted) => [{ ...selectedNote, deletedAt }, ...previousDeleted]);
    setNotes((previousNotes) => {
      const filtered = previousNotes.filter((note) => note.id !== selectedNote.id);
      setSelectedNoteId(filtered[0]?.id ?? null);
      return filtered;
    });
  };

  const restoreDeletedNote = (noteId: string) => {
    const noteToRestore = deletedNotes.find((note) => note.id === noteId);
    if (!noteToRestore) {
      return;
    }

    setDeletedNotes((previousDeleted) => previousDeleted.filter((note) => note.id !== noteId));

    const noteWithFreshDate: Note = {
      id: noteToRestore.id,
      title: noteToRestore.title,
      content: noteToRestore.content,
      tags: noteToRestore.tags,
      pinned: noteToRestore.pinned,
      updatedAt: new Date().toISOString(),
    };

    setNotes((previousNotes) => {
      if (previousNotes.some((note) => note.id === noteWithFreshDate.id)) {
        return previousNotes;
      }

      return sortNotes([noteWithFreshDate, ...previousNotes]);
    });
    setSelectedNoteId(noteWithFreshDate.id);
  };

  const togglePin = (noteId: string) => {
    setNotes((previousNotes) =>
      sortNotes(
        previousNotes.map((note) =>
          note.id === noteId
            ? {
                ...note,
                pinned: !note.pinned,
                updatedAt: new Date().toISOString(),
              }
            : note,
        ),
      ),
    );
  };

  const applyToolbar = (kind: "bold" | "italic" | "heading" | "codeblock" | "list") => {
    if (!selectedNote || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const { selectionStart, selectionEnd, value } = textarea;
    const selectedText = value.slice(selectionStart, selectionEnd);

    const replaceValue = (nextText: string, nextSelectionStart: number, nextSelectionEnd: number) => {
      const nextValue = `${value.slice(0, selectionStart)}${nextText}${value.slice(selectionEnd)}`;
      updateSelectedNote({ content: nextValue });

      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      });
    };

    if (kind === "bold") {
      const body = selectedText || "bold text";
      const wrapped = `**${body}**`;
      replaceValue(wrapped, selectionStart + 2, selectionStart + 2 + body.length);
      return;
    }

    if (kind === "italic") {
      const body = selectedText || "italic text";
      const wrapped = `*${body}*`;
      replaceValue(wrapped, selectionStart + 1, selectionStart + 1 + body.length);
      return;
    }

    if (kind === "heading") {
      const body = selectedText || "Heading";
      const wrapped = `## ${body}`;
      replaceValue(wrapped, selectionStart + 3, selectionStart + 3 + body.length);
      return;
    }

    if (kind === "codeblock") {
      const body = selectedText || "code";
      const wrapped = `\n\`\`\`\n${body}\n\`\`\`\n`;
      const cursorStart = selectionStart + 5;
      replaceValue(wrapped, cursorStart, cursorStart + body.length);
      return;
    }

    const listBody = (selectedText || "item")
      .split("\n")
      .map((line) => `- ${line}`)
      .join("\n");
    replaceValue(listBody, selectionStart, selectionStart + listBody.length);
  };

  const selectedWordCount = selectedNote ? wordCountFromMarkdown(selectedNote.content) : 0;
  const readingMinutes = selectedWordCount === 0 ? 0 : Math.max(1, Math.ceil(selectedWordCount / 200));

  return (
    <div className={`relative flex h-screen text-slate-900 ${zenMode ? "bg-slate-900" : "bg-slate-100"}`}>
      {zenMode && <div className="pointer-events-none absolute inset-0 bg-black/55" />}

      {!zenMode && (
        <aside className="no-print w-full max-w-sm border-r border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">Notes</h1>
            <button
              type="button"
              onClick={() => createNote()}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              New (Ctrl/Cmd+N)
            </button>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2">
            {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => createNote(template)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left text-xs hover:bg-slate-50"
              >
                + {template}
              </button>
            ))}
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

          <div className="max-h-[45vh] space-y-2 overflow-auto pb-2">
            {visibleNotes.map((note) => (
              <div
                key={note.id}
                className={`rounded-md border p-2 ${
                  selectedNoteId === note.id
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedNoteId(note.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        note.tags[0] ? getTagColor(note.tags[0]) : "bg-slate-300"
                      }`}
                    />
                    <span className="truncate text-sm font-medium">
                      {note.pinned ? "📌 " : ""}
                      {note.title || "Untitled note"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(note.id)}
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100"
                  >
                    {note.pinned ? "Unpin" : "Pin"}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{new Date(note.updatedAt).toLocaleString()}</p>
              </div>
            ))}
            {visibleNotes.length === 0 && (
              <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                No notes found.
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <h2 className="mb-2 text-sm font-semibold">Recently Deleted</h2>
            <div className="max-h-44 space-y-2 overflow-auto">
              {deletedNotes.length === 0 && (
                <p className="text-xs text-slate-500">Deleted notes auto-restore after 7 days.</p>
              )}
              {deletedNotes.map((note) => {
                return (
                  <div key={note.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <p className="truncate text-xs font-medium">{note.title || "Untitled note"}</p>
                    <p className="mb-1 text-[11px] text-slate-500">Auto-restore after 7 days</p>
                    <button
                      type="button"
                      onClick={() => restoreDeletedNote(note.id)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-100"
                    >
                      Restore now
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      <main
        className={`print-root relative flex min-w-0 flex-1 flex-col p-4 ${
          zenMode ? "z-10 mx-auto max-w-5xl" : ""
        }`}
      >
        {selectedNote ? (
          <>
            <div className="no-print mb-3 flex flex-wrap items-center gap-2">
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
                onClick={() => saveNow(notes, deletedNotes)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setZenMode((current) => !current)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                {zenMode ? "Exit Zen" : "Zen Mode"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={deleteSelectedNote}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>

            <div className="no-print mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyToolbar("bold")}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() => applyToolbar("italic")}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              >
                Italic
              </button>
              <button
                type="button"
                onClick={() => applyToolbar("heading")}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              >
                Heading
              </button>
              <button
                type="button"
                onClick={() => applyToolbar("codeblock")}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              >
                Code Block
              </button>
              <button
                type="button"
                onClick={() => applyToolbar("list")}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              >
                List
              </button>
            </div>

            <div className="no-print mb-3 flex flex-wrap items-center gap-2">
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
                ref={textareaRef}
                value={selectedNote.content}
                onChange={(event) => updateSelectedNote({ content: event.target.value })}
                className="h-full min-h-64 w-full resize-none rounded-md border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:border-slate-500"
                placeholder="Write markdown..."
              />
              <div className="prose print-preview max-w-none overflow-auto rounded-md border border-slate-300 bg-white p-3 text-sm">
                <ReactMarkdown>{selectedNote.content || "_Live preview_"}</ReactMarkdown>
              </div>
            </div>

            <div className="no-print mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">
              Word count: {selectedWordCount} • Reading time: {readingMinutes} min
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

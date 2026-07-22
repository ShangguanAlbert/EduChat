import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import NoteList from "../components/NoteList.jsx";
import NoteEditor from "../components/NoteEditor.jsx";
import NotesWorkbenchSidebar from "../components/NotesWorkbenchSidebar.jsx";
import {
  createNote,
  deleteNote,
  exportNoteWord,
  getNote,
  listNotes,
  migrateNoteImages,
  toggleNoteStar,
  updateNote,
} from "../api/notesApi.js";
import { withAuthSlot } from "../../../app/authStorage.js";

const AUTOSAVE_DELAY = 700;

function normalizeTagsText(tags) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function parseTagsText(value) {
  return String(value || "")
    .split(/[,\n，、]/)
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function sortNotesCollection(notes = []) {
  return [...notes].sort((left, right) => {
    const leftStarred = left?.starred ? 1 : 0;
    const rightStarred = right?.starred ? 1 : 0;
    if (leftStarred !== rightStarred) return rightStarred - leftStarred;

    const leftTime = new Date(left?.updatedAt || 0).getTime();
    const rightTime = new Date(right?.updatedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function upsertNoteInCollection(notes = [], nextNote = null) {
  if (!nextNote?.id) return sortNotesCollection(notes);
  const next = notes.filter((item) => item.id !== nextNote.id);
  next.push(nextNote);
  return sortNotesCollection(next);
}

function createDraftSnapshot({ title = "", contentMarkdown = "", tagsText = "", status = "draft" } = {}) {
  return {
    title: String(title || ""),
    contentMarkdown: String(contentMarkdown || ""),
    tagsText: String(tagsText || ""),
    status: String(status || "draft"),
  };
}

function createSnapshotFromNote(note = null) {
  return createDraftSnapshot({
    title: note?.title || "",
    contentMarkdown: note?.contentMarkdown || "",
    tagsText: normalizeTagsText(note?.tags),
    status: note?.status || "draft",
  });
}

function areSnapshotsEqual(left = null, right = null) {
  if (!left || !right) return false;
  return (
    left.title === right.title &&
    left.contentMarkdown === right.contentMarkdown &&
    left.tagsText === right.tagsText &&
    left.status === right.status
  );
}

function sanitizeDownloadFilename(value = "") {
  const base = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return `${base || "笔记"}.docx`;
}

export default function NotesPage() {
  const navigate = useNavigate();
  const params = useParams();
  const activeNoteId = String(params.noteId || "").trim();

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [selectedNote, setSelectedNote] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContentMarkdown, setDraftContentMarkdown] = useState("");
  const [draftTagsText, setDraftTagsText] = useState("");
  const [draftStatus, setDraftStatus] = useState("draft");
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [starPending, setStarPending] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [actionError, setActionError] = useState("");

  const autosaveTimerRef = useRef(0);
  const selectedNoteRef = useRef(null);
  const activeNoteIdRef = useRef(activeNoteId);
  const draftRef = useRef(createDraftSnapshot());
  const lastSavedSnapshotRef = useRef(null);
  const savePromiseRef = useRef(null);
  const flushPendingSaveRef = useRef(null);
  const imageMigrationTriggeredRef = useRef(false);
  const [pageEntered, setPageEntered] = useState(false);

  const navigateToNotePath = useCallback(
    (noteId = "") => {
      const safeNoteId = String(noteId || "").trim();
      navigate(safeNoteId ? withAuthSlot(`/notes/${safeNoteId}`) : withAuthSlot("/notes"));
    },
    [navigate],
  );

  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  useEffect(() => {
    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      setPageEntered(true);
    });
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    draftRef.current = createDraftSnapshot({
      title: draftTitle,
      contentMarkdown: draftContentMarkdown,
      tagsText: draftTagsText,
      status: draftStatus,
    });
  }, [draftTitle, draftContentMarkdown, draftTagsText, draftStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchValue.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  const isDirty = selectedNote?.id
    ? !areSnapshotsEqual(
        createDraftSnapshot({
          title: draftTitle,
          contentMarkdown: draftContentMarkdown,
          tagsText: draftTagsText,
          status: draftStatus,
        }),
        lastSavedSnapshotRef.current,
      )
    : false;

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError("");
    try {
      const data = await listNotes({
        q: debouncedSearch,
        tag: activeTag,
      });
      setNotes(sortNotesCollection(Array.isArray(data?.notes) ? data.notes : []));
    } catch (error) {
      setNotesError(error?.message || "读取笔记列表失败。");
    } finally {
      setNotesLoading(false);
    }
  }, [activeTag, debouncedSearch]);

  const scheduleAutosave = useCallback(() => {
    window.clearTimeout(autosaveTimerRef.current);
    if (!selectedNoteRef.current?.id) return;
    if (areSnapshotsEqual(draftRef.current, lastSavedSnapshotRef.current)) return;
    autosaveTimerRef.current = window.setTimeout(() => {
      if (!savePromiseRef.current) {
        void flushPendingSaveRef.current?.();
      }
    }, AUTOSAVE_DELAY);
  }, []);

  const commitNote = useCallback((note, { replaceDraft = false } = {}) => {
    if (!note) return;
    setSelectedNote(note);
    setNotes((current) => upsertNoteInCollection(current, note));
    const savedSnapshot = createSnapshotFromNote(note);
    lastSavedSnapshotRef.current = savedSnapshot;

    if (replaceDraft) {
      setDraftTitle(savedSnapshot.title);
      setDraftContentMarkdown(savedSnapshot.contentMarkdown);
      setDraftTagsText(savedSnapshot.tagsText);
      setDraftStatus(savedSnapshot.status);
    }
  }, []);

  const performSave = useCallback(async () => {
    const currentNote = selectedNoteRef.current;
    if (!currentNote?.id) return true;

    const snapshot = draftRef.current;
    if (areSnapshotsEqual(snapshot, lastSavedSnapshotRef.current)) return true;
    if (savePromiseRef.current) return savePromiseRef.current;

    setSavePending(true);
    setActionError("");

    const request = updateNote(currentNote.id, {
      title: snapshot.title,
      contentMarkdown: snapshot.contentMarkdown,
      tags: parseTagsText(snapshot.tagsText),
      status: snapshot.status,
    })
      .then((data) => {
        const note = data?.note || null;
        if (note) {
          setSelectedNote((current) => (current?.id === note.id ? note : current));
          setNotes((current) => upsertNoteInCollection(current, note));
          lastSavedSnapshotRef.current = snapshot;
        }
        return true;
      })
      .catch((error) => {
        setActionError(error?.message || "保存笔记失败。");
        return false;
      })
      .finally(() => {
        savePromiseRef.current = null;
        setSavePending(false);
        if (
          selectedNoteRef.current?.id &&
          !areSnapshotsEqual(draftRef.current, lastSavedSnapshotRef.current)
        ) {
          scheduleAutosave();
        }
      });

    savePromiseRef.current = request;
    return request;
  }, [scheduleAutosave]);

  const flushPendingSave = useCallback(async () => {
    window.clearTimeout(autosaveTimerRef.current);
    if (savePromiseRef.current) {
      const pendingResult = await savePromiseRef.current;
      if (!pendingResult) return false;
    }
    if (!selectedNoteRef.current?.id) return true;
    if (areSnapshotsEqual(draftRef.current, lastSavedSnapshotRef.current)) return true;
    return performSave();
  }, [performSave]);

  useEffect(() => {
    flushPendingSaveRef.current = flushPendingSave;
    return () => {
      flushPendingSaveRef.current = null;
    };
  }, [flushPendingSave]);

  const openNote = useCallback(
    async (noteId = "", { skipFlush = false } = {}) => {
      if (!skipFlush) {
        const saved = await flushPendingSave();
        if (!saved) return false;
      }
      navigateToNotePath(noteId);
      return true;
    },
    [flushPendingSave, navigateToNotePath],
  );

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (imageMigrationTriggeredRef.current) return;
    imageMigrationTriggeredRef.current = true;
    void migrateNoteImages().catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedNote?.id) {
      window.clearTimeout(autosaveTimerRef.current);
      return undefined;
    }

    if (areSnapshotsEqual(draftRef.current, lastSavedSnapshotRef.current)) {
      window.clearTimeout(autosaveTimerRef.current);
      return undefined;
    }

    scheduleAutosave();
    return () => window.clearTimeout(autosaveTimerRef.current);
  }, [selectedNote?.id, draftTitle, draftContentMarkdown, draftTagsText, draftStatus, scheduleAutosave]);

  useEffect(() => {
    if (!activeNoteId) {
      setSelectedNote(null);
      setDraftTitle("");
      setDraftContentMarkdown("");
      setDraftTagsText("");
      setDraftStatus("draft");
      lastSavedSnapshotRef.current = null;
      setDetailError("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    setActionError("");

    getNote(activeNoteId)
      .then((data) => {
        if (cancelled) return;
        const note = data?.note || null;
        setSelectedNote(note);
        const snapshot = createSnapshotFromNote(note);
        setDraftTitle(snapshot.title);
        setDraftContentMarkdown(snapshot.contentMarkdown);
        setDraftTagsText(snapshot.tagsText);
        setDraftStatus(snapshot.status);
        lastSavedSnapshotRef.current = snapshot;
      })
      .catch((error) => {
        if (cancelled) return;
        setSelectedNote(null);
        lastSavedSnapshotRef.current = null;
        setDetailError(error?.message || "读取笔记详情失败。");
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeNoteId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(autosaveTimerRef.current);
      if (selectedNoteRef.current?.id && !areSnapshotsEqual(draftRef.current, lastSavedSnapshotRef.current)) {
        void performSave();
      }
    };
  }, [performSave]);

  const availableTags = useMemo(() => {
    const set = new Set();
    notes.forEach((note) => {
      (Array.isArray(note?.tags) ? note.tags : []).forEach((tag) => {
        const safeTag = String(tag || "").trim();
        if (safeTag) set.add(safeTag);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [notes]);

  function handleTitleChange(value) {
    setActionError("");
    setDraftTitle(value);
  }

  function handleContentChange(value) {
    setActionError("");
    setDraftContentMarkdown(value);
  }

  function handleTagsChange(value) {
    setActionError("");
    setDraftTagsText(value);
  }

  function handleStatusChange(value) {
    setActionError("");
    setDraftStatus(value);
  }

  async function handleCreate() {
    const saved = await flushPendingSave();
    if (!saved) return;

    setActionError("");
    try {
      const data = await createNote({});
      const note = data?.note || null;
      if (note) setNotes((current) => upsertNoteInCollection(current, note));
      if (note?.id) await openNote(note.id, { skipFlush: true });
    } catch (error) {
      setActionError(error?.message || "创建笔记失败。");
    }
  }

  async function handleDelete() {
    if (!selectedNote?.id) return;
    const confirmed = window.confirm(`确认删除《${selectedNote.title || "未命名笔记"}》吗？`);
    if (!confirmed) return;

    setDeletePending(true);
    setActionError("");
    try {
      const deletingId = selectedNote.id;
      await deleteNote(deletingId);
      const remaining = sortNotesCollection(notes.filter((item) => item.id !== deletingId));
      setNotes(remaining);
      setSelectedNote(null);
      lastSavedSnapshotRef.current = null;
      if (activeNoteId === deletingId) {
        await openNote(remaining[0]?.id || "", { skipFlush: true });
      }
    } catch (error) {
      setActionError(error?.message || "删除笔记失败。");
    } finally {
      setDeletePending(false);
    }
  }

  async function handleDeleteById(noteId) {
    const targetId = String(noteId || "").trim();
    if (!targetId) return;
    const targetNote = notes.find((item) => item.id === targetId) || null;
    const confirmed = window.confirm(`确认删除《${targetNote?.title || "未命名笔记"}》吗？`);
    if (!confirmed) return;

    setActionError("");
    try {
      await deleteNote(targetId);
      const remaining = sortNotesCollection(notes.filter((item) => item.id !== targetId));
      setNotes(remaining);
      if (activeNoteId === targetId) {
        setSelectedNote(null);
        lastSavedSnapshotRef.current = null;
        await openNote(remaining[0]?.id || "", { skipFlush: true });
      }
    } catch (error) {
      setActionError(error?.message || "删除笔记失败。");
    }
  }

  async function handleManualSave() {
    if (!selectedNote?.id) return;
    return flushPendingSave();
  }

  async function handleToggleStar() {
    if (!selectedNote?.id) return;
    setStarPending(true);
    setActionError("");
    try {
      const data = await toggleNoteStar(selectedNote.id);
      const note = data?.note || null;
      commitNote(note, { replaceDraft: false });
    } catch (error) {
      setActionError(error?.message || "更新星标失败。");
    } finally {
      setStarPending(false);
    }
  }

  async function handleExportWord() {
    if (!selectedNote?.id) return;
    const saved = await flushPendingSave();
    if (!saved) return;

    setExportPending(true);
    setActionError("");
    try {
      const data = await exportNoteWord(selectedNote.id);
      const fileName = data?.filename || sanitizeDownloadFilename(selectedNote.title);
      const objectUrl = window.URL.createObjectURL(data.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1200);
    } catch (error) {
      setActionError(error?.message || "导出 Word 失败。");
    } finally {
      setExportPending(false);
    }
  }

  async function handleOpenSourceChat() {
    if (!selectedNote?.sourceSessionId) return;
    const saved = await flushPendingSave();
    if (!saved) return;
    navigate(withAuthSlot(`/c/${selectedNote.sourceSessionId}`));
  }

  return (
    <div className={`chat-layout notes-page notes-page-enter${pageEntered ? " is-page-entered" : ""}`}>
      <NotesWorkbenchSidebar
        onBackToChat={() => navigate(withAuthSlot("/c"))}
        onCreate={handleCreate}
        backButtonLabel="返回"
        backButtonStatusLabel="对话"
      >
        <NoteList
          notes={notes}
          activeNoteId={activeNoteId}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          activeTag={activeTag}
          onTagChange={setActiveTag}
          availableTags={availableTags}
          onSelect={(noteId) => {
            void openNote(noteId);
          }}
          onDelete={handleDeleteById}
          loading={notesLoading}
          error={notesError}
        />
      </NotesWorkbenchSidebar>

      <main className="notes-main notes-main-shell">
        <div className="notes-main-layout">
          <section className="notes-editor-panel">
            {detailLoading ? (
              <div className="notes-editor-empty">
                <span className="notes-loading-spinner" aria-label="正在加载笔记" />
              </div>
            ) : (
              <NoteEditor
                note={selectedNote}
                title={draftTitle}
                contentMarkdown={draftContentMarkdown}
                tagsText={draftTagsText}
                status={draftStatus}
                saving={savePending}
                deleting={deletePending}
                starPending={starPending}
                exportPending={exportPending}
                dirty={isDirty}
                error={actionError || detailError}
                onSave={handleManualSave}
                onTitleChange={handleTitleChange}
                onContentChange={handleContentChange}
                onTagsChange={handleTagsChange}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onOpenSourceChat={handleOpenSourceChat}
                onToggleStar={handleToggleStar}
                onExportWord={handleExportWord}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

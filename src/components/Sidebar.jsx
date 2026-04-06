import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  FolderOpen,
  ImagePlus,
  MessageSquarePlus,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Settings,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SIDEBAR_ROW_ENTER_MS = 560;
const SIDEBAR_ROW_EXIT_MS = 420;
const SIDEBAR_MENU_ANIMATION_MS = 180;

export default function Sidebar({
  sessions,
  groups,
  activeId,
  onSelect,
  onNewChat,
  onOpenImageGeneration,
  onOpenGroupChat,
  onDeleteSession,
  onBatchDeleteSessions,
  onMoveSessionToGroup,
  onBatchMoveSessionsToGroup,
  onRenameSession,
  onToggleSessionPin,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  hasUserInfo = false,
  onOpenUserInfoModal,
  sessionActionsDisabled = false,
}) {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [nameError, setNameError] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState("");

  const [menuSessionId, setMenuSessionId] = useState("");
  const [moveMenuSessionId, setMoveMenuSessionId] = useState("");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [closingMenuState, setClosingMenuState] = useState(null);
  const [projectMenuGroupId, setProjectMenuGroupId] = useState("");
  const [projectsSectionCollapsed, setProjectsSectionCollapsed] =
    useState(false);
  const [recentSectionCollapsed, setRecentSectionCollapsed] = useState(false);

  const [batchMode, setBatchMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [showBatchMove, setShowBatchMove] = useState(false);
  const [enteringSessionIds, setEnteringSessionIds] = useState([]);
  const [exitingSessionIds, setExitingSessionIds] = useState([]);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState({});
  const expectInsertAnimationRef = useRef(false);
  const previousSessionIdsRef = useRef(
    new Set(sessions.map((item) => item.id)),
  );
  const enterTimersRef = useRef(new Map());
  const exitTimersRef = useRef(new Map());
  const batchDeleteTimerRef = useRef(0);
  const menuCloseTimerRef = useRef(0);

  const grouped = useMemo(() => {
    const map = new Map();

    groups.forEach((g) => {
      map.set(g.id, {
        id: g.id,
        name: g.name,
        description: g.description,
        sessions: [],
      });
    });

    const ungrouped = [];

    sessions.forEach((s) => {
      if (s.groupId && map.has(s.groupId)) {
        map.get(s.groupId).sessions.push(s);
        return;
      }
      ungrouped.push(s);
    });

    return {
      groups: Array.from(map.values()).map((g) => ({
        ...g,
        sessions: [...g.sessions].sort(
          (a, b) => Number(b.pinned) - Number(a.pinned),
        ),
      })),
      ungrouped: [...ungrouped].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned),
      ),
    };
  }, [groups, sessions]);

  const groupMoveOptions = useMemo(
    () => [
      { id: "", name: "未分组" },
      ...groups.map((g) => ({ id: g.id, name: g.name })),
    ],
    [groups],
  );

  const renderedMenuSessionId = menuSessionId || closingMenuState?.sessionId || "";
  const renderedMoveMenuSessionId = menuSessionId
    ? moveMenuSessionId
    : (closingMenuState?.moveMenuSessionId ?? "");
  const renderedMenuAnchor = menuSessionId ? menuAnchor : (closingMenuState?.anchor ?? null);
  const renderedMenuSession = useMemo(
    () => sessions.find((s) => s.id === renderedMenuSessionId) || null,
    [sessions, renderedMenuSessionId],
  );
  const isMenuClosing = !menuSessionId && !!closingMenuState;
  const selectedSessionIdSet = useMemo(() => {
    const valid = new Set(sessions.map((s) => s.id));
    return new Set(selectedSessionIds.filter((id) => valid.has(id)));
  }, [sessions, selectedSessionIds]);
  const selectedSessionIdList = useMemo(
    () => Array.from(selectedSessionIdSet),
    [selectedSessionIdSet],
  );
  const enteringSessionIdSet = useMemo(
    () => new Set(enteringSessionIds),
    [enteringSessionIds],
  );
  const exitingSessionIdSet = useMemo(
    () => new Set(exitingSessionIds),
    [exitingSessionIds],
  );
  const activeGroupId = useMemo(() => {
    const activeSession = sessions.find((session) => session.id === activeId);
    return String(activeSession?.groupId || "").trim();
  }, [activeId, sessions]);
  const menuPosition = useMemo(() => {
    if (!renderedMenuSessionId || !renderedMenuAnchor) {
      return { top: 0, left: 0 };
    }

    const padding = 8;
    const gap = 6;
    const menuWidth = 184;
    const menuHeight = 210;

    const left = Math.max(
      padding,
      Math.min(
        renderedMenuAnchor.right - menuWidth,
        window.innerWidth - menuWidth - padding,
      ),
    );

    const shouldOpenUp =
      renderedMenuAnchor.bottom + gap + menuHeight > window.innerHeight - padding;
    const top = shouldOpenUp
      ? Math.max(padding, renderedMenuAnchor.top - menuHeight - gap)
      : renderedMenuAnchor.bottom + gap;

    return { top, left };
  }, [renderedMenuSessionId, renderedMenuAnchor]);
  const menuShouldOpenSubmenuLeft = useMemo(() => {
    const padding = 8;
    const gap = 4;
    const menuWidth = 184;
    const submenuWidth = 192;
    return (
      menuPosition.left + menuWidth + gap + submenuWidth >
      window.innerWidth - padding
    );
  }, [menuPosition.left]);

  function resetCreateGroupForm() {
    setEditingGroupId("");
    setGroupName("");
    setGroupDesc("");
    setNameError("");
  }

  function openCreateGroup() {
    if (sessionActionsDisabled) return;
    setProjectMenuGroupId("");
    resetCreateGroupForm();
    setShowCreateGroup(true);
  }

  function openRenameGroup(group) {
    const safeGroupId = String(group?.id || "").trim();
    if (!safeGroupId || sessionActionsDisabled) return;
    closeProjectMenu();
    setEditingGroupId(safeGroupId);
    setGroupName(String(group?.name || "").trim());
    setGroupDesc(String(group?.description || "").trim());
    setNameError("");
    setShowCreateGroup(true);
  }

  function closeCreateGroup() {
    setShowCreateGroup(false);
    resetCreateGroupForm();
  }

  function clearMenuCloseTimer() {
    if (!menuCloseTimerRef.current) return;
    window.clearTimeout(menuCloseTimerRef.current);
    menuCloseTimerRef.current = 0;
  }

  function closeChatMenu() {
    if (menuSessionId && menuAnchor) {
      setClosingMenuState({
        sessionId: menuSessionId,
        moveMenuSessionId,
        anchor: menuAnchor,
      });
      clearMenuCloseTimer();
      menuCloseTimerRef.current = window.setTimeout(() => {
        setClosingMenuState(null);
        menuCloseTimerRef.current = 0;
      }, SIDEBAR_MENU_ANIMATION_MS);
    }
    setMenuSessionId("");
    setMoveMenuSessionId("");
    setMenuAnchor(null);
  }

  function closeProjectMenu() {
    setProjectMenuGroupId("");
  }

  function markSessionsExiting(sessionIds) {
    const valid = new Set(sessions.map((item) => item.id));
    const target = Array.from(
      new Set(
        (Array.isArray(sessionIds) ? sessionIds : [])
          .map((item) => String(item || "").trim())
          .filter((item) => item && valid.has(item)),
      ),
    );
    if (target.length === 0) return [];
    setExitingSessionIds((prev) => {
      const merged = new Set(prev);
      target.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
    return target;
  }

  function clearSessionTimer(mapRef, sessionId) {
    const timer = mapRef.current.get(sessionId);
    if (!timer) return;
    clearTimeout(timer);
    mapRef.current.delete(sessionId);
  }

  function triggerDeleteSession(sessionId) {
    if (sessionActionsDisabled) return;
    const sid = String(sessionId || "").trim();
    if (!sid || exitingSessionIdSet.has(sid)) return;
    const target = markSessionsExiting([sid]);
    if (target.length === 0) return;
    closeChatMenu();
    clearSessionTimer(exitTimersRef, sid);
    const timer = window.setTimeout(() => {
      exitTimersRef.current.delete(sid);
      onDeleteSession?.(sid);
    }, SIDEBAR_ROW_EXIT_MS);
    exitTimersRef.current.set(sid, timer);
  }

  function handleNewChatClick() {
    if (sessionActionsDisabled) return;
    expectInsertAnimationRef.current = true;
    onNewChat?.();
  }

  function toggleChatMenu(sessionId, triggerEl) {
    closeProjectMenu();
    if (menuSessionId === sessionId) {
      closeChatMenu();
      return;
    }

    clearMenuCloseTimer();
    setClosingMenuState(null);
    const rect = triggerEl.getBoundingClientRect();
    setMenuAnchor({
      top: rect.top,
      bottom: rect.bottom,
      right: rect.right,
    });
    setMenuSessionId(sessionId);
    setMoveMenuSessionId("");
  }

  function toggleProjectMenu(groupId) {
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId) return;
    closeChatMenu();
    setProjectMenuGroupId((current) =>
      current === safeGroupId ? "" : safeGroupId,
    );
  }

  function startRename(session) {
    setRenameSessionId(session.id);
    setRenameTitle(session.title || "");
    setRenameError("");
    setShowRenameModal(true);
    closeChatMenu();
  }

  function closeRenameModal() {
    setShowRenameModal(false);
    setRenameSessionId("");
    setRenameTitle("");
    setRenameError("");
  }

  function submitRename(e) {
    e.preventDefault();
    const trimmed = renameTitle.trim();
    if (!trimmed) {
      setRenameError("请输入聊天名称");
      return;
    }
    if (!renameSessionId) return;

    onRenameSession?.(renameSessionId, trimmed);
    closeRenameModal();
  }

  function moveToGroup(sessionId, groupId) {
    if (sessionActionsDisabled) return;
    onMoveSessionToGroup?.(sessionId, groupId || null);
    closeChatMenu();
  }

  function toggleBatchSelect(sessionId) {
    if (sessionActionsDisabled) return;
    setSelectedSessionIds((prev) => {
      if (prev.includes(sessionId))
        return prev.filter((id) => id !== sessionId);
      return [...prev, sessionId];
    });
  }

  function enterBatchMode(startSessionId) {
    if (sessionActionsDisabled) return;
    setBatchMode(true);
    setSelectedSessionIds([startSessionId]);
    setShowBatchMove(false);
    closeChatMenu();
  }

  function exitBatchMode() {
    setBatchMode(false);
    setSelectedSessionIds([]);
    setShowBatchMove(false);
  }

  function handleBatchDelete() {
    if (sessionActionsDisabled) return;
    if (!selectedSessionIdList.length) return;
    const targetIds = markSessionsExiting(selectedSessionIdList);
    if (targetIds.length === 0) {
      exitBatchMode();
      return;
    }
    if (batchDeleteTimerRef.current) {
      clearTimeout(batchDeleteTimerRef.current);
    }
    batchDeleteTimerRef.current = window.setTimeout(() => {
      batchDeleteTimerRef.current = 0;
      onBatchDeleteSessions?.(targetIds);
    }, SIDEBAR_ROW_EXIT_MS);
    exitBatchMode();
  }

  function handleBatchMove(groupId) {
    if (sessionActionsDisabled) return;
    if (!selectedSessionIdList.length) return;
    onBatchMoveSessionsToGroup?.(selectedSessionIdList, groupId || null);
    exitBatchMode();
  }

  useEffect(() => {
    if (!menuSessionId && !projectMenuGroupId) return;

    function onDocMouseDown(e) {
      const t = e.target;
      if (
        t.closest(".sidebar-row-menu") ||
        t.closest(".sidebar-item-menu-trigger") ||
        t.closest(".sidebar-project-menu") ||
        t.closest(".sidebar-project-menu-trigger")
      )
        return;
      closeChatMenu();
      closeProjectMenu();
    }

    function onDocKeyDown(e) {
      if (e.key === "Escape") {
        closeChatMenu();
        closeProjectMenu();
      }
    }

    function onWindowChanged() {
      closeChatMenu();
      closeProjectMenu();
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    window.addEventListener("resize", onWindowChanged);
    window.addEventListener("scroll", onWindowChanged, true);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
      window.removeEventListener("resize", onWindowChanged);
      window.removeEventListener("scroll", onWindowChanged, true);
    };
  }, [menuSessionId, projectMenuGroupId]);

  useEffect(() => {
    setCollapsedProjectIds((prev) => {
      const next = {};
      let changed = false;

      groups.forEach((group) => {
        const groupId = String(group?.id || "").trim();
        if (!groupId) return;
        const shouldExpand = groupId === activeGroupId;
        const previousValue = Object.prototype.hasOwnProperty.call(prev, groupId)
          ? !!prev[groupId]
          : !shouldExpand;
        const nextValue = shouldExpand ? false : previousValue;
        next[groupId] = nextValue;
        if (previousValue !== nextValue) changed = true;
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [activeGroupId, groups]);

  useEffect(() => {
    const previousIds = previousSessionIdsRef.current;
    const currentIds = sessions.map((item) => item.id);
    const currentIdSet = new Set(currentIds);
    const addedIds = currentIds.filter((id) => !previousIds.has(id));

    if (addedIds.length > 0 && expectInsertAnimationRef.current) {
      setEnteringSessionIds((prev) => {
        const merged = new Set(prev);
        addedIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      });
      addedIds.forEach((id) => {
        clearSessionTimer(enterTimersRef, id);
        const timer = window.setTimeout(() => {
          enterTimersRef.current.delete(id);
          setEnteringSessionIds((prev) => prev.filter((item) => item !== id));
        }, SIDEBAR_ROW_ENTER_MS);
        enterTimersRef.current.set(id, timer);
      });
    }
    if (addedIds.length > 0) {
      expectInsertAnimationRef.current = false;
    }

    setExitingSessionIds((prev) => prev.filter((id) => currentIdSet.has(id)));
    previousSessionIdsRef.current = currentIdSet;
  }, [sessions]);

  useEffect(
    () => () => {
      enterTimersRef.current.forEach((timer) => clearTimeout(timer));
      enterTimersRef.current.clear();
      exitTimersRef.current.forEach((timer) => clearTimeout(timer));
      exitTimersRef.current.clear();
      if (batchDeleteTimerRef.current) {
        clearTimeout(batchDeleteTimerRef.current);
        batchDeleteTimerRef.current = 0;
      }
      clearMenuCloseTimer();
    },
    [],
  );

  function renderSessionRow(session) {
    const isMenuOpen = menuSessionId === session.id;
    const isRenderedMenu =
      isMenuOpen || closingMenuState?.sessionId === session.id;
    const isChecked = selectedSessionIdSet.has(session.id);
    const isEntering = enteringSessionIdSet.has(session.id);
    const isExiting = exitingSessionIdSet.has(session.id);
    const rowClassName = `sidebar-chat-row${isEntering ? " entering" : ""}${
      isExiting ? " exiting" : ""
    }`;

    return (
      <div key={session.id} className={rowClassName}>
        {batchMode && (
          <button
            className={`sidebar-check ${isChecked ? "checked" : ""}`}
            type="button"
            aria-label={`${isChecked ? "取消" : "选择"}聊天 ${session.title}`}
            disabled={isExiting || sessionActionsDisabled}
            onClick={() => toggleBatchSelect(session.id)}
          >
            {isChecked ? "✓" : ""}
          </button>
        )}

        <button
          className={`sidebar-item ${session.id === activeId ? "active" : ""}`}
          onClick={() => {
            if (isExiting || sessionActionsDisabled) return;
            if (batchMode) {
              toggleBatchSelect(session.id);
              return;
            }
            onSelect(session.id);
          }}
          title={session.title}
          disabled={isExiting || sessionActionsDisabled}
        >
          <span className="sidebar-item-title">{session.title}</span>
          {session.pinned && <span className="sidebar-item-pin">置顶</span>}
        </button>

        {!batchMode && (
          <div className="sidebar-row-menu-wrap">
            <button
              className="sidebar-item-menu-trigger"
              type="button"
              aria-label={`聊天菜单 ${session.title}`}
              title="更多操作"
              disabled={isExiting || sessionActionsDisabled}
              onClick={(e) => toggleChatMenu(session.id, e.currentTarget)}
            >
              ⋯
            </button>

            {isRenderedMenu &&
              renderedMenuSession?.id === session.id &&
              createPortal(
                <div
                  className={`sidebar-row-menu${isMenuClosing ? " is-closing" : ""}`}
                  role="menu"
                  style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() => startRename(renderedMenuSession)}
                  >
                    <span className="sidebar-row-menu-icon" aria-hidden="true">
                      <Pencil size={18} />
                    </span>
                    <span>重命名</span>
                  </button>

                  <div
                    className="sidebar-row-menu-item-wrap"
                    onMouseEnter={() =>
                      setMoveMenuSessionId(renderedMenuSession.id)
                    }
                    onMouseLeave={() => setMoveMenuSessionId("")}
                    onFocusCapture={() =>
                      setMoveMenuSessionId(renderedMenuSession.id)
                    }
                    onBlurCapture={(e) => {
                      const nextFocused = e.relatedTarget;
                      if (
                        nextFocused instanceof Node &&
                        e.currentTarget.contains(nextFocused)
                      ) {
                        return;
                      }
                      setMoveMenuSessionId("");
                    }}
                  >
                    <button
                      className={`sidebar-row-menu-item${renderedMoveMenuSessionId === renderedMenuSession.id ? " is-open" : ""}`}
                      type="button"
                    >
                      <span className="sidebar-row-menu-icon" aria-hidden="true">
                        <Folder size={18} />
                      </span>
                      <span>移至项目</span>
                      <span
                        className="sidebar-row-menu-caret"
                        aria-hidden="true"
                      >
                        <ChevronRight size={18} />
                      </span>
                    </button>

                    {renderedMoveMenuSessionId === renderedMenuSession.id && (
                      <div
                        className={`sidebar-row-submenu${
                          menuShouldOpenSubmenuLeft ? " is-left" : ""
                        }`}
                      >
                        {groupMoveOptions.map((g) => (
                          <button
                            key={g.id || "ungrouped"}
                            className="sidebar-row-submenu-item"
                            type="button"
                            disabled={(renderedMenuSession.groupId || "") === g.id}
                            onClick={() =>
                              moveToGroup(renderedMenuSession.id, g.id)
                            }
                          >
                            <span
                              className="sidebar-row-submenu-icon"
                              aria-hidden="true"
                            >
                              <Folder size={18} />
                            </span>
                            <span>{g.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() => {
                      onToggleSessionPin?.(renderedMenuSession.id);
                      closeChatMenu();
                    }}
                  >
                    <span className="sidebar-row-menu-icon" aria-hidden="true">
                      <Pin size={18} />
                    </span>
                    <span>
                      {renderedMenuSession.pinned ? "取消置顶" : "置顶聊天"}
                    </span>
                  </button>

                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() => enterBatchMode(renderedMenuSession.id)}
                  >
                    <span className="sidebar-row-menu-icon" aria-hidden="true">
                      <CheckSquare size={18} />
                    </span>
                    <span>批量选择</span>
                  </button>

                  <div className="sidebar-row-menu-divider" />

                  <button
                    className="sidebar-row-menu-item danger"
                    type="button"
                    onClick={() => {
                      triggerDeleteSession(renderedMenuSession.id);
                    }}
                  >
                    <span className="sidebar-row-menu-icon" aria-hidden="true">
                      <Trash2 size={18} />
                    </span>
                    <span>删除</span>
                  </button>
                </div>,
                document.body,
              )}
          </div>
        )}
      </div>
    );
  }

  function toggleProjectCollapse(groupId) {
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId) return;
    setCollapsedProjectIds((prev) => ({
      ...prev,
      [safeGroupId]: !prev[safeGroupId],
    }));
  }

  function handleCreateGroupSubmit(e) {
    e.preventDefault();
    const name = groupName.trim();

    if (!name) {
      setNameError("请输入项目名称");
      return;
    }

    const payload = {
      name,
      description: groupDesc.trim(),
    };
    if (editingGroupId) {
      onRenameGroup?.(editingGroupId, payload);
    } else {
      onCreateGroup?.(payload);
    }

    closeCreateGroup();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand-mark">元</div>
          <div className="sidebar-brand-copy">
            <strong className="sidebar-brand-title">元协坊</strong>
            <span className="sidebar-brand-subtitle">对话与创作工作台</span>
          </div>
        </div>
        <div className="sidebar-actions sidebar-actions-primary">
          <button
            className="sidebar-new"
            onClick={handleNewChatClick}
            disabled={sessionActionsDisabled}
          >
            <MessageSquarePlus size={17} />
            <span>新聊天</span>
          </button>
        </div>
        <div className="sidebar-workbench">
          <div className="sidebar-section-label">工作台</div>
          <div className="sidebar-actions">
          <button
            className="sidebar-image-entry"
            onClick={() => onOpenImageGeneration?.()}
          >
            <ImagePlus size={17} />
            <span>图片生成</span>
          </button>
          <button
            className="sidebar-party-entry"
            onClick={() => onOpenGroupChat?.()}
          >
            <MessagesSquare size={17} />
            <span>派 · 协作</span>
          </button>
        </div>
        </div>

        {batchMode && (
          <div className="sidebar-batch-bar">
            <p className="sidebar-batch-count">
              已选择 {selectedSessionIdList.length} 项
            </p>
            <div className="sidebar-batch-actions">
              <button
                className="sidebar-batch-btn danger"
                type="button"
                disabled={!selectedSessionIdList.length || sessionActionsDisabled}
                onClick={handleBatchDelete}
              >
                删除所选
              </button>

              <button
                className="sidebar-batch-btn"
                type="button"
                disabled={!selectedSessionIdList.length || sessionActionsDisabled}
                onClick={() => setShowBatchMove((v) => !v)}
              >
                移动到项目
              </button>

              <button
                className="sidebar-batch-btn"
                type="button"
                onClick={exitBatchMode}
              >
                取消
              </button>
            </div>

            {showBatchMove && (
              <div className="sidebar-batch-move-list">
                {groupMoveOptions.map((g) => (
                  <button
                    key={g.id || "ungrouped-batch"}
                    className="sidebar-batch-move-item"
                    type="button"
                    onClick={() => handleBatchMove(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="sidebar-list"
        onScroll={() => {
          closeChatMenu();
          closeProjectMenu();
          setShowBatchMove(false);
        }}
      >
        <section className="sidebar-list-section">
          <div className="sidebar-section-head">
            <button
              className="sidebar-section-toggle"
              type="button"
              aria-expanded={!projectsSectionCollapsed}
              onClick={() =>
                setProjectsSectionCollapsed((current) => !current)
              }
            >
              <span className="sidebar-section-label">项目</span>
              <span className="sidebar-section-toggle-icon" aria-hidden="true">
                {projectsSectionCollapsed ? (
                  <ChevronRight size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
              </span>
            </button>
          </div>
          {!projectsSectionCollapsed && !batchMode && (
            <button
              className="sidebar-project-create"
              type="button"
              onClick={openCreateGroup}
              disabled={sessionActionsDisabled}
            >
              <FolderPlus size={17} />
              <span>新项目</span>
            </button>
          )}

          {!projectsSectionCollapsed &&
            grouped.groups.map((g) => {
              const isCollapsed = !!collapsedProjectIds[g.id];
              const isProjectActive = g.sessions.some(
                (session) => session.id === activeId,
              );

              return (
                <section key={g.id} className="sidebar-project">
                  <div className="sidebar-project-row">
                    <button
                      className={`sidebar-project-toggle ${isProjectActive ? "active" : ""}`}
                      type="button"
                      onClick={() => toggleProjectCollapse(g.id)}
                    >
                      <span className="sidebar-project-chevron" aria-hidden="true">
                        {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </span>
                      <span className="sidebar-project-icon" aria-hidden="true">
                        {isCollapsed ? <Folder size={17} /> : <FolderOpen size={17} />}
                      </span>
                      <span className="sidebar-project-name">{g.name}</span>
                      {g.sessions.length > 0 ? (
                        <span className="sidebar-project-count">{g.sessions.length}</span>
                      ) : null}
                    </button>

                    {!batchMode && (
                      <div className="sidebar-project-menu-wrap">
                        <button
                          className="sidebar-project-menu-trigger"
                          type="button"
                          aria-label={`项目菜单 ${g.name}`}
                          aria-expanded={projectMenuGroupId === g.id}
                          title="更多操作"
                          disabled={sessionActionsDisabled}
                          onClick={() => toggleProjectMenu(g.id)}
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {projectMenuGroupId === g.id ? (
                          <div className="sidebar-project-menu" role="menu">
                            <button
                              className="sidebar-row-menu-item"
                              type="button"
                              onClick={() => openRenameGroup(g)}
                            >
                              重命名项目
                            </button>
                            <button
                              className="sidebar-row-menu-item danger"
                              type="button"
                              onClick={() => {
                                closeProjectMenu();
                                onDeleteGroup?.(g.id);
                              }}
                            >
                              删除项目
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {!isCollapsed ? (
                    <div className="sidebar-project-session-list">
                      {g.description ? (
                        <p className="sidebar-group-desc" title={g.description}>
                          {g.description}
                        </p>
                      ) : null}
                      {g.sessions.length === 0 ? (
                        <p className="sidebar-empty-group">此项目暂无聊天</p>
                      ) : (
                        g.sessions.map((s) => renderSessionRow(s))
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
        </section>

        <section className="sidebar-list-section">
          <div className="sidebar-section-head">
            <button
              className="sidebar-section-toggle"
              type="button"
              aria-expanded={!recentSectionCollapsed}
              onClick={() =>
                setRecentSectionCollapsed((current) => !current)
              }
            >
              <span className="sidebar-section-label">最近</span>
              <span className="sidebar-section-toggle-icon" aria-hidden="true">
                {recentSectionCollapsed ? (
                  <ChevronRight size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
              </span>
            </button>
          </div>
          {!recentSectionCollapsed && (
            <section className="sidebar-group">
              <div className="sidebar-group-list">
                {grouped.ungrouped.length > 0 ? (
                  grouped.ungrouped.map((s) => renderSessionRow(s))
                ) : (
                  <p className="sidebar-empty-group">暂无最近对话</p>
                )}
              </div>
            </section>
          )}
        </section>
      </div>

      <div className="sidebar-bottom">
        <button
          className="sidebar-user-info-trigger"
          type="button"
          onClick={() => onOpenUserInfoModal?.()}
        >
          <Settings size={16} strokeWidth={2} />
          <span>用户信息</span>
          <span
            className={`sidebar-user-info-status ${hasUserInfo ? "filled" : ""}`}
          >
            {hasUserInfo ? "已填写" : "未填写"}
          </span>
        </button>
      </div>

      {showCreateGroup && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeCreateGroup}
        >
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingGroupId ? "重命名项目" : "新建项目"}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="group-modal-title">
              {editingGroupId ? "重命名项目" : "新建项目"}
            </h3>
            <form
              onSubmit={handleCreateGroupSubmit}
              className="group-modal-form"
            >
              <label className="group-modal-label" htmlFor="group-name-input">
                项目名称
              </label>
              <input
                id="group-name-input"
                className="group-modal-input"
                value={groupName}
                onChange={(e) => {
                  setGroupName(e.target.value);
                  if (nameError) setNameError("");
                }}
                maxLength={30}
                placeholder="例如：数学实验"
              />
              {nameError && <p className="group-modal-error">{nameError}</p>}

              <label className="group-modal-label" htmlFor="group-desc-input">
                项目介绍
              </label>
              <textarea
                id="group-desc-input"
                className="group-modal-textarea"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                maxLength={120}
                rows={3}
                placeholder="可选：输入这个项目的用途说明"
              />

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeCreateGroup}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="group-modal-btn group-modal-btn-primary"
                >
                  {editingGroupId ? "保存" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeRenameModal}
        >
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="重命名聊天"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="group-modal-title">重命名聊天</h3>
            <form onSubmit={submitRename} className="group-modal-form">
              <label
                className="group-modal-label"
                htmlFor="rename-session-input"
              >
                聊天名称
              </label>
              <input
                id="rename-session-input"
                className="group-modal-input"
                value={renameTitle}
                onChange={(e) => {
                  setRenameTitle(e.target.value);
                  if (renameError) setRenameError("");
                }}
                maxLength={60}
                autoFocus
              />
              {renameError && (
                <p className="group-modal-error">{renameError}</p>
              )}

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeRenameModal}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="group-modal-btn group-modal-btn-primary"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}

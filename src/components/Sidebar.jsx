import { Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function Sidebar({
  sessions,
  groups,
  activeId,
  onSelect,
  onNewChat,
  onOpenImageGeneration,
  onDeleteSession,
  onBatchDeleteSessions,
  onMoveSessionToGroup,
  onBatchMoveSessionsToGroup,
  onRenameSession,
  onToggleSessionPin,
  onCreateGroup,
  onDeleteGroup,
  hasUserInfo = false,
  onOpenUserInfoModal,
}) {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
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

  const [batchMode, setBatchMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [showBatchMove, setShowBatchMove] = useState(false);

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
        sessions: [...g.sessions].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
      })),
      ungrouped: [...ungrouped].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    };
  }, [groups, sessions]);

  const groupMoveOptions = useMemo(
    () => [{ id: "", name: "未分组" }, ...groups.map((g) => ({ id: g.id, name: g.name }))],
    [groups],
  );

  const currentMenuSession = useMemo(
    () => sessions.find((s) => s.id === menuSessionId) || null,
    [sessions, menuSessionId],
  );
  const selectedSessionIdSet = useMemo(() => {
    const valid = new Set(sessions.map((s) => s.id));
    return new Set(selectedSessionIds.filter((id) => valid.has(id)));
  }, [sessions, selectedSessionIds]);
  const selectedSessionIdList = useMemo(
    () => Array.from(selectedSessionIdSet),
    [selectedSessionIdSet],
  );
  const menuPosition = useMemo(() => {
    if (!menuSessionId || !menuAnchor) {
      return { top: 0, left: 0 };
    }

    const padding = 8;
    const gap = 6;
    const menuWidth = moveMenuSessionId === menuSessionId ? 220 : 190;
    const menuHeight = moveMenuSessionId === menuSessionId ? 320 : 210;

    const left = Math.max(
      padding,
      Math.min(menuAnchor.right - menuWidth, window.innerWidth - menuWidth - padding),
    );

    const shouldOpenUp = menuAnchor.bottom + gap + menuHeight > window.innerHeight - padding;
    const top = shouldOpenUp
      ? Math.max(padding, menuAnchor.top - menuHeight - gap)
      : menuAnchor.bottom + gap;

    return { top, left };
  }, [menuSessionId, menuAnchor, moveMenuSessionId]);

  function resetCreateGroupForm() {
    setGroupName("");
    setGroupDesc("");
    setNameError("");
  }

  function openCreateGroup() {
    resetCreateGroupForm();
    setShowCreateGroup(true);
  }

  function closeCreateGroup() {
    setShowCreateGroup(false);
    resetCreateGroupForm();
  }

  function closeChatMenu() {
    setMenuSessionId("");
    setMoveMenuSessionId("");
    setMenuAnchor(null);
  }

  function toggleChatMenu(sessionId, triggerEl) {
    if (menuSessionId === sessionId) {
      closeChatMenu();
      return;
    }

    const rect = triggerEl.getBoundingClientRect();
    setMenuAnchor({
      top: rect.top,
      bottom: rect.bottom,
      right: rect.right,
    });
    setMenuSessionId(sessionId);
    setMoveMenuSessionId("");
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
    onMoveSessionToGroup?.(sessionId, groupId || null);
    closeChatMenu();
  }

  function toggleBatchSelect(sessionId) {
    setSelectedSessionIds((prev) => {
      if (prev.includes(sessionId)) return prev.filter((id) => id !== sessionId);
      return [...prev, sessionId];
    });
  }

  function enterBatchMode(startSessionId) {
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
    if (!selectedSessionIdList.length) return;
    onBatchDeleteSessions?.(selectedSessionIdList);
    exitBatchMode();
  }

  function handleBatchMove(groupId) {
    if (!selectedSessionIdList.length) return;
    onBatchMoveSessionsToGroup?.(selectedSessionIdList, groupId || null);
    exitBatchMode();
  }


  useEffect(() => {
    if (!menuSessionId) return;

    function onDocMouseDown(e) {
      const t = e.target;
      if (t.closest(".sidebar-row-menu") || t.closest(".sidebar-item-menu-trigger")) return;
      closeChatMenu();
    }

    function onDocKeyDown(e) {
      if (e.key === "Escape") closeChatMenu();
    }

    function onWindowChanged() {
      closeChatMenu();
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
  }, [menuSessionId]);

  function renderSessionRow(session) {
    const isMenuOpen = menuSessionId === session.id;
    const isChecked = selectedSessionIdSet.has(session.id);

    return (
      <div key={session.id} className="sidebar-chat-row">
        {batchMode && (
          <button
            className={`sidebar-check ${isChecked ? "checked" : ""}`}
            type="button"
            aria-label={`${isChecked ? "取消" : "选择"}聊天 ${session.title}`}
            onClick={() => toggleBatchSelect(session.id)}
          >
            {isChecked ? "✓" : ""}
          </button>
        )}

        <button
          className={`sidebar-item ${session.id === activeId ? "active" : ""}`}
          onClick={() => {
            if (batchMode) {
              toggleBatchSelect(session.id);
              return;
            }
            onSelect(session.id);
          }}
          title={session.title}
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
              onClick={(e) => toggleChatMenu(session.id, e.currentTarget)}
            >
              ⋯
            </button>

            {isMenuOpen &&
              currentMenuSession &&
              createPortal(
                <div
                  className="sidebar-row-menu"
                  role="menu"
                  style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                  <button
                    className="sidebar-row-menu-item danger"
                    type="button"
                    onClick={() => {
                      onDeleteSession?.(currentMenuSession.id);
                      closeChatMenu();
                    }}
                  >
                    删除
                  </button>

                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() =>
                      setMoveMenuSessionId((id) =>
                        id === currentMenuSession.id ? "" : currentMenuSession.id,
                      )
                    }
                  >
                    把聊天移动到某个组
                  </button>

                  {moveMenuSessionId === currentMenuSession.id && (
                    <div className="sidebar-row-submenu">
                      {groupMoveOptions.map((g) => (
                        <button
                          key={g.id || "ungrouped"}
                          className="sidebar-row-submenu-item"
                          type="button"
                          disabled={(currentMenuSession.groupId || "") === g.id}
                          onClick={() => moveToGroup(currentMenuSession.id, g.id)}
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() => startRename(currentMenuSession)}
                  >
                    重命名
                  </button>

                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() => {
                      onToggleSessionPin?.(currentMenuSession.id);
                      closeChatMenu();
                    }}
                  >
                    {currentMenuSession.pinned ? "取消置顶" : "置顶"}
                  </button>

                  <button
                    className="sidebar-row-menu-item"
                    type="button"
                    onClick={() => enterBatchMode(currentMenuSession.id)}
                  >
                    批量选择
                  </button>
                </div>,
                document.body,
              )}
          </div>
        )}
      </div>
    );
  }

  function handleCreateGroupSubmit(e) {
    e.preventDefault();
    const name = groupName.trim();

    if (!name) {
      setNameError("请输入分组名称");
      return;
    }

    onCreateGroup?.({
      name,
      description: groupDesc.trim(),
    });

    closeCreateGroup();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-actions">
          <button className="sidebar-new" onClick={() => onNewChat()}>
            + 新聊天
          </button>
          <button
            className="sidebar-image-beta"
            onClick={() => onOpenImageGeneration?.()}
          >
            图片生成（BETA）
          </button>
          <button className="sidebar-create-group" onClick={openCreateGroup}>
            + 新建分组
          </button>
        </div>

        {batchMode && (
          <div className="sidebar-batch-bar">
            <p className="sidebar-batch-count">已选择 {selectedSessionIdList.length} 项</p>
            <div className="sidebar-batch-actions">
              <button
                className="sidebar-batch-btn danger"
                type="button"
                disabled={!selectedSessionIdList.length}
                onClick={handleBatchDelete}
              >
                删除所选
              </button>

              <button
                className="sidebar-batch-btn"
                type="button"
                disabled={!selectedSessionIdList.length}
                onClick={() => setShowBatchMove((v) => !v)}
              >
                移动到组
              </button>

              <button className="sidebar-batch-btn" type="button" onClick={exitBatchMode}>
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
          setShowBatchMove(false);
        }}
      >
        {grouped.ungrouped.length > 0 && (
          <section className="sidebar-group">
            <div className="sidebar-group-head">
              <div className="sidebar-group-title-wrap">
                <p className="sidebar-group-name">未分组</p>
              </div>
            </div>

            <div className="sidebar-group-list">{grouped.ungrouped.map((s) => renderSessionRow(s))}</div>
          </section>
        )}

        {grouped.groups.map((g) => (
          <section key={g.id} className="sidebar-group">
            <div className="sidebar-group-head">
              <div className="sidebar-group-title-wrap">
                <p className="sidebar-group-name">{g.name}</p>
                {g.description && (
                  <p className="sidebar-group-desc" title={g.description}>
                    {g.description}
                  </p>
                )}
              </div>

              {!batchMode && (
                <button
                  className="sidebar-group-delete"
                  type="button"
                  onClick={() => onDeleteGroup?.(g.id)}
                >
                  删除组
                </button>
              )}
            </div>

            <div className="sidebar-group-list">
              {g.sessions.length === 0 && <p className="sidebar-empty-group">此分组暂无聊天</p>}

              {g.sessions.map((s) => renderSessionRow(s))}
            </div>
          </section>
        ))}
      </div>

      <div className="sidebar-bottom">
        <button
          className="sidebar-user-info-trigger"
          type="button"
          onClick={() => onOpenUserInfoModal?.()}
        >
          <Settings size={16} strokeWidth={2} />
          <span>用户信息</span>
          <span className={`sidebar-user-info-status ${hasUserInfo ? "filled" : ""}`}>
            {hasUserInfo ? "已填写" : "未填写"}
          </span>
        </button>
      </div>

      {showCreateGroup && (
        <div className="modal-overlay" role="presentation" onClick={closeCreateGroup}>
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="创建分组"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="group-modal-title">创建分组</h3>
            <form onSubmit={handleCreateGroupSubmit} className="group-modal-form">
              <label className="group-modal-label" htmlFor="group-name-input">
                分组名称
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
                分组介绍
              </label>
              <textarea
                id="group-desc-input"
                className="group-modal-textarea"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                maxLength={120}
                rows={3}
                placeholder="可选：输入这个分组的用途说明"
              />

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeCreateGroup}
                >
                  取消
                </button>
                <button type="submit" className="group-modal-btn group-modal-btn-primary">
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="modal-overlay" role="presentation" onClick={closeRenameModal}>
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="重命名聊天"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="group-modal-title">重命名聊天</h3>
            <form onSubmit={submitRename} className="group-modal-form">
              <label className="group-modal-label" htmlFor="rename-session-input">
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
              {renameError && <p className="group-modal-error">{renameError}</p>}

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeRenameModal}
                >
                  取消
                </button>
                <button type="submit" className="group-modal-btn group-modal-btn-primary">
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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSearch,
  PauseCircle,
  RefreshCw,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  deleteCollaborationMemory,
  fetchCollaborationMemoryEvidence,
  fetchCollaborationRoomMemories,
  updateCollaborationMemory,
} from "../services/collaborationMemoryApi.js";

const SUBJECT_FILTERS = Object.freeze([
  { key: "all", label: "全部" },
  { key: "student", label: "学生" },
  { key: "pair", label: "搭档" },
  { key: "project", label: "作品" },
  { key: "agent", label: "琳琳" },
  { key: "course", label: "课程" },
]);

const SUBJECT_LABELS = Object.freeze({
  student: "学生判断",
  pair: "搭档协作",
  project: "作品记录",
  agent: "琳琳经验",
  course: "课程进展",
});

const MEMORY_TYPE_LABELS = Object.freeze({
  course_progress: "课程进展",
  project_snapshot: "作品快照",
  collaboration_pattern: "协作表现",
  learning_activity: "学习活动",
  knowledge_evidence: "知识证据",
  ability_judgment: "能力判断",
  agent_outcome: "干预结果",
});

const EVENT_LABELS = Object.freeze({
  chat_message: "群聊发言",
  code_edit: "代码修改",
  preview: "刷新预览",
  diagnostic_error: "诊断问题",
  task_switch: "发布新任务",
  task_stage_change: "任务阶段变化",
  role_rotation: "角色交接",
  paia_intervention: "琳琳提醒",
  paia_feedback: "学生纠正",
});

const USE_TYPE_LABELS = Object.freeze({
  student_reply: "学生 @AI 回答",
  group_intervention: "群聊主动提醒",
});

const OUTCOME_LABELS = Object.freeze({
  pending: "等待后续行为",
  observed: "已观察到后续行为",
  helpful: "学生确认贴合",
  partial: "部分贴合",
  unsuitable: "不适合当时情境",
});

function displayTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function confidenceText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "暂无";
}

function defaultDraft(memory) {
  return {
    summary: String(memory?.summary || ""),
    validationStatus: String(memory?.validationStatus || "system_observed"),
    validationNote: String(memory?.validationNote || ""),
    retrievalEnabled: memory?.retrievalEnabled !== false,
    allowedUseTypes: Array.isArray(memory?.allowedUseTypes)
      ? memory.allowedUseTypes
      : ["student_reply"],
    publicDisclosure: String(memory?.publicDisclosure || "action_only"),
  };
}

function readEventDetail(event) {
  const metadata = event?.metadata || {};
  if (metadata.content) return metadata.content;
  if (metadata.taskText) return metadata.taskText;
  if (metadata.evidenceSummary) return metadata.evidenceSummary;
  if (event?.eventType === "code_edit") {
    const documents = Array.isArray(metadata.documents) ? metadata.documents.join("、") : "代码";
    return `${documents || "代码"}，修改约 ${Number(metadata.changedCharacters || 0)} 个字符，版本 ${Number(metadata.revision || 0)}`;
  }
  if (event?.eventType === "preview") return "学生刷新并检查了当前网页预览。";
  if (event?.eventType === "role_rotation") return "两名学生进行了 Driver/Navigator 角色交接。";
  if (metadata.feedback) return `${metadata.feedback}${metadata.note ? `：${metadata.note}` : ""}`;
  return "已记录该过程事件。";
}

function memoryOwnerLabel(memory, room) {
  if (memory?.subjectType !== "student") return SUBJECT_LABELS[memory?.subjectType] || "学习记忆";
  const member = (Array.isArray(room?.members) ? room.members : []).find(
    (item) => String(item?.id || "") === String(memory?.subjectId || ""),
  );
  return member?.name ? `学生 · ${member.name}` : "学生判断";
}

function MemoryEvidence({ evidence }) {
  if (!evidence) return null;
  const events = Array.isArray(evidence.events) ? evidence.events : [];
  const snapshots = Array.isArray(evidence.snapshots) ? evidence.snapshots : [];
  return (
    <div className="teacher-memory-evidence">
      <div className="teacher-memory-evidence-head">
        <strong>判断依据</strong>
        <span>{`${events.length} 条过程事件 · ${snapshots.length} 个代码版本`}</span>
      </div>
      {events.length === 0 ? (
        <p>这条记忆尚未保留可展开的原始事件，仍可查看其历史摘要。</p>
      ) : (
        <div className="teacher-memory-event-list">
          {events.slice(0, 40).map((event) => (
            <article key={event.id}>
              <div>
                <strong>{EVENT_LABELS[event.eventType] || event.eventType}</strong>
                <span>{`${event.userName || "系统"} · ${displayTime(event.occurredAt)}`}</span>
              </div>
              <p>{readEventDetail(event)}</p>
            </article>
          ))}
        </div>
      )}
      {snapshots.map((snapshot) => (
        <details key={`snapshot-${snapshot.revision}`} className="teacher-memory-code-snapshot">
          <summary>{`代码版本 ${snapshot.revision} · ${snapshot.savedByName || "成员"} · ${displayTime(snapshot.createdAt)}`}</summary>
          <div>
            <section>
              <strong>HTML</strong>
              <pre>{snapshot.html || "（空）"}</pre>
            </section>
            <section>
              <strong>CSS</strong>
              <pre>{snapshot.css || "（空）"}</pre>
            </section>
          </div>
        </details>
      ))}
    </div>
  );
}

export default function TeacherRoomMemoryDialog({
  adminToken,
  room,
  onClose,
  onAuthError,
}) {
  const roomId = String(room?.id || "").trim();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedMemoryId, setExpandedMemoryId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [savingMemoryId, setSavingMemoryId] = useState("");
  const [evidenceByMemoryId, setEvidenceByMemoryId] = useState({});
  const [evidenceLoadingId, setEvidenceLoadingId] = useState("");

  const loadMemories = useCallback(async () => {
    if (!adminToken || !roomId) return;
    setLoading(true);
    setError("");
    try {
      const nextData = await fetchCollaborationRoomMemories(adminToken, roomId);
      setData(nextData);
      setDrafts({});
    } catch (rawError) {
      if (rawError?.status === 401 || rawError?.status === 403) {
        onAuthError?.(rawError);
      }
      setError(rawError?.message || "读取记忆档案失败。");
    } finally {
      setLoading(false);
    }
  }, [adminToken, onAuthError, roomId]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const memories = useMemo(() => {
    const items = Array.isArray(data?.memories) ? data.memories : [];
    return activeFilter === "all"
      ? items
      : items.filter((item) => item?.subjectType === activeFilter);
  }, [activeFilter, data?.memories]);

  const memoryCounts = useMemo(() => {
    const items = Array.isArray(data?.memories) ? data.memories : [];
    return {
      total: items.length,
      pending: items.filter((item) => item?.validationStatus === "system_observed").length,
      confirmed: items.filter((item) => item?.validationStatus === "human_confirmed").length,
      paused: items.filter((item) => item?.retrievalEnabled === false).length,
    };
  }, [data?.memories]);

  function updateDraft(memory, patch) {
    setDrafts((current) => ({
      ...current,
      [memory.id]: {
        ...(current[memory.id] || defaultDraft(memory)),
        ...patch,
      },
    }));
  }

  async function saveMemory(memory) {
    const draft = drafts[memory.id] || defaultDraft(memory);
    setSavingMemoryId(memory.id);
    setError("");
    try {
      await updateCollaborationMemory(adminToken, roomId, memory.id, draft);
      await loadMemories();
      setExpandedMemoryId(memory.id);
    } catch (rawError) {
      if (rawError?.status === 401 || rawError?.status === 403) onAuthError?.(rawError);
      setError(rawError?.message || "保存记忆判断失败。");
    } finally {
      setSavingMemoryId("");
    }
  }

  async function loadEvidence(memoryId) {
    if (evidenceByMemoryId[memoryId]) return;
    setEvidenceLoadingId(memoryId);
    setError("");
    try {
      const evidence = await fetchCollaborationMemoryEvidence(adminToken, roomId, memoryId);
      setEvidenceByMemoryId((current) => ({ ...current, [memoryId]: evidence }));
    } catch (rawError) {
      if (rawError?.status === 401 || rawError?.status === 403) onAuthError?.(rawError);
      setError(rawError?.message || "读取判断依据失败。");
    } finally {
      setEvidenceLoadingId("");
    }
  }

  async function removeMemory(memory) {
    const confirmed = window.confirm("确定删除这条活动记忆吗？历史使用记录会保留用于审计。 ");
    if (!confirmed) return;
    setSavingMemoryId(memory.id);
    setError("");
    try {
      await deleteCollaborationMemory(adminToken, roomId, memory.id);
      setExpandedMemoryId("");
      await loadMemories();
    } catch (rawError) {
      if (rawError?.status === 401 || rawError?.status === 403) onAuthError?.(rawError);
      setError(rawError?.message || "删除记忆失败。");
    } finally {
      setSavingMemoryId("");
    }
  }

  const resolvedRoom = data?.room || room || {};
  const uses = Array.isArray(data?.uses) ? data.uses : [];
  const compilation = data?.compilation || {};

  return (
    <div className="teacher-memory-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="teacher-memory-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-memory-title">
        <header className="teacher-memory-dialog-head">
          <div>
            <span className="teacher-memory-eyebrow">房间长期记忆</span>
            <h2 id="teacher-memory-title">{resolvedRoom.name || "协作小教室"}</h2>
            <p>{resolvedRoom.announcement || "教师尚未发布当前课堂任务。"}</p>
          </div>
          <div className="teacher-memory-head-actions">
            <button type="button" className="teacher-ghost-btn" onClick={() => void loadMemories()} disabled={loading}>
              <RefreshCw size={14} className={loading ? "is-spinning" : ""} />
              刷新
            </button>
            <button type="button" className="teacher-memory-close" onClick={onClose} aria-label="关闭记忆档案">
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="teacher-memory-members">
          <Users size={15} />
          {(Array.isArray(resolvedRoom.members) ? resolvedRoom.members : []).map((member) => (
            <span key={member.id}>{member.name || member.username || "学生"}</span>
          ))}
        </div>

        <div className="teacher-memory-overview">
          <article><strong>{memoryCounts.total}</strong><span>活动记忆</span></article>
          <article><strong>{memoryCounts.pending}</strong><span>待教师确认</span></article>
          <article><strong>{memoryCounts.confirmed}</strong><span>教师已确认</span></article>
          <article><strong>{uses.length}</strong><span>近期使用记录</span></article>
          <article><strong>{memoryCounts.paused}</strong><span>暂停检索</span></article>
        </div>

        <div className="teacher-memory-compiler-status">
          <div>
            <strong>凌晨记忆编译</strong>
            <span>{compilation.lastCompiledAt ? `最近完成：${displayTime(compilation.lastCompiledAt)}` : "尚未完成首次编译"}</span>
          </div>
          <span>{`最近生成 ${Number(compilation.lastCandidateCount || 0)} 条候选，待整合 ${Number(compilation.pendingCandidateCount || 0)} 条`}</span>
          {compilation.lastError ? <p>{compilation.lastError}</p> : null}
        </div>

        <nav className="teacher-memory-filters" aria-label="记忆类型筛选">
          {SUBJECT_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={activeFilter === filter.key ? "is-active" : ""}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </nav>

        {error ? <p className="teacher-memory-error">{error}</p> : null}

        <div className="teacher-memory-content">
          {loading ? (
            <p className="teacher-memory-empty">正在读取这间房的记忆档案……</p>
          ) : memories.length === 0 ? (
            <p className="teacher-memory-empty">当前筛选下还没有活动记忆。凌晨编译完成后会在这里出现。</p>
          ) : (
            <div className="teacher-memory-list">
              {memories.map((memory) => {
                const expanded = expandedMemoryId === memory.id;
                const draft = drafts[memory.id] || defaultDraft(memory);
                const relatedUses = uses.filter((item) => item.memoryId === memory.id);
                const saving = savingMemoryId === memory.id;
                return (
                  <article key={memory.id} className={`teacher-memory-card${memory.retrievalEnabled === false ? " is-paused" : ""}`}>
                    <header>
                      <div>
                        <span>{memoryOwnerLabel(memory, resolvedRoom)}</span>
                        <strong>{MEMORY_TYPE_LABELS[memory.memoryType] || memory.memoryType}</strong>
                        {memory.conceptKey ? <small>{memory.conceptKey}</small> : null}
                      </div>
                      <div className="teacher-memory-state">
                        {memory.validationStatus === "human_confirmed" ? <CheckCircle2 size={15} /> : memory.retrievalEnabled === false ? <PauseCircle size={15} /> : <Bot size={15} />}
                        <span>{memory.validationStatus === "human_confirmed" ? "教师已确认" : memory.validationStatus === "human_rejected" ? "教师已驳回" : memory.retrievalEnabled === false ? "已暂停" : "系统观察"}</span>
                      </div>
                    </header>
                    <p className="teacher-memory-summary">{memory.summary}</p>
                    <div className="teacher-memory-meta">
                      <span>{`证据 ${Number(memory.evidenceCount || 0)} 条`}</span>
                      <span>{`置信度 ${confidenceText(memory.confidence)}`}</span>
                      <span>{`Agent 使用 ${Number(memory.useCount || 0)} 次`}</span>
                      <span>{`更新 ${displayTime(memory.lastBoundaryAt)}`}</span>
                    </div>
                    <div className="teacher-memory-card-actions">
                      <button type="button" className="teacher-ghost-btn" onClick={() => void loadEvidence(memory.id)} disabled={evidenceLoadingId === memory.id}>
                        <FileSearch size={14} />
                        {evidenceLoadingId === memory.id ? "读取中..." : "查看判断依据"}
                      </button>
                      <button type="button" className="teacher-ghost-btn" onClick={() => {
                        setExpandedMemoryId(expanded ? "" : memory.id);
                        if (!expanded) updateDraft(memory, {});
                      }}>
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expanded ? "收起审核" : "审核与控制"}
                      </button>
                    </div>

                    <MemoryEvidence evidence={evidenceByMemoryId[memory.id]} />

                    {expanded ? (
                      <div className="teacher-memory-review">
                        <label>
                          <span>教师确认后的判断</span>
                          <textarea value={draft.summary} rows={3} maxLength={1200} onChange={(event) => updateDraft(memory, { summary: event.target.value })} />
                        </label>
                        <div className="teacher-memory-review-grid">
                          <label>
                            <span>审核状态</span>
                            <select value={draft.validationStatus} onChange={(event) => updateDraft(memory, { validationStatus: event.target.value })}>
                              <option value="system_observed">系统观察</option>
                              <option value="human_confirmed">教师确认</option>
                              <option value="human_rejected">教师驳回</option>
                            </select>
                          </label>
                          <label>
                            <span>群聊公开表达</span>
                            <select value={draft.publicDisclosure} onChange={(event) => updateDraft(memory, { publicDisclosure: event.target.value })}>
                              <option value="action_only">只转化为行动建议</option>
                              <option value="summary_allowed">允许概括判断</option>
                            </select>
                          </label>
                        </div>
                        <label>
                          <span>教师审核说明</span>
                          <textarea value={draft.validationNote} rows={2} maxLength={500} placeholder="例如：已回看最近两个作品，判断基本符合。" onChange={(event) => updateDraft(memory, { validationNote: event.target.value })} />
                        </label>
                        <div className="teacher-memory-use-controls">
                          <label>
                            <input type="checkbox" checked={draft.retrievalEnabled} onChange={(event) => updateDraft(memory, { retrievalEnabled: event.target.checked })} />
                            允许 Agent 检索
                          </label>
                          <label>
                            <input type="checkbox" checked={draft.allowedUseTypes.includes("student_reply")} onChange={(event) => updateDraft(memory, {
                              allowedUseTypes: event.target.checked
                                ? Array.from(new Set([...draft.allowedUseTypes, "student_reply"]))
                                : draft.allowedUseTypes.filter((item) => item !== "student_reply"),
                            })} />
                            可用于学生 @AI 回答
                          </label>
                          <label>
                            <input type="checkbox" checked={draft.allowedUseTypes.includes("group_intervention")} onChange={(event) => updateDraft(memory, {
                              allowedUseTypes: event.target.checked
                                ? Array.from(new Set([...draft.allowedUseTypes, "group_intervention"]))
                                : draft.allowedUseTypes.filter((item) => item !== "group_intervention"),
                            })} />
                            可用于群聊主动提醒
                          </label>
                        </div>
                        {relatedUses.length ? (
                          <div className="teacher-memory-related-uses">
                            <strong>最近使用</strong>
                            {relatedUses.slice(0, 5).map((use) => (
                              <span key={use.id}>{`${displayTime(use.usedAt)} · ${USE_TYPE_LABELS[use.useType] || use.useType} · ${OUTCOME_LABELS[use.outcomeStatus] || use.outcomeStatus}`}</span>
                            ))}
                          </div>
                        ) : null}
                        <div className="teacher-memory-review-actions">
                          <button type="button" className="teacher-danger-ghost-btn" onClick={() => void removeMemory(memory)} disabled={saving}>
                            <Trash2 size={14} />删除记忆
                          </button>
                          <button type="button" className="teacher-primary-btn" onClick={() => void saveMemory(memory)} disabled={saving || !draft.summary.trim()}>
                            <Save size={14} />{saving ? "保存中..." : "保存审核"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          <details className="teacher-memory-usage-ledger">
            <summary>{`Agent 逐次使用记录（${uses.length}）`}</summary>
            {uses.length === 0 ? (
              <p>尚未有活动记忆参与 Agent 回答或主动提醒。</p>
            ) : (
              <div>
                {uses.map((use) => (
                  <article key={use.id}>
                    <strong>{USE_TYPE_LABELS[use.useType] || use.useType}</strong>
                    <span>{displayTime(use.usedAt)}</span>
                    <p>{use.retrievalReason || "根据当前房间和任务上下文检索。"}</p>
                    <small>{`${OUTCOME_LABELS[use.outcomeStatus] || use.outcomeStatus} · 后续事件 ${Number(use.outcomeEventIds?.length || 0)} 条`}</small>
                  </article>
                ))}
              </div>
            )}
          </details>
        </div>
      </section>
    </div>
  );
}

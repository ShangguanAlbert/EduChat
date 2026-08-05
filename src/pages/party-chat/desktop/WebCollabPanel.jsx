import { Download, Eye, RefreshCcw, Repeat2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css as cssLanguage } from "@codemirror/lang-css";
import { html as htmlLanguage } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { yCollab } from "y-codemirror.next";
import {
  recordPartyWebPreview,
  submitPartyPaiaFeedback,
  updatePartyCodingSession,
} from "../../party/partyApi.js";
import {
  analyzeWebCode,
  buildDownloadDocument,
  buildSafePreviewDocument,
} from "../../party/webCode.js";

const REMOTE_DOCUMENT_ORIGIN = { type: "party-web-remote-document" };
const REMOTE_AWARENESS_ORIGIN = { type: "party-web-remote-awareness" };
const TASK_STAGE_OPTIONS = [
  { value: "understand", label: "理解任务" },
  { value: "plan", label: "设计方案" },
  { value: "build", label: "编写网页" },
  { value: "debug", label: "调试改进" },
  { value: "reflect", label: "总结反思" },
];
const FEEDBACK_OPTIONS = [
  { value: "correct", label: "判断正确" },
  { value: "partial", label: "部分正确" },
  { value: "incorrect", label: "不正确" },
];
const COLLABORATOR_COLORS = [
  { color: "#3a8dde", colorLight: "#3a8dde33" },
  { color: "#d76a4d", colorLight: "#d76a4d33" },
  { color: "#5f9d65", colorLight: "#5f9d6533" },
  { color: "#9a6fd4", colorLight: "#9a6fd433" },
];

function getEditorInitial(name) {
  return Array.from(String(name || "成员").trim())[0] || "成";
}

function getCollaboratorColor(userId) {
  const source = String(userId || "member");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function decodeBase64(value) {
  try {
    const binary = window.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function resolveMemberName(members, userId, fallback) {
  return members.find((member) => String(member?.id || "") === String(userId || ""))?.name || fallback;
}

export default function WebCollabPanel({
  roomId,
  me,
  members = [],
  taskText = "",
  codingEditors = [],
  onEditingChange,
  onJoinCollaboration,
  onLeaveCollaboration,
  onCollaborationUpdate,
  onCollaborationAwareness,
  subscribeToCollaboration,
}) {
  const [activeDocument, setActiveDocument] = useState("html");
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState(null);
  const [previewDocument, setPreviewDocument] = useState("");
  const [diagnostics, setDiagnostics] = useState([]);
  const [latestIntervention, setLatestIntervention] = useState(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const editingRef = useRef(false);
  const sessionRef = useRef(null);
  const callbacksRef = useRef({});

  useEffect(() => {
    callbacksRef.current = {
      onEditingChange,
      onJoinCollaboration,
      onLeaveCollaboration,
      onCollaborationUpdate,
      onCollaborationAwareness,
      subscribeToCollaboration,
    };
  }, [onCollaborationAwareness, onCollaborationUpdate, onEditingChange, onJoinCollaboration, onLeaveCollaboration, subscribeToCollaboration]);

  const setEditingPresence = useCallback((active) => {
    if (editingRef.current === active) return;
    editingRef.current = active;
    callbacksRef.current.onEditingChange?.(roomId, active);
  }, [roomId]);

  useEffect(() => {
    const doc = new Y.Doc();
    const htmlText = doc.getText("html");
    const cssText = doc.getText("css");
    const awareness = new Awareness(doc);
    const collaboratorColor = getCollaboratorColor(me?.id);
    const session = { doc, htmlText, cssText, awareness, initialized: false };
    sessionRef.current = session;
    setReady(false);
    setWorkspace(null);
    setLatestIntervention(null);
    setActionError("");
    awareness.setLocalStateField("user", {
      name: String(me?.name || "成员").trim() || "成员",
      color: collaboratorColor.color,
      colorLight: collaboratorColor.colorLight,
    });

    const handleDocumentUpdate = (update, origin) => {
      if (origin === REMOTE_DOCUMENT_ORIGIN) return;
      callbacksRef.current.onCollaborationUpdate?.(roomId, encodeBase64(update));
    };
    const handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === REMOTE_AWARENESS_ORIGIN) return;
      const clientIds = [...added, ...updated, ...removed];
      if (!clientIds.length) return;
      callbacksRef.current.onCollaborationAwareness?.(
        roomId,
        encodeBase64(encodeAwarenessUpdate(awareness, clientIds)),
        clientIds,
      );
    };
    const handleCollaborationMessage = (payload) => {
      const type = String(payload?.type || "").trim().toLowerCase();
      if (type === "coding_collab_sync" || type === "coding_collab_update") {
        const update = decodeBase64(payload?.update);
        if (!update) return;
        Y.applyUpdate(doc, update, REMOTE_DOCUMENT_ORIGIN);
        if (!session.initialized) {
          session.initialized = true;
          const initialHtml = htmlText.toString();
          const initialCss = cssText.toString();
          setPreviewDocument(buildSafePreviewDocument(initialHtml, initialCss));
          setDiagnostics(analyzeWebCode(initialHtml, initialCss));
          setReady(true);
        }
        return;
      }
      if (type === "coding_collab_awareness") {
        const update = decodeBase64(payload?.update);
        if (update) applyAwarenessUpdate(awareness, update, REMOTE_AWARENESS_ORIGIN);
        return;
      }
      if (type === "coding_collab_workspace_updated") {
        setWorkspace(payload?.workspace || null);
        return;
      }
      if (type === "coding_collab_intervention") {
        setLatestIntervention(payload?.intervention || null);
        setFeedbackNote(String(payload?.intervention?.feedbackNote || ""));
        return;
      }
      if (type === "coding_collab_error") {
        setActionError(String(payload?.error || "协作操作失败。"));
      }
    };

    doc.on("update", handleDocumentUpdate);
    awareness.on("update", handleAwarenessUpdate);
    const unsubscribe = callbacksRef.current.subscribeToCollaboration?.(roomId, handleCollaborationMessage) || (() => {});
    callbacksRef.current.onJoinCollaboration?.(roomId);
    return () => {
      if (editingRef.current) {
        editingRef.current = false;
        callbacksRef.current.onEditingChange?.(roomId, false);
      }
      awareness.setLocalState(null);
      awareness.off("update", handleAwarenessUpdate);
      doc.off("update", handleDocumentUpdate);
      unsubscribe();
      callbacksRef.current.onLeaveCollaboration?.(roomId);
      doc.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [me?.id, me?.name, roomId]);

  const isDriver = !!workspace && (!workspace.driverUserId || String(workspace.driverUserId) === String(me?.id || ""));
  const driverName = resolveMemberName(members, workspace?.driverUserId, "等待分配");
  const navigatorName = resolveMemberName(members, workspace?.navigatorUserId, "等待同伴加入");
  const activeText = activeDocument === "html" ? sessionRef.current?.htmlText : sessionRef.current?.cssText;
  const editorExtensions = useMemo(() => {
    if (!ready || !activeText || !sessionRef.current?.awareness) return [];
    return [
      activeDocument === "html" ? htmlLanguage() : cssLanguage(),
      EditorView.lineWrapping,
      EditorView.editable.of(isDriver),
      yCollab(activeText, sessionRef.current.awareness),
    ];
  }, [activeDocument, activeText, isDriver, ready]);

  async function refreshPreview() {
    if (!isDriver || actionSubmitting) return;
    const html = sessionRef.current?.htmlText.toString() || "";
    const css = sessionRef.current?.cssText.toString() || "";
    const nextDiagnostics = analyzeWebCode(html, css);
    setPreviewDocument(buildSafePreviewDocument(html, css));
    setDiagnostics(nextDiagnostics);
    setActionSubmitting(true);
    try {
      const result = await recordPartyWebPreview(roomId, nextDiagnostics);
      setWorkspace(result?.workspace || workspace);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "记录网页预览失败。");
    } finally {
      setActionSubmitting(false);
    }
  }

  async function updateSession(payload) {
    if (actionSubmitting) return;
    setActionSubmitting(true);
    try {
      const result = await updatePartyCodingSession(roomId, payload);
      setWorkspace(result?.workspace || workspace);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "更新协作状态失败。");
    } finally {
      setActionSubmitting(false);
    }
  }

  function downloadWebPage() {
    const source = buildDownloadDocument(
      sessionRef.current?.htmlText.toString() || "",
      sessionRef.current?.cssText.toString() || "",
    );
    const url = URL.createObjectURL(new Blob([source], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "paia-pair-work.html";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submitFeedback(feedback) {
    if (!latestIntervention?.id || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      const result = await submitPartyPaiaFeedback(roomId, latestIntervention.id, {
        feedback,
        note: feedbackNote,
      });
      setLatestIntervention(result?.intervention || latestIntervention);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "提交判断反馈失败。");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  return <aside className="party-coding-column party-web-coding-column" aria-label="HTML和CSS结对编程区">
    <div className="party-web-session-bar">
      <div className="party-web-task-summary">
        <strong>{taskText || "等待发布网页设计任务"}</strong>
        <select
          value={workspace?.taskStage || "understand"}
          onChange={(event) => void updateSession({ action: "stage", taskStage: event.target.value })}
          disabled={!workspace || actionSubmitting}
          aria-label="当前任务阶段"
        >
          {TASK_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="party-web-role-summary">
        <span className={isDriver ? "is-current-role" : ""}>Driver：{driverName}</span>
        <span className={!isDriver ? "is-current-role" : ""}>Navigator：{navigatorName}</span>
        <button
          type="button"
          onClick={() => void updateSession({ action: "rotate" })}
          disabled={!workspace?.navigatorUserId || actionSubmitting}
          title="轮换 Driver 与 Navigator"
        ><Repeat2 size={13} />轮换</button>
      </div>
    </div>

    <div className="party-coding-head party-web-coding-head">
      <div className="party-web-document-tabs" role="tablist" aria-label="网页代码文件">
        {[
          { value: "html", label: "HTML" },
          { value: "css", label: "CSS" },
        ].map((item) => <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={activeDocument === item.value}
          className={activeDocument === item.value ? "active" : ""}
          onClick={() => setActiveDocument(item.value)}
        >{item.label}</button>)}
      </div>
      <div className="party-coding-head-actions">
        {codingEditors.length > 0 ? <div className="party-coding-editor-avatars" aria-label={`${codingEditors.map((editor) => editor.name).join("、")}正在编辑`}>
          {codingEditors.slice(0, 3).map((editor) => <span className="party-coding-editor-avatar" key={editor.userId} title={`${editor.name}正在编辑`}>{getEditorInitial(editor.name)}</span>)}
        </div> : null}
        <div className="party-coding-head-buttons">
          <button type="button" onClick={() => void refreshPreview()} disabled={!ready || !isDriver || actionSubmitting}><RefreshCcw size={14} />刷新预览</button>
          <button type="button" onClick={downloadWebPage} disabled={!ready} title="下载可独立打开的 HTML 文件"><Download size={14} /></button>
        </div>
      </div>
    </div>

    {!isDriver ? <div className="party-web-navigator-notice">你当前是 Navigator：请观察网页结构、提出建议，并与 Driver 共同检查预览结果。</div> : null}
    <div className="party-code-editor party-web-code-editor">
      {ready && activeText ? <CodeMirror
        key={`${roomId}:${activeDocument}:${isDriver ? "driver" : "navigator"}`}
        value={activeText.toString()}
        height="100%"
        extensions={editorExtensions}
        onFocus={() => isDriver && setEditingPresence(true)}
        onBlur={() => setEditingPresence(false)}
        basicSetup={{ lineNumbers: true, bracketMatching: true, closeBrackets: true, indentOnInput: true }}
        aria-label={`${activeDocument.toUpperCase()} 共享代码编辑器`}
      /> : <div className="party-code-editor-loading">正在同步共享网页代码…</div>}
    </div>

    <div className="party-web-preview-head">
      <span><Eye size={14} />网页预览</span>
      <span>{diagnostics.length ? `${diagnostics.length} 个待检查问题` : "未发现基础结构问题"}</span>
    </div>
    <div className="party-web-preview-wrap">
      <iframe title="学生网页作品预览" sandbox="" srcDoc={previewDocument} />
    </div>
    {diagnostics.length ? <ul className="party-web-diagnostics">
      {diagnostics.map((item) => <li key={item}>{item}</li>)}
    </ul> : null}

    {latestIntervention ? <section className="party-paia-intervention" aria-label="琳琳的协作提示">
      <div className="party-paia-intervention-head"><strong>琳琳 · PAIA</strong><span>{latestIntervention.feedback ? "已收到纠正" : "协作观察"}</span></div>
      <p>{latestIntervention.prompt}</p>
      <small>判断依据：{latestIntervention.evidenceSummary}</small>
      {!latestIntervention.feedback ? <>
        <textarea
          value={feedbackNote}
          onChange={(event) => setFeedbackNote(event.target.value)}
          placeholder="可选：补充说明实际情况"
          maxLength={500}
        />
        <div className="party-paia-feedback-actions">
          {FEEDBACK_OPTIONS.map((option) => <button
            type="button"
            key={option.value}
            onClick={() => void submitFeedback(option.value)}
            disabled={feedbackSubmitting}
          >{option.label}</button>)}
        </div>
      </> : <p className="party-paia-feedback-result">你的反馈：{FEEDBACK_OPTIONS.find((item) => item.value === latestIntervention.feedback)?.label || latestIntervention.feedback}{latestIntervention.feedbackNote ? `；${latestIntervention.feedbackNote}` : ""}</p>}
    </section> : null}
    {actionError ? <div className="party-web-action-error" role="alert">{actionError}</div> : null}
  </aside>;
}

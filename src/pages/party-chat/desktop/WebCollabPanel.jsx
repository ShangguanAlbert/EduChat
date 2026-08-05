import { Bot, Crown, Download, Eye, RefreshCcw, Repeat2, UserRound, Users } from "lucide-react";
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
  ownerUserId = "",
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
        const nextWorkspace = payload?.workspace || null;
        setWorkspace((previousWorkspace) => {
          if (previousWorkspace?.taskId && nextWorkspace?.taskId !== previousWorkspace.taskId) {
            setLatestIntervention(null);
            setFeedbackNote("");
          }
          return nextWorkspace;
        });
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

  const assignedStudentIds = [workspace?.driverUserId, workspace?.navigatorUserId]
    .map((userId) => String(userId || ""))
    .filter(Boolean);
  const studentMembers = assignedStudentIds.length === 2
    ? assignedStudentIds
      .map((userId) => members.find((member) => String(member?.id || "") === userId))
      .filter(Boolean)
    : members.slice(0, 2);
  const pairReady = studentMembers.length === 2 && assignedStudentIds.length === 2;
  const isOwner = String(ownerUserId || "") === String(me?.id || "");
  const isDriver = pairReady && String(workspace.driverUserId) === String(me?.id || "");
  const isNavigator = pairReady && String(workspace.navigatorUserId) === String(me?.id || "");
  const isPairObserver = pairReady && !isDriver && !isNavigator;
  const driverName = resolveMemberName(members, workspace?.driverUserId, "等待分配");
  const navigatorName = resolveMemberName(members, workspace?.navigatorUserId, "等待同伴加入");
  const feedbackByName = resolveMemberName(
    members,
    latestIntervention?.feedbackByUserId,
    "小组成员",
  );
  const activeText = activeDocument === "html" ? sessionRef.current?.htmlText : sessionRef.current?.cssText;
  const editorExtensions = useMemo(() => {
    if (!ready || !activeText || !sessionRef.current?.awareness) return [];
    return [
      activeDocument === "html" ? htmlLanguage() : cssLanguage(),
      EditorView.lineWrapping,
      EditorView.editable.of(pairReady && isDriver),
      yCollab(activeText, sessionRef.current.awareness),
    ];
  }, [activeDocument, activeText, isDriver, pairReady, ready]);

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
      <div className="party-web-pair-heading">
        <span><Users size={15} />本组协作成员</span>
        <strong>{studentMembers.length}/2 名结对学生 + 琳琳</strong>
      </div>
      <div className="party-web-participant-grid">
        {studentMembers.map((member) => {
          const memberIsOwner = String(member?.id || "") === String(ownerUserId || "");
          const memberIsDriver = pairReady && String(member?.id || "") === String(workspace?.driverUserId || "");
          const memberIsNavigator = pairReady && String(member?.id || "") === String(workspace?.navigatorUserId || "");
          return <div
            className={`party-web-participant${String(member?.id || "") === String(me?.id || "") ? " is-me" : ""}`}
            key={member.id}
          >
            <span className="party-web-participant-avatar"><UserRound size={14} /></span>
            <span className="party-web-participant-name">{member.name}{String(member?.id || "") === String(me?.id || "") ? "（我）" : ""}</span>
            <span className="party-web-management-role">{memberIsOwner ? "派主" : "成员"}</span>
            <strong className={memberIsDriver ? "is-driver" : memberIsNavigator ? "is-navigator" : ""}>
              {memberIsDriver ? "Driver · 编写运行" : memberIsNavigator ? "Navigator · 观察检查" : "等待角色分配"}
            </strong>
          </div>;
        })}
        {studentMembers.length < 2 ? <div className="party-web-participant is-waiting">
          <span className="party-web-participant-avatar"><UserRound size={14} /></span>
          <span className="party-web-participant-name">等待第二名学生加入</span>
          <span className="party-web-management-role">空位</span>
          <strong>加入后自动分配角色</strong>
        </div> : null}
        <div className="party-web-participant is-paia">
          <span className="party-web-participant-avatar"><Bot size={14} /></span>
          <span className="party-web-participant-name">琳琳</span>
          <span className="party-web-management-role">AI 同伴</span>
          <strong>观察协作 · 必要时追问</strong>
        </div>
      </div>
      <p className="party-web-identity-note"><Crown size={13} />{isOwner ? "你是派主，只负责邀请和管理；" : "派主只负责邀请和管理；"}派主不固定担任 Driver，结对角色会轮换。</p>
      {isPairObserver ? <p className="party-web-observer-note">这个派来自旧数据，成员人数超过两人。你当前未分配结对角色，只能观察；请新建一个两人派开展正式任务。</p> : null}
      <div className="party-web-task-summary">
        <span>当前任务</span>
        <strong>{taskText || "等待派主发布网页设计任务"}</strong>
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
        <span className={isNavigator ? "is-current-role" : ""}>Navigator：{navigatorName}</span>
        {isDriver ? <button
          type="button"
          onClick={() => void updateSession({ action: "rotate" })}
          disabled={!pairReady || actionSubmitting}
          title={`完成本轮并将 Driver 角色交给${navigatorName}`}
        ><Repeat2 size={13} />完成本轮，交棒给{navigatorName}</button> : null}
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
          <button type="button" onClick={() => void refreshPreview()} disabled={!ready || !pairReady || !isDriver || actionSubmitting}><RefreshCcw size={14} />刷新预览</button>
          <button type="button" onClick={downloadWebPage} disabled={!ready} title="下载可独立打开的 HTML 文件"><Download size={14} /></button>
        </div>
      </div>
    </div>

    {!pairReady ? <div className="party-web-role-notice is-waiting">当前只有一名学生。第二名学生加入后，系统会分配 Driver 和 Navigator，随后才能开始共同编程。</div>
      : isDriver ? <div className="party-web-role-notice is-driver">你当前是 Driver：根据两人的讨论输入 HTML/CSS、刷新预览；完成一轮后点击“交棒”。</div>
        : isNavigator ? <div className="party-web-role-notice is-navigator">你当前是 Navigator：暂时不能输入代码，请在群聊中提出建议、发现问题，并和 Driver 一起检查预览。</div>
          : <div className="party-web-role-notice is-observer">你当前未分配结对角色，只能查看本轮过程。正式任务请进入仅有两名学生的派。</div>}
    <div className="party-code-editor party-web-code-editor">
      {ready && activeText ? <CodeMirror
        key={`${roomId}:${activeDocument}:${isDriver ? "driver" : isNavigator ? "navigator" : "observer"}`}
        value={activeText.toString()}
        height="100%"
        extensions={editorExtensions}
        onFocus={() => pairReady && isDriver && setEditingPresence(true)}
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

    <section className={`party-paia-intervention${latestIntervention ? " has-intervention" : " is-observing"}`} aria-label="琳琳的协作状态">
      <div className="party-paia-intervention-head">
        <strong><Bot size={14} />琳琳 · PAIA</strong>
        <span>{latestIntervention ? (latestIntervention.feedback ? "判断已被学生纠正" : "发现可能需要关注的情况") : "正在观察 · 暂不打扰"}</span>
      </div>
      {!latestIntervention ? <div className="party-paia-observing">
        <p>琳琳会观察两人的发言、代码修改、预览、报错和角色轮换。协作顺利时，她会保持安静。</p>
        <small>需要介入时，会先说明判断依据，再给出一个简短追问。</small>
      </div> : <>
        <div className="party-paia-evidence"><span>为什么提醒</span><p>{latestIntervention.evidenceSummary}</p></div>
        <div className="party-paia-prompt"><span>建议下一步</span><p>{latestIntervention.prompt}</p></div>
      {!latestIntervention.feedback ? <div className="party-paia-feedback-box">
        <strong>琳琳判断得准确吗？</strong>
        <small>你们可以纠正她，反馈会用于调整本任务中的后续提醒。</small>
        <textarea
          value={feedbackNote}
          onChange={(event) => setFeedbackNote(event.target.value)}
          placeholder="可选：说明实际情况，例如“Navigator 已经在口头提出建议”"
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
      </div> : <div className="party-paia-feedback-result">
        <strong>{feedbackByName}的纠正：</strong>
        {FEEDBACK_OPTIONS.find((item) => item.value === latestIntervention.feedback)?.label || latestIntervention.feedback}
        {latestIntervention.feedbackNote ? <p>{latestIntervention.feedbackNote}</p> : null}
        <small>琳琳已记录本次纠正，并会降低同类误判的重复提醒。</small>
      </div>}
      </>}
    </section>
    {actionError ? <div className="party-web-action-error" role="alert">{actionError}</div> : null}
  </aside>;
}

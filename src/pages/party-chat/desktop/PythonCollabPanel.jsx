import { Copy, Download, MessageCircleQuestion, Play, RotateCcw, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { yCollab } from "y-codemirror.next";
import { runPartyPython, savePartyCodingStdin } from "../../party/partyApi.js";

const COLLABORATION_TEXT_NAME = "code";
const REMOTE_DOCUMENT_ORIGIN = { type: "party-coding-remote-document" };
const REMOTE_AWARENESS_ORIGIN = { type: "party-coding-remote-awareness" };
const STDIN_SYNC_DELAY_MS = 180;
const COLLABORATOR_COLORS = [
  { color: "#3a8dde", colorLight: "#3a8dde33" },
  { color: "#d76a4d", colorLight: "#d76a4d33" },
  { color: "#5f9d65", colorLight: "#5f9d6533" },
  { color: "#9a6fd4", colorLight: "#9a6fd433" },
  { color: "#c98a22", colorLight: "#c98a2233" },
  { color: "#278f91", colorLight: "#278f9133" },
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
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function formatRunOutput(run) {
  if (String(run?.status || "") === "running") return "运行中…";
  const stdout = String(run?.stdout || "");
  const stderr = String(run?.stderr || "");
  const output = `${stdout}${stderr ? `${stdout ? "\n" : ""}${stderr}` : ""}`.trim();
  if (run?.exitCode == null) return output;
  return `${output}${output ? "\n\n" : ""}退出码：${run.exitCode} · ${Number(run.durationMs) || 0}ms`;
}

export default function PythonCollabPanel({
  roomId,
  me,
  codingEditors = [],
  onEditingChange,
  onJoinCollaboration,
  onLeaveCollaboration,
  onCollaborationUpdate,
  onCollaborationAwareness,
  onCollaborationOutputClear,
  onAskAiAboutOutput,
  subscribeToCollaboration,
}) {
  const [output, setOutput] = useState("");
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editorSession, setEditorSession] = useState(null);
  const [outputCopyStatus, setOutputCopyStatus] = useState("");
  const [askingAiAboutOutput, setAskingAiAboutOutput] = useState(false);
  const editingRef = useRef(false);
  const sessionRef = useRef(null);
  const stdinSyncTimerRef = useRef(0);
  const outputCopyStatusTimerRef = useRef(0);

  const setEditingPresence = useCallback((active) => {
    if (editingRef.current === active) return;
    editingRef.current = active;
    onEditingChange?.(roomId, active);
  }, [onEditingChange, roomId]);

  useEffect(() => {
    const doc = new Y.Doc();
    const text = doc.getText(COLLABORATION_TEXT_NAME);
    const awareness = new Awareness(doc);
    const collaboratorColor = getCollaboratorColor(me?.id);
    const session = { doc, text, awareness, initialized: false };
    sessionRef.current = session;
    setEditorSession(null);
    setLoading(true);
    awareness.setLocalStateField("user", {
      name: String(me?.name || "成员").trim() || "成员",
      color: collaboratorColor.color,
      colorLight: collaboratorColor.colorLight,
    });

    const handleDocumentUpdate = (update, origin) => {
      if (origin === REMOTE_DOCUMENT_ORIGIN) return;
      onCollaborationUpdate?.(roomId, encodeBase64(update));
    };
    const handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === REMOTE_AWARENESS_ORIGIN) return;
      const clientIds = [...added, ...updated, ...removed];
      if (!clientIds.length) return;
      onCollaborationAwareness?.(
        roomId,
        encodeBase64(encodeAwarenessUpdate(awareness, clientIds)),
        clientIds,
      );
    };
    const handleCollaborationMessage = (payload) => {
      const type = String(payload?.type || "").trim().toLowerCase();
      if (type === "coding_collab_stdin") {
        const nextStdin = String(payload?.stdin || "");
        setStdin(nextStdin);
        return;
      }
      if (type === "coding_collab_run_updated") {
        const workspace = payload?.workspace || {};
        const nextStdin = String(workspace.stdin || "");
        setStdin(nextStdin);
        setRunning(String(workspace?.run?.status || "") === "running");
        setOutput(formatRunOutput(workspace?.run));
        return;
      }
      if (type === "coding_collab_sync" || type === "coding_collab_update") {
        const update = decodeBase64(payload?.update);
        if (!update) return;
        Y.applyUpdate(doc, update, REMOTE_DOCUMENT_ORIGIN);
        if (!session.initialized) {
          session.initialized = true;
          setEditorSession({
            initialCode: text.toString(),
            extensions: [python(), EditorView.lineWrapping, yCollab(text, awareness)],
          });
          setLoading(false);
        }
        return;
      }
      if (type === "coding_collab_awareness") {
        const update = decodeBase64(payload?.update);
        if (!update) return;
        applyAwarenessUpdate(awareness, update, REMOTE_AWARENESS_ORIGIN);
      }
    };

    doc.on("update", handleDocumentUpdate);
    awareness.on("update", handleAwarenessUpdate);
    const unsubscribe = subscribeToCollaboration?.(roomId, handleCollaborationMessage) || (() => {});
    onJoinCollaboration?.(roomId);

    return () => {
      if (editingRef.current) {
        editingRef.current = false;
        onEditingChange?.(roomId, false);
      }
      if (stdinSyncTimerRef.current) {
        window.clearTimeout(stdinSyncTimerRef.current);
        stdinSyncTimerRef.current = 0;
      }
      if (outputCopyStatusTimerRef.current) {
        window.clearTimeout(outputCopyStatusTimerRef.current);
        outputCopyStatusTimerRef.current = 0;
      }
      awareness.setLocalState(null);
      awareness.off("update", handleAwarenessUpdate);
      doc.off("update", handleDocumentUpdate);
      unsubscribe();
      onLeaveCollaboration?.(roomId);
      doc.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [me?.id, me?.name, onCollaborationAwareness, onCollaborationUpdate, onEditingChange, onJoinCollaboration, onLeaveCollaboration, roomId, subscribeToCollaboration]);

  function scheduleStdinSync(value, delay = STDIN_SYNC_DELAY_MS) {
    if (stdinSyncTimerRef.current) window.clearTimeout(stdinSyncTimerRef.current);
    stdinSyncTimerRef.current = window.setTimeout(() => {
      stdinSyncTimerRef.current = 0;
      void savePartyCodingStdin(roomId, value).catch(() => {
        scheduleStdinSync(value, 800);
      });
    }, delay);
  }

  function handleStdinChange(event) {
    const nextStdin = event.target.value;
    setStdin(nextStdin);
    if (!nextStdin) {
      if (stdinSyncTimerRef.current) {
        window.clearTimeout(stdinSyncTimerRef.current);
        stdinSyncTimerRef.current = 0;
      }
      void savePartyCodingStdin(roomId, "").catch(() => {
        scheduleStdinSync("", 800);
      });
      return;
    }
    scheduleStdinSync(nextStdin);
  }

  async function runCode() {
    const code = sessionRef.current?.text.toString() || "";
    if (stdinSyncTimerRef.current) {
      window.clearTimeout(stdinSyncTimerRef.current);
      stdinSyncTimerRef.current = 0;
    }
    setRunning(true);
    setOutput("运行中…");
    try {
      const result = await runPartyPython(roomId, { code, stdin });
      const payload = result?.result || {};
      setOutput(`${payload.stdout || ""}${payload.stderr ? `\n${payload.stderr}` : ""}\n\n退出码：${payload.exitCode} · ${payload.durationMs}ms`.trim());
    } catch (error) {
      setOutput(error?.message || "运行失败。");
    } finally {
      setRunning(false);
    }
  }

  function clearOutput() {
    if (running) return;
    setOutput("");
    onCollaborationOutputClear?.(roomId);
  }

  function showOutputCopyStatus(message) {
    setOutputCopyStatus(message);
    if (outputCopyStatusTimerRef.current) {
      window.clearTimeout(outputCopyStatusTimerRef.current);
    }
    outputCopyStatusTimerRef.current = window.setTimeout(() => {
      setOutputCopyStatus("");
      outputCopyStatusTimerRef.current = 0;
    }, 1800);
  }

  async function copyOutput() {
    const content = output.trim();
    if (!content) return;
    if (!navigator.clipboard?.writeText) {
      showOutputCopyStatus("当前浏览器不支持复制");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      showOutputCopyStatus("已复制");
    } catch {
      showOutputCopyStatus("复制失败");
    }
  }

  async function askAiAboutOutput() {
    const content = output.trim();
    if (!content || askingAiAboutOutput) return;
    setAskingAiAboutOutput(true);
    try {
      await onAskAiAboutOutput?.(content);
    } finally {
      setAskingAiAboutOutput(false);
    }
  }

  function downloadCode() {
    const code = sessionRef.current?.text.toString() || "";
    const url = URL.createObjectURL(new Blob([code], { type: "text/x-python;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "party-collaboration.py";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <aside className="party-coding-column" aria-label="Python编程区">
    <div className="party-coding-head">
      <div><strong>Python编程区</strong></div>
      <div className="party-coding-head-actions">
        {codingEditors.length > 0 ? <div className="party-coding-editor-avatars" aria-label={`${codingEditors.map((editor) => editor.name).join("、")}正在编辑`}>
          {codingEditors.slice(0, 3).map((editor) => <span className="party-coding-editor-avatar" key={editor.userId} title={`${editor.name}正在编辑`}>{getEditorInitial(editor.name)}</span>)}
          {codingEditors.length > 3 ? <span className="party-coding-editor-avatar party-coding-editor-avatar-more">+{codingEditors.length - 3}</span> : null}
        </div> : null}
        <div className="party-coding-head-buttons">
          <button onClick={runCode} disabled={running || loading}><Play size={15} />{running ? "运行中" : "运行"}</button>
          <button onClick={downloadCode} disabled={loading} title="下载 .py 文件"><Download size={15} /></button>
        </div>
      </div>
    </div>
    <div className="party-code-editor">
      {editorSession ? <CodeMirror
        key={roomId}
        value={editorSession.initialCode}
        height="100%"
        extensions={editorSession.extensions}
        onFocus={() => setEditingPresence(true)}
        onBlur={() => setEditingPresence(false)}
        basicSetup={{ lineNumbers: true, bracketMatching: true, closeBrackets: true, indentOnInput: true }}
        aria-label="Python 代码编辑器"
      /> : <div className="party-code-editor-loading">正在同步共享代码…</div>}
    </div>
    <label className="party-coding-stdin">标准输入<textarea value={stdin} onChange={handleStdinChange} placeholder="可选：每行一个输入" /></label>
    <div className="party-coding-output-head">
      <span className="party-coding-output-title"><SquareTerminal size={15} />控制台</span>
      <div className="party-coding-output-actions">
        <span className="party-coding-output-status" role="status" aria-live="polite">{outputCopyStatus}</span>
        <button onClick={() => void copyOutput()} disabled={!output.trim()} title="复制控制台内容"><Copy size={13} />复制</button>
        <button onClick={() => void askAiAboutOutput()} disabled={!output.trim() || running || askingAiAboutOutput} title="将控制台内容发到群聊，请 AI 解释"><MessageCircleQuestion size={13} />{askingAiAboutOutput ? "发送中" : "问 AI"}</button>
        <button onClick={clearOutput} disabled={running}><RotateCcw size={13} />清空</button>
      </div>
    </div>
    <div className="party-coding-output-resizable">
      <pre className="party-coding-output">{output || "运行结果会显示在这里。"}</pre>
    </div>
  </aside>;
}

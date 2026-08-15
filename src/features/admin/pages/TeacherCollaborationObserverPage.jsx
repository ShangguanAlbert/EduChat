import {
  ArrowLeft,
  Bot,
  CircleAlert,
  Eye,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { resolveActiveAuthSlot, withAuthSlot } from "../../../app/authStorage.js";
import { createAdminCollaborationObserverSession } from "../../../pages/admin/adminApi.js";
import WebCollabPanel from "../../../pages/party-chat/desktop/WebCollabPanel.jsx";
import { createPartySocketClient } from "../../../pages/party/partySocket.js";
import { getAdminToken } from "../../../pages/login/adminSession.js";
import "../../../styles/party-chat.css";
import "../../../styles/teacher-collaboration-observer.css";

function sortMessages(messages) {
  return [...messages].sort(
    (left, right) =>
      (Date.parse(String(left?.createdAt || "")) || 0) -
      (Date.parse(String(right?.createdAt || "")) || 0),
  );
}

function upsertMessage(messages, message) {
  const messageId = String(message?.id || "").trim();
  if (!messageId) return messages;
  const index = messages.findIndex(
    (item) => String(item?.id || "").trim() === messageId,
  );
  if (index < 0) return sortMessages([...messages, message]);
  const next = [...messages];
  next[index] = { ...next[index], ...message };
  return sortMessages(next);
}

function formatObserverTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readMessageImageUrl(message) {
  return String(
    message?.image?.dataUrl || message?.image?.oss?.fileUrl || "",
  ).trim();
}

function ObserverMessage({ message }) {
  if (String(message?.type || "") === "system") {
    return (
      <div className="teacher-observer-system-message">
        {message?.content || "系统消息"}
      </div>
    );
  }
  const senderKind = String(message?.senderKind || "user").toLowerCase();
  const imageUrl = readMessageImageUrl(message);
  return (
    <article
      className={`teacher-observer-message${
        senderKind === "ai" ? " is-ai" : ""
      }`}
    >
      <header>
        <span>
          {senderKind === "ai" ? <Bot size={14} /> : null}
          {message?.senderName || (senderKind === "ai" ? "琳琳" : "学生")}
        </span>
        <time>{formatObserverTime(message?.createdAt)}</time>
      </header>
      {message?.content ? <p>{message.content}</p> : null}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={message?.image?.fileName || "学生发送的图片"}
        />
      ) : null}
      {String(message?.type || "") === "file" ? (
        <div className="teacher-observer-file-message">
          <FileText size={15} />
          <span>{message?.file?.fileName || "学生发送的文件"}</span>
        </div>
      ) : null}
    </article>
  );
}

export default function TeacherCollaborationObserverPage() {
  const { roomId: routeRoomId = "" } = useParams();
  const roomId = String(routeRoomId || "").trim();
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const adminToken = getAdminToken();
  const messagesViewportRef = useRef(null);
  const socketRef = useRef(null);
  const collaborationListenersRef = useRef(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [room, setRoom] = useState(null);
  const [observer, setObserver] = useState({ id: "", name: "教师", role: "admin" });
  const [observerToken, setObserverToken] = useState("");
  const [messages, setMessages] = useState([]);
  const [codingEditors, setCodingEditors] = useState([]);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [refreshKey, setRefreshKey] = useState(0);

  const members = (Array.isArray(room?.members) ? room.members : []).map(
    (member) => ({
      ...member,
      name: String(member?.name || member?.displayName || "学生").trim(),
    }),
  );

  const publishCollaborationMessage = useCallback((payload) => {
    const safeRoomId = String(payload?.roomId || "").trim();
    collaborationListenersRef.current
      .get(safeRoomId)
      ?.forEach((listener) => listener(payload));
  }, []);

  const subscribeToCollaboration = useCallback((targetRoomId, listener) => {
    const safeRoomId = String(targetRoomId || "").trim();
    if (!safeRoomId || typeof listener !== "function") return () => {};
    let listeners = collaborationListenersRef.current.get(safeRoomId);
    if (!listeners) {
      listeners = new Set();
      collaborationListenersRef.current.set(safeRoomId, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = collaborationListenersRef.current.get(safeRoomId);
      current?.delete(listener);
      if (current?.size === 0) {
        collaborationListenersRef.current.delete(safeRoomId);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    createAdminCollaborationObserverSession(adminToken, roomId)
      .then((data) => {
        if (cancelled) return;
        setRoom(data?.room || null);
        setObserver(data?.observer || { id: "", name: "教师", role: "admin" });
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
        setObserverToken(String(data?.observerToken || "").trim());
      })
      .catch((rawError) => {
        if (cancelled) return;
        setError(rawError?.message || "进入教师旁观模式失败。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminToken, refreshKey, roomId]);

  useEffect(() => {
    if (!observerToken || !roomId) return undefined;
    const collaborationListeners = collaborationListenersRef.current;
    const socket = createPartySocketClient({
      token: observerToken,
      onAuthed: () => {
        setSocketStatus("connected");
        socket.joinRoom(roomId);
        socket.joinCodingCollaboration(roomId);
      },
      onMessageCreated: (payload) => {
        if (String(payload?.roomId || payload?.message?.roomId || "") !== roomId)
          return;
        setMessages((current) => upsertMessage(current, payload?.message));
      },
      onMessageUpdated: (payload) => {
        if (String(payload?.roomId || payload?.message?.roomId || "") !== roomId)
          return;
        setMessages((current) => upsertMessage(current, payload?.message));
      },
      onMessageDeleted: (payload) => {
        if (String(payload?.roomId || "") !== roomId) return;
        const messageId = String(payload?.messageId || "").trim();
        setMessages((current) =>
          current.filter((message) => String(message?.id || "") !== messageId),
        );
      },
      onRoomUpdated: (payload) => {
        if (String(payload?.roomId || payload?.room?.id || "") !== roomId) return;
        setRoom((current) => ({
          ...current,
          ...(payload?.room || {}),
          members: current?.members || [],
        }));
      },
      onRoomDissolved: (payload) => {
        if (String(payload?.roomId || "") !== roomId) return;
        setError("该结对编程小教室已被解散。");
      },
      onCodingEditorPresenceUpdated: (payload) => {
        if (String(payload?.roomId || "") !== roomId) return;
        setCodingEditors(Array.isArray(payload?.editors) ? payload.editors : []);
      },
      onCodingCollaborationMessage: publishCollaborationMessage,
      onError: (payload) => {
        setError(String(payload?.message || payload?.error || "实时旁观连接异常。"));
      },
      onStatus: ({ status }) => {
        if (status === "closed" || status === "reconnecting" || status === "error") {
          setSocketStatus("reconnecting");
        } else if (status === "authed") {
          setSocketStatus("connected");
        }
      },
    });
    socketRef.current = socket;
    socket.connect();
    return () => {
      socket.leaveCodingCollaboration(roomId);
      socket.leaveRoom(roomId);
      socket.close();
      socketRef.current = null;
      collaborationListeners.clear();
    };
  }, [observerToken, publishCollaborationMessage, roomId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const goBack = useCallback(() => {
    navigate(
      withAuthSlot("/admin/settings?teacherPanel=party-manage", activeSlot),
    );
  }, [activeSlot, navigate]);

  const retryObservation = useCallback(() => {
    setLoading(true);
    setError("");
    setObserverToken("");
    setRefreshKey((value) => value + 1);
  }, []);

  if (loading) {
    return (
      <div className="teacher-collab-observer-page is-loading">
        <RefreshCw className="is-spinning" size={24} />
        <span>正在建立只读旁观连接...</span>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="teacher-collab-observer-page is-error">
        <CircleAlert size={26} />
        <strong>无法进入小教室</strong>
        <p>{error}</p>
        <div>
          <button type="button" onClick={goBack}>返回结对编程管理</button>
          <button type="button" onClick={retryObservation}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-collab-observer-page">
      <header className="teacher-collab-observer-header">
        <button type="button" onClick={goBack}>
          <ArrowLeft size={17} />返回管理
        </button>
        <div>
          <span className="teacher-collab-observer-eyebrow">
            <Eye size={14} />教师旁观模式
          </span>
          <h1>{room?.name || "结对编程小教室"}</h1>
        </div>
        <div
          className={`teacher-collab-observer-connection ${socketStatus}`}
          aria-live="polite"
        >
          <span />
          {socketStatus === "connected" ? "实时同步中" : "正在重连"}
        </div>
      </header>

      <section className="teacher-collab-observer-summary">
        <div>
          <strong><Users size={15} />结对学生</strong>
          <span>{members.map((member) => member.name).join("、") || "暂无学生"}</span>
        </div>
        <div>
          <strong>课堂任务</strong>
          <span>{room?.announcement || "教师尚未发布任务"}</span>
        </div>
        <p>您不是小教室成员，不能发言、修改代码、切换阶段或提交学生反馈。</p>
      </section>

      {error ? <div className="teacher-collab-observer-inline-error">{error}</div> : null}

      <main className="teacher-collab-observer-workspace">
        <section className="teacher-collab-observer-chat" aria-label="学生与AI实时讨论">
          <header>
            <div>
              <strong>学生与琳琳的讨论</strong>
              <span>{`${messages.length} 条消息 · 只读`}</span>
            </div>
            <Eye size={17} />
          </header>
          <div className="teacher-collab-observer-messages" ref={messagesViewportRef}>
            {messages.length === 0 ? (
              <div className="teacher-collab-observer-empty">
                <ImageIcon size={22} />
                <span>学生还没有开始讨论。</span>
              </div>
            ) : (
              messages.map((message) => (
                <ObserverMessage key={message.id} message={message} />
              ))
            )}
          </div>
        </section>

        <WebCollabPanel
          roomId={roomId}
          me={observer}
          members={members}
          taskText={room?.announcement || ""}
          codingEditors={codingEditors}
          onJoinCollaboration={(targetRoomId) =>
            socketRef.current?.joinCodingCollaboration(targetRoomId)
          }
          onLeaveCollaboration={(targetRoomId) =>
            socketRef.current?.leaveCodingCollaboration(targetRoomId)
          }
          onCollaborationUpdate={() => false}
          onCollaborationAwareness={() => false}
          subscribeToCollaboration={subscribeToCollaboration}
          readOnlyObserver
        />
      </main>
    </div>
  );
}

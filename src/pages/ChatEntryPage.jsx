import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { clearUserAuthSession, withAuthSlot } from "../app/authStorage.js";
import { compactReturnUrlSearch } from "../app/returnNavigation.js";
import { sanitizeChatSessionId } from "../../shared/contracts/chat.js";
import { fetchChatBootstrap } from "../features/chat/api/chatApi.js";
import { resolveBootstrapTargetSessionId } from "../features/chat/services/ChatConversationService.js";

function buildCanonicalChatHref(sessionId = "", search = "") {
  const safeSessionId = sanitizeChatSessionId(sessionId);
  const basePath = safeSessionId
    ? `/c/${encodeURIComponent(safeSessionId)}`
    : "/c";
  const compactSearch = compactReturnUrlSearch(search);
  return withAuthSlot(`${basePath}${compactSearch}`);
}

export default function ChatEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const legacySessionId = sanitizeChatSessionId(params.sessionId);
  const [entryError, setEntryError] = useState("");

  useEffect(() => {
    if (legacySessionId) return undefined;

    let cancelled = false;

    async function resolveEntry() {
      setEntryError("");
      try {
        const data = await fetchChatBootstrap();
        if (cancelled) return;

        const state = data?.state && typeof data.state === "object" ? data.state : {};
        const sessions = Array.isArray(state.sessions) ? state.sessions : [];
        const targetSessionId = resolveBootstrapTargetSessionId({
          sessions,
          activeId: state.activeId,
          restoreSessionId: "",
        });

        navigate(buildCanonicalChatHref(targetSessionId, location.search), {
          replace: true,
          state: location.state,
        });
      } catch (error) {
        if (cancelled) return;
        const message = error?.message || "进入聊天失败";
        if (
          message.includes("登录状态无效") ||
          message.includes("重新登录") ||
          message.includes("账号不存在")
        ) {
          clearUserAuthSession();
          navigate(withAuthSlot("/login"), { replace: true });
          return;
        }
        setEntryError(message);
      }
    }

    void resolveEntry();
    return () => {
      cancelled = true;
    };
  }, [legacySessionId, location.search, location.state, navigate]);

  if (legacySessionId) {
    return (
      <Navigate
        to={buildCanonicalChatHref(legacySessionId, location.search)}
        replace
        state={location.state}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ fontSize: "22px", fontWeight: 700 }}>元协坊</div>
        <div style={{ marginTop: "10px", color: "#6b7280" }}>
          {entryError || "正在进入聊天…"}
        </div>
      </div>
    </div>
  );
}

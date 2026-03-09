import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getUserToken, resolveActiveAuthSlot, withAuthSlot } from "./authStorage.js";

const USER_PRESENCE_HEARTBEAT_INTERVAL_MS = 20 * 1000;

export default function RequireAuth({ children }) {
  const location = useLocation();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const token = getUserToken(activeSlot);

  useEffect(() => {
    if (!token) return undefined;
    let disposed = false;

    async function sendHeartbeat() {
      if (disposed) return;
      const currentToken = String(getUserToken(activeSlot) || "").trim();
      if (!currentToken) return;
      try {
        await fetch("/api/user/presence/heartbeat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
          keepalive: true,
        });
      } catch {
        // Ignore heartbeat errors.
      }
    }

    void sendHeartbeat();
    const timer = window.setInterval(() => {
      void sendHeartbeat();
    }, USER_PRESENCE_HEARTBEAT_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }

    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeSlot, token]);

  if (!token) {
    // 记住用户原本想去的页面，未来接真实登录时可以“登录后跳回去”
    return <Navigate to={withAuthSlot("/login", activeSlot)} replace state={{ from: location }} />;
  }

  return children;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, RefreshCw, SlidersHorizontal, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchAdminOnlinePresence } from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import { resolveActiveAuthSlot, withAuthSlot } from "../app/authStorage.js";
import "../styles/admin-settings.css";
import "../styles/admin-online-users.css";

const TARGET_CLASS_NAMES = Object.freeze(["教技231", "810班", "811班"]);
const AUTO_REFRESH_MS = 20 * 1000;

function readErrorMessage(error) {
  if (!error) return "请求失败，请稍后重试。";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  return "请求失败，请稍后重试。";
}

function formatDisplayTime(input) {
  if (!input) return "--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatWindowText(seconds) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  if (!safeSeconds) return "实时";
  if (safeSeconds % 60 === 0) {
    const minutes = safeSeconds / 60;
    return `${minutes} 分钟`;
  }
  return `${safeSeconds} 秒`;
}

export default function AdminOnlineUsersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);

  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");
  const [presence, setPresence] = useState({
    onlineWindowSeconds: 300,
    heartbeatStaleSeconds: 70,
    users: [],
  });

  const handleAuthError = useCallback(
    (rawError) => {
      const message = readErrorMessage(rawError);
      if (!message.includes("管理员")) return false;
      clearAdminToken();
      setAdminToken("");
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return true;
    },
    [activeSlot, navigate],
  );

  const loadPresence = useCallback(
    async ({ silent = false } = {}) => {
      if (!adminToken) {
        navigate(withAuthSlot("/login", activeSlot), { replace: true });
        return;
      }
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const data = await fetchAdminOnlinePresence(adminToken);
        const users = Array.isArray(data?.users) ? data.users : [];
        const onlyTargetClassUsers = users.filter((item) =>
          TARGET_CLASS_NAMES.includes(String(item?.profile?.className || "").trim()),
        );
        setPresence({
          onlineWindowSeconds:
            Number(data?.onlineWindowSeconds) > 0 ? Number(data.onlineWindowSeconds) : 300,
          heartbeatStaleSeconds:
            Number(data?.heartbeatStaleSeconds) > 0 ? Number(data.heartbeatStaleSeconds) : 70,
          users: onlyTargetClassUsers,
        });
        setLastRefreshedAt(
          String(data?.generatedAt || "").trim() || new Date().toISOString(),
        );
      } catch (rawError) {
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [activeSlot, adminToken, handleAuthError, navigate],
  );

  useEffect(() => {
    if (!adminToken) {
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return;
    }
    void loadPresence();
  }, [activeSlot, adminToken, loadPresence, navigate]);

  useEffect(() => {
    if (!adminToken) return undefined;
    const timer = setInterval(() => {
      void loadPresence({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [adminToken, loadPresence]);

  const users = useMemo(() => {
    const list = Array.isArray(presence.users) ? presence.users : [];
    return [...list].sort((a, b) => {
      const aTime = new Date(a?.lastSeenAt || 0).getTime() || 0;
      const bTime = new Date(b?.lastSeenAt || 0).getTime() || 0;
      return bTime - aTime;
    });
  }, [presence.users]);

  const classSummaries = useMemo(
    () =>
      TARGET_CLASS_NAMES.map((className) => {
        const classUsers = users.filter(
          (item) => String(item?.profile?.className || "").trim() === className,
        );
        return {
          className,
          users: classUsers,
          count: classUsers.length,
          ruleText:
            className === "810班" || className === "811班"
              ? `浏览器在线心跳（${formatWindowText(presence.heartbeatStaleSeconds)}内）`
              : `活跃请求/在线连接（${formatWindowText(presence.onlineWindowSeconds)}内）`,
        };
      }),
    [presence.heartbeatStaleSeconds, presence.onlineWindowSeconds, users],
  );

  function onRefreshNow() {
    void loadPresence({ silent: true });
  }

  function onBackToTeacherHome() {
    navigate(withAuthSlot("/admin/settings", activeSlot));
  }

  return (
    <div className="admin-online-page">
      <div className="admin-online-shell">
        <header className="admin-online-topbar">
          <div className="admin-online-topbar-left">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={onBackToTeacherHome}
              title="返回教师主页"
              aria-label="返回教师主页"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="admin-online-title-group">
              <h1 className="admin-online-title">用户在线面板</h1>
              <p className="admin-online-subtitle">查看教技231、810班、811班在线情况</p>
            </div>
          </div>

          <div className="admin-online-topbar-right">
            <div className="admin-online-refresh-status" role="status">
              最近刷新：{formatDisplayTime(lastRefreshedAt)}
            </div>
            <button
              type="button"
              className="admin-ghost-btn"
              onClick={() => navigate(withAuthSlot("/admin/settings", activeSlot))}
            >
              <span>教师主页</span>
            </button>
            <button
              type="button"
              className="admin-ghost-btn"
              onClick={() => navigate(withAuthSlot("/admin/classroom-settings", activeSlot))}
            >
              <span>课堂任务设置</span>
            </button>
            <button
              type="button"
              className="admin-save-btn"
              onClick={() => navigate(withAuthSlot("/admin/agent-settings", activeSlot))}
            >
              <SlidersHorizontal size={15} />
              <span>智能体设置</span>
            </button>
            <button
              type="button"
              className="admin-ghost-btn admin-online-refresh-btn"
              onClick={onRefreshNow}
              disabled={loading || refreshing}
            >
              <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
              <span>{refreshing ? "刷新中..." : "立即刷新"}</span>
            </button>
          </div>
        </header>

        {error ? (
          <p className="admin-online-error" role="alert">
            {error}
          </p>
        ) : null}

        <main className="admin-online-content">
          <section className="admin-online-summary-card admin-online-summary-grid">
            {classSummaries.map((item) => (
              <div key={item.className} className="admin-online-class-card">
                <div className="admin-online-summary-head">
                  <span className="admin-online-summary-chip">
                    <Users size={15} />
                    <span>{item.className}</span>
                  </span>
                  <span className="admin-online-summary-window">
                    <Clock3 size={14} />
                    <span>{item.ruleText}</span>
                  </span>
                </div>
                <p className="admin-online-count-label">在线人数</p>
                <p className="admin-online-count-value">{loading ? "--" : item.count}</p>
                <p className="admin-online-count-note">
                  {item.users.length > 0
                    ? `最近活跃：${formatDisplayTime(item.users[0]?.lastSeenAt)}`
                    : "当前暂无在线用户"}
                </p>
              </div>
            ))}
          </section>

          <section className="admin-online-list-card">
            <div className="admin-online-list-head">
              <h2>在线用户列表</h2>
              <span>{loading ? "加载中..." : `${users.length} 人`}</span>
            </div>

            {loading ? (
              <p className="admin-online-empty">正在加载在线用户数据...</p>
            ) : users.length === 0 ? (
              <p className="admin-online-empty">当前暂无在线用户。</p>
            ) : (
              <div className="admin-online-table-wrap">
                <table className="admin-online-table">
                  <thead>
                    <tr>
                      <th>班级</th>
                      <th>账号</th>
                      <th>姓名</th>
                      <th>学号</th>
                      <th>年级</th>
                      <th>最近活跃</th>
                      <th>浏览器心跳</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.userId || `${item.username}-${item.lastSeenAt}`}>
                        <td>{item?.profile?.className || "-"}</td>
                        <td>{item.username || "-"}</td>
                        <td>{item?.profile?.name || "-"}</td>
                        <td>{item?.profile?.studentId || "-"}</td>
                        <td>{item?.profile?.grade || "-"}</td>
                        <td>{formatDisplayTime(item.lastSeenAt)}</td>
                        <td>{formatDisplayTime(item.browserHeartbeatAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

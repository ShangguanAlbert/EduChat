import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Save, SlidersHorizontal } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  fetchAdminClassroomSettings,
  saveAdminClassroomSettings,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import { resolveActiveAuthSlot, withAuthSlot } from "../app/authStorage.js";
import "../styles/admin-settings.css";
import "../styles/admin-online-users.css";

function readErrorMessage(error) {
  if (!error) return "请求失败，请稍后重试。";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  return "请求失败，请稍后重试。";
}

function formatClock(input) {
  if (!input) return "--:--:--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

export default function AdminClassroomSettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [firstLessonDate, setFirstLessonDate] = useState("2026-03-11");
  const [questionnaireUrl, setQuestionnaireUrl] = useState("https://v.wjx.cn/vm/PQfZjgr.aspx#");
  const [productTaskEnabled, setProductTaskEnabled] = useState(false);

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

  useEffect(() => {
    if (!adminToken) {
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return;
    }
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAdminClassroomSettings(adminToken);
        if (cancelled) return;
        setProductTaskEnabled(!!data?.shangguanClassTaskProductImprovementEnabled);
        setFirstLessonDate(String(data?.firstLessonDate || "2026-03-11"));
        setQuestionnaireUrl(
          String(data?.questionnaireUrl || "https://v.wjx.cn/vm/PQfZjgr.aspx#"),
        );
        setUpdatedAt(String(data?.updatedAt || ""));
      } catch (rawError) {
        if (cancelled) return;
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [activeSlot, adminToken, handleAuthError, navigate]);

  async function onSave() {
    if (!adminToken) return;
    setSaving(true);
    setError("");
    try {
      const data = await saveAdminClassroomSettings(adminToken, {
        shangguanClassTaskProductImprovementEnabled: !!productTaskEnabled,
      });
      setUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
      setProductTaskEnabled(!!data?.shangguanClassTaskProductImprovementEnabled);
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-online-page">
      <div className="admin-online-shell">
        <header className="admin-online-topbar">
          <div className="admin-online-topbar-left">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => navigate(withAuthSlot("/admin/settings", activeSlot))}
              title="返回用户在线面板"
              aria-label="返回用户在线面板"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="admin-online-title-group">
              <h1 className="admin-online-title">课堂任务设置</h1>
              <p className="admin-online-subtitle">授课教师：上官福泽</p>
            </div>
          </div>
          <div className="admin-online-topbar-right">
            <button
              type="button"
              className="admin-ghost-btn"
              onClick={() => navigate(withAuthSlot("/admin/agent-settings", activeSlot))}
            >
              <SlidersHorizontal size={15} />
              <span>智能体设置</span>
            </button>
            <button
              type="button"
              className="admin-save-btn"
              disabled={loading || saving}
              onClick={onSave}
            >
              <Save size={16} />
              <span>{saving ? "保存中..." : "保存"}</span>
            </button>
          </div>
        </header>

        {error ? (
          <p className="admin-online-error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="admin-class-task-card">
          <div className="admin-class-task-card-head">
            <h2>班级上课任务</h2>
            <span>{`最近保存：${formatClock(updatedAt)}`}</span>
          </div>
          <div className="admin-class-task-card-body">
            <div className="admin-class-task-card-row">
              <div className="admin-class-task-card-text">
                <strong>第一次课日期</strong>
                <small>{firstLessonDate || "-"}</small>
              </div>
            </div>
            <div className="admin-class-task-card-row">
              <div className="admin-class-task-card-text">
                <strong>问卷星链接</strong>
                <small className="admin-class-task-link-text">{questionnaireUrl}</small>
              </div>
              <a
                className="admin-ghost-btn admin-class-task-open-link"
                href={questionnaireUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink size={14} />
                <span>打开</span>
              </a>
            </div>
            <div className="admin-class-task-card-row">
              <div className="admin-class-task-card-text">
                <strong>开放 Product Improvment task</strong>
                <small>仅在开启后，学生才能点击进入该任务。</small>
              </div>
              <label className="admin-switch-row">
                <input
                  type="checkbox"
                  checked={productTaskEnabled}
                  onChange={(e) => setProductTaskEnabled(e.target.checked)}
                  disabled={loading || saving}
                />
                <span>{productTaskEnabled ? "已开放" : "未开放"}</span>
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

import { ArrowLeft, BookOpenCheck, ChevronRight, Sparkles } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  clearUserAuthSession,
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { SHANGGUAN_FUZE_TEACHER_SCOPE_KEY } from "../../shared/teacherScopes.js";
import "../styles/mode-selection.css";

const FIRST_CLASS_DATE_TEXT = "2026年3月11日";

export default function ModeSelectionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const storedUser = getStoredAuthUser(activeSlot);
  const teacherScopeKey = String(storedUser?.teacherScopeKey || "")
    .trim()
    .toLowerCase();
  const isShangguanTeacher = teacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;

  if (!isShangguanTeacher) {
    return <Navigate to={withAuthSlot("/chat", activeSlot)} replace />;
  }

  function onBackToLogin() {
    clearUserAuthSession(activeSlot);
    navigate(withAuthSlot("/login", activeSlot), { replace: true });
  }

  return (
    <main className="mode-hub-page">
      <section className="mode-hub-shell">
        <button
          type="button"
          className="task-back-btn mode-hub-back-btn"
          onClick={onBackToLogin}
        >
          <ArrowLeft size={16} />
          <span>返回登录页面</span>
        </button>

        <header className="mode-hub-header">
          <h1>请选择学习模式</h1>
        </header>

        <div className="mode-hub-grid">
          <button
            type="button"
            className="mode-hub-card"
            onClick={() => navigate(withAuthSlot("/classroom/tasks", activeSlot))}
          >
            <span className="mode-hub-icon">
              <BookOpenCheck size={20} />
            </span>
            <span className="mode-hub-content">
              <strong>班级上课任务</strong>
              <small>{`第一次课：${FIRST_CLASS_DATE_TEXT}`}</small>
            </span>
            <ChevronRight size={18} />
          </button>

          <button
            type="button"
            className="mode-hub-card"
            onClick={() => navigate(withAuthSlot("/chat", activeSlot))}
          >
            <span className="mode-hub-icon">
              <Sparkles size={20} />
            </span>
            <span className="mode-hub-content">
              <strong>元协坊</strong>
              <small>进入对话与协作学习空间</small>
            </span>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}

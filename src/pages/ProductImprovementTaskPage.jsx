import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { SHANGGUAN_FUZE_TEACHER_SCOPE_KEY } from "../../shared/teacherScopes.js";
import { fetchClassroomTaskSettings } from "./classroom/classroomApi.js";
import "../styles/mode-selection.css";

function readErrorMessage(error) {
  return error?.message || "读取任务状态失败，请稍后重试。";
}

export default function ProductImprovementTaskPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const storedUser = getStoredAuthUser(activeSlot);
  const teacherScopeKey = String(storedUser?.teacherScopeKey || "")
    .trim()
    .toLowerCase();
  const isShangguanTeacher = teacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isShangguanTeacher) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await fetchClassroomTaskSettings();
        if (cancelled) return;
        setEnabled(!!data?.productImprovementEnabled);
      } catch (error) {
        if (cancelled) return;
        setLoadError(readErrorMessage(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isShangguanTeacher]);

  if (!isShangguanTeacher) {
    return <Navigate to={withAuthSlot("/chat", activeSlot)} replace />;
  }

  return (
    <main className="mode-hub-page">
      <section className="task-page-shell">
        <button
          type="button"
          className="task-back-btn"
          onClick={() => navigate(withAuthSlot("/classroom/tasks", activeSlot))}
        >
          <ArrowLeft size={16} />
          <span>返回课堂任务</span>
        </button>

        <header className="task-page-header">
          <h1>Product Improvment task</h1>
          <p>围绕本平台提出可执行的产品优化建议，并在元协坊中完成验证。</p>
        </header>

        {loading ? <p className="task-status-tip">正在校验任务开放状态…</p> : null}
        {loadError ? <p className="task-status-tip error">{loadError}</p> : null}

        {!loading && !loadError && !enabled ? (
          <div className="task-lock-box">
            <p>该任务暂未开放，请等待管理员教师在后台开启入口。</p>
          </div>
        ) : null}

        {!loading && !loadError && enabled ? (
          <div className="task-content-box">
            <ol>
              <li>进入元协坊，体验你最想改进的功能流程。</li>
              <li>记录至少 3 条问题或改进机会，并给出原因。</li>
              <li>给出优先级最高的 1 条建议和预期效果。</li>
            </ol>
            <button
              type="button"
              className="task-primary-btn"
              onClick={() => navigate(withAuthSlot("/chat", activeSlot))}
            >
              <span>进入元协坊完成任务</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

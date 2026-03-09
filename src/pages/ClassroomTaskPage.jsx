import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { SHANGGUAN_FUZE_TEACHER_SCOPE_KEY } from "../../shared/teacherScopes.js";
import { fetchClassroomTaskSettings } from "./classroom/classroomApi.js";
import "../styles/mode-selection.css";

const CLASS_TASK_FALLBACK_DATE = "2026-03-11";
const CLASS_TASK_FALLBACK_WJX_URL = "https://v.wjx.cn/vm/PQfZjgr.aspx#";

function formatDateLabel(dateText) {
  const raw = String(dateText || "").trim();
  if (!raw) return "2026年3月11日";
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return raw;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function readErrorMessage(error) {
  return error?.message || "读取课堂任务失败，请稍后重试。";
}

export default function ClassroomTaskPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const storedUser = getStoredAuthUser(activeSlot);
  const teacherScopeKey = String(storedUser?.teacherScopeKey || "")
    .trim()
    .toLowerCase();
  const isShangguanTeacher = teacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [taskSettings, setTaskSettings] = useState({
    firstLessonDate: CLASS_TASK_FALLBACK_DATE,
    questionnaireUrl: CLASS_TASK_FALLBACK_WJX_URL,
    productImprovementEnabled: false,
  });

  useEffect(() => {
    if (!isShangguanTeacher) return;
    let cancelled = false;
    async function loadTaskSettings() {
      setSettingsLoading(true);
      setSettingsError("");
      try {
        const data = await fetchClassroomTaskSettings();
        if (cancelled) return;
        setTaskSettings({
          firstLessonDate: String(
            data?.firstLessonDate || CLASS_TASK_FALLBACK_DATE,
          ),
          questionnaireUrl: String(
            data?.questionnaireUrl || CLASS_TASK_FALLBACK_WJX_URL,
          ),
          productImprovementEnabled: !!data?.productImprovementEnabled,
        });
      } catch (error) {
        if (cancelled) return;
        setSettingsError(readErrorMessage(error));
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    }
    loadTaskSettings();
    return () => {
      cancelled = true;
    };
  }, [isShangguanTeacher]);

  const firstLessonDateLabel = useMemo(
    () => formatDateLabel(taskSettings.firstLessonDate),
    [taskSettings.firstLessonDate],
  );
  const productTaskDisabled =
    settingsLoading || !!settingsError || !taskSettings.productImprovementEnabled;

  if (!isShangguanTeacher) {
    return <Navigate to={withAuthSlot("/chat", activeSlot)} replace />;
  }

  return (
    <main className="mode-hub-page">
      <section className="task-page-shell">
        <button
          type="button"
          className="task-back-btn"
          onClick={() => navigate(withAuthSlot("/mode-selection", activeSlot))}
        >
          <ArrowLeft size={16} />
          <span>返回模式选择</span>
        </button>

        <header className="task-page-header">
          <h1>本节课课堂测试任务</h1>
          <p>{`第一次课：${firstLessonDateLabel}`}</p>
        </header>

        <div className="task-list">
          <a
            className="task-item-link"
            href={taskSettings.questionnaireUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span>
              <strong>问卷星课堂测试</strong>
              <small>点击后将在新标签页打开</small>
            </span>
            <ExternalLink size={17} />
          </a>

          <button
            type="button"
            className="task-item-button"
            onClick={() =>
              navigate(withAuthSlot("/classroom/tasks/product-improvement", activeSlot))
            }
            disabled={productTaskDisabled}
          >
            <span>
              <strong>Product Improvment task</strong>
              <small>
                {taskSettings.productImprovementEnabled
                  ? "已开放，点击进入任务说明"
                  : "等待管理员教师开放后可进入"}
              </small>
            </span>
            <Lightbulb size={17} />
          </button>
        </div>

        {settingsLoading ? <p className="task-status-tip">正在读取任务开关…</p> : null}
        {settingsError ? <p className="task-status-tip error">{settingsError}</p> : null}
      </section>
    </main>
  );
}

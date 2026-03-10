import { ArrowLeft, Download, ExternalLink, Lightbulb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { SHANGGUAN_FUZE_TEACHER_SCOPE_KEY } from "../../shared/teacherScopes.js";
import {
  downloadClassroomLessonFile,
  fetchClassroomTaskSettings,
} from "./classroom/classroomApi.js";
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

function formatFileSize(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${bytes} B`;
}

function triggerBrowserDownload(blob, fileName) {
  const safeName = String(fileName || "").trim() || "课程文件.bin";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function triggerUrlDownload(downloadUrl, fileName = "") {
  const safeUrl = String(downloadUrl || "").trim();
  if (!safeUrl) return;
  const anchor = document.createElement("a");
  anchor.href = safeUrl;
  if (fileName) {
    anchor.download = String(fileName || "").trim();
  }
  anchor.target = "_blank";
  anchor.rel = "noreferrer noopener";
  anchor.click();
}

function parseIsoTimeMs(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : Number.NaN;
}

function resolveLessonStartMs(lesson) {
  const startMs = parseIsoTimeMs(lesson?.courseStartAt);
  if (Number.isFinite(startMs)) return startMs;
  const legacy = String(lesson?.courseTime || "").trim();
  const legacyMatch = legacy.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}:\d{2})/);
  if (!legacyMatch) return Number.NaN;
  const [, year, month, day, timeText] = legacyMatch;
  return parseIsoTimeMs(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timeText}:00`,
  );
}

function resolveLessonEndMs(lesson, startMs) {
  const endMs = parseIsoTimeMs(lesson?.courseEndAt);
  if (Number.isFinite(endMs)) return endMs;
  if (!Number.isFinite(startMs)) return Number.NaN;
  return startMs + 2 * 60 * 60 * 1000;
}

function formatLessonTimeLabel(lesson) {
  const startMs = resolveLessonStartMs(lesson);
  if (!Number.isFinite(startMs)) return String(lesson?.courseTime || "").trim() || "时间待教师更新";
  const startDate = new Date(startMs);
  const dateText = startDate.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const startText = startDate.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const endMs = parseIsoTimeMs(lesson?.courseEndAt);
  if (!Number.isFinite(endMs)) return `${dateText} ${startText}`;
  const endText = new Date(endMs).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateText} ${startText}-${endText}`;
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
  const [downloadError, setDownloadError] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const [taskSettings, setTaskSettings] = useState({
    firstLessonDate: CLASS_TASK_FALLBACK_DATE,
    questionnaireUrl: CLASS_TASK_FALLBACK_WJX_URL,
    productImprovementEnabled: false,
    teacherCoursePlans: [],
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
          teacherCoursePlans: Array.isArray(data?.teacherCoursePlans)
            ? data.teacherCoursePlans
            : [],
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

  const enabledLessons = useMemo(
    () =>
      (Array.isArray(taskSettings.teacherCoursePlans)
        ? taskSettings.teacherCoursePlans
        : []
      ).filter((lesson) => lesson && lesson.enabled !== false),
    [taskSettings.teacherCoursePlans],
  );
  const sortedLessons = useMemo(
    () =>
      [...enabledLessons].sort((a, b) => {
        const aStart = resolveLessonStartMs(a);
        const bStart = resolveLessonStartMs(b);
        if (Number.isFinite(aStart) && Number.isFinite(bStart) && aStart !== bStart) {
          return aStart - bStart;
        }
        if (Number.isFinite(aStart) && !Number.isFinite(bStart)) return -1;
        if (!Number.isFinite(aStart) && Number.isFinite(bStart)) return 1;
        return String(a?.courseName || "").localeCompare(String(b?.courseName || ""), "zh-CN");
      }),
    [enabledLessons],
  );
  const currentLessons = useMemo(() => {
    const now = Date.now();
    return sortedLessons.filter((lesson) => {
      const startMs = resolveLessonStartMs(lesson);
      const endMs = resolveLessonEndMs(lesson, startMs);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
      return now >= startMs && now <= endMs;
    });
  }, [sortedLessons]);
  const historyLessons = useMemo(() => {
    const currentLessonIds = new Set(
      currentLessons.map((lesson) => String(lesson?.id || "").trim()).filter(Boolean),
    );
    return [...sortedLessons]
      .filter((lesson) => !currentLessonIds.has(String(lesson?.id || "").trim()))
      .sort((a, b) => {
        const aStart = resolveLessonStartMs(a);
        const bStart = resolveLessonStartMs(b);
        if (Number.isFinite(aStart) && Number.isFinite(bStart) && aStart !== bStart) {
          return bStart - aStart;
        }
        return String(a?.courseName || "").localeCompare(String(b?.courseName || ""), "zh-CN");
      });
  }, [currentLessons, sortedLessons]);
  const firstLessonDateLabel = useMemo(() => {
    const firstLesson = sortedLessons[0];
    const startMs = resolveLessonStartMs(firstLesson);
    if (Number.isFinite(startMs)) {
      const date = new Date(startMs);
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }
    return formatDateLabel(taskSettings.firstLessonDate);
  }, [sortedLessons, taskSettings.firstLessonDate]);
  const firstLessonName = useMemo(() => {
    const firstLesson = sortedLessons[0];
    return String(firstLesson?.courseName || "").trim() || "第一节课";
  }, [sortedLessons]);
  const productTaskDisabled =
    settingsLoading || !!settingsError || !taskSettings.productImprovementEnabled;

  async function onDownloadLessonFile(fileId) {
    const safeFileId = String(fileId || "").trim();
    if (!safeFileId) return;
    setDownloadError("");
    setDownloadingFileId(safeFileId);
    try {
      const data = await downloadClassroomLessonFile(safeFileId);
      if (data?.downloadUrl) {
        triggerUrlDownload(data.downloadUrl, data.fileName || "课程文件.bin");
      } else if (data?.blob) {
        triggerBrowserDownload(data.blob, data.fileName || "课程文件.bin");
      } else {
        throw new Error("课程文件下载失败，请稍后重试。");
      }
    } catch (error) {
      setDownloadError(error?.message || "课程文件下载失败，请稍后重试。");
    } finally {
      setDownloadingFileId("");
    }
  }

  function renderLessonCard(lesson, lessonIndex) {
    const tasks = Array.isArray(lesson?.tasks) ? lesson.tasks : [];
    const legacyLessonFiles = Array.isArray(lesson?.files) ? lesson.files : [];
    const hasTaskAttachments = tasks.some(
      (task) => Array.isArray(task?.files) && task.files.length > 0,
    );
    return (
      <article
        key={lesson?.id || `lesson-${lessonIndex + 1}`}
        className="task-lesson-item"
      >
        <header>
          <strong>{lesson?.courseName || `第${lessonIndex + 1}节课`}</strong>
          <span>{formatLessonTimeLabel(lesson)}</span>
        </header>

        {tasks.length > 0 ? (
          <ul>
            {tasks.map((task, taskIndex) => (
              <li key={task?.id || `task-${taskIndex + 1}`}>
                <strong>{task?.title || `任务 ${taskIndex + 1}`}</strong>
                <span>{task?.type === "link" ? "链接任务" : "文字任务"}</span>
                {Array.isArray(task?.files) && task.files.length > 0 ? (
                  <div className="task-lesson-file-list">
                    {task.files.map((file, fileIndex) => {
                      const fileId = String(file?.id || "");
                      return (
                        <button
                          key={fileId || `task-file-${fileIndex + 1}`}
                          type="button"
                          className="task-lesson-file-btn"
                          onClick={() => void onDownloadLessonFile(fileId)}
                          disabled={!fileId || downloadingFileId === fileId}
                        >
                          <span>
                            <strong>{file?.name || "任务附件"}</strong>
                            <small>{formatFileSize(file?.size)}</small>
                          </span>
                          <Download size={16} />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {!hasTaskAttachments && legacyLessonFiles.length === 0 ? (
          <p className="task-status-tip">本节课暂未上传资料文件。</p>
        ) : null}
        {!hasTaskAttachments && legacyLessonFiles.length > 0 ? (
          <div className="task-lesson-file-list">
            {legacyLessonFiles.map((file, fileIndex) => {
              const fileId = String(file?.id || "");
              return (
                <button
                  key={fileId || `file-${fileIndex + 1}`}
                  type="button"
                  className="task-lesson-file-btn"
                  onClick={() => void onDownloadLessonFile(fileId)}
                  disabled={!fileId || downloadingFileId === fileId}
                >
                  <span>
                    <strong>{file?.name || "课程文件"}</strong>
                    <small>{formatFileSize(file?.size)}</small>
                  </span>
                  <Download size={16} />
                </button>
              );
            })}
          </div>
        ) : null}
      </article>
    );
  }

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
          <p>{`${firstLessonName}（${firstLessonDateLabel}）`}</p>
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
        {downloadError ? <p className="task-status-tip error">{downloadError}</p> : null}

        <section className="task-lesson-board">
          <h2>课时资料下载</h2>
          {sortedLessons.length === 0 ? (
            <p className="task-status-tip">教师暂未开放课时资料。</p>
          ) : (
            <>
              <div className="task-lesson-group">
                <h3>当前进行中的课时</h3>
                {currentLessons.length === 0 ? (
                  <p className="task-status-tip">当前没有进行中的课时。</p>
                ) : (
                  <div className="task-lesson-list">
                    {currentLessons.map((lesson, index) => renderLessonCard(lesson, index))}
                  </div>
                )}
              </div>

              {historyLessons.length > 0 ? (
                <details className="task-lesson-history">
                  <summary>{`历史课时（${historyLessons.length}）`}</summary>
                  <div className="task-lesson-list">
                    {historyLessons.map((lesson, index) => renderLessonCard(lesson, index))}
                  </div>
                </details>
              ) : null}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Download,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  clearUserAuthSession,
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { SHANGGUAN_FUZE_TEACHER_SCOPE_KEY } from "../../shared/teacherScopes.js";
import {
  downloadClassroomLessonFile,
  fetchClassroomTaskSettings,
} from "./classroom/classroomApi.js";
import "../styles/teacher-home.css";
import "../styles/mode-selection.css";
import "../styles/student-home.css";

const CLASS_TASK_FALLBACK_DATE = "2026-03-11";

function readErrorMessage(error) {
  return error?.message || "读取课堂任务失败，请稍后重试。";
}

function formatDateLabel(dateText) {
  const raw = String(dateText || "").trim();
  if (!raw) return "2026年3月11日";
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return raw;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
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

function extractLessonSerialFromName(courseName) {
  const text = String(courseName || "").trim();
  const match = text.match(/第\s*(\d+)\s*节课/i);
  if (!match?.[1]) return Number.NaN;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

function sortLessonPlans(plans) {
  const source = Array.isArray(plans) ? plans : [];
  return source
    .map((lesson, index) => ({
      lesson,
      index,
      serial: extractLessonSerialFromName(lesson?.courseName),
      label: String(lesson?.courseName || "").trim(),
    }))
    .sort((a, b) => {
      const aHasSerial = Number.isFinite(a.serial);
      const bHasSerial = Number.isFinite(b.serial);
      if (aHasSerial && bHasSerial && a.serial !== b.serial) {
        return a.serial - b.serial;
      }
      if (aHasSerial !== bHasSerial) {
        return aHasSerial ? -1 : 1;
      }
      const nameCompare = a.label.localeCompare(b.label, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      });
      if (nameCompare !== 0) return nameCompare;
      return a.index - b.index;
    })
    .map((item) => item.lesson);
}

function countLessonTaskFiles(lesson) {
  const tasks = Array.isArray(lesson?.tasks) ? lesson.tasks : [];
  return tasks.reduce((total, task) => {
    const files = Array.isArray(task?.files) ? task.files : [];
    return total + files.length;
  }, 0);
}

function WorkshopLaunchIcon() {
  return (
    <svg
      className="student-workshop-svg"
      viewBox="0 0 240 140"
      role="img"
      aria-label="元协坊入口"
    >
      <defs>
        <linearGradient id="studentWorkshopGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3d5fba" />
          <stop offset="100%" stopColor="#1f3572" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="224" height="124" rx="26" fill="url(#studentWorkshopGradient)" />
      <circle cx="72" cy="70" r="34" fill="rgba(255,255,255,0.22)" />
      <path
        d="M58 70l20-14v10h34v8H78v10z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeLinejoin="round"
      />
      <circle cx="170" cy="52" r="11" fill="rgba(255,255,255,0.88)" />
      <circle cx="187" cy="79" r="8" fill="rgba(255,255,255,0.72)" />
      <circle cx="157" cy="87" r="6" fill="rgba(255,255,255,0.58)" />
    </svg>
  );
}

export default function ModeSelectionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const storedUser = getStoredAuthUser(activeSlot);
  const teacherScopeKey = String(storedUser?.teacherScopeKey || "")
    .trim()
    .toLowerCase();
  const isShangguanTeacher = teacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;

  const [activePanel, setActivePanel] = useState("classroom");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [taskSettings, setTaskSettings] = useState({
    firstLessonDate: CLASS_TASK_FALLBACK_DATE,
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
    () => sortLessonPlans(enabledLessons),
    [enabledLessons],
  );

  useEffect(() => {
    if (sortedLessons.length === 0) {
      setSelectedCourseId("");
      return;
    }
    const hasSelected = sortedLessons.some(
      (lesson) => String(lesson?.id || "") === String(selectedCourseId || ""),
    );
    if (hasSelected) return;
    setSelectedCourseId(String(sortedLessons[0]?.id || ""));
  }, [selectedCourseId, sortedLessons]);

  const selectedCourse = useMemo(
    () =>
      sortedLessons.find(
        (lesson) => String(lesson?.id || "") === String(selectedCourseId || ""),
      ) || null,
    [selectedCourseId, sortedLessons],
  );

  const selectedCourseIndex = useMemo(
    () =>
      selectedCourse
        ? sortedLessons.findIndex(
            (lesson) => String(lesson?.id || "") === String(selectedCourse?.id || ""),
          )
        : -1,
    [selectedCourse, sortedLessons],
  );

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

  const workshopUrl = useMemo(() => withAuthSlot("/chat", activeSlot), [activeSlot]);

  function onBackToLogin() {
    clearUserAuthSession(activeSlot);
    navigate(withAuthSlot("/login", activeSlot), { replace: true });
  }

  function onOpenWorkshopInNewTab() {
    if (typeof window === "undefined") return;
    window.open(workshopUrl, "_blank", "noopener,noreferrer");
  }

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

  if (!isShangguanTeacher) {
    return <Navigate to={withAuthSlot("/chat", activeSlot)} replace />;
  }

  const sidebarItems = [
    {
      key: "classroom",
      label: "课堂任务",
      icon: BookOpenCheck,
      hint: "按节次查看教师发布的课堂任务",
    },
    {
      key: "workshop",
      label: "进入元协坊",
      icon: Sparkles,
      hint: "在新标签页进入学习协作空间",
    },
  ];

  const username = String(storedUser?.username || "").trim() || "同学";
  const avatarText = username.slice(0, 1).toUpperCase() || "学";
  const selectedTasks = Array.isArray(selectedCourse?.tasks) ? selectedCourse.tasks : [];
  const selectedTaskFileCount = countLessonTaskFiles(selectedCourse);

  return (
    <div className="teacher-home-page student-home-page">
      <div className="teacher-home-shell student-home-shell">
        <aside className="teacher-home-sidebar student-home-sidebar">
          <div className="teacher-home-profile">
            <div className="teacher-home-avatar">{avatarText}</div>
            <h1>学生主页</h1>
            <p>{username}</p>
            <dl className="teacher-home-profile-meta">
              <div>
                <dt>授课教师</dt>
                <dd>{storedUser?.teacherScopeLabel || "上官福泽"}</dd>
              </div>
              <div>
                <dt>模式</dt>
                <dd>课堂学习入口</dd>
              </div>
            </dl>
          </div>

          <nav className="teacher-home-nav student-home-nav" aria-label="学生功能菜单">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`teacher-home-nav-item${activePanel === item.key ? " active" : ""}`}
                  onClick={() => {
                    setActivePanel(item.key);
                    if (item.key === "workshop") {
                      onOpenWorkshopInNewTab();
                    }
                  }}
                  title={item.hint}
                >
                  <Icon size={17} />
                  <span className="teacher-home-nav-label">{item.label}</span>
                  {item.key === "workshop" ? (
                    <span className="teacher-home-nav-open-indicator" aria-hidden="true">
                      <ExternalLink size={13} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            className="teacher-home-logout"
            onClick={onBackToLogin}
          >
            <ArrowLeft size={15} />
            <span>退出登录</span>
          </button>
        </aside>

        <main className="teacher-home-main student-home-main">
          {activePanel === "classroom" ? (
            <div className="teacher-panel-stack student-panel-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>课堂任务</h2>
                  <p>
                    {sortedLessons.length > 0
                      ? `${firstLessonName}（${firstLessonDateLabel}） · 共 ${sortedLessons.length} 节课`
                      : "教师暂未发布可访问课时"}
                  </p>
                </div>
              </header>

              {settingsLoading ? <p className="task-status-tip">正在读取课堂任务…</p> : null}
              {settingsError ? (
                <p className="task-status-tip error" role="alert">
                  {settingsError}
                </p>
              ) : null}
              {downloadError ? (
                <p className="task-status-tip error" role="alert">
                  {downloadError}
                </p>
              ) : null}

              <section className="teacher-card teacher-lesson-workbench student-lesson-workbench">
                <div className="teacher-lesson-list-panel student-lesson-list-panel">
                  <div className="teacher-lesson-list-head">
                    <h3>课时列表</h3>
                    <div className="teacher-lesson-list-head-right">
                      <span>{`${sortedLessons.length} 节课`}</span>
                    </div>
                  </div>

                  {sortedLessons.length === 0 ? (
                    <p className="teacher-empty-text">暂未找到可访问课时。</p>
                  ) : (
                    <div className="teacher-lesson-list">
                      {sortedLessons.map((course, index) => {
                        const courseId = String(course?.id || "");
                        const active = courseId === String(selectedCourseId || "");
                        const tasks = Array.isArray(course?.tasks) ? course.tasks : [];
                        return (
                          <article
                            key={courseId || `lesson-${index + 1}`}
                            className={`teacher-lesson-row${active ? " active" : ""}`}
                          >
                            <button
                              type="button"
                              className="teacher-lesson-row-main"
                              onClick={() => setSelectedCourseId(courseId)}
                            >
                              <strong>{course?.courseName || `第${index + 1}节课`}</strong>
                              <p>{formatLessonTimeLabel(course)}</p>
                              <span>{`${tasks.length} 个任务`}</span>
                            </button>
                            <div className="teacher-lesson-row-actions">
                              <span className={`teacher-lesson-status${course?.enabled === false ? " closed" : ""}`}>
                                {course?.enabled === false ? "未开放" : "已开放"}
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="teacher-lesson-detail-panel student-lesson-detail-panel">
                  {!selectedCourse ? (
                    <p className="teacher-empty-text">请选择左侧课时查看任务详情。</p>
                  ) : (
                    <>
                      <div className="teacher-task-draft-head student-lesson-detail-head">
                        <strong>
                          {selectedCourse?.courseName || `第${selectedCourseIndex + 1}节课`}
                        </strong>
                        <span>{formatLessonTimeLabel(selectedCourse)}</span>
                      </div>

                      <div className="teacher-lesson-detail-scroll">
                        <div className="teacher-grid-two student-lesson-meta-grid">
                          <div className="teacher-info-line">
                            <strong>任务数量</strong>
                            <span>{`${selectedTasks.length} 个`}</span>
                          </div>
                          <div className="teacher-info-line">
                            <strong>任务附件数</strong>
                            <span>{`${selectedTaskFileCount} 个`}</span>
                          </div>
                          {String(selectedCourse?.notes || "").trim() ? (
                            <div className="teacher-info-line teacher-span-two">
                              <strong>课时备注</strong>
                              <span>{String(selectedCourse.notes || "").trim()}</span>
                            </div>
                          ) : null}
                        </div>

                        <section className="student-lesson-section">
                          <h3>课堂任务</h3>
                          {selectedTasks.length === 0 ? (
                            <p className="teacher-empty-text">本节课暂无任务内容。</p>
                          ) : (
                            <div className="task-lesson-list">
                              {selectedTasks.map((task, index) => {
                                const taskFiles = Array.isArray(task?.files) ? task.files : [];
                                const taskTypeLabel = task?.type === "link" ? "链接任务" : "文字任务";
                                const taskContent = String(task?.content || "").trim();
                                return (
                                  <article
                                    key={String(task?.id || `task-${index + 1}`)}
                                    className="task-lesson-item"
                                  >
                                    <header>
                                      <strong>{task?.title || `任务 ${index + 1}`}</strong>
                                      <span>{taskTypeLabel}</span>
                                    </header>

                                    {task?.type === "link" && taskContent ? (
                                      <a
                                        href={taskContent}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="student-task-link"
                                      >
                                        打开任务链接
                                      </a>
                                    ) : null}

                                    {task?.type !== "link" && taskContent ? (
                                      <p className="student-task-content">{taskContent}</p>
                                    ) : null}

                                    {taskFiles.length > 0 ? (
                                      <div className="task-lesson-file-list">
                                        {taskFiles.map((file, fileIndex) => {
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
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </section>

                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="teacher-panel-stack student-panel-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>元协坊</h2>
                  <p>点击右侧图标，新标签页打开元协坊学习空间。</p>
                </div>
              </header>

              <section className="teacher-card student-workshop-card">
                <WorkshopLaunchIcon />
                <p>这里是元协坊的快捷入口，你可以继续对话、创作和协作学习。</p>
                <button
                  type="button"
                  className="teacher-primary-btn student-workshop-open-btn"
                  onClick={onOpenWorkshopInNewTab}
                >
                  <Sparkles size={16} />
                  <span>新标签页打开元协坊</span>
                </button>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

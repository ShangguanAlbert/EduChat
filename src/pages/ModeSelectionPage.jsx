import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Download,
  ExternalLink,
  Image,
  LayoutGrid,
  Lock,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  clearUserAuthSession,
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { appendReturnUrlParam, buildAbsoluteAppUrl } from "../app/returnNavigation.js";
import { SHANGGUAN_FUZE_TEACHER_SCOPE_KEY } from "../../shared/teacherScopes.js";
import {
  deleteClassroomHomeworkFile,
  downloadClassroomLessonFile,
  fetchClassroomHomeworkSubmissions,
  fetchClassroomTaskSettings,
  updateClassroomSeatAssignment,
  uploadClassroomHomeworkFiles,
} from "./classroom/classroomApi.js";
import "../styles/teacher-home.css";
import "../styles/mode-selection.css";
import "../styles/student-home.css";

const CLASS_TASK_FALLBACK_DATE = "2026-03-11";

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

function formatUploadTime(input) {
  if (!input) return "--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function splitFileName(input) {
  const raw = String(input || "").trim();
  if (!raw) return { base: "", ext: "" };
  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= raw.length - 1) {
    return { base: raw, ext: "" };
  }
  return {
    base: raw.slice(0, dotIndex),
    ext: raw.slice(dotIndex),
  };
}

function normalizeHomeworkFileName(inputName, originalName) {
  const typed = String(inputName || "").trim();
  const original = String(originalName || "").trim();
  if (!typed) return original || "作业文件";
  const typedParts = splitFileName(typed);
  if (typedParts.ext) return typed;
  const originalParts = splitFileName(original);
  if (originalParts.ext) {
    return `${typed}${originalParts.ext}`;
  }
  return typed;
}

function parseTaskLinks(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function splitTaskTextContent(content) {
  const raw = String(content || "").trim();
  if (!raw) {
    return {
      body: "",
      highlight: "",
    };
  }
  const lines = raw.split(/\r?\n/);
  const highlightStart = lines.findIndex(
    (line, index) => index > 0 && /^最后\s*[:：]?/.test(String(line || "").trim()),
  );
  if (highlightStart < 0) {
    return {
      body: raw,
      highlight: "",
    };
  }
  return {
    body: lines.slice(0, highlightStart).join("\n").trim(),
    highlight: lines.slice(highlightStart).join("\n").trim(),
  };
}

function resolveTaskLinkLabel(linkUrl) {
  const raw = String(linkUrl || "").trim();
  if (!raw) return "任务链接";
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").trim().replace(/^www\./i, "");
    if (host) return host;
    return raw;
  } catch {
    return raw;
  }
}

function resolveTaskLinkCtaLabel(linkUrl, linkIndex = 0, total = 1) {
  const hostLabel = resolveTaskLinkLabel(linkUrl);
  if (total <= 1) return `打开 ${hostLabel}`;
  return `打开链接 ${linkIndex + 1} · ${hostLabel}`;
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

function toSeatIndexNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return -1;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

function normalizeStudentSeatLayout(input) {
  const source = input && typeof input === "object" ? input : {};
  const rows = Math.max(3, Math.min(10, Number.parseInt(String(source.rows || 6), 10) || 6));
  const columns = Math.max(3, Math.min(10, Number.parseInt(String(source.columns || 8), 10) || 8));
  const seatCount = rows * columns;
  const sourceSeats = Array.isArray(source.seats) ? source.seats : [];
  const seats = Array.from({ length: seatCount }, (_, index) => String(sourceSeats[index] || ""));
  const mySeatIndexRaw = toSeatIndexNumber(source.mySeatIndex);
  const mySeatIndex =
    mySeatIndexRaw >= 0 && mySeatIndexRaw < seats.length ? mySeatIndexRaw : -1;
  return {
    className: String(source.className || "").trim(),
    rows,
    columns,
    seats,
    studentFillEnabled: source.studentFillEnabled !== false,
    teacherLocked: source.teacherLocked === true,
    mySeatIndex,
    mySeatValue: String(source.mySeatValue || "").trim(),
    myDisplayValue: String(source.myDisplayValue || "").trim(),
    updatedAt: String(source.updatedAt || ""),
  };
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
          <stop offset="0%" stopColor="#da7756" />
          <stop offset="100%" stopColor="#c15f3c" />
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
  const homeworkFileInputRef = useRef(null);
  const seatSelectedIndexRef = useRef("");
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
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [homeworkError, setHomeworkError] = useState("");
  const [homeworkUploadingLessonId, setHomeworkUploadingLessonId] = useState("");
  const [deletingHomeworkFileId, setDeletingHomeworkFileId] = useState("");
  const [homeworkDraftFilesByLesson, setHomeworkDraftFilesByLesson] = useState({});
  const [homeworkSubmissionsByLesson, setHomeworkSubmissionsByLesson] = useState({});
  const [homeworkComposerOpenLessonId, setHomeworkComposerOpenLessonId] = useState("");
  const [homeworkDropActive, setHomeworkDropActive] = useState(false);
  const [seatSaving, setSeatSaving] = useState(false);
  const [seatRefreshing, setSeatRefreshing] = useState(false);
  const [seatError, setSeatError] = useState("");
  const [seatSelectedIndex, setSeatSelectedIndex] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [taskSettings, setTaskSettings] = useState({
    firstLessonDate: CLASS_TASK_FALLBACK_DATE,
    teacherCoursePlans: [],
    seatLayout: null,
  });

  useEffect(() => {
    seatSelectedIndexRef.current = seatSelectedIndex;
  }, [seatSelectedIndex]);

  const applyTaskSettings = useCallback((data, options = {}) => {
    const {
      preservePendingSeatSelection = false,
      reportOccupiedSelection = false,
    } = options;
    const nextSeatLayout = data?.seatLayout ? normalizeStudentSeatLayout(data.seatLayout) : null;
    setTaskSettings({
      firstLessonDate: String(
        data?.firstLessonDate || CLASS_TASK_FALLBACK_DATE,
      ),
      teacherCoursePlans: Array.isArray(data?.teacherCoursePlans)
        ? data.teacherCoursePlans
        : [],
      seatLayout: nextSeatLayout,
    });
    if (!nextSeatLayout) {
      setSeatSelectedIndex("");
      return;
    }
    if (nextSeatLayout.mySeatIndex >= 0) {
      setSeatSelectedIndex(String(nextSeatLayout.mySeatIndex));
      return;
    }

    const currentSelectedIndex = toSeatIndexNumber(seatSelectedIndexRef.current);
    if (
      preservePendingSeatSelection &&
      currentSelectedIndex >= 0 &&
      currentSelectedIndex < nextSeatLayout.seats.length
    ) {
      const selectedSeatValue = String(nextSeatLayout.seats[currentSelectedIndex] || "").trim();
      if (!selectedSeatValue) {
        setSeatSelectedIndex(String(currentSelectedIndex));
        return;
      }
      if (reportOccupiedSelection) {
        setSeatError("你刚选择的座位已被其他同学占用，已刷新为最新状态。");
      }
    }

    setSeatSelectedIndex("");
  }, []);

  useEffect(() => {
    if (!isShangguanTeacher) return;
    let cancelled = false;

    async function loadTaskSettings() {
      setSettingsLoading(true);
      setSettingsError("");
      setHomeworkLoading(true);
      setHomeworkError("");
      try {
        const [data, homeworkData] = await Promise.all([
          fetchClassroomTaskSettings(),
          fetchClassroomHomeworkSubmissions().catch(() => ({
            submissionsByLesson: {},
          })),
        ]);
        if (cancelled) return;
        applyTaskSettings(data);
        setSeatError("");
        setHomeworkSubmissionsByLesson(
          homeworkData && typeof homeworkData === "object"
            ? homeworkData.submissionsByLesson && typeof homeworkData.submissionsByLesson === "object"
              ? homeworkData.submissionsByLesson
              : {}
            : {},
        );
      } catch (error) {
        if (cancelled) return;
        setSettingsError(readErrorMessage(error));
        setHomeworkSubmissionsByLesson({});
        setSeatError("");
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
          setHomeworkLoading(false);
        }
      }
    }

    loadTaskSettings();

    return () => {
      cancelled = true;
    };
  }, [applyTaskSettings, isShangguanTeacher]);

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

  useEffect(() => {
    if (!homeworkComposerOpenLessonId) return;
    const exists = sortedLessons.some(
      (lesson) => String(lesson?.id || "") === String(homeworkComposerOpenLessonId || ""),
    );
    if (!exists) {
      setHomeworkComposerOpenLessonId("");
      setHomeworkDropActive(false);
    }
  }, [homeworkComposerOpenLessonId, sortedLessons]);

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

  const modeSelectionReturnUrl = useMemo(
    () => buildAbsoluteAppUrl("/mode-selection", activeSlot),
    [activeSlot],
  );
  const workshopUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("returnTo", "mode-selection");
    if (modeSelectionReturnUrl) {
      appendReturnUrlParam(params, modeSelectionReturnUrl);
    }
    return withAuthSlot(`/chat?${params.toString()}`, activeSlot);
  }, [activeSlot, modeSelectionReturnUrl]);

  function onBackToLogin() {
    clearUserAuthSession(activeSlot);
    navigate(withAuthSlot("/login", activeSlot), { replace: true });
  }

  function onOpenWorkshopInNewTab() {
    if (typeof window === "undefined") return;
    window.open(workshopUrl, "_blank", "noopener,noreferrer");
  }

  function onOpenImageGeneration() {
    const params = new URLSearchParams();
    params.set("returnTo", "mode-selection");
    if (modeSelectionReturnUrl) {
      appendReturnUrlParam(params, modeSelectionReturnUrl);
    }
    navigate(withAuthSlot(`/image-generation?${params.toString()}`, activeSlot));
  }

  function onOpenParty() {
    const params = new URLSearchParams();
    params.set("returnTo", "mode-selection");
    if (modeSelectionReturnUrl) {
      appendReturnUrlParam(params, modeSelectionReturnUrl);
    }
    navigate(withAuthSlot(`/party?${params.toString()}`, activeSlot));
  }

  function appendHomeworkDraftFiles(lessonId, fileList) {
    const safeLessonId = String(lessonId || "").trim();
    if (!safeLessonId) return;
    const files = Array.from(fileList || []).filter(
      (file) => file && typeof file === "object" && typeof file.name === "string" && file.size > 0,
    );
    if (files.length === 0) return;
    setHomeworkDraftFilesByLesson((current) => {
      const existing = Array.isArray(current[safeLessonId]) ? current[safeLessonId] : [];
      const nextItems = files.map((file, fileIndex) => {
        const { base } = splitFileName(file.name);
        return {
          id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}-${fileIndex}`,
          file,
          fileName: base || file.name || `作业文件-${fileIndex + 1}`,
          originalName: file.name || `作业文件-${fileIndex + 1}`,
        };
      });
      return {
        ...current,
        [safeLessonId]: [...existing, ...nextItems].slice(0, 30),
      };
    });
    setHomeworkError("");
  }

  function onOpenHomeworkSubmit() {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    if (!safeLessonId || !selectedHomeworkUploadEnabled) return;
    setHomeworkComposerOpenLessonId(safeLessonId);
    setHomeworkDropActive(false);
    setHomeworkError("");
  }

  function onCloseHomeworkSubmit() {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    if (safeLessonId) {
      setHomeworkDraftFilesByLesson((current) => ({
        ...current,
        [safeLessonId]: [],
      }));
    }
    setHomeworkComposerOpenLessonId("");
    setHomeworkDropActive(false);
    setHomeworkError("");
  }

  function onHomeworkInputChange(event) {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    appendHomeworkDraftFiles(safeLessonId, event?.target?.files || []);
    if (event?.target) {
      event.target.value = "";
    }
  }

  function onHomeworkDraftFileNameChange(itemId, value) {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    const safeItemId = String(itemId || "").trim();
    if (!safeLessonId || !safeItemId) return;
    setHomeworkDraftFilesByLesson((current) => {
      const list = Array.isArray(current[safeLessonId]) ? current[safeLessonId] : [];
      const nextList = list.map((item) =>
        String(item?.id || "") === safeItemId
          ? {
              ...item,
              fileName: String(value || ""),
            }
          : item,
      );
      return {
        ...current,
        [safeLessonId]: nextList,
      };
    });
  }

  function onRemoveHomeworkDraftFile(itemId) {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    const safeItemId = String(itemId || "").trim();
    if (!safeLessonId || !safeItemId) return;
    setHomeworkDraftFilesByLesson((current) => {
      const list = Array.isArray(current[safeLessonId]) ? current[safeLessonId] : [];
      const nextList = list.filter((item) => String(item?.id || "") !== safeItemId);
      return {
        ...current,
        [safeLessonId]: nextList,
      };
    });
  }

  function onHomeworkDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setHomeworkDropActive(false);
    const safeLessonId = String(selectedCourse?.id || "").trim();
    appendHomeworkDraftFiles(safeLessonId, event?.dataTransfer?.files || []);
  }

  async function onUploadHomeworkFiles() {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    if (!safeLessonId || !selectedHomeworkUploadEnabled) return;
    const draftList = Array.isArray(homeworkDraftFilesByLesson[safeLessonId])
      ? homeworkDraftFilesByLesson[safeLessonId]
      : [];
    if (draftList.length === 0) {
      setHomeworkError("请先添加作业文件，再点击上传。");
      return;
    }

    setHomeworkError("");
    setHomeworkUploadingLessonId(safeLessonId);
    try {
      const payload = draftList
        .map((item) => {
          const file = item?.file;
          if (!file || typeof file !== "object" || typeof file.name !== "string") return null;
          return {
            file,
            fileName: normalizeHomeworkFileName(item?.fileName, item?.originalName || file.name),
          };
        })
        .filter(Boolean);
      if (payload.length === 0) {
        setHomeworkError("当前没有可上传的作业文件。");
        return;
      }
      const data = await uploadClassroomHomeworkFiles(safeLessonId, payload);
      const submissions = Array.isArray(data?.submissions) ? data.submissions : [];
      setHomeworkSubmissionsByLesson((current) => ({
        ...current,
        [safeLessonId]: submissions,
      }));
      setHomeworkDraftFilesByLesson((current) => ({
        ...current,
        [safeLessonId]: [],
      }));
    } catch (error) {
      setHomeworkError(error?.message || "作业上传失败，请稍后重试。");
    } finally {
      setHomeworkUploadingLessonId("");
    }
  }

  async function onDeleteHomeworkUploadedFile(fileId) {
    const safeLessonId = String(selectedCourse?.id || "").trim();
    const safeFileId = String(fileId || "").trim();
    if (!safeLessonId || !safeFileId) return;
    setHomeworkError("");
    setDeletingHomeworkFileId(safeFileId);
    try {
      const data = await deleteClassroomHomeworkFile(safeLessonId, safeFileId);
      const submissions = Array.isArray(data?.submissions) ? data.submissions : [];
      setHomeworkSubmissionsByLesson((current) => ({
        ...current,
        [safeLessonId]: submissions,
      }));
    } catch (error) {
      setHomeworkError(error?.message || "删除作业文件失败，请稍后重试。");
    } finally {
      setDeletingHomeworkFileId("");
    }
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

  const sidebarItems = [
    {
      key: "classroom",
      label: "课堂任务",
      icon: BookOpenCheck,
      hint: "按节次查看教师发布的课堂任务",
    },
    {
      key: "seat-selection",
      label: "座位选择",
      icon: LayoutGrid,
      hint: "查看教室座位并选择本学期固定座位",
    },
    {
      key: "workshop",
      label: "进入元协坊",
      icon: Sparkles,
      hint: "在新标签页进入学习协作空间",
    },
    {
      key: "image-generation",
      label: "图片生成",
      icon: Image,
      hint: "进入元协坊图片生成功能",
    },
    {
      key: "party",
      label: "派 · 协作",
      icon: Users,
      hint: "进入元协坊派协作功能",
    },
  ];

  const username = String(storedUser?.username || "").trim() || "同学";
  const avatarText = username.slice(0, 1).toUpperCase() || "学";
  const selectedLessonId = String(selectedCourse?.id || "").trim();
  const selectedTasks = Array.isArray(selectedCourse?.tasks) ? selectedCourse.tasks : [];
  const selectedHomeworkUploadEnabled = selectedCourse?.homeworkUploadEnabled === true;
  const homeworkComposerOpen =
    selectedHomeworkUploadEnabled && selectedLessonId === String(homeworkComposerOpenLessonId || "");
  const selectedHomeworkDraftFiles = selectedLessonId
    ? Array.isArray(homeworkDraftFilesByLesson[selectedLessonId])
      ? homeworkDraftFilesByLesson[selectedLessonId]
      : []
    : [];
  const selectedHomeworkSubmissions = selectedLessonId
    ? Array.isArray(homeworkSubmissionsByLesson[selectedLessonId])
      ? homeworkSubmissionsByLesson[selectedLessonId]
      : []
    : [];
  const homeworkUploading = homeworkUploadingLessonId === selectedLessonId;
  const classroomSeatLayout = useMemo(
    () => (taskSettings.seatLayout ? normalizeStudentSeatLayout(taskSettings.seatLayout) : null),
    [taskSettings.seatLayout],
  );
  const classroomSeatFillWritable =
    !!classroomSeatLayout &&
    classroomSeatLayout.studentFillEnabled &&
    !classroomSeatLayout.teacherLocked;
  const classroomSeatMyIndex = classroomSeatLayout ? classroomSeatLayout.mySeatIndex : -1;
  const classroomSeatItems = useMemo(() => {
    if (!classroomSeatLayout) return [];
    return classroomSeatLayout.seats.map((seatValue, index) => {
      const row = Math.floor(index / classroomSeatLayout.columns) + 1;
      const column = (index % classroomSeatLayout.columns) + 1;
      const valueText = String(seatValue || "").trim();
      return {
        index,
        row,
        column,
        value: valueText,
        occupied: !!valueText,
        isMine: classroomSeatMyIndex >= 0 && classroomSeatMyIndex === index,
      };
    });
  }, [classroomSeatLayout, classroomSeatMyIndex]);
  const classroomSeatSelectableItems = useMemo(
    () => classroomSeatItems.filter((item) => item.isMine || !item.occupied),
    [classroomSeatItems],
  );
  const classroomSeatSelectedIndexNumber = toSeatIndexNumber(seatSelectedIndex);
  const classroomSeatHasSelection =
    classroomSeatSelectedIndexNumber >= 0 &&
    classroomSeatSelectedIndexNumber < classroomSeatItems.length;
  const classroomSeatSelectedItem = classroomSeatHasSelection
    ? classroomSeatItems[classroomSeatSelectedIndexNumber]
    : null;
  const classroomSeatSelectionMatchesCurrent =
    classroomSeatSelectedIndexNumber === classroomSeatMyIndex;
  const classroomSeatSelectedRowNumber = classroomSeatSelectedItem?.row || 0;
  const classroomSeatSelectedColumnNumber = classroomSeatSelectedItem?.column || 0;
  const classroomSeatSelectableRows = useMemo(() => {
    const rowMap = new Map();
    classroomSeatSelectableItems.forEach((item) => {
      if (!rowMap.has(item.row)) {
        rowMap.set(item.row, {
          row: item.row,
          count: 0,
        });
      }
      rowMap.get(item.row).count += 1;
    });
    return Array.from(rowMap.values()).sort((a, b) => a.row - b.row);
  }, [classroomSeatSelectableItems]);
  const classroomSeatSelectableColumns = useMemo(() => {
    if (!classroomSeatSelectedRowNumber) return [];
    return classroomSeatSelectableItems
      .filter((item) => item.row === classroomSeatSelectedRowNumber)
      .sort((a, b) => a.column - b.column);
  }, [classroomSeatSelectableItems, classroomSeatSelectedRowNumber]);

  function onSelectSeatIndex(nextSeatIndex) {
    const targetSeatIndex = toSeatIndexNumber(nextSeatIndex);
    if (targetSeatIndex < 0 || targetSeatIndex >= classroomSeatItems.length) return;
    const nextSeat = classroomSeatItems[targetSeatIndex];
    if (!nextSeat) return;
    if (!nextSeat.isMine && nextSeat.occupied) return;
    setSeatSelectedIndex(String(targetSeatIndex));
    if (seatError) setSeatError("");
  }

  function onSelectSeatRow(nextRowValue) {
    const nextRow = Number.parseInt(String(nextRowValue || "").trim(), 10);
    if (!Number.isFinite(nextRow) || nextRow <= 0) {
      setSeatSelectedIndex("");
      if (seatError) setSeatError("");
      return;
    }
    const preferredColumn = classroomSeatSelectedColumnNumber || 1;
    const matchedSeat =
      classroomSeatSelectableItems.find(
        (item) => item.row === nextRow && item.column === preferredColumn,
      ) || classroomSeatSelectableItems.find((item) => item.row === nextRow);
    if (!matchedSeat) return;
    onSelectSeatIndex(matchedSeat.index);
  }

  function onSelectSeatColumn(nextColumnValue) {
    const nextColumn = Number.parseInt(String(nextColumnValue || "").trim(), 10);
    if (!Number.isFinite(nextColumn) || nextColumn <= 0 || !classroomSeatSelectedRowNumber) return;
    const matchedSeat = classroomSeatSelectableItems.find(
      (item) => item.row === classroomSeatSelectedRowNumber && item.column === nextColumn,
    );
    if (!matchedSeat) return;
    onSelectSeatIndex(matchedSeat.index);
  }

  async function onSaveSeatSelection() {
    if (!classroomSeatLayout) return;
    if (!classroomSeatFillWritable) {
      setSeatError(classroomSeatLayout.teacherLocked ? "教师已锁定当前班级座位。" : "教师暂未开放学生填写。");
      return;
    }
    if (!classroomSeatHasSelection) {
      setSeatError("请先选择一个空座位。");
      return;
    }
    setSeatSaving(true);
    setSeatError("");
    let shouldRefreshLatestSeatLayout = false;
    let conflictErrorMessage = "";
    try {
      const data = await updateClassroomSeatAssignment(classroomSeatSelectedIndexNumber);
      const nextSeatLayout = data?.seatLayout ? normalizeStudentSeatLayout(data.seatLayout) : null;
      setTaskSettings((current) => ({
        ...current,
        seatLayout: nextSeatLayout,
      }));
      setSeatSelectedIndex(
        nextSeatLayout && nextSeatLayout.mySeatIndex >= 0 ? String(nextSeatLayout.mySeatIndex) : "",
      );
      shouldRefreshLatestSeatLayout = true;
    } catch (error) {
      const message = error?.message || "保存座位失败，请稍后重试。";
      if (message.includes("已被占用")) {
        conflictErrorMessage = "你选择的座位刚刚被其他同学占用，已刷新为最新状态。";
        shouldRefreshLatestSeatLayout = true;
      } else {
        setSeatError(message);
      }
    } finally {
      setSeatSaving(false);
    }

    if (shouldRefreshLatestSeatLayout) {
      await onRefreshSeatLayout({
        silent: true,
        preservePendingSeatSelection: false,
        reportOccupiedSelection: false,
        force: true,
      });
    }
    if (conflictErrorMessage) {
      setSeatError(conflictErrorMessage);
    }
  }

  const onRefreshSeatLayout = useCallback(async (options = {}) => {
    const {
      silent = false,
      preservePendingSeatSelection = true,
      reportOccupiedSelection = true,
      force = false,
    } = options;
    if (!isShangguanTeacher) return false;
    if (!force && (seatRefreshing || seatSaving)) return false;
    setSeatRefreshing(true);
    if (!silent) {
      setSettingsError("");
    }
    try {
      const data = await fetchClassroomTaskSettings();
      applyTaskSettings(data, {
        preservePendingSeatSelection,
        reportOccupiedSelection,
      });
      if (!reportOccupiedSelection) {
        setSeatError("");
      }
      return true;
    } catch (error) {
      if (!silent) {
        setSettingsError(readErrorMessage(error));
      }
      return false;
    } finally {
      setSeatRefreshing(false);
    }
  }, [applyTaskSettings, isShangguanTeacher, seatRefreshing, seatSaving]);

  useEffect(() => {
    if (!isShangguanTeacher || activePanel !== "seat-selection") return undefined;
    const timer = window.setInterval(() => {
      void onRefreshSeatLayout({
        silent: true,
        preservePendingSeatSelection: true,
        reportOccupiedSelection: true,
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activePanel, isShangguanTeacher, onRefreshSeatLayout]);

  if (!isShangguanTeacher) {
    return <Navigate to={withAuthSlot("/chat", activeSlot)} replace />;
  }

  return (
    <div className="teacher-home-page student-home-page">
      <div className="teacher-home-shell student-home-shell">
        <aside className="teacher-home-sidebar student-home-sidebar">
          <div className="teacher-home-profile student-home-brand">
            <div className="student-home-brand-row">
              <div className="teacher-home-avatar student-home-brand-mark">{avatarText}</div>
              <div className="student-home-brand-copy">
                <h1>学生主页</h1>
                <p>{username}</p>
              </div>
            </div>
            <dl className="teacher-home-profile-meta student-home-brand-meta">
              <div>
                <dt>授课教师</dt>
                <dd>{storedUser?.teacherScopeLabel || "上官福泽"}</dd>
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
                      return;
                    }
                    if (item.key === "image-generation") {
                      onOpenImageGeneration();
                      return;
                    }
                    if (item.key === "party") {
                      onOpenParty();
                      return;
                    }
                  }}
                  title={item.hint}
                >
                  <Icon size={17} />
                  <span className="teacher-home-nav-label">{item.label}</span>
                  {item.key === "workshop" ||
                  item.key === "image-generation" ||
                  item.key === "party" ? (
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
                  <p>查看课时任务、课时备注和作业提交入口。</p>
                </div>
              </header>

              {settingsLoading || homeworkLoading ? (
                <div
                  className="student-classroom-loading"
                  role="status"
                  aria-live="polite"
                  aria-label="正在读取课堂任务"
                >
                  <span className="student-classroom-loading-spinner" />
                </div>
              ) : null}
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
              {homeworkError ? (
                <p className="task-status-tip error" role="alert">
                  {homeworkError}
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
                              onClick={() => {
                                setSelectedCourseId(courseId);
                                setHomeworkDropActive(false);
                              }}
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
                          <div className="teacher-info-line teacher-span-two student-homework-submit-card">
                            <strong>作业提交</strong>
                            <button
                              type="button"
                              className={`student-homework-submit-btn${
                                selectedHomeworkUploadEnabled ? "" : " locked"
                              }`}
                              onClick={onOpenHomeworkSubmit}
                              disabled={!selectedHomeworkUploadEnabled}
                            >
                              {selectedHomeworkUploadEnabled ? <Upload size={15} /> : <Lock size={15} />}
                              <span>{selectedHomeworkUploadEnabled ? "提交作业" : "教师暂未开启作业上传"}</span>
                            </button>
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
                                const taskLinks = task?.type === "link" ? parseTaskLinks(taskContent) : [];
                                const taskDescription =
                                  task?.type === "link" ? String(task?.description || "").trim() : "";
                                const textSections =
                                  task?.type === "link"
                                    ? { body: "", highlight: "" }
                                    : splitTaskTextContent(taskContent);
                                return (
                                  <article
                                    key={String(task?.id || `task-${index + 1}`)}
                                    className={`task-lesson-item student-task-item${
                                      task?.type === "link" ? " student-task-item-link" : " student-task-item-text"
                                    }`}
                                  >
                                    <header className="student-task-item-head">
                                      <div className="student-task-item-title">
                                        <strong>{task?.title || `任务 ${index + 1}`}</strong>
                                      </div>
                                      <span>{taskTypeLabel}</span>
                                    </header>

                                    <div className="student-task-item-body">
                                      {task?.type === "link" && taskDescription ? (
                                        <p className="student-task-link-description">{taskDescription}</p>
                                      ) : null}

                                      {task?.type === "link" && taskLinks.length > 0 ? (
                                        <div className="student-task-link-list">
                                          {taskLinks.map((linkUrl, linkIndex) => (
                                            <a
                                              key={`${task?.id || index}-link-${linkIndex + 1}`}
                                              href={linkUrl}
                                              target="_blank"
                                              rel="noreferrer noopener"
                                              className="student-task-link-cta"
                                            >
                                              <ExternalLink size={15} />
                                              <span>
                                                {resolveTaskLinkCtaLabel(
                                                  linkUrl,
                                                  linkIndex,
                                                  taskLinks.length,
                                                )}
                                              </span>
                                            </a>
                                          ))}
                                        </div>
                                      ) : null}

                                      {task?.type !== "link" && taskContent ? (
                                        <div className="student-task-text-block">
                                          <h4>任务说明</h4>
                                          {textSections.body ? (
                                            <p className="student-task-content">{textSections.body}</p>
                                          ) : null}
                                          {textSections.highlight ? (
                                            <div className="student-task-highlight">
                                              {textSections.highlight}
                                            </div>
                                          ) : null}
                                        </div>
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
                                    </div>
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

              {homeworkComposerOpen && selectedCourse ? (
                <div
                  className="student-homework-modal-overlay"
                  role="presentation"
                  onClick={onCloseHomeworkSubmit}
                >
                  <div
                    className="student-homework-modal-card"
                    role="dialog"
                    aria-modal="true"
                    aria-label="提交作业"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="student-homework-modal-head">
                      <div>
                        <h3>提交作业</h3>
                        <p>{selectedCourse?.courseName || "当前课时"}</p>
                      </div>
                      <button
                        type="button"
                        className="student-homework-modal-close"
                        onClick={onCloseHomeworkSubmit}
                        aria-label="关闭上传弹窗"
                        title="关闭上传弹窗"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <input
                      ref={homeworkFileInputRef}
                      type="file"
                      multiple
                      className="task-hidden-file-input"
                      onChange={onHomeworkInputChange}
                    />
                    <div
                      className={`task-homework-dropzone${homeworkDropActive ? " active" : ""}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setHomeworkDropActive(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!homeworkDropActive) setHomeworkDropActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setHomeworkDropActive(false);
                      }}
                      onDrop={onHomeworkDrop}
                    >
                      <p>拖拽作业文件到这里，或点击下方按钮添加</p>
                      <p className="task-status-tip">单个文件最大 50MB，每次最多可上传 6 个文件。</p>
                      <button
                        type="button"
                        className="task-homework-upload-btn"
                        onClick={() => homeworkFileInputRef.current?.click()}
                        disabled={homeworkUploading}
                      >
                        <Upload size={15} />
                        <span>{homeworkUploading ? "上传中..." : "添加作业文件"}</span>
                      </button>
                    </div>
                    {selectedHomeworkDraftFiles.length > 0 ? (
                      <div className="task-homework-draft-list">
                        {selectedHomeworkDraftFiles.map((item) => (
                          <div
                            key={item?.id || `${selectedLessonId}-${item?.originalName}`}
                            className="task-homework-draft-item"
                          >
                            <input
                              type="text"
                              value={item?.fileName || ""}
                              onChange={(event) =>
                                onHomeworkDraftFileNameChange(item?.id, event.target.value)
                              }
                              placeholder="输入文件名称"
                            />
                            <span>{formatFileSize(item?.file?.size)}</span>
                            <button
                              type="button"
                              className="task-homework-remove-btn"
                              onClick={() => onRemoveHomeworkDraftFile(item?.id)}
                              aria-label="移除待上传文件"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="task-homework-submit-btn"
                          onClick={() => void onUploadHomeworkFiles()}
                          disabled={homeworkUploading}
                        >
                          {homeworkUploading ? "正在上传..." : "上传作业"}
                        </button>
                      </div>
                    ) : (
                      <p className="task-status-tip">可上传多个文件，上传前可在文本框内重命名。</p>
                    )}
                    {selectedHomeworkSubmissions.length > 0 ? (
                      <div className="task-homework-uploaded-list">
                        {selectedHomeworkSubmissions.map((file, index) => (
                          <div
                            key={file?.id || `${selectedLessonId}-uploaded-${index + 1}`}
                            className="task-homework-uploaded-item"
                          >
                            <div className="task-homework-uploaded-meta">
                              <strong>{file?.name || "作业文件"}</strong>
                              <span>{formatFileSize(file?.size)}</span>
                              <small>{`上传于 ${formatUploadTime(file?.uploadedAt)}`}</small>
                            </div>
                            <button
                              type="button"
                              className="task-homework-remove-btn"
                              onClick={() => void onDeleteHomeworkUploadedFile(file?.id)}
                              disabled={
                                !file?.id || deletingHomeworkFileId === String(file?.id || "")
                              }
                              aria-label="删除已上传文件"
                              title="删除已上传文件"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : activePanel === "seat-selection" ? (
            <div className="teacher-panel-stack student-panel-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>座位选择</h2>
                  <p>本学期固定座位统一在这里填写，不再放在每节课里。</p>
                </div>
                <div className="teacher-panel-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                    onClick={() => void onRefreshSeatLayout()}
                    disabled={seatRefreshing}
                    aria-label={seatRefreshing ? "正在刷新座位" : "刷新座位"}
                    title={seatRefreshing ? "正在刷新座位" : "刷新座位"}
                  >
                    <RefreshCw size={15} className={seatRefreshing ? "is-spinning" : ""} />
                  </button>
                </div>
              </header>

              {settingsLoading ? <p className="task-status-tip">正在读取座位信息…</p> : null}
              {settingsError ? (
                <p className="task-status-tip error" role="alert">
                  {settingsError}
                </p>
              ) : null}

              {!settingsLoading && !classroomSeatLayout ? (
                <section className="teacher-card student-seat-selection-card">
                  <p className="teacher-empty-text">教师还没有为你所在班级设置座位表，请稍后再来查看。</p>
                </section>
              ) : null}

              {classroomSeatLayout ? (
                <section className="teacher-card student-seat-selection-card">
                  <div className="student-seat-fill-head">
                    <strong>教室座位预览</strong>
                    <span>{`班级：${classroomSeatLayout.className || "--"}`}</span>
                  </div>

                  <div className="student-seat-fill-status">
                    <span>{`讲台下方共 ${classroomSeatLayout.rows} 行 × ${classroomSeatLayout.columns} 列`}</span>
                    <span>{`学生填写：${classroomSeatLayout.studentFillEnabled ? "已开放" : "已关闭"}`}</span>
                    <span>{`教师锁定：${classroomSeatLayout.teacherLocked ? "已锁定" : "未锁定"}`}</span>
                    <span>
                      {classroomSeatMyIndex >= 0
                        ? `我的座位：第 ${Math.floor(classroomSeatMyIndex / classroomSeatLayout.columns) + 1} 行，第 ${
                            (classroomSeatMyIndex % classroomSeatLayout.columns) + 1
                          } 列`
                        : "我的座位：未填写"}
                    </span>
                  </div>

                  <div className="student-seat-preview-shell">
                    <div className="student-seat-stage" aria-hidden="true">
                      讲台
                    </div>
                    <div
                      className="student-seat-preview-grid"
                      style={{
                        gridTemplateColumns: `repeat(${classroomSeatLayout.columns}, minmax(0, 1fr))`,
                      }}
                    >
                      {classroomSeatItems.map((item) => {
                        const selectable = item.isMine || !item.occupied;
                        const selected = item.index === classroomSeatSelectedIndexNumber;
                        const occupiedByOther = item.occupied && !item.isMine;
                        return (
                          <button
                            key={`student-seat-grid-${item.index}`}
                            type="button"
                            className={`student-seat-preview-item${
                              item.isMine ? " is-mine" : ""
                            }${selected ? " is-selected" : ""}${occupiedByOther ? " is-occupied" : ""}${
                              selectable ? " is-selectable" : ""
                            }`}
                            onClick={() => onSelectSeatIndex(item.index)}
                            disabled={!classroomSeatFillWritable || !selectable || seatSaving}
                            title={
                              item.isMine
                                ? `我的当前座位：第 ${item.row} 行，第 ${item.column} 列`
                                : item.occupied
                                  ? `第 ${item.row} 行，第 ${item.column} 列：${item.value}`
                                  : `选择第 ${item.row} 行，第 ${item.column} 列`
                            }
                          >
                            <strong>{`${item.row}-${item.column}`}</strong>
                            <span>{item.isMine ? "我的座位" : item.occupied ? item.value : "空座位"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="student-seat-picker-grid">
                    <label className="student-seat-picker-field">
                      <span>第几行</span>
                      <select
                        value={classroomSeatSelectedRowNumber ? String(classroomSeatSelectedRowNumber) : ""}
                        onChange={(event) => onSelectSeatRow(event.target.value)}
                        disabled={!classroomSeatFillWritable || seatSaving || classroomSeatSelectableRows.length === 0}
                      >
                        <option value="">请选择行</option>
                        {classroomSeatSelectableRows.map((item) => (
                          <option key={`seat-row-${item.row}`} value={String(item.row)}>
                            {`第 ${item.row} 行`}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="student-seat-picker-field">
                      <span>第几列</span>
                      <select
                        value={classroomSeatSelectedColumnNumber ? String(classroomSeatSelectedColumnNumber) : ""}
                        onChange={(event) => onSelectSeatColumn(event.target.value)}
                        disabled={
                          !classroomSeatFillWritable ||
                          seatSaving ||
                          classroomSeatSelectableColumns.length === 0 ||
                          !classroomSeatSelectedRowNumber
                        }
                      >
                        <option value="">请选择列</option>
                        {classroomSeatSelectableColumns.map((item) => (
                          <option key={`seat-column-${item.index}`} value={String(item.column)}>
                            {`第 ${item.column} 列${item.isMine ? "（当前）" : item.value ? `（${item.value}）` : ""}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="student-seat-fill-actions">
                    <button
                      type="button"
                      className="student-seat-save-btn"
                      onClick={() => void onSaveSeatSelection()}
                      disabled={
                        !classroomSeatFillWritable ||
                        seatSaving ||
                        !classroomSeatHasSelection ||
                        classroomSeatSelectionMatchesCurrent
                      }
                    >
                      {seatSaving ? "保存中..." : "保存座位"}
                    </button>
                  </div>

                  <small>
                    {classroomSeatLayout.teacherLocked
                      ? "当前已被教师锁定，学生暂不可修改。"
                      : classroomSeatLayout.studentFillEnabled
                        ? "请先看上方教室预览，再选择第几行第几列。本次保存将作为你本学期的固定座位。"
                        : "教师暂未开放学生填写，请等待通知。"}
                  </small>

                  {seatError ? (
                    <p className="task-status-tip error" role="alert">
                      {seatError}
                    </p>
                  ) : null}

                  {classroomSeatSelectedItem &&
                  !classroomSeatSelectionMatchesCurrent &&
                  classroomSeatFillWritable ? (
                    <p className="task-status-tip">{`即将保存为：第 ${classroomSeatSelectedItem.row} 行，第 ${classroomSeatSelectedItem.column} 列`}</p>
                  ) : null}
                </section>
              ) : null}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CalendarDays,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalSelect from "../components/PortalSelect.jsx";
import {
  deleteAdminClassroomTaskFile,
  downloadAdminClassroomLessonFile,
  fetchAdminClassroomPlans,
  fetchAdminMe,
  fetchAdminOnlinePresence,
  saveAdminClassroomPlans,
  uploadAdminClassroomTaskFiles,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import { resolveActiveAuthSlot, withAuthSlot } from "../app/authStorage.js";
import "../styles/teacher-home.css";

const TARGET_CLASS_NAMES = Object.freeze(["教技231", "810班", "811班"]);

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

function resolveTaskTypeLabel(type) {
  return type === "link" ? "问卷/链接" : "文字说明";
}

function parseIsoTimeMs(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : Number.NaN;
}

function toDateTimeLocalValue(isoText) {
  const date = isoText ? new Date(isoText) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function buildLessonTimeLabel(startAt, endAt, fallback = "") {
  const startTime = parseIsoTimeMs(startAt);
  if (!Number.isFinite(startTime)) return String(fallback || "").trim();
  const startDate = new Date(startTime);
  const dateLabel = startDate.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const startLabel = startDate.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = parseIsoTimeMs(endAt);
  if (!Number.isFinite(endTime)) {
    return `${dateLabel} ${startLabel}`;
  }
  const endLabel = new Date(endTime).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateLabel} ${startLabel}-${endLabel}`;
}

function buildLessonScheduleChipText(startAt, endAt) {
  const startTime = parseIsoTimeMs(startAt);
  if (!Number.isFinite(startTime)) return "设置时间";
  const startDate = new Date(startTime);
  const dateLabel = startDate.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
  const startLabel = startDate.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = parseIsoTimeMs(endAt);
  if (!Number.isFinite(endTime)) {
    return `${dateLabel} ${startLabel}`;
  }
  const endLabel = new Date(endTime).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateLabel} ${startLabel}-${endLabel}`;
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

function buildDraftTask(type = "text") {
  const now = Date.now();
  return {
    id: `draft-${type}-${now}-${Math.round(Math.random() * 1000)}`,
    type,
    title: "",
    content: "",
    files: [],
  };
}

function buildLessonDraft(lessonIndex = 1) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    id: `course-${now}-${Math.round(Math.random() * 1000)}`,
    courseName: `第${lessonIndex}节课`,
    courseStartAt: "",
    courseEndAt: "",
    courseTime: "",
    notes: "",
    enabled: false,
    tasks: [],
    files: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildLessonPlansSaveSignature(plans, productTaskEnabled) {
  const source = Array.isArray(plans) ? plans : [];
  const normalizedPlans = source.map((lesson) => ({
    id: String(lesson?.id || ""),
    courseName: String(lesson?.courseName || ""),
    courseStartAt: String(lesson?.courseStartAt || ""),
    courseEndAt: String(lesson?.courseEndAt || ""),
    courseTime: String(lesson?.courseTime || ""),
    notes: String(lesson?.notes || ""),
    enabled: lesson?.enabled !== false,
    tasks: (Array.isArray(lesson?.tasks) ? lesson.tasks : []).map((task) => ({
      id: String(task?.id || ""),
      type: task?.type === "link" ? "link" : "text",
      title: String(task?.title || ""),
      content: String(task?.content || ""),
      files: (Array.isArray(task?.files) ? task.files : []).map((file) => ({
        id: String(file?.id || ""),
        name: String(file?.name || ""),
        mimeType: String(file?.mimeType || ""),
        size: Number(file?.size || 0),
        uploadedAt: String(file?.uploadedAt || ""),
      })),
    })),
    files: (Array.isArray(lesson?.files) ? lesson.files : []).map((file) => ({
      id: String(file?.id || ""),
      name: String(file?.name || ""),
      mimeType: String(file?.mimeType || ""),
      size: Number(file?.size || 0),
      uploadedAt: String(file?.uploadedAt || ""),
    })),
  }));
  return JSON.stringify({
    productTaskEnabled: !!productTaskEnabled,
    plans: normalizedPlans,
  });
}

function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = String(fileName || "课程文件.bin").trim() || "课程文件.bin";
  anchor.click();
  URL.revokeObjectURL(url);
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

export default function TeacherHomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const taskFileInputRef = useRef(null);
  const lessonDetailScrollRef = useRef(null);
  const deleteConfirmInputRef = useRef(null);
  const autoSaveTimerRef = useRef(0);
  const lastSavedSignatureRef = useRef("");

  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const [deletingFileId, setDeletingFileId] = useState("");
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState("classroom");
  const [lessonListVisible, setLessonListVisible] = useState(true);

  const [adminProfile, setAdminProfile] = useState({
    id: "",
    username: "",
    role: "admin",
    createdAt: "",
    updatedAt: "",
  });
  const [classroomUpdatedAt, setClassroomUpdatedAt] = useState("");
  const [productTaskEnabled, setProductTaskEnabled] = useState(false);
  const [teacherCoursePlans, setTeacherCoursePlans] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [newTaskType, setNewTaskType] = useState("link");
  const [plansReady, setPlansReady] = useState(false);
  const [timeEditorDialog, setTimeEditorDialog] = useState({
    open: false,
    startLocal: "",
    endLocal: "",
  });
  const [lessonBatchDeleteMode, setLessonBatchDeleteMode] = useState(false);
  const [batchSelectedLessonIds, setBatchSelectedLessonIds] = useState([]);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({
    open: false,
    targetIds: [],
    confirmText: "",
    error: "",
    mode: "single",
  });

  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineGeneratedAt, setOnlineGeneratedAt] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [onlineWindowSeconds, setOnlineWindowSeconds] = useState(300);
  const [onlineHeartbeatStaleSeconds, setOnlineHeartbeatStaleSeconds] = useState(70);
  const [onlineClassFilter, setOnlineClassFilter] = useState("all");

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

  const loadOnlineSummary = useCallback(async () => {
    if (!adminToken) return;
    setOnlineLoading(true);
    try {
      const data = await fetchAdminOnlinePresence(adminToken);
      setOnlineUsers(Array.isArray(data?.users) ? data.users : []);
      setOnlineWindowSeconds(
        Number(data?.onlineWindowSeconds) > 0 ? Number(data.onlineWindowSeconds) : 300,
      );
      setOnlineHeartbeatStaleSeconds(
        Number(data?.heartbeatStaleSeconds) > 0 ? Number(data.heartbeatStaleSeconds) : 70,
      );
      setOnlineGeneratedAt(String(data?.generatedAt || new Date().toISOString()));
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setOnlineLoading(false);
    }
  }, [adminToken, handleAuthError]);

  const loadPageData = useCallback(async () => {
    if (!adminToken) {
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return;
    }
    setLoading(true);
    setPlansReady(false);
    setError("");
    try {
      const [meData, plansData] = await Promise.all([
        fetchAdminMe(adminToken),
        fetchAdminClassroomPlans(adminToken),
      ]);
      setAdminProfile({
        id: String(meData?.admin?.id || ""),
        username: String(meData?.admin?.username || ""),
        role: String(meData?.admin?.role || "admin"),
        createdAt: String(meData?.admin?.createdAt || ""),
        updatedAt: String(meData?.admin?.updatedAt || ""),
      });
      const legacyProductEnabled = !!plansData?.shangguanClassTaskProductImprovementEnabled;
      setProductTaskEnabled(legacyProductEnabled);
      const plans = Array.isArray(plansData?.teacherCoursePlans) ? plansData.teacherCoursePlans : [];
      const normalizedPlans = plans;
      setTeacherCoursePlans(normalizedPlans);
      const firstPlan = sortLessonPlans(normalizedPlans)[0];
      setSelectedCourseId(String(firstPlan?.id || ""));
      setClassroomUpdatedAt(String(plansData?.updatedAt || ""));
      lastSavedSignatureRef.current = buildLessonPlansSaveSignature(
        normalizedPlans,
        legacyProductEnabled,
      );
      setPlansReady(true);
      await loadOnlineSummary();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setLoading(false);
    }
  }, [activeSlot, adminToken, handleAuthError, loadOnlineSummary, navigate]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (!Array.isArray(teacherCoursePlans) || teacherCoursePlans.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }
    const exists = teacherCoursePlans.some(
      (item) => String(item?.id || "") === String(selectedCourseId || ""),
    );
    if (!exists) {
      setSelectedCourseId(String(sortLessonPlans(teacherCoursePlans)[0]?.id || ""));
    }
  }, [selectedCourseId, teacherCoursePlans]);

  useEffect(() => {
    setSelectedTaskId("");
    setTimeEditorDialog({
      open: false,
      startLocal: "",
      endLocal: "",
    });
  }, [selectedCourseId]);

  useEffect(() => {
    if (!lessonBatchDeleteMode) {
      if (batchSelectedLessonIds.length > 0) {
        setBatchSelectedLessonIds([]);
      }
      return;
    }
    const existingIds = new Set(
      teacherCoursePlans.map((lesson) => String(lesson?.id || "").trim()).filter(Boolean),
    );
    setBatchSelectedLessonIds((current) => {
      const filtered = current.filter((id) => existingIds.has(String(id || "").trim()));
      if (filtered.length === current.length) return current;
      return filtered;
    });
  }, [batchSelectedLessonIds.length, lessonBatchDeleteMode, teacherCoursePlans]);

  useEffect(() => {
    if (!deleteConfirmDialog.open) return;
    const timerId = window.setTimeout(() => {
      deleteConfirmInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timerId);
  }, [deleteConfirmDialog.open]);

  const sidebarItems = useMemo(
    () => [
      { key: "classroom", label: "课时管理", icon: ClipboardList },
      { key: "online", label: "在线状态", icon: Users },
      { key: "agent", label: "智能体管理", icon: Bot },
    ],
    [],
  );

  function onSidebarItemClick(itemKey) {
    if (itemKey === "agent") {
      navigate(withAuthSlot("/admin/agent-settings", activeSlot));
      return;
    }
    setActivePanel(itemKey);
  }

  const classOnlineSummaries = useMemo(
    () =>
      TARGET_CLASS_NAMES.map((className) => {
        const classUsers = onlineUsers
          .filter((item) => String(item?.profile?.className || "").trim() === className)
          .sort((a, b) => {
            const aTime = new Date(a?.lastSeenAt || 0).getTime() || 0;
            const bTime = new Date(b?.lastSeenAt || 0).getTime() || 0;
            return bTime - aTime;
          });
        const count = classUsers.length;
        const recent = count > 0 ? classUsers[0]?.lastSeenAt : "";
        const ruleText =
          className === "810班" || className === "811班"
            ? `浏览器在线心跳（${formatWindowText(onlineHeartbeatStaleSeconds)}内）`
            : `活跃请求/在线连接（${formatWindowText(onlineWindowSeconds)}内）`;
        return { className, count, recent, ruleText };
      }),
    [onlineHeartbeatStaleSeconds, onlineUsers, onlineWindowSeconds],
  );

  const detailedOnlineUsers = useMemo(() => {
    const list = Array.isArray(onlineUsers) ? [...onlineUsers] : [];
    return list
      .filter((item) => TARGET_CLASS_NAMES.includes(String(item?.profile?.className || "").trim()))
      .sort((a, b) => {
        const aTime = new Date(a?.lastSeenAt || 0).getTime() || 0;
        const bTime = new Date(b?.lastSeenAt || 0).getTime() || 0;
        return bTime - aTime;
      });
  }, [onlineUsers]);

  const filteredOnlineUsers = useMemo(() => {
    const targetClass = String(onlineClassFilter || "all").trim();
    if (!targetClass || targetClass === "all") return detailedOnlineUsers;
    return detailedOnlineUsers.filter(
      (item) => String(item?.profile?.className || "").trim() === targetClass,
    );
  }, [detailedOnlineUsers, onlineClassFilter]);

  const avatarText = useMemo(() => {
    const username = String(adminProfile.username || "").trim();
    return username ? username.slice(0, 1) : "师";
  }, [adminProfile.username]);

  const sortedCoursePlans = useMemo(
    () => sortLessonPlans(teacherCoursePlans),
    [teacherCoursePlans],
  );
  const sortedCourseIds = useMemo(
    () =>
      sortedCoursePlans
        .map((course) => String(course?.id || "").trim())
        .filter(Boolean),
    [sortedCoursePlans],
  );
  const selectedBatchCount = batchSelectedLessonIds.length;
  const batchAllSelected =
    sortedCourseIds.length > 0 && selectedBatchCount === sortedCourseIds.length;

  const selectedCourseIndex = useMemo(
    () =>
      teacherCoursePlans.findIndex(
        (item) => String(item?.id || "") === String(selectedCourseId || ""),
      ),
    [selectedCourseId, teacherCoursePlans],
  );

  const selectedCourse =
    selectedCourseIndex >= 0 ? teacherCoursePlans[selectedCourseIndex] : null;

  const selectedCourseTasks = useMemo(
    () => (Array.isArray(selectedCourse?.tasks) ? selectedCourse.tasks : []),
    [selectedCourse],
  );
  const selectedTaskIndex = useMemo(
    () =>
      selectedCourseTasks.findIndex(
        (task) => String(task?.id || "") === String(selectedTaskId || ""),
      ),
    [selectedCourseTasks, selectedTaskId],
  );
  const selectedTask =
    selectedTaskIndex >= 0 ? selectedCourseTasks[selectedTaskIndex] : null;
  const selectedTaskFiles = useMemo(
    () => (Array.isArray(selectedTask?.files) ? selectedTask.files : []),
    [selectedTask],
  );

  useEffect(() => {
    if (selectedCourseTasks.length === 0) {
      if (selectedTaskId) setSelectedTaskId("");
      return;
    }
    const taskExists = selectedCourseTasks.some(
      (task) => String(task?.id || "") === String(selectedTaskId || ""),
    );
    if (!taskExists) {
      setSelectedTaskId(String(selectedCourseTasks[0]?.id || ""));
    }
  }, [selectedCourseTasks, selectedTaskId]);

  function onLogout() {
    clearAdminToken();
    setAdminToken("");
    navigate(withAuthSlot("/login", activeSlot), { replace: true });
  }

  function onCreateLesson() {
    const nextLesson = buildLessonDraft(teacherCoursePlans.length + 1);
    setTeacherCoursePlans((current) => [...current, nextLesson]);
    setSelectedCourseId(String(nextLesson.id));
    setError("");
  }

  function onOpenTimeEditorDialog() {
    if (!selectedCourse) return;
    setTimeEditorDialog({
      open: true,
      startLocal: toDateTimeLocalValue(selectedCourse.courseStartAt),
      endLocal: toDateTimeLocalValue(selectedCourse.courseEndAt),
    });
  }

  function onCloseTimeEditorDialog() {
    setTimeEditorDialog((current) => ({
      ...current,
      open: false,
    }));
  }

  function onSubmitTimeEditorDialog(event) {
    if (event) event.preventDefault();
    const startAt = fromDateTimeLocalValue(timeEditorDialog.startLocal);
    const endAt = fromDateTimeLocalValue(timeEditorDialog.endLocal);
    onUpdateSelectedLessonSchedule(startAt, endAt);
    onCloseTimeEditorDialog();
  }

  function onClearTimeEditorDialog() {
    onUpdateSelectedLessonSchedule("", "");
    setTimeEditorDialog({
      open: false,
      startLocal: "",
      endLocal: "",
    });
  }

  function toggleLessonBatchDeleteMode() {
    setError("");
    setLessonBatchDeleteMode((current) => {
      const nextMode = !current;
      if (!nextMode) {
        setBatchSelectedLessonIds([]);
      }
      return nextMode;
    });
  }

  function onToggleBatchSelectLesson(courseId, checked) {
    const safeId = String(courseId || "").trim();
    if (!safeId) return;
    setBatchSelectedLessonIds((current) => {
      if (checked) {
        if (current.includes(safeId)) return current;
        return [...current, safeId];
      }
      return current.filter((id) => String(id || "").trim() !== safeId);
    });
  }

  function onToggleBatchSelectAll(checked) {
    if (!checked) {
      setBatchSelectedLessonIds([]);
      return;
    }
    setBatchSelectedLessonIds(sortedCourseIds);
  }

  function onUpdateSelectedLesson(patch) {
    if (!selectedCourseId) return;
    setTeacherCoursePlans((current) =>
      current.map((item) =>
        String(item?.id || "") === String(selectedCourseId || "")
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  }

  function onUpdateSelectedLessonSchedule(nextStartAt, nextEndAt) {
    const startAt = String(nextStartAt || "").trim();
    let endAt = String(nextEndAt || "").trim();
    const startMs = parseIsoTimeMs(startAt);
    const endMs = parseIsoTimeMs(endAt);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      endAt = startAt;
    }
    onUpdateSelectedLesson({
      courseStartAt: startAt,
      courseEndAt: endAt,
      courseTime: buildLessonTimeLabel(startAt, endAt),
    });
  }

  function onAddTaskToSelectedLesson(type = "text") {
    if (!selectedCourse) return;
    const nextTask = buildDraftTask(type);
    const currentTasks = Array.isArray(selectedCourse.tasks) ? selectedCourse.tasks : [];
    onUpdateSelectedLesson({ tasks: [...currentTasks, nextTask] });
    setSelectedTaskId(String(nextTask.id));
  }

  function onUpdateSelectedTask(taskId, patch) {
    if (!selectedCourse) return;
    const currentTasks = Array.isArray(selectedCourse.tasks) ? selectedCourse.tasks : [];
    const nextTasks = currentTasks.map((task) =>
      String(task?.id || "") === String(taskId || "")
        ? {
            ...task,
            ...patch,
          }
        : task,
    );
    onUpdateSelectedLesson({ tasks: nextTasks });
  }

  function onRemoveTaskFromSelectedLesson(taskId) {
    if (!selectedCourse) return;
    const currentTasks = Array.isArray(selectedCourse.tasks) ? selectedCourse.tasks : [];
    const safeTaskId = String(taskId || "");
    const removeIndex = currentTasks.findIndex(
      (task) => String(task?.id || "") === safeTaskId,
    );
    if (removeIndex < 0) return;
    const nextTasks = currentTasks.filter((task) => String(task?.id || "") !== safeTaskId);
    onUpdateSelectedLesson({ tasks: nextTasks });
    if (String(selectedTaskId || "") === safeTaskId) {
      const fallbackTask = nextTasks[removeIndex] || nextTasks[removeIndex - 1] || null;
      setSelectedTaskId(String(fallbackTask?.id || ""));
    }
  }

  function onDeleteCourses(courseIds = []) {
    const uniqueIds = Array.from(
      new Set(
        (Array.isArray(courseIds) ? courseIds : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
    if (uniqueIds.length === 0) return;
    const deletedIdSet = new Set(uniqueIds);
    const sortedBeforeDelete = sortLessonPlans(teacherCoursePlans);
    const deletedIndexes = sortedBeforeDelete
      .map((item, index) => (deletedIdSet.has(String(item?.id || "")) ? index : -1))
      .filter((index) => index >= 0);
    const anchorIndex = deletedIndexes.length > 0 ? Math.min(...deletedIndexes) : 0;

    const nextPlans = teacherCoursePlans.filter(
      (item) => !deletedIdSet.has(String(item?.id || "")),
    );
    setTeacherCoursePlans(nextPlans);
    setBatchSelectedLessonIds((current) =>
      current.filter((item) => !deletedIdSet.has(String(item || "").trim())),
    );

    const selectedId = String(selectedCourseId || "");
    if (!deletedIdSet.has(selectedId)) {
      if (!nextPlans.some((item) => String(item?.id || "") === selectedId)) {
        setSelectedCourseId(String(sortLessonPlans(nextPlans)[0]?.id || ""));
      }
      return;
    }

    const sortedAfterDelete = sortLessonPlans(nextPlans);
    if (sortedAfterDelete.length === 0) {
      setSelectedCourseId("");
      return;
    }
    if (anchorIndex > 0) {
      const fallback = sortedAfterDelete[Math.min(anchorIndex - 1, sortedAfterDelete.length - 1)];
      setSelectedCourseId(String(fallback?.id || ""));
      return;
    }
    setSelectedCourseId(String(sortedAfterDelete[0]?.id || ""));
  }

  function openDeleteConfirmDialog(mode, courseIds = []) {
    const safeIds = Array.from(
      new Set(
        (Array.isArray(courseIds) ? courseIds : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
    if (safeIds.length === 0) return;
    setError("");
    setDeleteConfirmDialog({
      open: true,
      targetIds: safeIds,
      confirmText: "",
      error: "",
      mode: mode === "batch" ? "batch" : "single",
    });
  }

  function closeDeleteConfirmDialog() {
    setDeleteConfirmDialog({
      open: false,
      targetIds: [],
      confirmText: "",
      error: "",
      mode: "single",
    });
  }

  function onDeleteCourseAction(courseId) {
    const safeCourseId = String(courseId || "").trim();
    if (!safeCourseId) return;
    openDeleteConfirmDialog("single", [safeCourseId]);
  }

  function onBatchDeleteAction() {
    if (batchSelectedLessonIds.length === 0) {
      setError("请先勾选要删除的课时。");
      return;
    }
    setError("");
    openDeleteConfirmDialog("batch", batchSelectedLessonIds);
  }

  function onSubmitDeleteConfirmDialog(event) {
    if (event) event.preventDefault();
    const typed = String(deleteConfirmDialog.confirmText || "").trim();
    if (typed !== "确认删除") {
      setDeleteConfirmDialog((current) => ({
        ...current,
        error: "请输入“确认删除”以继续删除操作。",
      }));
      return;
    }
    const targetIds = Array.isArray(deleteConfirmDialog.targetIds)
      ? deleteConfirmDialog.targetIds
      : [];
    onDeleteCourses(targetIds);
    if (deleteConfirmDialog.mode === "batch") {
      setLessonBatchDeleteMode(false);
      setBatchSelectedLessonIds([]);
    }
    closeDeleteConfirmDialog();
  }

  function onDetailWheel(event) {
    const scrollEl = lessonDetailScrollRef.current;
    if (!scrollEl) return;
    const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const currentTop = scrollEl.scrollTop;
    const deltaY = Number(event.deltaY || 0);
    if (deltaY < 0 && currentTop <= 0) {
      event.preventDefault();
      scrollEl.scrollTop = 0;
      return;
    }
    if (deltaY > 0 && currentTop >= maxScrollTop) {
      event.preventDefault();
      scrollEl.scrollTop = maxScrollTop;
    }
  }

  const persistClassroomConfig = useCallback(async ({ silent = false } = {}) => {
    if (!adminToken || saving) return false;
    if (!silent) setError("");
    setSaving(true);
    const plansToSave = teacherCoursePlans;
    try {
      const data = await saveAdminClassroomPlans(adminToken, {
        shangguanClassTaskProductImprovementEnabled: !!productTaskEnabled,
        teacherCoursePlans: plansToSave,
      });
      const savedPlans = Array.isArray(data?.teacherCoursePlans) ? data.teacherCoursePlans : [];
      const normalizedPlans = savedPlans;
      const nextProductEnabled = !!data?.shangguanClassTaskProductImprovementEnabled;
      setTeacherCoursePlans(normalizedPlans);
      if (
        normalizedPlans.length > 0 &&
        !normalizedPlans.some((item) => item?.id === selectedCourseId)
      ) {
        setSelectedCourseId(String(sortLessonPlans(normalizedPlans)[0]?.id || ""));
      }
      setProductTaskEnabled(nextProductEnabled);
      setClassroomUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
      lastSavedSignatureRef.current = buildLessonPlansSaveSignature(
        normalizedPlans,
        nextProductEnabled,
      );
      return true;
    } catch (rawError) {
      if (handleAuthError(rawError)) return false;
      setError(readErrorMessage(rawError));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    adminToken,
    handleAuthError,
    productTaskEnabled,
    saving,
    selectedCourseId,
    teacherCoursePlans,
  ]);

  async function onSaveClassroomConfig() {
    await persistClassroomConfig({ silent: false });
  }

  useEffect(() => {
    if (!adminToken || loading || saving || !plansReady) return;
    const nextSignature = buildLessonPlansSaveSignature(teacherCoursePlans, productTaskEnabled);
    if (nextSignature === lastSavedSignatureRef.current) return;

    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      void persistClassroomConfig({ silent: true });
    }, 600);
    return () => window.clearTimeout(autoSaveTimerRef.current);
  }, [
    adminToken,
    loading,
    plansReady,
    productTaskEnabled,
    saving,
    teacherCoursePlans,
    persistClassroomConfig,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(autoSaveTimerRef.current);
    },
    [],
  );

  async function onUploadTaskFiles(event) {
    const sourceFiles = Array.from(event?.target?.files || []);
    event.target.value = "";
    const safeLessonId = String(selectedCourseId || "").trim();
    const safeTaskId = String(selectedTaskId || "").trim();
    if (!adminToken || !safeLessonId || !safeTaskId || sourceFiles.length === 0) return;
    setUploadingFiles(true);
    setError("");
    try {
      const ensuredSaved = await persistClassroomConfig({ silent: true });
      if (!ensuredSaved) return;
      const data = await uploadAdminClassroomTaskFiles(
        adminToken,
        safeLessonId,
        safeTaskId,
        sourceFiles,
      );
      const plans = Array.isArray(data?.teacherCoursePlans) ? data.teacherCoursePlans : [];
      const normalizedPlans = plans;
      setTeacherCoursePlans(normalizedPlans);
      setClassroomUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
      lastSavedSignatureRef.current = buildLessonPlansSaveSignature(
        normalizedPlans,
        productTaskEnabled,
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setUploadingFiles(false);
    }
  }

  async function onDeleteTaskFile(fileId) {
    if (!adminToken || !selectedCourse || !selectedTask) return;
    const safeFileId = String(fileId || "").trim();
    if (!safeFileId) return;
    setDeletingFileId(safeFileId);
    setError("");
    try {
      const data = await deleteAdminClassroomTaskFile(
        adminToken,
        selectedCourse.id,
        selectedTask.id,
        safeFileId,
      );
      const plans = Array.isArray(data?.teacherCoursePlans) ? data.teacherCoursePlans : [];
      const normalizedPlans = plans;
      setTeacherCoursePlans(normalizedPlans);
      setClassroomUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
      lastSavedSignatureRef.current = buildLessonPlansSaveSignature(
        normalizedPlans,
        productTaskEnabled,
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setDeletingFileId("");
    }
  }

  async function onDownloadLessonFile(file) {
    if (!adminToken) return;
    const fileId = String(file?.id || "").trim();
    if (!fileId) return;
    setDownloadingFileId(fileId);
    setError("");
    try {
      const data = await downloadAdminClassroomLessonFile(adminToken, fileId);
      if (data?.downloadUrl) {
        triggerUrlDownload(data.downloadUrl, data.filename || file?.name || "课程文件.bin");
      } else if (data?.blob) {
        triggerBrowserDownload(data.blob, data.filename || file?.name || "课程文件.bin");
      } else {
        throw new Error("课程文件下载失败，请稍后重试。");
      }
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setDownloadingFileId("");
    }
  }

  return (
    <div className="teacher-home-page">
      <div className="teacher-home-shell">
        <aside className="teacher-home-sidebar">
          <div className="teacher-home-profile">
            <div className="teacher-home-avatar">{avatarText}</div>
            <h1>教师主页</h1>
            <p>{adminProfile.username || "固定管理员"}</p>
            <dl className="teacher-home-profile-meta">
              <div>
                <dt>角色</dt>
                <dd>{adminProfile.role === "admin" ? "固定管理员" : adminProfile.role || "--"}</dd>
              </div>
              <div>
                <dt>最近更新</dt>
                <dd>{formatDisplayTime(classroomUpdatedAt || adminProfile.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          <nav className="teacher-home-nav">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`teacher-home-nav-item${activePanel === item.key ? " active" : ""}`}
                  onClick={() => onSidebarItemClick(item.key)}
                >
                  <Icon size={17} />
                  <span className="teacher-home-nav-label">{item.label}</span>
                  {item.key === "agent" ? (
                    <span className="teacher-home-nav-open-indicator" aria-hidden="true" title="新页面">
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
            onClick={onLogout}
          >
            <LogOut size={15} />
            <span>退出教师登录</span>
          </button>
        </aside>

        <main className="teacher-home-main">
          {error ? (
            <p className="teacher-home-alert error" role="alert">
              {error}
            </p>
          ) : null}

          {activePanel === "classroom" ? (
            <div className="teacher-panel-stack teacher-classroom-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>课时管理</h2>
                  <p className="teacher-panel-save-time">
                    {`最近保存：${formatDisplayTime(classroomUpdatedAt)}`}
                  </p>
                </div>
                <div className="teacher-panel-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                    onClick={() => setLessonListVisible((current) => !current)}
                    data-tooltip={lessonListVisible ? "隐藏课时列表" : "显示课时列表"}
                    title={lessonListVisible ? "隐藏课时列表" : "显示课时列表"}
                    aria-label={lessonListVisible ? "隐藏课时列表" : "显示课时列表"}
                  >
                    {lessonListVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    type="button"
                    className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                    onClick={onCreateLesson}
                    disabled={loading || saving || uploadingFiles}
                    data-tooltip="新建一节课"
                    title="新建一节课"
                    aria-label="新建一节课"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    type="button"
                    className="teacher-primary-btn teacher-tooltip-btn teacher-action-icon-btn"
                    onClick={onSaveClassroomConfig}
                    disabled={loading || saving || uploadingFiles}
                    data-tooltip={saving ? "保存中..." : "保存课堂配置"}
                    title={saving ? "保存中..." : "保存课堂配置"}
                    aria-label={saving ? "保存中..." : "保存课堂配置"}
                  >
                    <Save size={15} />
                  </button>
                </div>
              </header>

              <section
                className={`teacher-card teacher-lesson-workbench${
                  lessonListVisible ? "" : " list-collapsed"
                }`}
              >
                <div
                  className={`teacher-lesson-list-panel${lessonListVisible ? "" : " collapsed"}`}
                >
                  <div className="teacher-lesson-list-head">
                    <h3>课时列表</h3>
                    <div className="teacher-lesson-list-head-right">
                      <span>{`${teacherCoursePlans.length} 节课`}</span>
                      <button
                        type="button"
                        className={`teacher-ghost-btn teacher-lesson-batch-toggle${
                          lessonBatchDeleteMode ? " active" : ""
                        }`}
                        onClick={toggleLessonBatchDeleteMode}
                      >
                        {lessonBatchDeleteMode ? "取消批量" : "批量删除"}
                      </button>
                    </div>
                  </div>
                  {lessonBatchDeleteMode ? (
                    <div className="teacher-lesson-batch-bar">
                      <label className="teacher-lesson-batch-check-all">
                        <input
                          type="checkbox"
                          checked={batchAllSelected}
                          onChange={(event) => onToggleBatchSelectAll(event.target.checked)}
                        />
                        <span>全选</span>
                      </label>
                      <span className="teacher-lesson-batch-count">{`已选 ${selectedBatchCount} 节`}</span>
                      <button
                        type="button"
                        className="teacher-delete-btn teacher-lesson-batch-delete"
                        onClick={onBatchDeleteAction}
                        disabled={selectedBatchCount === 0}
                        title="删除所选课时"
                        aria-label="删除所选课时"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}

                  {teacherCoursePlans.length === 0 ? (
                    <p className="teacher-empty-text">暂无课时，请点击右上角「新建一节课」。</p>
                  ) : (
                    <div className="teacher-lesson-list">
                      {sortedCoursePlans.map((course, index) => {
                        const courseId = String(course?.id || "");
                        const active = courseId === String(selectedCourseId || "");
                        const tasks = Array.isArray(course?.tasks) ? course.tasks : [];
                        return (
                          <article
                            key={courseId || `lesson-${index + 1}`}
                            className={`teacher-lesson-row${active ? " active" : ""}${
                              lessonBatchDeleteMode ? " batch-mode" : ""
                            }`}
                          >
                            {lessonBatchDeleteMode ? (
                              <label className="teacher-lesson-row-check" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={batchSelectedLessonIds.includes(courseId)}
                                  onChange={(event) =>
                                    onToggleBatchSelectLesson(courseId, event.target.checked)
                                  }
                                />
                              </label>
                            ) : null}
                            <button
                              type="button"
                              className="teacher-lesson-row-main"
                              onClick={() => setSelectedCourseId(courseId)}
                            >
                              <strong>{course?.courseName || `第${index + 1}节课`}</strong>
                              <p>
                                {buildLessonTimeLabel(
                                  course?.courseStartAt,
                                  course?.courseEndAt,
                                  course?.courseTime,
                                ) || "未设置课时时间"}
                              </p>
                              <span>{`${tasks.length} 个任务`}</span>
                            </button>
                            <div className="teacher-lesson-row-actions">
                              <span className={`teacher-lesson-status${course?.enabled === false ? " closed" : ""}`}>
                                {course?.enabled === false ? "未开放" : "已开放"}
                              </span>
                              <button
                                type="button"
                                className="teacher-row-setting-btn teacher-tooltip-btn"
                                onClick={() => setSelectedCourseId(courseId)}
                                data-tooltip="设置"
                                title="设置"
                                aria-label="设置"
                              >
                                <Settings2 size={14} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="teacher-lesson-detail-panel">
                  <div className="teacher-task-draft-head">
                    <div className="teacher-lesson-title-row">
                      <strong>课时设置</strong>
                      {selectedCourse ? (
                        <label
                          className="teacher-ios-switch teacher-lesson-title-switch"
                          title="切换本节课开放状态"
                          aria-label={selectedCourse.enabled === false ? "未开放" : "已开放"}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCourse.enabled !== false}
                            onChange={(e) => onUpdateSelectedLesson({ enabled: e.target.checked })}
                          />
                          <span className="teacher-ios-switch-track" aria-hidden="true">
                            <span className="teacher-ios-switch-thumb" />
                          </span>
                        </label>
                      ) : null}
                    </div>
                    <div className="teacher-lesson-detail-toolbar">
                      {selectedCourse ? (
                        <>
                          <button
                            type="button"
                            className="teacher-ghost-btn teacher-lesson-time-trigger"
                            onClick={onOpenTimeEditorDialog}
                          >
                            <CalendarDays size={14} />
                            <span>
                              {buildLessonScheduleChipText(
                                selectedCourse.courseStartAt,
                                selectedCourse.courseEndAt,
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="teacher-delete-btn teacher-tooltip-btn"
                            onClick={() => onDeleteCourseAction(selectedCourse.id)}
                            data-tooltip="删除课时"
                            title="删除课时"
                            aria-label="删除课时"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {!selectedCourse ? (
                    <p className="teacher-empty-text">请选择左侧一节课后再设置任务和资料。</p>
                  ) : (
                    <div
                      ref={lessonDetailScrollRef}
                      className="teacher-lesson-detail-scroll"
                      onWheel={onDetailWheel}
                    >
                      <div className="teacher-form-grid teacher-form-grid-single">
                        <label>
                          <span>课时名称</span>
                          <input
                            type="text"
                            value={selectedCourse.courseName || ""}
                            onChange={(e) => onUpdateSelectedLesson({ courseName: e.target.value })}
                            placeholder={`例如：第 ${selectedCourseIndex + 1} 节课`}
                          />
                        </label>
                      </div>

                      <div className="teacher-task-draft-head">
                        <strong>课程任务</strong>
                        <div className="teacher-task-draft-actions">
                          <PortalSelect
                            className="teacher-add-task-type-select"
                            value={newTaskType}
                            compact
                            ariaLabel="新增任务类型"
                            options={[
                              { value: "link", label: "问卷/链接" },
                              { value: "text", label: "文字说明" },
                            ]}
                            onChange={(value) =>
                              setNewTaskType(value === "text" ? "text" : "link")
                            }
                          />
                          <button
                            type="button"
                            className="teacher-ghost-btn"
                            onClick={() => onAddTaskToSelectedLesson(newTaskType)}
                          >
                            <Plus size={14} />
                            <span>新增任务</span>
                          </button>
                        </div>
                      </div>

                      <section className="teacher-task-master">
                        <aside className="teacher-task-master-list">
                          <div className="teacher-task-master-list-meta">
                            <span>{`${selectedCourseTasks.length} 个任务`}</span>
                            <span>
                              {`${selectedCourseTasks.filter((task) => task?.type === "link").length} 个链接`}
                            </span>
                          </div>

                          {selectedCourseTasks.length === 0 ? (
                            <p className="teacher-empty-text">这节课暂未添加任务，点击上方按钮新增。</p>
                          ) : (
                            <div className="teacher-task-master-items">
                              {selectedCourseTasks.map((task, index) => {
                                const taskId = String(task?.id || "");
                                const isLinkTask = task?.type === "link";
                                return (
                                  <article
                                    key={taskId || `task-summary-${index + 1}`}
                                    className={`teacher-task-summary-item${
                                      taskId === String(selectedTaskId || "") ? " active" : ""
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="teacher-task-summary-main"
                                      onClick={() => setSelectedTaskId(taskId)}
                                    >
                                      <span className="teacher-task-summary-topline">
                                        <span className="teacher-task-summary-index">{index + 1}</span>
                                        <span
                                          className={`teacher-task-summary-type${
                                            isLinkTask ? " link" : " text"
                                          }`}
                                        >
                                          {isLinkTask ? <Link2 size={12} /> : <FileText size={12} />}
                                          <span>{resolveTaskTypeLabel(task?.type)}</span>
                                        </span>
                                      </span>
                                      <span className="teacher-task-summary-body">
                                        <strong>{task?.title || `任务 ${index + 1}`}</strong>
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      className="teacher-icon-btn danger teacher-task-summary-delete"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onRemoveTaskFromSelectedLesson(taskId);
                                      }}
                                      title="删除任务"
                                      aria-label="删除任务"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </aside>

                        <div className="teacher-task-master-editor">
                          {!selectedTask ? (
                            <p className="teacher-empty-text">请选择左侧任务进行编辑。</p>
                          ) : (
                            <div className="teacher-task-editor-form">
                              <div className="teacher-task-editor-grid">
                                <label>
                                  <span>类型</span>
                                  <PortalSelect
                                    className="teacher-task-editor-type-select"
                                    value={selectedTask.type === "link" ? "link" : "text"}
                                    compact
                                    ariaLabel="选择任务类型"
                                    options={[
                                      { value: "link", label: "问卷/链接" },
                                      { value: "text", label: "文字说明" },
                                    ]}
                                    onChange={(value) =>
                                      onUpdateSelectedTask(selectedTask.id, {
                                        type: value === "link" ? "link" : "text",
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  <span>任务标题</span>
                                  <input
                                    type="text"
                                    value={selectedTask.title || ""}
                                    onChange={(e) =>
                                      onUpdateSelectedTask(selectedTask.id, { title: e.target.value })
                                    }
                                    placeholder={
                                      selectedTask.type === "link"
                                        ? "例如：问卷星反馈"
                                        : "例如：课堂观察记录"
                                    }
                                  />
                                </label>
                              </div>
                              <label className="teacher-task-editor-content">
                                <span>{selectedTask.type === "link" ? "链接地址" : "任务内容"}</span>
                                <textarea
                                  value={selectedTask.content || ""}
                                  onChange={(e) =>
                                    onUpdateSelectedTask(selectedTask.id, { content: e.target.value })
                                  }
                                  placeholder={
                                    selectedTask.type === "link"
                                      ? "请输入 https:// 开头链接"
                                      : "请输入任务说明、提交要求或评分标准"
                                    }
                                  />
                              </label>
                              <div className="teacher-task-files-block">
                                <div className="teacher-task-draft-head">
                                  <strong>任务附件</strong>
                                  <div className="teacher-task-draft-actions">
                                    <input
                                      ref={taskFileInputRef}
                                      type="file"
                                      multiple
                                      className="teacher-hidden-file-input"
                                      onChange={onUploadTaskFiles}
                                    />
                                    <button
                                      type="button"
                                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                                      onClick={() => taskFileInputRef.current?.click()}
                                      disabled={uploadingFiles}
                                      data-tooltip={uploadingFiles ? "上传中..." : "上传任务附件"}
                                      title={uploadingFiles ? "上传中..." : "上传任务附件"}
                                      aria-label={uploadingFiles ? "上传中..." : "上传任务附件"}
                                    >
                                      <Upload size={14} />
                                    </button>
                                  </div>
                                </div>
                                {selectedTaskFiles.length === 0 ? (
                                  <p className="teacher-empty-text">当前任务未上传附件。</p>
                                ) : (
                                  <div className="teacher-file-chip-list">
                                    {selectedTaskFiles.map((file, index) => {
                                      const fileId = String(file?.id || "");
                                      const isDeleting = deletingFileId === fileId;
                                      const isDownloading = downloadingFileId === fileId;
                                      return (
                                        <div key={fileId || `task-file-${index + 1}`} className="teacher-file-chip">
                                          <div className="teacher-file-chip-info">
                                            <FileText size={14} />
                                            <strong>{file?.name || "任务附件"}</strong>
                                            <span>{formatFileSize(file?.size)}</span>
                                            <span>{`上传于 ${formatDisplayTime(file?.uploadedAt)}`}</span>
                                          </div>
                                          <div className="teacher-file-chip-actions">
                                            <button
                                              type="button"
                                              className="teacher-icon-btn"
                                              onClick={() => void onDownloadLessonFile(file)}
                                              disabled={!fileId || isDownloading}
                                              title="下载附件"
                                            >
                                              <Download size={14} />
                                            </button>
                                            <button
                                              type="button"
                                              className="teacher-icon-btn danger"
                                              onClick={() => void onDeleteTaskFile(fileId)}
                                              disabled={!fileId || isDeleting}
                                              title="删除附件"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activePanel === "online" ? (
            <div className="teacher-panel-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>在线状态</h2>
                  <p>{`最近刷新：${formatDisplayTime(onlineGeneratedAt)}`}</p>
                </div>
                <div className="teacher-panel-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn"
                    onClick={() => void loadOnlineSummary()}
                    disabled={onlineLoading}
                  >
                    <RefreshCw size={15} className={onlineLoading ? "is-spinning" : ""} />
                    <span>{onlineLoading ? "刷新中..." : "刷新概览"}</span>
                  </button>
                </div>
              </header>

              <section className="teacher-card teacher-online-summary">
                {classOnlineSummaries.map((item) => (
                  <div key={item.className} className="teacher-online-count-card">
                    <p className="teacher-online-count-class">{item.className}</p>
                    <span className="teacher-online-rule">{item.ruleText}</span>
                    <strong>{loading ? "--" : item.count}</strong>
                    <span className="teacher-online-count-label">在线人数</span>
                    <span className="teacher-online-count-note">
                      {item.count > 0
                        ? `最近活跃：${formatDisplayTime(item.recent)}`
                        : "当前暂无在线用户"}
                    </span>
                  </div>
                ))}
              </section>

              <section className="teacher-card">
                <div className="teacher-online-list-head">
                  <div className="teacher-online-list-head-left">
                    <h3>在线用户列表</h3>
                    <span className="teacher-online-total-count">{`${filteredOnlineUsers.length} 人`}</span>
                  </div>
                  <div className="teacher-online-list-head-right">
                    <div className="teacher-online-filter-label">
                      <span>班级筛选</span>
                      <PortalSelect
                        className="teacher-online-filter-select"
                        value={onlineClassFilter}
                        ariaLabel="在线用户班级筛选"
                        compact
                        options={[
                          { value: "all", label: "全部" },
                          ...TARGET_CLASS_NAMES.map((className) => ({
                            value: className,
                            label: className,
                          })),
                        ]}
                        onChange={setOnlineClassFilter}
                      />
                    </div>
                  </div>
                </div>
                {filteredOnlineUsers.length === 0 ? (
                  <p className="teacher-empty-text">当前暂无在线用户。</p>
                ) : (
                  <div className="teacher-online-table-wrap">
                    <table className="teacher-online-table">
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
                        {filteredOnlineUsers.map((item) => (
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
            </div>
          ) : null}
          {timeEditorDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={onCloseTimeEditorDialog}
            >
              <div
                className="teacher-time-card"
                role="dialog"
                aria-modal="true"
                aria-label="课时时间设置"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>课时时间设置</h3>
                <form className="teacher-time-form" onSubmit={onSubmitTimeEditorDialog}>
                  <label>
                    <span>开始时间</span>
                    <input
                      type="datetime-local"
                      value={timeEditorDialog.startLocal}
                      onChange={(event) =>
                        setTimeEditorDialog((current) => ({
                          ...current,
                          startLocal: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>结束时间</span>
                    <input
                      type="datetime-local"
                      value={timeEditorDialog.endLocal}
                      onChange={(event) =>
                        setTimeEditorDialog((current) => ({
                          ...current,
                          endLocal: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={onClearTimeEditorDialog}
                    >
                      清除时间
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={onCloseTimeEditorDialog}
                    >
                      取消
                    </button>
                    <button type="submit" className="teacher-primary-btn">
                      保存时间
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {deleteConfirmDialog.open ? (
            <div
              className="teacher-confirm-overlay"
              role="presentation"
              onClick={closeDeleteConfirmDialog}
            >
              <div
                className="teacher-confirm-card"
                role="dialog"
                aria-modal="true"
                aria-label="删除课时确认"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>删除课时</h3>
                <p>
                  {deleteConfirmDialog.mode === "batch"
                    ? `将删除 ${deleteConfirmDialog.targetIds.length} 节课，删除后无法恢复。请输入“确认删除”继续。`
                    : "该课时删除后无法恢复。请输入“确认删除”继续。"}
                </p>
                <form onSubmit={onSubmitDeleteConfirmDialog} className="teacher-confirm-form">
                  <input
                    ref={deleteConfirmInputRef}
                    type="text"
                    value={deleteConfirmDialog.confirmText}
                    onChange={(event) =>
                      setDeleteConfirmDialog((current) => ({
                        ...current,
                        confirmText: event.target.value,
                        error: "",
                      }))
                    }
                    placeholder="请输入：确认删除"
                  />
                  {deleteConfirmDialog.error ? (
                    <span className="teacher-confirm-error">{deleteConfirmDialog.error}</span>
                  ) : null}
                  <div className="teacher-confirm-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeDeleteConfirmDialog}
                    >
                      取消
                    </button>
                    <button type="submit" className="teacher-primary-btn">
                      确认删除
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Bot,
  CalendarDays,
  CircleHelp,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  ImageOff,
  Link2,
  LogOut,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  Image,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalSelect from "../components/PortalSelect.jsx";
import {
  createAdminChatSession,
  downloadAdminGeneratedImage,
  downloadAdminClassroomHomeworkFile,
  deleteAdminClassroomTaskFile,
  downloadAdminClassroomLessonFile,
  fetchAdminGeneratedImageGroups,
  fetchAdminGroupChatRooms,
  fetchAdminClassroomHomeworkOverview,
  fetchAdminClassroomPlans,
  fetchAdminMe,
  fetchAdminOnlinePresence,
  saveAdminClassroomPlans,
  uploadAdminClassroomTaskFiles,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import {
  clearUserAuthSession,
  resolveActiveAuthSlot,
  setStoredAuthUser,
  setUserToken,
  withAuthSlot,
} from "../app/authStorage.js";
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

function parseTaskLinkContent(content) {
  const raw = String(content || "");
  const lines = raw.split(/\r?\n/).map((item) => String(item || ""));
  if (lines.length === 0) return [""];
  return lines;
}

function stringifyTaskLinkContent(lines) {
  const source = Array.isArray(lines) ? lines : [];
  const normalized = source.map((item) => String(item || ""));
  if (normalized.length === 0) return "";
  return normalized.join("\n");
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
    description: "",
    content: "",
    files: [],
  };
}

function buildTaskTypePatch(task, nextType) {
  const safeType = nextType === "link" ? "link" : "text";
  const source = task && typeof task === "object" ? task : {};
  const currentType = source.type === "link" ? "link" : "text";
  const currentDescription = String(source.description || "");
  const currentContent = String(source.content || "");

  if (safeType === currentType) {
    return { type: safeType };
  }

  if (safeType === "link") {
    return {
      type: "link",
      description: currentType === "text" ? currentContent : currentDescription,
      content: stringifyTaskLinkContent(
        currentType === "link" ? parseTaskLinkContent(currentContent) : [""],
      ),
    };
  }

  return {
    type: "text",
    description: currentDescription,
    content: currentType === "link" ? currentDescription : currentContent,
  };
}

function forceHomeworkUploadEnabled(plans) {
  const source = Array.isArray(plans) ? plans : [];
  return source.map((lesson) => ({
    ...(lesson && typeof lesson === "object" ? lesson : {}),
    homeworkUploadEnabled: true,
  }));
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
    homeworkUploadEnabled: true,
    tasks: [],
    files: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
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
  const lessonListScrollRef = useRef(null);
  const deleteConfirmInputRef = useRef(null);

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
  const [renameLessonDialog, setRenameLessonDialog] = useState({
    open: false,
    lessonId: "",
    value: "",
    error: "",
  });
  const [homeworkOverviewLoading, setHomeworkOverviewLoading] = useState(false);
  const [homeworkOverviewUpdatedAt, setHomeworkOverviewUpdatedAt] = useState("");
  const [homeworkLessons, setHomeworkLessons] = useState([]);
  const [selectedHomeworkLessonId, setSelectedHomeworkLessonId] = useState("");
  const [expandedHomeworkStudentIds, setExpandedHomeworkStudentIds] = useState([]);
  const [downloadingHomeworkFileId, setDownloadingHomeworkFileId] = useState("");
  const [imageLibraryLoading, setImageLibraryLoading] = useState(false);
  const [imageLibraryUpdatedAt, setImageLibraryUpdatedAt] = useState("");
  const [imageLibraryKeyword, setImageLibraryKeyword] = useState("");
  const [imageLibrarySearchInput, setImageLibrarySearchInput] = useState("");
  const [imageLibraryGroups, setImageLibraryGroups] = useState([]);
  const [imageLibraryClassFilter, setImageLibraryClassFilter] = useState("all");
  const [imageLibrarySortBy, setImageLibrarySortBy] = useState("latest");
  const [expandedImageUserIds, setExpandedImageUserIds] = useState([]);
  const [downloadingImageId, setDownloadingImageId] = useState("");
  const [partyRoomManageLoading, setPartyRoomManageLoading] = useState(false);
  const [partyRoomManageUpdatedAt, setPartyRoomManageUpdatedAt] = useState("");
  const [partyRoomItems, setPartyRoomItems] = useState([]);
  const [partyRoomOwnerFilter, setPartyRoomOwnerFilter] = useState("all");
  const [partyRoomMemberSearchInput, setPartyRoomMemberSearchInput] = useState("");
  const [partyRoomSortBy, setPartyRoomSortBy] = useState("admin-order");
  const [copiedPartyRoomId, setCopiedPartyRoomId] = useState("");
  const [joiningPartyRoomId, setJoiningPartyRoomId] = useState("");

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

  const loadHomeworkOverview = useCallback(async () => {
    if (!adminToken) return;
    setHomeworkOverviewLoading(true);
    try {
      const data = await fetchAdminClassroomHomeworkOverview(adminToken);
      const lessons = (Array.isArray(data?.lessons) ? data.lessons : []).map((lesson) => ({
        ...(lesson && typeof lesson === "object" ? lesson : {}),
        homeworkUploadEnabled: true,
      }));
      setHomeworkLessons(lessons);
      setHomeworkOverviewUpdatedAt(new Date().toISOString());
      setSelectedHomeworkLessonId((current) => {
        const currentId = String(current || "").trim();
        if (currentId && lessons.some((lesson) => String(lesson?.id || "").trim() === currentId)) {
          return currentId;
        }
        return String(lessons[0]?.id || "");
      });
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setHomeworkOverviewLoading(false);
    }
  }, [adminToken, handleAuthError]);

  const loadImageLibrary = useCallback(
    async (keyword = imageLibraryKeyword) => {
      if (!adminToken) return;
      const safeKeyword = String(keyword || "").trim();
      setImageLibraryLoading(true);
      try {
        const data = await fetchAdminGeneratedImageGroups(adminToken, safeKeyword);
        setImageLibraryGroups(Array.isArray(data?.groups) ? data.groups : []);
        setImageLibraryKeyword(safeKeyword);
        setImageLibrarySearchInput(safeKeyword);
        setImageLibraryUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
      } catch (rawError) {
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
      } finally {
        setImageLibraryLoading(false);
      }
    },
    [adminToken, handleAuthError, imageLibraryKeyword],
  );

  const loadPartyRoomManage = useCallback(async () => {
    if (!adminToken) return;
    setPartyRoomManageLoading(true);
    try {
      const data = await fetchAdminGroupChatRooms(adminToken);
      setPartyRoomItems(Array.isArray(data?.rooms) ? data.rooms : []);
      setPartyRoomManageUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setPartyRoomManageLoading(false);
    }
  }, [adminToken, handleAuthError]);

  const loadPageData = useCallback(async () => {
    if (!adminToken) {
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return;
    }
    setLoading(true);
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
      const normalizedPlans = forceHomeworkUploadEnabled(plans);
      setTeacherCoursePlans(normalizedPlans);
      const firstPlan = sortLessonPlans(normalizedPlans)[0];
      setSelectedCourseId(String(firstPlan?.id || ""));
      setClassroomUpdatedAt(String(plansData?.updatedAt || ""));
      await loadOnlineSummary();
      await loadHomeworkOverview();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setLoading(false);
    }
  }, [activeSlot, adminToken, handleAuthError, loadHomeworkOverview, loadOnlineSummary, navigate]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (activePanel !== "homework") return;
    void loadHomeworkOverview();
  }, [activePanel, loadHomeworkOverview]);

  useEffect(() => {
    if (activePanel !== "image-library") return;
    void loadImageLibrary();
  }, [activePanel, loadImageLibrary]);

  useEffect(() => {
    if (activePanel !== "party-manage") return;
    void loadPartyRoomManage();
  }, [activePanel, loadPartyRoomManage]);

  useEffect(() => {
    const existingIds = new Set(
      imageLibraryGroups
        .map((group) => String(group?.userId || group?.baseUserId || "").trim())
        .filter(Boolean),
    );
    setExpandedImageUserIds((current) => {
      if (existingIds.size === 0) return [];
      const filtered = current.filter((id) => existingIds.has(String(id || "").trim()));
      return filtered;
    });
  }, [imageLibraryGroups]);

  useEffect(() => {
    if (imageLibraryClassFilter === "all") return;
    const exists = imageLibraryGroups.some(
      (group) =>
        String(group?.className || "未分班").trim() === imageLibraryClassFilter,
    );
    if (!exists) {
      setImageLibraryClassFilter("all");
    }
  }, [imageLibraryClassFilter, imageLibraryGroups]);

  useEffect(() => {
    if (partyRoomOwnerFilter === "all") return;
    const exists = partyRoomItems.some(
      (room) => String(room?.owner?.id || "").trim() === partyRoomOwnerFilter,
    );
    if (!exists) {
      setPartyRoomOwnerFilter("all");
    }
  }, [partyRoomItems, partyRoomOwnerFilter]);

  useEffect(() => {
    if (!copiedPartyRoomId) return;
    const timerId = window.setTimeout(() => {
      setCopiedPartyRoomId("");
    }, 1500);
    return () => window.clearTimeout(timerId);
  }, [copiedPartyRoomId]);

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
    if (!Array.isArray(homeworkLessons) || homeworkLessons.length === 0) {
      if (selectedHomeworkLessonId) setSelectedHomeworkLessonId("");
      return;
    }
    const exists = homeworkLessons.some(
      (lesson) => String(lesson?.id || "") === String(selectedHomeworkLessonId || ""),
    );
    if (!exists) {
      setSelectedHomeworkLessonId(String(homeworkLessons[0]?.id || ""));
    }
  }, [homeworkLessons, selectedHomeworkLessonId]);

  useEffect(() => {
    setExpandedHomeworkStudentIds([]);
  }, [selectedHomeworkLessonId]);

  useEffect(() => {
    setSelectedTaskId("");
    setTimeEditorDialog({
      open: false,
      startLocal: "",
      endLocal: "",
    });
    setRenameLessonDialog({
      open: false,
      lessonId: "",
      value: "",
      error: "",
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

  const sidebarGroups = useMemo(
    () => [
      {
        key: "classroom-group",
        label: "课堂管理",
        items: [
          { key: "classroom", label: "课时管理", icon: ClipboardList },
          { key: "homework", label: "作业管理", icon: FileText },
        ],
      },
      {
        key: "student-group",
        label: "学生管理",
        items: [
          { key: "image-library", label: "图片管理", icon: Image },
          { key: "party-manage", label: "群聊管理", icon: MessageCircleMore },
          { key: "online", label: "在线状态", icon: Users },
        ],
      },
      {
        key: "external-group",
        label: "外部工具",
        external: true,
        dividerBefore: true,
        items: [
          { key: "agent", label: "智能体管理", icon: Bot, external: true },
          { key: "workshop", label: "进入元协坊", icon: Sparkles, external: true },
          { key: "image-generation", label: "图片生成", icon: Image, external: true },
          { key: "party", label: "派·协作", icon: Users, external: true },
        ],
      },
    ],
    [],
  );

  async function openTeacherFeature(pathname) {
    if (!adminToken) return;
    setError("");
    try {
      const data = await createAdminChatSession(adminToken);
      const nextToken = String(data?.token || "").trim();
      if (!nextToken) {
        throw new Error("教师应用会话创建失败，请稍后重试。");
      }
      const teacherScopeKey = String(data?.teacherScopeKey || "").trim();
      const teacherScopeLabel = String(data?.teacherScopeLabel || "").trim();
      setUserToken(nextToken, activeSlot);
      setStoredAuthUser(
        {
          ...(data?.user && typeof data.user === "object" ? data.user : {}),
          teacherScopeKey,
          teacherScopeLabel,
        },
        activeSlot,
      );
      const safePath = String(pathname || "").trim() || "/chat";
      const joiner = safePath.includes("?") ? "&" : "?";
      navigate(withAuthSlot(`${safePath}${joiner}returnTo=teacher-home`, activeSlot));
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    }
  }

  function onSidebarItemClick(itemKey) {
    if (itemKey === "agent") {
      navigate(withAuthSlot("/admin/agent-settings", activeSlot));
      return;
    }
    if (itemKey === "workshop") {
      void openTeacherFeature("/chat");
      return;
    }
    if (itemKey === "image-generation") {
      void openTeacherFeature("/image-generation");
      return;
    }
    if (itemKey === "party") {
      void openTeacherFeature("/party");
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

  const imageLibraryClassOptions = useMemo(() => {
    const counter = new Map();
    imageLibraryGroups.forEach((group) => {
      const className = String(group?.className || "未分班").trim() || "未分班";
      counter.set(className, Number(counter.get(className) || 0) + 1);
    });
    return Array.from(counter.entries())
      .map(([className, userCount]) => ({ className, userCount }))
      .sort((a, b) =>
        String(a.className || "").localeCompare(String(b.className || ""), "zh-CN", {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [imageLibraryGroups]);

  const visibleImageLibraryGroups = useMemo(() => {
    let groups = Array.isArray(imageLibraryGroups) ? [...imageLibraryGroups] : [];
    if (imageLibraryClassFilter !== "all") {
      groups = groups.filter(
        (group) => String(group?.className || "未分班").trim() === imageLibraryClassFilter,
      );
    }

    if (imageLibrarySortBy === "count") {
      groups.sort((a, b) => {
        const countDiff = Number(b?.imageCount || 0) - Number(a?.imageCount || 0);
        if (countDiff !== 0) return countDiff;
        return String(a?.studentName || a?.username || "").localeCompare(
          String(b?.studentName || b?.username || ""),
          "zh-CN",
          { sensitivity: "base" },
        );
      });
      return groups;
    }

    groups.sort((a, b) => {
      const aTime = Date.parse(String(a?.latestCreatedAt || "")) || 0;
      const bTime = Date.parse(String(b?.latestCreatedAt || "")) || 0;
      if (bTime !== aTime) return bTime - aTime;
      return String(a?.studentName || a?.username || "").localeCompare(
        String(b?.studentName || b?.username || ""),
        "zh-CN",
        { sensitivity: "base" },
      );
    });
    return groups;
  }, [imageLibraryClassFilter, imageLibraryGroups, imageLibrarySortBy]);

  const partyRoomSummary = useMemo(() => {
    const rooms = Array.isArray(partyRoomItems) ? partyRoomItems : [];
    const memberIdSet = new Set();
    rooms.forEach((room) => {
      const members = Array.isArray(room?.members) ? room.members : [];
      members.forEach((member) => {
        const memberId = String(member?.id || "").trim();
        if (memberId) memberIdSet.add(memberId);
      });
    });
    return {
      roomCount: rooms.length,
      memberCount: memberIdSet.size,
    };
  }, [partyRoomItems]);

  const partyRoomOwnerOptions = useMemo(() => {
    const options = [];
    const seen = new Set();
    partyRoomItems.forEach((room) => {
      const owner = room?.owner && typeof room.owner === "object" ? room.owner : null;
      const ownerId = String(owner?.id || "").trim();
      const ownerRole = String(owner?.role || "")
        .trim()
        .toLowerCase();
      if (!ownerId || ownerRole !== "admin" || seen.has(ownerId)) return;
      seen.add(ownerId);
      options.push({
        id: ownerId,
        label: String(owner?.displayName || owner?.username || "管理员").trim() || "管理员",
        username: String(owner?.username || "").trim(),
      });
    });
    return options;
  }, [partyRoomItems]);

  const visiblePartyRoomItems = useMemo(() => {
    let rooms = Array.isArray(partyRoomItems) ? [...partyRoomItems] : [];
    if (partyRoomOwnerFilter !== "all") {
      rooms = rooms.filter(
        (room) => String(room?.owner?.id || "").trim() === partyRoomOwnerFilter,
      );
    }

    const keyword = String(partyRoomMemberSearchInput || "")
      .trim()
      .toLowerCase();
    if (keyword) {
      rooms = rooms.filter((room) => {
        const members = Array.isArray(room?.members) ? room.members : [];
        const tokens = [
          room?.name,
          room?.roomCode,
          room?.owner?.displayName,
          room?.owner?.username,
          room?.owner?.studentId,
          room?.owner?.className,
          ...members.flatMap((member) => [
            member?.displayName,
            member?.username,
            member?.studentId,
            member?.className,
          ]),
        ];
        return tokens.some((token) => String(token || "").toLowerCase().includes(keyword));
      });
    }

    rooms.sort((a, b) => {
      if (partyRoomSortBy === "updated") {
        const updatedDiff =
          (Date.parse(String(b?.updatedAt || "")) || 0) -
          (Date.parse(String(a?.updatedAt || "")) || 0);
        if (updatedDiff !== 0) return updatedDiff;
      } else {
        const aOrder = Number(a?.ownerAdminSortOrder || 999);
        const bOrder = Number(b?.ownerAdminSortOrder || 999);
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      return String(a?.name || "").localeCompare(String(b?.name || ""), "zh-CN", {
        sensitivity: "base",
      });
    });
    return rooms;
  }, [partyRoomItems, partyRoomOwnerFilter, partyRoomMemberSearchInput, partyRoomSortBy]);

  const visiblePartyRoomSummary = useMemo(() => {
    const memberIdSet = new Set();
    visiblePartyRoomItems.forEach((room) => {
      const members = Array.isArray(room?.members) ? room.members : [];
      members.forEach((member) => {
        const memberId = String(member?.id || "").trim();
        if (memberId) memberIdSet.add(memberId);
      });
    });
    return {
      roomCount: visiblePartyRoomItems.length,
      memberCount: memberIdSet.size,
    };
  }, [visiblePartyRoomItems]);

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
  const selectedTaskLinks = useMemo(() => {
    if (!selectedTask || selectedTask.type !== "link") return [];
    return parseTaskLinkContent(selectedTask.content);
  }, [selectedTask]);
  const selectedHomeworkLesson = useMemo(
    () =>
      homeworkLessons.find(
        (lesson) => String(lesson?.id || "") === String(selectedHomeworkLessonId || ""),
      ) || null,
    [homeworkLessons, selectedHomeworkLessonId],
  );
  const selectedHomeworkStudents = useMemo(
    () => (Array.isArray(selectedHomeworkLesson?.students) ? selectedHomeworkLesson.students : []),
    [selectedHomeworkLesson],
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
    clearUserAuthSession(activeSlot);
    setAdminToken("");
    navigate(withAuthSlot("/login", activeSlot), { replace: true });
  }

  function onCreateLesson() {
    const nextLesson = buildLessonDraft(teacherCoursePlans.length + 1);
    setTeacherCoursePlans((current) => [...current, nextLesson]);
    setSelectedCourseId(String(nextLesson.id));
    setError("");
  }

  function onOpenRenameLessonDialog() {
    if (!selectedCourse) return;
    setRenameLessonDialog({
      open: true,
      lessonId: String(selectedCourse.id || ""),
      value: String(selectedCourse.courseName || "").trim(),
      error: "",
    });
  }

  function onCloseRenameLessonDialog() {
    setRenameLessonDialog({
      open: false,
      lessonId: "",
      value: "",
      error: "",
    });
  }

  function onSubmitRenameLessonDialog(event) {
    if (event) event.preventDefault();
    const targetLessonId = String(renameLessonDialog.lessonId || "").trim();
    const nextName = String(renameLessonDialog.value || "").trim();
    if (!targetLessonId) {
      onCloseRenameLessonDialog();
      return;
    }
    if (!nextName) {
      setRenameLessonDialog((current) => ({
        ...current,
        error: "课时名称不能为空。",
      }));
      return;
    }
    setTeacherCoursePlans((current) =>
      current.map((item) =>
        String(item?.id || "") === targetLessonId
          ? {
              ...item,
              courseName: nextName,
            }
          : item,
      ),
    );
    setError("");
    onCloseRenameLessonDialog();
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

  function onUpdateSelectedTaskLinkAt(linkIndex, value) {
    if (!selectedTask || selectedTask.type !== "link") return;
    const safeIndex = Number.isInteger(linkIndex) ? linkIndex : -1;
    if (safeIndex < 0) return;
    const links = parseTaskLinkContent(selectedTask.content);
    while (links.length <= safeIndex) {
      links.push("");
    }
    links[safeIndex] = String(value || "");
    onUpdateSelectedTask(selectedTask.id, {
      content: stringifyTaskLinkContent(links),
    });
  }

  function onAddSelectedTaskLink() {
    if (!selectedTask || selectedTask.type !== "link") return;
    const links = parseTaskLinkContent(selectedTask.content);
    links.push("");
    onUpdateSelectedTask(selectedTask.id, {
      content: stringifyTaskLinkContent(links),
    });
  }

  function onRemoveSelectedTaskLink(linkIndex) {
    if (!selectedTask || selectedTask.type !== "link") return;
    const safeIndex = Number.isInteger(linkIndex) ? linkIndex : -1;
    if (safeIndex < 0) return;
    const links = parseTaskLinkContent(selectedTask.content);
    const nextLinks = links.filter((_, index) => index !== safeIndex);
    onUpdateSelectedTask(selectedTask.id, {
      content: stringifyTaskLinkContent(nextLinks.length > 0 ? nextLinks : [""]),
    });
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

  function onLessonListWheel(event) {
    const scrollEl = lessonListScrollRef.current;
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
    const plansToSave = forceHomeworkUploadEnabled(teacherCoursePlans);
    try {
      const data = await saveAdminClassroomPlans(adminToken, {
        shangguanClassTaskProductImprovementEnabled: !!productTaskEnabled,
        teacherCoursePlans: plansToSave,
      });
      const savedPlans = Array.isArray(data?.teacherCoursePlans) ? data.teacherCoursePlans : [];
      const normalizedPlans = forceHomeworkUploadEnabled(savedPlans);
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
      void loadHomeworkOverview();
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
    loadHomeworkOverview,
    productTaskEnabled,
    saving,
    selectedCourseId,
    teacherCoursePlans,
  ]);

  async function onSaveClassroomConfig() {
    await persistClassroomConfig({ silent: false });
  }

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
      const normalizedPlans = forceHomeworkUploadEnabled(plans);
      setTeacherCoursePlans(normalizedPlans);
      setClassroomUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
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
      const normalizedPlans = forceHomeworkUploadEnabled(plans);
      setTeacherCoursePlans(normalizedPlans);
      setClassroomUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
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

  function resolveHomeworkStudentRowKey(student, fallbackIndex = 0) {
    return (
      String(student?.userId || "").trim() ||
      String(student?.studentId || "").trim() ||
      String(student?.username || "").trim() ||
      String(student?.studentName || "").trim() ||
      `student-${fallbackIndex + 1}`
    );
  }

  function onToggleHomeworkStudentExpand(student, rowIndex = 0) {
    const rowKey = resolveHomeworkStudentRowKey(student, rowIndex);
    if (!rowKey) return;
    setExpandedHomeworkStudentIds((current) => {
      if (current.includes(rowKey)) {
        return current.filter((item) => item !== rowKey);
      }
      return [...current, rowKey];
    });
  }

  async function onDownloadHomeworkFile(file) {
    if (!adminToken) return;
    const fileId = String(file?.id || "").trim();
    if (!fileId) return;
    setDownloadingHomeworkFileId(fileId);
    setError("");
    try {
      const data = await downloadAdminClassroomHomeworkFile(adminToken, fileId);
      if (data?.downloadUrl) {
        triggerUrlDownload(data.downloadUrl, data.filename || file?.name || "作业文件.bin");
      } else if (data?.blob) {
        triggerBrowserDownload(data.blob, data.filename || file?.name || "作业文件.bin");
      } else {
        throw new Error("作业文件下载失败，请稍后重试。");
      }
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setDownloadingHomeworkFileId("");
    }
  }

  function buildAdminImagePreviewUrl(pathname) {
    const safePath = String(pathname || "").trim();
    const safeToken = String(adminToken || "").trim();
    if (!safePath) return "";
    if (!safeToken) return safePath;
    const joiner = safePath.includes("?") ? "&" : "?";
    return `${safePath}${joiner}token=${encodeURIComponent(safeToken)}`;
  }

  function resolveImageLibraryGroupId(group, fallbackIndex = 0) {
    return (
      String(group?.userId || "").trim() ||
      String(group?.baseUserId || "").trim() ||
      String(group?.username || "").trim() ||
      `image-group-${fallbackIndex + 1}`
    );
  }

  function onToggleImageGroupExpand(group, groupIndex = 0) {
    const groupId = resolveImageLibraryGroupId(group, groupIndex);
    if (!groupId) return;
    setExpandedImageUserIds((current) => {
      if (current.includes(groupId)) {
        return current.filter((item) => item !== groupId);
      }
      return [...current, groupId];
    });
  }

  function onSubmitImageLibrarySearch(event) {
    if (event) event.preventDefault();
    void loadImageLibrary(imageLibrarySearchInput);
  }

  function onClearImageLibraryFilters() {
    setImageLibrarySearchInput("");
    setImageLibraryClassFilter("all");
    void loadImageLibrary("");
  }

  async function onDownloadGeneratedImage(image) {
    if (!adminToken) return;
    const imageId = String(image?.id || "").trim();
    if (!imageId) return;
    setDownloadingImageId(imageId);
    setError("");
    try {
      const data = await downloadAdminGeneratedImage(adminToken, imageId);
      if (data?.downloadUrl) {
        triggerUrlDownload(data.downloadUrl, data.filename || "图片.png");
      } else if (data?.blob) {
        triggerBrowserDownload(data.blob, data.filename || "图片.png");
      } else {
        throw new Error("下载图片失败，请稍后重试。");
      }
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setDownloadingImageId("");
    }
  }

  function readPartyMemberDisplayName(member) {
    return String(member?.displayName || "").trim() || "未知用户";
  }

  function formatPartyMemberDetail(member) {
    const displayName = readPartyMemberDisplayName(member);
    const username = String(member?.username || "").trim();
    const studentId = String(member?.studentId || "").trim();
    const className = String(member?.className || "").trim();
    const role = String(member?.role || "").trim().toLowerCase();
    const roleLabel = role === "admin" ? "管理员" : role === "user" ? "学生" : "成员";
    const detailParts = [roleLabel];
    if (className) detailParts.push(className);
    if (studentId) detailParts.push(studentId);
    if (username) detailParts.push(`@${username}`);
    return `${displayName}（${detailParts.join(" · ")}）`;
  }

  async function onCopyPartyRoomCode(room) {
    const roomId = String(room?.id || "").trim();
    const roomCode = String(room?.roomCode || "").trim();
    if (!roomId || !roomCode) return;
    setError("");

    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = roomCode;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copied;
      } catch {
        document.body.removeChild(textarea);
        return false;
      }
    };

    let copied = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(roomCode);
        copied = true;
      } catch {
        copied = fallbackCopy();
      }
    } else {
      copied = fallbackCopy();
    }

    if (!copied) {
      setError("复制派号失败，请手动复制。");
      return;
    }
    setCopiedPartyRoomId(roomId);
  }

  async function onJoinPartyRoom(room) {
    const roomId = String(room?.id || "").trim();
    const roomCode = String(room?.roomCode || "").trim();
    if (!roomCode) {
      setError("该派缺少派号，暂无法加入。");
      return;
    }
    setJoiningPartyRoomId(roomId || roomCode);
    try {
      await openTeacherFeature(`/party?joinRoomCode=${encodeURIComponent(roomCode)}`);
    } finally {
      setJoiningPartyRoomId("");
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
            {sidebarGroups.map((group) => (
              <section
                key={group.key}
                className={`teacher-home-nav-group${group.external ? " external" : ""}`}
              >
                {group.dividerBefore ? (
                  <div className="teacher-home-nav-group-divider" aria-hidden="true" />
                ) : null}
                <p className="teacher-home-nav-group-title">{group.label}</p>
                <div className="teacher-home-nav-group-items">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`teacher-home-nav-item${activePanel === item.key ? " active" : ""}${
                          item.external ? " external" : ""
                        }`}
                        onClick={() => onSidebarItemClick(item.key)}
                      >
                        <Icon size={17} />
                        <span className="teacher-home-nav-label">{item.label}</span>
                        {item.external ? (
                          <span
                            className="teacher-home-nav-open-indicator"
                            aria-hidden="true"
                            title="新页面"
                          >
                            <ExternalLink size={13} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
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
                    <div
                      className="teacher-lesson-list"
                      ref={lessonListScrollRef}
                      onWheel={onLessonListWheel}
                    >
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
                            className="teacher-ghost-btn teacher-lesson-rename-trigger"
                            onClick={onOpenRenameLessonDialog}
                          >
                            <Pencil size={14} />
                            <span>重命名课时</span>
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
                    <div className="teacher-lesson-detail-scroll">
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
                                    onChange={(value) => {
                                      const nextType = value === "link" ? "link" : "text";
                                      onUpdateSelectedTask(
                                        selectedTask.id,
                                        buildTaskTypePatch(selectedTask, nextType),
                                      );
                                    }}
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
                              <div className="teacher-task-editor-content">
                                {selectedTask.type === "link" ? (
                                  <>
                                    <label className="teacher-task-optional-field">
                                      <span>
                                        任务说明
                                        <em>（选填）</em>
                                      </span>
                                      <textarea
                                        value={selectedTask.description || ""}
                                        onChange={(e) =>
                                          onUpdateSelectedTask(selectedTask.id, {
                                            description: e.target.value,
                                          })
                                        }
                                        placeholder="例如：请完成本次课堂调查，约3分钟，匿名填写。"
                                      />
                                    </label>
                                    <div className="teacher-link-editor-head">
                                      <span>链接地址</span>
                                      <button
                                        type="button"
                                        className="teacher-link-add-btn"
                                        onClick={onAddSelectedTaskLink}
                                        title="添加一条链接地址"
                                        aria-label="添加一条链接地址"
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                    <div className="teacher-link-input-list">
                                      {selectedTaskLinks.map((link, linkIndex) => (
                                        <div
                                          key={`link-${selectedTask.id}-${linkIndex + 1}`}
                                          className="teacher-link-input-row"
                                        >
                                          <input
                                            type="text"
                                            value={link}
                                            onChange={(event) =>
                                              onUpdateSelectedTaskLinkAt(linkIndex, event.target.value)
                                            }
                                            placeholder="请输入 https:// 开头链接"
                                          />
                                          <button
                                            type="button"
                                            className="teacher-icon-btn danger"
                                            onClick={() => onRemoveSelectedTaskLink(linkIndex)}
                                            disabled={selectedTaskLinks.length <= 1}
                                            title="删除该链接地址"
                                            aria-label="删除该链接地址"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span>任务内容</span>
                                    <textarea
                                      value={selectedTask.content || ""}
                                      onChange={(e) =>
                                        onUpdateSelectedTask(selectedTask.id, { content: e.target.value })
                                      }
                                      placeholder="请输入任务说明、提交要求或评分标准"
                                    />
                                  </>
                                )}
                              </div>
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

          {activePanel === "homework" ? (
            <div className="teacher-panel-stack teacher-homework-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>作业管理</h2>
                  <p className="teacher-panel-save-time">
                    {`最近刷新：${formatDisplayTime(homeworkOverviewUpdatedAt)}`}
                  </p>
                </div>
                <div className="teacher-panel-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn"
                    onClick={() => void loadHomeworkOverview()}
                    disabled={homeworkOverviewLoading}
                  >
                    <RefreshCw size={15} className={homeworkOverviewLoading ? "is-spinning" : ""} />
                    <span>{homeworkOverviewLoading ? "刷新中..." : "刷新作业统计"}</span>
                  </button>
                </div>
              </header>

              <section className="teacher-card teacher-homework-workbench">
                <div className="teacher-homework-list-panel">
                  <div className="teacher-lesson-list-head">
                    <h3>课时列表</h3>
                    <div className="teacher-lesson-list-head-right">
                      <span>{`${homeworkLessons.length} 节课`}</span>
                    </div>
                  </div>
                  {homeworkLessons.length === 0 ? (
                    <p className="teacher-empty-text">暂无课时或尚未创建作业。</p>
                  ) : (
                    <div className="teacher-lesson-list">
                      {homeworkLessons.map((lesson, index) => {
                        const lessonId = String(lesson?.id || "");
                        const active = lessonId === String(selectedHomeworkLessonId || "");
                        const studentTotal = Number(lesson?.studentTotal || 0);
                        const uploadedStudentCount = Number(lesson?.uploadedStudentCount || 0);
                        const missingStudentCount = Number(lesson?.missingStudentCount || 0);
                        return (
                          <article
                            key={lessonId || `homework-lesson-${index + 1}`}
                            className={`teacher-lesson-row${active ? " active" : ""}`}
                          >
                            <button
                              type="button"
                              className="teacher-lesson-row-main"
                              onClick={() => setSelectedHomeworkLessonId(lessonId)}
                            >
                              <strong>{lesson?.courseName || `第${index + 1}节课`}</strong>
                              <p>{`已交 ${uploadedStudentCount}/${studentTotal}`}</p>
                              <span>{`漏交 ${missingStudentCount} 人`}</span>
                            </button>
                            <div className="teacher-lesson-row-actions">
                              <span
                                className={`teacher-lesson-status${
                                  lesson?.homeworkUploadEnabled ? "" : " closed"
                                }`}
                              >
                                {lesson?.homeworkUploadEnabled ? "可交作业" : "未开放上传"}
                              </span>
                              <span
                                className="teacher-row-setting-btn teacher-row-setting-btn-placeholder"
                                aria-hidden="true"
                              />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="teacher-homework-detail-panel">
                  {!selectedHomeworkLesson ? (
                    <p className="teacher-empty-text">请选择左侧课时查看作业提交详情。</p>
                  ) : (
                    <>
                      <div className="teacher-homework-summary-grid">
                        <article className="teacher-homework-summary-card">
                          <span>应交人数</span>
                          <strong>{selectedHomeworkLesson.studentTotal || 0}</strong>
                        </article>
                        <article className="teacher-homework-summary-card">
                          <span>已交人数</span>
                          <strong>{selectedHomeworkLesson.uploadedStudentCount || 0}</strong>
                        </article>
                        <article className="teacher-homework-summary-card danger">
                          <span>漏交人数</span>
                          <strong>{selectedHomeworkLesson.missingStudentCount || 0}</strong>
                        </article>
                      </div>
                      <div className="teacher-homework-table-wrap">
                        <table className="teacher-homework-table">
                          <thead>
                            <tr>
                              <th>学号</th>
                              <th>姓名</th>
                              <th>班级</th>
                              <th>提交状态</th>
                              <th>作业份数</th>
                              <th>最近提交</th>
                              <th>文件明细</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedHomeworkStudents.length === 0 ? (
                              <tr>
                                <td colSpan={7}>暂无学生数据。</td>
                              </tr>
                            ) : (
                              selectedHomeworkStudents.map((student, studentIndex) => {
                                const rowKey = resolveHomeworkStudentRowKey(student, studentIndex);
                                const files = Array.isArray(student?.files) ? student.files : [];
                                const canExpand = files.length > 0;
                                const expanded = canExpand && expandedHomeworkStudentIds.includes(rowKey);
                                return (
                                  <Fragment key={rowKey}>
                                    <tr
                                      className={`teacher-homework-student-row${
                                        canExpand ? " expandable" : ""
                                      }${expanded ? " expanded" : ""}`}
                                      onClick={() => {
                                        if (!canExpand) return;
                                        onToggleHomeworkStudentExpand(student, studentIndex);
                                      }}
                                    >
                                      <td>{student?.studentId || "-"}</td>
                                      <td>{student?.studentName || student?.username || "-"}</td>
                                      <td>{student?.className || "-"}</td>
                                      <td>{student?.submitted ? "已提交" : "未提交"}</td>
                                      <td>{student?.fileCount || 0}</td>
                                      <td>{formatDisplayTime(student?.latestUploadedAt)}</td>
                                      <td>
                                        {canExpand ? (
                                          <button
                                            type="button"
                                            className="teacher-homework-expand-btn"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              onToggleHomeworkStudentExpand(student, studentIndex);
                                            }}
                                          >
                                            {expanded ? (
                                              <>
                                                <ChevronUp size={14} />
                                                <span>收起</span>
                                              </>
                                            ) : (
                                              <>
                                                <ChevronDown size={14} />
                                                <span>展开</span>
                                              </>
                                            )}
                                          </button>
                                        ) : (
                                          <span className="teacher-homework-expand-placeholder">-</span>
                                        )}
                                      </td>
                                    </tr>
                                    {expanded ? (
                                      <tr className="teacher-homework-detail-row">
                                        <td colSpan={7}>
                                          <div className="teacher-homework-file-list">
                                            {files.map((file, fileIndex) => {
                                              const fileId = String(file?.id || "").trim();
                                              const downloading = downloadingHomeworkFileId === fileId;
                                              return (
                                                <div
                                                  key={fileId || `${rowKey}-file-${fileIndex + 1}`}
                                                  className="teacher-homework-file-item"
                                                >
                                                  <div className="teacher-homework-file-meta">
                                                    <strong>{file?.name || "作业文件"}</strong>
                                                    <span>{formatFileSize(file?.size)}</span>
                                                    <small>{`上传于 ${formatDisplayTime(file?.uploadedAt)}`}</small>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    className="teacher-icon-btn"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      void onDownloadHomeworkFile(file);
                                                    }}
                                                    disabled={!fileId || downloading}
                                                    title={downloading ? "下载中..." : "下载作业"}
                                                  >
                                                    <Download size={14} />
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {Array.isArray(selectedHomeworkLesson?.unlistedStudents) &&
                      selectedHomeworkLesson.unlistedStudents.length > 0 ? (
                        <p className="teacher-homework-unlisted-note">
                          {`另有 ${selectedHomeworkLesson.unlistedStudents.length} 位未在花名册内的学生提交了作业。`}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activePanel === "image-library" ? (
            <div className="teacher-panel-stack teacher-image-library-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>图片管理</h2>
                  <p className="teacher-panel-save-time">
                    {`最近刷新：${formatDisplayTime(imageLibraryUpdatedAt)}`}
                  </p>
                </div>
                <div className="teacher-panel-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn"
                    onClick={() => void loadImageLibrary()}
                    disabled={imageLibraryLoading}
                  >
                    <RefreshCw size={15} className={imageLibraryLoading ? "is-spinning" : ""} />
                    <span>{imageLibraryLoading ? "刷新中..." : "刷新图片列表"}</span>
                  </button>
                </div>
              </header>

              <section className="teacher-card teacher-image-library-card">
                <div className="teacher-image-library-search-wrap">
                  <form className="teacher-image-library-search" onSubmit={onSubmitImageLibrarySearch}>
                    <div className="teacher-image-search-input-wrap">
                      <Search size={14} />
                      <input
                        id="teacher-image-library-keyword"
                        type="text"
                        aria-label="用户搜索"
                        value={imageLibrarySearchInput}
                        onChange={(event) => setImageLibrarySearchInput(event.target.value)}
                        placeholder="输入用户名/姓名/学号/班级"
                        maxLength={80}
                      />
                    </div>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={imageLibraryLoading}
                    >
                      <span>搜索</span>
                    </button>
                  </form>

                  <div className="teacher-image-library-filter-row">
                    <div className="teacher-image-library-chip-group">
                      <button
                        type="button"
                        className={`teacher-image-chip${imageLibraryClassFilter === "all" ? " active" : ""}`}
                        onClick={() => setImageLibraryClassFilter("all")}
                      >
                        全部
                      </button>
                      {imageLibraryClassOptions.map((item) => (
                        <button
                          key={item.className}
                          type="button"
                          className={`teacher-image-chip${imageLibraryClassFilter === item.className ? " active" : ""}`}
                          onClick={() => setImageLibraryClassFilter(item.className)}
                        >
                          {`${item.className} (${item.userCount})`}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="teacher-image-sort-btn"
                      onClick={() =>
                        setImageLibrarySortBy((current) =>
                          current === "latest" ? "count" : "latest",
                        )
                      }
                    >
                      {imageLibrarySortBy === "latest" ? "排序：最近生成" : "排序：图片数量"}
                    </button>
                  </div>
                </div>
                <div className="teacher-image-library-list">
                  {visibleImageLibraryGroups.length === 0 ? (
                    <div className="teacher-image-library-empty">
                      <ImageOff size={28} />
                      <p>
                        {imageLibraryLoading
                          ? "正在加载图片列表..."
                          : imageLibraryKeyword || imageLibraryClassFilter !== "all"
                            ? "没有匹配的用户图片，建议清除筛选后再试。"
                            : "暂未找到可管理的图片。"}
                      </p>
                      {imageLibraryKeyword || imageLibraryClassFilter !== "all" ? (
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={onClearImageLibraryFilters}
                        >
                          清除筛选条件
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    visibleImageLibraryGroups.map((group, groupIndex) => {
                      const groupKey = resolveImageLibraryGroupId(group, groupIndex);
                      const expanded = expandedImageUserIds.includes(groupKey);
                      const images = Array.isArray(group?.images) ? group.images : [];
                      const avatar = String(group?.studentName || group?.username || "图")
                        .trim()
                        .slice(0, 1);
                      return (
                        <article
                          key={groupKey}
                          className={`teacher-image-user-group${expanded ? " expanded" : ""}`}
                        >
                          <button
                            type="button"
                            className="teacher-image-user-row"
                            onClick={() => onToggleImageGroupExpand(group, groupIndex)}
                          >
                            <span className="teacher-image-user-avatar" aria-hidden="true">
                              {avatar || "图"}
                            </span>
                            <div className="teacher-image-user-row-main">
                              <strong>{group?.studentName || group?.username || "未命名用户"}</strong>
                              <span>{group?.username ? `@${group.username}` : "@-"}</span>
                              <span>{group?.studentId || "学号未填写"}</span>
                              <span>{group?.className || "未分班"}</span>
                            </div>
                            <div className="teacher-image-user-row-stats">
                              <span className="teacher-image-count-chip">
                                {`${Number(group?.imageCount || images.length)} 张图片`}
                              </span>
                              <small>{`最近 ${formatDisplayTime(group?.latestCreatedAt)}`}</small>
                              <ChevronDown
                                size={16}
                                className={`teacher-image-row-chevron${expanded ? " expanded" : ""}`}
                              />
                            </div>
                          </button>
                          <div
                            className={`teacher-image-user-content${expanded ? " expanded" : ""}`}
                            aria-hidden={!expanded}
                          >
                            <div className="teacher-image-thumb-grid">
                              {images.map((image, imageIndex) => {
                                const imageId = String(image?.id || "").trim();
                                const previewPath = String(image?.previewPath || "").trim();
                                const previewUrl = buildAdminImagePreviewUrl(previewPath);
                                const downloading = downloadingImageId === imageId;
                                return (
                                  <article
                                    key={imageId || `${groupKey}-image-${imageIndex + 1}`}
                                    className="teacher-image-thumb-item"
                                  >
                                    <div className="teacher-image-thumb-media">
                                      {previewUrl ? (
                                        <img src={previewUrl} alt={image?.prompt || "生成图片"} />
                                      ) : (
                                        <div className="teacher-image-thumb-empty">图片不可预览</div>
                                      )}
                                      <div className="teacher-image-thumb-overlay">
                                        <a
                                          href={previewUrl || "#"}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          className="teacher-image-overlay-btn"
                                          aria-disabled={!previewUrl}
                                          onClick={(event) => {
                                            if (previewUrl) return;
                                            event.preventDefault();
                                          }}
                                        >
                                          访问
                                        </a>
                                        <button
                                          type="button"
                                          className="teacher-image-overlay-btn"
                                          onClick={() => void onDownloadGeneratedImage(image)}
                                          disabled={!imageId || downloading}
                                        >
                                          {downloading ? "下载中..." : "下载"}
                                        </button>
                                      </div>
                                    </div>
                                    <div className="teacher-image-thumb-info">
                                      <p title={image?.prompt || "无提示词"}>
                                        {image?.prompt || "无提示词"}
                                      </p>
                                      <span>{formatDisplayTime(image?.createdAt)}</span>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activePanel === "party-manage" ? (
            <div className="teacher-panel-stack teacher-party-manage-stack">
              <header className="teacher-panel-head">
                <div>
                  <h2>群聊管理</h2>
                  <p className="teacher-panel-save-time">
                    {`最近刷新：${formatDisplayTime(partyRoomManageUpdatedAt)}`}
                  </p>
                </div>
                <div className="teacher-panel-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn"
                    onClick={() => void loadPartyRoomManage()}
                    disabled={partyRoomManageLoading}
                  >
                    <RefreshCw size={15} className={partyRoomManageLoading ? "is-spinning" : ""} />
                    <span>{partyRoomManageLoading ? "刷新中..." : "刷新群聊列表"}</span>
                  </button>
                </div>
              </header>

              <section className="teacher-card teacher-party-manage-card">
                <div className="teacher-party-manage-summary">
                  <span>{`派总数：${visiblePartyRoomSummary.roomCount}/${partyRoomSummary.roomCount}`}</span>
                  <span>{`参与成员：${visiblePartyRoomSummary.memberCount}`}</span>
                </div>

                <div className="teacher-party-manage-filter">
                  <div className="teacher-party-filter-top">
                    <div className="teacher-party-owner-chip-group">
                      <button
                        type="button"
                        className={`teacher-party-owner-chip${partyRoomOwnerFilter === "all" ? " active" : ""}`}
                        onClick={() => setPartyRoomOwnerFilter("all")}
                      >
                        全部派主
                      </button>
                      {partyRoomOwnerOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={`teacher-party-owner-chip${partyRoomOwnerFilter === option.id ? " active" : ""}`}
                          onClick={() => setPartyRoomOwnerFilter(option.id)}
                        >
                          {option.username ? `${option.label} (@${option.username})` : option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="teacher-party-sort-btn"
                      onClick={() =>
                        setPartyRoomSortBy((current) =>
                          current === "admin-order" ? "updated" : "admin-order",
                        )
                      }
                    >
                      <ArrowUpDown size={13} />
                      <span>
                        {partyRoomSortBy === "admin-order"
                          ? "排序：管理员账号"
                          : "排序：最近更新"}
                      </span>
                    </button>
                  </div>
                  <div className="teacher-party-search-input-wrap">
                    <Search size={14} />
                    <input
                      type="text"
                      value={partyRoomMemberSearchInput}
                      onChange={(event) => setPartyRoomMemberSearchInput(event.target.value)}
                      placeholder="按成员姓名/学号/账号/班级搜索"
                      maxLength={80}
                    />
                    {String(partyRoomMemberSearchInput || "").trim() ? (
                      <button
                        type="button"
                        className="teacher-party-search-clear-btn"
                        onClick={() => setPartyRoomMemberSearchInput("")}
                        aria-label="清除搜索内容"
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="teacher-party-room-list">
                  {visiblePartyRoomItems.length === 0 ? (
                    <p className="teacher-empty-text">
                      {partyRoomManageLoading
                        ? "正在读取群聊派列表..."
                        : partyRoomOwnerFilter !== "all" ||
                            String(partyRoomMemberSearchInput || "").trim()
                          ? "未找到符合条件的派，请调整筛选条件。"
                          : "当前暂无已创建的派。"}
                    </p>
                  ) : (
                    visiblePartyRoomItems.map((room, roomIndex) => {
                      const roomId = String(room?.id || "").trim() || `party-room-${roomIndex + 1}`;
                      const members = Array.isArray(room?.members) ? room.members : [];
                      const roomCode = String(room?.roomCode || "").trim();
                      const joiningThisRoom = joiningPartyRoomId === roomId;
                      return (
                        <article key={roomId} className="teacher-party-room-item">
                          <header className="teacher-party-room-head">
                            <div>
                              <h3>{room?.name || "未命名派"}</h3>
                              <p>
                                {`派号：${room?.roomCode || "-"} · 成员 ${Number(
                                  room?.memberCount || members.length,
                                )} 人 · 最近更新 ${formatDisplayTime(room?.updatedAt)}`}
                              </p>
                            </div>
                            <div className="teacher-party-room-head-right">
                              <div className="teacher-party-room-actions">
                                <button
                                  type="button"
                                  className="teacher-ghost-btn teacher-party-room-action-btn"
                                  onClick={() => void onCopyPartyRoomCode(room)}
                                  disabled={!roomCode}
                                >
                                  <Copy size={13} />
                                  <span>
                                    {copiedPartyRoomId === roomId ? "已复制" : "复制派号"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="teacher-primary-btn teacher-party-room-action-btn"
                                  onClick={() => void onJoinPartyRoom(room)}
                                  disabled={!roomCode || joiningThisRoom}
                                >
                                  <UserPlus size={13} />
                                  <span>{joiningThisRoom ? "加入中..." : "加入派"}</span>
                                </button>
                              </div>
                            </div>
                          </header>
                          <div className="teacher-party-member-list">
                            {members.length === 0 ? (
                              <span className="teacher-party-member-chip muted">暂无成员</span>
                            ) : (
                              members.map((member, memberIndex) => {
                                const memberId =
                                  String(member?.id || "").trim() ||
                                  `${roomId}-member-${memberIndex + 1}`;
                                const isOwner =
                                  String(room?.owner?.id || "").trim() === String(member?.id || "").trim();
                                return (
                                  <span
                                    key={memberId}
                                    className={`teacher-party-member-chip${isOwner ? " owner" : ""}`}
                                    title={formatPartyMemberDetail(member)}
                                  >
                                    {isOwner ? <Crown size={12} /> : null}
                                    <span className="teacher-party-member-name">
                                      {readPartyMemberDisplayName(member)}
                                    </span>
                                    <span className="teacher-party-member-tooltip" role="tooltip">
                                      <strong>{readPartyMemberDisplayName(member)}</strong>
                                      <small>
                                        {String(member?.role || "").trim().toLowerCase() === "admin"
                                          ? "管理员"
                                          : String(member?.role || "").trim().toLowerCase() === "user"
                                            ? "学生"
                                            : "成员"}
                                        {member?.className ? ` · ${member.className}` : ""}
                                      </small>
                                      {member?.studentId ? <small>{member.studentId}</small> : null}
                                      {member?.username ? <small>{`@${member.username}`}</small> : null}
                                    </span>
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </article>
                      );
                    })
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
                    <p className="teacher-online-count-class">
                      <span>{item.className}</span>
                      <button
                        type="button"
                        className="teacher-online-rule-help"
                        aria-label={`${item.className}在线判定标准`}
                        title="查看在线判定标准"
                      >
                        <CircleHelp size={15} />
                        <span className="teacher-online-rule-tooltip">{item.ruleText}</span>
                      </button>
                    </p>
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

              <section className="teacher-card teacher-online-list-card">
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
          {renameLessonDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={onCloseRenameLessonDialog}
            >
              <div
                className="teacher-time-card"
                role="dialog"
                aria-modal="true"
                aria-label="课时重命名"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>重命名课时</h3>
                <form className="teacher-time-form" onSubmit={onSubmitRenameLessonDialog}>
                  <label>
                    <span>课时名称</span>
                    <input
                      type="text"
                      value={renameLessonDialog.value}
                      onChange={(event) =>
                        setRenameLessonDialog((current) => ({
                          ...current,
                          value: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="例如：第一节课"
                      maxLength={80}
                    />
                  </label>
                  {renameLessonDialog.error ? (
                    <span className="teacher-confirm-error">{renameLessonDialog.error}</span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={onCloseRenameLessonDialog}
                    >
                      取消
                    </button>
                    <button type="submit" className="teacher-primary-btn">
                      保存名称
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

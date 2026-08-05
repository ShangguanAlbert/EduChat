import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUpDown,
  Activity,
  Bot,
  CalendarDays,
  CircleHelp,
  ChevronDown,
  ChevronUp,
  BookCheck,
  ClipboardList,
  Copy,
  Crown,
  Download,
  Dices,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  ImageOff,
  LayoutGrid,
  List,
  Link2,
  Lock,
  LockOpen,
  LogOut,
  MessageCircleMore,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
  Image,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalSelect from "../components/PortalSelect.jsx";
import {
  CLASSROOM_FILE_KIND_TASK,
  getClassroomFileDownloadErrorText,
  getClassroomFileFallbackName,
} from "../../shared/classroomFileLabels.js";
import {
  CLASSROOM_HOMEWORK_REQUIREMENT_MAX_LENGTH,
  normalizeClassroomHomeworkRequirementText,
  resolveClassroomHomeworkRequirementText,
} from "../../shared/classroomHomework.js";
import { normalizeFinalTestContentConfig } from "../../shared/finalTestContent.js";
import {
  TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
  TEACHER_TASK_UPLOAD_MAX_FILES,
  appendTeacherTaskUploadDrafts,
  buildTeacherTaskUploadScopeKey,
  markTeacherTaskUploadDraftsFailed,
  markTeacherTaskUploadDraftsUploading,
  removeTeacherTaskUploadDraft,
} from "../features/classroom/teacherTaskUploadQueue.js";
import { GENDER_OPTIONS, GRADE_OPTIONS } from "./chat/constants.js";
import {
  DEFAULT_TEACHER_SCOPE_KEY,
  SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
  TEACHER_SCOPE_OPTIONS,
  YANG_JUNFENG_TEACHER_SCOPE_KEY,
  getTeacherScopeLabel,
} from "../../shared/teacherScopes.js";
import {
  backfillAdminGeneratedImageThumbnails,
  createAdminChatSession,
  createAdminGroupChatRoom,
  createAdminUserDirectoryClassCategory,
  createAdminUserDirectoryUser,
  deleteAllUserChats,
  deleteAdminUserDirectoryUser,
  downloadAdminGeneratedImage,
  downloadAdminClassroomHomeworkFile,
  exportAdminAllRecordsZip,
  exportAdminChatsTxt,
  exportAdminChatsZip,
  exportAdminClassroomHomeworkLessonZip,
  exportAdminGeneratedImagesTxt,
  exportAdminGroupChatsZip,
  exportAdminFinalTestZip,
  exportAdminUsersTxt,
  dissolveAdminGroupChatRoom,
  deleteAdminClassroomTaskFile,
  downloadAdminClassroomLessonFile,
  fetchAdminGeneratedImageGroups,
  fetchAdminGroupChatRooms,
  fetchAdminClassroomHomeworkOverview,
  fetchAdminClassroomPlans,
  fetchAdminFinalTestSubmissions,
  reopenAdminFinalTestSession,
  fetchAdminMe,
  fetchAdminOnlinePresence,
  fetchAdminUserDirectory,
  mergeAdminUserDirectoryUsers,
  saveAdminClassroomPlans,
  saveAdminFinalTestConfig,
  saveAdminClassroomSeatLayouts,
  updateAdminUserDirectoryUser,
  uploadAdminClassroomTaskFiles,
  updateAdminCollaborationClassroomMonitoring,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import {
  clearUserAuthSession,
  resolveActiveAuthSlot,
  setStoredAuthUser,
  setUserToken,
  withAuthSlot,
} from "../app/authStorage.js";
import { withAppBasePath } from "../app/basePath.js";
import { appendReturnUrlParam, buildAbsoluteAppUrl } from "../app/returnNavigation.js";
import "../styles/teacher-home.css";

const TARGET_CLASS_NAMES = Object.freeze(["教技231", "810班", "811班"]);
const COURSE_TARGET_CLASS_OPTIONS = Object.freeze([
  { value: "810班", label: "810班" },
  { value: "811班", label: "811班" },
]);
const COURSE_TARGET_CLASS_VALUES = Object.freeze(
  COURSE_TARGET_CLASS_OPTIONS.map((item) => item.value),
);
const COURSE_DEFAULT_CLASS_NAME = COURSE_TARGET_CLASS_OPTIONS[0].value;
const FINAL_TEST_EXPORT_CLASS_OPTIONS = Object.freeze([
  { value: "all", label: "全部班级" },
  { value: "810班", label: "810班" },
  { value: "811班", label: "811班" },
]);
const TEACHER_HOME_PANEL_KEYS = Object.freeze(
  new Set([
    "classroom",
    "discipline",
    "homework",
    "seat-fixed",
    "random-rollcall",
    "final-test",
    "user-manage",
    "export-center",
    "image-library",
    "group-chat-manage",
    "party-manage",
    "online",
  ]),
);
const CLASSROOM_MANAGE_PANEL_KEYS = Object.freeze(
  new Set([
    "classroom",
    "discipline",
    "homework",
    "seat-fixed",
    "random-rollcall",
    "final-test",
  ]),
);
const CLASSROOM_MANAGE_HIDDEN_ADMIN_USERNAME_KEYS = Object.freeze(
  new Set(
    ["杨占山", "钟怡萱", "杨俊锋", "施高俊"].map((name) =>
      name.replace(/\s+/g, "").toLowerCase(),
    ),
  ),
);
const TERMINAL_ADMIN_USERNAME_KEY = "上官福泽"
  .replace(/\s+/g, "")
  .toLowerCase();
const SHI_GAOJUN_ADMIN_USERNAME_KEY = "施高俊"
  .replace(/\s+/g, "")
  .toLowerCase();
const USER_DIRECTORY_DEFAULT_TARGET_CLASSES = Object.freeze([
  ...TARGET_CLASS_NAMES,
]);
const TEACHER_SEAT_LAYOUT_STORAGE_KEY = "teacher-seat-layouts-v1";
const SEAT_LAYOUT_MIN_ROWS = 3;
const SEAT_LAYOUT_MAX_ROWS = 10;
const SEAT_LAYOUT_MIN_COLUMNS = 3;
const SEAT_LAYOUT_MAX_COLUMNS = 10;
const SEAT_LAYOUT_DEFAULT_ROWS = 6;
const SEAT_LAYOUT_DEFAULT_COLUMNS = 8;
const SEAT_LAYOUT_DEFAULT_STUDENT_FILL_ENABLED = true;
const SEAT_LAYOUT_DEFAULT_TEACHER_LOCKED = false;
const RANDOM_ROLLCALL_COUNT_OPTIONS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => ({
    value: String(index + 1),
    label: `抽 ${index + 1} 人`,
  })),
);
const DISCIPLINE_DEFAULT_BEHAVIOR_OPTIONS = Object.freeze([
  { id: "gaming", label: "玩游戏" },
  { id: "live-stream", label: "看直播" },
  { id: "social-media", label: "刷社交平台" },
]);
const DISCIPLINE_MAX_CUSTOM_BEHAVIORS = 16;
const USER_CREATE_BINDABLE_TEACHER_SCOPE_OPTIONS = (() => {
  const options = TEACHER_SCOPE_OPTIONS.filter(
    (item) => String(item?.key || "").trim() !== DEFAULT_TEACHER_SCOPE_KEY,
  );
  return Object.freeze(
    options.length > 0 ? options : [...TEACHER_SCOPE_OPTIONS],
  );
})();
const USER_CREATE_DEFAULT_TEACHER_SCOPE_KEY =
  String(
    USER_CREATE_BINDABLE_TEACHER_SCOPE_OPTIONS[0]?.key ||
      DEFAULT_TEACHER_SCOPE_KEY,
  ).trim() || DEFAULT_TEACHER_SCOPE_KEY;
const PARTY_ROOM_CREATE_MAX_MEMBERS = 10;
const PARTY_TASK_STAGE_LABELS = Object.freeze({
  understand: "理解任务",
  plan: "设计方案",
  build: "编写网页",
  debug: "调试改进",
  reflect: "总结反思",
});
const TEACHER_HOME_REFRESH_SUCCESS_MS = 2000;
const TASK_FILE_UPLOAD_STATUS_TEXT = "文件正在上传，请稍后。";
const TASK_FILE_DOWNLOAD_STATUS_TEXT = "文件正在下载，请稍后。";
const USER_CREATE_CLASS_TEACHER_SCOPE_RULES = Object.freeze([
  {
    classToken: "教技231".replace(/\s+/g, "").replace(/班/g, ""),
    teacherScopeKey: YANG_JUNFENG_TEACHER_SCOPE_KEY,
  },
  {
    classToken: "810班".replace(/\s+/g, "").replace(/班/g, ""),
    teacherScopeKey: SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
  },
  {
    classToken: "811班".replace(/\s+/g, "").replace(/班/g, ""),
    teacherScopeKey: SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
  },
]);

function toAdminUsernameKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function toClassNameKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function normalizeClassNameForTeacherBinding(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/班/g, "");
}

function resolveForcedTeacherScopeKeyByClassName(className) {
  const normalized = normalizeClassNameForTeacherBinding(className);
  if (!normalized) return "";
  const matchedRule = USER_CREATE_CLASS_TEACHER_SCOPE_RULES.find(
    (rule) => rule.classToken && normalized.includes(rule.classToken),
  );
  return String(matchedRule?.teacherScopeKey || "").trim();
}

function resolveTeacherScopeLabelByKey(scopeKey) {
  const key = String(scopeKey || "").trim();
  if (!key) return "";
  const matched = TEACHER_SCOPE_OPTIONS.find(
    (item) => String(item?.key || "").trim() === key,
  );
  return String(matched?.label || "").trim();
}

function resolveUserClassBucket(className, targetClassNameKeys) {
  const classKey = toClassNameKey(className);
  if (!classKey) return "unassigned";
  return targetClassNameKeys.has(classKey) ? "target" : "other";
}

function resolveUserClassFilterValue(className, targetClassKeyToName) {
  const classKey = toClassNameKey(className);
  if (!classKey) return "unassigned";
  return targetClassKeyToName[classKey] || "other";
}

function readUserRoleLabel(role) {
  return String(role || "")
    .trim()
    .toLowerCase() === "admin"
    ? "管理员"
    : "学生";
}

function readFinalTestStatusLabel(status) {
  const safeStatus = String(status || "").trim();
  if (safeStatus === "submitted") return "已提交";
  if (safeStatus === "stage1_draft") return "独立思考中";
  if (safeStatus === "stage2_active") return "AI协作中";
  if (safeStatus === "stage3_active") return "独立定稿中";
  if (safeStatus === "time_expired_locked") return "已到时未提交";
  if (safeStatus === "disabled") return "未开放";
  return "未开始";
}

function clampInteger(value, min, max, fallback = min) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readSeatToggle(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function createSeatLayout(
  rawRows,
  rawColumns,
  rawSeats,
  rawStudentFillEnabled,
  rawTeacherLocked,
) {
  const rows = clampInteger(
    rawRows,
    SEAT_LAYOUT_MIN_ROWS,
    SEAT_LAYOUT_MAX_ROWS,
    SEAT_LAYOUT_DEFAULT_ROWS,
  );
  const columns = clampInteger(
    rawColumns,
    SEAT_LAYOUT_MIN_COLUMNS,
    SEAT_LAYOUT_MAX_COLUMNS,
    SEAT_LAYOUT_DEFAULT_COLUMNS,
  );
  const seatCount = rows * columns;
  const sourceSeats = Array.isArray(rawSeats) ? rawSeats : [];
  const seats = Array.from({ length: seatCount }, (_, index) =>
    String(sourceSeats[index] || ""),
  );
  return {
    rows,
    columns,
    seats,
    studentFillEnabled: readSeatToggle(
      rawStudentFillEnabled,
      SEAT_LAYOUT_DEFAULT_STUDENT_FILL_ENABLED,
    ),
    teacherLocked: readSeatToggle(
      rawTeacherLocked,
      SEAT_LAYOUT_DEFAULT_TEACHER_LOCKED,
    ),
  };
}

function normalizeSeatLayout(layout) {
  const normalized = createSeatLayout(
    layout?.rows,
    layout?.columns,
    layout?.seats,
    layout?.studentFillEnabled,
    layout?.teacherLocked,
  );
  return {
    ...normalized,
    updatedAt: String(layout?.updatedAt || ""),
  };
}

function reshapeSeatLayout(layout, nextRows, nextColumns) {
  const current = normalizeSeatLayout(layout);
  const rows = clampInteger(
    nextRows,
    SEAT_LAYOUT_MIN_ROWS,
    SEAT_LAYOUT_MAX_ROWS,
    current.rows,
  );
  const columns = clampInteger(
    nextColumns,
    SEAT_LAYOUT_MIN_COLUMNS,
    SEAT_LAYOUT_MAX_COLUMNS,
    current.columns,
  );
  const nextSeats = Array.from({ length: rows * columns }, () => "");
  const copyRows = Math.min(rows, current.rows);
  const copyColumns = Math.min(columns, current.columns);
  for (let rowIndex = 0; rowIndex < copyRows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < copyColumns; columnIndex += 1) {
      const oldIndex = rowIndex * current.columns + columnIndex;
      const nextIndex = rowIndex * columns + columnIndex;
      nextSeats[nextIndex] = String(current.seats[oldIndex] || "");
    }
  }
  return {
    rows,
    columns,
    seats: nextSeats,
    studentFillEnabled: readSeatToggle(
      current.studentFillEnabled,
      SEAT_LAYOUT_DEFAULT_STUDENT_FILL_ENABLED,
    ),
    teacherLocked: readSeatToggle(
      current.teacherLocked,
      SEAT_LAYOUT_DEFAULT_TEACHER_LOCKED,
    ),
    updatedAt: String(layout?.updatedAt || ""),
  };
}

function readSeatLayoutsFromStorage() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TEACHER_SEAT_LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.entries(parsed).reduce((result, entry) => {
      const className = String(entry?.[0] || "").trim();
      if (!className) return result;
      result[className] = normalizeSeatLayout(entry?.[1]);
      return result;
    }, {});
  } catch {
    return {};
  }
}

function normalizeSeatLayoutsByClass(input) {
  if (!input || typeof input !== "object") return {};
  return Object.entries(input).reduce((result, entry) => {
    const className = String(entry?.[0] || "").trim();
    if (!className) return result;
    result[className] = normalizeSeatLayout(entry?.[1]);
    return result;
  }, {});
}

function normalizeDisciplineBehaviorId(value, fallback = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeDisciplineBehavior(input, index = 0) {
  const source = input && typeof input === "object" ? input : {};
  const label = String(
    source.label || source.name || source.title || "",
  ).trim();
  if (!label) return null;
  return {
    id: normalizeDisciplineBehaviorId(
      source.id || source.key,
      `discipline-behavior-${index + 1}`,
    ),
    label,
    createdAt: String(source.createdAt || ""),
  };
}

function normalizeDisciplineStudentRecord(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawCounts =
    source.countsByBehavior && typeof source.countsByBehavior === "object"
      ? source.countsByBehavior
      : source.behaviors && typeof source.behaviors === "object"
        ? source.behaviors
        : {};
  const countsByBehavior = Object.entries(rawCounts).reduce(
    (result, [behaviorId, rawCount]) => {
      const safeBehaviorId = normalizeDisciplineBehaviorId(behaviorId);
      const count = Math.max(
        0,
        Number.parseInt(String(rawCount || "").trim(), 10) || 0,
      );
      if (!safeBehaviorId || count <= 0) return result;
      result[safeBehaviorId] = count;
      return result;
    },
    {},
  );
  return {
    countsByBehavior,
    updatedAt: String(source.updatedAt || ""),
  };
}

function normalizeDisciplineConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const customBehaviors = Array.isArray(source.customBehaviors)
    ? source.customBehaviors
        .map((item, index) => normalizeDisciplineBehavior(item, index))
        .filter(Boolean)
    : [];
  const recordsByLesson =
    source.recordsByLesson && typeof source.recordsByLesson === "object"
      ? Object.entries(source.recordsByLesson).reduce(
          (result, [lessonId, rawLessonRecords]) => {
            const safeLessonId = String(lessonId || "").trim();
            if (
              !safeLessonId ||
              !rawLessonRecords ||
              typeof rawLessonRecords !== "object"
            ) {
              return result;
            }
            const normalizedLessonRecords = Object.entries(
              rawLessonRecords,
            ).reduce((lessonResult, [studentUserId, rawStudentRecord]) => {
              const safeStudentUserId = String(studentUserId || "").trim();
              if (!safeStudentUserId) return lessonResult;
              const normalizedStudentRecord =
                normalizeDisciplineStudentRecord(rawStudentRecord);
              if (
                Object.keys(normalizedStudentRecord.countsByBehavior).length ===
                0
              ) {
                return lessonResult;
              }
              lessonResult[safeStudentUserId] = normalizedStudentRecord;
              return lessonResult;
            }, {});
            if (Object.keys(normalizedLessonRecords).length === 0)
              return result;
            result[safeLessonId] = normalizedLessonRecords;
            return result;
          },
          {},
        )
      : {};
  return {
    customBehaviors,
    recordsByLesson,
  };
}

function getDisciplineRecordTotalCount(record) {
  const countsByBehavior =
    record?.countsByBehavior && typeof record.countsByBehavior === "object"
      ? record.countsByBehavior
      : {};
  return Object.values(countsByBehavior).reduce(
    (total, count) =>
      total + (Number.parseInt(String(count || "").trim(), 10) || 0),
    0,
  );
}

function compareDirectoryStudentItems(a, b) {
  const aStudentId = String(a?.profile?.studentId || "").trim();
  const bStudentId = String(b?.profile?.studentId || "").trim();
  if (aStudentId && bStudentId) {
    const studentIdCompare = aStudentId.localeCompare(bStudentId, "zh-CN", {
      numeric: true,
      sensitivity: "base",
    });
    if (studentIdCompare !== 0) return studentIdCompare;
  } else if (aStudentId || bStudentId) {
    return aStudentId ? -1 : 1;
  }
  const aName = String(a?.profile?.name || a?.username || "").trim();
  const bName = String(b?.profile?.name || b?.username || "").trim();
  const nameCompare = aName.localeCompare(bName, "zh-CN", {
    sensitivity: "base",
  });
  if (nameCompare !== 0) return nameCompare;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN", {
    sensitivity: "base",
  });
}

function buildCustomDisciplineBehavior(label, index = 0) {
  const safeLabel = String(label || "").trim();
  if (!safeLabel) return null;
  const timestamp = Date.now().toString(36);
  return {
    id: normalizeDisciplineBehaviorId(
      `custom-${timestamp}-${index + 1}-${safeLabel}`,
      `custom-discipline-${timestamp}-${index + 1}`,
    ),
    label: safeLabel,
    createdAt: new Date().toISOString(),
  };
}

function pickRandomItems(source, count) {
  const list = Array.isArray(source) ? [...source] : [];
  const limit = Math.min(Math.max(0, count), list.length);
  for (let index = list.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = list[index];
    list[index] = list[randomIndex];
    list[randomIndex] = temp;
  }
  return list.slice(0, limit);
}

function normalizeLessonClassName(value) {
  const className = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (COURSE_TARGET_CLASS_VALUES.includes(className)) return className;
  return COURSE_DEFAULT_CLASS_NAME;
}

function readErrorMessage(error) {
  if (!error) return "请求失败，请稍后重试。";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim())
    return error.message.trim();
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
  const safeSeconds = Number.isFinite(Number(seconds))
    ? Math.max(0, Number(seconds))
    : 0;
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

function readTodayDateInputValue() {
  const date = new Date();
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
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

function normalizeLessonPlans(plans) {
  const source = Array.isArray(plans) ? plans : [];
  return source.map((lesson) => ({
    ...(lesson && typeof lesson === "object" ? lesson : {}),
    className: normalizeLessonClassName(lesson?.className),
    homeworkRequirementText: normalizeClassroomHomeworkRequirementText(
      lesson?.homeworkRequirementText,
    ),
    homeworkUploadEnabled: lesson?.homeworkUploadEnabled !== false,
    lateSubmissionEnabled: lesson?.lateSubmissionEnabled === true,
  }));
}

function buildClassroomConfigSnapshot({
  productTaskEnabled = false,
  teacherCoursePlans = [],
  classroomDisciplineConfig = null,
} = {}) {
  return JSON.stringify({
    productTaskEnabled: !!productTaskEnabled,
    teacherCoursePlans: normalizeLessonPlans(
      Array.isArray(teacherCoursePlans) ? teacherCoursePlans : [],
    ),
    classroomDisciplineConfig: normalizeDisciplineConfig(
      classroomDisciplineConfig,
    ),
  });
}

function buildFinalTestConfigSnapshot(finalTestConfig) {
  return JSON.stringify(normalizeFinalTestContentConfig(finalTestConfig));
}

function createTeacherFinalTestTaskDraft(index = 0) {
  return {
    id: `task-${Date.now().toString(36)}-${index + 1}`,
    title: `任务 ${index + 1}`,
    description: "",
    mode: "platform",
  };
}

function resolveTeacherFeatureTransitionLabel(pathname) {
  const safePath = String(pathname || "")
    .trim()
    .toLowerCase();
  if (safePath === "/chat") return "正在进入元协坊...";
  if (safePath === "/image-generation") return "正在进入图片生成...";
  if (safePath === "/party") return "正在进入派·协作...";
  if (safePath === "/admin/agent-settings") return "正在进入智能体管理...";
  return "正在切换页面...";
}

function resolveTeacherHomePanelFromSearch(search = "") {
  try {
    const params = new URLSearchParams(String(search || ""));
    const panel = String(params.get("teacherPanel") || "")
      .trim()
      .toLowerCase();
    return TEACHER_HOME_PANEL_KEYS.has(panel) ? panel : "";
  } catch {
    return "";
  }
}

function resolveTeacherHomeExportContextFromSearch(search = "") {
  try {
    const params = new URLSearchParams(String(search || ""));
    const teacherScopeKey = String(
      params.get("exportTeacherScopeKey") || "",
    ).trim();
    const exportDate = String(params.get("exportDate") || "").trim();
    const finalTestClassName = String(
      params.get("exportFinalTestClassName") || "",
    ).trim();
    const normalizedTeacherScopeKey = TEACHER_SCOPE_OPTIONS.some(
      (item) => String(item?.key || "").trim() === teacherScopeKey,
    )
      ? teacherScopeKey
      : "";
    const normalizedFinalTestClassName = FINAL_TEST_EXPORT_CLASS_OPTIONS.some(
      (item) => String(item?.value || "").trim() === finalTestClassName,
    )
      ? finalTestClassName
      : "all";
    return {
      teacherScopeKey: normalizedTeacherScopeKey,
      exportDate: isValidDateInputValue(exportDate) ? exportDate : "",
      finalTestClassName: normalizedFinalTestClassName,
    };
  } catch {
    return {
      teacherScopeKey: "",
      exportDate: "",
      finalTestClassName: "all",
    };
  }
}

const TeacherSeatFixedPanel = memo(function TeacherSeatFixedPanel({
  seatManageClassName,
  classroomSeatClassOptions,
  currentSeatLayout,
  currentSeatFilledCount,
  currentSeatTeacherLocked,
  currentSeatStudentFillEnabled,
  currentSeatStudentWritable,
  userDirectoryItems,
  onUpdateSeatManageClassName,
  onResizeSeatLayout,
  onToggleSeatTeacherLock,
  onToggleSeatStudentFillEnabled,
  onUpdateSeatValue,
}) {
  const [hydrated, setHydrated] = useState(() => typeof window === "undefined");

  useEffect(() => {
    if (hydrated || typeof window === "undefined") return undefined;
    const frameId = window.requestAnimationFrame(() => {
      setHydrated(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [hydrated]);

  const seatNormalizedValues = useMemo(
    () =>
      currentSeatLayout.seats.map((seatValue) =>
        String(seatValue || "").trim(),
      ),
    [currentSeatLayout.seats],
  );

  const seatSuggestionItems = useMemo(() => {
    if (!hydrated) return [];
    const dedupe = new Set();
    return userDirectoryItems
      .filter(
        (item) =>
          String(item?.role || "")
            .trim()
            .toLowerCase() === "user",
      )
      .filter((item) => {
        if (!seatManageClassName) return true;
        return (
          String(item?.profile?.className || "").trim() === seatManageClassName
        );
      })
      .map((item) => {
        const name = String(item?.profile?.name || "").trim();
        const username = String(item?.username || "").trim();
        const studentId = String(item?.profile?.studentId || "").trim();
        const value = name || username;
        const valueKey = String(value || "")
          .trim()
          .toLowerCase();
        const studentIdKey = String(studentId || "")
          .trim()
          .toLowerCase();
        return {
          value,
          label: `${name || username || "未命名学生"}${studentId ? `（${studentId}）` : ""}`,
          valueKey,
          studentIdKey,
        };
      })
      .filter((item) => String(item.value || "").trim())
      .filter((item) => {
        if (!item.valueKey || dedupe.has(item.valueKey)) return false;
        dedupe.add(item.valueKey);
        return true;
      });
  }, [hydrated, seatManageClassName, userDirectoryItems]);

  const seatSuggestionOptionsByIndex = useMemo(() => {
    if (!hydrated) return [];
    const occupied = new Set(
      seatNormalizedValues
        .map((item) =>
          String(item || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    return seatNormalizedValues.map((currentValue) => {
      const currentValueKey = String(currentValue || "")
        .trim()
        .toLowerCase();
      if (currentValueKey) {
        occupied.delete(currentValueKey);
      }
      const options = seatSuggestionItems
        .filter(
          (item) =>
            !occupied.has(item.valueKey) &&
            (!item.studentIdKey || !occupied.has(item.studentIdKey)),
        )
        .map((item) => ({
          value: item.value,
          label: item.label,
        }));
      if (currentValueKey) {
        occupied.add(currentValueKey);
      }
      return options;
    });
  }, [hydrated, seatNormalizedValues, seatSuggestionItems]);

  if (!hydrated) {
    return (
      <section className="teacher-card teacher-seat-fixed-card">
        <p className="teacher-empty-text">正在载入座位表…</p>
      </section>
    );
  }

  return (
    <section className="teacher-card teacher-seat-fixed-card">
      <div className="teacher-seat-fixed-toolbar">
        <div className="teacher-seat-fixed-control">
          <span>班级</span>
          <PortalSelect
            className="teacher-seat-fixed-select"
            value={seatManageClassName}
            compact
            ariaLabel="座位班级"
            options={classroomSeatClassOptions}
            onChange={onUpdateSeatManageClassName}
          />
        </div>
        <div className="teacher-seat-fixed-control">
          <span>行数</span>
          <PortalSelect
            className="teacher-seat-fixed-select"
            value={String(currentSeatLayout.rows)}
            compact
            ariaLabel="座位行数"
            disabled={currentSeatTeacherLocked}
            options={Array.from(
              { length: SEAT_LAYOUT_MAX_ROWS - SEAT_LAYOUT_MIN_ROWS + 1 },
              (_, index) => {
                const rows = SEAT_LAYOUT_MIN_ROWS + index;
                return { value: String(rows), label: `${rows} 行` };
              },
            )}
            onChange={(value) => onResizeSeatLayout(value, "rows")}
          />
        </div>
        <div className="teacher-seat-fixed-control">
          <span>列数</span>
          <PortalSelect
            className="teacher-seat-fixed-select"
            value={String(currentSeatLayout.columns)}
            compact
            ariaLabel="座位列数"
            disabled={currentSeatTeacherLocked}
            options={Array.from(
              { length: SEAT_LAYOUT_MAX_COLUMNS - SEAT_LAYOUT_MIN_COLUMNS + 1 },
              (_, index) => {
                const columns = SEAT_LAYOUT_MIN_COLUMNS + index;
                return { value: String(columns), label: `${columns} 列` };
              },
            )}
            onChange={(value) => onResizeSeatLayout(value, "columns")}
          />
        </div>
        <div className="teacher-seat-fixed-stats">
          <strong>{`${currentSeatFilledCount} / ${currentSeatLayout.seats.length}`}</strong>
          <span>已填写座位</span>
        </div>
        <div className="teacher-seat-fixed-permission-tools">
          <button
            type="button"
            className={`teacher-ghost-btn teacher-seat-fixed-lock-btn${
              currentSeatTeacherLocked ? " is-locked" : ""
            }`}
            onClick={onToggleSeatTeacherLock}
          >
            {currentSeatTeacherLocked ? (
              <Lock size={14} />
            ) : (
              <LockOpen size={14} />
            )}
            <span>{currentSeatTeacherLocked ? "已锁定" : "锁定"}</span>
          </button>
          <label className="teacher-ios-switch teacher-seat-fixed-student-switch">
            <input
              type="checkbox"
              checked={currentSeatStudentFillEnabled}
              onChange={(event) =>
                onToggleSeatStudentFillEnabled(event.target.checked)
              }
              disabled={currentSeatTeacherLocked}
            />
            <span className="teacher-ios-switch-track" aria-hidden="true">
              <span className="teacher-ios-switch-thumb" />
            </span>
            <span className="teacher-ios-switch-text">开放学生填写</span>
          </label>
        </div>
      </div>

      <div className="teacher-seat-fixed-hints">
        <span>{`学生填写：${currentSeatStudentFillEnabled ? "已开放" : "已关闭"}`}</span>
        <span>{`教师锁定：${currentSeatTeacherLocked ? "已锁定" : "未锁定"}`}</span>
        <span>{`当前状态：${currentSeatStudentWritable ? "学生可填写" : "学生不可填写"}`}</span>
      </div>

      <div
        className="teacher-seat-fixed-grid"
        style={{
          gridTemplateColumns: `repeat(${currentSeatLayout.columns}, minmax(0, 1fr))`,
        }}
      >
        {currentSeatLayout.seats.map((seatValue, seatIndex) => {
          const safeSeatValue = String(seatValue || "").trim();
          const seatOptions = Array.isArray(
            seatSuggestionOptionsByIndex[seatIndex],
          )
            ? seatSuggestionOptionsByIndex[seatIndex]
            : [];
          const hasCurrentValueOption = seatOptions.some(
            (item) => String(item?.value || "").trim() === safeSeatValue,
          );
          const rowNumber =
            Math.floor(seatIndex / currentSeatLayout.columns) + 1;
          const columnNumber = (seatIndex % currentSeatLayout.columns) + 1;
          return (
            <label
              key={`${seatManageClassName || "class"}-seat-${seatIndex + 1}`}
              className="teacher-seat-fixed-item"
            >
              <span>{`座位 ${rowNumber}-${columnNumber}`}</span>
              <select
                value={safeSeatValue}
                onChange={(event) =>
                  onUpdateSeatValue(seatIndex, event.target.value)
                }
                disabled={currentSeatTeacherLocked}
              >
                <option value="">
                  {seatOptions.length > 0 ? "请选择姓名/学号" : "暂无可选学生"}
                </option>
                {safeSeatValue && !hasCurrentValueOption ? (
                  <option value={safeSeatValue}>{safeSeatValue}</option>
                ) : null}
                {seatOptions.map((item) => (
                  <option
                    key={`seat-${seatIndex + 1}-option-${String(item?.value || "").trim()}`}
                    value={item.value}
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
});

function buildLessonDraft(lessonIndex = 1) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    id: `course-${now}-${Math.round(Math.random() * 1000)}`,
    courseName: `第${lessonIndex}节课`,
    className: COURSE_DEFAULT_CLASS_NAME,
    courseStartAt: "",
    courseEndAt: "",
    courseTime: "",
    notes: "",
    homeworkRequirementText: "",
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

function triggerTextDownload(fileName, content) {
  const blob = new Blob([String(content || "")], {
    type: "text/plain;charset=utf-8",
  });
  triggerBrowserDownload(blob, fileName || "export.txt");
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
  const requestedTeacherPanel = useMemo(
    () => resolveTeacherHomePanelFromSearch(location.search),
    [location.search],
  );
  const requestedExportCenterContext = useMemo(
    () => resolveTeacherHomeExportContextFromSearch(location.search),
    [location.search],
  );
  const taskFileInputRef = useRef(null);
  const lessonListScrollRef = useRef(null);
  const deleteConfirmInputRef = useRef(null);
  const disciplineStudentSearchInputRef = useRef(null);
  const classroomConfigSavedSnapshotRef = useRef("");
  const finalTestConfigSavedSnapshotRef = useRef("");

  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const uploadAbortControllerRef = useRef(null);
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const [deletingFileId, setDeletingFileId] = useState("");
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState(
    () => requestedTeacherPanel || "classroom",
  );
  const [lessonListVisible, setLessonListVisible] = useState(true);
  const [homeworkReqOpen, setHomeworkReqOpen] = useState(false);
  const [lessonSearchQuery, setLessonSearchQuery] = useState("");
  const [lessonClassFilter, setLessonClassFilter] = useState("");
  const [disciplineSearchQuery, setDisciplineSearchQuery] = useState("");
  const [homeworkSearchQuery, setHomeworkSearchQuery] = useState("");
  const [pageRefreshState, setPageRefreshState] = useState("idle");
  const [featureTransition, setFeatureTransition] = useState({
    active: false,
    label: "",
  });

  const [adminProfile, setAdminProfile] = useState({
    id: "",
    username: "",
    role: "",
    createdAt: "",
    updatedAt: "",
  });
  const [classroomUpdatedAt, setClassroomUpdatedAt] = useState("");
  const [productTaskEnabled, setProductTaskEnabled] = useState(false);
  const [teacherCoursePlans, setTeacherCoursePlans] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskUploadDraftsByScope, setTaskUploadDraftsByScope] = useState({});
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
  const [homeworkOverviewUpdatedAt, setHomeworkOverviewUpdatedAt] =
    useState("");
  const [homeworkLessons, setHomeworkLessons] = useState([]);
  const [selectedHomeworkLessonId, setSelectedHomeworkLessonId] = useState("");
  const [expandedHomeworkStudentIds, setExpandedHomeworkStudentIds] = useState(
    [],
  );
  const [homeworkViewMode, setHomeworkViewMode] = useState("card");
  const [downloadingHomeworkFileId, setDownloadingHomeworkFileId] =
    useState("");
  const [exportingHomeworkLessonId, setExportingHomeworkLessonId] =
    useState("");
  const [imageLibraryLoading, setImageLibraryLoading] = useState(false);
  const [imageLibraryBackfillLoading, setImageLibraryBackfillLoading] =
    useState(false);
  const [imageLibraryUpdatedAt, setImageLibraryUpdatedAt] = useState("");
  const [imageLibraryKeyword, setImageLibraryKeyword] = useState("");
  const [imageLibrarySearchInput, setImageLibrarySearchInput] = useState("");
  const [imageLibraryGroups, setImageLibraryGroups] = useState([]);
  const [imageLibraryClassFilter, setImageLibraryClassFilter] = useState("all");
  const [imageLibrarySortBy, setImageLibrarySortBy] = useState("latest");
  const [imageLibraryNotice, setImageLibraryNotice] = useState("");
  const [expandedImageUserIds, setExpandedImageUserIds] = useState([]);
  const [downloadingImageId, setDownloadingImageId] = useState("");
  const [userDirectoryLoading, setUserDirectoryLoading] = useState(false);
  const [userDirectoryUpdatedAt, setUserDirectoryUpdatedAt] = useState("");
  const [userDirectoryItems, setUserDirectoryItems] = useState([]);
  const [userDirectoryKeyword, setUserDirectoryKeyword] = useState("");
  const [userDirectorySearchInput, setUserDirectorySearchInput] = useState("");
  const [userDirectoryRoleFilter, setUserDirectoryRoleFilter] = useState("all");
  const [userDirectoryClassFilter, setUserDirectoryClassFilter] =
    useState("all");
  const [userDirectorySortBy, setUserDirectorySortBy] = useState("updated");
  const [userDirectoryTargetClasses, setUserDirectoryTargetClasses] = useState(
    USER_DIRECTORY_DEFAULT_TARGET_CLASSES,
  );
  const [userDirectoryPendingEdits, setUserDirectoryPendingEdits] = useState(
    {},
  );
  const [userDirectoryPendingDeleteIds, setUserDirectoryPendingDeleteIds] =
    useState([]);
  const [userDirectorySavingChanges, setUserDirectorySavingChanges] =
    useState(false);
  const [userClassCategoryDialog, setUserClassCategoryDialog] = useState({
    open: false,
    className: "",
    error: "",
    saving: false,
  });
  const [userCreateDialog, setUserCreateDialog] = useState({
    open: false,
    username: "",
    password: "",
    name: "",
    studentId: "",
    className: "",
    grade: "",
    gender: "",
    bindTeacher: false,
    lockedTeacherScopeKey: USER_CREATE_DEFAULT_TEACHER_SCOPE_KEY,
    error: "",
    saving: false,
  });
  const [userEditDialog, setUserEditDialog] = useState({
    open: false,
    userId: "",
    username: "",
    name: "",
    studentId: "",
    gender: "",
    grade: "",
    className: "",
    confirmText: "",
    error: "",
    saving: false,
  });
  const [userDeleteDialog, setUserDeleteDialog] = useState({
    open: false,
    userId: "",
    username: "",
    confirmText: "",
    error: "",
    deleting: false,
  });
  const [userMergeDialog, setUserMergeDialog] = useState({
    open: false,
    sourceUserId: "",
    targetUserId: "",
    confirmText: "",
    error: "",
    merging: false,
  });
  const [partyRoomManageLoading, setPartyRoomManageLoading] = useState(false);
  const [partyRoomManageUpdatedAt, setPartyRoomManageUpdatedAt] = useState("");
  const [partyRoomItems, setPartyRoomItems] = useState([]);
  const [partyRoomManageUsers, setPartyRoomManageUsers] = useState([]);
  const [partyRoomOwnerFilter, setPartyRoomOwnerFilter] = useState("all");
  const [partyRoomMemberSearchInput, setPartyRoomMemberSearchInput] =
    useState("");
  const [partyRoomSortBy, setPartyRoomSortBy] = useState("admin-order");
  const [partyRoomCreateDialog, setPartyRoomCreateDialog] = useState({
    open: false,
    name: "",
    ownerUserId: "",
    memberUserIds: [],
    memberKeyword: "",
    error: "",
    saving: false,
  });
  const [copiedPartyRoomId, setCopiedPartyRoomId] = useState("");
  const [dissolvingPartyRoomId, setDissolvingPartyRoomId] = useState("");
  const [updatingMonitoringRoomId, setUpdatingMonitoringRoomId] = useState("");

  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineGeneratedAt, setOnlineGeneratedAt] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [onlineWindowSeconds, setOnlineWindowSeconds] = useState(300);
  const [onlineHeartbeatStaleSeconds, setOnlineHeartbeatStaleSeconds] =
    useState(70);
  const [onlineClassFilter, setOnlineClassFilter] = useState(
    () => TARGET_CLASS_NAMES[0] || "all",
  );
  const [exportCenterScopeKey, setExportCenterScopeKey] = useState(
    () =>
      requestedExportCenterContext.teacherScopeKey || DEFAULT_TEACHER_SCOPE_KEY,
  );
  const [exportCenterDate, setExportCenterDate] = useState(
    () => requestedExportCenterContext.exportDate || readTodayDateInputValue(),
  );
  const [exportCenterFinalTestClassName, setExportCenterFinalTestClassName] =
    useState(() => requestedExportCenterContext.finalTestClassName || "all");
  const [exportCenterLoading, setExportCenterLoading] = useState("");
  const [exportCenterError, setExportCenterError] = useState("");
  const [exportCenterNotice, setExportCenterNotice] = useState("");
  const [classroomSaveNotice, setClassroomSaveNotice] = useState("");
  const [finalTestView, setFinalTestView] = useState("editor");
  const [finalTestSaving, setFinalTestSaving] = useState(false);
  const [finalTestSubmissionLoading, setFinalTestSubmissionLoading] =
    useState(false);
  const [finalTestSubmissionUpdatedAt, setFinalTestSubmissionUpdatedAt] =
    useState("");
  const [finalTestSubmissionClasses, setFinalTestSubmissionClasses] = useState([]);
  const [finalTestSubmissionClassName, setFinalTestSubmissionClassName] =
    useState("all");
  const [finalTestSubmissionDisplayMode, setFinalTestSubmissionDisplayMode] =
    useState("submission");
  const [finalTestReopeningIds, setFinalTestReopeningIds] = useState(() => new Set());
  const [exportCenterDeleteDialogOpen, setExportCenterDeleteDialogOpen] =
    useState(false);
  const [seatLayoutsByClass, setSeatLayoutsByClass] = useState(() =>
    readSeatLayoutsFromStorage(),
  );
  const [seatLayoutsSyncReady, setSeatLayoutsSyncReady] = useState(false);
  const [classroomDisciplineConfig, setClassroomDisciplineConfig] = useState(
    () => normalizeDisciplineConfig(null),
  );
  const [finalTestConfig, setFinalTestConfig] = useState(() =>
    normalizeFinalTestContentConfig(null),
  );
  const [disciplineDraftBehavior, setDisciplineDraftBehavior] = useState("");
  const [disciplineStudentKeyword, setDisciplineStudentKeyword] = useState("");
  const [activeDisciplineStudentId, setActiveDisciplineStudentId] = useState("");
  const [selectedDisciplineStudentId, setSelectedDisciplineStudentId] =
    useState("");
  const [seatManageClassName, setSeatManageClassName] = useState("");
  const [randomRollcallClassName, setRandomRollcallClassName] = useState("all");
  const [randomRollcallSource, setRandomRollcallSource] = useState("seat");
  const [randomRollcallCount, setRandomRollcallCount] = useState("1");
  const [randomRollcallNoRepeat, setRandomRollcallNoRepeat] = useState(true);
  const [randomRollcallUsedByScope, setRandomRollcallUsedByScope] = useState(
    {},
  );
  const [randomRollcallError, setRandomRollcallError] = useState("");
  const [randomRollcallResult, setRandomRollcallResult] = useState([]);
  const [randomRollcallGeneratedAt, setRandomRollcallGeneratedAt] =
    useState("");
  const seatLayoutsSyncTimerRef = useRef(null);
  const seatLayoutsLastSavedSnapshotRef = useRef("");
  const exportCenterNoticeTimerRef = useRef(null);
  const classroomSaveNoticeTimerRef = useRef(null);
  const imageLibraryNoticeTimerRef = useRef(null);
  const clearDisciplineStudentKeyword = useCallback(() => {
    setDisciplineStudentKeyword("");
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        disciplineStudentSearchInputRef.current?.focus();
      });
    }
  }, []);

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
        Number(data?.onlineWindowSeconds) > 0
          ? Number(data.onlineWindowSeconds)
          : 300,
      );
      setOnlineHeartbeatStaleSeconds(
        Number(data?.heartbeatStaleSeconds) > 0
          ? Number(data.heartbeatStaleSeconds)
          : 70,
      );
      setOnlineGeneratedAt(
        String(data?.generatedAt || new Date().toISOString()),
      );
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
      const lessons = (Array.isArray(data?.lessons) ? data.lessons : []).map(
        (lesson) => ({
          ...(lesson && typeof lesson === "object" ? lesson : {}),
          className: normalizeLessonClassName(lesson?.className),
          homeworkRequirementText: normalizeClassroomHomeworkRequirementText(
            lesson?.homeworkRequirementText,
          ),
          homeworkUploadEnabled: lesson?.homeworkUploadEnabled !== false,
          lateSubmissionEnabled: lesson?.lateSubmissionEnabled === true,
        }),
      );
      setHomeworkLessons(lessons);
      setHomeworkOverviewUpdatedAt(new Date().toISOString());
      setSelectedHomeworkLessonId((current) => {
        const currentId = String(current || "").trim();
        if (
          currentId &&
          lessons.some(
            (lesson) => String(lesson?.id || "").trim() === currentId,
          )
        ) {
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
        const data = await fetchAdminGeneratedImageGroups(
          adminToken,
          safeKeyword,
        );
        setImageLibraryGroups(Array.isArray(data?.groups) ? data.groups : []);
        setImageLibraryKeyword(safeKeyword);
        setImageLibrarySearchInput(safeKeyword);
        setImageLibraryUpdatedAt(
          String(data?.updatedAt || new Date().toISOString()),
        );
      } catch (rawError) {
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
      } finally {
        setImageLibraryLoading(false);
      }
    },
    [adminToken, handleAuthError, imageLibraryKeyword],
  );

  const loadUserDirectory = useCallback(async () => {
    if (!adminToken) return;
    setUserDirectoryLoading(true);
    try {
      const data = await fetchAdminUserDirectory(adminToken);
      const targetClasses = Array.isArray(data?.targetClasses)
        ? data.targetClasses
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      setUserDirectoryItems(Array.isArray(data?.users) ? data.users : []);
      setUserDirectoryTargetClasses(
        targetClasses.length > 0
          ? targetClasses
          : USER_DIRECTORY_DEFAULT_TARGET_CLASSES,
      );
      setUserDirectoryUpdatedAt(
        String(data?.updatedAt || new Date().toISOString()),
      );
      setUserDirectoryPendingEdits({});
      setUserDirectoryPendingDeleteIds([]);
      setUserDirectorySavingChanges(false);
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setUserDirectoryLoading(false);
    }
  }, [adminToken, handleAuthError]);

  const loadFinalTestSubmissions = useCallback(async () => {
    if (!adminToken) return;
    setFinalTestSubmissionLoading(true);
    try {
      const data = await fetchAdminFinalTestSubmissions(adminToken);
      setFinalTestSubmissionClasses(
        Array.isArray(data?.classes) ? data.classes : [],
      );
      setFinalTestSubmissionUpdatedAt(
        String(data?.updatedAt || new Date().toISOString()),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setFinalTestSubmissionLoading(false);
    }
  }, [adminToken, handleAuthError]);

  const handleReopenFinalTest = useCallback(async (studentUserId, className) => {
    if (!adminToken || !studentUserId) return;
    const key = `${className}:${studentUserId}`;
    setFinalTestReopeningIds((prev) => new Set([...prev, key]));
    try {
      await reopenAdminFinalTestSession(adminToken, { studentUserId, className });
      await loadFinalTestSubmissions();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setFinalTestReopeningIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [adminToken, handleAuthError, loadFinalTestSubmissions]);

  const loadPartyRoomManage = useCallback(async ({ silent = false } = {}) => {
    if (!adminToken) return;
    if (!silent) setPartyRoomManageLoading(true);
    try {
      const data = await fetchAdminGroupChatRooms(adminToken);
      setPartyRoomItems(Array.isArray(data?.rooms) ? data.rooms : []);
      setPartyRoomManageUsers(Array.isArray(data?.users) ? data.users : []);
      setPartyRoomManageUpdatedAt(
        String(data?.updatedAt || new Date().toISOString()),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      if (!silent) setPartyRoomManageLoading(false);
    }
  }, [adminToken, handleAuthError]);

  const loadPageData = useCallback(
    async ({ background = false } = {}) => {
      if (!adminToken) {
        setSeatLayoutsSyncReady(false);
        navigate(withAuthSlot("/login", activeSlot), { replace: true });
        return;
      }
      setSeatLayoutsSyncReady(false);
      if (background) {
        setPageRefreshState("refreshing");
      } else {
        setLoading(true);
      }
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
        const legacyProductEnabled =
          !!plansData?.shangguanClassTaskProductImprovementEnabled;
        setProductTaskEnabled(legacyProductEnabled);
        const plans = Array.isArray(plansData?.teacherCoursePlans)
          ? plansData.teacherCoursePlans
          : [];
        const normalizedPlans = normalizeLessonPlans(plans);
        const normalizedDisciplineConfig = normalizeDisciplineConfig(
          plansData?.classroomDisciplineConfig,
        );
        const normalizedFinalTestConfig = normalizeFinalTestContentConfig(
          plansData?.finalTestConfig,
        );
        setTeacherCoursePlans(normalizedPlans);
        setClassroomDisciplineConfig(normalizedDisciplineConfig);
        setFinalTestConfig(normalizedFinalTestConfig);
        classroomConfigSavedSnapshotRef.current = buildClassroomConfigSnapshot({
          productTaskEnabled: legacyProductEnabled,
          teacherCoursePlans: normalizedPlans,
          classroomDisciplineConfig: normalizedDisciplineConfig,
        });
        finalTestConfigSavedSnapshotRef.current = buildFinalTestConfigSnapshot(
          normalizedFinalTestConfig,
        );
        const serverSeatLayouts = normalizeSeatLayoutsByClass(
          plansData?.seatLayoutsByClass,
        );
        setSeatLayoutsByClass((current) => {
          const hasServerSeatLayouts =
            Object.keys(serverSeatLayouts).length > 0;
          const nextSeatLayouts = hasServerSeatLayouts
            ? serverSeatLayouts
            : current;
          seatLayoutsLastSavedSnapshotRef.current = hasServerSeatLayouts
            ? JSON.stringify(nextSeatLayouts)
            : JSON.stringify(serverSeatLayouts);
          return nextSeatLayouts;
        });
        setSeatLayoutsSyncReady(true);
        const firstPlan = sortLessonPlans(normalizedPlans)[0];
        setSelectedCourseId(String(firstPlan?.id || ""));
        setClassroomUpdatedAt(String(plansData?.updatedAt || ""));
        if (background) {
          setPageRefreshState("success");
        } else {
          setPageRefreshState("idle");
        }
      } catch (rawError) {
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
        if (background) {
          setPageRefreshState("stale");
        } else {
          setPageRefreshState("idle");
        }
      } finally {
        setLoading(false);
      }
    },
    [activeSlot, adminToken, handleAuthError, navigate],
  );

  useEffect(() => {
    if (!uploadingFiles) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadingFiles]);

  useEffect(() => {
    setPageRefreshState("idle");
    setActivePanel(requestedTeacherPanel || "classroom");
    setExportCenterScopeKey(
      requestedExportCenterContext.teacherScopeKey || DEFAULT_TEACHER_SCOPE_KEY,
    );
    setExportCenterDate(
      requestedExportCenterContext.exportDate || readTodayDateInputValue(),
    );
    setExportCenterFinalTestClassName(
      requestedExportCenterContext.finalTestClassName || "all",
    );
    void loadPageData();
  }, [loadPageData, requestedExportCenterContext, requestedTeacherPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const safeActivePanel = TEACHER_HOME_PANEL_KEYS.has(
      String(activePanel || "").trim(),
    )
      ? String(activePanel || "").trim()
      : "classroom";
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("teacherPanel", safeActivePanel);
    if (safeActivePanel === "export-center") {
      const safeTeacherScopeKey = String(exportCenterScopeKey || "").trim();
      const safeExportDate = String(exportCenterDate || "").trim();
      const safeFinalTestClassName = String(
        exportCenterFinalTestClassName || "all",
      ).trim();
      if (safeTeacherScopeKey) {
        nextParams.set("exportTeacherScopeKey", safeTeacherScopeKey);
      } else {
        nextParams.delete("exportTeacherScopeKey");
      }
      if (isValidDateInputValue(safeExportDate)) {
        nextParams.set("exportDate", safeExportDate);
      } else {
        nextParams.delete("exportDate");
      }
      if (safeFinalTestClassName && safeFinalTestClassName !== "all") {
        nextParams.set("exportFinalTestClassName", safeFinalTestClassName);
      } else {
        nextParams.delete("exportFinalTestClassName");
      }
    } else {
      nextParams.delete("exportTeacherScopeKey");
      nextParams.delete("exportDate");
      nextParams.delete("exportFinalTestClassName");
    }
    const currentSearch = String(location.search || "").replace(/^\?/, "");
    const nextSearch = nextParams.toString();
    if (nextSearch === currentSearch) return;
    const nextUrl = withAppBasePath(
      `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash || ""}`,
    );
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [
    activePanel,
    exportCenterDate,
    exportCenterFinalTestClassName,
    exportCenterScopeKey,
    location.hash,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    if (pageRefreshState !== "success") return undefined;
    const timerId = window.setTimeout(() => {
      setPageRefreshState("idle");
    }, TEACHER_HOME_REFRESH_SUCCESS_MS);
    return () => window.clearTimeout(timerId);
  }, [pageRefreshState]);

  useEffect(() => {
    if (activePanel !== "homework") return;
    void loadHomeworkOverview();
  }, [activePanel, loadHomeworkOverview]);

  useEffect(() => {
    if (activePanel !== "image-library") return;
    void loadImageLibrary();
  }, [activePanel, loadImageLibrary]);

  useEffect(() => {
    if (activePanel !== "user-manage" && activePanel !== "discipline") {
      return;
    }
    void loadUserDirectory();
  }, [activePanel, loadUserDirectory]);

  useEffect(() => {
    if (activePanel !== "seat-fixed" && activePanel !== "random-rollcall")
      return;
    if (userDirectoryLoading || userDirectoryItems.length > 0) return;
    void loadUserDirectory();
  }, [
    activePanel,
    loadUserDirectory,
    userDirectoryItems.length,
    userDirectoryLoading,
  ]);

  useEffect(() => {
    if (activePanel !== "random-rollcall") return;
    void loadOnlineSummary();
  }, [activePanel, loadOnlineSummary]);

  useEffect(() => {
    if (
      activePanel !== "group-chat-manage" &&
      activePanel !== "party-manage"
    ) return;
    void loadPartyRoomManage();
    const timerId = window.setInterval(() => {
      void loadPartyRoomManage({ silent: true });
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [activePanel, loadPartyRoomManage]);

  useEffect(() => {
    if (activePanel !== "final-test" || finalTestView !== "submissions") return;
    void loadFinalTestSubmissions();
  }, [activePanel, finalTestView, loadFinalTestSubmissions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TEACHER_SEAT_LAYOUT_STORAGE_KEY,
        JSON.stringify(seatLayoutsByClass),
      );
    } catch {
      // ignore storage errors to keep panel usable
    }
  }, [seatLayoutsByClass]);

  useEffect(() => {
    setExportCenterError("");
    setExportCenterNotice("");
  }, [exportCenterScopeKey]);

  useEffect(() => {
    if (exportCenterNoticeTimerRef.current) {
      window.clearTimeout(exportCenterNoticeTimerRef.current);
      exportCenterNoticeTimerRef.current = null;
    }
    if (!exportCenterNotice) return undefined;
    exportCenterNoticeTimerRef.current = window.setTimeout(() => {
      setExportCenterNotice("");
      exportCenterNoticeTimerRef.current = null;
    }, 2000);
    return () => {
      if (exportCenterNoticeTimerRef.current) {
        window.clearTimeout(exportCenterNoticeTimerRef.current);
        exportCenterNoticeTimerRef.current = null;
      }
    };
  }, [exportCenterNotice]);

  useEffect(() => {
    if (classroomSaveNoticeTimerRef.current) {
      window.clearTimeout(classroomSaveNoticeTimerRef.current);
      classroomSaveNoticeTimerRef.current = null;
    }
    if (!classroomSaveNotice) return undefined;
    classroomSaveNoticeTimerRef.current = window.setTimeout(() => {
      setClassroomSaveNotice("");
      classroomSaveNoticeTimerRef.current = null;
    }, 2000);
    return () => {
      if (classroomSaveNoticeTimerRef.current) {
        window.clearTimeout(classroomSaveNoticeTimerRef.current);
        classroomSaveNoticeTimerRef.current = null;
      }
    };
  }, [classroomSaveNotice]);

  useEffect(() => {
    if (imageLibraryNoticeTimerRef.current) {
      window.clearTimeout(imageLibraryNoticeTimerRef.current);
      imageLibraryNoticeTimerRef.current = null;
    }
    if (!imageLibraryNotice) return undefined;
    imageLibraryNoticeTimerRef.current = window.setTimeout(() => {
      setImageLibraryNotice("");
      imageLibraryNoticeTimerRef.current = null;
    }, 2000);
    return () => {
      if (imageLibraryNoticeTimerRef.current) {
        window.clearTimeout(imageLibraryNoticeTimerRef.current);
        imageLibraryNoticeTimerRef.current = null;
      }
    };
  }, [imageLibraryNotice]);

  useEffect(() => {
    if (activePanel === "export-center") return;
    setExportCenterDeleteDialogOpen(false);
  }, [activePanel]);

  useEffect(() => {
    if (!adminToken || !seatLayoutsSyncReady) return;
    const nextSnapshot = JSON.stringify(seatLayoutsByClass);
    if (nextSnapshot === seatLayoutsLastSavedSnapshotRef.current) return;
    if (seatLayoutsSyncTimerRef.current) {
      window.clearTimeout(seatLayoutsSyncTimerRef.current);
    }
    seatLayoutsSyncTimerRef.current = window.setTimeout(async () => {
      try {
        await saveAdminClassroomSeatLayouts(adminToken, {
          seatLayoutsByClass,
        });
        seatLayoutsLastSavedSnapshotRef.current = nextSnapshot;
      } catch (rawError) {
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
      }
    }, 420);
    return () => {
      if (seatLayoutsSyncTimerRef.current) {
        window.clearTimeout(seatLayoutsSyncTimerRef.current);
      }
    };
  }, [adminToken, handleAuthError, seatLayoutsByClass, seatLayoutsSyncReady]);

  useEffect(() => {
    const message = String(error || "").trim();
    if (!message) return;
    const timer = window.setTimeout(() => {
      setError("");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const existingIds = new Set(
      imageLibraryGroups
        .map((group) => String(group?.userId || group?.baseUserId || "").trim())
        .filter(Boolean),
    );
    setExpandedImageUserIds((current) => {
      if (existingIds.size === 0) return [];
      const filtered = current.filter((id) =>
        existingIds.has(String(id || "").trim()),
      );
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
      setSelectedCourseId(
        String(sortLessonPlans(teacherCoursePlans)[0]?.id || ""),
      );
    }
  }, [selectedCourseId, teacherCoursePlans]);

  useEffect(() => {
    if (!Array.isArray(homeworkLessons) || homeworkLessons.length === 0) {
      if (selectedHomeworkLessonId) setSelectedHomeworkLessonId("");
      return;
    }
    const exists = homeworkLessons.some(
      (lesson) =>
        String(lesson?.id || "") === String(selectedHomeworkLessonId || ""),
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
      teacherCoursePlans
        .map((lesson) => String(lesson?.id || "").trim())
        .filter(Boolean),
    );
    setBatchSelectedLessonIds((current) => {
      const filtered = current.filter((id) =>
        existingIds.has(String(id || "").trim()),
      );
      if (filtered.length === current.length) return current;
      return filtered;
    });
  }, [
    batchSelectedLessonIds.length,
    lessonBatchDeleteMode,
    teacherCoursePlans,
  ]);

  useEffect(() => {
    if (!deleteConfirmDialog.open) return;
    const timerId = window.setTimeout(() => {
      deleteConfirmInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timerId);
  }, [deleteConfirmDialog.open]);

  const adminUsernameKey = useMemo(
    () => toAdminUsernameKey(adminProfile.username),
    [adminProfile.username],
  );
  const hideClassroomManagePanels = useMemo(
    () => CLASSROOM_MANAGE_HIDDEN_ADMIN_USERNAME_KEYS.has(adminUsernameKey),
    [adminUsernameKey],
  );
  const isTerminalAdmin = useMemo(
    () => adminUsernameKey === TERMINAL_ADMIN_USERNAME_KEY,
    [adminUsernameKey],
  );
  const isShiGaojunAdmin = useMemo(
    () => adminUsernameKey === SHI_GAOJUN_ADMIN_USERNAME_KEY,
    [adminUsernameKey],
  );
  const currentAdminUserId = useMemo(
    () => String(adminProfile.id || "").trim(),
    [adminProfile.id],
  );
  const userEditGenderOptions = useMemo(() => {
    const currentValue = String(userEditDialog.gender || "").trim();
    if (!currentValue || GENDER_OPTIONS.includes(currentValue))
      return GENDER_OPTIONS;
    return [currentValue, ...GENDER_OPTIONS];
  }, [userEditDialog.gender]);
  const userEditGradeOptions = useMemo(() => {
    const currentValue = String(userEditDialog.grade || "").trim();
    if (!currentValue || GRADE_OPTIONS.includes(currentValue))
      return GRADE_OPTIONS;
    return [currentValue, ...GRADE_OPTIONS];
  }, [userEditDialog.grade]);
  const userDirectoryTargetClassKeyToName = useMemo(
    () =>
      userDirectoryTargetClasses.reduce((mapping, className) => {
        const normalized = String(className || "").trim();
        const classKey = toClassNameKey(normalized);
        if (classKey && !mapping[classKey]) {
          mapping[classKey] = normalized;
        }
        return mapping;
      }, {}),
    [userDirectoryTargetClasses],
  );
  const userDirectoryTargetClassNameKeys = useMemo(
    () => new Set(Object.keys(userDirectoryTargetClassKeyToName)),
    [userDirectoryTargetClassKeyToName],
  );
  const userDirectoryClassFilterOptions = useMemo(
    () => [
      { value: "all", label: "全部" },
      ...userDirectoryTargetClasses.map((className) => ({
        value: className,
        label: className,
      })),
      { value: "other", label: "班级外" },
      { value: "unassigned", label: "未填写班级" },
    ],
    [userDirectoryTargetClasses],
  );
  const userCreateClassOptions = useMemo(() => {
    const preferred = ["教技231", "810班", "811班"];
    const seen = new Set();
    const options = [];
    preferred.forEach((className) => {
      const key = toClassNameKey(className);
      if (!key || seen.has(key)) return;
      seen.add(key);
      options.push(className);
    });
    userDirectoryTargetClasses.forEach((className) => {
      const safeClassName = String(className || "").trim();
      const key = toClassNameKey(safeClassName);
      if (!safeClassName || !key || seen.has(key)) return;
      seen.add(key);
      options.push(safeClassName);
    });
    return options;
  }, [userDirectoryTargetClasses]);
  const exportCenterScopeLabel = useMemo(
    () => getTeacherScopeLabel(exportCenterScopeKey),
    [exportCenterScopeKey],
  );
  const exportCenterScopeOptions = useMemo(
    () =>
      TEACHER_SCOPE_OPTIONS.map((item) => ({
        value: item.key,
        label:
          item.key === DEFAULT_TEACHER_SCOPE_KEY
            ? `${item.label}（历史数据）`
            : item.label,
      })),
    [],
  );

  const sidebarGroups = useMemo(() => {
    const groups = [
      {
        key: "classroom-group",
        label: "课堂管理",
        items: [
          { key: "classroom", label: "课时管理", icon: ClipboardList },
          { key: "discipline", label: "纪律管理", icon: CircleHelp },
          { key: "homework", label: "作业管理", icon: FileText },
          { key: "final-test", label: "期末测试", icon: BookCheck },
          { key: "seat-fixed", label: "座位管理", icon: LayoutGrid },
          { key: "random-rollcall", label: "随机点名", icon: Dices },
        ],
      },
      {
        key: "student-group",
        label: "用户管理",
        items: [
          { key: "user-manage", label: "用户信息", icon: Users },
          { key: "export-center", label: "导出中心", icon: Download },
          { key: "image-library", label: "图片管理", icon: Image },
          { key: "group-chat-manage", label: "群聊管理", icon: MessageCircleMore },
          ...(isShiGaojunAdmin
            ? [{ key: "party-manage", label: "协作小教室", icon: Activity }]
            : []),
          { key: "online", label: "在线状态", icon: Eye },
        ],
      },
      {
        key: "external-group",
        label: "外部工具",
        external: true,
        dividerBefore: true,
        items: [
          { key: "agent", label: "智能体管理", icon: Bot, external: true },
          {
            key: "workshop",
            label: "进入元协坊",
            icon: Sparkles,
            external: true,
          },
          {
            key: "image-generation",
            label: "图片生成",
            icon: Image,
            external: true,
          },
          { key: "party", label: "派·协作", icon: Users, external: true },
        ],
      },
    ];
    if (!hideClassroomManagePanels) return groups;
    return groups
      .map((group) => {
        if (group.key !== "classroom-group") return group;
        return {
          ...group,
          items: group.items.filter(
            (item) => !CLASSROOM_MANAGE_PANEL_KEYS.has(item.key),
          ),
        };
      })
      .filter((group) => Array.isArray(group.items) && group.items.length > 0);
  }, [hideClassroomManagePanels, isShiGaojunAdmin]);

  const availablePanelKeys = useMemo(
    () =>
      sidebarGroups.flatMap((group) =>
        group.items
          .filter((item) => !item.external)
          .map((item) => String(item.key || "").trim())
          .filter(Boolean),
      ),
    [sidebarGroups],
  );

  useEffect(() => {
    if (availablePanelKeys.length === 0) return;
    if (availablePanelKeys.includes(activePanel)) return;
    setActivePanel(availablePanelKeys[0]);
  }, [activePanel, availablePanelKeys]);

  async function openTeacherFeature(pathname) {
    if (!adminToken) return;
    setFeatureTransition({
      active: true,
      label: resolveTeacherFeatureTransitionLabel(pathname),
    });
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
      const nextParams = new URLSearchParams();
      nextParams.set("returnTo", "teacher-home");
      const returnParams = new URLSearchParams();
      if (TEACHER_HOME_PANEL_KEYS.has(String(activePanel || "").trim())) {
        nextParams.set("teacherPanel", String(activePanel || "").trim());
        returnParams.set("teacherPanel", String(activePanel || "").trim());
      }
      if (String(activePanel || "").trim() === "export-center") {
        const safeTeacherScopeKey = String(exportCenterScopeKey || "").trim();
        const safeExportDate = String(exportCenterDate || "").trim();
        const safeFinalTestClassName = String(
          exportCenterFinalTestClassName || "all",
        ).trim();
        if (safeTeacherScopeKey) {
          nextParams.set("exportTeacherScopeKey", safeTeacherScopeKey);
          returnParams.set("exportTeacherScopeKey", safeTeacherScopeKey);
        }
        if (isValidDateInputValue(safeExportDate)) {
          nextParams.set("exportDate", safeExportDate);
          returnParams.set("exportDate", safeExportDate);
        }
        if (safeFinalTestClassName && safeFinalTestClassName !== "all") {
          nextParams.set("exportFinalTestClassName", safeFinalTestClassName);
          returnParams.set(
            "exportFinalTestClassName",
            safeFinalTestClassName,
          );
        }
      }
      const returnPath = returnParams.toString()
        ? `/admin/settings?${returnParams.toString()}`
        : "/admin/settings";
      const returnUrl = buildAbsoluteAppUrl(returnPath, activeSlot);
      if (returnUrl) {
        appendReturnUrlParam(nextParams, returnUrl);
      }
      navigate(
        withAuthSlot(
          `${safePath}${joiner}${nextParams.toString()}`,
          activeSlot,
        ),
      );
    } catch (rawError) {
      setFeatureTransition({
        active: false,
        label: "",
      });
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    }
  }

  function confirmLeaveWithUnsavedClassroomConfig() {
    const hasClassroomChanges = classroomConfigHasUnsavedChanges;
    const hasFinalTestChanges = finalTestConfigHasUnsavedChanges;
    if (!hasClassroomChanges && !hasFinalTestChanges) return true;
    if (hasClassroomChanges && hasFinalTestChanges) {
      return window.confirm(
        "当前有未保存的课时/任务修改和期末测试内容修改，切换栏目后这些修改将丢失。确定要放弃并离开吗？",
      );
    }
    if (hasFinalTestChanges) {
      return window.confirm(
        "当前有未保存的期末测试内容修改，切换栏目后这些修改将丢失。确定要放弃并离开吗？",
      );
    }
    return window.confirm(
      "当前有未保存的课时/任务修改，切换栏目后这些修改将丢失。确定要放弃并离开吗？",
    );
  }

  function onSidebarItemClick(itemKey) {
    const safeItemKey = String(itemKey || "").trim();
    if (
      hideClassroomManagePanels &&
      CLASSROOM_MANAGE_PANEL_KEYS.has(String(itemKey || "").trim())
    ) {
      return;
    }
    if (safeItemKey === String(activePanel || "").trim()) return;
    if (!confirmLeaveWithUnsavedClassroomConfig()) return;
    if (safeItemKey === "agent") {
      setFeatureTransition({
        active: true,
        label: resolveTeacherFeatureTransitionLabel("/admin/agent-settings"),
      });
      navigate(withAuthSlot("/admin/agent-settings", activeSlot));
      return;
    }
    if (safeItemKey === "workshop") {
      void openTeacherFeature("/chat");
      return;
    }
    if (safeItemKey === "image-generation") {
      void openTeacherFeature("/image-generation");
      return;
    }
    if (safeItemKey === "party") {
      void openTeacherFeature("/party");
      return;
    }
    setActivePanel(safeItemKey);
  }

  function onUpdateSeatManageClassName(nextClassName) {
    const safeClassName = String(nextClassName || "").trim();
    if (!safeClassName) return;
    setSeatManageClassName(safeClassName);
  }

  function onResizeSeatLayout(value, field) {
    const safeClassName = String(seatManageClassName || "").trim();
    if (!safeClassName) return;
    setSeatLayoutsByClass((current) => {
      const currentLayout = normalizeSeatLayout(current[safeClassName]);
      const nextRows = field === "rows" ? value : currentLayout.rows;
      const nextColumns = field === "columns" ? value : currentLayout.columns;
      const resized = reshapeSeatLayout(currentLayout, nextRows, nextColumns);
      return {
        ...current,
        [safeClassName]: {
          ...resized,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function onUpdateSeatValue(seatIndex, rawValue) {
    const safeClassName = String(seatManageClassName || "").trim();
    if (!safeClassName) return;
    setSeatLayoutsByClass((current) => {
      const currentLayout = normalizeSeatLayout(current[safeClassName]);
      if (!Number.isFinite(Number(seatIndex))) return current;
      const targetIndex = Number(seatIndex);
      if (targetIndex < 0 || targetIndex >= currentLayout.seats.length)
        return current;
      const nextSeats = [...currentLayout.seats];
      nextSeats[targetIndex] = String(rawValue || "");
      return {
        ...current,
        [safeClassName]: {
          ...currentLayout,
          seats: nextSeats,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function onClearSeatLayoutAssignments() {
    const safeClassName = String(seatManageClassName || "").trim();
    if (!safeClassName) return;
    const confirmed = window.confirm(
      "将清空当前班级所有座位上的填写内容，是否继续？",
    );
    if (!confirmed) return;
    setSeatLayoutsByClass((current) => {
      const currentLayout = normalizeSeatLayout(current[safeClassName]);
      return {
        ...current,
        [safeClassName]: {
          ...currentLayout,
          seats: Array.from({ length: currentLayout.seats.length }, () => ""),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function onToggleSeatStudentFillEnabled(nextValue) {
    const safeClassName = String(seatManageClassName || "").trim();
    if (!safeClassName) return;
    setSeatLayoutsByClass((current) => {
      const currentLayout = normalizeSeatLayout(current[safeClassName]);
      const targetValue =
        typeof nextValue === "boolean"
          ? nextValue
          : !currentLayout.studentFillEnabled;
      if (currentLayout.studentFillEnabled === targetValue) return current;
      return {
        ...current,
        [safeClassName]: {
          ...currentLayout,
          studentFillEnabled: targetValue,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function onToggleSeatTeacherLock() {
    const safeClassName = String(seatManageClassName || "").trim();
    if (!safeClassName) return;
    setSeatLayoutsByClass((current) => {
      const currentLayout = normalizeSeatLayout(current[safeClassName]);
      const nextLocked = !currentLayout.teacherLocked;
      return {
        ...current,
        [safeClassName]: {
          ...currentLayout,
          teacherLocked: nextLocked,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function onStartRandomRollcall() {
    const count = clampInteger(
      randomRollcallCount,
      1,
      RANDOM_ROLLCALL_COUNT_OPTIONS.length,
      1,
    );
    if (randomRollcallPool.length === 0) {
      setRandomRollcallError("当前候选池为空，请调整班级或候选来源。");
      setRandomRollcallResult([]);
      return;
    }
    if (randomRollcallNoRepeat && randomRollcallAvailablePool.length === 0) {
      setRandomRollcallError("本轮不重复候选池已用完，请重置后继续抽取。");
      setRandomRollcallResult([]);
      return;
    }
    if (count > randomRollcallAvailablePool.length) {
      setRandomRollcallError(
        `当前可抽人数仅 ${randomRollcallAvailablePool.length} 人，请减少抽取人数或重置候选池。`,
      );
      return;
    }
    const picked = pickRandomItems(randomRollcallAvailablePool, count);
    setRandomRollcallResult(picked);
    setRandomRollcallGeneratedAt(new Date().toISOString());
    setRandomRollcallError("");
    if (!randomRollcallNoRepeat) return;
    setRandomRollcallUsedByScope((current) => {
      const currentUsed = Array.isArray(current[randomRollcallScopeKey])
        ? current[randomRollcallScopeKey]
        : [];
      const nextUsed = new Set(currentUsed);
      picked.forEach((item) => {
        nextUsed.add(item.key);
      });
      return {
        ...current,
        [randomRollcallScopeKey]: Array.from(nextUsed),
      };
    });
  }

  function onResetRandomRollcallUsedScope() {
    setRandomRollcallUsedByScope((current) => {
      if (
        !Object.prototype.hasOwnProperty.call(current, randomRollcallScopeKey)
      )
        return current;
      const next = { ...current };
      delete next[randomRollcallScopeKey];
      return next;
    });
    setRandomRollcallError("");
  }

  async function runExportCenterTask(taskKey, handler) {
    if (!adminToken || exportCenterLoading) return;
    setExportCenterError("");
    setExportCenterNotice("");
    setExportCenterLoading(taskKey);
    try {
      await handler();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setExportCenterError(readErrorMessage(rawError));
    } finally {
      setExportCenterLoading("");
    }
  }

  async function onExportCenterUsersTxt() {
    await runExportCenterTask("users", async () => {
      const data = await exportAdminUsersTxt(adminToken);
      triggerTextDownload(
        data?.filename || "educhat-users.txt",
        data?.content || "",
      );
      setExportCenterNotice("账号密码数据导出完成。");
    });
  }

  async function onExportCenterChatsTxt() {
    await runExportCenterTask("chats-txt", async () => {
      const data = await exportAdminChatsTxt(adminToken, exportCenterScopeKey);
      triggerTextDownload(
        data?.filename || "educhat-chats.txt",
        data?.content || "",
      );
      setExportCenterNotice("聊天数据（TXT）导出完成。");
    });
  }

  async function onExportCenterChatsZip() {
    await runExportCenterTask("chats-zip", async () => {
      const data = await exportAdminChatsZip(adminToken, exportCenterScopeKey);
      triggerBrowserDownload(
        data?.blob,
        data?.filename || "educhat-chats-by-user.zip",
      );
      setExportCenterNotice("聊天数据（ZIP）导出完成。");
    });
  }

  async function onExportCenterChatsZipByDate() {
    const safeExportDate = String(exportCenterDate || "").trim();
    if (!isValidDateInputValue(safeExportDate)) {
      setExportCenterError("请选择有效的导出日期。");
      return;
    }
    await runExportCenterTask("chats-zip-date", async () => {
      const data = await exportAdminChatsZip(adminToken, exportCenterScopeKey, {
        exportDate: safeExportDate,
      });
      triggerBrowserDownload(
        data?.blob,
        data?.filename || `educhat-chats-by-user-${safeExportDate}.zip`,
      );
      setExportCenterNotice(`聊天数据（${safeExportDate}）导出完成。`);
    });
  }

  async function onExportCenterGroupChatsZip() {
    await runExportCenterTask("group-chats", async () => {
      const data = await exportAdminGroupChatsZip(
        adminToken,
        exportCenterScopeKey,
      );
      triggerBrowserDownload(
        data?.blob,
        data?.filename || "educhat-group-chats.zip",
      );
      setExportCenterNotice("群聊聊天记录（ZIP）导出完成。");
    });
  }

  async function onExportCenterGroupChatsZipByDate() {
    const safeExportDate = String(exportCenterDate || "").trim();
    if (!isValidDateInputValue(safeExportDate)) {
      setExportCenterError("请选择有效的导出日期。");
      return;
    }
    await runExportCenterTask("group-chats-date", async () => {
      const data = await exportAdminGroupChatsZip(
        adminToken,
        exportCenterScopeKey,
        {
          exportDate: safeExportDate,
        },
      );
      triggerBrowserDownload(
        data?.blob,
        data?.filename || `educhat-group-chats-${safeExportDate}.zip`,
      );
      setExportCenterNotice(`群聊聊天记录（${safeExportDate}，ZIP）导出完成。`);
    });
  }

  async function onExportCenterGeneratedImagesTxt() {
    await runExportCenterTask("images", async () => {
      const data = await exportAdminGeneratedImagesTxt(
        adminToken,
        exportCenterScopeKey,
      );
      triggerTextDownload(
        data?.filename || "educhat-generated-images.txt",
        data?.content || "",
      );
      setExportCenterNotice("学生生成图片记录导出完成。");
    });
  }

  async function onExportCenterFinalTestZip() {
    await runExportCenterTask("final-test", async () => {
      const data = await exportAdminFinalTestZip(
        adminToken,
        exportCenterScopeKey,
        {
          className: exportCenterFinalTestClassName,
        },
      );
      triggerBrowserDownload(
        data?.blob,
        data?.filename || "期末测试导出.zip",
      );
      setExportCenterNotice("期末测试痕迹导出完成。");
    });
  }

  async function onExportCenterAllRecordsZip() {
    await runExportCenterTask("all-records", async () => {
      const data = await exportAdminAllRecordsZip(
        adminToken,
        exportCenterScopeKey,
      );
      triggerBrowserDownload(
        data?.blob,
        data?.filename || "educhat-all-records.zip",
      );
      setExportCenterNotice("全量记录归档导出完成。");
    });
  }

  async function onDeleteCurrentTeacherScopeChats() {
    await runExportCenterTask("delete-scope-chats", async () => {
      const data = await deleteAllUserChats(adminToken, exportCenterScopeKey);
      setExportCenterNotice(
        `已清空"${exportCenterScopeLabel}"授课教师下 ${Number(data?.deletedCount || 0)} 条对话状态数据。`,
      );
      setExportCenterDeleteDialogOpen(false);
    });
  }

  const classOnlineSummaries = useMemo(
    () =>
      TARGET_CLASS_NAMES.map((className) => {
        const classUsers = onlineUsers
          .filter(
            (item) =>
              String(item?.profile?.className || "").trim() === className,
          )
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
      .filter((item) =>
        TARGET_CLASS_NAMES.includes(
          String(item?.profile?.className || "").trim(),
        ),
      )
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

  const userDirectorySummary = useMemo(() => {
    const summary = {
      totalCount: 0,
      adminCount: 0,
      studentCount: 0,
      targetClassStudentCount: 0,
      otherClassStudentCount: 0,
      unassignedStudentCount: 0,
    };
    userDirectoryItems.forEach((item) => {
      summary.totalCount += 1;
      if (
        String(item?.role || "")
          .trim()
          .toLowerCase() === "admin"
      ) {
        summary.adminCount += 1;
        return;
      }
      summary.studentCount += 1;
      const bucket = resolveUserClassBucket(
        item?.profile?.className,
        userDirectoryTargetClassNameKeys,
      );
      if (bucket === "target") {
        summary.targetClassStudentCount += 1;
      } else if (bucket === "other") {
        summary.otherClassStudentCount += 1;
      } else {
        summary.unassignedStudentCount += 1;
      }
    });
    return summary;
  }, [userDirectoryItems, userDirectoryTargetClassNameKeys]);

  const visibleFinalTestSubmissionClasses = useMemo(() => {
    const classFilter = normalizeLessonClassName(
      finalTestSubmissionClassName,
    );
    const source = Array.isArray(finalTestSubmissionClasses)
      ? finalTestSubmissionClasses
      : [];
    if (!classFilter || classFilter === "all") return source;
    return source.filter(
      (item) => normalizeLessonClassName(item?.className) === classFilter,
    );
  }, [finalTestSubmissionClassName, finalTestSubmissionClasses]);

  const userDirectoryRoleCounts = useMemo(() => {
    const counts = {
      all: userDirectoryItems.length,
      user: 0,
      admin: 0,
    };
    userDirectoryItems.forEach((item) => {
      const role = String(item?.role || "user")
        .trim()
        .toLowerCase();
      if (role === "admin") {
        counts.admin += 1;
      } else {
        counts.user += 1;
      }
    });
    return counts;
  }, [userDirectoryItems]);

  const userDirectoryClassCounts = useMemo(() => {
    const counts = userDirectoryClassFilterOptions.reduce((result, option) => {
      result[option.value] = 0;
      return result;
    }, {});
    userDirectoryItems.forEach((item) => {
      if (
        String(item?.role || "user")
          .trim()
          .toLowerCase() !== "user"
      )
        return;
      counts.all += 1;
      const classValue = resolveUserClassFilterValue(
        item?.profile?.className,
        userDirectoryTargetClassKeyToName,
      );
      counts[classValue] += 1;
    });
    return counts;
  }, [
    userDirectoryClassFilterOptions,
    userDirectoryItems,
    userDirectoryTargetClassKeyToName,
  ]);

  const userDirectoryPendingEditCount = useMemo(
    () => Object.keys(userDirectoryPendingEdits).length,
    [userDirectoryPendingEdits],
  );
  const userDirectoryPendingDeleteCount = useMemo(
    () => userDirectoryPendingDeleteIds.length,
    [userDirectoryPendingDeleteIds],
  );
  const userDirectoryPendingChangeCount = useMemo(
    () => userDirectoryPendingEditCount + userDirectoryPendingDeleteCount,
    [userDirectoryPendingDeleteCount, userDirectoryPendingEditCount],
  );
  const userDirectoryHasUnsavedChanges = useMemo(
    () => userDirectoryPendingChangeCount > 0,
    [userDirectoryPendingChangeCount],
  );

  const userDirectoryVisibleItems = useMemo(() => {
    const roleFilter = String(userDirectoryRoleFilter || "all")
      .trim()
      .toLowerCase();
    const classFilter = String(userDirectoryClassFilter || "all").trim();
    const keyword = String(userDirectoryKeyword || "")
      .trim()
      .toLowerCase();

    const source = Array.isArray(userDirectoryItems)
      ? [...userDirectoryItems]
      : [];
    return source
      .filter((item) => {
        const role = String(item?.role || "user")
          .trim()
          .toLowerCase();
        if (roleFilter !== "all" && role !== roleFilter) return false;
        if (classFilter !== "all") {
          if (role === "admin") return false;
          const classValue = resolveUserClassFilterValue(
            item?.profile?.className,
            userDirectoryTargetClassKeyToName,
          );
          if (classValue !== classFilter) return false;
        }
        if (!keyword) return true;
        const tokens = [
          item?.username,
          item?.profile?.name,
          item?.profile?.studentId,
          item?.profile?.className,
          item?.profile?.grade,
          item?.profile?.gender,
          readUserRoleLabel(item?.role),
        ];
        return tokens.some((token) =>
          String(token || "")
            .toLowerCase()
            .includes(keyword),
        );
      })
      .sort((a, b) => {
        if (userDirectorySortBy === "username") {
          return String(a?.username || "").localeCompare(
            String(b?.username || ""),
            "zh-CN",
            {
              sensitivity: "base",
            },
          );
        }
        const aTime = Date.parse(String(a?.updatedAt || "")) || 0;
        const bTime = Date.parse(String(b?.updatedAt || "")) || 0;
        if (bTime !== aTime) return bTime - aTime;
        return String(a?.username || "").localeCompare(
          String(b?.username || ""),
          "zh-CN",
          {
            sensitivity: "base",
          },
        );
      });
  }, [
    userDirectoryKeyword,
    userDirectoryClassFilter,
    userDirectoryItems,
    userDirectoryRoleFilter,
    userDirectorySortBy,
    userDirectoryTargetClassKeyToName,
  ]);

  const userMergeCandidates = useMemo(
    () =>
      userDirectoryItems
        .filter(
          (item) =>
            String(item?.role || "")
              .trim()
              .toLowerCase() === "user",
        )
        .map((item) => ({
          id: String(item?.id || "").trim(),
          label:
            String(item?.profile?.name || "").trim() ||
            String(item?.username || "").trim() ||
            "未命名学生",
          username: String(item?.username || "").trim(),
          studentId: String(item?.profile?.studentId || "").trim(),
          className: String(item?.profile?.className || "").trim(),
        }))
        .filter((item) => item.id),
    [userDirectoryItems],
  );

  const hasUserDirectoryFilters = useMemo(
    () =>
      !!String(userDirectoryKeyword || "").trim() ||
      userDirectoryRoleFilter !== "all" ||
      userDirectoryClassFilter !== "all" ||
      userDirectorySortBy !== "updated",
    [
      userDirectoryClassFilter,
      userDirectoryKeyword,
      userDirectoryRoleFilter,
      userDirectorySortBy,
    ],
  );
  const userCreateForcedTeacherScopeKey = useMemo(
    () => resolveForcedTeacherScopeKeyByClassName(userCreateDialog.className),
    [userCreateDialog.className],
  );
  const userCreateForcedTeacherScopeLabel = useMemo(
    () => resolveTeacherScopeLabelByKey(userCreateForcedTeacherScopeKey),
    [userCreateForcedTeacherScopeKey],
  );

  const imageLibraryClassOptions = useMemo(() => {
    const counter = new Map();
    imageLibraryGroups.forEach((group) => {
      const className = String(group?.className || "未分班").trim() || "未分班";
      counter.set(className, Number(counter.get(className) || 0) + 1);
    });
    return Array.from(counter.entries())
      .map(([className, userCount]) => ({ className, userCount }))
      .sort((a, b) =>
        String(a.className || "").localeCompare(
          String(b.className || ""),
          "zh-CN",
          {
            numeric: true,
            sensitivity: "base",
          },
        ),
      );
  }, [imageLibraryGroups]);

  const visibleImageLibraryGroups = useMemo(() => {
    let groups = Array.isArray(imageLibraryGroups)
      ? [...imageLibraryGroups]
      : [];
    if (imageLibraryClassFilter !== "all") {
      groups = groups.filter(
        (group) =>
          String(group?.className || "未分班").trim() ===
          imageLibraryClassFilter,
      );
    }

    if (imageLibrarySortBy === "count") {
      groups.sort((a, b) => {
        const countDiff =
          Number(b?.imageCount || 0) - Number(a?.imageCount || 0);
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

  const collaborationClassroomItems = useMemo(
    () =>
      (Array.isArray(partyRoomItems) ? partyRoomItems : []).filter(
        (room) =>
          String(room?.teacherScopeKey || "")
            .trim()
            .toLowerCase() === "shi-gaojun",
      ),
    [partyRoomItems],
  );
  const groupChatRoomItems = useMemo(
    () =>
      (Array.isArray(partyRoomItems) ? partyRoomItems : []).filter(
        (room) =>
          String(room?.teacherScopeKey || "")
            .trim()
            .toLowerCase() !== "shi-gaojun",
      ),
    [partyRoomItems],
  );

  const partyRoomSummary = useMemo(() => {
    const rooms = groupChatRoomItems;
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
  }, [groupChatRoomItems]);

  const partyRoomOwnerOptions = useMemo(() => {
    const options = [];
    const seen = new Set();
    groupChatRoomItems.forEach((room) => {
      const owner =
        room?.owner && typeof room.owner === "object" ? room.owner : null;
      const ownerId = String(owner?.id || "").trim();
      const ownerRole = String(owner?.role || "")
        .trim()
        .toLowerCase();
      if (!ownerId || ownerRole !== "admin" || seen.has(ownerId)) return;
      seen.add(ownerId);
      options.push({
        id: ownerId,
        label:
          String(owner?.displayName || owner?.username || "管理员").trim() ||
          "管理员",
        username: String(owner?.username || "").trim(),
      });
    });
    return options;
  }, [groupChatRoomItems]);
  const partyRoomCreateOwnerOptions = useMemo(
    () =>
      (Array.isArray(partyRoomManageUsers) ? partyRoomManageUsers : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          displayName:
            String(
              item?.displayName || item?.username || "未命名用户",
            ).trim() || "未命名用户",
          username: String(item?.username || "").trim(),
          role:
            String(item?.role || "user")
              .trim()
              .toLowerCase() === "admin"
              ? "admin"
              : "user",
          className: String(item?.className || "").trim(),
          studentId: String(item?.studentId || "").trim(),
        }))
        .filter((item) => item.id),
    [partyRoomManageUsers],
  );
  const partyRoomCreateVisibleMemberOptions = useMemo(() => {
    const keyword = String(partyRoomCreateDialog.memberKeyword || "")
      .trim()
      .toLowerCase();
    const options = partyRoomCreateOwnerOptions;
    if (!keyword) return options;
    return options.filter((item) =>
      [
        item.displayName,
        item.username,
        item.className,
        item.studentId,
        readUserRoleLabel(item.role),
      ].some((token) =>
        String(token || "")
          .toLowerCase()
          .includes(keyword),
      ),
    );
  }, [partyRoomCreateDialog.memberKeyword, partyRoomCreateOwnerOptions]);
  const partyRoomCreateSelectedMemberIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...partyRoomCreateDialog.memberUserIds,
            partyRoomCreateDialog.ownerUserId,
          ]
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      ),
    [partyRoomCreateDialog.memberUserIds, partyRoomCreateDialog.ownerUserId],
  );
  const partyRoomCreateSelectedMemberCount =
    partyRoomCreateSelectedMemberIds.length;
  const partyRoomCreateSelectionAtLimit =
    partyRoomCreateSelectedMemberCount >= PARTY_ROOM_CREATE_MAX_MEMBERS;

  const visiblePartyRoomItems = useMemo(() => {
    let rooms = [...groupChatRoomItems];
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
        return tokens.some((token) =>
          String(token || "")
            .toLowerCase()
            .includes(keyword),
        );
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
      return String(a?.name || "").localeCompare(
        String(b?.name || ""),
        "zh-CN",
        {
          sensitivity: "base",
        },
      );
    });
    return rooms;
  }, [
    groupChatRoomItems,
    partyRoomOwnerFilter,
    partyRoomMemberSearchInput,
    partyRoomSortBy,
  ]);

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
  const lessonClassNames = useMemo(() => {
    const seen = new Set();
    sortedCoursePlans.forEach((c) => {
      const name = normalizeLessonClassName(c?.className);
      if (name) seen.add(name);
    });
    return Array.from(seen).sort();
  }, [sortedCoursePlans]);
  const filteredCoursePlans = useMemo(() => {
    let result = sortedCoursePlans;
    if (lessonClassFilter) {
      result = result.filter(
        (c) => normalizeLessonClassName(c?.className) === lessonClassFilter,
      );
    }
    const q = lessonSearchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          (c?.courseName || "").toLowerCase().includes(q) ||
          normalizeLessonClassName(c?.className).toLowerCase().includes(q),
      );
    }
    return result;
  }, [sortedCoursePlans, lessonClassFilter, lessonSearchQuery]);
  const filteredDisciplinePlans = useMemo(() => {
    const q = disciplineSearchQuery.trim().toLowerCase();
    if (!q) return sortedCoursePlans;
    return sortedCoursePlans.filter(
      (c) =>
        (c?.courseName || "").toLowerCase().includes(q) ||
        normalizeLessonClassName(c?.className).toLowerCase().includes(q),
    );
  }, [sortedCoursePlans, disciplineSearchQuery]);
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
  const selectedTaskUploadScopeKey = useMemo(
    () => buildTeacherTaskUploadScopeKey(selectedCourse?.id, selectedTask?.id),
    [selectedCourse, selectedTask],
  );
  const selectedTaskUploadDrafts = useMemo(() => {
    if (!selectedTaskUploadScopeKey) return [];
    return Array.isArray(taskUploadDraftsByScope[selectedTaskUploadScopeKey])
      ? taskUploadDraftsByScope[selectedTaskUploadScopeKey]
      : [];
  }, [selectedTaskUploadScopeKey, taskUploadDraftsByScope]);
  const selectedTaskFiles = useMemo(
    () => (Array.isArray(selectedTask?.files) ? selectedTask.files : []),
    [selectedTask],
  );
  const selectedTaskLinks = useMemo(() => {
    if (!selectedTask || selectedTask.type !== "link") return [];
    return parseTaskLinkContent(selectedTask.content);
  }, [selectedTask]);
  const classroomConfigSnapshot = useMemo(
    () =>
      buildClassroomConfigSnapshot({
        productTaskEnabled,
        teacherCoursePlans,
        classroomDisciplineConfig,
      }),
    [classroomDisciplineConfig, productTaskEnabled, teacherCoursePlans],
  );
  const classroomConfigHasUnsavedChanges =
    classroomConfigSnapshot !== classroomConfigSavedSnapshotRef.current;
  const finalTestConfigSnapshot = useMemo(
    () => buildFinalTestConfigSnapshot(finalTestConfig),
    [finalTestConfig],
  );
  const finalTestConfigHasUnsavedChanges =
    finalTestConfigSnapshot !== finalTestConfigSavedSnapshotRef.current;
  useEffect(() => {
    if (!classroomConfigHasUnsavedChanges && !finalTestConfigHasUnsavedChanges) {
      return undefined;
    }
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [classroomConfigHasUnsavedChanges, finalTestConfigHasUnsavedChanges]);
  const filteredHomeworkLessons = useMemo(() => {
    const q = homeworkSearchQuery.trim().toLowerCase();
    if (!q) return homeworkLessons;
    return homeworkLessons.filter(
      (l) =>
        (l?.courseName || "").toLowerCase().includes(q) ||
        normalizeLessonClassName(l?.className).toLowerCase().includes(q),
    );
  }, [homeworkLessons, homeworkSearchQuery]);
  const selectedHomeworkLesson = useMemo(
    () =>
      homeworkLessons.find(
        (lesson) =>
          String(lesson?.id || "") === String(selectedHomeworkLessonId || ""),
      ) || null,
    [homeworkLessons, selectedHomeworkLessonId],
  );
  const selectedHomeworkStudents = useMemo(
    () =>
      Array.isArray(selectedHomeworkLesson?.students)
        ? selectedHomeworkLesson.students
        : [],
    [selectedHomeworkLesson],
  );
  const disciplineBehaviorOptions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    [
      ...DISCIPLINE_DEFAULT_BEHAVIOR_OPTIONS,
      ...classroomDisciplineConfig.customBehaviors,
    ].forEach((item, index) => {
      const normalized = normalizeDisciplineBehavior(item, index);
      const behaviorId = String(normalized?.id || "").trim();
      if (!normalized || !behaviorId || seen.has(behaviorId)) return;
      seen.add(behaviorId);
      merged.push(normalized);
    });
    return merged;
  }, [classroomDisciplineConfig.customBehaviors]);
  const disciplineBehaviorLabelMap = useMemo(
    () =>
      disciplineBehaviorOptions.reduce((result, item) => {
        result[item.id] = item.label;
        return result;
      }, {}),
    [disciplineBehaviorOptions],
  );
  const disciplineLessonSummaryByLessonId = useMemo(
    () =>
      Object.entries(classroomDisciplineConfig.recordsByLesson || {}).reduce(
        (result, [lessonId, lessonRecords]) => {
          const studentRecords =
            lessonRecords && typeof lessonRecords === "object"
              ? lessonRecords
              : {};
          const studentIds = Object.keys(studentRecords);
          const totalCount = studentIds.reduce(
            (total, studentId) =>
              total + getDisciplineRecordTotalCount(studentRecords[studentId]),
            0,
          );
          result[lessonId] = {
            studentCount: studentIds.filter(
              (studentId) =>
                getDisciplineRecordTotalCount(studentRecords[studentId]) > 0,
            ).length,
            totalCount,
          };
          return result;
        },
        {},
      ),
    [classroomDisciplineConfig.recordsByLesson],
  );
  const selectedDisciplineLessonId = String(selectedCourse?.id || "").trim();
  const selectedDisciplineLessonRecords = useMemo(
    () =>
      selectedDisciplineLessonId &&
      classroomDisciplineConfig.recordsByLesson &&
      typeof classroomDisciplineConfig.recordsByLesson === "object"
        ? classroomDisciplineConfig.recordsByLesson[
            selectedDisciplineLessonId
          ] || {}
        : {},
    [classroomDisciplineConfig.recordsByLesson, selectedDisciplineLessonId],
  );
  const selectedDisciplineClassName = useMemo(() => {
    const className = String(selectedCourse?.className || "").trim();
    return COURSE_TARGET_CLASS_VALUES.includes(className) ? className : "";
  }, [selectedCourse?.className]);
  const disciplineRosterStudents = useMemo(
    () =>
      userDirectoryItems
        .filter(
          (item) =>
            String(item?.role || "")
              .trim()
              .toLowerCase() === "user",
        )
        .filter(
          (item) =>
            String(item?.profile?.className || "").trim() ===
            selectedDisciplineClassName,
        )
        .sort(compareDirectoryStudentItems),
    [selectedDisciplineClassName, userDirectoryItems],
  );
  const disciplineAllStudentCards = useMemo(
    () =>
      disciplineRosterStudents
        .map((student) => {
          const studentId = String(student?.id || "").trim();
          const record = normalizeDisciplineStudentRecord(
            selectedDisciplineLessonRecords[studentId],
          );
          const totalCount = getDisciplineRecordTotalCount(record);
          const behaviorCounts = Object.entries(record.countsByBehavior)
            .map(([behaviorId, count]) => ({
              behaviorId,
              count,
              label: disciplineBehaviorLabelMap[behaviorId] || behaviorId,
            }))
            .sort((a, b) => {
              if (b.count !== a.count) return b.count - a.count;
              return String(a.label || "").localeCompare(
                String(b.label || ""),
                "zh-CN",
                {
                  sensitivity: "base",
                },
              );
            });
          return {
            user: student,
            userId: studentId,
            totalCount,
            behaviorCounts,
          };
        })
        .sort((left, right) => {
          if (right.totalCount !== left.totalCount) {
            return right.totalCount - left.totalCount;
          }
          return compareDirectoryStudentItems(left.user, right.user);
        }),
    [
      disciplineBehaviorLabelMap,
      disciplineRosterStudents,
      selectedDisciplineLessonRecords,
    ],
  );
  const disciplineStudentCards = useMemo(() => {
    const keyword = String(disciplineStudentKeyword || "")
      .trim()
      .toLowerCase();
    if (!keyword) return disciplineAllStudentCards;
    return disciplineAllStudentCards.filter((item) =>
      [
        item?.user?.profile?.name,
        item?.user?.username,
        item?.user?.profile?.studentId,
        item?.user?.profile?.className,
      ].some((token) =>
        String(token || "")
          .toLowerCase()
          .includes(keyword),
      ),
    );
  }, [disciplineAllStudentCards, disciplineStudentKeyword]);
  useEffect(() => {
    if (disciplineAllStudentCards.length === 0) {
      if (selectedDisciplineStudentId) setSelectedDisciplineStudentId("");
      return;
    }
    const hasSelectedStudent = disciplineAllStudentCards.some(
      (item) =>
        String(item.userId || "").trim() ===
        String(selectedDisciplineStudentId || "").trim(),
    );
    if (hasSelectedStudent) return;
    setSelectedDisciplineStudentId(
      String(disciplineAllStudentCards[0]?.userId || ""),
    );
  }, [disciplineAllStudentCards, selectedDisciplineStudentId]);
  const classroomSeatClassOptions = useMemo(() => {
    const mapping = new Map();
    const appendClass = (className) => {
      const safeClassName = String(className || "").trim();
      if (!safeClassName) return;
      if (!COURSE_TARGET_CLASS_VALUES.includes(safeClassName)) return;
      const key = toClassNameKey(safeClassName);
      if (!key || mapping.has(key)) return;
      mapping.set(key, safeClassName);
    };

    appendClass(selectedCourse?.className);
    TARGET_CLASS_NAMES.forEach((className) => appendClass(className));
    userDirectoryTargetClasses.forEach((className) => appendClass(className));
    userDirectoryItems.forEach((item) => {
      if (
        String(item?.role || "")
          .trim()
          .toLowerCase() !== "user"
      )
        return;
      appendClass(item?.profile?.className);
    });

    return Array.from(mapping.values()).map((className) => ({
      value: className,
      label: className,
    }));
  }, [
    selectedCourse?.className,
    userDirectoryItems,
    userDirectoryTargetClasses,
  ]);

  const randomRollcallClassOptions = useMemo(
    () => [{ value: "all", label: "全部班级" }, ...classroomSeatClassOptions],
    [classroomSeatClassOptions],
  );
  const randomRollcallSourceOptions = useMemo(
    () => [
      { value: "seat", label: "固定座位（已填写）" },
      { value: "directory", label: "用户信息中的学生" },
      { value: "online", label: "当前在线学生" },
    ],
    [],
  );

  useEffect(() => {
    if (classroomSeatClassOptions.length === 0) return;
    setSeatManageClassName((current) => {
      const safeCurrent = String(current || "").trim();
      if (
        safeCurrent &&
        classroomSeatClassOptions.some((option) => option.value === safeCurrent)
      ) {
        return safeCurrent;
      }
      const preferredClassName = String(selectedCourse?.className || "").trim();
      if (
        preferredClassName &&
        classroomSeatClassOptions.some(
          (option) => option.value === preferredClassName,
        )
      ) {
        return preferredClassName;
      }
      return String(classroomSeatClassOptions[0]?.value || "");
    });
  }, [classroomSeatClassOptions, selectedCourse?.className]);

  useEffect(() => {
    const safeClassName = String(seatManageClassName || "").trim();
    if (!safeClassName) return;
    setSeatLayoutsByClass((current) => {
      if (current[safeClassName]) return current;
      return {
        ...current,
        [safeClassName]: normalizeSeatLayout(null),
      };
    });
  }, [seatManageClassName]);

  useEffect(() => {
    if (randomRollcallClassOptions.length === 0) return;
    setRandomRollcallClassName((current) => {
      const safeCurrent = String(current || "").trim();
      if (
        safeCurrent &&
        randomRollcallClassOptions.some(
          (option) => option.value === safeCurrent,
        )
      ) {
        return safeCurrent;
      }
      return "all";
    });
  }, [randomRollcallClassOptions]);

  const currentSeatLayout = useMemo(
    () => normalizeSeatLayout(seatLayoutsByClass[seatManageClassName]),
    [seatLayoutsByClass, seatManageClassName],
  );
  const currentSeatFilledCount = useMemo(
    () =>
      currentSeatLayout.seats.reduce(
        (count, seatValue) =>
          String(seatValue || "").trim() ? count + 1 : count,
        0,
      ),
    [currentSeatLayout.seats],
  );
  const currentSeatStudentFillEnabled = useMemo(
    () => !!currentSeatLayout.studentFillEnabled,
    [currentSeatLayout.studentFillEnabled],
  );
  const currentSeatTeacherLocked = useMemo(
    () => !!currentSeatLayout.teacherLocked,
    [currentSeatLayout.teacherLocked],
  );
  const currentSeatStudentWritable = useMemo(
    () => currentSeatStudentFillEnabled && !currentSeatTeacherLocked,
    [currentSeatStudentFillEnabled, currentSeatTeacherLocked],
  );

  const randomRollcallScopeKey = useMemo(
    () => `${randomRollcallSource}::${randomRollcallClassName}`,
    [randomRollcallClassName, randomRollcallSource],
  );
  const randomRollcallUsedSet = useMemo(
    () =>
      new Set(
        Array.isArray(randomRollcallUsedByScope[randomRollcallScopeKey])
          ? randomRollcallUsedByScope[randomRollcallScopeKey]
          : [],
      ),
    [randomRollcallScopeKey, randomRollcallUsedByScope],
  );
  const randomRollcallSeatPool = useMemo(() => {
    const classNames =
      randomRollcallClassName === "all"
        ? Object.keys(seatLayoutsByClass)
        : [randomRollcallClassName];
    const result = [];
    const dedupe = new Set();
    classNames.forEach((className) => {
      const safeClassName = String(className || "").trim();
      if (!safeClassName) return;
      const layout = normalizeSeatLayout(seatLayoutsByClass[safeClassName]);
      layout.seats.forEach((seatValue, seatIndex) => {
        const safeSeatValue = String(seatValue || "").trim();
        if (!safeSeatValue) return;
        const dedupeKey = `${toClassNameKey(safeClassName)}::${safeSeatValue.toLowerCase()}`;
        if (dedupe.has(dedupeKey)) return;
        dedupe.add(dedupeKey);
        const rowNumber = Math.floor(seatIndex / layout.columns) + 1;
        const columnNumber = (seatIndex % layout.columns) + 1;
        result.push({
          key: dedupeKey,
          label: safeSeatValue,
          className: safeClassName,
          hint: `${safeClassName} ${rowNumber}-${columnNumber}`,
        });
      });
    });
    return result;
  }, [randomRollcallClassName, seatLayoutsByClass]);
  const randomRollcallDirectoryPool = useMemo(
    () =>
      userDirectoryItems
        .filter(
          (item) =>
            String(item?.role || "")
              .trim()
              .toLowerCase() === "user",
        )
        .filter((item) => {
          if (randomRollcallClassName === "all") return true;
          return (
            String(item?.profile?.className || "").trim() ===
            randomRollcallClassName
          );
        })
        .map((item, index) => {
          const userId = String(item?.id || "").trim();
          const username = String(item?.username || "").trim();
          const name = String(item?.profile?.name || "").trim();
          const studentId = String(item?.profile?.studentId || "").trim();
          const className = String(item?.profile?.className || "").trim();
          return {
            key: userId || `${username || "user"}-${index + 1}`,
            label: name || username || "未命名学生",
            className: className || "未填写班级",
            hint: studentId || username || "-",
          };
        }),
    [randomRollcallClassName, userDirectoryItems],
  );
  const randomRollcallOnlinePool = useMemo(
    () =>
      detailedOnlineUsers
        .filter((item) => {
          if (randomRollcallClassName === "all") return true;
          return (
            String(item?.profile?.className || "").trim() ===
            randomRollcallClassName
          );
        })
        .map((item, index) => {
          const userId = String(item?.userId || "").trim();
          const username = String(item?.username || "").trim();
          const name = String(item?.profile?.name || "").trim();
          const studentId = String(item?.profile?.studentId || "").trim();
          const className = String(item?.profile?.className || "").trim();
          return {
            key: userId || `${username || "online"}-${index + 1}`,
            label: name || username || "未命名学生",
            className: className || "未填写班级",
            hint: studentId || username || "-",
          };
        }),
    [detailedOnlineUsers, randomRollcallClassName],
  );
  const randomRollcallPool = useMemo(() => {
    if (randomRollcallSource === "online") return randomRollcallOnlinePool;
    if (randomRollcallSource === "directory")
      return randomRollcallDirectoryPool;
    return randomRollcallSeatPool;
  }, [
    randomRollcallDirectoryPool,
    randomRollcallOnlinePool,
    randomRollcallSeatPool,
    randomRollcallSource,
  ]);
  const randomRollcallAvailablePool = useMemo(
    () =>
      randomRollcallNoRepeat
        ? randomRollcallPool.filter(
            (item) => !randomRollcallUsedSet.has(item.key),
          )
        : randomRollcallPool,
    [randomRollcallNoRepeat, randomRollcallPool, randomRollcallUsedSet],
  );

  useEffect(() => {
    setRandomRollcallError("");
  }, [
    randomRollcallClassName,
    randomRollcallCount,
    randomRollcallNoRepeat,
    randomRollcallSource,
  ]);

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

  function onOpenRenameLessonDialog(course) {
    const target = course || selectedCourse;
    if (!target) return;
    setRenameLessonDialog({
      open: true,
      lessonId: String(target.id || ""),
      value: String(target.courseName || "").trim(),
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
    const safePatch = patch && typeof patch === "object" ? { ...patch } : {};
    if (Object.prototype.hasOwnProperty.call(safePatch, "className")) {
      safePatch.className = normalizeLessonClassName(safePatch.className);
    }
    setTeacherCoursePlans((current) =>
      current.map((item) =>
        String(item?.id || "") === String(selectedCourseId || "")
          ? {
              ...item,
              ...safePatch,
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
    const currentTasks = Array.isArray(selectedCourse.tasks)
      ? selectedCourse.tasks
      : [];
    onUpdateSelectedLesson({ tasks: [...currentTasks, nextTask] });
    setSelectedTaskId(String(nextTask.id));
  }

  function onUpdateSelectedTask(taskId, patch) {
    if (!selectedCourse) return;
    const currentTasks = Array.isArray(selectedCourse.tasks)
      ? selectedCourse.tasks
      : [];
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
      content: stringifyTaskLinkContent(
        nextLinks.length > 0 ? nextLinks : [""],
      ),
    });
  }

  function onRemoveTaskFromSelectedLesson(taskId) {
    if (!selectedCourse) return;
    const currentTasks = Array.isArray(selectedCourse.tasks)
      ? selectedCourse.tasks
      : [];
    const safeTaskId = String(taskId || "");
    const removeIndex = currentTasks.findIndex(
      (task) => String(task?.id || "") === safeTaskId,
    );
    if (removeIndex < 0) return;
    const nextTasks = currentTasks.filter(
      (task) => String(task?.id || "") !== safeTaskId,
    );
    onUpdateSelectedLesson({ tasks: nextTasks });
    if (String(selectedTaskId || "") === safeTaskId) {
      const fallbackTask =
        nextTasks[removeIndex] || nextTasks[removeIndex - 1] || null;
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
      .map((item, index) =>
        deletedIdSet.has(String(item?.id || "")) ? index : -1,
      )
      .filter((index) => index >= 0);
    const anchorIndex =
      deletedIndexes.length > 0 ? Math.min(...deletedIndexes) : 0;

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
      const fallback =
        sortedAfterDelete[
          Math.min(anchorIndex - 1, sortedAfterDelete.length - 1)
        ];
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
        error: `请输入"确认删除"以继续删除操作。`,
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
    const maxScrollTop = Math.max(
      0,
      scrollEl.scrollHeight - scrollEl.clientHeight,
    );
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

  const persistClassroomConfig = useCallback(
    async ({ silent = false } = {}) => {
      if (!adminToken || saving) return false;
      if (!silent) setError("");
      if (!silent) setClassroomSaveNotice("");
      setSaving(true);
      const plansToSave = normalizeLessonPlans(teacherCoursePlans);
      try {
        const data = await saveAdminClassroomPlans(adminToken, {
          shangguanClassTaskProductImprovementEnabled: !!productTaskEnabled,
          teacherCoursePlans: plansToSave,
          classroomDisciplineConfig,
        });
        const savedPlans = Array.isArray(data?.teacherCoursePlans)
          ? data.teacherCoursePlans
          : [];
        const normalizedPlans = normalizeLessonPlans(savedPlans);
        const nextProductEnabled =
          !!data?.shangguanClassTaskProductImprovementEnabled;
        const normalizedDisciplineConfig = normalizeDisciplineConfig(
          data?.classroomDisciplineConfig,
        );
        setTeacherCoursePlans(normalizedPlans);
        setClassroomDisciplineConfig(normalizedDisciplineConfig);
        if (
          normalizedPlans.length > 0 &&
          !normalizedPlans.some((item) => item?.id === selectedCourseId)
        ) {
          setSelectedCourseId(
            String(sortLessonPlans(normalizedPlans)[0]?.id || ""),
          );
        }
        setProductTaskEnabled(nextProductEnabled);
        setClassroomUpdatedAt(
          String(data?.updatedAt || new Date().toISOString()),
        );
        classroomConfigSavedSnapshotRef.current = buildClassroomConfigSnapshot({
          productTaskEnabled: nextProductEnabled,
          teacherCoursePlans: normalizedPlans,
          classroomDisciplineConfig: normalizedDisciplineConfig,
        });
        if (!silent) {
          setClassroomSaveNotice("课堂配置已保存。");
        }
        void loadHomeworkOverview();
        return true;
      } catch (rawError) {
        if (handleAuthError(rawError)) return false;
        setError(readErrorMessage(rawError));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      adminToken,
      handleAuthError,
      loadHomeworkOverview,
      productTaskEnabled,
      saving,
      selectedCourseId,
      classroomDisciplineConfig,
      teacherCoursePlans,
    ],
  );

  const persistFinalTestConfig = useCallback(
    async ({ silent = false } = {}) => {
      if (!adminToken || finalTestSaving) return false;
      if (!silent) setError("");
      if (!silent) setClassroomSaveNotice("");
      setFinalTestSaving(true);
      try {
        const data = await saveAdminFinalTestConfig(adminToken, {
          finalTestConfig,
        });
        const normalizedFinalTestConfig = normalizeFinalTestContentConfig(
          data?.finalTestConfig,
        );
        setFinalTestConfig(normalizedFinalTestConfig);
        setClassroomUpdatedAt(
          String(data?.updatedAt || new Date().toISOString()),
        );
        finalTestConfigSavedSnapshotRef.current = buildFinalTestConfigSnapshot(
          normalizedFinalTestConfig,
        );
        if (!silent) {
          setClassroomSaveNotice("期末测试内容已保存。");
        }
        return true;
      } catch (rawError) {
        if (handleAuthError(rawError)) return false;
        setError(readErrorMessage(rawError));
        return false;
      } finally {
        setFinalTestSaving(false);
      }
    },
    [adminToken, finalTestConfig, finalTestSaving, handleAuthError],
  );

  async function onSaveClassroomConfig() {
    await persistClassroomConfig({ silent: false });
  }

  async function onSaveFinalTestConfig() {
    await persistFinalTestConfig({ silent: false });
  }

  function updateFinalTestTaskAt(taskIndex, updater) {
    setFinalTestConfig((current) => {
      const tasks = Array.isArray(current?.tasks) ? current.tasks : [];
      const nextTasks = tasks.map((task, index) => {
        if (index !== taskIndex) return task;
        return updater(task, index);
      });
      return normalizeFinalTestContentConfig({
        ...current,
        tasks: nextTasks,
      });
    });
  }

  function addFinalTestTask() {
    setFinalTestConfig((current) => {
      const tasks = Array.isArray(current?.tasks) ? current.tasks : [];
      return normalizeFinalTestContentConfig({
        ...current,
        tasks: [...tasks, createTeacherFinalTestTaskDraft(tasks.length)],
      });
    });
  }

  function removeFinalTestTask(taskIndex) {
    setFinalTestConfig((current) => {
      const tasks = Array.isArray(current?.tasks) ? current.tasks : [];
      const nextTasks = tasks.filter((_, index) => index !== taskIndex);
      return normalizeFinalTestContentConfig({
        ...current,
        tasks:
          nextTasks.length > 0
            ? nextTasks
            : [createTeacherFinalTestTaskDraft(0)],
      });
    });
  }

  function onSelectTaskFiles(event) {
    const sourceFiles = Array.from(event?.target?.files || []);
    event.target.value = "";
    if (!selectedTaskUploadScopeKey || sourceFiles.length === 0) return;
    const result = appendTeacherTaskUploadDrafts(
      selectedTaskUploadDrafts,
      sourceFiles,
    );
    setError("");
    if (result.error) {
      setError(result.error);
      return;
    }
    setTaskUploadDraftsByScope((current) => ({
      ...current,
      [selectedTaskUploadScopeKey]: result.drafts,
    }));
  }

  function onRemoveTaskUploadDraft(localId) {
    const safeLocalId = String(localId || "").trim();
    if (!selectedTaskUploadScopeKey || !safeLocalId || uploadingFiles) return;
    setTaskUploadDraftsByScope((current) => {
      const currentDrafts = Array.isArray(current[selectedTaskUploadScopeKey])
        ? current[selectedTaskUploadScopeKey]
        : [];
      return {
        ...current,
        [selectedTaskUploadScopeKey]: removeTeacherTaskUploadDraft(
          currentDrafts,
          safeLocalId,
        ),
      };
    });
  }

  async function onUploadQueuedTaskFiles() {
    const safeLessonId = String(selectedCourseId || "").trim();
    const safeTaskId = String(selectedTaskId || "").trim();
    if (
      !adminToken ||
      !selectedTaskUploadScopeKey ||
      !safeLessonId ||
      !safeTaskId ||
      selectedTaskUploadDrafts.length === 0 ||
      uploadingFiles
    ) {
      return;
    }
    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;
    setUploadingFiles(true);
    setError("");
    setTaskUploadDraftsByScope((current) => {
      const currentDrafts = Array.isArray(current[selectedTaskUploadScopeKey])
        ? current[selectedTaskUploadScopeKey]
        : [];
      return {
        ...current,
        [selectedTaskUploadScopeKey]:
          markTeacherTaskUploadDraftsUploading(currentDrafts),
      };
    });
    try {
      const ensuredSaved = await persistClassroomConfig({ silent: true });
      if (!ensuredSaved) {
        setTaskUploadDraftsByScope((current) => {
          const currentDrafts = Array.isArray(
            current[selectedTaskUploadScopeKey],
          )
            ? current[selectedTaskUploadScopeKey]
            : [];
          return {
            ...current,
            [selectedTaskUploadScopeKey]: markTeacherTaskUploadDraftsFailed(
              currentDrafts,
              "保存课堂配置失败，请稍后重试。",
            ),
          };
        });
        return;
      }
      const data = await uploadAdminClassroomTaskFiles(
        adminToken,
        safeLessonId,
        safeTaskId,
        selectedTaskUploadDrafts.map((item) => item.file).filter(Boolean),
        abortController.signal,
      );
      const plans = Array.isArray(data?.teacherCoursePlans)
        ? data.teacherCoursePlans
        : [];
      const normalizedPlans = normalizeLessonPlans(plans);
      setTeacherCoursePlans(normalizedPlans);
      setClassroomUpdatedAt(
        String(data?.updatedAt || new Date().toISOString()),
      );
      classroomConfigSavedSnapshotRef.current = buildClassroomConfigSnapshot({
        productTaskEnabled,
        teacherCoursePlans: normalizedPlans,
        classroomDisciplineConfig,
      });
      setTaskUploadDraftsByScope((current) => ({
        ...current,
        [selectedTaskUploadScopeKey]: [],
      }));
    } catch (rawError) {
      const aborted = rawError?.name === "AbortError";
      const message = aborted ? "上传已取消。" : readErrorMessage(rawError);
      setTaskUploadDraftsByScope((current) => {
        const currentDrafts = Array.isArray(current[selectedTaskUploadScopeKey])
          ? current[selectedTaskUploadScopeKey]
          : [];
        return {
          ...current,
          [selectedTaskUploadScopeKey]: markTeacherTaskUploadDraftsFailed(
            currentDrafts,
            message,
          ),
        };
      });
      if (!aborted && handleAuthError(rawError)) return;
      if (!aborted) setError(message);
    } finally {
      uploadAbortControllerRef.current = null;
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
      const plans = Array.isArray(data?.teacherCoursePlans)
        ? data.teacherCoursePlans
        : [];
      const normalizedPlans = normalizeLessonPlans(plans);
      setTeacherCoursePlans(normalizedPlans);
      setClassroomUpdatedAt(
        String(data?.updatedAt || new Date().toISOString()),
      );
      classroomConfigSavedSnapshotRef.current = buildClassroomConfigSnapshot({
        productTaskEnabled,
        teacherCoursePlans: normalizedPlans,
        classroomDisciplineConfig,
      });
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
        triggerUrlDownload(
          data.downloadUrl,
          data.filename ||
            file?.name ||
            getClassroomFileFallbackName(CLASSROOM_FILE_KIND_TASK),
        );
      } else if (data?.blob) {
        triggerBrowserDownload(
          data.blob,
          data.filename ||
            file?.name ||
            getClassroomFileFallbackName(CLASSROOM_FILE_KIND_TASK),
        );
      } else {
        throw new Error(
          getClassroomFileDownloadErrorText(CLASSROOM_FILE_KIND_TASK),
        );
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
        triggerUrlDownload(
          data.downloadUrl,
          data.filename || file?.name || "作业文件.bin",
        );
      } else if (data?.blob) {
        triggerBrowserDownload(
          data.blob,
          data.filename || file?.name || "作业文件.bin",
        );
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

  async function onExportHomeworkLessonFiles() {
    if (!adminToken || !selectedHomeworkLesson) return;
    const lessonId = String(selectedHomeworkLesson.id || "").trim();
    if (!lessonId) return;
    setExportingHomeworkLessonId(lessonId);
    setError("");
    try {
      const data = await exportAdminClassroomHomeworkLessonZip(
        adminToken,
        lessonId,
      );
      const fallbackName = `${selectedHomeworkLesson.courseName || "课时"}-作业批量导出.zip`;
      triggerBrowserDownload(data.blob, data.filename || fallbackName);
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setExportingHomeworkLessonId("");
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

  async function onBackfillImageLibraryThumbnails() {
    if (!adminToken || imageLibraryBackfillLoading) return;
    setImageLibraryBackfillLoading(true);
    setError("");
    setImageLibraryNotice("");
    try {
      const result = await backfillAdminGeneratedImageThumbnails(adminToken, {
        limit: 100,
      });
      const selectedCount = Number(result?.selectedCount || 0);
      const successCount = Number(result?.successCount || 0);
      const failedCount = Number(result?.failedCount || 0);
      if (selectedCount <= 0) {
        setImageLibraryNotice("当前图片库的缩略图已是最新。");
      } else if (failedCount > 0) {
        setImageLibraryNotice(
          `缩略图回填完成：成功 ${successCount} 张，失败 ${failedCount} 张。`,
        );
      } else {
        setImageLibraryNotice(`缩略图回填完成：已处理 ${successCount} 张。`);
      }
      await loadImageLibrary(imageLibraryKeyword);
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setImageLibraryBackfillLoading(false);
    }
  }

  function onSubmitUserDirectorySearch(event) {
    if (event) event.preventDefault();
    setUserDirectoryKeyword(String(userDirectorySearchInput || "").trim());
  }

  function onClearUserDirectoryFilters() {
    setUserDirectorySearchInput("");
    setUserDirectoryKeyword("");
    setUserDirectoryRoleFilter("all");
    setUserDirectoryClassFilter("all");
    setUserDirectorySortBy("updated");
  }

  function onRefreshUserDirectory() {
    if (isTerminalAdmin && userDirectoryHasUnsavedChanges) {
      const confirmed = window.confirm(
        "当前有未保存修改，刷新后将丢失本地修改，是否继续？",
      );
      if (!confirmed) return;
    }
    void loadUserDirectory();
  }

  async function onSaveUserDirectoryChanges() {
    if (!isTerminalAdmin || !adminToken || userDirectorySavingChanges) return;
    const pendingEditEntries = Object.entries(userDirectoryPendingEdits).filter(
      ([userId, payload]) =>
        String(userId || "").trim() && payload && typeof payload === "object",
    );
    const pendingDeleteIds = userDirectoryPendingDeleteIds.filter((userId) =>
      String(userId || "").trim(),
    );
    if (pendingEditEntries.length === 0 && pendingDeleteIds.length === 0)
      return;

    const remainingEdits = Object.fromEntries(pendingEditEntries);
    const remainingDeleteIds = [...pendingDeleteIds];
    setUserDirectorySavingChanges(true);
    setError("");
    try {
      for (const [userId, payload] of pendingEditEntries) {
        await updateAdminUserDirectoryUser(adminToken, userId, payload);
        delete remainingEdits[userId];
      }
      for (const userId of pendingDeleteIds) {
        await deleteAdminUserDirectoryUser(adminToken, userId, {
          confirmText: "确认删除",
        });
        const index = remainingDeleteIds.indexOf(userId);
        if (index >= 0) remainingDeleteIds.splice(index, 1);
      }
      setUserDirectoryPendingEdits({});
      setUserDirectoryPendingDeleteIds([]);
      await loadUserDirectory();
    } catch (rawError) {
      setUserDirectoryPendingEdits(remainingEdits);
      setUserDirectoryPendingDeleteIds(remainingDeleteIds);
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setUserDirectorySavingChanges(false);
    }
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
    const role = String(member?.role || "")
      .trim()
      .toLowerCase();
    const roleLabel =
      role === "admin" ? "管理员" : role === "user" ? "学生" : "成员";
    const detailParts = [roleLabel];
    if (className) detailParts.push(className);
    if (studentId) detailParts.push(studentId);
    if (username) detailParts.push(`@${username}`);
    return `${displayName}（${detailParts.join(" · ")}）`;
  }

  function closePartyRoomCreateDialog() {
    setPartyRoomCreateDialog({
      open: false,
      name: "",
      ownerUserId: "",
      memberUserIds: [],
      memberKeyword: "",
      error: "",
      saving: false,
    });
  }

  function openPartyRoomCreateDialog() {
    const ownerOptions = Array.isArray(partyRoomCreateOwnerOptions)
      ? partyRoomCreateOwnerOptions
      : [];
    if (ownerOptions.length === 0) {
      setError("暂无可选账号，请刷新后重试。");
      return;
    }
    const defaultOwner =
      ownerOptions.find((item) => item.role === "admin") || ownerOptions[0];
    const ownerUserId = String(defaultOwner?.id || "").trim();
    setPartyRoomCreateDialog({
      open: true,
      name: "",
      ownerUserId,
      memberUserIds: ownerUserId ? [ownerUserId] : [],
      memberKeyword: "",
      error: "",
      saving: false,
    });
  }

  function onChangePartyRoomCreateOwner(ownerUserId) {
    const safeOwnerUserId = String(ownerUserId || "").trim();
    setPartyRoomCreateDialog((current) => {
      const currentMembers = Array.isArray(current.memberUserIds)
        ? current.memberUserIds
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      const nextMemberSet = new Set(currentMembers);
      if (safeOwnerUserId) nextMemberSet.add(safeOwnerUserId);
      return {
        ...current,
        ownerUserId: safeOwnerUserId,
        memberUserIds: Array.from(nextMemberSet),
        error: "",
      };
    });
  }

  function onTogglePartyRoomCreateMember(memberUserId) {
    const safeMemberUserId = String(memberUserId || "").trim();
    if (!safeMemberUserId) return;
    setPartyRoomCreateDialog((current) => {
      const ownerUserId = String(current.ownerUserId || "").trim();
      if (ownerUserId && safeMemberUserId === ownerUserId) return current;
      const currentMembers = Array.isArray(current.memberUserIds)
        ? current.memberUserIds
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      const nextMemberSet = new Set(currentMembers);
      if (ownerUserId) nextMemberSet.add(ownerUserId);
      if (nextMemberSet.has(safeMemberUserId)) {
        nextMemberSet.delete(safeMemberUserId);
      } else {
        if (nextMemberSet.size >= PARTY_ROOM_CREATE_MAX_MEMBERS) {
          return {
            ...current,
            error: `群成员最多 ${PARTY_ROOM_CREATE_MAX_MEMBERS} 人（含群主）。`,
          };
        }
        nextMemberSet.add(safeMemberUserId);
      }
      return {
        ...current,
        memberUserIds: Array.from(nextMemberSet),
        error: "",
      };
    });
  }

  async function onSubmitPartyRoomCreateDialog(event) {
    if (event) event.preventDefault();
    if (!adminToken) return;

    const roomName = String(partyRoomCreateDialog.name || "").trim();
    const ownerUserId = String(partyRoomCreateDialog.ownerUserId || "").trim();
    const memberUserIds = Array.isArray(partyRoomCreateDialog.memberUserIds)
      ? partyRoomCreateDialog.memberUserIds
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [];
    const memberIdSet = new Set(memberUserIds);
    if (ownerUserId) memberIdSet.add(ownerUserId);
    const finalMemberUserIds = Array.from(memberIdSet);

    if (!roomName) {
      setPartyRoomCreateDialog((current) => ({
        ...current,
        error: "请输入群聊名称。",
      }));
      return;
    }
    if (!ownerUserId) {
      setPartyRoomCreateDialog((current) => ({
        ...current,
        error: "请选择群主账号。",
      }));
      return;
    }
    if (finalMemberUserIds.length === 0) {
      setPartyRoomCreateDialog((current) => ({
        ...current,
        error: "请至少选择 1 位群成员。",
      }));
      return;
    }
    if (finalMemberUserIds.length > PARTY_ROOM_CREATE_MAX_MEMBERS) {
      setPartyRoomCreateDialog((current) => ({
        ...current,
        error: `群成员最多 ${PARTY_ROOM_CREATE_MAX_MEMBERS} 人（含群主）。`,
      }));
      return;
    }

    setPartyRoomCreateDialog((current) => ({
      ...current,
      saving: true,
      error: "",
    }));
    setError("");
    try {
      await createAdminGroupChatRoom(adminToken, {
        name: roomName,
        ownerUserId,
        memberUserIds: finalMemberUserIds,
      });
      closePartyRoomCreateDialog();
      await loadPartyRoomManage();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setPartyRoomCreateDialog((current) => ({
        ...current,
        saving: false,
        error: readErrorMessage(rawError),
      }));
    }
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

  async function onDissolvePartyRoom(room) {
    const roomId = String(room?.id || "").trim();
    if (!roomId || !adminToken) {
      setError("无效派信息，暂无法解散。");
      return;
    }

    const roomName = String(room?.name || "未命名派").trim() || "未命名派";
    const roomCode = String(room?.roomCode || "").trim();

    const firstConfirmed = window.confirm(
      `你将解散派「${roomName}」${roomCode ? `（${roomCode}）` : ""}，解散后成员与消息将被清理。`,
    );
    if (!firstConfirmed) return;

    const secondConfirmed =
      window.confirm("请再次确认：确定要永久解散这个派吗？");
    if (!secondConfirmed) return;

    setError("");
    setDissolvingPartyRoomId(roomId);
    try {
      await dissolveAdminGroupChatRoom(adminToken, roomId);
      setCopiedPartyRoomId((current) => (current === roomId ? "" : current));
      await loadPartyRoomManage();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setDissolvingPartyRoomId("");
    }
  }

  async function onToggleClassroomMonitoring(room) {
    const roomId = String(room?.id || "").trim();
    if (!roomId || !adminToken || updatingMonitoringRoomId) return;
    const nextEnabled = room?.paiaMonitoringEnabled !== true;
    setError("");
    setUpdatingMonitoringRoomId(roomId);
    try {
      const data = await updateAdminCollaborationClassroomMonitoring(
        adminToken,
        roomId,
        nextEnabled,
      );
      setPartyRoomItems((current) =>
        current.map((item) =>
          String(item?.id || "").trim() === roomId
            ? {
                ...item,
                paiaMonitoringEnabled: data?.monitoring?.enabled === true,
                paiaMonitoringStartedAt: String(
                  data?.monitoring?.startedAt || "",
                ),
                paiaMonitoringUpdatedAt: String(
                  data?.monitoring?.updatedAt || "",
                ),
              }
            : item,
        ),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setUpdatingMonitoringRoomId("");
    }
  }

  function closeUserCreateDialog() {
    setUserCreateDialog({
      open: false,
      username: "",
      password: "",
      name: "",
      studentId: "",
      className: "",
      grade: "",
      gender: "",
      bindTeacher: false,
      lockedTeacherScopeKey: USER_CREATE_DEFAULT_TEACHER_SCOPE_KEY,
      error: "",
      saving: false,
    });
  }

  function openUserCreateDialog() {
    if (!isTerminalAdmin) return;
    setUserCreateDialog({
      open: true,
      username: "",
      password: "",
      name: "",
      studentId: "",
      className: "",
      grade: "",
      gender: "",
      bindTeacher: false,
      lockedTeacherScopeKey: USER_CREATE_DEFAULT_TEACHER_SCOPE_KEY,
      error: "",
      saving: false,
    });
  }

  async function onSubmitUserCreateDialog(event) {
    if (event) event.preventDefault();
    if (!isTerminalAdmin || !adminToken) return;

    const username = String(userCreateDialog.username || "").trim();
    const password = String(userCreateDialog.password || "");
    const name = String(userCreateDialog.name || "").trim();
    const studentId = String(userCreateDialog.studentId || "").trim();
    const className = String(userCreateDialog.className || "").trim();
    const grade = String(userCreateDialog.grade || "").trim();
    const gender = String(userCreateDialog.gender || "").trim();
    const forcedTeacherScopeKey =
      resolveForcedTeacherScopeKeyByClassName(className);
    const bindTeacher = forcedTeacherScopeKey
      ? true
      : !!userCreateDialog.bindTeacher;
    const lockedTeacherScopeKey = String(
      forcedTeacherScopeKey || userCreateDialog.lockedTeacherScopeKey || "",
    ).trim();

    if (!username || !password || !name || !studentId || !className) {
      setUserCreateDialog((current) => ({
        ...current,
        error: "账号、密码、姓名、学号、归属班级为必填项。",
      }));
      return;
    }
    if (bindTeacher && !lockedTeacherScopeKey) {
      setUserCreateDialog((current) => ({
        ...current,
        error: "请选择要绑定的老师。",
      }));
      return;
    }

    setUserCreateDialog((current) => ({ ...current, saving: true, error: "" }));
    try {
      const data = await createAdminUserDirectoryUser(adminToken, {
        username,
        password,
        bindTeacher,
        lockedTeacherScopeKey: bindTeacher ? lockedTeacherScopeKey : "",
        profile: {
          name,
          studentId,
          className,
          grade,
          gender,
        },
      });
      const createdUser =
        data?.user && typeof data.user === "object" ? data.user : null;
      if (createdUser) {
        setUserDirectoryItems((current) => [createdUser, ...current]);
      } else {
        await loadUserDirectory();
      }
      setUserDirectoryUpdatedAt(
        String(data?.updatedAt || new Date().toISOString()),
      );
      closeUserCreateDialog();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setUserCreateDialog((current) => ({
        ...current,
        saving: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  function closeUserClassCategoryDialog() {
    setUserClassCategoryDialog({
      open: false,
      className: "",
      error: "",
      saving: false,
    });
  }

  async function onSubmitUserClassCategoryDialog(event) {
    if (event) event.preventDefault();
    if (!isTerminalAdmin || !adminToken) return;
    const className = String(userClassCategoryDialog.className || "").trim();
    if (!className) {
      setUserClassCategoryDialog((current) => ({
        ...current,
        error: "请输入班级名称。",
      }));
      return;
    }

    setUserClassCategoryDialog((current) => ({
      ...current,
      saving: true,
      error: "",
    }));
    try {
      const data = await createAdminUserDirectoryClassCategory(adminToken, {
        className,
      });
      const targetClasses = Array.isArray(data?.targetClasses)
        ? data.targetClasses
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      const requestedClassKey = toClassNameKey(className);
      const matchedClassName =
        targetClasses.find(
          (item) => toClassNameKey(item) === requestedClassKey,
        ) || className;
      if (targetClasses.length > 0) {
        setUserDirectoryTargetClasses(targetClasses);
      }
      setUserDirectoryClassFilter(matchedClassName);
      closeUserClassCategoryDialog();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setUserClassCategoryDialog((current) => ({
        ...current,
        saving: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  function closeUserEditDialog() {
    setUserEditDialog({
      open: false,
      userId: "",
      username: "",
      name: "",
      studentId: "",
      gender: "",
      grade: "",
      className: "",
      confirmText: "",
      error: "",
      saving: false,
    });
  }

  const canManageUserDirectoryAccount = useCallback(
    (user) => {
      if (!isTerminalAdmin) return false;
      const userId = String(user?.id || "").trim();
      if (!userId) return false;
      if (userId === currentAdminUserId) return false;
      if (toAdminUsernameKey(user?.username) === TERMINAL_ADMIN_USERNAME_KEY)
        return false;
      return true;
    },
    [currentAdminUserId, isTerminalAdmin],
  );

  const openUserEditDialog = useCallback(
    (user) => {
      if (!canManageUserDirectoryAccount(user)) {
        setError("该账号不支持在此处修改。");
        return;
      }
      setUserEditDialog({
        open: true,
        userId: String(user?.id || "").trim(),
        username: String(user?.username || "").trim(),
        name: String(user?.profile?.name || "").trim(),
        studentId: String(user?.profile?.studentId || "").trim(),
        gender: String(user?.profile?.gender || "").trim(),
        grade: String(user?.profile?.grade || "").trim(),
        className: String(user?.profile?.className || "").trim(),
        confirmText: "",
        error: "",
        saving: false,
      });
    },
    [canManageUserDirectoryAccount],
  );

  function onSubmitUserEditDialog(event) {
    if (event) event.preventDefault();
    if (!isTerminalAdmin) return;
    const targetUserId = String(userEditDialog.userId || "").trim();
    if (!targetUserId) {
      closeUserEditDialog();
      return;
    }
    if (String(userEditDialog.confirmText || "").trim() !== "确认修改") {
      setUserEditDialog((current) => ({
        ...current,
        error: `请输入"确认修改"完成二次确认。`,
      }));
      return;
    }

    const editPayload = {
      username: String(userEditDialog.username || "").trim(),
      profile: {
        name: String(userEditDialog.name || "").trim(),
        studentId: String(userEditDialog.studentId || "").trim(),
        gender: String(userEditDialog.gender || "").trim(),
        grade: String(userEditDialog.grade || "").trim(),
        className: String(userEditDialog.className || "").trim(),
      },
    };
    setUserDirectoryPendingEdits((current) => ({
      ...current,
      [targetUserId]: editPayload,
    }));
    setUserDirectoryItems((current) =>
      current.map((item) => {
        const itemId = String(item?.id || "").trim();
        if (itemId !== targetUserId) return item;
        const currentProfile =
          item?.profile && typeof item.profile === "object" ? item.profile : {};
        return {
          ...item,
          username: editPayload.username,
          profile: {
            ...currentProfile,
            ...editPayload.profile,
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    closeUserEditDialog();
  }

  function closeUserDeleteDialog() {
    setUserDeleteDialog({
      open: false,
      userId: "",
      username: "",
      confirmText: "",
      error: "",
      deleting: false,
    });
  }

  const openUserDeleteDialog = useCallback(
    (user) => {
      if (!canManageUserDirectoryAccount(user)) {
        setError("该账号不支持在此处删除。");
        return;
      }
      setUserDeleteDialog({
        open: true,
        userId: String(user?.id || "").trim(),
        username: String(user?.username || "").trim(),
        confirmText: "",
        error: "",
        deleting: false,
      });
    },
    [canManageUserDirectoryAccount],
  );

  function onSubmitUserDeleteDialog(event) {
    if (event) event.preventDefault();
    if (!isTerminalAdmin) return;
    const targetUserId = String(userDeleteDialog.userId || "").trim();
    if (!targetUserId) {
      closeUserDeleteDialog();
      return;
    }
    if (String(userDeleteDialog.confirmText || "").trim() !== "确认删除") {
      setUserDeleteDialog((current) => ({
        ...current,
        error: `请输入"确认删除"完成二次确认。`,
      }));
      return;
    }

    setUserDirectoryPendingEdits((current) => {
      const next = { ...current };
      delete next[targetUserId];
      return next;
    });
    setUserDirectoryPendingDeleteIds((current) => {
      if (current.includes(targetUserId)) return current;
      return [...current, targetUserId];
    });
    setUserDirectoryItems((current) =>
      current.filter((item) => String(item?.id || "").trim() !== targetUserId),
    );
    closeUserDeleteDialog();
  }

  function closeUserMergeDialog() {
    setUserMergeDialog({
      open: false,
      sourceUserId: "",
      targetUserId: "",
      confirmText: "",
      error: "",
      merging: false,
    });
  }

  function openUserMergeDialog() {
    if (!isTerminalAdmin) return;
    if (userDirectoryHasUnsavedChanges) {
      setError("请先保存当前修改，再进行账号合并。");
      return;
    }
    const sourceUserId = String(userMergeCandidates[0]?.id || "").trim();
    const targetUserId = String(
      userMergeCandidates.find((item) => item.id !== sourceUserId)?.id || "",
    ).trim();
    setUserMergeDialog({
      open: true,
      sourceUserId,
      targetUserId,
      confirmText: "",
      error: "",
      merging: false,
    });
  }

  const userDirectoryTableRows = useMemo(
    () =>
      userDirectoryVisibleItems.map((user) => {
        const userId = String(user?.id || "").trim();
        const userRole = String(user?.role || "")
          .trim()
          .toLowerCase();
        const canManage = canManageUserDirectoryAccount(user);
        return (
          <tr
            key={
              userId ||
              `user-${String(user?.username || "").trim()}-${String(user?.updatedAt || "").trim()}`
            }
          >
            <td>{user?.username || "-"}</td>
            <td>{readUserRoleLabel(userRole)}</td>
            <td>{user?.profile?.name || "-"}</td>
            <td>{user?.profile?.studentId || "-"}</td>
            <td>{user?.profile?.className || "-"}</td>
            <td>{user?.profile?.grade || "-"}</td>
            <td>{user?.profile?.gender || "-"}</td>
            <td>{formatDisplayTime(user?.updatedAt)}</td>
            <td>
              {canManage ? (
                <div className="teacher-user-manage-row-actions">
                  <button
                    type="button"
                    className="teacher-icon-btn"
                    onClick={() => openUserEditDialog(user)}
                    title="编辑账号信息"
                    aria-label="编辑账号信息"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="teacher-icon-btn danger"
                    onClick={() => openUserDeleteDialog(user)}
                    title="删除账号"
                    aria-label="删除账号"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <span className="teacher-homework-expand-placeholder">-</span>
              )}
            </td>
          </tr>
        );
      }),
    [
      canManageUserDirectoryAccount,
      openUserDeleteDialog,
      openUserEditDialog,
      userDirectoryVisibleItems,
    ],
  );

  async function onSubmitUserMergeDialog(event) {
    if (event) event.preventDefault();
    if (!isTerminalAdmin || !adminToken) return;
    const sourceUserId = String(userMergeDialog.sourceUserId || "").trim();
    const targetUserId = String(userMergeDialog.targetUserId || "").trim();
    if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
      setUserMergeDialog((current) => ({
        ...current,
        error: "请选择两个不同的学生账号。",
      }));
      return;
    }
    if (String(userMergeDialog.confirmText || "").trim() !== "确认合并") {
      setUserMergeDialog((current) => ({
        ...current,
        error: `请输入"确认合并"完成二次确认。`,
      }));
      return;
    }

    setUserMergeDialog((current) => ({ ...current, merging: true, error: "" }));
    try {
      await mergeAdminUserDirectoryUsers(adminToken, {
        sourceUserId,
        targetUserId,
        confirmText: "确认合并",
      });
      await loadUserDirectory();
      closeUserMergeDialog();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setUserMergeDialog((current) => ({
        ...current,
        merging: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  function updateDisciplineRecord(
    lessonId,
    studentUserId,
    behaviorId,
    delta = 1,
  ) {
    const safeLessonId = String(lessonId || "").trim();
    const safeStudentUserId = String(studentUserId || "").trim();
    const safeBehaviorId = normalizeDisciplineBehaviorId(behaviorId);
    const step = Number.parseInt(String(delta || "").trim(), 10) || 0;
    if (!safeLessonId || !safeStudentUserId || !safeBehaviorId || !step) return;
    setClassroomDisciplineConfig((current) => {
      const currentConfig = normalizeDisciplineConfig(current);
      const lessonRecords = {
        ...(currentConfig.recordsByLesson[safeLessonId] || {}),
      };
      const currentRecord = normalizeDisciplineStudentRecord(
        lessonRecords[safeStudentUserId],
      );
      const nextCount = Math.max(
        0,
        (Number(currentRecord.countsByBehavior[safeBehaviorId]) || 0) + step,
      );
      const nextCountsByBehavior = {
        ...currentRecord.countsByBehavior,
      };
      if (nextCount > 0) {
        nextCountsByBehavior[safeBehaviorId] = nextCount;
      } else {
        delete nextCountsByBehavior[safeBehaviorId];
      }
      if (Object.keys(nextCountsByBehavior).length === 0) {
        delete lessonRecords[safeStudentUserId];
      } else {
        lessonRecords[safeStudentUserId] = {
          countsByBehavior: nextCountsByBehavior,
          updatedAt: new Date().toISOString(),
        };
      }
      const nextRecordsByLesson = {
        ...currentConfig.recordsByLesson,
      };
      if (Object.keys(lessonRecords).length === 0) {
        delete nextRecordsByLesson[safeLessonId];
      } else {
        nextRecordsByLesson[safeLessonId] = lessonRecords;
      }
      return {
        ...currentConfig,
        recordsByLesson: nextRecordsByLesson,
      };
    });
    setError("");
  }

  function onAddCustomDisciplineBehavior(event) {
    if (event) event.preventDefault();
    const nextBehavior = buildCustomDisciplineBehavior(disciplineDraftBehavior);
    if (!nextBehavior) {
      setError("请输入要新增的违规行为名称。");
      return;
    }
    const labelKey = String(nextBehavior.label || "")
      .trim()
      .toLowerCase();
    const exists = disciplineBehaviorOptions.some(
      (item) =>
        String(item?.label || "")
          .trim()
          .toLowerCase() === labelKey,
    );
    if (exists) {
      setError("该违规行为已存在，请勿重复添加。");
      return;
    }
    if (
      classroomDisciplineConfig.customBehaviors.length >=
      DISCIPLINE_MAX_CUSTOM_BEHAVIORS
    ) {
      setError(
        `最多支持添加 ${DISCIPLINE_MAX_CUSTOM_BEHAVIORS} 个自定义违规行为。`,
      );
      return;
    }
    setClassroomDisciplineConfig((current) => ({
      ...normalizeDisciplineConfig(current),
      customBehaviors: [
        ...normalizeDisciplineConfig(current).customBehaviors,
        nextBehavior,
      ],
    }));
    setDisciplineDraftBehavior("");
    setError("");
  }

  function onRegisterDisciplineBehavior(studentUserId, behaviorId) {
    const safeLessonId = String(selectedDisciplineLessonId || "").trim();
    const safeStudentUserId = String(studentUserId || "").trim();
    if (!safeLessonId) {
      setError("请先选择课时后再登记纪律表现。");
      return;
    }
    if (!safeStudentUserId) {
      setError("请先选择一位学生。");
      return;
    }
    updateDisciplineRecord(safeLessonId, safeStudentUserId, behaviorId, 1);
  }

  function onDecreaseDisciplineBehavior(studentUserId, behaviorId) {
    const safeLessonId = String(selectedDisciplineLessonId || "").trim();
    const safeStudentUserId = String(studentUserId || "").trim();
    if (!safeLessonId || !safeStudentUserId) return;
    updateDisciplineRecord(safeLessonId, safeStudentUserId, behaviorId, -1);
  }

  return (
    <div className="teacher-home-page">
      <div className="teacher-home-shell">
        <aside className="teacher-home-sidebar">
          <div className="teacher-home-profile">
            <div className="teacher-home-avatar">{avatarText}</div>
            <h1>教师主页</h1>
            <p>{adminProfile.username || "--"}</p>
            <dl className="teacher-home-profile-meta">
              <div>
                <dt>角色</dt>
                <dd>
                  {adminProfile.role
                    ? adminProfile.role === "admin"
                      ? "固定管理员"
                      : adminProfile.role
                    : "--"}
                </dd>
              </div>
              <div>
                <dt>最近更新</dt>
                <dd>
                  {formatDisplayTime(
                    classroomUpdatedAt || adminProfile.updatedAt,
                  )}
                </dd>
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
                  <div
                    className="teacher-home-nav-group-divider"
                    aria-hidden="true"
                  />
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
                        <span className="teacher-home-nav-label">
                          {item.label}
                        </span>
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
          {pageRefreshState === "refreshing" || pageRefreshState === "stale" ? (
            <div className={`teacher-home-refresh-banner ${pageRefreshState}`}>
              <div className="teacher-home-refresh-title">
                <RefreshCw
                  size={14}
                  className={
                    pageRefreshState === "refreshing" ? "is-spinning" : ""
                  }
                />
                <strong>
                  {pageRefreshState === "refreshing"
                    ? "正在同步最新数据..."
                    : "当前展示的是缓存内容"}
                </strong>
              </div>
              <span>
                {pageRefreshState === "refreshing"
                  ? "正在获取教师管理最新内容。"
                  : "最新数据同步失败，请稍后重试。"}
              </span>
            </div>
          ) : null}
          <div
            key={activePanel}
            className={`teacher-home-panel-stage${
              pageRefreshState === "refreshing" ? " is-refreshing" : ""
            }`}
          >
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
                    {classroomConfigHasUnsavedChanges ? (
                      <span className="teacher-user-manage-dirty-tag">
                        课时内容未保存
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() =>
                        setLessonListVisible((current) => !current)
                      }
                      data-tooltip={
                        lessonListVisible ? "隐藏课时列表" : "显示课时列表"
                      }
                      title={
                        lessonListVisible ? "隐藏课时列表" : "显示课时列表"
                      }
                      aria-label={
                        lessonListVisible ? "隐藏课时列表" : "显示课时列表"
                      }
                    >
                      {lessonListVisible ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
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
                        {!lessonBatchDeleteMode && (
                          <span>{`${filteredCoursePlans.length}${filteredCoursePlans.length !== teacherCoursePlans.length ? `/${teacherCoursePlans.length}` : ""} 节课`}</span>
                        )}
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
                            onChange={(event) =>
                              onToggleBatchSelectAll(event.target.checked)
                            }
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
                    ) : (
                      <div className="teacher-lesson-filter-bar">
                        <div className="teacher-image-search-input-wrap teacher-lesson-search-input">
                          <Search size={13} />
                          <input
                            type="text"
                            placeholder="搜索课时"
                            value={lessonSearchQuery}
                            onChange={(e) => setLessonSearchQuery(e.target.value)}
                            aria-label="搜索课时"
                          />
                          {lessonSearchQuery && (
                            <button
                              type="button"
                              className="teacher-search-clear-btn"
                              onClick={() => setLessonSearchQuery("")}
                              aria-label="清除搜索"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        {lessonClassNames.length > 1 && (
                          <div className="teacher-lesson-class-chips">
                            <button
                              type="button"
                              className={`teacher-lesson-class-chip${lessonClassFilter === "" ? " active" : ""}`}
                              onClick={() => setLessonClassFilter("")}
                            >
                              全部
                            </button>
                            {lessonClassNames.map((name) => (
                              <button
                                key={name}
                                type="button"
                                className={`teacher-lesson-class-chip${lessonClassFilter === name ? " active" : ""}`}
                                onClick={() =>
                                  setLessonClassFilter(
                                    lessonClassFilter === name ? "" : name,
                                  )
                                }
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {teacherCoursePlans.length === 0 ? (
                      <p className="teacher-empty-text">
                        暂无课时，请点击右上角「新建一节课」。
                      </p>
                    ) : (
                      <div
                        className="teacher-lesson-list"
                        ref={lessonListScrollRef}
                        onWheel={onLessonListWheel}
                      >
                        {filteredCoursePlans.length === 0 ? (
                          <p className="teacher-empty-text teacher-lesson-filter-empty">
                            没有符合条件的课时。
                          </p>
                        ) : filteredCoursePlans.map((course, index) => {
                          const courseId = String(course?.id || "");
                          const active =
                            courseId === String(selectedCourseId || "");
                          const tasks = Array.isArray(course?.tasks)
                            ? course.tasks
                            : [];
                          const lessonClassName = normalizeLessonClassName(
                            course?.className,
                          );
                          return (
                            <article
                              key={courseId || `lesson-${index + 1}`}
                              className={`teacher-lesson-row${active ? " active" : ""}${
                                lessonBatchDeleteMode ? " batch-mode" : ""
                              }`}
                            >
                              {lessonBatchDeleteMode ? (
                                <label
                                  className="teacher-lesson-row-check"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={batchSelectedLessonIds.includes(
                                      courseId,
                                    )}
                                    onChange={(event) =>
                                      onToggleBatchSelectLesson(
                                        courseId,
                                        event.target.checked,
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                              <button
                                type="button"
                                className="teacher-lesson-row-main"
                                onClick={() => { setSelectedCourseId(courseId); setHomeworkReqOpen(false); }}
                              >
                                <strong>
                                  {course?.courseName || `第${index + 1}节课`}
                                </strong>
                                <p>
                                  <span className="teacher-lesson-row-time">
                                    {buildLessonTimeLabel(
                                      course?.courseStartAt,
                                      course?.courseEndAt,
                                      course?.courseTime,
                                    ) || "未设置课时时间"}
                                  </span>
                                  <span className="teacher-lesson-row-meta">{`${lessonClassName} · ${tasks.length} 个任务`}</span>
                                </p>
                              </button>
                              <div className="teacher-lesson-row-actions">
                                <span
                                  className={`teacher-lesson-status${course?.enabled === false ? " closed" : ""}`}
                                >
                                  {course?.enabled === false ? "未开放" : "已开放"}
                                </span>
                                <div className="teacher-lesson-row-btns">
                                  <button
                                    type="button"
                                    className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenRenameLessonDialog(course);
                                    }}
                                    title="重命名课时"
                                    aria-label="重命名课时"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="teacher-delete-btn teacher-tooltip-btn teacher-action-icon-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteCourseAction(courseId);
                                    }}
                                    title="删除课时"
                                    aria-label="删除课时"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
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
                          <div className="teacher-lesson-title-controls">
                            <div
                              className="teacher-lesson-switch-row"
                              role="switch"
                              aria-checked={selectedCourse.enabled !== false}
                              title={selectedCourse.enabled === false ? "课时未开放，点击开放" : "课时已开放，点击关闭"}
                              onClick={() => onUpdateSelectedLesson({ enabled: selectedCourse.enabled === false })}
                            >
                              {selectedCourse.enabled === false
                                ? <Lock size={14} className="teacher-lesson-switch-icon" />
                                : <LockOpen size={14} className="teacher-lesson-switch-icon active" />
                              }
                              <span className="teacher-ios-switch" aria-hidden="true">
                                <span className={`teacher-ios-switch-track${selectedCourse.enabled !== false ? " checked" : ""}`}>
                                  <span className="teacher-ios-switch-thumb" />
                                </span>
                              </span>
                            </div>
                            <div
                              className="teacher-lesson-switch-row"
                              role="switch"
                              aria-checked={selectedCourse.homeworkUploadEnabled !== false}
                              title={selectedCourse.homeworkUploadEnabled === false ? "本课无需交作业，点击开启" : "本课需要交作业，点击关闭"}
                              onClick={() => onUpdateSelectedLesson({ homeworkUploadEnabled: selectedCourse.homeworkUploadEnabled === false })}
                            >
                              <ClipboardList size={14} className={`teacher-lesson-switch-icon${selectedCourse.homeworkUploadEnabled === false ? "" : " active"}`} />
                              <span className="teacher-ios-switch" aria-hidden="true">
                                <span className={`teacher-ios-switch-track${selectedCourse.homeworkUploadEnabled !== false ? " checked" : ""}`}>
                                  <span className="teacher-ios-switch-thumb" />
                                </span>
                              </span>
                            </div>
                            {selectedCourse.homeworkUploadEnabled !== false && (
                              <div
                                className="teacher-lesson-switch-row"
                                role="switch"
                                aria-checked={selectedCourse.lateSubmissionEnabled === true}
                                title={selectedCourse.lateSubmissionEnabled ? "已允许补交，点击关闭" : "未允许补交，点击开启"}
                                onClick={() => onUpdateSelectedLesson({ lateSubmissionEnabled: !selectedCourse.lateSubmissionEnabled })}
                              >
                                <BookCheck size={14} className={`teacher-lesson-switch-icon${selectedCourse.lateSubmissionEnabled ? " active" : ""}`} />
                                <span className="teacher-ios-switch" aria-hidden="true">
                                  <span className={`teacher-ios-switch-track${selectedCourse.lateSubmissionEnabled ? " checked" : ""}`}>
                                    <span className="teacher-ios-switch-thumb" />
                                  </span>
                                </span>
                              </div>
                            )}
                            <PortalSelect
                              className="teacher-lesson-class-select"
                              value={normalizeLessonClassName(
                                selectedCourse.className,
                              )}
                              compact
                              ariaLabel="选择授课班级"
                              options={COURSE_TARGET_CLASS_OPTIONS}
                              onChange={(value) => {
                                onUpdateSelectedLesson({ className: value });
                              }}
                            />
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
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {!selectedCourse ? (
                      <p className="teacher-empty-text">
                        请选择左侧一节课后再设置任务和资料。
                      </p>
                    ) : (
                      <div className="teacher-lesson-detail-scroll">
                        <section className="teacher-homework-requirement-editor">
                          <button
                            type="button"
                            className="teacher-req-editor-toggle"
                            onClick={() => setHomeworkReqOpen((v) => !v)}
                          >
                            <strong>作业要求说明</strong>
                            <ChevronDown
                              size={14}
                              className={`teacher-req-editor-chevron${homeworkReqOpen ? " open" : ""}`}
                            />
                          </button>
                          {homeworkReqOpen && (
                            <textarea
                              className="teacher-req-editor-textarea"
                              value={selectedCourse.homeworkRequirementText || ""}
                              onChange={(event) =>
                                onUpdateSelectedLesson({
                                  homeworkRequirementText: event.target.value,
                                })
                              }
                              maxLength={CLASSROOM_HOMEWORK_REQUIREMENT_MAX_LENGTH}
                              placeholder="例如：提交实验报告 PDF 和源码压缩包。若包含多个文件夹，请先压缩后再上传。"
                            />
                          )}
                        </section>

                        <div className="teacher-task-draft-head">
                          <div className="teacher-task-draft-title">
                            <strong>课程任务</strong>
                            {classroomConfigHasUnsavedChanges ? (
                              <span className="teacher-task-dirty-tag">
                                未保存
                              </span>
                            ) : null}
                          </div>
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
                                setNewTaskType(
                                  value === "text" ? "text" : "link",
                                )
                              }
                            />
                            <button
                              type="button"
                              className="teacher-ghost-btn"
                              onClick={() =>
                                onAddTaskToSelectedLesson(newTaskType)
                              }
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
                              <p className="teacher-empty-text">
                                这节课暂未添加任务，点击上方按钮新增。
                              </p>
                            ) : (
                              <div className="teacher-task-master-items">
                                {selectedCourseTasks.map((task, index) => {
                                  const taskId = String(task?.id || "");
                                  const isLinkTask = task?.type === "link";
                                  return (
                                    <article
                                      key={
                                        taskId || `task-summary-${index + 1}`
                                      }
                                      className={`teacher-task-summary-item${
                                        taskId === String(selectedTaskId || "")
                                          ? " active"
                                          : ""
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        className="teacher-task-summary-main"
                                        onClick={() =>
                                          setSelectedTaskId(taskId)
                                        }
                                      >
                                        <span className="teacher-task-summary-topline">
                                          <span className="teacher-task-summary-index">
                                            {index + 1}
                                          </span>
                                          <span
                                            className={`teacher-task-summary-type${
                                              isLinkTask ? " link" : " text"
                                            }`}
                                          >
                                            {isLinkTask ? (
                                              <Link2 size={12} />
                                            ) : (
                                              <FileText size={12} />
                                            )}
                                            <span>
                                              {resolveTaskTypeLabel(task?.type)}
                                            </span>
                                          </span>
                                        </span>
                                        <span className="teacher-task-summary-body">
                                          <strong>
                                            {task?.title || `任务 ${index + 1}`}
                                          </strong>
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="teacher-icon-btn danger teacher-task-summary-delete"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onRemoveTaskFromSelectedLesson(
                                            taskId,
                                          );
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
                              <p className="teacher-empty-text">
                                请选择左侧任务进行编辑。
                              </p>
                            ) : (
                              <div className="teacher-task-editor-form">
                                <div className="teacher-task-editor-grid">
                                  <label>
                                    <span>类型</span>
                                    <PortalSelect
                                      className="teacher-task-editor-type-select"
                                      value={
                                        selectedTask.type === "link"
                                          ? "link"
                                          : "text"
                                      }
                                      compact
                                      ariaLabel="选择任务类型"
                                      options={[
                                        { value: "link", label: "问卷/链接" },
                                        { value: "text", label: "文字说明" },
                                      ]}
                                      onChange={(value) => {
                                        const nextType =
                                          value === "link" ? "link" : "text";
                                        onUpdateSelectedTask(
                                          selectedTask.id,
                                          buildTaskTypePatch(
                                            selectedTask,
                                            nextType,
                                          ),
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
                                        onUpdateSelectedTask(selectedTask.id, {
                                          title: e.target.value,
                                        })
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
                                            onUpdateSelectedTask(
                                              selectedTask.id,
                                              {
                                                description: e.target.value,
                                              },
                                            )
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
                                        {selectedTaskLinks.map(
                                          (link, linkIndex) => (
                                            <div
                                              key={`link-${selectedTask.id}-${linkIndex + 1}`}
                                              className="teacher-link-input-row"
                                            >
                                              <input
                                                type="text"
                                                value={link}
                                                onChange={(event) =>
                                                  onUpdateSelectedTaskLinkAt(
                                                    linkIndex,
                                                    event.target.value,
                                                  )
                                                }
                                                placeholder="请输入 https:// 开头链接"
                                              />
                                              <button
                                                type="button"
                                                className="teacher-icon-btn danger"
                                                onClick={() =>
                                                  onRemoveSelectedTaskLink(
                                                    linkIndex,
                                                  )
                                                }
                                                disabled={
                                                  selectedTaskLinks.length <= 1
                                                }
                                                title="删除该链接地址"
                                                aria-label="删除该链接地址"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <span>任务内容</span>
                                      <textarea
                                        value={selectedTask.content || ""}
                                        onChange={(e) =>
                                          onUpdateSelectedTask(
                                            selectedTask.id,
                                            { content: e.target.value },
                                          )
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
                                        onChange={onSelectTaskFiles}
                                      />
                                      <button
                                        type="button"
                                        className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                                        onClick={() =>
                                          taskFileInputRef.current?.click()
                                        }
                                        disabled={uploadingFiles}
                                        data-tooltip={
                                          uploadingFiles
                                            ? "上传中..."
                                            : "添加任务附件"
                                        }
                                        title={
                                          uploadingFiles
                                            ? "上传中..."
                                            : "添加任务附件"
                                        }
                                        aria-label={
                                          uploadingFiles
                                            ? "上传中..."
                                            : "添加任务附件"
                                        }
                                      >
                                        <Upload size={14} />
                                      </button>
                                      {uploadingFiles ? (
                                        <button
                                          type="button"
                                          className="teacher-ghost-btn"
                                          onClick={() =>
                                            uploadAbortControllerRef.current?.abort()
                                          }
                                        >
                                          <span>取消上传</span>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="teacher-primary-btn"
                                          onClick={() =>
                                            void onUploadQueuedTaskFiles()
                                          }
                                          disabled={
                                            selectedTaskUploadDrafts.length ===
                                            0
                                          }
                                        >
                                          <Upload size={14} />
                                          <span>上传全部</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="teacher-task-file-hint">{`单个文件最大 ${formatFileSize(
                                    TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
                                  )}，每次最多上传 ${TEACHER_TASK_UPLOAD_MAX_FILES} 个文件。`}</p>
                                  {selectedTaskUploadDrafts.length > 0 ? (
                                    <div className="teacher-file-chip-list">
                                      {selectedTaskUploadDrafts.map((file) => (
                                        <div
                                          key={file?.localId || file?.name}
                                          className={`teacher-file-chip teacher-file-chip-${String(
                                            file?.status || "draft",
                                          )}`}
                                        >
                                          <div className="teacher-file-chip-info">
                                            <FileText size={14} />
                                            <div className="teacher-file-chip-meta">
                                              <div className="teacher-file-chip-headline">
                                                <strong>
                                                  {file?.name || "任务附件"}
                                                </strong>
                                                <span className="teacher-file-chip-status">
                                                  {file?.status === "uploading"
                                                    ? "上传中"
                                                    : file?.status === "failed"
                                                      ? "上传失败"
                                                      : "待上传"}
                                                </span>
                                              </div>
                                              <div className="teacher-file-chip-subline">
                                                <span>
                                                  {formatFileSize(file?.size)}
                                                </span>
                                                <span>
                                                  {file?.status === "uploading"
                                                    ? TASK_FILE_UPLOAD_STATUS_TEXT
                                                    : file?.error ||
                                                      "已加入待上传列表。"}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="teacher-file-chip-actions">
                                            <button
                                              type="button"
                                              className="teacher-icon-btn danger"
                                              onClick={() =>
                                                onRemoveTaskUploadDraft(
                                                  file?.localId,
                                                )
                                              }
                                              disabled={
                                                uploadingFiles ||
                                                file?.status === "uploading"
                                              }
                                              title="移除待上传文件"
                                            >
                                              <X size={14} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {selectedTaskFiles.length === 0 ? (
                                    <p className="teacher-empty-text">
                                      当前任务未上传附件。
                                    </p>
                                  ) : (
                                    <div className="teacher-file-chip-list">
                                      {selectedTaskFiles.map((file, index) => {
                                        const fileId = String(file?.id || "");
                                        const isDeleting =
                                          deletingFileId === fileId;
                                        const isDownloading =
                                          downloadingFileId === fileId;
                                        return (
                                          <div
                                            key={
                                              fileId || `task-file-${index + 1}`
                                            }
                                            className="teacher-file-chip"
                                          >
                                            <div className="teacher-file-chip-info">
                                              <FileText size={14} />
                                              <div className="teacher-file-chip-meta">
                                                <div className="teacher-file-chip-headline">
                                                  <strong>
                                                    {file?.name || "任务附件"}
                                                  </strong>
                                                </div>
                                                <div className="teacher-file-chip-subline">
                                                  <span>
                                                    {formatFileSize(file?.size)}
                                                  </span>
                                                  <span>
                                                    {isDownloading
                                                      ? TASK_FILE_DOWNLOAD_STATUS_TEXT
                                                      : `上传于 ${formatDisplayTime(file?.uploadedAt)}`}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                            <div className="teacher-file-chip-actions">
                                              <button
                                                type="button"
                                                className="teacher-icon-btn"
                                                onClick={() =>
                                                  void onDownloadLessonFile(
                                                    file,
                                                  )
                                                }
                                                disabled={
                                                  !fileId || isDownloading
                                                }
                                                title="下载附件"
                                              >
                                                <Download size={14} />
                                              </button>
                                              <button
                                                type="button"
                                                className="teacher-icon-btn danger"
                                                onClick={() =>
                                                  void onDeleteTaskFile(fileId)
                                                }
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

            {activePanel === "final-test" ? (
              <div className="teacher-panel-stack teacher-final-test-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>期末测试</h2>
                    <p className="teacher-panel-save-time">
                      {finalTestView === "submissions"
                        ? `查看 810班 / 811班 的交卷情况 · 最近刷新：${formatDisplayTime(
                            finalTestSubmissionUpdatedAt,
                          )}`
                        : `编辑学生端将显示的期末测试内容 · 最近保存：${formatDisplayTime(
                            classroomUpdatedAt,
                          )}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <div
                      className="teacher-homework-view-toggle"
                      role="tablist"
                      aria-label="期末测试视图切换"
                    >
                      <button
                        type="button"
                        className={`teacher-homework-view-btn${
                          finalTestView === "editor" ? " active" : ""
                        }`}
                        onClick={() => setFinalTestView("editor")}
                      >
                        编辑内容
                      </button>
                      <button
                        type="button"
                        className={`teacher-homework-view-btn${
                          finalTestView === "submissions" ? " active" : ""
                        }`}
                        onClick={() => setFinalTestView("submissions")}
                      >
                        提交情况
                      </button>
                    </div>
                    {finalTestView === "editor" && finalTestConfigHasUnsavedChanges ? (
                      <span className="teacher-user-manage-dirty-tag">
                        期末测试内容未保存
                      </span>
                    ) : null}
                    {finalTestView === "submissions" ? (
                      <button
                        type="button"
                        className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                        onClick={() => void loadFinalTestSubmissions()}
                        disabled={finalTestSubmissionLoading}
                        data-tooltip={finalTestSubmissionLoading ? "刷新中..." : "刷新提交情况"}
                        title={finalTestSubmissionLoading ? "刷新中..." : "刷新提交情况"}
                        aria-label={finalTestSubmissionLoading ? "刷新中..." : "刷新提交情况"}
                      >
                        <RefreshCw
                          size={15}
                          className={finalTestSubmissionLoading ? "is-spinning" : ""}
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="teacher-primary-btn teacher-tooltip-btn teacher-action-icon-btn"
                        onClick={onSaveFinalTestConfig}
                        disabled={loading || saving || finalTestSaving || uploadingFiles}
                        data-tooltip={finalTestSaving ? "保存中..." : "保存期末测试内容"}
                        title={finalTestSaving ? "保存中..." : "保存期末测试内容"}
                        aria-label={finalTestSaving ? "保存中..." : "保存期末测试内容"}
                      >
                        <Save size={15} />
                      </button>
                    )}
                  </div>
                </header>

                {finalTestView === "editor" ? (
                  <div className="teacher-final-test-columns">
                    <section className="teacher-card teacher-final-test-card">
                      <label className="teacher-full-row">
                        <span>顶部说明</span>
                        <input
                          type="text"
                          value={finalTestConfig.introText}
                          onChange={(event) =>
                            setFinalTestConfig((current) => ({
                              ...current,
                              introText: event.target.value,
                            }))
                          }
                          placeholder="说明期末测试包含哪些部分，以及平台内任务的要求。"
                        />
                      </label>
                      <div className="teacher-final-test-task-head">
                        <div>
                          <strong>任务列表</strong>
                          <p>学生端会按这里的顺序显示任务。可继续新增任务。</p>
                        </div>
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={addFinalTestTask}
                        >
                          <Plus size={14} />
                          <span>添加任务</span>
                        </button>
                      </div>
                      <div className="teacher-final-test-task-list">
                        {(Array.isArray(finalTestConfig.tasks)
                          ? finalTestConfig.tasks
                          : []
                        ).map((task, index) => (
                          <section
                            key={task.id || `task-${index + 1}`}
                            className="teacher-final-test-task-item"
                          >
                            <div className="teacher-final-test-task-item-head">
                              <strong>{`任务 ${index + 1}`}</strong>
                              <div className="teacher-final-test-task-item-actions">
                                <label className="teacher-final-test-task-mode">
                                  <select
                                    value={task.mode || "platform"}
                                    onChange={(event) =>
                                      updateFinalTestTaskAt(index, (currentTask) => ({
                                        ...currentTask,
                                        mode: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="platform">平台内任务</option>
                                    <option value="offline">线下任务</option>
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  className="teacher-final-test-task-remove"
                                  onClick={() => removeFinalTestTask(index)}
                                  disabled={(finalTestConfig.tasks || []).length <= 1}
                                >
                                  <Trash2 size={14} />
                                  <span>删除</span>
                                </button>
                              </div>
                            </div>
                            <div className="teacher-form-grid teacher-form-grid-single">
                              <label>
                                <span>任务标题</span>
                                <input
                                  type="text"
                                  value={task.title || ""}
                                  onChange={(event) =>
                                    updateFinalTestTaskAt(index, (currentTask) => ({
                                      ...currentTask,
                                      title: event.target.value,
                                    }))
                                  }
                                  placeholder={`任务 ${index + 1} 标题`}
                                />
                              </label>
                            </div>
                            <label className="teacher-full-row">
                              <span>任务说明</span>
                              <textarea
                                rows={index === 0 ? 5 : 3}
                                value={task.description || ""}
                                onChange={(event) =>
                                  updateFinalTestTaskAt(index, (currentTask) => ({
                                    ...currentTask,
                                    description: event.target.value,
                                  }))
                                }
                                placeholder={
                                  task.mode === "offline"
                                    ? "说明该任务在线下如何完成。"
                                    : "让学生知道具体要做什么、重点写什么。"
                                }
                              />
                            </label>
                          </section>
                        ))}
                      </div>
                    </section>

                    <section className="teacher-card teacher-final-test-preview-card">
                      <h3>学生端预览</h3>
                      <div className="teacher-final-test-preview">
                        <p>{finalTestConfig.introText}</p>
                        {(Array.isArray(finalTestConfig.tasks)
                          ? finalTestConfig.tasks
                          : []
                        ).map((task, index) => (
                          <div
                            key={task.id || `preview-task-${index + 1}`}
                            className="teacher-final-test-preview-task"
                          >
                            <strong>{task.title || `任务 ${index + 1}`}</strong>
                            <p
                              className={
                                task.mode === "offline"
                                  ? "teacher-final-test-preview-muted"
                                  : ""
                              }
                            >
                              {task.description || "未填写任务说明。"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="teacher-final-test-status-layout">
                    <div className="teacher-final-test-status-toolbar">
                      <h3>交卷总览</h3>
                      <div className="teacher-final-test-status-controls">
                        <div
                          className="teacher-homework-view-toggle"
                          role="tablist"
                          aria-label="期末测试提交情况显示内容"
                        >
                          <button
                            type="button"
                            className={`teacher-homework-view-btn${
                              finalTestSubmissionDisplayMode === "submission"
                                ? " active"
                                : ""
                            }`}
                            onClick={() =>
                              setFinalTestSubmissionDisplayMode("submission")
                            }
                          >
                            交卷状态
                          </button>
                          <button
                            type="button"
                            className={`teacher-homework-view-btn${
                              finalTestSubmissionDisplayMode === "stage"
                                ? " active"
                                : ""
                            }`}
                            onClick={() =>
                              setFinalTestSubmissionDisplayMode("stage")
                            }
                          >
                            当前步骤
                          </button>
                        </div>
                        <PortalSelect
                          className="teacher-final-test-status-class-select"
                          value={finalTestSubmissionClassName}
                          ariaLabel="期末测试提交情况班级"
                          options={FINAL_TEST_EXPORT_CLASS_OPTIONS}
                          onChange={setFinalTestSubmissionClassName}
                          compact
                        />
                      </div>
                    </div>

                    {finalTestSubmissionLoading ? (
                      <section className="teacher-card teacher-final-test-status-card">
                        <p className="teacher-empty-text">正在读取提交情况…</p>
                      </section>
                    ) : visibleFinalTestSubmissionClasses.length === 0 ? (
                      <section className="teacher-card teacher-final-test-status-card">
                        <p className="teacher-empty-text">当前筛选下还没有班级名单。</p>
                      </section>
                    ) : (
                      <div className="teacher-final-test-class-grid">
                        {visibleFinalTestSubmissionClasses.map((classItem) => {
                          const className = normalizeLessonClassName(
                            classItem?.className,
                          );
                          const students = Array.isArray(classItem?.students)
                            ? classItem.students
                            : [];
                          const submittedCount = students.filter(
                            (student) => student?.submitted === true,
                          ).length;
                          const unlistedSessions = Array.isArray(
                            classItem?.unlistedSessions,
                          )
                            ? classItem.unlistedSessions
                            : [];
                          return (
                            <section
                              key={`final-test-class-${className || "unknown"}`}
                              className="teacher-card teacher-final-test-status-card"
                            >
                              <div className="teacher-final-test-status-section-head">
                                <div className="teacher-final-test-status-title">
                                  <h3>{`全班名单（已交 ${submittedCount} / ${students.length}）`}</h3>
                                </div>
                              </div>

                              {students.length === 0 ? (
                                <p className="teacher-empty-text">这个班级还没有花名册。</p>
                              ) : (
                                <div className="teacher-homework-card-grid teacher-final-test-student-grid">
                                  {students.map((student) => {
                                    const submitted = student?.submitted === true;
                                    const stage3HasContent = student?.stage3HasContent === true;
                                    const emptyStage3 = submitted && !stage3HasContent;
                                    const detailStatusLabel =
                                      readFinalTestStatusLabel(student?.status);
                                    const statusLabel =
                                      finalTestSubmissionDisplayMode === "stage"
                                        ? detailStatusLabel
                                        : submitted
                                          ? "已交"
                                          : "未交";
                                    return (
                                      <article
                                        key={`final-test-student-${student?.studentUserId || student?.studentId || student?.studentName}`}
                                        className={`teacher-homework-student-card teacher-final-test-student-tile${
                                          submitted ? " submitted" : " missing"
                                        }${emptyStage3 ? " empty-stage3" : ""}`}
                                        title={`${student?.studentName || "未命名学生"} · ${detailStatusLabel}${
                                          student?.submittedAt
                                            ? ` · ${formatDisplayTime(student.submittedAt)}`
                                            : ""
                                        }${emptyStage3 ? " · 定稿内容为空" : ""}`}
                                      >
                                        <span className="teacher-homework-student-card-name">
                                          {student?.studentName || "未命名学生"}
                                        </span>
                                        <span className="teacher-homework-student-card-status">
                                          {statusLabel}
                                        </span>
                                        {emptyStage3 ? (
                                          <span className="teacher-final-test-empty-stage3-hint">
                                            定稿为空，建议重新开放
                                          </span>
                                        ) : null}
                                        {submitted ? (
                                          <button
                                            type="button"
                                            className="teacher-final-test-reopen-btn"
                                            disabled={finalTestReopeningIds.has(`${className}:${student?.studentUserId}`)}
                                            onClick={() => handleReopenFinalTest(student?.studentUserId, className)}
                                          >
                                            {finalTestReopeningIds.has(`${className}:${student?.studentUserId}`) ? "开放中…" : "重新开放"}
                                          </button>
                                        ) : null}
                                      </article>
                                    );
                                  })}
                                </div>
                              )}

                              {unlistedSessions.length > 0 ? (
                                <div className="teacher-final-test-unlisted-block">
                                  <strong>名单外记录</strong>
                                  <div className="teacher-final-test-unlisted-list">
                                    {unlistedSessions.map((item) => (
                                      <article
                                        key={`final-test-unlisted-${className}-${item?.studentUserId || item?.updatedAt}`}
                                        className="teacher-final-test-unlisted-item"
                                      >
                                        <span>{item?.studentUserId || "未知账号"}</span>
                                        <span>{readFinalTestStatusLabel(item?.status)}</span>
                                      </article>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : activePanel === "discipline" ? (
              <div className="teacher-panel-stack teacher-discipline-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>纪律管理</h2>
                    <p className="teacher-panel-save-time">
                      {`按课时分别登记学生违规表现 · 最近保存：${formatDisplayTime(classroomUpdatedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() =>
                        setLessonListVisible((current) => !current)
                      }
                      data-tooltip={
                        lessonListVisible ? "隐藏课时列表" : "显示课时列表"
                      }
                      title={
                        lessonListVisible ? "隐藏课时列表" : "显示课时列表"
                      }
                      aria-label={
                        lessonListVisible ? "隐藏课时列表" : "显示课时列表"
                      }
                    >
                      {lessonListVisible ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="teacher-primary-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={onSaveClassroomConfig}
                      disabled={loading || saving}
                      data-tooltip={saving ? "保存中..." : "保存纪律记录"}
                      title={saving ? "保存中..." : "保存纪律记录"}
                      aria-label={saving ? "保存中..." : "保存纪律记录"}
                    >
                      <Save size={15} />
                    </button>
                  </div>
                </header>

                <section
                  className={`teacher-card teacher-lesson-workbench teacher-discipline-workbench${
                    lessonListVisible ? "" : " list-collapsed"
                  }`}
                >
                  <div
                    className={`teacher-lesson-list-panel${lessonListVisible ? "" : " collapsed"}`}
                  >
                    <div className="teacher-lesson-list-head">
                      <h3>课时列表</h3>
                      <div className="teacher-lesson-list-head-right">
                        <span>{`${filteredDisciplinePlans.length}${filteredDisciplinePlans.length !== teacherCoursePlans.length ? `/${teacherCoursePlans.length}` : ""} 节课`}</span>
                      </div>
                    </div>
                    <div className="teacher-lesson-filter-bar">
                      <div className="teacher-image-search-input-wrap teacher-lesson-search-input">
                        <Search size={13} />
                        <input
                          type="text"
                          placeholder="搜索课时"
                          value={disciplineSearchQuery}
                          onChange={(e) => setDisciplineSearchQuery(e.target.value)}
                          aria-label="搜索课时"
                        />
                        {disciplineSearchQuery && (
                          <button
                            type="button"
                            className="teacher-search-clear-btn"
                            onClick={() => setDisciplineSearchQuery("")}
                            aria-label="清除搜索"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {teacherCoursePlans.length === 0 ? (
                      <p className="teacher-empty-text">
                        暂无课时，请先到"课时管理"中创建课时。
                      </p>
                    ) : (
                      <div
                        className="teacher-lesson-list"
                        ref={lessonListScrollRef}
                        onWheel={onLessonListWheel}
                      >
                        {filteredDisciplinePlans.length === 0 ? (
                          <p className="teacher-empty-text teacher-lesson-filter-empty">
                            没有符合条件的课时。
                          </p>
                        ) : filteredDisciplinePlans.map((course, index) => {
                          const courseId = String(course?.id || "");
                          const active =
                            courseId === String(selectedCourseId || "");
                          const lessonClassName = normalizeLessonClassName(
                            course?.className,
                          );
                          const summary = disciplineLessonSummaryByLessonId[
                            courseId
                          ] || {
                            studentCount: 0,
                            totalCount: 0,
                          };
                          return (
                            <article
                              key={courseId || `discipline-lesson-${index + 1}`}
                              className={`teacher-lesson-row${active ? " active" : ""}`}
                            >
                              <button
                                type="button"
                                className="teacher-lesson-row-main"
                                onClick={() => { setSelectedCourseId(courseId); setHomeworkReqOpen(false); }}
                              >
                                <strong>
                                  {course?.courseName || `第${index + 1}节课`}
                                </strong>
                                <p>
                                  <span className="teacher-lesson-row-time">
                                    {buildLessonTimeLabel(
                                      course?.courseStartAt,
                                      course?.courseEndAt,
                                      course?.courseTime,
                                    ) || "未设置课时时间"}
                                  </span>
                                  <span className="teacher-lesson-row-meta">{`${lessonClassName} · 违纪 ${summary.totalCount} 次 / ${summary.studentCount} 人`}</span>
                                </p>
                              </button>
                              <div className="teacher-lesson-row-actions">
                                <span
                                  className={`teacher-lesson-status${summary.totalCount === 0 ? " closed" : ""}`}
                                >
                                  {summary.totalCount > 0 ? "已登记" : "未登记"}
                                </span>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="teacher-homework-detail-panel teacher-discipline-detail-panel">
                    {!selectedCourse ? (
                      <p className="teacher-empty-text">
                        请选择左侧课时后，再登记本节课的纪律表现。
                      </p>
                    ) : (
                      <>
                        <div className="teacher-discipline-toolbar">
                          <div className="teacher-image-search-input-wrap teacher-discipline-search-input">
                            <Search size={14} />
                            <input
                              ref={disciplineStudentSearchInputRef}
                              type="text"
                              aria-label="纪律学生搜索"
                              value={disciplineStudentKeyword}
                              onChange={(event) =>
                                setDisciplineStudentKeyword(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Escape") return;
                                if (
                                  !String(
                                    disciplineStudentKeyword || "",
                                  ).trim()
                                )
                                  return;
                                event.preventDefault();
                                clearDisciplineStudentKeyword();
                              }}
                              placeholder="按姓名 / 学号搜索学生"
                              maxLength={80}
                            />
                            {String(disciplineStudentKeyword || "").trim() ? (
                              <button
                                type="button"
                                className="teacher-discipline-search-clear-btn"
                                onClick={clearDisciplineStudentKeyword}
                                aria-label="清除学生搜索"
                              >
                                <X size={12} />
                              </button>
                            ) : null}
                          </div>
                          <form
                            className="teacher-discipline-custom-form"
                            onSubmit={onAddCustomDisciplineBehavior}
                          >
                            <input
                              type="text"
                              value={disciplineDraftBehavior}
                              onChange={(event) =>
                                setDisciplineDraftBehavior(event.target.value)
                              }
                              placeholder="新增违规行为，例如：看短视频"
                              maxLength={40}
                            />
                            <button
                              type="submit"
                              className="teacher-ghost-btn"
                              disabled={!disciplineDraftBehavior.trim()}
                            >
                              <Plus size={14} />
                              <span>新增行为</span>
                            </button>
                          </form>
                        </div>

                        {activeDisciplineStudentId ? (
                          <div className="teacher-discipline-behavior-bar">
                            <span className="teacher-discipline-behavior-bar-label">
                              {`${
                                String(
                                  disciplineStudentCards.find(
                                    (c) => String(c.userId) === activeDisciplineStudentId,
                                  )?.user?.profile?.name ||
                                  disciplineStudentCards.find(
                                    (c) => String(c.userId) === activeDisciplineStudentId,
                                  )?.user?.username ||
                                  ""
                                ).trim() || "该学生"
                              } 违规了：`}
                            </span>
                            {disciplineBehaviorOptions.map((behavior) => (
                              <button
                                key={behavior.id}
                                type="button"
                                className="teacher-discipline-behavior-tab"
                                onClick={() => {
                                  onRegisterDisciplineBehavior(activeDisciplineStudentId, behavior.id);
                                  setActiveDisciplineStudentId("");
                                }}
                              >
                                {behavior.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="teacher-discipline-behavior-bar">
                            <span className="teacher-discipline-behavior-bar-label">点击学生卡片选择学生</span>
                          </div>
                        )}

                        {userDirectoryLoading &&
                        disciplineAllStudentCards.length === 0 ? (
                          <p className="teacher-empty-text">
                            正在读取本班学生名单…
                          </p>
                        ) : null}

                        {disciplineAllStudentCards.length === 0 ? (
                          <p className="teacher-empty-text">
                            当前班级还没有可登记的学生账号。
                          </p>
                        ) : disciplineStudentCards.length === 0 ? (
                          <p className="teacher-empty-text">
                            未找到匹配的学生，请换个关键词试试。
                          </p>
                        ) : (
                          <div className="teacher-discipline-card-grid">
                            {disciplineStudentCards.map((item) => {
                              const studentName =
                                String(
                                  item?.user?.profile?.name || "",
                                ).trim() ||
                                String(item?.user?.username || "").trim() ||
                                "未命名学生";
                              const studentUserId = String(item.userId || "").trim();
                              const isSelected = activeDisciplineStudentId === studentUserId;
                              return (
                                <button
                                  key={item.userId}
                                  type="button"
                                  className={`teacher-discipline-card tappable${item.totalCount > 0 ? " has-records" : ""}${isSelected ? " selected" : ""}`}
                                  onClick={() =>
                                    setActiveDisciplineStudentId((cur) =>
                                      cur === studentUserId ? "" : studentUserId,
                                    )
                                  }
                                >
                                  <div className="teacher-discipline-card-name">
                                    <span>{studentName}</span>
                                    {item.totalCount > 0 ? (
                                      <span className="teacher-discipline-row-total">
                                        {`× ${item.totalCount}`}
                                      </span>
                                    ) : null}
                                  </div>
                                  {item.totalCount > 0 ? (
                                    <div className="teacher-discipline-card-counts">
                                      {disciplineBehaviorOptions.map((behavior) => {
                                        const count =
                                          Number(
                                            item.behaviorCounts.find(
                                              (b) => b.behaviorId === behavior.id,
                                            )?.count,
                                          ) || 0;
                                        if (!count) return null;
                                        return (
                                          <div key={behavior.id} className="teacher-discipline-count-item">
                                            <span className="teacher-discipline-count-label">{behavior.label}</span>
                                            <span className="teacher-discipline-count-badge">{count}</span>
                                            <button
                                              type="button"
                                              className="teacher-discipline-sub-btn"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onDecreaseDisciplineBehavior(studentUserId, behavior.id);
                                              }}
                                              aria-label={`${studentName} ${behavior.label} 减一`}
                                            >
                                              <Minus size={10} />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
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
                    {selectedHomeworkLesson ? (
                      <button
                        type="button"
                        className="teacher-ghost-btn teacher-homework-export-btn"
                        onClick={() => void onExportHomeworkLessonFiles()}
                        disabled={
                          !selectedHomeworkLesson?.id ||
                          exportingHomeworkLessonId ===
                            String(selectedHomeworkLesson.id || "")
                        }
                      >
                        {exportingHomeworkLessonId ===
                        String(selectedHomeworkLesson.id || "") ? (
                          <RefreshCw size={14} className="is-spinning" />
                        ) : (
                          <Download size={14} />
                        )}
                        <span>批量导出本节作业</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() => void loadHomeworkOverview()}
                      disabled={homeworkOverviewLoading}
                      aria-label={
                        homeworkOverviewLoading
                          ? "Refreshing"
                          : "Refresh homework"
                      }
                    >
                      <RefreshCw
                        size={15}
                        className={homeworkOverviewLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <section className="teacher-card teacher-homework-workbench">
                  <div className="teacher-homework-list-panel">
                    <div className="teacher-lesson-list-head">
                      <h3>课时列表</h3>
                      <div className="teacher-lesson-list-head-right">
                        <span>{`${filteredHomeworkLessons.length}${filteredHomeworkLessons.length !== homeworkLessons.length ? `/${homeworkLessons.length}` : ""} 节课`}</span>
                      </div>
                    </div>
                    <div className="teacher-lesson-filter-bar">
                      <div className="teacher-image-search-input-wrap teacher-lesson-search-input">
                        <Search size={13} />
                        <input
                          type="text"
                          placeholder="搜索课时"
                          value={homeworkSearchQuery}
                          onChange={(e) => setHomeworkSearchQuery(e.target.value)}
                          aria-label="搜索课时"
                        />
                        {homeworkSearchQuery && (
                          <button
                            type="button"
                            className="teacher-search-clear-btn"
                            onClick={() => setHomeworkSearchQuery("")}
                            aria-label="清除搜索"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    {homeworkLessons.length === 0 ? (
                      <p className="teacher-empty-text">
                        暂无课时或尚未创建作业。
                      </p>
                    ) : (
                      <div className="teacher-lesson-list">
                        {filteredHomeworkLessons.length === 0 ? (
                          <p className="teacher-empty-text teacher-lesson-filter-empty">
                            没有符合条件的课时。
                          </p>
                        ) : filteredHomeworkLessons.map((lesson, index) => {
                          const lessonId = String(lesson?.id || "");
                          const active =
                            lessonId === String(selectedHomeworkLessonId || "");
                          const lessonClassName = normalizeLessonClassName(
                            lesson?.className,
                          );
                          const studentTotal = Number(
                            lesson?.studentTotal || 0,
                          );
                          const uploadedStudentCount = Number(
                            lesson?.uploadedStudentCount || 0,
                          );
                          const missingStudentCount = Number(
                            lesson?.missingStudentCount || 0,
                          );
                          return (
                            <article
                              key={lessonId || `homework-lesson-${index + 1}`}
                              className={`teacher-lesson-row${active ? " active" : ""}`}
                            >
                              <button
                                type="button"
                                className="teacher-lesson-row-main"
                                onClick={() => {
                                  setSelectedHomeworkLessonId(lessonId);
                                  setHomeworkViewMode("card");
                                }}
                              >
                                <strong>
                                  {lesson?.courseName || `第${index + 1}节课`}
                                </strong>
                                <p>
                                  <span className="teacher-lesson-row-time">{`已交 ${uploadedStudentCount}/${studentTotal}`}</span>
                                  <span className="teacher-lesson-row-meta">{`${lessonClassName} · 漏交 ${missingStudentCount} 人`}</span>
                                </p>
                              </button>
                              <div className="teacher-lesson-row-actions">
                                <span
                                  className={`teacher-lesson-status${
                                    lesson?.homeworkUploadEnabled
                                      ? ""
                                      : " closed"
                                  }`}
                                >
                                  {lesson?.homeworkUploadEnabled
                                    ? "可交作业"
                                    : "未开放上传"}
                                </span>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="teacher-homework-detail-panel">
                    {!selectedHomeworkLesson ? (
                      <p className="teacher-empty-text">
                        请选择左侧课时查看作业提交详情。
                      </p>
                    ) : (
                      <>
                        <p className="teacher-homework-class-hint">{`授课班级：${normalizeLessonClassName(
                          selectedHomeworkLesson?.className,
                        )}`}</p>
                        <div className="teacher-homework-detail-scroll-area">
                          <section className="teacher-homework-requirement-card">
                            <strong>本节课作业要求</strong>
                            <p>
                              {resolveClassroomHomeworkRequirementText(
                                selectedHomeworkLesson?.homeworkRequirementText,
                              )}
                            </p>
                          </section>

                          <div className="teacher-homework-list-head">
                            <strong className="teacher-homework-list-title">
                              {`全班名单（已交 ${selectedHomeworkLesson.uploadedStudentCount || 0} / ${selectedHomeworkLesson.studentTotal || 0}）`}
                            </strong>
                            <div className="teacher-homework-view-toggle">
                              <button
                                type="button"
                                className={`teacher-homework-view-btn${homeworkViewMode === "card" ? " active" : ""}`}
                                onClick={() => setHomeworkViewMode("card")}
                                title="卡片视图"
                              >
                                <LayoutGrid size={14} />
                              </button>
                              <button
                                type="button"
                                className={`teacher-homework-view-btn${homeworkViewMode === "table" ? " active" : ""}`}
                                onClick={() => setHomeworkViewMode("table")}
                                title="表格视图"
                              >
                                <List size={14} />
                              </button>
                            </div>
                          </div>

                          {homeworkViewMode === "card" ? (
                            <div className="teacher-homework-card-grid">
                              {selectedHomeworkStudents.length === 0 ? (
                                <p className="teacher-empty-text">暂无学生数据。</p>
                              ) : (
                                selectedHomeworkStudents.map((student, studentIndex) => {
                                  const rowKey = resolveHomeworkStudentRowKey(student, studentIndex);
                                  const submitted = !!student?.submitted;
                                  const studentName = String(student?.studentName || student?.username || "").trim() || "未命名";
                                  return (
                                    <div
                                      key={rowKey}
                                      className={`teacher-homework-student-card${submitted ? " submitted" : " missing"}`}
                                    >
                                      <span className="teacher-homework-student-card-name">{studentName}</span>
                                      <span className="teacher-homework-student-card-status">{submitted ? "已交" : "未交"}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ) : null}

                          <div className={`teacher-homework-table-wrap${homeworkViewMode === "table" ? "" : " hidden"}`}>
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
                                  selectedHomeworkStudents.map(
                                    (student, studentIndex) => {
                                      const rowKey =
                                        resolveHomeworkStudentRowKey(
                                          student,
                                          studentIndex,
                                        );
                                      const files = Array.isArray(
                                        student?.files,
                                      )
                                        ? student.files
                                        : [];
                                      const canExpand = files.length > 0;
                                      const expanded =
                                        canExpand &&
                                        expandedHomeworkStudentIds.includes(
                                          rowKey,
                                        );
                                      return (
                                        <Fragment key={rowKey}>
                                          <tr
                                            className={`teacher-homework-student-row${
                                              canExpand ? " expandable" : ""
                                            }${expanded ? " expanded" : ""}`}
                                            onClick={() => {
                                              if (!canExpand) return;
                                              onToggleHomeworkStudentExpand(
                                                student,
                                                studentIndex,
                                              );
                                            }}
                                          >
                                            <td>{student?.studentId || "-"}</td>
                                            <td>
                                              {student?.studentName ||
                                                student?.username ||
                                                "-"}
                                            </td>
                                            <td>{student?.className || "-"}</td>
                                            <td>
                                              {student?.submitted
                                                ? "已提交"
                                                : "未提交"}
                                            </td>
                                            <td>{student?.fileCount || 0}</td>
                                            <td>
                                              {formatDisplayTime(
                                                student?.latestUploadedAt,
                                              )}
                                            </td>
                                            <td>
                                              {canExpand ? (
                                                <button
                                                  type="button"
                                                  className="teacher-homework-expand-btn"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleHomeworkStudentExpand(
                                                      student,
                                                      studentIndex,
                                                    );
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
                                                <span className="teacher-homework-expand-placeholder">
                                                  -
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                          {expanded ? (
                                            <tr className="teacher-homework-detail-row">
                                              <td colSpan={7}>
                                                <div className="teacher-homework-file-list">
                                                  {files.map(
                                                    (file, fileIndex) => {
                                                      const fileId = String(
                                                        file?.id || "",
                                                      ).trim();
                                                      const downloading =
                                                        downloadingHomeworkFileId ===
                                                        fileId;
                                                      return (
                                                        <div
                                                          key={
                                                            fileId ||
                                                            `${rowKey}-file-${fileIndex + 1}`
                                                          }
                                                          className="teacher-homework-file-item"
                                                        >
                                                          <div className="teacher-homework-file-meta">
                                                            <strong>
                                                              {file?.name ||
                                                                "作业文件"}
                                                            </strong>
                                                            <span>
                                                              {formatFileSize(
                                                                file?.size,
                                                              )}
                                                            </span>
                                                            <small>{`上传于 ${formatDisplayTime(file?.uploadedAt)}`}</small>
                                                          </div>
                                                          <button
                                                            type="button"
                                                            className="teacher-icon-btn"
                                                            onClick={(
                                                              event,
                                                            ) => {
                                                              event.stopPropagation();
                                                              void onDownloadHomeworkFile(
                                                                file,
                                                              );
                                                            }}
                                                            disabled={
                                                              !fileId ||
                                                              downloading
                                                            }
                                                            title={
                                                              downloading
                                                                ? "下载中..."
                                                                : "下载作业"
                                                            }
                                                          >
                                                            <Download
                                                              size={14}
                                                            />
                                                          </button>
                                                        </div>
                                                      );
                                                    },
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          ) : null}
                                        </Fragment>
                                      );
                                    },
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                          {Array.isArray(
                            selectedHomeworkLesson?.unlistedStudents,
                          ) &&
                          selectedHomeworkLesson.unlistedStudents.length > 0 ? (
                            <p className="teacher-homework-unlisted-note">
                              {`另有 ${selectedHomeworkLesson.unlistedStudents.length} 位未在花名册内的学生提交了作业。`}
                            </p>
                          ) : null}

                        </div>
                      </>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {activePanel === "seat-fixed" ? (
              <div className="teacher-panel-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>座位管理</h2>
                    <p className="teacher-panel-save-time">
                      {`当前班级：${seatManageClassName || "--"} · 最近编辑：${formatDisplayTime(
                        currentSeatLayout.updatedAt,
                      )}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={onClearSeatLayoutAssignments}
                      disabled={
                        currentSeatFilledCount === 0 || currentSeatTeacherLocked
                      }
                    >
                      清空填写
                    </button>
                  </div>
                </header>

                <TeacherSeatFixedPanel
                  seatManageClassName={seatManageClassName}
                  classroomSeatClassOptions={classroomSeatClassOptions}
                  currentSeatLayout={currentSeatLayout}
                  currentSeatFilledCount={currentSeatFilledCount}
                  currentSeatTeacherLocked={currentSeatTeacherLocked}
                  currentSeatStudentFillEnabled={currentSeatStudentFillEnabled}
                  currentSeatStudentWritable={currentSeatStudentWritable}
                  userDirectoryItems={userDirectoryItems}
                  onUpdateSeatManageClassName={onUpdateSeatManageClassName}
                  onResizeSeatLayout={onResizeSeatLayout}
                  onToggleSeatTeacherLock={onToggleSeatTeacherLock}
                  onToggleSeatStudentFillEnabled={
                    onToggleSeatStudentFillEnabled
                  }
                  onUpdateSeatValue={onUpdateSeatValue}
                />
              </div>
            ) : null}

            {activePanel === "random-rollcall" ? (
              <div className="teacher-panel-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>随机点名</h2>
                    <p className="teacher-panel-save-time">
                      {`最近抽取：${formatDisplayTime(randomRollcallGeneratedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() => void loadOnlineSummary()}
                      disabled={onlineLoading}
                      aria-label={
                        onlineLoading ? "Refreshing" : "Refresh online users"
                      }
                    >
                      <RefreshCw
                        size={15}
                        className={onlineLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <section className="teacher-card teacher-random-rollcall-card">
                  <div className="teacher-random-rollcall-toolbar">
                    <div className="teacher-random-rollcall-control">
                      <span>班级范围</span>
                      <PortalSelect
                        className="teacher-random-rollcall-select"
                        value={randomRollcallClassName}
                        compact
                        ariaLabel="随机点名班级范围"
                        options={randomRollcallClassOptions}
                        onChange={setRandomRollcallClassName}
                      />
                    </div>
                    <div className="teacher-random-rollcall-control">
                      <span>候选来源</span>
                      <PortalSelect
                        className="teacher-random-rollcall-select"
                        value={randomRollcallSource}
                        compact
                        ariaLabel="随机点名候选来源"
                        options={randomRollcallSourceOptions}
                        onChange={setRandomRollcallSource}
                      />
                    </div>
                    <div className="teacher-random-rollcall-control">
                      <span>抽取人数</span>
                      <PortalSelect
                        className="teacher-random-rollcall-select"
                        value={randomRollcallCount}
                        compact
                        ariaLabel="随机点名人数"
                        options={RANDOM_ROLLCALL_COUNT_OPTIONS}
                        onChange={setRandomRollcallCount}
                      />
                    </div>
                  </div>

                  <div className="teacher-random-rollcall-meta">
                    <span>{`候选池 ${randomRollcallPool.length} 人`}</span>
                    <span>
                      {`可抽取 ${randomRollcallAvailablePool.length} 人${
                        randomRollcallNoRepeat ? "（不重复）" : ""
                      }`}
                    </span>
                    <label className="teacher-random-rollcall-switch">
                      <input
                        type="checkbox"
                        checked={randomRollcallNoRepeat}
                        onChange={(event) =>
                          setRandomRollcallNoRepeat(event.target.checked)
                        }
                      />
                      <span>同一范围不重复</span>
                    </label>
                  </div>

                  <div className="teacher-random-rollcall-actions">
                    <button
                      type="button"
                      className="teacher-primary-btn"
                      onClick={onStartRandomRollcall}
                    >
                      <ArrowUpDown size={14} />
                      <span>开始抽取</span>
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={onResetRandomRollcallUsedScope}
                      disabled={randomRollcallUsedSet.size === 0}
                    >
                      重置不重复池
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={() => {
                        setRandomRollcallResult([]);
                        setRandomRollcallError("");
                      }}
                      disabled={randomRollcallResult.length === 0}
                    >
                      清空结果
                    </button>
                  </div>

                  {randomRollcallError ? (
                    <p className="teacher-random-rollcall-error" role="alert">
                      {randomRollcallError}
                    </p>
                  ) : null}

                  {randomRollcallResult.length === 0 ? (
                    <p className="teacher-empty-text">
                      点击"开始抽取"后，在这里显示点名结果。
                    </p>
                  ) : (
                    <div className="teacher-random-rollcall-result-list">
                      {randomRollcallResult.map((item, index) => (
                        <article
                          key={`${item.key}-${index + 1}`}
                          className="teacher-random-rollcall-result-item"
                        >
                          <span className="teacher-random-rollcall-rank">{`#${index + 1}`}</span>
                          <strong>{item.label}</strong>
                          <small>{`${item.className || "-"} · ${item.hint || "-"}`}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {activePanel === "export-center" ? (
              <div className="teacher-panel-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>导出中心</h2>
                    <p className="teacher-panel-save-time">
                      统一导出聊天、群聊、图片、期末测试与归档记录
                    </p>
                  </div>
                </header>

                <section className="teacher-card teacher-export-center-card">
                  <div className="teacher-export-center-filter-card">
                    <div className="teacher-export-center-filter-head">
                      <h3>统一筛选</h3>
                      <p>
                        先选择授课教师、期末测试班级和日期，再按下方分类执行导出。日期仅作用于"按日期导出"的按钮。
                      </p>
                    </div>
                    <div className="teacher-export-center-filter-fields">
                      <label className="teacher-export-center-field">
                        <span>授课教师范围</span>
                        <PortalSelect
                          className="teacher-export-center-scope-select"
                          value={exportCenterScopeKey}
                          ariaLabel="导出授课教师"
                          options={exportCenterScopeOptions}
                          onChange={(value) => {
                            setExportCenterScopeKey(value);
                            setExportCenterError("");
                          }}
                          disabled={!!exportCenterLoading}
                          compact
                        />
                      </label>
                      <label className="teacher-export-center-field">
                        <span>期末测试班级</span>
                        <PortalSelect
                          className="teacher-export-center-scope-select"
                          value={exportCenterFinalTestClassName}
                          ariaLabel="期末测试导出班级"
                          options={FINAL_TEST_EXPORT_CLASS_OPTIONS}
                          onChange={(value) => {
                            setExportCenterFinalTestClassName(value);
                            setExportCenterError("");
                          }}
                          disabled={!!exportCenterLoading}
                          compact
                        />
                      </label>
                      <label className="teacher-export-center-field">
                        <span>导出日期</span>
                        <input
                          type="date"
                          className="teacher-export-center-date-input"
                          value={exportCenterDate}
                          onChange={(event) => {
                            setExportCenterDate(event.target.value);
                            setExportCenterError("");
                          }}
                          disabled={!!exportCenterLoading}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="teacher-export-center-grid">
                    <div className="teacher-export-center-group">
                      <h3>聊天记录</h3>
                      <p>{`面向"${exportCenterScopeLabel}"授课教师范围导出聊天内容，支持全量和按日期导出。`}</p>
                      <div className="teacher-export-center-actions">
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() => void onExportCenterChatsTxt()}
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "chats-txt"
                            ? "导出中..."
                            : "导出聊天数据（TXT）"}
                        </button>
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() => void onExportCenterChatsZip()}
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "chats-zip"
                            ? "打包中..."
                            : "导出聊天数据（ZIP 按用户）"}
                        </button>
                        <button
                          type="button"
                          className="teacher-primary-btn"
                          onClick={() => void onExportCenterChatsZipByDate()}
                          disabled={
                            !!exportCenterLoading ||
                            !isValidDateInputValue(exportCenterDate)
                          }
                        >
                          {exportCenterLoading === "chats-zip-date"
                            ? "打包中..."
                            : "导出指定日期聊天记录（ZIP）"}
                        </button>
                      </div>
                    </div>

                    <div className="teacher-export-center-group">
                      <h3>群聊与图片</h3>
                      <p>
                        群聊导出为 ZIP，内含聊天 TXT 与对应附件；图片记录单独导出为 TXT。
                      </p>
                      <div className="teacher-export-center-actions">
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() => void onExportCenterGroupChatsZip()}
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "group-chats"
                            ? "导出中..."
                            : "导出群聊聊天记录（ZIP 含附件）"}
                        </button>
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() =>
                            void onExportCenterGroupChatsZipByDate()
                          }
                          disabled={
                            !!exportCenterLoading ||
                            !isValidDateInputValue(exportCenterDate)
                          }
                        >
                          {exportCenterLoading === "group-chats-date"
                            ? "导出中..."
                            : "导出指定日期群聊记录（ZIP 含附件）"}
                        </button>
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() =>
                            void onExportCenterGeneratedImagesTxt()
                          }
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "images"
                            ? "导出中..."
                            : "导出学生生成图片记录（TXT）"}
                        </button>
                      </div>
                    </div>

                    <div className="teacher-export-center-group">
                      <h3>期末测试</h3>
                      <p>
                        {`导出"${exportCenterScopeLabel}"范围内的期末测试全过程痕迹。压缩包内同时包含 Excel 总表、CSV 总表，以及按学生拆分的中文明细 TXT 和 JSON。当前班级筛选：${
                          exportCenterFinalTestClassName === "all"
                            ? "全部班级"
                            : exportCenterFinalTestClassName
                        }。`}
                      </p>
                      <div className="teacher-export-center-actions">
                        <button
                          type="button"
                          className="teacher-primary-btn"
                          onClick={() => void onExportCenterFinalTestZip()}
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "final-test"
                            ? "打包中..."
                            : "导出期末测试痕迹（ZIP 含 Excel）"}
                        </button>
                      </div>
                    </div>

                    <div className="teacher-export-center-group">
                      <h3>账号与归档</h3>
                      <p>
                        导出账号密码清单，或一次性导出当前范围内的全部归档记录。
                      </p>
                      <div className="teacher-export-center-actions">
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() => void onExportCenterUsersTxt()}
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "users"
                            ? "导出中..."
                            : "导出账号密码数据（TXT）"}
                        </button>
                        <button
                          type="button"
                          className="teacher-primary-btn"
                          onClick={() => void onExportCenterAllRecordsZip()}
                          disabled={!!exportCenterLoading}
                        >
                          {exportCenterLoading === "all-records"
                            ? "打包中..."
                            : "导出全部记录（ZIP）"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="teacher-export-center-group danger">
                    <h3>数据清理</h3>
                    <p>{`将删除"${exportCenterScopeLabel}"授课教师范围内的会话与图片历史。`}</p>
                    <div className="teacher-export-center-actions">
                      <button
                        type="button"
                        className="teacher-delete-btn"
                        onClick={() => setExportCenterDeleteDialogOpen(true)}
                        disabled={!!exportCenterLoading}
                      >
                        {exportCenterLoading === "delete-scope-chats"
                          ? "删除中..."
                          : "删除当前授课教师的对话数据"}
                      </button>
                    </div>
                  </div>

                  {exportCenterError ? (
                    <p className="teacher-export-center-error" role="alert">
                      {exportCenterError}
                    </p>
                  ) : null}
                </section>
              </div>
            ) : null}

            {activePanel === "user-manage" ? (
              <div className="teacher-panel-stack teacher-user-manage-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>用户信息</h2>
                    <p className="teacher-panel-save-time">
                      {`最近刷新：${formatDisplayTime(userDirectoryUpdatedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions teacher-user-manage-head-actions">
                    <div
                      className="teacher-user-manage-head-stats"
                      aria-label="用户账号统计"
                    >
                      {isTerminalAdmin && userDirectoryHasUnsavedChanges ? (
                        <span className="teacher-user-manage-dirty-tag">
                          {`未保存修改 ${userDirectoryPendingChangeCount}`}
                        </span>
                      ) : null}
                      <article className="teacher-user-manage-head-stat">
                        <div className="teacher-user-manage-head-stat-main">
                          <span>总用户</span>
                          <strong>{userDirectorySummary.totalCount}</strong>
                        </div>
                        <button
                          type="button"
                          className="teacher-user-manage-head-info"
                          aria-label="总用户说明"
                        >
                          <CircleHelp size={13} />
                          <span
                            className="teacher-user-manage-head-tooltip"
                            role="tooltip"
                          >
                            平台内全部账号数量（学生 + 管理员）。
                          </span>
                        </button>
                      </article>
                      <article className="teacher-user-manage-head-stat">
                        <div className="teacher-user-manage-head-stat-main">
                          <span>学生用户</span>
                          <strong>{userDirectorySummary.studentCount}</strong>
                        </div>
                        <button
                          type="button"
                          className="teacher-user-manage-head-info"
                          aria-label="学生用户说明"
                        >
                          <CircleHelp size={13} />
                          <span
                            className="teacher-user-manage-head-tooltip"
                            role="tooltip"
                          >
                            {`分类内 ${userDirectorySummary.targetClassStudentCount} / 班级外 ${userDirectorySummary.otherClassStudentCount} / 未填写班级 ${userDirectorySummary.unassignedStudentCount}`}
                          </span>
                        </button>
                      </article>
                    </div>
                    <div className="teacher-user-manage-head-action-tools">
                      {isTerminalAdmin ? (
                        <button
                          type="button"
                          className="teacher-ghost-btn teacher-user-manage-create-btn teacher-action-icon-btn"
                          onClick={openUserCreateDialog}
                          disabled={
                            userDirectoryLoading || userDirectorySavingChanges
                          }
                          aria-label="新增用户"
                          title="新增用户"
                        >
                          <Plus size={14} />
                        </button>
                      ) : null}
                      {isTerminalAdmin ? (
                        <button
                          type="button"
                          className="teacher-primary-btn teacher-user-manage-save-btn teacher-action-icon-btn"
                          onClick={() => void onSaveUserDirectoryChanges()}
                          disabled={
                            !userDirectoryHasUnsavedChanges ||
                            userDirectorySavingChanges
                          }
                          aria-label={
                            userDirectorySavingChanges ? "保存中..." : "保存"
                          }
                          title={
                            userDirectorySavingChanges ? "保存中..." : "保存"
                          }
                        >
                          <Save
                            size={14}
                            className={
                              userDirectorySavingChanges ? "is-spinning" : ""
                            }
                          />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={onRefreshUserDirectory}
                      disabled={userDirectoryLoading}
                      aria-label={
                        userDirectoryLoading ? "Refreshing" : "Refresh users"
                      }
                    >
                      <RefreshCw
                        size={15}
                        className={userDirectoryLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <section className="teacher-card teacher-user-manage-list-card">
                  <div className="teacher-image-library-search-wrap">
                    <form
                      className="teacher-image-library-search"
                      onSubmit={onSubmitUserDirectorySearch}
                    >
                      <div className="teacher-image-search-input-wrap">
                        <Search size={14} />
                        <input
                          id="teacher-user-directory-keyword"
                          type="text"
                          aria-label="用户目录搜索"
                          value={userDirectorySearchInput}
                          onChange={(event) =>
                            setUserDirectorySearchInput(event.target.value)
                          }
                          placeholder="输入用户名/姓名/学号/班级"
                          maxLength={80}
                        />
                      </div>
                      <button
                        type="submit"
                        className="teacher-primary-btn"
                        disabled={userDirectoryLoading}
                      >
                        <span>搜索</span>
                      </button>
                    </form>

                    <div className="teacher-user-manage-filter-row">
                      <div className="teacher-user-manage-chip-panels">
                        <div className="teacher-user-manage-chip-group">
                          <span className="teacher-user-manage-chip-label">
                            角色
                          </span>
                          <div className="teacher-image-library-chip-group">
                            <button
                              type="button"
                              className={`teacher-image-chip${userDirectoryRoleFilter === "all" ? " active" : ""}`}
                              onClick={() => setUserDirectoryRoleFilter("all")}
                            >
                              {`全部 (${userDirectoryRoleCounts.all})`}
                            </button>
                            <button
                              type="button"
                              className={`teacher-image-chip${userDirectoryRoleFilter === "user" ? " active" : ""}`}
                              onClick={() => setUserDirectoryRoleFilter("user")}
                            >
                              {`学生 (${userDirectoryRoleCounts.user})`}
                            </button>
                            <button
                              type="button"
                              className={`teacher-image-chip${userDirectoryRoleFilter === "admin" ? " active" : ""}`}
                              onClick={() =>
                                setUserDirectoryRoleFilter("admin")
                              }
                            >
                              {`管理员 (${userDirectoryRoleCounts.admin})`}
                            </button>
                          </div>
                        </div>
                        <div className="teacher-user-manage-chip-group">
                          <span className="teacher-user-manage-chip-label">
                            班级
                          </span>
                          <div className="teacher-image-library-chip-group">
                            {userDirectoryClassFilterOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`teacher-image-chip${
                                  userDirectoryClassFilter === option.value
                                    ? " active"
                                    : ""
                                }`}
                                onClick={() =>
                                  setUserDirectoryClassFilter(option.value)
                                }
                              >
                                {`${option.label} (${Number(userDirectoryClassCounts[option.value] || 0)})`}
                              </button>
                            ))}
                            {isTerminalAdmin ? (
                              <button
                                type="button"
                                className="teacher-image-chip teacher-user-manage-add-class-chip"
                                onClick={() =>
                                  setUserClassCategoryDialog({
                                    open: true,
                                    className: "",
                                    error: "",
                                    saving: false,
                                  })
                                }
                              >
                                <Plus size={13} />
                                <span>新增班级</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="teacher-user-manage-filter-actions">
                        {isTerminalAdmin ? (
                          <button
                            type="button"
                            className="teacher-image-sort-btn teacher-user-manage-merge-btn"
                            onClick={openUserMergeDialog}
                            disabled={userMergeCandidates.length < 2}
                          >
                            <Link2 size={14} />
                            <span>账号合并</span>
                          </button>
                        ) : (
                          <span className="teacher-user-manage-limit-hint">
                            仅"上官福泽"可编辑/删除账号，账号合并仅限学生账号。
                          </span>
                        )}
                        <button
                          type="button"
                          className="teacher-image-sort-btn"
                          onClick={() =>
                            setUserDirectorySortBy((current) =>
                              current === "updated" ? "username" : "updated",
                            )
                          }
                        >
                          {userDirectorySortBy === "updated"
                            ? "排序：最近更新"
                            : "排序：账号"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {userDirectoryVisibleItems.length === 0 ? (
                    <div className="teacher-image-library-empty">
                      <Users size={28} />
                      <p>
                        {userDirectoryLoading
                          ? "正在加载用户列表..."
                          : "暂无匹配的用户信息。"}
                      </p>
                      {hasUserDirectoryFilters ? (
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={onClearUserDirectoryFilters}
                        >
                          清除筛选条件
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="teacher-user-manage-table-wrap">
                      <table className="teacher-user-manage-table">
                        <thead>
                          <tr>
                            <th>账号</th>
                            <th>角色</th>
                            <th>姓名</th>
                            <th>学号</th>
                            <th>班级</th>
                            <th>年级</th>
                            <th>性别</th>
                            <th>更新时间</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>{userDirectoryTableRows}</tbody>
                      </table>
                    </div>
                  )}
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
                      onClick={() => void onBackfillImageLibraryThumbnails()}
                      disabled={
                        imageLibraryLoading || imageLibraryBackfillLoading
                      }
                    >
                      <Sparkles
                        size={15}
                        className={
                          imageLibraryBackfillLoading ? "is-spinning" : ""
                        }
                      />
                      <span>
                        {imageLibraryBackfillLoading
                          ? "回填中..."
                          : "回填缩略图"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() => void loadImageLibrary()}
                      disabled={
                        imageLibraryLoading || imageLibraryBackfillLoading
                      }
                      aria-label={
                        imageLibraryLoading ? "Refreshing" : "Refresh images"
                      }
                    >
                      <RefreshCw
                        size={15}
                        className={imageLibraryLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <section className="teacher-card teacher-image-library-card">
                  <div className="teacher-image-library-search-wrap">
                    <form
                      className="teacher-image-library-search"
                      onSubmit={onSubmitImageLibrarySearch}
                    >
                      <div className="teacher-image-search-input-wrap">
                        <Search size={14} />
                        <input
                          id="teacher-image-library-keyword"
                          type="text"
                          aria-label="用户搜索"
                          value={imageLibrarySearchInput}
                          onChange={(event) =>
                            setImageLibrarySearchInput(event.target.value)
                          }
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
                            onClick={() =>
                              setImageLibraryClassFilter(item.className)
                            }
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
                        {imageLibrarySortBy === "latest"
                          ? "排序：最近生成"
                          : "排序：图片数量"}
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
                            : imageLibraryKeyword ||
                                imageLibraryClassFilter !== "all"
                              ? "没有匹配的用户图片，建议清除筛选后再试。"
                              : "暂未找到可管理的图片。"}
                        </p>
                        {imageLibraryKeyword ||
                        imageLibraryClassFilter !== "all" ? (
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
                        const groupKey = resolveImageLibraryGroupId(
                          group,
                          groupIndex,
                        );
                        const expanded =
                          expandedImageUserIds.includes(groupKey);
                        const images = Array.isArray(group?.images)
                          ? group.images
                          : [];
                        const avatar = String(
                          group?.studentName || group?.username || "图",
                        )
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
                              onClick={() =>
                                onToggleImageGroupExpand(group, groupIndex)
                              }
                            >
                              <span
                                className="teacher-image-user-avatar"
                                aria-hidden="true"
                              >
                                {avatar || "图"}
                              </span>
                              <div className="teacher-image-user-row-main">
                                <strong>
                                  {group?.studentName ||
                                    group?.username ||
                                    "未命名用户"}
                                </strong>
                                <span>
                                  {group?.username
                                    ? `@${group.username}`
                                    : "@-"}
                                </span>
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
                                  const imageId = String(
                                    image?.id || "",
                                  ).trim();
                                  const thumbnailPath = String(
                                    image?.thumbnailPath || "",
                                  ).trim();
                                  const previewPath = String(
                                    image?.previewPath || "",
                                  ).trim();
                                  const thumbnailUrl =
                                    buildAdminImagePreviewUrl(
                                      thumbnailPath || previewPath,
                                    );
                                  const previewUrl =
                                    buildAdminImagePreviewUrl(previewPath);
                                  const downloading =
                                    downloadingImageId === imageId;
                                  return (
                                    <article
                                      key={
                                        imageId ||
                                        `${groupKey}-image-${imageIndex + 1}`
                                      }
                                      className="teacher-image-thumb-item"
                                    >
                                      <div className="teacher-image-thumb-media">
                                        {thumbnailUrl ? (
                                          <img
                                            src={thumbnailUrl}
                                            alt={image?.prompt || "生成图片"}
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        ) : (
                                          <div className="teacher-image-thumb-empty">
                                            图片不可预览
                                          </div>
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
                                            onClick={() =>
                                              void onDownloadGeneratedImage(
                                                image,
                                              )
                                            }
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
                                        <span>
                                          {formatDisplayTime(image?.createdAt)}
                                        </span>
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
                    <h2>协作小教室管理</h2>
                    <p className="teacher-panel-save-time">
                      {`最近刷新：${formatDisplayTime(partyRoomManageUpdatedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() => void loadPartyRoomManage()}
                      disabled={partyRoomManageLoading}
                      aria-label={partyRoomManageLoading ? "刷新中" : "刷新"}
                      title={partyRoomManageLoading ? "刷新中" : "刷新"}
                    >
                      <RefreshCw
                        size={15}
                        className={partyRoomManageLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <p className="teacher-collab-classroom-note">
                  这里仅用于查看学生的实时协作进展并控制琳琳状态检测。教师不能进入小教室发言。
                </p>

                <section className="teacher-card teacher-party-manage-card">
                  <div className="teacher-party-manage-summary">
                    <span>{`小教室：${collaborationClassroomItems.length}`}</span>
                    <span>{`检测中：${collaborationClassroomItems.filter((room) => room?.paiaMonitoringEnabled === true).length}`}</span>
                  </div>

                  <div className="teacher-party-room-list">
                    {collaborationClassroomItems.length === 0 ? (
                      <p className="teacher-empty-text">
                        {partyRoomManageLoading
                          ? "正在读取协作小教室..."
                          : "当前暂无协作小教室。"}
                      </p>
                    ) : (
                      collaborationClassroomItems.map((room, roomIndex) => {
                        const roomId =
                          String(room?.id || "").trim() ||
                          `collaboration-classroom-${roomIndex + 1}`;
                        const students = (Array.isArray(room?.members)
                          ? room.members
                          : []
                        )
                          .filter(
                            (member) =>
                              String(member?.role || "")
                                .trim()
                                .toLowerCase() === "user",
                          )
                          .slice(0, 2);
                        const codingProgress = room?.codingProgress || null;
                        const monitoringEnabled =
                          room?.paiaMonitoringEnabled === true;
                        const updating = updatingMonitoringRoomId === roomId;
                        const findStudentName = (userId) =>
                          students.find(
                            (student) =>
                              String(student?.id || "") ===
                              String(userId || ""),
                          )?.displayName || "未分配";
                        return (
                          <article
                            key={roomId}
                            className="teacher-party-room-item teacher-collab-classroom-item"
                          >
                            <header className="teacher-party-room-head">
                              <div>
                                <h3>{room?.name || "未命名小教室"}</h3>
                                <p>{`学生 ${students.length}/2 · 最近更新 ${formatDisplayTime(room?.updatedAt)}`}</p>
                              </div>
                              <span
                                className={`teacher-collab-monitor-status${monitoringEnabled ? " is-enabled" : ""}`}
                              >
                                {monitoringEnabled ? "琳琳检测中" : "琳琳未检测"}
                              </span>
                            </header>

                            <div className="teacher-collab-monitor">
                              <div>
                                <strong>琳琳状态检测</strong>
                                <span>
                                  {monitoringEnabled
                                    ? `已于 ${formatDisplayTime(room?.paiaMonitoringStartedAt)} 启动，正在分析启动后的协作行为。`
                                    : "启动后，琳琳才会记录协作行为并在需要时主动提示。"}
                                </span>
                              </div>
                              <button
                                type="button"
                                className={
                                  monitoringEnabled
                                    ? "teacher-ghost-btn teacher-collab-monitor-toggle"
                                    : "teacher-primary-btn teacher-collab-monitor-toggle"
                                }
                                onClick={() =>
                                  void onToggleClassroomMonitoring(room)
                                }
                                disabled={updatingMonitoringRoomId !== ""}
                              >
                                {updating
                                  ? "处理中..."
                                  : monitoringEnabled
                                    ? "停止检测"
                                    : "启动检测"}
                              </button>
                            </div>

                            {codingProgress ? (
                              <div className="teacher-party-coding-progress">
                                <div>
                                  <strong>实时协作进展</strong>
                                  <span>{PARTY_TASK_STAGE_LABELS[codingProgress.taskStage] || "理解任务"}</span>
                                  <span>{`代码版本 ${Number(codingProgress.revision || 0)}`}</span>
                                  <span>{`已交棒 ${Number(codingProgress.roleRotationCount || 0)} 次`}</span>
                                </div>
                                <div>
                                  <span>{`Driver：${findStudentName(codingProgress.driverUserId)}`}</span>
                                  <span>{`Navigator：${findStudentName(codingProgress.navigatorUserId)}`}</span>
                                  <span>
                                    {codingProgress.lastPreviewAt
                                      ? `最近预览：${formatDisplayTime(codingProgress.lastPreviewAt)}`
                                      : "尚未预览"}
                                  </span>
                                  <span
                                    className={
                                      Number(codingProgress.diagnosticCount || 0) > 0
                                        ? "has-errors"
                                        : ""
                                    }
                                  >
                                    {Number(codingProgress.diagnosticCount || 0) > 0
                                      ? `${codingProgress.diagnosticCount} 个待检查问题`
                                      : "未发现基础结构问题"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <p className="teacher-collab-waiting-text">
                                学生尚未开始本次网页协作。
                              </p>
                            )}

                            <div className="teacher-party-member-list">
                              {students.length === 0 ? (
                                <span className="teacher-party-member-chip muted">
                                  暂无学生
                                </span>
                              ) : (
                                students.map((student, studentIndex) => (
                                  <span
                                    key={
                                      String(student?.id || "").trim() ||
                                      `${roomId}-student-${studentIndex + 1}`
                                    }
                                    className="teacher-party-member-chip"
                                    title={formatPartyMemberDetail(student)}
                                  >
                                    <span className="teacher-party-member-name">
                                      {readPartyMemberDisplayName(student)}
                                    </span>
                                  </span>
                                ))
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

            {activePanel === "group-chat-manage" ? (
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
                      className="teacher-primary-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={openPartyRoomCreateDialog}
                      disabled={partyRoomManageLoading}
                      aria-label="Create group chat"
                      title="Create group chat"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() => void loadPartyRoomManage()}
                      disabled={partyRoomManageLoading}
                      aria-label={
                        partyRoomManageLoading ? "Refreshing" : "Refresh"
                      }
                    >
                      <RefreshCw
                        size={15}
                        className={partyRoomManageLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <section className="teacher-card teacher-party-manage-card">
                  <div className="teacher-party-manage-summary">
                    <span>{`群聊总数：${visiblePartyRoomSummary.roomCount}/${partyRoomSummary.roomCount}`}</span>
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
                          全部群主
                        </button>
                        {partyRoomOwnerOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`teacher-party-owner-chip${partyRoomOwnerFilter === option.id ? " active" : ""}`}
                            onClick={() => setPartyRoomOwnerFilter(option.id)}
                          >
                            {option.username
                              ? `${option.label} (@${option.username})`
                              : option.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="teacher-party-sort-btn"
                        onClick={() =>
                          setPartyRoomSortBy((current) =>
                            current === "admin-order"
                              ? "updated"
                              : "admin-order",
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
                        onChange={(event) =>
                          setPartyRoomMemberSearchInput(event.target.value)
                        }
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
                          ? "正在读取群聊列表..."
                          : partyRoomOwnerFilter !== "all" ||
                              String(partyRoomMemberSearchInput || "").trim()
                            ? "未找到符合条件的群聊，请调整筛选条件。"
                            : "当前暂无已创建的群聊。"}
                      </p>
                    ) : (
                      visiblePartyRoomItems.map((room, roomIndex) => {
                        const roomId =
                          String(room?.id || "").trim() ||
                          `party-room-${roomIndex + 1}`;
                        const members = Array.isArray(room?.members)
                          ? room.members
                          : [];
                        const roomCode = String(room?.roomCode || "").trim();
                        const dissolvingThisRoom =
                          dissolvingPartyRoomId === roomId;
                        const codingProgress = room?.codingProgress || null;
                        const findMemberName = (userId) => members.find(
                          (member) => String(member?.id || "") === String(userId || ""),
                        )?.displayName || "未分配";
                        return (
                          <article
                            key={roomId}
                            className="teacher-party-room-item"
                          >
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
                                    className={`teacher-ghost-btn teacher-party-room-action-btn teacher-party-room-action-icon-btn${
                                      copiedPartyRoomId === roomId
                                        ? " is-active"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      void onCopyPartyRoomCode(room)
                                    }
                                    disabled={!roomCode}
                                    aria-label={
                                      copiedPartyRoomId === roomId
                                        ? "派号已复制"
                                        : "复制派号"
                                    }
                                    title={
                                      copiedPartyRoomId === roomId
                                        ? "派号已复制"
                                        : "复制派号"
                                    }
                                  >
                                    <Copy size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="teacher-ghost-btn teacher-party-room-action-btn teacher-party-room-action-icon-btn teacher-party-room-action-danger-btn"
                                    onClick={() =>
                                      void onDissolvePartyRoom(room)
                                    }
                                    disabled={dissolvingThisRoom}
                                    aria-label="解散派"
                                    title="解散派"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </header>
                            {codingProgress ? <div className="teacher-party-coding-progress">
                              <div>
                                <strong>网页结对进展</strong>
                                <span>{PARTY_TASK_STAGE_LABELS[codingProgress.taskStage] || "理解任务"}</span>
                                <span>{`代码版本 ${Number(codingProgress.revision || 0)}`}</span>
                                <span>{`已交棒 ${Number(codingProgress.roleRotationCount || 0)} 次`}</span>
                              </div>
                              <div>
                                <span>{`Driver：${findMemberName(codingProgress.driverUserId)}`}</span>
                                <span>{`Navigator：${findMemberName(codingProgress.navigatorUserId)}`}</span>
                                <span>{codingProgress.lastPreviewAt
                                  ? `最近预览：${formatDisplayTime(codingProgress.lastPreviewAt)}`
                                  : "尚未预览"}</span>
                                <span className={Number(codingProgress.diagnosticCount || 0) > 0 ? "has-errors" : ""}>
                                  {Number(codingProgress.diagnosticCount || 0) > 0
                                    ? `${codingProgress.diagnosticCount} 个待检查问题`
                                    : "未发现基础结构问题"}
                                </span>
                              </div>
                            </div> : null}
                            <div className="teacher-party-member-list">
                              {members.length === 0 ? (
                                <span className="teacher-party-member-chip muted">
                                  暂无成员
                                </span>
                              ) : (
                                members.map((member, memberIndex) => {
                                  const memberId =
                                    String(member?.id || "").trim() ||
                                    `${roomId}-member-${memberIndex + 1}`;
                                  const isOwner =
                                    String(room?.owner?.id || "").trim() ===
                                    String(member?.id || "").trim();
                                  return (
                                    <span
                                      key={memberId}
                                      className={`teacher-party-member-chip${isOwner ? " owner" : ""}${
                                        roomIndex === 0 ? " tooltip-below" : ""
                                      }`}
                                      title={formatPartyMemberDetail(member)}
                                    >
                                      {isOwner ? <Crown size={12} /> : null}
                                      <span className="teacher-party-member-name">
                                        {readPartyMemberDisplayName(member)}
                                      </span>
                                      <span
                                        className="teacher-party-member-tooltip"
                                        role="tooltip"
                                      >
                                        <strong>
                                          {readPartyMemberDisplayName(member)}
                                        </strong>
                                        <small>
                                          {String(member?.role || "")
                                            .trim()
                                            .toLowerCase() === "admin"
                                            ? "管理员"
                                            : String(member?.role || "")
                                                  .trim()
                                                  .toLowerCase() === "user"
                                              ? "学生"
                                              : "成员"}
                                          {member?.className
                                            ? ` · ${member.className}`
                                            : ""}
                                        </small>
                                        {member?.studentId ? (
                                          <small>{member.studentId}</small>
                                        ) : null}
                                        {member?.username ? (
                                          <small>{`@${member.username}`}</small>
                                        ) : null}
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
              <div className="teacher-panel-stack teacher-online-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>在线状态</h2>
                    <p>{`最近刷新：${formatDisplayTime(onlineGeneratedAt)}`}</p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={() => void loadOnlineSummary()}
                      disabled={onlineLoading}
                      data-tooltip={onlineLoading ? "刷新中..." : "刷新在线状态"}
                      title={onlineLoading ? "刷新中..." : "刷新在线状态"}
                      aria-label={onlineLoading ? "刷新中..." : "刷新在线状态"}
                    >
                      <RefreshCw
                        size={15}
                        className={onlineLoading ? "is-spinning" : ""}
                      />
                    </button>
                  </div>
                </header>

                <div className="teacher-online-class-tabs">
                  {classOnlineSummaries.map((item) => (
                    <button
                      key={item.className}
                      type="button"
                      className={`teacher-online-class-tab${onlineClassFilter === item.className ? " active" : ""}`}
                      onClick={() => setOnlineClassFilter(item.className)}
                    >
                      <span className="teacher-online-tab-name">
                        {item.className}
                      </span>
                      <span className={`teacher-online-tab-badge${item.count > 0 ? " has-users" : ""}`}>
                        {onlineLoading ? "--" : item.count}
                      </span>
                      <span className="teacher-online-tab-rule">
                        <CircleHelp size={11} />
                        <span className="teacher-online-rule-tooltip">
                          {item.ruleText}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <section className="teacher-card teacher-online-list-card">
                  {(() => {
                    const currentSummary = classOnlineSummaries.find(
                      (s) => s.className === onlineClassFilter,
                    );
                    return (
                      <>
                        <div className="teacher-online-list-head">
                          <div className="teacher-online-list-head-left">
                            <h3>{onlineClassFilter}</h3>
                            <span className="teacher-online-total-count">
                              {`在线 ${filteredOnlineUsers.length} 人`}
                            </span>
                            {currentSummary?.count > 0 ? (
                              <span className="teacher-online-recent-hint">
                                {`最近活跃：${formatDisplayTime(currentSummary.recent)}`}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {filteredOnlineUsers.length === 0 ? (
                          <p className="teacher-empty-text">
                            {onlineLoading
                              ? "正在加载在线数据…"
                              : "当前该班暂无在线用户。"}
                          </p>
                        ) : (
                          <div className="teacher-online-table-wrap">
                            <table className="teacher-online-table">
                              <thead>
                                <tr>
                                  <th>姓名</th>
                                  <th>学号</th>
                                  <th>账号</th>
                                  <th>最近活跃</th>
                                  <th>浏览器心跳</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredOnlineUsers.map((item) => (
                                  <tr
                                    key={
                                      item.userId ||
                                      `${item.username}-${item.lastSeenAt}`
                                    }
                                  >
                                    <td>{item?.profile?.name || "-"}</td>
                                    <td>
                                      {item?.profile?.studentId || "-"}
                                    </td>
                                    <td>{item.username || "-"}</td>
                                    <td>
                                      {formatDisplayTime(item.lastSeenAt)}
                                    </td>
                                    <td>
                                      {formatDisplayTime(
                                        item.browserHeartbeatAt,
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              </div>
            ) : null}
          </div>
          {exportCenterDeleteDialogOpen ? (
            <div
              className="teacher-confirm-overlay"
              role="presentation"
              onClick={() => setExportCenterDeleteDialogOpen(false)}
            >
              <div
                className="teacher-confirm-card"
                role="dialog"
                aria-modal="true"
                aria-label="删除授课教师对话数据"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>{`删除"${exportCenterScopeLabel}"授课教师的对话数据`}</h3>
                <p>
                  此操作会清空当前授课教师范围内的用户会话与图片历史，其他范围数据不会被删除。
                </p>
                <div className="teacher-confirm-actions">
                  <button
                    type="button"
                    className="teacher-ghost-btn"
                    onClick={() => setExportCenterDeleteDialogOpen(false)}
                    disabled={exportCenterLoading === "delete-scope-chats"}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="teacher-delete-btn"
                    onClick={() => void onDeleteCurrentTeacherScopeChats()}
                    disabled={exportCenterLoading === "delete-scope-chats"}
                  >
                    {exportCenterLoading === "delete-scope-chats"
                      ? "删除中..."
                      : "确认删除"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {partyRoomCreateDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closePartyRoomCreateDialog}
            >
              <div
                className="teacher-time-card teacher-party-create-card"
                role="dialog"
                aria-modal="true"
                aria-label="后台新建群聊"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>后台新建群聊</h3>
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitPartyRoomCreateDialog}
                >
                  <div className="teacher-party-create-basic-row">
                    <label>
                      <span>群聊名称（必填）</span>
                      <input
                        type="text"
                        value={partyRoomCreateDialog.name}
                        onChange={(event) =>
                          setPartyRoomCreateDialog((current) => ({
                            ...current,
                            name: event.target.value,
                            error: "",
                          }))
                        }
                        maxLength={80}
                        autoFocus
                      />
                    </label>
                    <label>
                      <span>群主（必选）</span>
                      <select
                        value={partyRoomCreateDialog.ownerUserId}
                        onChange={(event) =>
                          onChangePartyRoomCreateOwner(event.target.value)
                        }
                      >
                        <option value="">请选择群主</option>
                        {partyRoomCreateOwnerOptions.map((item) => (
                          <option
                            key={`party-owner-${item.id}`}
                            value={item.id}
                          >
                            {`${item.displayName}${
                              item.username ? ` (@${item.username})` : ""
                            } · ${readUserRoleLabel(item.role)}${
                              item.role === "user" && item.className
                                ? ` · ${item.className}`
                                : ""
                            }`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="teacher-party-create-members">
                    <div className="teacher-party-create-members-head">
                      <div className="teacher-party-create-members-head-left">
                        <span>群成员（可多选）</span>
                        <span className="teacher-party-create-members-hint">
                          {`最多 ${PARTY_ROOM_CREATE_MAX_MEMBERS} 人（含群主）`}
                        </span>
                      </div>
                      <span>
                        {`已选 ${partyRoomCreateSelectedMemberCount}/${PARTY_ROOM_CREATE_MAX_MEMBERS} 人`}
                      </span>
                    </div>
                    <div className="teacher-party-create-member-search">
                      <Search size={13} />
                      <input
                        type="text"
                        value={partyRoomCreateDialog.memberKeyword}
                        onChange={(event) =>
                          setPartyRoomCreateDialog((current) => ({
                            ...current,
                            memberKeyword: event.target.value,
                            error: "",
                          }))
                        }
                        placeholder="搜索成员（姓名/账号/学号/班级）"
                        maxLength={80}
                      />
                      {String(
                        partyRoomCreateDialog.memberKeyword || "",
                      ).trim() ? (
                        <button
                          type="button"
                          className="teacher-party-create-search-clear"
                          onClick={() =>
                            setPartyRoomCreateDialog((current) => ({
                              ...current,
                              memberKeyword: "",
                            }))
                          }
                          aria-label="清除成员搜索"
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                    </div>
                    <div className="teacher-party-create-member-list">
                      {partyRoomCreateVisibleMemberOptions.length === 0 ? (
                        <p className="teacher-party-create-empty">
                          暂无匹配成员
                        </p>
                      ) : (
                        partyRoomCreateVisibleMemberOptions.map((member) => {
                          const ownerUserId = String(
                            partyRoomCreateDialog.ownerUserId || "",
                          ).trim();
                          const isOwner =
                            ownerUserId && ownerUserId === member.id;
                          const checked =
                            isOwner ||
                            partyRoomCreateDialog.memberUserIds.includes(
                              member.id,
                            );
                          const checkboxDisabled =
                            isOwner ||
                            (!checked && partyRoomCreateSelectionAtLimit);
                          return (
                            <label
                              key={`party-member-${member.id}`}
                              className={`teacher-party-create-member-item${checked ? " checked" : ""}${
                                isOwner ? " owner" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  onTogglePartyRoomCreateMember(member.id)
                                }
                                disabled={checkboxDisabled}
                              />
                              <div className="teacher-party-create-member-main">
                                <strong>{member.displayName}</strong>
                                <small>
                                  {`${readUserRoleLabel(member.role)}${
                                    member.className
                                      ? ` · ${member.className}`
                                      : ""
                                  }${member.studentId ? ` · ${member.studentId}` : ""}${
                                    member.username
                                      ? ` · @${member.username}`
                                      : ""
                                  }`}
                                </small>
                              </div>
                              {isOwner ? (
                                <span className="teacher-party-create-owner-tag">
                                  群主
                                </span>
                              ) : null}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                  {partyRoomCreateDialog.error ? (
                    <span className="teacher-confirm-error">
                      {partyRoomCreateDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={() =>
                        setPartyRoomCreateDialog((current) => ({
                          ...current,
                          memberUserIds: current.ownerUserId
                            ? [current.ownerUserId]
                            : [],
                        }))
                      }
                    >
                      仅保留群主
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closePartyRoomCreateDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={partyRoomCreateDialog.saving}
                    >
                      {partyRoomCreateDialog.saving ? "创建中..." : "确认创建"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {userClassCategoryDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closeUserClassCategoryDialog}
            >
              <div
                className="teacher-time-card"
                role="dialog"
                aria-modal="true"
                aria-label="新增班级分类"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>新增班级分类</h3>
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitUserClassCategoryDialog}
                >
                  <label>
                    <span>班级名称</span>
                    <input
                      type="text"
                      value={userClassCategoryDialog.className}
                      onChange={(event) =>
                        setUserClassCategoryDialog((current) => ({
                          ...current,
                          className: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={40}
                      autoFocus
                    />
                  </label>
                  {userClassCategoryDialog.error ? (
                    <span className="teacher-confirm-error">
                      {userClassCategoryDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeUserClassCategoryDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={userClassCategoryDialog.saving}
                    >
                      {userClassCategoryDialog.saving
                        ? "创建中..."
                        : "确认新增"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {userCreateDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closeUserCreateDialog}
            >
              <div
                className="teacher-time-card"
                role="dialog"
                aria-modal="true"
                aria-label="新增用户账号"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>新增用户账号</h3>
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitUserCreateDialog}
                >
                  <label>
                    <span>账号（必填）</span>
                    <input
                      type="text"
                      value={userCreateDialog.username}
                      onChange={(event) =>
                        setUserCreateDialog((current) => ({
                          ...current,
                          username: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={64}
                      autoFocus
                    />
                  </label>
                  <label>
                    <span>密码（必填）</span>
                    <input
                      type="password"
                      value={userCreateDialog.password}
                      onChange={(event) =>
                        setUserCreateDialog((current) => ({
                          ...current,
                          password: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={128}
                    />
                  </label>
                  <label>
                    <span>姓名（必填）</span>
                    <input
                      type="text"
                      value={userCreateDialog.name}
                      onChange={(event) =>
                        setUserCreateDialog((current) => ({
                          ...current,
                          name: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={20}
                    />
                  </label>
                  <label>
                    <span>学号（必填）</span>
                    <input
                      type="text"
                      value={userCreateDialog.studentId}
                      onChange={(event) =>
                        setUserCreateDialog((current) => ({
                          ...current,
                          studentId: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 20),
                          error: "",
                        }))
                      }
                      maxLength={20}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    <span>归属班级（必填）</span>
                    <select
                      value={userCreateDialog.className}
                      onChange={(event) =>
                        setUserCreateDialog((current) => ({
                          ...current,
                          className: String(event.target.value || "").trim(),
                          error: "",
                        }))
                      }
                    >
                      <option value="">请选择班级</option>
                      {userCreateClassOptions.map((className) => (
                        <option
                          key={`create-class-${className}`}
                          value={className}
                        >
                          {className}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="teacher-user-manage-dialog-grid">
                    <label>
                      <span>年级（选填）</span>
                      <select
                        value={userCreateDialog.grade}
                        onChange={(event) =>
                          setUserCreateDialog((current) => ({
                            ...current,
                            grade: event.target.value,
                            error: "",
                          }))
                        }
                      >
                        <option value="">请选择年级</option>
                        {GRADE_OPTIONS.map((item) => (
                          <option key={`create-grade-${item}`} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>性别（选填）</span>
                      <select
                        value={userCreateDialog.gender}
                        onChange={(event) =>
                          setUserCreateDialog((current) => ({
                            ...current,
                            gender: event.target.value,
                            error: "",
                          }))
                        }
                      >
                        <option value="">请选择性别</option>
                        {GENDER_OPTIONS.map((item) => (
                          <option key={`create-gender-${item}`} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>是否绑定老师</span>
                    <select
                      value={
                        userCreateForcedTeacherScopeKey ||
                        userCreateDialog.bindTeacher
                          ? "yes"
                          : "no"
                      }
                      disabled={!!userCreateForcedTeacherScopeKey}
                      onChange={(event) =>
                        setUserCreateDialog((current) => {
                          const nextBindTeacher = event.target.value === "yes";
                          return {
                            ...current,
                            bindTeacher: nextBindTeacher,
                            lockedTeacherScopeKey: nextBindTeacher
                              ? current.lockedTeacherScopeKey ||
                                USER_CREATE_DEFAULT_TEACHER_SCOPE_KEY
                              : current.lockedTeacherScopeKey,
                            error: "",
                          };
                        })
                      }
                    >
                      <option value="no">不绑定</option>
                      <option value="yes">绑定</option>
                    </select>
                  </label>
                  {userCreateForcedTeacherScopeKey ? (
                    <span className="teacher-time-form-hint">
                      {`该班级按系统规则自动绑定为「${userCreateForcedTeacherScopeLabel || "指定老师"}」。`}
                    </span>
                  ) : null}
                  {userCreateForcedTeacherScopeKey ||
                  userCreateDialog.bindTeacher ? (
                    <label>
                      <span>绑定老师</span>
                      <select
                        value={
                          userCreateForcedTeacherScopeKey ||
                          userCreateDialog.lockedTeacherScopeKey
                        }
                        disabled={!!userCreateForcedTeacherScopeKey}
                        onChange={(event) =>
                          setUserCreateDialog((current) => ({
                            ...current,
                            lockedTeacherScopeKey: event.target.value,
                            error: "",
                          }))
                        }
                      >
                        {USER_CREATE_BINDABLE_TEACHER_SCOPE_OPTIONS.map(
                          (item) => (
                            <option
                              key={`create-bind-teacher-${item.key}`}
                              value={item.key}
                            >
                              {item.label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ) : null}
                  {userCreateDialog.error ? (
                    <span className="teacher-confirm-error">
                      {userCreateDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeUserCreateDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={userCreateDialog.saving}
                    >
                      {userCreateDialog.saving ? "创建中..." : "创建用户"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {userEditDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closeUserEditDialog}
            >
              <div
                className="teacher-time-card"
                role="dialog"
                aria-modal="true"
                aria-label="编辑用户信息"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>编辑账号信息</h3>
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitUserEditDialog}
                >
                  <label>
                    <span>账号</span>
                    <input
                      type="text"
                      value={userEditDialog.username}
                      onChange={(event) =>
                        setUserEditDialog((current) => ({
                          ...current,
                          username: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={64}
                    />
                  </label>
                  <label>
                    <span>姓名</span>
                    <input
                      type="text"
                      value={userEditDialog.name}
                      onChange={(event) =>
                        setUserEditDialog((current) => ({
                          ...current,
                          name: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={20}
                    />
                  </label>
                  <label>
                    <span>学号</span>
                    <input
                      type="text"
                      value={userEditDialog.studentId}
                      onChange={(event) =>
                        setUserEditDialog((current) => ({
                          ...current,
                          studentId: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={20}
                    />
                  </label>
                  <label>
                    <span>班级</span>
                    <input
                      type="text"
                      value={userEditDialog.className}
                      onChange={(event) =>
                        setUserEditDialog((current) => ({
                          ...current,
                          className: event.target.value,
                          error: "",
                        }))
                      }
                      maxLength={40}
                    />
                  </label>
                  <div className="teacher-user-manage-dialog-grid">
                    <label>
                      <span>年级</span>
                      <select
                        value={userEditDialog.grade}
                        onChange={(event) =>
                          setUserEditDialog((current) => ({
                            ...current,
                            grade: event.target.value,
                            error: "",
                          }))
                        }
                      >
                        <option value="">请选择年级</option>
                        {userEditGradeOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>性别</span>
                      <select
                        value={userEditDialog.gender}
                        onChange={(event) =>
                          setUserEditDialog((current) => ({
                            ...current,
                            gender: event.target.value,
                            error: "",
                          }))
                        }
                      >
                        <option value="">请选择性别</option>
                        {userEditGenderOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>二次确认（输入"确认修改"，加入待保存）</span>
                    <input
                      type="text"
                      value={userEditDialog.confirmText}
                      onChange={(event) =>
                        setUserEditDialog((current) => ({
                          ...current,
                          confirmText: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="请输入：确认修改"
                    />
                  </label>
                  {userEditDialog.error ? (
                    <span className="teacher-confirm-error">
                      {userEditDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeUserEditDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={userEditDialog.saving}
                    >
                      {userEditDialog.saving ? "处理中..." : "加入待保存"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {userDeleteDialog.open ? (
            <div
              className="teacher-confirm-overlay"
              role="presentation"
              onClick={closeUserDeleteDialog}
            >
              <div
                className="teacher-confirm-card"
                role="dialog"
                aria-modal="true"
                aria-label="删除账号确认"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>删除账号</h3>
                <p>
                  {`将删除账号「${userDeleteDialog.username || "--"}」。操作会进入待保存，点击右上角"保存"后才会真正执行。请输入"确认删除"继续。`}
                </p>
                <form
                  className="teacher-confirm-form"
                  onSubmit={onSubmitUserDeleteDialog}
                >
                  <input
                    type="text"
                    value={userDeleteDialog.confirmText}
                    onChange={(event) =>
                      setUserDeleteDialog((current) => ({
                        ...current,
                        confirmText: event.target.value,
                        error: "",
                      }))
                    }
                    placeholder="请输入：确认删除"
                  />
                  {userDeleteDialog.error ? (
                    <span className="teacher-confirm-error">
                      {userDeleteDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-confirm-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeUserDeleteDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={userDeleteDialog.deleting}
                    >
                      {userDeleteDialog.deleting ? "处理中..." : "加入待保存"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {userMergeDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closeUserMergeDialog}
            >
              <div
                className="teacher-time-card"
                role="dialog"
                aria-modal="true"
                aria-label="账号合并"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>学生账号合并</h3>
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitUserMergeDialog}
                >
                  <label>
                    <span>源账号（将被合并并删除）</span>
                    <select
                      value={userMergeDialog.sourceUserId}
                      onChange={(event) =>
                        setUserMergeDialog((current) => ({
                          ...current,
                          sourceUserId: event.target.value,
                          error: "",
                        }))
                      }
                    >
                      <option value="">请选择源账号</option>
                      {userMergeCandidates.map((item) => (
                        <option key={`source-${item.id}`} value={item.id}>
                          {`${item.label}${item.studentId ? `（${item.studentId}）` : ""}${
                            item.className ? ` · ${item.className}` : ""
                          } @${item.username}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>目标账号（保留账号）</span>
                    <select
                      value={userMergeDialog.targetUserId}
                      onChange={(event) =>
                        setUserMergeDialog((current) => ({
                          ...current,
                          targetUserId: event.target.value,
                          error: "",
                        }))
                      }
                    >
                      <option value="">请选择目标账号</option>
                      {userMergeCandidates.map((item) => (
                        <option key={`target-${item.id}`} value={item.id}>
                          {`${item.label}${item.studentId ? `（${item.studentId}）` : ""}${
                            item.className ? ` · ${item.className}` : ""
                          } @${item.username}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>二次确认（输入"确认合并"）</span>
                    <input
                      type="text"
                      value={userMergeDialog.confirmText}
                      onChange={(event) =>
                        setUserMergeDialog((current) => ({
                          ...current,
                          confirmText: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="请输入：确认合并"
                    />
                  </label>
                  {userMergeDialog.error ? (
                    <span className="teacher-confirm-error">
                      {userMergeDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeUserMergeDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={userMergeDialog.merging}
                    >
                      {userMergeDialog.merging ? "合并中..." : "确认合并"}
                    </button>
                  </div>
                </form>
              </div>
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
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitTimeEditorDialog}
                >
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
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitRenameLessonDialog}
                >
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
                    <span className="teacher-confirm-error">
                      {renameLessonDialog.error}
                    </span>
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
                    ? `将删除 ${deleteConfirmDialog.targetIds.length} 节课，删除后无法恢复。请输入"确认删除"继续。`
                    : `该课时删除后无法恢复。请输入"确认删除"继续。`}
                </p>
                <form
                  onSubmit={onSubmitDeleteConfirmDialog}
                  className="teacher-confirm-form"
                >
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
                    <span className="teacher-confirm-error">
                      {deleteConfirmDialog.error}
                    </span>
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
        {featureTransition.active ? (
          <div
            className="teacher-home-route-transition"
            role="status"
            aria-live="polite"
          >
            <div className="teacher-home-route-transition-card">
              <div className="teacher-home-route-transition-spinner">
                <RefreshCw size={18} className="is-spinning" />
              </div>
              <strong>{featureTransition.label || "正在切换页面..."}</strong>
              <span>正在准备页面内容，请稍候。</span>
            </div>
          </div>
        ) : null}
        {error ||
        uploadingFiles ||
        downloadingFileId ||
        imageLibraryNotice ||
        exportCenterNotice ||
        classroomSaveNotice ||
        pageRefreshState === "success" ? (
          <div className="teacher-home-toast-wrap" aria-live="polite">
            {error ? (
              <p
                className="teacher-home-alert error teacher-home-toast"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            {uploadingFiles ? (
              <p className="teacher-home-alert info teacher-home-toast" role="status">
                {TASK_FILE_UPLOAD_STATUS_TEXT}
              </p>
            ) : null}
            {downloadingFileId ? (
              <p className="teacher-home-alert info teacher-home-toast" role="status">
                {TASK_FILE_DOWNLOAD_STATUS_TEXT}
              </p>
            ) : null}
            {pageRefreshState === "success" ? (
              <p
                className="teacher-home-alert success teacher-home-toast teacher-home-toast-fade teacher-home-refresh-toast"
                role="status"
              >
                {`已刷新为最新数据 · ${formatDisplayTime(classroomUpdatedAt)}`}
              </p>
            ) : null}
            {imageLibraryNotice ? (
              <p
                className="teacher-home-alert success teacher-home-toast teacher-home-toast-fade teacher-home-refresh-toast"
                role="status"
              >
                {imageLibraryNotice}
              </p>
            ) : null}
            {classroomSaveNotice ? (
              <p
                className="teacher-home-alert success teacher-home-toast teacher-home-toast-fade"
                role="status"
              >
                {classroomSaveNotice}
              </p>
            ) : null}
            {exportCenterNotice ? (
              <p
                className="teacher-home-alert success teacher-home-toast teacher-home-toast-fade"
                role="status"
              >
                {exportCenterNotice}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

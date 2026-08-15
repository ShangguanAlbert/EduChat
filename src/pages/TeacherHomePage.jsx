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
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalSelect from "../components/PortalSelect.jsx";
import TeacherRoomMemoryDialog from "../features/admin/components/TeacherRoomMemoryDialog.jsx";
import {
  CLASSROOM_FILE_KIND_TASK,
  getClassroomFileDownloadErrorText,
  getClassroomFileFallbackName,
} from "../../shared/classroomFileLabels.js";
import {
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
  STUDENT_TEACHER_SCOPE_OPTIONS,
  TEACHER_SCOPE_OPTIONS,
  YANG_JUNFENG_TEACHER_SCOPE_KEY,
  getTeacherScopeLabel,
} from "../../shared/teacherScopes.js";
import {
  backfillAdminGeneratedImageThumbnails,
  bindAdminUserDirectoryStudent,
  createAdminCollaborationClassroom,
  createAdminTeachingCourseClass,
  createAdminTeachingCourse,
  deleteAdminTeachingCourse,
  createAdminUserDirectoryClassCategory,
  createAdminUserDirectoryUser,
  downloadAdminStudentImportTemplate,
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
  deleteAdminClassroomTaskFile,
  downloadAdminClassroomLessonFile,
  fetchAdminGeneratedImageGroups,
  fetchAdminCollaborationClassrooms,
  fetchAdminClassroomHomeworkOverview,
  fetchAdminClassroomPlans,
  fetchAdminFinalTestSubmissions,
  reopenAdminFinalTestSession,
  fetchAdminMe,
  fetchAdminOnlinePresence,
  fetchAdminTeachingCourses,
  fetchAdminTeachingCourseClassRoster,
  fetchAdminUserDirectory,
  importAdminStudentAccounts,
  mergeAdminUserDirectoryUsers,
  saveAdminClassroomPlans,
  saveAdminFinalTestConfig,
  saveAdminClassroomSeatLayouts,
  updateAdminUserDirectoryUser,
  uploadAdminClassroomTaskFiles,
  updateAdminCollaborationClassroomMonitoring,
  updateAdminCollaborationCourseAnnouncement,
  updateAdminCollaborationMonitoringMaster,
  updateAdminTeachingCourse,
  updateAdminPersonalProfile,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import {
  clearUserAuthSession,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../app/authStorage.js";
import { withAppBasePath } from "../app/basePath.js";
import "../styles/teacher-home.css";

const TARGET_CLASS_NAMES = Object.freeze(["教技231", "810班", "811班"]);
const FINAL_TEST_EXPORT_CLASS_OPTIONS = Object.freeze([
  { value: "all", label: "全部班级" },
  { value: "810班", label: "810班" },
  { value: "811班", label: "811班" },
]);
const TEACHER_HOME_PANEL_KEYS = Object.freeze(
  new Set([
    "classroom",
    "class-manage",
    "course",
    "discipline",
    "homework",
    "seat-fixed",
    "random-rollcall",
    "final-test",
    "teacher-manage",
    "student-manage",
    "export-center",
    "image-library",
    "party-manage",
    "online",
  ]),
);
const PLATFORM_ADMIN_ACCOUNT_TAG = "platform_admin";
const SELF_REGISTERED_TEACHER_ACCOUNT_TAG = "teacher_invite_registration";
const USER_DIRECTORY_DEFAULT_TARGET_CLASSES = Object.freeze([]);
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
  const options = STUDENT_TEACHER_SCOPE_OPTIONS.filter(
    (item) => String(item?.key || "").trim() !== DEFAULT_TEACHER_SCOPE_KEY,
  );
  return Object.freeze(
    options.length > 0 ? options : [...STUDENT_TEACHER_SCOPE_OPTIONS],
  );
})();
const USER_CREATE_DEFAULT_TEACHER_SCOPE_KEY =
  String(
    USER_CREATE_BINDABLE_TEACHER_SCOPE_OPTIONS[0]?.key ||
      DEFAULT_TEACHER_SCOPE_KEY,
  ).trim() || DEFAULT_TEACHER_SCOPE_KEY;
const PAIR_CLASSROOM_STUDENT_LIMIT = 2;

function formatCourseKnowledgePointLines(points) {
  const safePoints = Array.isArray(points) ? points : [];
  const labelByKey = new Map(
    safePoints.map((point) => [String(point?.key || "").trim(), String(point?.label || "").trim()]),
  );
  return safePoints
    .map((point) => {
      const prerequisites = (Array.isArray(point?.prerequisiteKeys)
        ? point.prerequisiteKeys
        : [])
        .map((key) => labelByKey.get(String(key || "").trim()) || "")
        .filter(Boolean)
        .join("、");
      return [
        String(point?.unitTitle || "未分单元").trim(),
        String(point?.label || "").trim(),
        prerequisites,
      ].join("｜");
    })
    .filter((line) => line.replaceAll("｜", "").trim())
    .join("\n");
}

function parseCourseKnowledgePointLines(text, previousPoints = []) {
  const previousKeyByLabel = new Map(
    (Array.isArray(previousPoints) ? previousPoints : []).map((point) => [
      String(point?.label || "").trim(),
      String(point?.key || "").trim(),
    ]),
  );
  const rows = String(text || "")
    .split(/\n+/)
    .map((line) => line.split(/[|｜]/).map((item) => item.trim()))
    .filter((parts) => parts.some(Boolean))
    .slice(0, 80)
    .map((parts, index) => ({
      unitTitle: parts[0] || "未分单元",
      label: parts[1] || parts[0] || `知识点 ${index + 1}`,
      prerequisiteLabels: String(parts[2] || "")
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      key: previousKeyByLabel.get(parts[1] || parts[0] || "") || `teacher-point-${index + 1}`,
    }));
  const keyByLabel = new Map(rows.map((row) => [row.label, row.key]));
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    unitTitle: row.unitTitle,
    description: "",
    prerequisiteKeys: row.prerequisiteLabels
      .map((label) => keyByLabel.get(label) || previousKeyByLabel.get(label) || "")
      .filter(Boolean),
  }));
}
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
]);

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
  const safeRole = String(role || "").trim().toLowerCase();
  if (safeRole === "admin") return "管理员";
  if (safeRole === "teacher") return "教师";
  return "学生";
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
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
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
    courseId: String(lesson?.courseId || "").trim(),
    className: normalizeLessonClassName(lesson?.className),
    homeworkRequirementText: normalizeClassroomHomeworkRequirementText(
      lesson?.homeworkRequirementText,
    ),
    homeworkUploadEnabled: lesson?.homeworkUploadEnabled !== false,
    lateSubmissionEnabled: lesson?.lateSubmissionEnabled === true,
  }));
}

function resolveLessonTeachingCourseId(lesson, teachingCourses = []) {
  const savedCourseId = String(lesson?.courseId || "").trim();
  if (savedCourseId) return savedCourseId;

  const lessonClassName = normalizeLessonClassName(lesson?.className);
  const classMatchedCourse = (Array.isArray(teachingCourses)
    ? teachingCourses
    : []
  ).find((course) =>
    (Array.isArray(course?.classNames) ? course.classNames : []).some(
      (className) => normalizeLessonClassName(className) === lessonClassName,
    ),
  );
  return String(classMatchedCourse?.id || teachingCourses?.[0]?.id || "").trim();
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
    ).map((lesson) => {
      const snapshotLesson = { ...lesson };
      delete snapshotLesson.announcementUpdatedAt;
      return snapshotLesson;
    }),
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

function buildLessonDraft(
  lessonIndex = 1,
  defaultClassName = "",
  teachingCourseId = "",
) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    id: `course-${now}-${Math.round(Math.random() * 1000)}`,
    courseId: String(teachingCourseId || "").trim(),
    courseName: `第${lessonIndex}节课`,
    className: normalizeLessonClassName(defaultClassName),
    courseStartAt: "",
    courseEndAt: "",
    courseTime: "",
    notes: "",
    announcement: "",
    announcementUpdatedAt: "",
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
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const [activePanel, setActivePanel] = useState(() =>
    requestedTeacherPanel === "user-manage"
      ? "student-manage"
      : requestedTeacherPanel || "party-manage",
  );
  const [lessonListVisible, setLessonListVisible] = useState(true);
  const [lessonAnnouncementExpanded, setLessonAnnouncementExpanded] =
    useState(false);
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
    accountTag: "",
    createdAt: "",
    updatedAt: "",
  });
  const [personalProfile, setPersonalProfile] = useState({
    name: "",
    gender: "",
    authorizedClassNamesText: "",
    saving: false,
    error: "",
  });
  const [newTeachingClassName, setNewTeachingClassName] = useState("");
  const [creatingTeachingClass, setCreatingTeachingClass] = useState(false);
  const [teachingClassError, setTeachingClassError] = useState("");
  const [teachingClassCreateDialogOpen, setTeachingClassCreateDialogOpen] =
    useState(false);
  const [pendingClassImport, setPendingClassImport] = useState("");
  const [classroomUpdatedAt, setClassroomUpdatedAt] = useState("");
  const [productTaskEnabled, setProductTaskEnabled] = useState(false);
  const [teacherCoursePlans, setTeacherCoursePlans] = useState([]);
  const [authorizedClassNames, setAuthorizedClassNames] = useState([]);
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
  const [userDirectoryClassFilter, setUserDirectoryClassFilter] =
    useState("all");
  const [platformUserDirectoryView, setPlatformUserDirectoryView] =
    useState("teachers");
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
  const [userDirectoryCapabilities, setUserDirectoryCapabilities] = useState({
    canManageUsers: false,
    canCreateStudents: false,
    canImportStudents: false,
    isPlatformAdmin: false,
  });
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
    role: "user",
    authorizedClassNamesText: "",
    confirmText: "",
    error: "",
    saving: false,
  });
  const [studentImportDialog, setStudentImportDialog] = useState({
    open: false,
    teacherUserId: "",
    file: null,
    fileName: "",
    downloading: false,
    templateDownloadUrl: "",
    templateFileName: "",
    importing: false,
    error: "",
    result: null,
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
  const [pairClassroomCreateDialog, setPairClassroomCreateDialog] = useState({
    open: false,
    name: "",
    studentUserIds: [],
    studentKeyword: "",
    error: "",
    saving: false,
  });
  const [updatingMonitoringRoomId, setUpdatingMonitoringRoomId] = useState("");
  const [pairMonitoringMasterEnabled, setPairMonitoringMasterEnabled] =
    useState(false);
  const [pairMonitoringMasterUpdatedAt, setPairMonitoringMasterUpdatedAt] =
    useState("");
  const [pairMonitoringMasterSaving, setPairMonitoringMasterSaving] =
    useState(false);
  const [lessonAnnouncementStatus, setLessonAnnouncementStatus] = useState({
    lessonId: "",
    saving: false,
    error: "",
  });
  const [memoryDialogRoom, setMemoryDialogRoom] = useState(null);
  const [teachingCourses, setTeachingCourses] = useState([]);
  const [selectedTeachingCourseId, setSelectedTeachingCourseId] = useState("");
  const [selectedTeachingClassName, setSelectedTeachingClassName] = useState("");
  const [teachingClassRoster, setTeachingClassRoster] = useState({
    loading: false,
    error: "",
    updatedAt: "",
    className: "",
    students: [],
  });
  const [teachingCourseTeacherOptions, setTeachingCourseTeacherOptions] =
    useState([]);
  const [canManageAllTeachingCourses, setCanManageAllTeachingCourses] =
    useState(false);
  const [creatingTeachingCourse, setCreatingTeachingCourse] = useState(false);
  const [deletingTeachingCourse, setDeletingTeachingCourse] = useState(false);
  const [courseMemoryConfig, setCourseMemoryConfig] = useState({
    courseId: "",
    ownerTeacherId: "",
    ownerTeacherName: "",
    courseName: "",
    termName: "",
    syllabusText: "",
    knowledgePoints: [],
    knowledgePointsText: "",
    classNames: [],
    classNamesText: "",
    updatedAt: "",
    loading: false,
    saving: false,
    expanded: false,
    error: "",
  });

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
      if (Number(rawError?.status) !== 401) return false;
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
      setUserDirectoryCapabilities({
        canManageUsers: !!data?.canManageUsers,
        canCreateStudents: !!data?.canCreateStudents,
        canImportStudents: !!data?.canImportStudents,
        isPlatformAdmin: !!data?.currentAdmin?.isPlatformAdmin,
      });
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
      const data = await fetchAdminCollaborationClassrooms(adminToken);
      setPartyRoomItems(Array.isArray(data?.rooms) ? data.rooms : []);
      setPartyRoomManageUsers(Array.isArray(data?.users) ? data.users : []);
      setPairMonitoringMasterEnabled(
        data?.collaborationMonitoring?.enabled === true,
      );
      setPairMonitoringMasterUpdatedAt(
        String(data?.collaborationMonitoring?.updatedAt || ""),
      );
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

  const loadCourseMemoryConfig = useCallback(async (preferredCourseId = "") => {
    if (!adminToken) return;
    setCourseMemoryConfig((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    try {
      const data = await fetchAdminTeachingCourses(adminToken);
      const courses = Array.isArray(data?.courses) ? data.courses : [];
      const teacherOptions = Array.isArray(data?.teacherOptions)
        ? data.teacherOptions
        : [];
      const requestedCourseId = String(
        preferredCourseId || selectedTeachingCourseId || "",
      );
      const config =
        courses.find((item) => String(item?.id || "") === requestedCourseId) ||
        courses[0] ||
        null;
      setTeachingCourses(courses);
      setTeachingCourseTeacherOptions(teacherOptions);
      setCanManageAllTeachingCourses(Boolean(data?.canManageAllCourses));
      setSelectedTeachingCourseId(String(config?.id || ""));
      const knowledgePoints = Array.isArray(config?.knowledgePoints)
        ? config.knowledgePoints
        : [];
      setCourseMemoryConfig((current) => ({
        ...current,
        courseId: String(config?.id || ""),
        ownerTeacherId: String(config?.ownerTeacherId || ""),
        ownerTeacherName: String(config?.ownerTeacherName || ""),
        courseName: String(config?.courseName || ""),
        termName: String(config?.termName || ""),
        syllabusText: String(config?.syllabusText || ""),
        knowledgePoints,
        knowledgePointsText: formatCourseKnowledgePointLines(knowledgePoints),
        classNames: Array.isArray(config?.classNames) ? config.classNames : [],
        classNamesText: Array.isArray(config?.classNames)
          ? config.classNames.join("、")
          : "",
        updatedAt: String(config?.updatedAt || ""),
        loading: false,
        error: "",
      }));
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setCourseMemoryConfig((current) => ({
        ...current,
        loading: false,
        error: readErrorMessage(rawError),
      }));
    }
  }, [adminToken, handleAuthError, selectedTeachingCourseId]);

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
          accountTag: String(meData?.admin?.accountTag || ""),
          createdAt: String(meData?.admin?.createdAt || ""),
          updatedAt: String(meData?.admin?.updatedAt || ""),
        });
        const personalName = String(meData?.admin?.profile?.name || "");
        const personalGender = String(meData?.admin?.profile?.gender || "");
        const personalClassNames = Array.isArray(meData?.admin?.authorizedClassNames)
          ? meData.admin.authorizedClassNames
          : [];
        setPersonalProfile((current) => ({
          ...current,
          name: personalName,
          gender: personalGender,
          authorizedClassNamesText: personalClassNames.join("、"),
          saving: false,
          error: "",
        }));
        if (
          String(meData?.admin?.role || "").toLowerCase() === "teacher" &&
          personalClassNames.length === 0
        ) {
          setActivePanel("course");
        }
        const legacyProductEnabled =
          !!plansData?.shangguanClassTaskProductImprovementEnabled;
        setProductTaskEnabled(legacyProductEnabled);
        const plans = Array.isArray(plansData?.teacherCoursePlans)
          ? plansData.teacherCoursePlans
          : [];
        const normalizedPlans = normalizeLessonPlans(plans);
        setAuthorizedClassNames(
          (Array.isArray(plansData?.authorizedClassNames)
            ? plansData.authorizedClassNames
            : []
          )
            .map(normalizeLessonClassName)
            .filter(Boolean),
        );
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
    setActivePanel(
      requestedTeacherPanel === "user-manage"
        ? "student-manage"
        : requestedTeacherPanel || "party-manage",
    );
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
      : "party-manage";
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
    if (
      activePanel !== "teacher-manage" &&
      activePanel !== "student-manage" &&
      activePanel !== "discipline"
    ) {
      return;
    }
    void loadUserDirectory();
  }, [activePanel, loadUserDirectory]);

  useEffect(() => {
    if (
      activePanel !== "student-manage" ||
      !pendingClassImport ||
      userDirectoryLoading ||
      !userDirectoryCapabilities.canImportStudents
    ) {
      return;
    }
    openStudentImportDialog();
    setPendingClassImport("");
  }, [
    activePanel,
    pendingClassImport,
    userDirectoryCapabilities.canImportStudents,
    userDirectoryLoading,
  ]);

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
    if (activePanel !== "party-manage") return;
    void loadPartyRoomManage();
    const timerId = window.setInterval(() => {
      void loadPartyRoomManage({ silent: true });
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [activePanel, loadPartyRoomManage]);

  useEffect(() => {
    if (
      activePanel !== "course" &&
      activePanel !== "class-manage" &&
      activePanel !== "classroom"
    ) {
      return;
    }
    void loadCourseMemoryConfig();
  }, [activePanel, loadCourseMemoryConfig]);

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
    if (!selectedTeachingCourseId) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }
    const currentCoursePlans = teacherCoursePlans.filter(
      (lesson) =>
        resolveLessonTeachingCourseId(lesson, teachingCourses) ===
        selectedTeachingCourseId,
    );
    if (currentCoursePlans.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }
    const exists = currentCoursePlans.some(
      (item) => String(item?.id || "") === String(selectedCourseId || ""),
    );
    if (!exists) {
      setSelectedCourseId(
        String(sortLessonPlans(currentCoursePlans)[0]?.id || ""),
      );
    }
  }, [
    selectedCourseId,
    selectedTeachingCourseId,
    teacherCoursePlans,
    teachingCourses,
  ]);

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

  const isTerminalAdmin = useMemo(
    () =>
      String(adminProfile.accountTag || "").trim() ===
        PLATFORM_ADMIN_ACCOUNT_TAG || userDirectoryCapabilities.isPlatformAdmin,
    [adminProfile.accountTag, userDirectoryCapabilities.isPlatformAdmin],
  );
  const canBindStudentAccounts = useMemo(
    () =>
      isTerminalAdmin ||
      String(adminProfile.role || "").trim().toLowerCase() === "teacher",
    [adminProfile.role, isTerminalAdmin],
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
    const seen = new Set();
    const options = [];
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
    return [
      {
        key: "personal-group",
        label: "教学准备",
        items: [
          { key: "course", label: "课程管理", icon: BookCheck },
          { key: "classroom", label: "课时任务", icon: ClipboardList },
          { key: "party-manage", label: "协作课堂", icon: Activity },
        ],
      },
      {
        key: "pair-teaching-group",
        label: "平台管理",
        items: [
          { key: "class-manage", label: "班级管理", icon: Users },
          {
            key: "student-manage",
            label: isTerminalAdmin ? "平台所有用户" : "学生账号",
            icon: Users,
          },
        ],
      },
      {
        key: "external-group",
        label: "教学配置",
        external: true,
        dividerBefore: true,
        items: [
          { key: "agent", label: "AI 教学配置", icon: Bot, external: true },
        ],
      },
    ];
  }, [isTerminalAdmin]);

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
    if (safeItemKey === String(activePanel || "").trim()) return;
    if (!confirmLeaveWithUnsavedClassroomConfig()) return;
    if (safeItemKey === "agent") {
      setFeatureTransition({
        active: true,
        label: "正在进入智能体管理...",
      });
      navigate(withAuthSlot("/admin/agent-settings", activeSlot));
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
      teacherCount: 0,
      studentCount: 0,
      targetClassStudentCount: 0,
      otherClassStudentCount: 0,
      unassignedStudentCount: 0,
    };
    userDirectoryItems.forEach((item) => {
      summary.totalCount += 1;
      if (String(item?.role || "").trim().toLowerCase() === "teacher") {
        summary.teacherCount += 1;
        return;
      }
      if (String(item?.role || "").trim().toLowerCase() === "admin") return;
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
  const studentImportTeacherOptions = useMemo(
    () =>
      userDirectoryItems
        .filter(
          (item) =>
            String(item?.role || "").trim().toLowerCase() === "teacher" &&
            String(item?.accountTag || "").trim() !==
              PLATFORM_ADMIN_ACCOUNT_TAG &&
            !!String(item?.lockedTeacherScopeKey || "").trim(),
        )
        .map((item) => ({
          id: String(item?.id || "").trim(),
          label:
            String(item?.profile?.name || "").trim() ||
            String(item?.username || "").trim() ||
            "未命名教师",
          authorizedClassNames: Array.isArray(item?.authorizedClassNames)
            ? item.authorizedClassNames
            : [],
        }))
        .filter((item) => item.id),
    [userDirectoryItems],
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
        if (classFilter !== "all") {
          if (["admin", "teacher"].includes(role)) return false;
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
    userDirectorySortBy,
    userDirectoryTargetClassKeyToName,
  ]);

  const isTeacherManagementPanel = activePanel === "teacher-manage";
  const isStudentManagementPanel = activePanel === "student-manage";
  const isPlatformUsersPanel = isTerminalAdmin && isStudentManagementPanel;
  const isPlatformTeacherDirectory =
    isPlatformUsersPanel && platformUserDirectoryView === "teachers";
  const isTeacherDirectoryPanel =
    isTeacherManagementPanel || isPlatformTeacherDirectory;
  const userDirectoryPanelItems = useMemo(
    () =>
      userDirectoryVisibleItems.filter((item) => {
        const role = String(item?.role || "user").trim().toLowerCase();
        if (isTeacherDirectoryPanel) return role === "teacher";
        if (isPlatformUsersPanel) {
          return role === "user";
        }
        return role === "user";
      }),
    [
      isPlatformUsersPanel,
      isTeacherDirectoryPanel,
      userDirectoryVisibleItems,
    ],
  );

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
      userDirectoryClassFilter !== "all" ||
      userDirectorySortBy !== "updated",
    [
      userDirectoryClassFilter,
      userDirectoryKeyword,
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
    () => (Array.isArray(partyRoomItems) ? partyRoomItems : []),
    [partyRoomItems],
  );
  const pairClassroomUserOptions = useMemo(
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
  const pairClassroomStudentOptions = useMemo(
    () => pairClassroomUserOptions.filter((item) => item.role === "user"),
    [pairClassroomUserOptions],
  );
  const pairClassroomVisibleStudentOptions = useMemo(() => {
    const keyword = String(pairClassroomCreateDialog.studentKeyword || "")
      .trim()
      .toLowerCase();
    if (!keyword) return pairClassroomStudentOptions;
    return pairClassroomStudentOptions.filter((item) =>
      [item.displayName, item.username, item.className, item.studentId].some(
        (token) =>
          String(token || "")
            .toLowerCase()
            .includes(keyword),
      ),
    );
  }, [
    pairClassroomCreateDialog.studentKeyword,
    pairClassroomStudentOptions,
  ]);
  const selectedTeachingCourse = useMemo(
    () =>
      teachingCourses.find(
        (course) =>
          String(course?.id || "") === String(selectedTeachingCourseId || ""),
      ) || null,
    [selectedTeachingCourseId, teachingCourses],
  );
  const sortedCoursePlans = useMemo(
    () =>
      sortLessonPlans(
        teacherCoursePlans.filter(
          (lesson) =>
            resolveLessonTeachingCourseId(lesson, teachingCourses) ===
            String(selectedTeachingCourseId || ""),
        ),
      ),
    [selectedTeachingCourseId, teacherCoursePlans, teachingCourses],
  );
  const lessonClassNames = useMemo(() => {
    const seen = new Set();
    sortedCoursePlans.forEach((c) => {
      const name = normalizeLessonClassName(c?.className);
      if (name) seen.add(name);
    });
    return Array.from(seen).sort();
  }, [sortedCoursePlans]);
  const authorizedClassOptions = useMemo(
    () =>
      (Array.isArray(selectedTeachingCourse?.classNames)
        ? selectedTeachingCourse.classNames
        : authorizedClassNames
      ).map((className) => ({
        value: className,
        label: className,
      })),
    [authorizedClassNames, selectedTeachingCourse],
  );
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
    return normalizeLessonClassName(selectedCourse?.className);
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
      if (!authorizedClassNames.includes(safeClassName)) return;
      const key = toClassNameKey(safeClassName);
      if (!key || mapping.has(key)) return;
      mapping.set(key, safeClassName);
    };

    appendClass(selectedCourse?.className);
    authorizedClassNames.forEach((className) => appendClass(className));
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
    authorizedClassNames,
    selectedCourse?.className,
    userDirectoryItems,
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
    const teachingCourseId = String(selectedTeachingCourseId || "").trim();
    if (!teachingCourseId) {
      setError("请先在“课程管理”中建立并选择一门课程。");
      return;
    }
    const nextLesson = buildLessonDraft(
      sortedCoursePlans.length + 1,
      authorizedClassOptions[0]?.value || "",
      teachingCourseId,
    );
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
      const plansToSave = normalizeLessonPlans(teacherCoursePlans).map(
        (lesson) => ({
          ...lesson,
          courseId: resolveLessonTeachingCourseId(lesson, teachingCourses),
        }),
      );
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
      teachingCourses,
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

  function closePairClassroomCreateDialog() {
    setPairClassroomCreateDialog({
      open: false,
      name: "",
      studentUserIds: [],
      studentKeyword: "",
      error: "",
      saving: false,
    });
  }

  function openPairClassroomCreateDialog() {
    if (pairClassroomStudentOptions.length < PAIR_CLASSROOM_STUDENT_LIMIT) {
      setError("系统内可选学生不足两人，请先在用户信息中创建学生账号。");
      return;
    }
    setPairClassroomCreateDialog({
      open: true,
      name: "",
      studentUserIds: [],
      studentKeyword: "",
      error: "",
      saving: false,
    });
  }

  function onTogglePairClassroomStudent(studentUserId) {
    const safeStudentUserId = String(studentUserId || "").trim();
    if (!safeStudentUserId) return;
    setPairClassroomCreateDialog((current) => {
      const nextStudentUserIds = Array.from(
        new Set(
          (Array.isArray(current.studentUserIds)
            ? current.studentUserIds
            : []
          )
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      );
      const selectedIndex = nextStudentUserIds.indexOf(safeStudentUserId);
      if (selectedIndex >= 0) {
        nextStudentUserIds.splice(selectedIndex, 1);
      } else if (nextStudentUserIds.length < PAIR_CLASSROOM_STUDENT_LIMIT) {
        nextStudentUserIds.push(safeStudentUserId);
      } else {
        return {
          ...current,
          error: "每个结对小教室只能选择两名学生。",
        };
      }
      return {
        ...current,
        studentUserIds: nextStudentUserIds,
        error: "",
      };
    });
  }

  async function onSubmitPairClassroomCreateDialog(event) {
    if (event) event.preventDefault();
    if (!adminToken || pairClassroomCreateDialog.saving) return;
    const roomName = String(pairClassroomCreateDialog.name || "").trim();
    const studentUserIds = Array.from(
      new Set(
        (Array.isArray(pairClassroomCreateDialog.studentUserIds)
          ? pairClassroomCreateDialog.studentUserIds
          : []
        )
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
    if (!roomName) {
      setPairClassroomCreateDialog((current) => ({
        ...current,
        error: "请输入小教室名称。",
      }));
      return;
    }
    if (studentUserIds.length !== PAIR_CLASSROOM_STUDENT_LIMIT) {
      setPairClassroomCreateDialog((current) => ({
        ...current,
        error: "请选择两名学生组成结对。",
      }));
      return;
    }

    setPairClassroomCreateDialog((current) => ({
      ...current,
      saving: true,
      error: "",
    }));
    setError("");
    try {
      await createAdminCollaborationClassroom(adminToken, {
        name: roomName,
        studentUserIds,
      });
      closePairClassroomCreateDialog();
      await loadPartyRoomManage();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setPairClassroomCreateDialog((current) => ({
        ...current,
        saving: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  function onObserveCollaborationClassroom(room) {
    const roomId = String(room?.id || "").trim();
    if (!roomId) return;
    navigate(
      withAuthSlot(
        `/admin/collaboration-observer/${encodeURIComponent(roomId)}`,
        activeSlot,
      ),
    );
  }

  async function onSaveCourseAnnouncement(event) {
    event?.preventDefault?.();
    const lessonId = String(selectedCourse?.id || "").trim();
    if (!adminToken || !lessonId || lessonAnnouncementStatus.saving) return;
    const announcement = String(selectedCourse?.announcement || "").trim();
    setLessonAnnouncementStatus({
      lessonId,
      saving: true,
      error: "",
    });
    try {
      const lessonSaved = await persistClassroomConfig({ silent: true });
      if (!lessonSaved) {
        throw new Error("课时保存失败，公告尚未发布。");
      }
      const data = await updateAdminCollaborationCourseAnnouncement(
        adminToken,
        lessonId,
        announcement,
      );
      const savedText = String(data?.announcement?.text || announcement);
      const updatedAt = String(
        data?.announcement?.updatedAt || new Date().toISOString(),
      );
      onUpdateSelectedLesson({
        announcement: savedText,
        announcementUpdatedAt: updatedAt,
      });
      setLessonAnnouncementStatus({
        lessonId,
        saving: false,
        error: "",
      });
      setPartyRoomItems((current) =>
        current.map((room) => ({
          ...room,
          announcement: savedText,
        })),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setLessonAnnouncementStatus({
        lessonId,
        saving: false,
        error: readErrorMessage(rawError),
      });
    }
  }

  async function onTogglePairMonitoringMaster() {
    if (!adminToken || pairMonitoringMasterSaving) return;
    const nextEnabled = !pairMonitoringMasterEnabled;
    setError("");
    setPairMonitoringMasterSaving(true);
    try {
      const data = await updateAdminCollaborationMonitoringMaster(
        adminToken,
        nextEnabled,
      );
      const enabled = data?.monitoring?.enabled === true;
      const updatedAt = String(
        data?.monitoring?.updatedAt || new Date().toISOString(),
      );
      setPairMonitoringMasterEnabled(enabled);
      setPairMonitoringMasterUpdatedAt(updatedAt);
      setPartyRoomItems((current) =>
        current.map((item) =>
          String(item?.teacherScopeKey || "").trim().toLowerCase() ===
          "shi-gaojun"
            ? {
                ...item,
                paiaMonitoringEnabled: enabled,
                paiaMonitoringStartedAt: enabled ? updatedAt : "",
                paiaMonitoringUpdatedAt: updatedAt,
              }
            : item,
        ),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setError(readErrorMessage(rawError));
    } finally {
      setPairMonitoringMasterSaving(false);
    }
  }

  async function onSaveCourseMemoryConfig(event) {
    event?.preventDefault?.();
    if (!adminToken || courseMemoryConfig.saving || !courseMemoryConfig.courseId) return;
    const courseName = String(courseMemoryConfig.courseName || "").trim();
    if (!courseName) {
      setCourseMemoryConfig((current) => ({
        ...current,
        error: "请输入课程名称。",
      }));
      return;
    }
    const knowledgePoints = parseCourseKnowledgePointLines(
      courseMemoryConfig.knowledgePointsText,
      courseMemoryConfig.knowledgePoints,
    );
    if (!knowledgePoints.length) {
      setCourseMemoryConfig((current) => ({
        ...current,
        error: "请至少配置一个课程知识点。",
      }));
      return;
    }
    setCourseMemoryConfig((current) => ({
      ...current,
      saving: true,
      error: "",
    }));
    try {
      const data = await updateAdminTeachingCourse(
        adminToken,
        courseMemoryConfig.courseId,
        {
          courseName,
          termName: String(courseMemoryConfig.termName || "").trim(),
          syllabusText: String(courseMemoryConfig.syllabusText || "").trim(),
          knowledgePoints,
          ...(canManageAllTeachingCourses
            ? { teacherUserId: courseMemoryConfig.ownerTeacherId }
            : {}),
        },
      );
      const config = data?.course || {};
      const storedPoints = Array.isArray(config?.knowledgePoints)
        ? config.knowledgePoints
        : knowledgePoints;
      setCourseMemoryConfig((current) => ({
        ...current,
        courseId: String(config?.id || current.courseId),
        ownerTeacherId: String(config?.ownerTeacherId || ""),
        ownerTeacherName: String(config?.ownerTeacherName || ""),
        courseName: String(config?.courseName || courseName),
        termName: String(config?.termName || ""),
        syllabusText: String(config?.syllabusText || ""),
        knowledgePoints: storedPoints,
        knowledgePointsText: formatCourseKnowledgePointLines(storedPoints),
        classNames: Array.isArray(config?.classNames) ? config.classNames : current.classNames,
        classNamesText: Array.isArray(config?.classNames)
          ? config.classNames.join("、")
          : current.classNamesText,
        updatedAt: String(config?.updatedAt || new Date().toISOString()),
        saving: false,
        error: "",
      }));
      setTeachingCourses((current) =>
        current.map((item) =>
          String(item?.id || "") === String(config?.id || courseMemoryConfig.courseId)
            ? config
            : item,
        ),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setCourseMemoryConfig((current) => ({
        ...current,
        saving: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  async function onCreateTeachingCourse() {
    if (!adminToken || creatingTeachingCourse) return;
    setCreatingTeachingCourse(true);
    setError("");
    try {
      const data = await createAdminTeachingCourse(adminToken, {
        courseName: `新课程${teachingCourses.length + 1}`,
      });
      const course = data?.course;
      if (!course?.id) {
        throw new Error("课程创建失败，请稍后重试。");
      }
      setTeachingCourses((current) => [course, ...current]);
      await loadCourseMemoryConfig(course.id);
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setCourseMemoryConfig((current) => ({
        ...current,
        error: readErrorMessage(rawError),
      }));
    } finally {
      setCreatingTeachingCourse(false);
    }
  }

  async function onDeleteTeachingCourse() {
    const courseId = String(courseMemoryConfig.courseId || "").trim();
    const courseName = String(courseMemoryConfig.courseName || "这门课程").trim();
    if (!adminToken || !courseId || deletingTeachingCourse) return;
    if (!window.confirm(`确认删除“${courseName}”吗？此操作不会删除教师或学生账号。`)) {
      return;
    }
    setDeletingTeachingCourse(true);
    setCourseMemoryConfig((current) => ({ ...current, error: "" }));
    try {
      const data = await deleteAdminTeachingCourse(adminToken, courseId);
      const nextCourses = teachingCourses.filter(
        (course) => String(course?.id || "") !== courseId,
      );
      const nextCourseId = String(nextCourses[0]?.id || "");
      setTeachingCourses(nextCourses);
      setSelectedTeachingCourseId(nextCourseId);
      await loadCourseMemoryConfig(nextCourseId);
      setError("");
      if (data?.authorizedClassNames) {
        setPersonalProfile((current) => ({
          ...current,
          authorizedClassNamesText: data.authorizedClassNames.join("、"),
        }));
      }
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setCourseMemoryConfig((current) => ({
        ...current,
        error: readErrorMessage(rawError),
      }));
    } finally {
      setDeletingTeachingCourse(false);
    }
  }

  async function onSavePersonalProfile(event) {
    event?.preventDefault?.();
    if (!adminToken || personalProfile.saving) return;
    const authorizedClassNames = Array.from(
      new Set(
        String(personalProfile.authorizedClassNamesText || "")
          .split(/[、,，\n]+/)
          .map((item) => item.replace(/\s+/g, "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 50);
    setPersonalProfile((current) => ({
      ...current,
      saving: true,
      error: "",
    }));
    try {
      const data = await updateAdminPersonalProfile(adminToken, {
        name: String(personalProfile.name || "").trim(),
        gender: String(personalProfile.gender || "").trim(),
        authorizedClassNames,
      });
      const profile = data?.admin?.profile || {};
      const storedClassNames = Array.isArray(data?.admin?.authorizedClassNames)
        ? data.admin.authorizedClassNames
        : authorizedClassNames;
      setPersonalProfile((current) => ({
        ...current,
        name: String(profile?.name || current.name),
        gender: String(profile?.gender || ""),
        authorizedClassNamesText: storedClassNames.join("、"),
        saving: false,
        error: "",
      }));
      setAuthorizedClassNames(storedClassNames);
      setTeachingCourses((current) =>
        current.map((course) => ({
          ...course,
          ownerTeacherName: String(profile?.name || course?.ownerTeacherName || ""),
          classNames: storedClassNames,
        })),
      );
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setPersonalProfile((current) => ({
        ...current,
        saving: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  async function onCreateTeachingClass(event) {
    event?.preventDefault?.();
    if (!adminToken || creatingTeachingClass || !selectedTeachingCourseId) return;
    const createdClassName = String(newTeachingClassName || "").trim();
    setCreatingTeachingClass(true);
    setTeachingClassError("");
    try {
      const data = await createAdminTeachingCourseClass(
        adminToken,
        selectedTeachingCourseId,
        newTeachingClassName,
      );
      const classNames = Array.isArray(data?.authorizedClassNames)
        ? data.authorizedClassNames
        : authorizedClassNames;
      setAuthorizedClassNames(classNames);
      setNewTeachingClassName("");
      setCourseMemoryConfig((current) => ({
        ...current,
        classNames: Array.isArray(data?.course?.classNames)
          ? data.course.classNames
          : classNames,
      }));
      setTeachingCourses((current) =>
        current.map((course) =>
          String(course?.id || "") === selectedTeachingCourseId
            ? data.course || { ...course, classNames }
            : course,
        ),
      );
      setSelectedTeachingClassName(createdClassName);
      void loadTeachingClassRoster(createdClassName);
      setTeachingClassCreateDialogOpen(false);
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setTeachingClassError(readErrorMessage(rawError));
    } finally {
      setCreatingTeachingClass(false);
    }
  }

  function openTeachingClassCreateDialog() {
    if (!selectedTeachingCourseId) return;
    setNewTeachingClassName("");
    setTeachingClassError("");
    setTeachingClassCreateDialogOpen(true);
  }

  function closeTeachingClassCreateDialog() {
    if (creatingTeachingClass) return;
    setNewTeachingClassName("");
    setTeachingClassError("");
    setTeachingClassCreateDialogOpen(false);
  }

  const loadTeachingClassRoster = useCallback(async (className) => {
    const safeClassName = String(className || "").trim();
    if (!adminToken || !selectedTeachingCourseId || !safeClassName) return;
    setSelectedTeachingClassName(safeClassName);
    setTeachingClassRoster((current) => ({
      ...current,
      loading: true,
      error: "",
      className: safeClassName,
    }));
    try {
      const data = await fetchAdminTeachingCourseClassRoster(
        adminToken,
        selectedTeachingCourseId,
        safeClassName,
      );
      setTeachingClassRoster({
        loading: false,
        error: "",
        updatedAt: String(data?.updatedAt || new Date().toISOString()),
        className: safeClassName,
        students: Array.isArray(data?.students) ? data.students : [],
      });
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setTeachingClassRoster((current) => ({
        ...current,
        loading: false,
        error: readErrorMessage(rawError),
      }));
    }
  }, [adminToken, handleAuthError, selectedTeachingCourseId]);

  function openCourseClassStudents(className, shouldImport = false) {
    const safeClassName = String(className || "").trim();
    if (!safeClassName) return;
    setPlatformUserDirectoryView("students");
    setUserDirectoryClassFilter(safeClassName);
    setPendingClassImport(shouldImport ? safeClassName : "");
    setActivePanel("student-manage");
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

  function closeStudentImportDialog() {
    if (studentImportDialog.templateDownloadUrl) {
      URL.revokeObjectURL(studentImportDialog.templateDownloadUrl);
    }
    setStudentImportDialog({
      open: false,
      teacherUserId: "",
      file: null,
      fileName: "",
      downloading: false,
      templateDownloadUrl: "",
      templateFileName: "",
      importing: false,
      error: "",
      result: null,
    });
  }

  function openStudentImportDialog() {
    if (!userDirectoryCapabilities.canImportStudents) return;
    const firstTeacher = studentImportTeacherOptions[0];
    const teacherUserId = isTerminalAdmin
      ? String(firstTeacher?.id || "").trim()
      : currentAdminUserId;
    setStudentImportDialog({
      open: true,
      teacherUserId,
      file: null,
      fileName: "",
      downloading: false,
      templateDownloadUrl: "",
      templateFileName: "",
      importing: false,
      error: "",
      result: null,
    });
    void prepareStudentImportTemplate(teacherUserId);
  }

  async function prepareStudentImportTemplate(teacherUserId = "") {
    if (!adminToken) return;
    const selectedTeacherUserId = String(teacherUserId || "").trim();
    setStudentImportDialog((current) => ({
      ...current,
      downloading: true,
      templateDownloadUrl: "",
      templateFileName: "",
      error: "",
    }));
    try {
      const result = await downloadAdminStudentImportTemplate(
        adminToken,
        isTerminalAdmin ? selectedTeacherUserId : "",
      );
      setStudentImportDialog((current) => ({
        ...(current.open && current.teacherUserId === selectedTeacherUserId
          ? {
              ...current,
              downloading: false,
              templateDownloadUrl: URL.createObjectURL(result.blob),
              templateFileName: result.filename,
            }
          : current),
      }));
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setStudentImportDialog((current) => ({
        ...(current.open && current.teacherUserId === selectedTeacherUserId
          ? {
              ...current,
              downloading: false,
              error: readErrorMessage(rawError),
            }
          : current),
      }));
    }
  }

  async function onImportStudentAccounts(event) {
    if (event) event.preventDefault();
    if (!adminToken || studentImportDialog.importing) return;
    if (!studentImportDialog.file) {
      setStudentImportDialog((current) => ({
        ...current,
        error: "请选择填写完成的 Excel 文件。",
      }));
      return;
    }
    if (isTerminalAdmin && !studentImportDialog.teacherUserId) {
      setStudentImportDialog((current) => ({
        ...current,
        error: "请先选择要绑定学生的教师。",
      }));
      return;
    }
    setStudentImportDialog((current) => ({
      ...current,
      importing: true,
      error: "",
      result: null,
    }));
    try {
      const data = await importAdminStudentAccounts(
        adminToken,
        studentImportDialog.file,
        isTerminalAdmin ? studentImportDialog.teacherUserId : "",
      );
      setStudentImportDialog((current) => ({
        ...current,
        importing: false,
        result: data,
      }));
      await loadUserDirectory();
    } catch (rawError) {
      if (handleAuthError(rawError)) return;
      setStudentImportDialog((current) => ({
        ...current,
        importing: false,
        error: readErrorMessage(rawError),
      }));
    }
  }

  async function onDownloadStudentImportResult() {
    const results = Array.isArray(studentImportDialog.result?.results)
      ? studentImportDialog.result.results
      : [];
    if (results.length === 0) return;
    const XLSX = await import("xlsx");
    const rows = results.map((item) => ({
      Excel行号: item.rowNumber,
      姓名: item.name || "",
      登录账号: item.username || item.studentId || "",
      学号: item.studentId || "",
      班级: item.className || "",
      初始密码: item.initialPassword || "",
      导入状态: item.status === "created" ? "创建成功" : "导入失败",
      说明: item.message || "",
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 22 },
      { wch: 14 },
      { wch: 42 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "导入结果");
    XLSX.writeFile(workbook, "学生账号导入结果.xlsx");
  }

  function openUserCreateDialog() {
    if (!userDirectoryCapabilities.canCreateStudents) return;
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
    if (!userDirectoryCapabilities.canCreateStudents || !adminToken) return;

    const username = String(userCreateDialog.studentId || "").trim();
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

    if (!password || !name || !studentId || !className) {
      setUserCreateDialog((current) => ({
        ...current,
        error: "密码、姓名、学号、归属班级为必填项；学号将作为登录账号。",
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
      role: "user",
      authorizedClassNamesText: "",
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
      if (String(user?.accountTag || "").trim() === PLATFORM_ADMIN_ACCOUNT_TAG)
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
        role: String(user?.role || "user").trim().toLowerCase(),
        authorizedClassNamesText: Array.isArray(user?.authorizedClassNames)
          ? user.authorizedClassNames.join("、")
          : "",
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
      authorizedClassNames:
                ["admin", "teacher"].includes(userEditDialog.role)
          ? String(userEditDialog.authorizedClassNamesText || "")
              .split(/[、,，;；\n]/)
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
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
          authorizedClassNames: editPayload.authorizedClassNames,
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

  const onBindUserDirectoryStudent = useCallback(
    async (user) => {
      if (!adminToken || !canBindStudentAccounts) return;
      const userId = String(user?.id || "").trim();
      if (!userId) return;
      const studentName =
        String(user?.profile?.name || user?.username || "").trim() || "该学生";
      if (
        !window.confirm(
          `确认将「${studentName}」加入当前结对编程课程吗？`,
        )
      ) {
        return;
      }
      try {
        const data = await bindAdminUserDirectoryStudent(adminToken, userId);
        const updatedUser = data?.user;
        setUserDirectoryItems((current) =>
          current.map((item) =>
            String(item?.id || "").trim() === userId && updatedUser
              ? updatedUser
              : item,
          ),
        );
        setUserDirectoryUpdatedAt(
          String(data?.updatedAt || new Date().toISOString()),
        );
        setError("");
      } catch (rawError) {
        if (handleAuthError(rawError)) return;
        setError(readErrorMessage(rawError));
      }
    },
    [adminToken, canBindStudentAccounts, handleAuthError],
  );

  const userDirectoryTableRows = useMemo(
    () =>
      userDirectoryPanelItems.map((user) => {
        const userId = String(user?.id || "").trim();
        const userRole = String(user?.role || "")
          .trim()
          .toLowerCase();
        const canManage = canManageUserDirectoryAccount(user);
        const isPendingStudent =
          userRole === "user" &&
          String(user?.accountStatus || "").trim() === "pending_binding";
        return (
          <tr
            key={
              userId ||
              `user-${String(user?.username || "").trim()}-${String(user?.updatedAt || "").trim()}`
            }
          >
            <td>{user?.username || "-"}</td>
            <td>{user?.profile?.name || "-"}</td>
            {isTeacherDirectoryPanel ? (
              <td>
                {(Array.isArray(user?.authorizedClassNames)
                  ? user.authorizedClassNames.join("、")
                  : "") || "未配置"}
              </td>
            ) : (
              <>
                <td>{user?.profile?.studentId || "-"}</td>
                <td>{user?.profile?.className || "-"}</td>
                <td>{user?.profile?.grade || "-"}</td>
                <td>{user?.profile?.gender || "-"}</td>
              </>
            )}
            <td>{
              isPendingStudent
                ? "待教师确认"
                : String(user?.accountStatus || "active").trim() === "disabled"
                  ? "已停用"
                  : "已启用"
            }</td>
            <td>{formatDisplayTime(user?.updatedAt)}</td>
            <td>
              {canManage || (isPendingStudent && canBindStudentAccounts) ? (
                <div className="teacher-user-manage-row-actions">
                  {isPendingStudent && canBindStudentAccounts ? (
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={() => onBindUserDirectoryStudent(user)}
                    >
                      确认绑定
                    </button>
                  ) : null}
                  {canManage ? (
                    <>
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
                    </>
                  ) : null}
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
      canBindStudentAccounts,
      onBindUserDirectoryStudent,
      openUserDeleteDialog,
      openUserEditDialog,
      isTeacherDirectoryPanel,
      userDirectoryPanelItems,
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
            <span className="teacher-home-profile-eyebrow">结对编程课程</span>
            <h1>教学工作台</h1>
            <p>{adminProfile.username || "--"}</p>
            <dl className="teacher-home-profile-meta">
              <div>
                <dt>角色</dt>
                <dd>
                  {adminProfile.role
                    ? isTerminalAdmin
                      ? "平台管理员"
                      : adminProfile.role === "teacher"
                        ? "授课教师"
                        : adminProfile.role
                    : "--"}
                </dd>
              </div>
              <div>
                <dt>课程数据</dt>
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
            {activePanel === "personal" ? (
              <div className="teacher-panel-stack teacher-personal-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>个人信息配置</h2>
                    <p className="teacher-panel-save-time">
                      请先确认自己的真实信息和授课班级。保存后，学生导入、课时任务和协作课堂都会按这些班级建立范围。
                    </p>
                  </div>
                  <button
                    type="submit"
                    form="teacher-personal-profile-form"
                    className="teacher-primary-btn"
                    disabled={personalProfile.saving}
                  >
                    <Save size={14} />
                    {personalProfile.saving ? "保存中..." : "保存个人信息"}
                  </button>
                </header>

                <section className="teacher-personal-config">
                  <form
                    id="teacher-personal-profile-form"
                    onSubmit={onSavePersonalProfile}
                  >
                    <label>
                      <span>真实姓名</span>
                      <input
                        type="text"
                        value={personalProfile.name}
                        maxLength={20}
                        placeholder="请输入真实中文姓名"
                        onChange={(event) =>
                          setPersonalProfile((current) => ({
                            ...current,
                            name: event.target.value,
                            error: "",
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>性别</span>
                      <select
                        value={personalProfile.gender}
                        onChange={(event) =>
                          setPersonalProfile((current) => ({
                            ...current,
                            gender: event.target.value,
                            error: "",
                          }))
                        }
                      >
                        <option value="">暂不填写</option>
                        <option value="男">男</option>
                        <option value="女">女</option>
                      </select>
                    </label>
                    {personalProfile.error ? (
                      <span className="teacher-confirm-error">{personalProfile.error}</span>
                    ) : null}
                  </form>
                </section>
              </div>
            ) : activePanel === "class-manage" ? (
              <div className="teacher-panel-stack teacher-personal-stack teacher-class-management-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>班级管理</h2>
                    <p className="teacher-panel-save-time">班级必须归属于一门已建立的课程；学生管理与批量导入从具体班级进入。</p>
                  </div>
                  <div className="teacher-panel-actions">
                    <div className="teacher-course-switcher">
                      <select aria-label="选择课程" value={selectedTeachingCourseId} onChange={(event) => { const nextCourseId = event.target.value; setSelectedTeachingCourseId(nextCourseId); setSelectedTeachingClassName(""); setTeachingClassRoster({ loading: false, error: "", updatedAt: "", className: "", students: [] }); void loadCourseMemoryConfig(nextCourseId); }}>
                        <option value="">请选择课程</option>
                        {teachingCourses.map((course) => <option key={course.id} value={course.id}>{course.courseName}</option>)}
                      </select>
                    </div>
                    <button type="button" className="teacher-primary-btn" onClick={openTeachingClassCreateDialog} disabled={!selectedTeachingCourseId}>
                      新建班级
                    </button>
                  </div>
                </header>
                <section className="teacher-personal-config">
                  <div className="teacher-course-class-list" role="tablist" aria-label="授课班级">
                    {courseMemoryConfig.classNames.length ? courseMemoryConfig.classNames.map((className) => (
                      <button
                        key={className}
                        type="button"
                        role="tab"
                        aria-selected={selectedTeachingClassName === className}
                        className={selectedTeachingClassName === className ? "is-selected" : ""}
                        onClick={() => void loadTeachingClassRoster(className)}
                      >
                        {className}
                      </button>
                    )) : <small>请先选择课程并建立班级。</small>}
                  </div>
                  {selectedTeachingClassName ? (
                    <section className="teacher-class-roster" aria-label={`${selectedTeachingClassName}学生信息`}>
                      <header>
                        <div>
                          <h3>{`${selectedTeachingClassName} · 学生信息与协同学习画像`}</h3>
                          <p>画像来自已整合的课堂过程记忆，用于辅助教师判断；它不是对学生能力或人格的固定标签。</p>
                        </div>
                        <div className="teacher-class-roster-actions">
                          <button type="button" className="teacher-ghost-btn" onClick={() => openCourseClassStudents(selectedTeachingClassName, true)}>
                            <Upload size={14} />导入学生
                          </button>
                          <button type="button" className="teacher-ghost-btn" onClick={() => void loadTeachingClassRoster(selectedTeachingClassName)} disabled={teachingClassRoster.loading}>
                            <RefreshCw size={14} className={teachingClassRoster.loading ? "is-spinning" : ""} />
                            {teachingClassRoster.loading ? "读取中..." : "刷新"}
                          </button>
                        </div>
                      </header>
                      {teachingClassRoster.error ? <p className="teacher-confirm-error">{teachingClassRoster.error}</p> : null}
                      {teachingClassRoster.loading ? <p className="teacher-empty-text">正在读取班级学生与协同记忆...</p> : teachingClassRoster.students.length === 0 ? <div className="teacher-class-roster-empty"><strong>当前班级还没有学生账号</strong><span>可先通过“导入学生”建立账号；学生完成结对编程后，系统会在夜间形成可追溯的协同学习画像。</span></div> : (
                        <div className="teacher-class-roster-table-wrap">
                          <table>
                            <thead><tr><th>学生</th><th>账号 / 学号</th><th>结对协作</th><th>协同学习画像</th><th>证据</th></tr></thead>
                            <tbody>{teachingClassRoster.students.map((student) => {
                              const portrait = student?.portrait || {};
                              const judgments = Array.isArray(portrait.judgments) ? portrait.judgments : [];
                              return <tr key={student.id}>
                                <td><strong>{student.name || "学生"}</strong><small>{student.gender || "性别未填"}</small></td>
                                <td><span>{student.username || "-"}</span><small>{student.studentId || "未填写学号"}</small></td>
                                <td>{student.room ? <><strong>{student.room.name}</strong><small>{student.room.partnerNames?.length ? `同伴：${student.room.partnerNames.join("、")}` : "已建立结对房间"}</small></> : <span className="teacher-class-roster-muted">尚未进入结对房间</span>}</td>
                                <td>{portrait.memoryCount ? <div className="teacher-class-portrait"><span>{`已整合 ${portrait.memoryCount} 条记忆 · ${portrait.knowledgeEvidenceCount || 0} 条知识证据`}</span>{portrait.latestActivity ? <p>{portrait.latestActivity}</p> : null}{judgments.map((item, index) => <p key={`${student.id}-judgment-${index}`} className="teacher-class-portrait-judgment">{item.summary}</p>)}</div> : <span className="teacher-class-roster-muted">尚未形成协同学习画像</span>}</td>
                                <td>{student.room ? <button type="button" className="teacher-ghost-btn" onClick={() => setMemoryDialogRoom({ id: student.room.id, name: student.room.name })}><BookCheck size={14} />记忆档案</button> : <span className="teacher-class-roster-muted">-</span>}</td>
                              </tr>;
                            })}</tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  ) : null}
                </section>
              </div>
            ) : activePanel === "course" ? (
              <div className="teacher-panel-stack teacher-course-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>课程管理</h2>
                    <p className="teacher-panel-save-time">
                      先建立需要授课的课程，再在课程下配置班级、课时任务和知识点；琳琳只引用教师保存的课程信息。
                      {courseMemoryConfig.updatedAt
                        ? ` · 最近保存：${formatDisplayTime(courseMemoryConfig.updatedAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      disabled={creatingTeachingCourse}
                      onClick={onCreateTeachingCourse}
                    >
                      {creatingTeachingCourse ? "新建中..." : "新建课程"}
                    </button>
                    <button
                      type="submit"
                      form="teacher-course-memory-form"
                      className="teacher-primary-btn"
                      disabled={
                        !courseMemoryConfig.courseId ||
                        courseMemoryConfig.loading ||
                        courseMemoryConfig.saving
                      }
                    >
                      {courseMemoryConfig.saving ? "保存中..." : "保存当前课程"}
                    </button>
                    <button
                      type="button"
                      className="teacher-danger-ghost-btn"
                      disabled={
                        !courseMemoryConfig.courseId || deletingTeachingCourse
                      }
                      onClick={() => void onDeleteTeachingCourse()}
                    >
                      {deletingTeachingCourse ? "删除中..." : "删除当前课程"}
                    </button>
                  </div>
                </header>

                {teachingCourses.length ? (
                  <section className="teacher-course-management-list" aria-label="已建立课程">
                    {teachingCourses.map((course) => {
                      const isSelected = course.id === selectedTeachingCourseId;
                      const classCount = Array.isArray(course.classNames)
                        ? course.classNames.length
                        : 0;
                      return (
                        <button
                          key={course.id}
                          type="button"
                          className={`teacher-course-summary-card${
                            isSelected ? " is-selected" : ""
                          }`}
                          aria-pressed={isSelected}
                          onClick={() => {
                            setSelectedTeachingCourseId(course.id);
                            void loadCourseMemoryConfig(course.id);
                          }}
                        >
                          <strong>{course.courseName || "未命名课程"}</strong>
                          <span>{course.termName || "未设置课程周期"}</span>
                          <small>
                            {canManageAllTeachingCourses
                              ? `${course.ownerTeacherName || "未绑定教师"} · ${classCount} 个授课班级`
                              : `${classCount} 个授课班级`}
                          </small>
                        </button>
                      );
                    })}
                  </section>
                ) : null}

                {courseMemoryConfig.courseId ? (
                <section className="teacher-card teacher-course-memory-config">
                  <form
                    id="teacher-course-memory-form"
                    onSubmit={onSaveCourseMemoryConfig}
                  >
                    <div className="teacher-course-memory-basic-row">
                      <label>
                        <span>课程名称</span>
                        <input
                          type="text"
                          value={courseMemoryConfig.courseName}
                          maxLength={100}
                          onChange={(event) =>
                            setCourseMemoryConfig((current) => ({
                              ...current,
                              courseName: event.target.value,
                              error: "",
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>学期或课程周期</span>
                        <input
                          type="text"
                          value={courseMemoryConfig.termName}
                          maxLength={80}
                          placeholder="例如：2026 秋季学期"
                          onChange={(event) =>
                            setCourseMemoryConfig((current) => ({
                              ...current,
                              termName: event.target.value,
                              error: "",
                            }))
                          }
                        />
                      </label>
                      {canManageAllTeachingCourses ? (
                        <label>
                          <span>授课教师</span>
                          <select
                            value={courseMemoryConfig.ownerTeacherId}
                            onChange={(event) => {
                              const teacherId = event.target.value;
                              const teacher = teachingCourseTeacherOptions.find(
                                (item) => item.id === teacherId,
                              );
                              setCourseMemoryConfig((current) => ({
                                ...current,
                                ownerTeacherId: teacherId,
                                ownerTeacherName: String(teacher?.name || ""),
                                error: "",
                              }));
                            }}
                          >
                            <option value="">暂不绑定教师</option>
                            {teachingCourseTeacherOptions.map((teacher) => (
                              <option key={teacher.id} value={teacher.id}>
                                {teacher.name}
                              </option>
                            ))}
                          </select>
                          <small>保存课程后生效。教师被绑定后，可在自己的教学工作台管理该课程。</small>
                        </label>
                      ) : null}
                    </div>
                    <section className="teacher-course-class-management">
                      <div>
                        <strong>班级管理</strong>
                        <small>班级、学生账号与批量导入均在班级管理中完成。</small>
                      </div>
                      <button type="button" className="teacher-ghost-btn" onClick={() => setActivePanel("class-manage")}>前往班级管理</button>
                    </section>
                    <label>
                      <span>课程大纲</span>
                      <textarea
                        value={courseMemoryConfig.syllabusText}
                        maxLength={20000}
                        rows={8}
                        placeholder="说明课程目标、单元顺序、小作品与大作品安排，以及希望琳琳遵守的课程边界。"
                        onChange={(event) =>
                          setCourseMemoryConfig((current) => ({
                            ...current,
                            syllabusText: event.target.value,
                            error: "",
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>知识点及前置关系</span>
                      <textarea
                        value={courseMemoryConfig.knowledgePointsText}
                        rows={12}
                        placeholder={"每行格式：单元｜知识点｜前置知识点（多个用顿号分隔）\nCSS 布局｜Flexbox 弹性布局｜CSS 盒模型"}
                        onChange={(event) =>
                          setCourseMemoryConfig((current) => ({
                            ...current,
                            knowledgePointsText: event.target.value,
                            error: "",
                          }))
                        }
                      />
                      <small>知识点名称需保持唯一。夜间记忆会自动把课堂证据与相应课时和知识点对齐。</small>
                    </label>
                    {courseMemoryConfig.error ? (
                      <span className="teacher-confirm-error">{courseMemoryConfig.error}</span>
                    ) : null}
                    <div className="teacher-course-memory-actions">
                      <span>{`${parseCourseKnowledgePointLines(courseMemoryConfig.knowledgePointsText, courseMemoryConfig.knowledgePoints).length} 个知识点`}</span>
                    </div>
                  </form>
                </section>
                ) : (
                  <section className="teacher-course-empty-state">
                    <h3>先新建一门课程</h3>
                    <p>教师注册后不需要绑定班级。先写清要教授的课程，再在课程内建立班级与课时任务。</p>
                  </section>
                )}
              </div>
            ) : activePanel === "classroom" ? (
              <div className="teacher-panel-stack teacher-classroom-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>课时任务</h2>
                    <p className="teacher-panel-save-time">
                      {`最近保存：${formatDisplayTime(classroomUpdatedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    {teachingCourses.length > 0 ? (
                      <label className="teacher-classroom-course-picker">
                        <span className="sr-only">选择课程</span>
                        <select
                          value={selectedTeachingCourseId}
                          onChange={(event) => {
                            const nextCourseId = String(event.target.value || "");
                            setSelectedTeachingCourseId(nextCourseId);
                            setLessonClassFilter("");
                            void loadCourseMemoryConfig(nextCourseId);
                          }}
                          aria-label="选择课程"
                        >
                          {teachingCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.courseName || "未命名课程"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {classroomConfigHasUnsavedChanges ? (
                      <span className="teacher-user-manage-dirty-tag">
                        课时内容未保存
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={() =>
                        setLessonListVisible((current) => !current)
                      }
                    >
                      {lessonListVisible ? "收起列表" : "展开列表"}
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={onCreateLesson}
                      disabled={loading || saving || uploadingFiles}
                    >
                      新建课时
                    </button>
                    <button
                      type="button"
                      className="teacher-primary-btn"
                      onClick={onSaveClassroomConfig}
                      disabled={loading || saving || uploadingFiles}
                    >
                      {saving ? "保存中..." : "保存课时"}
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
                          <span>{`${filteredCoursePlans.length}${filteredCoursePlans.length !== sortedCoursePlans.length ? `/${sortedCoursePlans.length}` : ""} 节课`}</span>
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

                    {!selectedTeachingCourse ? (
                      <p className="teacher-empty-text">
                        请先在“课程管理”中创建课程，再为该课程新建课时。
                      </p>
                    ) : sortedCoursePlans.length === 0 ? (
                      <p className="teacher-empty-text">
                        当前课程暂无课时，请点击右上角“新建课时”。
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
                                onClick={() => setSelectedCourseId(courseId)}
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
                              <span className="teacher-lesson-switch-label">开放课时</span>
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
                              <span className="teacher-lesson-switch-label">提交作业</span>
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
                                <span className="teacher-lesson-switch-label">允许补交</span>
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
                              options={authorizedClassOptions}
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
                        <section className="teacher-course-announcement teacher-lesson-announcement">
                          <header>
                            <div>
                              <strong><FileText size={16} />本课任务公告</strong>
                              <span>
                                公告属于当前课时；发布后会同步到全部结对房间，学生进入协作课堂即可看到。
                              </span>
                            </div>
                            <div className="teacher-lesson-announcement-header-actions">
                              {selectedCourse.announcementUpdatedAt ? (
                                <small>{`最近发布：${formatDisplayTime(selectedCourse.announcementUpdatedAt)}`}</small>
                              ) : null}
                              <button
                                type="button"
                                className="teacher-lesson-announcement-toggle"
                                onClick={() =>
                                  setLessonAnnouncementExpanded((current) => !current)
                                }
                                aria-expanded={lessonAnnouncementExpanded}
                              >
                                {lessonAnnouncementExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                <span>{lessonAnnouncementExpanded ? "收起公告" : "展开公告"}</span>
                              </button>
                            </div>
                          </header>
                          {lessonAnnouncementExpanded ? (
                            <form onSubmit={onSaveCourseAnnouncement}>
                            <textarea
                              value={selectedCourse.announcement || ""}
                              rows={3}
                              maxLength={500}
                              placeholder="例如：今天完成页面导航栏，先讨论结构，再由 Driver 编写 HTML，Navigator 检查语义与样式。"
                              onChange={(event) => {
                                onUpdateSelectedLesson({
                                  announcement: event.target.value,
                                });
                                setLessonAnnouncementStatus({
                                  lessonId: String(selectedCourse.id || ""),
                                  saving: false,
                                  error: "",
                                });
                              }}
                            />
                            <div className="teacher-course-announcement-actions">
                              <span>{`${String(selectedCourse.announcement || "").length}/500`}</span>
                              {lessonAnnouncementStatus.lessonId === String(selectedCourse.id || "") && lessonAnnouncementStatus.error ? (
                                <span className="teacher-confirm-error" role="alert">
                                  {lessonAnnouncementStatus.error}
                                </span>
                              ) : null}
                              <button
                                type="submit"
                                className="teacher-primary-btn"
                                disabled={
                                  lessonAnnouncementStatus.saving &&
                                  lessonAnnouncementStatus.lessonId === String(selectedCourse.id || "")
                                }
                              >
                                <Save size={14} />
                                {lessonAnnouncementStatus.saving && lessonAnnouncementStatus.lessonId === String(selectedCourse.id || "")
                                  ? "发布中..."
                                  : "发布本课公告"}
                              </button>
                            </div>
                            </form>
                          ) : null}
                        </section>

                        <div className="teacher-task-draft-head">
                          <div className="teacher-task-draft-title">
                            <strong>课时任务</strong>
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
                                onClick={() => setSelectedCourseId(courseId)}
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
                    <h2>数据与导出</h2>
                    <p className="teacher-panel-save-time">
                      导出课程对话、协作过程与课程成员记录
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

            {isTeacherManagementPanel || isStudentManagementPanel ? (
              <div className="teacher-panel-stack teacher-user-manage-stack">
                <header className="teacher-panel-head">
                  <div>
                    <h2>
                      {isTeacherManagementPanel
                        ? "教师管理"
                        : isPlatformUsersPanel
                          ? "平台所有用户"
                          : isTerminalAdmin
                            ? "学生管理"
                            : "学生账号"}
                    </h2>
                    <p className="teacher-panel-save-time">
                      {isTeacherManagementPanel
                        ? "教师通过登录页的“教师注册”开通账号；平台管理员可在此调整其授权班级。"
                        : isPlatformUsersPanel
                          ? `授课教师与学生账号分开管理；平台管理员不出现在此目录 · 最近刷新：${formatDisplayTime(userDirectoryUpdatedAt)}`
                          : isTerminalAdmin
                            ? `最近刷新：${formatDisplayTime(userDirectoryUpdatedAt)}`
                            : `仅显示本人授课班级的学生账号；既有账号仅可查看，可新增或批量导入学生 · 最近刷新：${formatDisplayTime(userDirectoryUpdatedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions teacher-user-manage-head-actions">
                    <div
                      className="teacher-user-manage-head-stats"
                      aria-label={
                        isTeacherManagementPanel
                          ? "教师账号统计"
                          : isPlatformUsersPanel
                            ? "平台账号统计"
                            : "学生账号统计"
                      }
                    >
                      {isTerminalAdmin && userDirectoryHasUnsavedChanges ? (
                        <span className="teacher-user-manage-dirty-tag">
                          {`未保存修改 ${userDirectoryPendingChangeCount}`}
                        </span>
                      ) : null}
                      <article className="teacher-user-manage-head-stat">
                        <div className="teacher-user-manage-head-stat-main">
                          <span>
                            {isTeacherManagementPanel
                              ? "教师账号"
                              : isPlatformUsersPanel
                                ? "业务账号"
                                : "学生账号"}
                          </span>
                          <strong>
                            {isTeacherManagementPanel
                              ? userDirectorySummary.teacherCount
                              : isPlatformUsersPanel
                                ? userDirectorySummary.totalCount
                                : userDirectorySummary.studentCount}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="teacher-user-manage-head-info"
                          aria-label={
                            isTeacherManagementPanel
                              ? "教师账号说明"
                              : isPlatformUsersPanel
                                ? "平台账号说明"
                                : "学生账号说明"
                          }
                        >
                          <CircleHelp size={13} />
                          <span
                            className="teacher-user-manage-head-tooltip"
                            role="tooltip"
                          >
                            {isTeacherManagementPanel
                              ? "已完成教师注册、可配置授课范围的教师账号数量。"
                              : isPlatformUsersPanel
                                ? "平台内授课教师与学生账号的总数；平台管理员不在此目录中。"
                                : "当前账号可管理范围内的学生账号数量。"}
                          </span>
                        </button>
                      </article>
                      {!isTeacherDirectoryPanel ? (
                      <article className="teacher-user-manage-head-stat">
                        <div className="teacher-user-manage-head-stat-main">
                          <span>{isPlatformUsersPanel ? "教师账号" : "班级分布"}</span>
                          <strong>
                            {isPlatformUsersPanel
                              ? userDirectorySummary.teacherCount
                              : userDirectorySummary.studentCount}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="teacher-user-manage-head-info"
                          aria-label={isPlatformUsersPanel ? "教师账号说明" : "学生用户说明"}
                        >
                          <CircleHelp size={13} />
                          <span
                            className="teacher-user-manage-head-tooltip"
                            role="tooltip"
                          >
                          {isPlatformUsersPanel
                            ? "已完成教师注册的授课教师账号数量。"
                            : `分类内 ${userDirectorySummary.targetClassStudentCount} / 班级外 ${userDirectorySummary.otherClassStudentCount} / 未填写班级 ${userDirectorySummary.unassignedStudentCount}`}
                          </span>
                        </button>
                      </article>
                      ) : null}
                    </div>
                    <div className="teacher-user-manage-head-action-tools">
                      {!isTeacherDirectoryPanel && userDirectoryCapabilities.canCreateStudents ? (
                        <button
                          type="button"
                          className="teacher-ghost-btn teacher-user-manage-create-btn"
                          onClick={openUserCreateDialog}
                          disabled={
                            userDirectoryLoading || userDirectorySavingChanges
                          }
                          aria-label="新增学生"
                        >
                          <Plus size={14} />
                          <span>新增学生</span>
                        </button>
                      ) : null}
                      {!isTeacherDirectoryPanel && userDirectoryCapabilities.canImportStudents ? (
                        <button
                          type="button"
                          className="teacher-ghost-btn teacher-user-manage-create-btn"
                          onClick={openStudentImportDialog}
                          disabled={userDirectoryLoading}
                        >
                          <Upload size={14} />
                          <span>批量导入</span>
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
                  {isPlatformUsersPanel ? (
                    <div className="teacher-user-directory-role-tabs" role="tablist" aria-label="用户类型">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={platformUserDirectoryView === "teachers"}
                        className={platformUserDirectoryView === "teachers" ? "active" : ""}
                        onClick={() => {
                          setPlatformUserDirectoryView("teachers");
                          setUserDirectoryClassFilter("all");
                        }}
                      >
                        {`授课教师（${userDirectorySummary.teacherCount}）`}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={platformUserDirectoryView === "students"}
                        className={platformUserDirectoryView === "students" ? "active" : ""}
                        onClick={() => setPlatformUserDirectoryView("students")}
                      >
                        {`学生（${userDirectorySummary.studentCount}）`}
                      </button>
                    </div>
                  ) : null}
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

                    {!isTeacherDirectoryPanel ? (
                    <div className="teacher-user-manage-filter-row">
                      <div className="teacher-user-manage-chip-panels">
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
                        ) : null}
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
                    ) : (
                      <div className="teacher-user-manage-filter-row">
                        <div className="teacher-user-manage-limit-hint">
                          教师与学生账号分开管理；这里不显示平台管理员账号。
                        </div>
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
                            ? "排序：最近注册/更新"
                            : "排序：账号"}
                        </button>
                      </div>
                    )}
                  </div>

                  {userDirectoryPanelItems.length === 0 ? (
                    <div className="teacher-image-library-empty">
                      <Users size={28} />
                      <p>
                        {userDirectoryLoading
                          ? "正在加载用户列表..."
                          : isTeacherDirectoryPanel
                            ? "暂无教师账号。教师可在登录页使用教师邀请码自行注册。"
                            : isPlatformUsersPanel
                              ? "暂无匹配的平台用户。"
                              : "暂无匹配的学生信息。"}
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
                            <th>姓名</th>
                        {isTeacherDirectoryPanel ? (
                          <th>授权班级</th>
                        ) : (
                              <>
                                <th>学号</th>
                                <th>所属班级</th>
                                <th>年级</th>
                                <th>性别</th>
                              </>
                            )}
                            <th>账号状态</th>
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
                    <h2>协作课堂</h2>
                    <p className="teacher-panel-save-time">
                      {`最近刷新：${formatDisplayTime(partyRoomManageUpdatedAt)}`}
                    </p>
                  </div>
                  <div className="teacher-panel-actions">
                    <button
                      type="button"
                      className="teacher-primary-btn teacher-tooltip-btn teacher-action-icon-btn"
                      onClick={openPairClassroomCreateDialog}
                      disabled={partyRoomManageLoading}
                      aria-label="新建结对小教室"
                      title="新建结对小教室"
                    >
                      <Plus size={14} />
                    </button>
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

                <section
                  className={`teacher-pair-monitoring-master${
                    pairMonitoringMasterEnabled ? " is-enabled" : ""
                  }`}
                >
                  <div>
                    <strong>AI 参与度感知总开关</strong>
                    <span>
                      {pairMonitoringMasterEnabled
                        ? "已开启。全部小教室都会启用 AI 参与度感知，新建小教室也会自动开启。"
                        : "默认关闭。教师上课时开启后，AI 会主动分析全部小教室中学生的参与情况。"}
                    </span>
                    {pairMonitoringMasterUpdatedAt ? (
                      <small>{`最近调整：${formatDisplayTime(pairMonitoringMasterUpdatedAt)}`}</small>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="teacher-pair-monitoring-master-toggle"
                    role="switch"
                    aria-checked={pairMonitoringMasterEnabled}
                    aria-label="AI 参与度感知总开关"
                    onClick={() => void onTogglePairMonitoringMaster()}
                    disabled={pairMonitoringMasterSaving}
                  >
                    <span>
                      {pairMonitoringMasterSaving
                        ? "处理中"
                        : pairMonitoringMasterEnabled
                          ? "已开启"
                          : "未开启"}
                    </span>
                    <span
                      className={`teacher-ios-switch-track${
                        pairMonitoringMasterEnabled ? " checked" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <span className="teacher-ios-switch-thumb" />
                    </span>
                  </button>
                </section>

                <section className="teacher-party-manage-card">
                  <div className="teacher-party-manage-summary">
                    <span>{`小教室：${collaborationClassroomItems.length}`}</span>
                    <span>{`参与度感知中：${collaborationClassroomItems.filter((room) => room?.paiaMonitoringEnabled === true).length}`}</span>
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
                              <div className="teacher-collab-room-head-actions">
                                <button
                                  type="button"
                                  className="teacher-ghost-btn teacher-collab-observe-btn"
                                  onClick={() => setMemoryDialogRoom(room)}
                                >
                                  <BookCheck size={14} />
                                  记忆档案
                                </button>
                                <button
                                  type="button"
                                  className="teacher-ghost-btn teacher-collab-observe-btn"
                                  onClick={() =>
                                    onObserveCollaborationClassroom(room)
                                  }
                                >
                                  <Eye size={14} />
                                  进入观察
                                </button>
                                <span
                                  className={`teacher-collab-monitor-status${monitoringEnabled ? " is-enabled" : ""}`}
                                >
                                  {monitoringEnabled
                                    ? "参与度感知中"
                                    : "参与度感知未开启"}
                                </span>
                              </div>
                            </header>

                            <div className="teacher-collab-monitor">
                              <div>
                                <strong>AI 主动感知学生参与情况</strong>
                                <span>
                                  {monitoringEnabled
                                    ? `已于 ${formatDisplayTime(room?.paiaMonitoringStartedAt)} 开启。后台 AI 会分析开启后最近五分钟的学生对话，并在参与明显失衡时主动发消息。`
                                    : "默认关闭。教师可在上课前开启；关闭时不会触发参与度分析或主动消息。"}
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
                                disabled={
                                  updatingMonitoringRoomId !== "" ||
                                  pairMonitoringMasterEnabled
                                }
                              >
                                {pairMonitoringMasterEnabled
                                  ? "总开关控制中"
                                  : updating
                                  ? "处理中..."
                                  : monitoringEnabled
                                    ? "关闭感知"
                                    : "开启感知"}
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
          {memoryDialogRoom ? (
            <TeacherRoomMemoryDialog
              adminToken={adminToken}
              room={memoryDialogRoom}
              onClose={() => setMemoryDialogRoom(null)}
              onAuthError={handleAuthError}
            />
          ) : null}

          {pairClassroomCreateDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closePairClassroomCreateDialog}
            >
              <div
                className="teacher-time-card teacher-party-create-card"
                role="dialog"
                aria-modal="true"
                aria-label="新建结对编程小教室"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>新建结对编程小教室</h3>
                <form
                  className="teacher-time-form"
                  onSubmit={onSubmitPairClassroomCreateDialog}
                >
                  <div className="teacher-party-create-basic-row">
                    <label>
                      <span>小教室名称（必填）</span>
                      <input
                        type="text"
                        value={pairClassroomCreateDialog.name}
                        onChange={(event) =>
                          setPairClassroomCreateDialog((current) => ({
                            ...current,
                            name: event.target.value,
                            error: "",
                          }))
                        }
                        maxLength={80}
                        autoFocus
                      />
                    </label>
                    <div className="teacher-pair-create-admin">
                      <span>授课教师</span>
                      <strong>{adminProfile.username || "当前教师"}</strong>
                    </div>
                  </div>
                  <div className="teacher-party-create-members">
                    <div className="teacher-party-create-members-head">
                      <div className="teacher-party-create-members-head-left">
                        <span>结对学生（必须选择两人）</span>
                        <span className="teacher-party-create-members-hint">
                          从系统现有学生账号中选择
                        </span>
                      </div>
                      <span>
                        {`已选 ${pairClassroomCreateDialog.studentUserIds.length}/${PAIR_CLASSROOM_STUDENT_LIMIT} 人`}
                      </span>
                    </div>
                    <div className="teacher-party-create-member-search">
                      <Search size={13} />
                      <input
                        type="text"
                        value={pairClassroomCreateDialog.studentKeyword}
                        onChange={(event) =>
                          setPairClassroomCreateDialog((current) => ({
                            ...current,
                            studentKeyword: event.target.value,
                            error: "",
                          }))
                        }
                        placeholder="搜索学生（姓名/账号/学号/班级）"
                        maxLength={80}
                      />
                      {String(
                        pairClassroomCreateDialog.studentKeyword || "",
                      ).trim() ? (
                        <button
                          type="button"
                          className="teacher-party-create-search-clear"
                          onClick={() =>
                            setPairClassroomCreateDialog((current) => ({
                              ...current,
                              studentKeyword: "",
                            }))
                          }
                          aria-label="清除学生搜索"
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                    </div>
                    <div className="teacher-party-create-member-list">
                      {pairClassroomVisibleStudentOptions.length === 0 ? (
                        <p className="teacher-party-create-empty">
                          暂无匹配学生
                        </p>
                      ) : (
                        pairClassroomVisibleStudentOptions.map((student) => {
                          const checked =
                            pairClassroomCreateDialog.studentUserIds.includes(
                              student.id,
                            );
                          const checkboxDisabled =
                            !checked &&
                            pairClassroomCreateDialog.studentUserIds.length >=
                              PAIR_CLASSROOM_STUDENT_LIMIT;
                          return (
                            <label
                              key={`pair-classroom-student-${student.id}`}
                              className={`teacher-party-create-member-item${checked ? " checked" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  onTogglePairClassroomStudent(student.id)
                                }
                                disabled={checkboxDisabled}
                              />
                              <div className="teacher-party-create-member-main">
                                <strong>{student.displayName}</strong>
                                <small>
                                  {`${student.className || "未分班"}${
                                    student.studentId
                                      ? ` · ${student.studentId}`
                                      : ""
                                  }${
                                    student.username
                                      ? ` · @${student.username}`
                                      : ""
                                  }`}
                                </small>
                              </div>
                              {checked ? (
                                <span className="teacher-pair-student-order">
                                  {`学生 ${
                                    pairClassroomCreateDialog.studentUserIds.indexOf(
                                      student.id,
                                    ) + 1
                                  }`}
                                </span>
                              ) : null}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                  {pairClassroomCreateDialog.error ? (
                    <span className="teacher-confirm-error">
                      {pairClassroomCreateDialog.error}
                    </span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={() =>
                        setPairClassroomCreateDialog((current) => ({
                          ...current,
                          studentUserIds: [],
                          error: "",
                        }))
                      }
                    >
                      清空学生
                    </button>
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closePairClassroomCreateDialog}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={pairClassroomCreateDialog.saving}
                    >
                      {pairClassroomCreateDialog.saving
                        ? "创建中..."
                        : "创建小教室"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {teachingClassCreateDialogOpen ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closeTeachingClassCreateDialog}
            >
              <div
                className="teacher-time-card teacher-class-create-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="新建班级"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>新建班级</h3>
                <p className="teacher-time-form-hint">请输入要添加到当前课程的班级名称。</p>
                <form
                  className="teacher-time-form"
                  autoComplete="off"
                  onSubmit={onCreateTeachingClass}
                >
                  <label>
                    <span>班级名称</span>
                    <input
                      type="text"
                      name="teaching-section-label"
                      value={newTeachingClassName}
                      placeholder="例如：810班"
                      maxLength={40}
                      autoComplete="off"
                      autoFocus
                      onChange={(event) => {
                        setNewTeachingClassName(event.target.value);
                        setTeachingClassError("");
                      }}
                    />
                  </label>
                  {teachingClassError ? (
                    <span className="teacher-confirm-error">{teachingClassError}</span>
                  ) : null}
                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeTeachingClassCreateDialog}
                      disabled={creatingTeachingClass}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={creatingTeachingClass}
                    >
                      {creatingTeachingClass ? "创建中..." : "确认创建"}
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
          {studentImportDialog.open ? (
            <div
              className="teacher-time-overlay"
              role="presentation"
              onClick={closeStudentImportDialog}
            >
              <div
                className="teacher-time-card teacher-student-import-card"
                role="dialog"
                aria-modal="true"
                aria-label="批量导入学生账号"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="teacher-student-import-head">
                  <div>
                    <h3>批量导入学生账号</h3>
                    <p>下载模板填写后上传，学号将作为学生登录账号。</p>
                  </div>
                  <button
                    type="button"
                    className="teacher-icon-btn"
                    onClick={closeStudentImportDialog}
                    aria-label="关闭批量导入"
                  >
                    <X size={16} />
                  </button>
                </div>
                <form
                  className="teacher-time-form"
                  onSubmit={onImportStudentAccounts}
                >
                  {isTerminalAdmin ? (
                    <label>
                      <span>绑定教师</span>
                      <select
                        value={studentImportDialog.teacherUserId}
                        onChange={(event) => {
                          const teacherUserId = event.target.value;
                          if (studentImportDialog.templateDownloadUrl) {
                            URL.revokeObjectURL(
                              studentImportDialog.templateDownloadUrl,
                            );
                          }
                          setStudentImportDialog((current) => ({
                            ...current,
                            teacherUserId,
                            file: null,
                            fileName: "",
                            downloading: false,
                            templateDownloadUrl: "",
                            templateFileName: "",
                            result: null,
                            error: "",
                          }));
                          void prepareStudentImportTemplate(teacherUserId);
                        }}
                      >
                        <option value="">请选择教师</option>
                        {studentImportTeacherOptions.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {`${teacher.label}（${teacher.authorizedClassNames.join("、") || "未授权班级"}）`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="teacher-student-import-steps">
                    <section>
                      <strong>第一步：下载模板</strong>
                      <span>已绑定班级会写入说明页；未绑定时仍可下载通用模板。</span>
                      {studentImportDialog.templateDownloadUrl ? (
                        <a
                          className="teacher-ghost-btn"
                          href={studentImportDialog.templateDownloadUrl}
                          download={
                            studentImportDialog.templateFileName ||
                            "学生账号批量导入模板.xlsx"
                          }
                        >
                          <Download size={14} />
                          <span>下载 Excel 模板</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() =>
                            void prepareStudentImportTemplate(
                              studentImportDialog.teacherUserId,
                            )
                          }
                          disabled={studentImportDialog.downloading}
                        >
                          <Download size={14} />
                          <span>
                            {studentImportDialog.downloading
                              ? "正在准备模板..."
                              : "重新准备模板"}
                          </span>
                        </button>
                      )}
                    </section>
                    <section>
                      <strong>第二步：上传填写后的文件</strong>
                      <span>支持 .xlsx 和 .xls，每次最多 500 名学生。</span>
                      <label className="teacher-student-import-file">
                        <Upload size={15} />
                        <span>
                          {studentImportDialog.fileName || "选择 Excel 文件"}
                        </span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            setStudentImportDialog((current) => ({
                              ...current,
                              file,
                              fileName: file?.name || "",
                              result: null,
                              error: "",
                            }));
                          }}
                        />
                      </label>
                    </section>
                  </div>

                  {studentImportDialog.error ? (
                    <span className="teacher-confirm-error" role="alert">
                      {studentImportDialog.error}
                    </span>
                  ) : null}

                  {studentImportDialog.result ? (
                    <div className="teacher-student-import-result">
                      <div className="teacher-student-import-result-head">
                        <p>
                          {`共 ${studentImportDialog.result.summary?.totalCount || 0} 行，成功 ${studentImportDialog.result.summary?.createdCount || 0}，失败 ${studentImportDialog.result.summary?.failedCount || 0}。`}
                        </p>
                        <button
                          type="button"
                          className="teacher-ghost-btn"
                          onClick={() => void onDownloadStudentImportResult()}
                        >
                          <Download size={14} />
                          <span>下载导入结果</span>
                        </button>
                      </div>
                      <p className="teacher-time-form-hint">
                        自动生成的初始密码只在本次结果中显示，请立即下载保存。
                      </p>
                      <div className="teacher-student-import-result-table-wrap">
                        <table className="teacher-user-manage-table">
                          <thead>
                            <tr>
                              <th>行号</th>
                              <th>姓名</th>
                              <th>账号</th>
                              <th>班级</th>
                              <th>初始密码</th>
                              <th>结果</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(studentImportDialog.result.results || []).map(
                              (item) => (
                                <tr key={`${item.rowNumber}-${item.studentId}`}>
                                  <td>{item.rowNumber}</td>
                                  <td>{item.name || "-"}</td>
                                  <td>{item.username || item.studentId || "-"}</td>
                                  <td>{item.className || "-"}</td>
                                  <td>{item.initialPassword || "-"}</td>
                                  <td>{item.message || "-"}</td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <div className="teacher-time-actions">
                    <button
                      type="button"
                      className="teacher-ghost-btn"
                      onClick={closeStudentImportDialog}
                    >
                      关闭
                    </button>
                    <button
                      type="submit"
                      className="teacher-primary-btn"
                      disabled={
                        studentImportDialog.importing ||
                        !studentImportDialog.file
                      }
                    >
                      {studentImportDialog.importing
                        ? "正在导入..."
                        : "开始批量导入"}
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
                  <p className="teacher-time-form-hint">
                    学号将作为学生的登录账号。
                  </p>
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
                      autoFocus
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
                    <input
                      type="text"
                      list="user-create-class-options"
                      value={userCreateDialog.className}
                      onChange={(event) =>
                        setUserCreateDialog((current) => ({
                          ...current,
                          className: String(event.target.value || ""),
                          error: "",
                        }))
                      }
                      placeholder="输入班级，或从已有班级中选择"
                      maxLength={40}
                    />
                    <datalist id="user-create-class-options">
                      {userCreateClassOptions.map((className) => (
                        <option
                          key={`create-class-${className}`}
                          value={className}
                        />
                      ))}
                    </datalist>
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
                  {isTerminalAdmin ? (
                    <>
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
                    </>
                  ) : (
                    <p className="teacher-time-form-hint">
                      学生账号会自动绑定到当前教师及对应授权班级。
                    </p>
                  )}
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
                      {userCreateDialog.saving ? "创建中..." : "创建学生"}
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
                  {["admin", "teacher"].includes(userEditDialog.role) ? (
                    <label>
                      <span>授权班级</span>
                      <textarea
                        value={userEditDialog.authorizedClassNamesText}
                        onChange={(event) =>
                          setUserEditDialog((current) => ({
                            ...current,
                            authorizedClassNamesText: event.target.value,
                            error: "",
                          }))
                        }
                        placeholder="例如：810班、811班"
                        rows={3}
                        maxLength={500}
                      />
                      <small className="teacher-time-form-hint">
                        多个班级使用顿号、逗号或换行分隔。该教师只能查看和导入这些班级的学生。
                      </small>
                    </label>
                  ) : null}
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

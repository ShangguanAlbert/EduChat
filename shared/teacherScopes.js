export const DEFAULT_TEACHER_SCOPE_KEY = "default";
export const SHANGGUAN_FUZE_TEACHER_SCOPE_KEY = "shangguan-fuze";
export const YANG_JUNFENG_TEACHER_SCOPE_KEY = "yang-junfeng";

export const TEACHER_SCOPE_OPTIONS = Object.freeze([
  { key: SHANGGUAN_FUZE_TEACHER_SCOPE_KEY, label: "上官福泽" },
  { key: YANG_JUNFENG_TEACHER_SCOPE_KEY, label: "杨俊锋" },
  { key: DEFAULT_TEACHER_SCOPE_KEY, label: "默认" },
]);

const TEACHER_SCOPE_LABEL_MAP = new Map(
  TEACHER_SCOPE_OPTIONS.map((item) => [item.key, item.label]),
);

export function sanitizeTeacherScopeKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (TEACHER_SCOPE_LABEL_MAP.has(key)) return key;
  return DEFAULT_TEACHER_SCOPE_KEY;
}

export function isDefaultTeacherScopeKey(value) {
  return sanitizeTeacherScopeKey(value) === DEFAULT_TEACHER_SCOPE_KEY;
}

export function getTeacherScopeLabel(value) {
  const key = sanitizeTeacherScopeKey(value);
  return TEACHER_SCOPE_LABEL_MAP.get(key) || TEACHER_SCOPE_LABEL_MAP.get(DEFAULT_TEACHER_SCOPE_KEY);
}

export function buildTeacherScopedStorageUserId(userId, teacherScopeKey) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) return "";

  const key = sanitizeTeacherScopeKey(teacherScopeKey);
  if (key === DEFAULT_TEACHER_SCOPE_KEY) return safeUserId;
  return `${safeUserId}__teacher__${key}`;
}

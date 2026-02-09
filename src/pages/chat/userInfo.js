import {
  DEFAULT_USER_INFO,
  GENDER_OPTIONS,
  GRADE_OPTIONS,
  USER_INFO_STORAGE_KEY,
  USER_INFO_UPDATED_EVENT,
} from "./constants";

export function sanitizeUserInfo(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_USER_INFO };
  return {
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    studentId: typeof raw.studentId === "string" ? raw.studentId.trim() : "",
    gender: typeof raw.gender === "string" ? raw.gender.trim() : "",
    grade: typeof raw.grade === "string" ? raw.grade.trim() : "",
    className: typeof raw.className === "string" ? raw.className.trim() : "",
  };
}

export function validateUserInfo(userInfo) {
  const info = sanitizeUserInfo(userInfo);
  const errors = {};

  if (!info.name) {
    errors.name = "请输入姓名";
  } else if (!/^[\u4e00-\u9fa5]+$/.test(info.name)) {
    errors.name = "姓名仅支持汉字";
  }

  if (!info.studentId) {
    errors.studentId = "请输入学号";
  } else if (!/^\d+$/.test(info.studentId)) {
    errors.studentId = "学号仅支持数字";
  } else if (info.studentId.length > 20) {
    errors.studentId = "学号不能超过 20 位";
  }

  if (!GENDER_OPTIONS.includes(info.gender)) {
    errors.gender = "请选择性别";
  }

  if (!GRADE_OPTIONS.includes(info.grade)) {
    errors.grade = "请选择年级";
  }

  if (!info.className) {
    errors.className = "请输入班级";
  }

  return errors;
}

export function isUserInfoComplete(userInfo) {
  return Object.keys(validateUserInfo(userInfo)).length === 0;
}

export function readUserInfo() {
  try {
    const raw = localStorage.getItem(USER_INFO_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_INFO };
    return sanitizeUserInfo(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_USER_INFO };
  }
}

export function persistUserInfo(userInfo) {
  const next = sanitizeUserInfo(userInfo);
  try {
    localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent(USER_INFO_UPDATED_EVENT, {
        detail: next,
      }),
    );
  } catch {
    // ignore localStorage write failure
  }
}

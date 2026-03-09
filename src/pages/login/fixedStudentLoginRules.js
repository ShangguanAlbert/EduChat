import {
  FIXED_STUDENT_ACCOUNTS,
  FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
} from "../../../shared/fixedStudentAccounts.js";

export const FIXED_STUDENT_LOGIN_REQUIRED_TEACHER_SCOPE_KEY =
  FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY;

export const FIXED_STUDENT_LOGIN_RULES = Object.freeze(
  FIXED_STUDENT_ACCOUNTS.map((item) =>
    Object.freeze({
      username: String(item?.username || "").trim(),
      studentId: String(item?.studentId || "").trim(),
      usernameKey: String(item?.username || "")
        .trim()
        .toLowerCase(),
      requiredTeacherScopeKey: FIXED_STUDENT_LOGIN_REQUIRED_TEACHER_SCOPE_KEY,
    }),
  ),
);

export function findFixedStudentLoginRuleByUsername(username) {
  const usernameKey = String(username || "")
    .trim()
    .toLowerCase();
  if (!usernameKey) return null;
  return FIXED_STUDENT_LOGIN_RULES.find((item) => item.usernameKey === usernameKey) || null;
}

export function resolveFixedStudentTeacherScopeKeyByUsername(username) {
  return findFixedStudentLoginRuleByUsername(username)?.requiredTeacherScopeKey || "";
}

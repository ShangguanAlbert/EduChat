import crypto from "node:crypto";

import {
  SHI_GAOJUN_TEACHER_SCOPE_KEY,
  sanitizeTeacherScopeKey,
} from "../../../shared/teacherScopes.js";

export const DEFAULT_PAIR_PROGRAMMING_INVITE_CODE = "pair2026";

export function isPairProgrammingTeacherScope(value) {
  return sanitizeTeacherScopeKey(value) === SHI_GAOJUN_TEACHER_SCOPE_KEY;
}

export function isPairProgrammingInviteCodeValid(
  value,
  expectedCode = DEFAULT_PAIR_PROGRAMMING_INVITE_CODE,
) {
  const actual = Buffer.from(String(value || "").trim());
  const expected = Buffer.from(
    String(expectedCode || DEFAULT_PAIR_PROGRAMMING_INVITE_CODE).trim(),
  );
  return (
    actual.length > 0 &&
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

export function hasPairProgrammingTokenAccess(payload, teacherScopeKey) {
  return (
    !isPairProgrammingTeacherScope(teacherScopeKey) ||
    payload?.pairProgrammingAccess === true
  );
}

export function canAccessTeacherScopedRoom({
  roomTeacherScopeKey,
  requestTeacherScopeKey,
  pairProgrammingAccess = false,
} = {}) {
  const roomIsPairProgramming = isPairProgrammingTeacherScope(
    roomTeacherScopeKey,
  );
  const requestIsPairProgramming = isPairProgrammingTeacherScope(
    requestTeacherScopeKey,
  );
  return (
    roomIsPairProgramming === requestIsPairProgramming &&
    (!roomIsPairProgramming || pairProgrammingAccess === true)
  );
}

export function readCollaborationObserverRoomId(payload) {
  if (
    payload?.collaborationObserver !== true ||
    String(payload?.role || "").trim().toLowerCase() !== "admin" ||
    String(payload?.scope || "").trim().toLowerCase() !== "chat"
  ) {
    return "";
  }
  return String(payload?.observerRoomId || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.$]/g, "")
    .slice(0, 80);
}

export function isCollaborationObserverForRoom(
  observerRoomId,
  requestedRoomId,
) {
  const safeObserverRoomId = String(observerRoomId || "").trim();
  const safeRequestedRoomId = String(requestedRoomId || "").trim();
  return (
    safeObserverRoomId.length > 0 &&
    safeObserverRoomId === safeRequestedRoomId
  );
}

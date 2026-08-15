import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessTeacherScopedRoom,
  DEFAULT_PAIR_PROGRAMMING_INVITE_CODE,
  hasPairProgrammingTokenAccess,
  isCollaborationObserverForRoom,
  isPairProgrammingInviteCodeValid,
  isPairProgrammingTeacherScope,
  readCollaborationObserverRoomId,
} from "../../server/modules/party-coding/access-control.js";

test("pair programming invite code is required only for Shi Gaojun scope", () => {
  assert.equal(isPairProgrammingTeacherScope("shi-gaojun"), true);
  assert.equal(isPairProgrammingTeacherScope("yang-junfeng"), false);
  assert.equal(
    isPairProgrammingInviteCodeValid(DEFAULT_PAIR_PROGRAMMING_INVITE_CODE),
    true,
  );
  assert.equal(isPairProgrammingInviteCodeValid("wrong-code"), false);
  assert.equal(isPairProgrammingInviteCodeValid(""), false);
});

test("ordinary teacher logins cannot access pair programming rooms", () => {
  assert.equal(
    canAccessTeacherScopedRoom({
      roomTeacherScopeKey: "shi-gaojun",
      requestTeacherScopeKey: "yang-junfeng",
      pairProgrammingAccess: false,
    }),
    false,
  );
  assert.equal(
    canAccessTeacherScopedRoom({
      roomTeacherScopeKey: "shi-gaojun",
      requestTeacherScopeKey: "shi-gaojun",
      pairProgrammingAccess: true,
    }),
    true,
  );
  assert.equal(
    canAccessTeacherScopedRoom({
      roomTeacherScopeKey: "yang-junfeng",
      requestTeacherScopeKey: "shi-gaojun",
      pairProgrammingAccess: true,
    }),
    false,
  );
});

test("pair programming tokens require an explicit access claim", () => {
  assert.equal(
    hasPairProgrammingTokenAccess(
      { pairProgrammingAccess: true },
      "shi-gaojun",
    ),
    true,
  );
  assert.equal(hasPairProgrammingTokenAccess({}, "shi-gaojun"), false);
  assert.equal(hasPairProgrammingTokenAccess({}, "yang-junfeng"), true);
});

test("teacher observer claim is scoped to one collaboration classroom", () => {
  const roomId = "507f1f77bcf86cd799439011";
  assert.equal(
    readCollaborationObserverRoomId({
      collaborationObserver: true,
      role: "admin",
      scope: "chat",
      observerRoomId: roomId,
    }),
    roomId,
  );
  assert.equal(
    isCollaborationObserverForRoom(roomId, roomId),
    true,
  );
  assert.equal(
    isCollaborationObserverForRoom(roomId, "507f1f77bcf86cd799439012"),
    false,
  );
  assert.equal(
    readCollaborationObserverRoomId({
      collaborationObserver: true,
      role: "user",
      scope: "chat",
      observerRoomId: roomId,
    }),
    "",
  );
});

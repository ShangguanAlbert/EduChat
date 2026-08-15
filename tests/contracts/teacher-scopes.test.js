import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TEACHER_SCOPE_KEY,
  getTeacherScopeStudentEntryPath,
  isStudentTeacherScopeSelectable,
  SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
  SHI_GAOJUN_TEACHER_SCOPE_KEY,
  STUDENT_TEACHER_SCOPE_OPTIONS,
  TEACHER_SCOPE_OPTIONS,
} from "../../shared/teacherScopes.js";

test("Shi Gaojun scope is available and opens party collaboration", () => {
  assert.ok(
    TEACHER_SCOPE_OPTIONS.some((item) => item.key === SHI_GAOJUN_TEACHER_SCOPE_KEY),
  );
  assert.equal(getTeacherScopeStudentEntryPath(SHI_GAOJUN_TEACHER_SCOPE_KEY), "/party");
});

test("other teacher scopes preserve their student entry routes", () => {
  assert.equal(getTeacherScopeStudentEntryPath("shangguan-fuze"), "/mode-selection");
  assert.equal(getTeacherScopeStudentEntryPath(DEFAULT_TEACHER_SCOPE_KEY), "/chat");
});

test("Shangguan Fuze remains a historical scope but is not student-selectable", () => {
  assert.ok(
    TEACHER_SCOPE_OPTIONS.some(
      (item) => item.key === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
    ),
  );
  assert.equal(
    STUDENT_TEACHER_SCOPE_OPTIONS.some(
      (item) => item.key === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
    ),
    false,
  );
  assert.equal(isStudentTeacherScopeSelectable(SHANGGUAN_FUZE_TEACHER_SCOPE_KEY), false);
  assert.equal(isStudentTeacherScopeSelectable(SHI_GAOJUN_TEACHER_SCOPE_KEY), true);
  assert.equal(isStudentTeacherScopeSelectable(DEFAULT_TEACHER_SCOPE_KEY), true);
});

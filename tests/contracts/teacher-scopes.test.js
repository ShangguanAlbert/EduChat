import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TEACHER_SCOPE_KEY,
  getTeacherScopeStudentEntryPath,
  SHI_GAOJUN_TEACHER_SCOPE_KEY,
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

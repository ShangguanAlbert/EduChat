import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPagePath = new URL("../../src/pages/LoginPage.jsx", import.meta.url);
const authRoutesPath = new URL(
  "../../server/routes/auth-user-classroom.js",
  import.meta.url,
);
const authCorePath = new URL(
  "../../server/services/core-runtime.js",
  import.meta.url,
);

test("pair-programming login exposes only Shi Gaojun as the supervising teacher", async () => {
  const source = await readFile(loginPagePath, "utf8");

  assert.match(source, /const teacherScopeKey = SHI_GAOJUN_TEACHER_SCOPE_KEY/);
  assert.match(source, />\s*指导教师\s*</);
  assert.match(source, /value="施高俊"/);
  assert.doesNotMatch(source, /STUDENT_TEACHER_SCOPE_OPTIONS|PortalSelect/);
  assert.match(source, /注册账号|showRegisterModal/);
  assert.match(source, /value="student"/);
  assert.match(source, /value="teacher"/);
  assert.match(source, /教师邀请码/);
  assert.doesNotMatch(source, /忘记密码|showForgotModal/);
});

test("student login rejects teacher scopes outside the pair-programming class", async () => {
  const source = await readFile(authRoutesPath, "utf8");

  assert.match(
    source,
    /teacherScopeKey !== SHI_GAOJUN_TEACHER_SCOPE_KEY/,
  );
  assert.match(source, /当前入口仅支持施高俊老师的结对编程课堂/);
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /TEACHER_REGISTRATION_INVITE_CODE/);
  assert.match(source, /ACCOUNT_STATUS_PENDING_BINDING/);
  assert.doesNotMatch(source, /\/api\/auth\/(?:login\/teacher-scope-lock|forgot\/)/);
});

test("authentication stores password hashes and requires a production secret", async () => {
  const source = await readFile(authCorePath, "utf8");

  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /crypto\.randomBytes\(32\)\.toString\("hex"\)/);
  assert.match(source, /removeLegacyPlaintextPasswords/);
  assert.doesNotMatch(source, /educhat-dev-secret-change-this-secret/);
  assert.doesNotMatch(source, /passwordPlain:\s*password/);
});

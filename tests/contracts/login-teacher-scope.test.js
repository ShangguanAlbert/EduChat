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
const envExamplePath = new URL("../../.env.example", import.meta.url);

test("student daily login uses account binding instead of a teacher or classroom invite field", async () => {
  const source = await readFile(loginPagePath, "utf8");

  assert.match(source, /账号或学号/);
  assert.match(source, /使用教师发放的账号和密码登录/);
  assert.doesNotMatch(source, /pairProgrammingInviteCode/);
  assert.doesNotMatch(source, /login-teacher-name/);
  assert.doesNotMatch(source, /pair-programming-invite-code/);
  assert.doesNotMatch(source, /teacherScopeKey,\s*inviteCode/);
  assert.doesNotMatch(source, /STUDENT_TEACHER_SCOPE_OPTIONS|PortalSelect/);
  assert.match(source, /加入课堂/);
  assert.match(source, /教师注册/);
  assert.doesNotMatch(source, /id="register-role"/);
  assert.doesNotMatch(source, /register-gender|register-grade/);
  assert.match(source, /registerProfile\.studentId\.trim\(\)/);
  assert.match(source, /教师邀请码/);
  assert.doesNotMatch(source, /初始授课班级/);
  assert.doesNotMatch(source, /teacherClassNames/);
  assert.match(source, /绑定自己的授课课程/);
  assert.doesNotMatch(source, /忘记密码|showForgotModal/);
});

test("student login derives the classroom scope from the bound account", async () => {
  const source = await readFile(authRoutesPath, "utf8");

  assert.match(source, /const effectiveTeacherScopeKey = resolveLoginLockedTeacherScopeKey\(user\)/);
  assert.match(source, /该账号尚未绑定授课教师，请联系教师处理/);
  assert.match(source, /教师请使用「教师登录」/);
  const loginRouteSource = source.slice(
    source.indexOf('app.post("/api/auth/login"'),
    source.indexOf('app.post("/api/auth/admin/login"'),
  );
  assert.doesNotMatch(
    loginRouteSource,
    /req\.body\?\.(?:teacherScopeKey|inviteCode)/,
  );
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /TEACHER_REGISTRATION_INVITE_CODE/);
  assert.doesNotMatch(source, /teacherClassNames/);
  assert.doesNotMatch(source, /请填写至少一个初始授课班级/);
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

test("optional student profile fields do not block account activation", async () => {
  const source = await readFile(authCorePath, "utf8");

  assert.match(source, /profile\.gender && !genderOptions\.includes/);
  assert.match(source, /profile\.grade && !gradeOptions\.includes/);
});

test("deployment configuration provisions only one platform administrator", async () => {
  const [authSource, envSource] = await Promise.all([
    readFile(authCorePath, "utf8"),
    readFile(envExamplePath, "utf8"),
  ]);

  assert.match(authSource, /ensurePlatformAdminAccount/);
  assert.match(authSource, /PLATFORM_ADMIN_ACCOUNT_TAG/);
  assert.doesNotMatch(authSource, /FIXED_(?:ADMIN|STUDENT)_ACCOUNTS/);
  assert.match(envSource, /PLATFORM_ADMIN_USERNAME=/);
  assert.match(envSource, /PLATFORM_ADMIN_PASSWORD=/);
  assert.doesNotMatch(envSource, /FIXED_(?:ADMIN|STUDENT)_ACCOUNTS/);
});

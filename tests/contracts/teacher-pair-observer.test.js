import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const teacherHomePageSource = fs.readFileSync(
  path.resolve("src/pages/TeacherHomePage.jsx"),
  "utf8",
);
const observerPageSource = fs.readFileSync(
  path.resolve("src/features/admin/pages/TeacherCollaborationObserverPage.jsx"),
  "utf8",
);
const adminRoutesSource = fs.readFileSync(
  path.resolve("src/features/admin/routes.js"),
  "utf8",
);
const adminApiRoutesSource = fs.readFileSync(
  path.resolve("server/routes/admin.js"),
  "utf8",
);

test("pair classrooms expose the teacher observer entry and route", () => {
  assert.match(teacherHomePageSource, /进入观察/);
  assert.match(
    adminRoutesSource,
    /\/admin\/collaboration-observer\/:roomId/,
  );
  assert.match(observerPageSource, /教师旁观模式/);
  assert.match(observerPageSource, /您不是小教室成员/);
});

test("teacher home uses the focused pair-programming navigation for every teacher", () => {
  assert.match(
    teacherHomePageSource,
    /label: "结对编程教学"/,
  );
  assert.match(
    teacherHomePageSource,
    /\{ key: "party-manage", label: "协作课堂", icon: Activity \}/,
  );
  assert.match(
    teacherHomePageSource,
    /\{ key: "classroom", label: "课时任务", icon: ClipboardList \}/,
  );
  assert.match(
    teacherHomePageSource,
    /\{ key: "course", label: "课程", icon: BookCheck \}/,
  );
  assert.doesNotMatch(teacherHomePageSource, /label: "课程与任务"/);
  assert.doesNotMatch(teacherHomePageSource, />作业要求说明</);
  assert.match(teacherHomePageSource, />开放课时</);
  assert.match(teacherHomePageSource, />提交作业</);
  assert.match(teacherHomePageSource, />允许补交</);
  assert.match(teacherHomePageSource, /requestedTeacherPanel \|\| "party-manage"/);
  assert.doesNotMatch(
    teacherHomePageSource,
    /\{ key: "discipline", label: "纪律管理"/,
  );
  assert.doesNotMatch(
    teacherHomePageSource,
    /\{ key: "random-rollcall", label: "随机点名"/,
  );
  assert.doesNotMatch(teacherHomePageSource, /group-chat-manage/);
  assert.doesNotMatch(teacherHomePageSource, /群聊与公告/);
  assert.match(
    adminApiRoutesSource,
    /function canManageCollaborationClassrooms\(admin\) \{[\s\S]*\["admin", "teacher"\]\.includes/,
  );
  assert.match(
    adminApiRoutesSource,
    /app\.put\(\s*"\/api\/auth\/admin\/collaboration-classrooms\/announcement"/,
  );
  assert.doesNotMatch(
    adminApiRoutesSource,
    /app\.post\("\/api\/auth\/admin\/group-chat\/rooms"/,
  );
  assert.doesNotMatch(
    adminApiRoutesSource,
    /app\.delete\("\/api\/auth\/admin\/group-chat\/rooms/,
  );
});

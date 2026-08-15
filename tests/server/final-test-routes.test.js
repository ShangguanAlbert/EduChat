import assert from "node:assert/strict";
import test from "node:test";

import { registerAuthUserClassroomRoutes } from "../../server/routes/auth-user-classroom.js";

function createAppDouble() {
  const routes = [];
  return {
    routes,
    use() {
      return this;
    },
    get(path, ...handlers) {
      routes.push({ method: "get", path, handlers });
      return this;
    },
    post(path, ...handlers) {
      routes.push({ method: "post", path, handlers });
      return this;
    },
    put(path, ...handlers) {
      routes.push({ method: "put", path, handlers });
      return this;
    },
    delete(path, ...handlers) {
      routes.push({ method: "delete", path, handlers });
      return this;
    },
  };
}

function createResponseDouble() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function createFinalTestSessionModelDouble() {
  const store = new Map();

  function normalizeKey(query) {
    return [
      String(query?.teacherScopeKey || ""),
      String(query?.studentUserId || ""),
      String(query?.className || ""),
    ].join("::");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  return {
    async findOne(query) {
      return clone(store.get(normalizeKey(query)) || null);
    },
    find(query = {}) {
      const teacherScopeKey = String(query?.teacherScopeKey || "");
      const keyValue = String(query?.key || "");
      const classNameFilter = query?.className;
      const classNameValues =
        classNameFilter && typeof classNameFilter === "object" && Array.isArray(classNameFilter.$in)
          ? new Set(classNameFilter.$in.map((item) => String(item || "")))
          : null;
      const results = Array.from(store.values()).filter((item) => {
        if (teacherScopeKey && String(item?.teacherScopeKey || "") !== teacherScopeKey) {
          return false;
        }
        if (keyValue && String(item?.key || "") !== keyValue) {
          return false;
        }
        if (classNameValues && !classNameValues.has(String(item?.className || ""))) {
          return false;
        }
        return true;
      });
      return {
        lean: async () => clone(results),
      };
    },
    async findOneAndUpdate(query, update, options = {}) {
      const key = normalizeKey(query);
      const current = clone(store.get(key) || {});
      const setPayload = update?.$set && typeof update.$set === "object" ? update.$set : {};
      const next = {
        ...current,
        ...setPayload,
      };
      if (!next.teacherScopeKey) next.teacherScopeKey = String(query?.teacherScopeKey || "");
      if (!next.studentUserId) next.studentUserId = String(query?.studentUserId || "");
      if (!next.className) next.className = String(query?.className || "");
      store.set(key, clone(next));
      return options?.lean ? clone(next) : next;
    },
  };
}

function createAuthUserModelDouble(initialUsers = []) {
  const store = Array.isArray(initialUsers)
    ? JSON.parse(JSON.stringify(initialUsers))
    : [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  return {
    find(query = {}) {
      const teacherScopeKey = String(query?.lockedTeacherScopeKey || "");
      const role = String(query?.role || "");
      const usernameKeyFilter = query?.usernameKey;
      const usernameKeyValues =
        usernameKeyFilter &&
        typeof usernameKeyFilter === "object" &&
        Array.isArray(usernameKeyFilter.$in)
          ? new Set(usernameKeyFilter.$in.map((item) => String(item || "")))
          : null;
      const results = store.filter((item) => {
        if (teacherScopeKey && String(item?.lockedTeacherScopeKey || "") !== teacherScopeKey) {
          return false;
        }
        if (role && String(item?.role || "") !== role) {
          return false;
        }
        if (usernameKeyValues && !usernameKeyValues.has(String(item?.usernameKey || ""))) {
          return false;
        }
        return true;
      });
      return {
        lean: async () => clone(results),
      };
    },
  };
}

function createAdminConfigModelDouble(initial = {}) {
  let store = {
    key: "admin-config",
    updatedAt: "2026-05-31T00:00:00.000Z",
    ...JSON.parse(JSON.stringify(initial)),
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  return {
    read() {
      return clone(store);
    },
    findOneAndUpdate(query, update) {
      const setPayload = update?.$set && typeof update.$set === "object" ? update.$set : {};
      store = {
        ...store,
        ...clone(setPayload),
        key: String(query?.key || store.key || "admin-config"),
        updatedAt: "2026-05-31T08:00:00.000Z",
      };
      return {
        lean: async () => clone(store),
      };
    },
  };
}

function createFinalTestDeps() {
  const env = {
    FINAL_TEST_TURNBACK_PASSPHRASE: "test-turnback-passphrase",
    FINAL_TEST_RESTART_PASSPHRASE: "test-restart-passphrase",
  };
  const noopMiddleware = (_req, _res, next) => {
    if (typeof next === "function") next();
  };
  const identityText = (value, fallback = "", maxLength = 80) =>
    String(value ?? fallback)
      .trim()
      .slice(0, maxLength);
  const FinalTestSession = createFinalTestSessionModelDouble();
  const AuthUser = createAuthUserModelDouble([
    {
      _id: "student-810",
      username: "zhangsan810",
      usernameKey: "zhangsan810",
      role: "user",
      lockedTeacherScopeKey: "shangguan-fuze",
      profile: {
        name: "张三",
        studentId: "81001",
        className: "810班",
      },
    },
    {
      _id: "student-810-2",
      username: "lisi810",
      usernameKey: "lisi810",
      role: "user",
      lockedTeacherScopeKey: "shangguan-fuze",
      profile: {
        name: "李四",
        studentId: "81002",
        className: "810班",
      },
    },
    {
      _id: "student-811",
      username: "wangwu811",
      usernameKey: "wangwu811",
      role: "user",
      lockedTeacherScopeKey: "shangguan-fuze",
      profile: {
        name: "王五",
        studentId: "81101",
        className: "811班",
      },
    },
    {
      _id: "student-other",
      username: "otherclass",
      usernameKey: "otherclass",
      role: "user",
      lockedTeacherScopeKey: "shangguan-fuze",
      profile: {
        name: "其他班学生",
        studentId: "99901",
        className: "999班",
      },
    },
  ]);
  const AdminConfig = createAdminConfigModelDouble({
    shangguanClassTaskProductImprovementEnabled: false,
    seatLayoutsByClass: {},
    finalTestConfig: {
      introText: "本次期末测试分为两个部分。第一个部分是改进任务，第二个部分是创新任务。",
      tasks: [
        {
          id: "task-1",
          title: "任务 1：改进普通书包",
          description: "请围绕普通书包提出改进方案，尽量写清楚你发现的问题、改进思路和使用方式。",
          mode: "platform",
        },
        {
          id: "task-2",
          title: "任务 2：创新任务",
          description: "任务 2：创新任务在线下独立完成，不在本页面提交。",
          mode: "offline",
        },
      ],
    },
    teacherCoursePlans: [
      {
        id: "lesson-810-open",
        courseName: "第1节课-810",
        className: "810班",
        enabled: true,
        courseStartAt: "2026-05-10T10:00:00.000Z",
      },
      {
        id: "lesson-811-open",
        courseName: "第1节课-811",
        className: "811班",
        enabled: true,
        courseStartAt: "2026-05-12T10:00:00.000Z",
      },
    ],
  });
  return {
    cors: () => noopMiddleware,
    express: {
      json: () => noopMiddleware,
    },
    env,
    requireChatAuth: noopMiddleware,
    requireAdminAuth: noopMiddleware,
    studentHomeworkUpload: {
      array: () => noopMiddleware,
    },
    teacherClassroomFileUpload: {
      array: () => noopMiddleware,
    },
    authenticateAdminRequest: async () => ({
      _id: "admin-1",
      username: "teacher",
      role: "admin",
    }),
    SHANGGUAN_FUZE_TEACHER_SCOPE_KEY: "shangguan-fuze",
    DEFAULT_TEACHER_SCOPE_KEY: "default",
    ADMIN_CONFIG_KEY: "admin-config",
    CLASSROOM_FIRST_LESSON_DATE: "2026-03-11",
    CLASSROOM_QUESTIONNAIRE_URL: "",
    sanitizeTeacherScopeKey: (value) => String(value || "").trim().toLowerCase(),
    sanitizeId: (value) => String(value || "").trim(),
    sanitizeText: identityText,
    sanitizeIsoDate: (value) => String(value || "").trim(),
    sanitizeRuntimeBoolean(value, fallback = false) {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return fallback;
    },
    sanitizeRuntimeInteger(value, fallback, min, max) {
      const numeric = Number.parseInt(value, 10);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(min, Math.min(max, numeric));
    },
    sanitizeUserProfile: (profile) =>
      profile && typeof profile === "object" ? profile : {},
    getTeacherScopeLabel: () => "上官福泽",
    sortAdminClassroomCoursePlans: (plans) =>
      Array.isArray(plans) ? [...plans] : [],
    sanitizeAdminClassroomSeatLayoutsByClassPayload: () => ({}),
    normalizeAdminClassroomSeatLayoutsByClassPayload: () => ({}),
    sanitizeAdminClassroomSeatLayoutPayload: () => ({
      rows: 6,
      columns: 8,
      seats: [],
      studentFillEnabled: true,
      teacherLocked: false,
      updatedAt: "",
    }),
    readAdminAgentConfig: async () => AdminConfig.read(),
    AdminConfig,
    AuthUser,
    ClassroomHomeworkFile: {
      find() {
        return {
          sort() {
            return this;
          },
          lean: async () => [],
        };
      },
    },
    normalizeClassroomHomeworkFileDoc: (doc) => doc,
    FinalTestSession,
  };
}

test("classroom task settings expose final test variant and duration by class", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const route = app.routes.find(
    (item) => item.method === "get" && item.path === "/api/classroom/tasks/settings",
  );
  assert.ok(route, "expected classroom task settings route");

  const handler = route.handlers[route.handlers.length - 1];
  const res = createResponseDouble();
  await handler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.experimentTask.enabled, true);
  assert.equal(res.payload.experimentTask.variant, "three-stage-guided");
  assert.equal(res.payload.experimentTask.durationMinutes, 15);
  assert.equal(res.payload.finalTestConfig.taskTitle, "任务 1：改进普通书包");
  assert.match(res.payload.finalTestConfig.taskDescription, /普通书包/);
  assert.equal(res.payload.finalTestConfig.tasks.length, 2);
});

test("admin user sees final test in untimed demo mode", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const route = app.routes.find(
    (item) => item.method === "get" && item.path === "/api/classroom/tasks/settings",
  );
  assert.ok(route, "expected classroom task settings route");

  const handler = route.handlers[route.handlers.length - 1];
  const res = createResponseDouble();
  await handler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "admin-1",
        username: "上官福泽",
        role: "admin",
        profile: {},
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.experimentTask.enabled, true);
  assert.equal(res.payload.experimentTask.variant, "three-stage-guided");
  assert.equal(res.payload.experimentTask.demoMode, true);
  assert.equal(res.payload.experimentTask.timingEnabled, false);
  assert.equal(res.payload.experimentTask.durationMinutes, 0);
});

test("admin final test config routes persist the teacher-authored test content", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const getRoute = app.routes.find(
    (item) => item.method === "get" && item.path === "/api/auth/admin/final-test-config",
  );
  const putRoute = app.routes.find(
    (item) => item.method === "put" && item.path === "/api/auth/admin/final-test-config",
  );
  assert.ok(getRoute, "expected admin final test config get route");
  assert.ok(putRoute, "expected admin final test config put route");

  const getHandler = getRoute.handlers[getRoute.handlers.length - 1];
  const putHandler = putRoute.handlers[putRoute.handlers.length - 1];

  const initialRes = createResponseDouble();
  await getHandler({}, initialRes);
  assert.equal(initialRes.statusCode, 200);
  assert.equal(initialRes.payload.finalTestConfig.taskTitle, "任务 1：改进普通书包");

  const saveRes = createResponseDouble();
  await putHandler(
    {
      body: {
        finalTestConfig: {
          introText: "本次期末测试先完成平台内改进任务，再完成线下创新任务。",
          tasks: [
            {
              id: "task-1",
              title: "任务 1：改进教室储物柜",
              description: "请围绕教室储物柜提出改进方案，写清楚问题、改进办法和使用流程。",
              mode: "platform",
            },
            {
              id: "task-2",
              title: "任务 2：线下创新",
              description: "任务 2 线下完成，可以结合画图表达。",
              mode: "offline",
            },
          ],
        },
      },
    },
    saveRes,
  );
  assert.equal(saveRes.statusCode, 200);
  assert.equal(saveRes.payload.finalTestConfig.taskTitle, "任务 1：改进教室储物柜");
  assert.match(saveRes.payload.finalTestConfig.task2OfflineText, /线下完成/);
  assert.equal(saveRes.payload.finalTestConfig.tasks.length, 2);

  const afterSaveRes = createResponseDouble();
  await getHandler({}, afterSaveRes);
  assert.equal(afterSaveRes.statusCode, 200);
  assert.equal(afterSaveRes.payload.finalTestConfig.taskTitle, "任务 1：改进教室储物柜");
  assert.match(afterSaveRes.payload.finalTestConfig.taskDescription, /储物柜/);
  assert.equal(afterSaveRes.payload.finalTestConfig.tasks[1].mode, "offline");
});

test("admin final test submissions route exposes submitted and pending session states", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  await deps.FinalTestSession.findOneAndUpdate(
    {
      key: "admin-config",
      teacherScopeKey: "shangguan-fuze",
      studentUserId: "student-810",
      className: "810班",
    },
    {
      $set: {
        key: "admin-config",
        teacherScopeKey: "shangguan-fuze",
        studentUserId: "student-810",
        className: "810班",
        variant: "three-stage-guided",
        status: "submitted",
        startedAt: "2026-05-31T09:40:00.000Z",
        submittedAt: "2026-05-31T09:58:00.000Z",
        durationMinutes: 15,
        payload: {
          stage1: { ideas: [], lockedAt: "", submittedAt: "", pasteBlockedCount: 0 },
          stage2: { messages: [], promptCardClicks: [], promptCardCopies: [], transfers: [], riskEvents: [], submittedAt: "" },
          stage3: { draft: {}, pasteEvents: [], riskEvents: [], submittedAt: "" },
          turnbackEvents: [],
          riskLog: [],
        },
      },
    },
    { lean: true },
  );

  await deps.FinalTestSession.findOneAndUpdate(
    {
      key: "admin-config",
      teacherScopeKey: "shangguan-fuze",
      studentUserId: "student-811",
      className: "811班",
    },
    {
      $set: {
        key: "admin-config",
        teacherScopeKey: "shangguan-fuze",
        studentUserId: "student-811",
        className: "811班",
        variant: "two-stage-free",
        status: "stage2_active",
        startedAt: "2026-05-31T09:45:00.000Z",
        durationMinutes: 15,
        payload: {
          stage1: { ideas: [], lockedAt: "", submittedAt: "", pasteBlockedCount: 0 },
          stage2: { messages: [], promptCardClicks: [], promptCardCopies: [], transfers: [], riskEvents: [], submittedAt: "" },
          stage3: { draft: {}, pasteEvents: [], riskEvents: [], submittedAt: "" },
          turnbackEvents: [],
          riskLog: [],
        },
      },
    },
    { lean: true },
  );

  const route = app.routes.find(
    (item) => item.method === "get" && item.path === "/api/auth/admin/final-test-submissions",
  );
  assert.ok(route, "expected admin final test submissions route");

  const handler = route.handlers[route.handlers.length - 1];
  const res = createResponseDouble();
  await handler({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload.sessions), true);
  assert.equal(res.payload.sessions.length, 2);
  assert.equal(res.payload.sessions[0].studentUserId, "student-810");
  assert.equal(res.payload.sessions[0].status, "submitted");
  assert.equal(res.payload.sessions[1].studentUserId, "student-811");
  assert.equal(res.payload.sessions[1].status, "stage2_active");
  assert.equal(Array.isArray(res.payload.classes), true);
  assert.equal(res.payload.classes.length, 2);
  assert.deepEqual(
    res.payload.classes.map((item) => ({
      className: item.className,
      studentTotal: item.studentTotal,
      submittedCount: item.submittedCount,
      pendingCount: item.pendingCount,
    })),
    [
      {
        className: "810班",
        studentTotal: 2,
        submittedCount: 1,
        pendingCount: 1,
      },
      {
        className: "811班",
        studentTotal: 1,
        submittedCount: 0,
        pendingCount: 1,
      },
    ],
  );
  assert.deepEqual(
    res.payload.classes[0].students.map((item) => ({
      studentUserId: item.studentUserId,
      studentName: item.studentName,
      submitted: item.submitted,
      status: item.status,
    })),
    [
      {
        studentUserId: "student-810",
        studentName: "张三",
        submitted: true,
        status: "submitted",
      },
      {
        studentUserId: "student-810-2",
        studentName: "李四",
        submitted: false,
        status: "",
      },
    ],
  );
});

test("starting a final test session creates a 15-minute timed session", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const route = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/start",
  );
  assert.ok(route, "expected final test start route");

  const handler = route.handlers[route.handlers.length - 1];
  const res = createResponseDouble();
  await handler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.session.variant, "three-stage-guided");
  assert.equal(res.payload.session.status, "stage1_draft");
  assert.equal(res.payload.session.durationMinutes, 15);
  assert.ok(res.payload.session.startedAt);
  assert.ok(res.payload.session.deadlineAt);
});

test("admin demo mode starts the full final test flow without a timer", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const route = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/start",
  );
  assert.ok(route, "expected final test start route");

  const handler = route.handlers[route.handlers.length - 1];
  const res = createResponseDouble();
  await handler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "admin-1",
        username: "上官福泽",
        role: "admin",
        profile: {},
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.experimentTask.demoMode, true);
  assert.equal(res.payload.experimentTask.timingEnabled, false);
  assert.equal(res.payload.session.variant, "three-stage-guided");
  assert.equal(res.payload.session.status, "stage1_draft");
  assert.equal(res.payload.session.durationMinutes, 0);
  assert.equal(res.payload.session.deadlineAt, "");
});

test("turnback with the expected passphrase opens a new editable stage version", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const startRoute = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/start",
  );
  const turnbackRoute = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/turnback",
  );
  assert.ok(startRoute, "expected final test start route");
  assert.ok(turnbackRoute, "expected final test turnback route");

  const startHandler = startRoute.handlers[startRoute.handlers.length - 1];
  const turnbackHandler = turnbackRoute.handlers[turnbackRoute.handlers.length - 1];

  await startHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
    },
    createResponseDouble(),
  );

  const res = createResponseDouble();
  await turnbackHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
      body: {
        fromStage: "stage3",
        toStage: "stage2",
        passphrase: "test-turnback-passphrase",
        reason: "误点提交",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.session.status, "stage2_active");
  assert.equal(res.payload.session.turnbackEvents.length, 1);
  assert.equal(res.payload.session.turnbackEvents[0].reason, "误点提交");
});

test("restart with the expected passphrase resets the session and records the event", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const startRoute = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/start",
  );
  const restartRoute = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/restart",
  );
  assert.ok(startRoute, "expected final test start route");
  assert.ok(restartRoute, "expected final test restart route");

  const startHandler = startRoute.handlers[startRoute.handlers.length - 1];
  const restartHandler = restartRoute.handlers[restartRoute.handlers.length - 1];

  await startHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
    },
    createResponseDouble(),
  );

  await deps.FinalTestSession.findOneAndUpdate(
    {
      key: "admin-config",
      teacherScopeKey: "shangguan-fuze",
      studentUserId: "student-810",
      className: "810班",
    },
    {
      $set: {
        status: "stage3_active",
        payload: {
          stage1: {
            ideas: [{ id: "idea-1", text: "旧内容" }],
            lockedAt: "",
            submittedAt: "",
            pasteBlockedCount: 0,
          },
          stage2: {
            messages: [{ id: "msg-1", role: "assistant", content: "旧 AI 回复" }],
            promptCardClicks: [],
            promptCardCopies: [],
            transfers: [],
            riskEvents: [],
            draftText: "旧草稿",
            submittedAt: "",
          },
          stage3: {
            draft: {},
            finalText: "旧定稿",
            pasteEvents: [],
            riskEvents: [],
            submittedAt: "",
          },
          turnbackEvents: [],
          riskLog: [{ type: "tab_hidden" }],
        },
      },
    },
    { lean: true },
  );

  const res = createResponseDouble();
  await restartHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
      body: {
        passphrase: "test-restart-passphrase",
        reason: "误操作，需要重新作答",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.session.status, "stage1_draft");
  assert.deepEqual(res.payload.session.stage1.ideas, []);
  assert.equal(res.payload.session.stage2.draftText, "");
  assert.equal(res.payload.session.stage3.finalText, "");
  assert.equal(res.payload.session.turnbackEvents.length, 1);
  assert.equal(res.payload.session.turnbackEvents[0].kind, "restart");
  assert.equal(res.payload.session.turnbackEvents[0].reason, "误操作，需要重新作答");
  assert.equal(res.payload.session.turnbackEvents[0].previousSession.stage3.finalText, "旧定稿");
  assert.equal(res.payload.session.turnbackEvents[0].previousSession.stage2.draftText, "旧草稿");
  assert.equal(res.payload.session.turnbackEvents[0].previousSession.stage1.ideas[0].text, "旧内容");
});

test("debug-mode final test requests bypass automatic timeout locking", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const startRoute = app.routes.find(
    (item) =>
      item.method === "post" &&
      item.path === "/api/classroom/final-test/session/start",
  );
  const getRoute = app.routes.find(
    (item) =>
      item.method === "get" &&
      item.path === "/api/classroom/final-test/session",
  );
  assert.ok(startRoute, "expected final test start route");
  assert.ok(getRoute, "expected final test session route");

  const startHandler = startRoute.handlers[startRoute.handlers.length - 1];
  const getHandler = getRoute.handlers[getRoute.handlers.length - 1];

  await startHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
    },
    createResponseDouble(),
  );

  await deps.FinalTestSession.findOneAndUpdate(
    {
      key: "admin-config",
      teacherScopeKey: "shangguan-fuze",
      studentUserId: "student-810",
      className: "810班",
    },
    {
      $set: {
        status: "stage1_draft",
        deadlineAt: "2026-05-31T10:00:00.000Z",
        payload: {
          stage1: { ideas: [], lockedAt: "", submittedAt: "", pasteBlockedCount: 0 },
          stage2: { messages: [], promptCardClicks: [], promptCardCopies: [], transfers: [], riskEvents: [], submittedAt: "" },
          stage3: { draft: {}, pasteEvents: [], riskEvents: [], submittedAt: "" },
          turnbackEvents: [],
          riskLog: [],
        },
      },
    },
    { lean: true },
  );

  const res = createResponseDouble();
  await getHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
      query: {
        finalTestDebug: "1",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.session.status, "stage1_draft");
  assert.equal(res.payload.session.timeExpired, false);
});

test("timed student sessions are locked automatically after the deadline", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  const getRoute = app.routes.find(
    (item) =>
      item.method === "get" &&
      item.path === "/api/classroom/final-test/session",
  );
  assert.ok(getRoute, "expected final test session route");

  await deps.FinalTestSession.findOneAndUpdate(
    {
      key: "admin-config",
      teacherScopeKey: "shangguan-fuze",
      studentUserId: "student-810",
      className: "810班",
    },
    {
      $set: {
        key: "admin-config",
        teacherScopeKey: "shangguan-fuze",
        studentUserId: "student-810",
        className: "810班",
        variant: "three-stage-guided",
        status: "stage3_active",
        startedAt: "2026-05-31T09:40:00.000Z",
        deadlineAt: "2026-05-31T10:00:00.000Z",
        durationMinutes: 15,
        payload: {
          stage1: { ideas: [], lockedAt: "", submittedAt: "", pasteBlockedCount: 0 },
          stage2: { messages: [], promptCardClicks: [], promptCardCopies: [], transfers: [], riskEvents: [], submittedAt: "" },
          stage3: { draft: {}, pasteEvents: [], riskEvents: [], submittedAt: "" },
          turnbackEvents: [],
          riskLog: [],
        },
      },
    },
    { lean: true },
  );

  const originalDateNow = Date.now;
  Date.now = () => Date.parse("2026-05-31T10:00:05.000Z");
  try {
    const handler = getRoute.handlers[getRoute.handlers.length - 1];
    const res = createResponseDouble();
    await handler(
      {
        authTeacherScopeKey: "shangguan-fuze",
        authUser: {
          _id: "student-810",
          username: "student-810",
          role: "user",
          profile: { className: "810班" },
        },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.session.status, "time_expired_locked");
    assert.equal(res.payload.session.timeExpired, true);
    assert.ok(res.payload.session.lockedAt);
  } finally {
    Date.now = originalDateNow;
  }
});

test("student final test session update persists post-submit task 2 traces", async () => {
  const app = createAppDouble();
  const deps = createFinalTestDeps();
  registerAuthUserClassroomRoutes(app, deps);

  await deps.FinalTestSession.findOneAndUpdate(
    {
      key: "admin-config",
      teacherScopeKey: "shangguan-fuze",
      studentUserId: "student-810",
      className: "810班",
    },
    {
      $set: {
        key: "admin-config",
        teacherScopeKey: "shangguan-fuze",
        studentUserId: "student-810",
        className: "810班",
        variant: "three-stage-guided",
        status: "submitted",
        startedAt: "2026-05-31T09:40:00.000Z",
        submittedAt: "2026-05-31T09:58:00.000Z",
        durationMinutes: 15,
        payload: {
          stage1: { ideas: [], lockedAt: "", submittedAt: "", pasteBlockedCount: 0 },
          stage2: { messages: [], promptCardClicks: [], promptCardCopies: [], transfers: [], riskEvents: [], submittedAt: "" },
          stage3: { draft: {}, pasteEvents: [], riskEvents: [], submittedAt: "" },
          turnbackEvents: [],
          riskLog: [],
        },
      },
    },
    { lean: true },
  );

  const updateRoute = app.routes.find(
    (item) =>
      item.method === "put" &&
      item.path === "/api/classroom/final-test/session",
  );
  assert.ok(updateRoute, "expected final test update route");

  const updateHandler = updateRoute.handlers[updateRoute.handlers.length - 1];
  const updateRes = createResponseDouble();
  await updateHandler(
    {
      authTeacherScopeKey: "shangguan-fuze",
      authUser: {
        _id: "student-810",
        profile: { className: "810班" },
      },
      body: {
        status: "submitted",
        postSubmit: {
          task1SurveyCompletedAt: "2026-05-31T10:01:00.000Z",
          task2PageEnteredAt: "2026-05-31T10:01:00.000Z",
          task2ConfirmedAt: "2026-05-31T10:10:00.000Z",
          task2SurveyEnteredAt: "2026-05-31T10:10:00.000Z",
          events: [
            {
              eventId: "post-submit-task1-survey-completed",
              type: "task1_survey_completed",
              createdAt: "2026-05-31T10:01:00.000Z",
            },
            {
              eventId: "post-submit-task2-confirmed",
              type: "task2_confirmed",
              createdAt: "2026-05-31T10:10:00.000Z",
            },
          ],
        },
      },
    },
    updateRes,
  );

  assert.equal(updateRes.statusCode, 200);
  assert.equal(
    updateRes.payload.session.postSubmit.task1SurveyCompletedAt,
    "2026-05-31T10:01:00.000Z",
  );
  assert.equal(
    updateRes.payload.session.postSubmit.task2ConfirmedAt,
    "2026-05-31T10:10:00.000Z",
  );
  assert.equal(updateRes.payload.session.postSubmit.events.length, 2);
});

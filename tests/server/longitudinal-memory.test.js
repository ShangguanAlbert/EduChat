import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNightlyLongitudinalMemoryCandidates,
  buildPairSubjectId,
  consolidateEligibleLongitudinalMemories,
  detectHtmlCssKnowledgePoints,
  readLongitudinalMemoryBriefing,
  resolveLongitudinalCourseContext,
  resolveMostRecentNightlyBoundaryAt,
} from "../../server/modules/party-coding/longitudinal-memory.js";

test("nightly longitudinal memory uses the latest Shanghai 23:30 boundary", () => {
  assert.equal(
    resolveMostRecentNightlyBoundaryAt("2026-08-15T15:40:00.000Z").toISOString(),
    "2026-08-15T15:30:00.000Z",
  );
  assert.equal(
    resolveMostRecentNightlyBoundaryAt("2026-08-15T10:00:00.000Z").toISOString(),
    "2026-08-14T15:30:00.000Z",
  );
});

test("HTML and CSS evidence maps onto the configured course knowledge graph", () => {
  const points = detectHtmlCssKnowledgePoints({
    html: "<main><nav><a href='/'>首页</a></nav></main>",
    css: ".nav { display: flex; justify-content: space-between; } @media (max-width: 600px) {}",
  });
  assert.ok(points.includes("html_semantics"));
  assert.ok(points.includes("html_links_media"));
  assert.ok(points.includes("css_flexbox"));
  assert.ok(points.includes("css_responsive_design"));
});

test("course context remains stable across rooms in one class and term", () => {
  const context = resolveLongitudinalCourseContext({
    room: {
      _id: "room-1",
      teacherScopeKey: "shi-gaojun",
      memberUserIds: ["student-2", "student-1"],
      announcement: "个人作品集网站",
    },
    users: [
      { _id: "student-1", profile: { className: "810班" } },
      { _id: "student-2", profile: { className: "810班" } },
    ],
    workspace: { roomId: "room-1", taskRevision: 3 },
    courseConfig: {
      courseId: "web-course",
      courseName: "网页创作",
      termName: "2026秋",
      syllabusText: "小作品逐步连接到综合作品。",
    },
    boundaryAt: new Date("2026-10-10T15:30:00.000Z"),
  });
  assert.equal(context.courseId, "shi-gaojun:810班:2026秋:web-course");
  assert.equal(context.projectId, "room-1:3");
  assert.equal(context.projectKind, "major");
  assert.equal(context.syllabusText, "小作品逐步连接到综合作品。");
  assert.equal(context.pairId, buildPairSubjectId(["student-1", "student-2"]));
  assert.equal(
    buildPairSubjectId(["student-1", "student-2"]),
    buildPairSubjectId(["student-2", "student-1"]),
  );
});

test("nightly compiler emits course project pair student and agent evidence without mastery labels", () => {
  const boundaryAt = new Date("2026-08-15T15:30:00.000Z");
  const context = resolveLongitudinalCourseContext({
    room: {
      _id: "room-1",
      teacherScopeKey: "shi-gaojun",
      memberUserIds: ["student-1", "student-2"],
      announcement: "导航栏小作品",
    },
    users: [
      { _id: "student-1", profile: { className: "810班" } },
      { _id: "student-2", profile: { className: "810班" } },
    ],
    workspace: { roomId: "room-1", taskRevision: 2 },
    courseConfig: { courseId: "html-css", termName: "2026秋" },
    boundaryAt,
  });
  const workspace = {
    roomId: "room-1",
    taskRevision: 2,
    revision: 8,
    taskStage: "debug",
    html: "<nav><a href='#'>主页</a></nav>",
    css: "nav { display: flex; justify-content: space-between; }",
    lastDiagnostics: [],
    updatedAt: new Date("2026-08-15T14:00:00.000Z"),
    versions: [{
      revision: 8,
      html: "<nav><a href='#'>主页</a></nav>",
      css: "nav { display: flex; justify-content: space-between; }",
      savedByUserId: "student-1",
      createdAt: new Date("2026-08-15T14:00:00.000Z"),
    }],
  };
  const events = [
    {
      _id: "event-1",
      userId: "student-1",
      role: "driver",
      eventType: "code_edit",
      occurredAt: new Date("2026-08-15T13:00:00.000Z"),
      metadata: {},
    },
    {
      _id: "event-2",
      userId: "student-2",
      role: "navigator",
      eventType: "chat_message",
      occurredAt: new Date("2026-08-15T13:01:00.000Z"),
      metadata: { content: "因为主轴是横向，所以应该用 justify-content。" },
    },
    {
      _id: "event-3",
      userId: "",
      role: "paia",
      eventType: "paia_intervention",
      occurredAt: new Date("2026-08-15T13:02:00.000Z"),
      metadata: {},
    },
    {
      _id: "event-4",
      userId: "student-2",
      role: "navigator",
      eventType: "paia_feedback",
      occurredAt: new Date("2026-08-15T13:03:00.000Z"),
      metadata: { feedback: "correct" },
    },
  ];
  const candidates = buildNightlyLongitudinalMemoryCandidates({
    context,
    events,
    workspace,
    boundaryAt,
  });
  const subjectTypes = new Set(candidates.map((candidate) => candidate.subjectType));
  assert.deepEqual(subjectTypes, new Set(["course", "project", "pair", "student", "agent"]));
  const flexEvidence = candidates.find(
    (candidate) => candidate.memoryType === "knowledge_evidence"
      && candidate.subjectId === "student-2"
      && candidate.conceptKey === "css_flexbox",
  );
  assert.ok(flexEvidence);
  assert.match(flexEvidence.summary, /尚不据此判定已经掌握/);
  const activity = candidates.find(
    (candidate) => candidate.memoryType === "learning_activity"
      && candidate.subjectId === "student-1",
  );
  assert.match(activity.summary, /不直接代表知识掌握程度/);
});

test("nightly compiler creates reviewable ability judgments from repeated direct evidence", () => {
  const boundaryAt = new Date("2026-08-15T15:30:00.000Z");
  const context = resolveLongitudinalCourseContext({
    room: {
      _id: "room-1",
      teacherScopeKey: "shi-gaojun",
      memberUserIds: ["student-1", "student-2"],
      announcement: "调试导航栏布局",
    },
    users: [
      { _id: "student-1", profile: { className: "810班" } },
      { _id: "student-2", profile: { className: "810班" } },
    ],
    workspace: { roomId: "room-1", taskRevision: 3 },
    courseConfig: { courseId: "html-css", termName: "2026秋" },
    boundaryAt,
  });
  const events = Array.from({ length: 10 }, (_, index) => ({
    _id: `edit-${index}`,
    userId: "student-1",
    role: "driver",
    eventType: "code_edit",
    occurredAt: new Date(`2026-08-15T13:${String(index).padStart(2, "0")}:00.000Z`),
    metadata: {},
  })).concat([
    {
      _id: "preview-1",
      userId: "student-1",
      role: "driver",
      eventType: "preview",
      occurredAt: new Date("2026-08-15T13:12:00.000Z"),
      metadata: {},
    },
    {
      _id: "diagnostic-1",
      userId: "student-1",
      role: "driver",
      eventType: "diagnostic_error",
      occurredAt: new Date("2026-08-15T13:13:00.000Z"),
      metadata: { diagnostics: ["CSS 大括号未闭合"] },
    },
    {
      _id: "preview-2",
      userId: "student-1",
      role: "driver",
      eventType: "preview",
      occurredAt: new Date("2026-08-15T13:14:00.000Z"),
      metadata: {},
    },
    {
      _id: "diagnostic-2",
      userId: "student-1",
      role: "driver",
      eventType: "diagnostic_error",
      occurredAt: new Date("2026-08-15T13:15:00.000Z"),
      metadata: { diagnostics: ["CSS 大括号仍未闭合"] },
    },
  ]);
  const candidates = buildNightlyLongitudinalMemoryCandidates({
    context,
    events,
    workspace: {
      roomId: "room-1",
      taskRevision: 3,
      revision: 10,
      taskStage: "debug",
      html: "<nav>导航</nav>",
      css: "nav { display: flex;",
      updatedAt: new Date("2026-08-15T14:00:00.000Z"),
    },
    boundaryAt,
  });
  const pairJudgment = candidates.find(
    (candidate) => candidate.memoryType === "ability_judgment"
      && candidate.subjectType === "pair",
  );
  const studentJudgment = candidates.find(
    (candidate) => candidate.memoryType === "ability_judgment"
      && candidate.subjectId === "student-1"
      && candidate.conceptKey === "web_debugging_preview",
  );
  assert.match(pairJudgment.summary, /协作参与均衡较弱/);
  assert.equal(pairJudgment.payload.level, "needs_support");
  assert.match(studentJudgment.summary, /网页调试能力需要支持/);
  assert.equal(studentJudgment.payload.diagnosticCount, 2);
});

test("retrieval prioritizes current project then pair and student evidence", async () => {
  const docs = [
    { _id: "course-1", subjectType: "course", summary: "课程进展摘要", lastBoundaryAt: new Date("2026-08-15") },
    { _id: "student-1", subjectType: "student", summary: "学生学习证据", lastBoundaryAt: new Date("2026-08-15") },
    { _id: "pair-1", subjectType: "pair", summary: "搭档协作经历", lastBoundaryAt: new Date("2026-08-15") },
    { _id: "project-1", subjectType: "project", summary: "作品最新状态", lastBoundaryAt: new Date("2026-08-15") },
  ];
  let capturedFilter = null;
  const Memory = {
    find(filter) {
      capturedFilter = filter;
      return {
        sort() { return this; },
        limit() { return this; },
        async lean() { return docs; },
      };
    },
  };
  const result = await readLongitudinalMemoryBriefing({
    Memory,
    context: {
      roomId: "room-1",
      courseId: "course-1",
      projectId: "project-1",
      pairId: "pair-1",
      memberUserIds: ["student-1", "student-2"],
    },
    now: new Date("2026-08-16"),
  });
  assert.equal(result.memoryIds[0], "project-1");
  assert.equal(result.memoryIds[1], "pair-1");
  assert.match(result.text.split("\n")[0], /^作品连续性：/);
  assert.equal(capturedFilter.courseId, "course-1");
  assert.deepEqual(capturedFilter.validationStatus, { $ne: "human_rejected" });
  assert.deepEqual(capturedFilter.retrievalEnabled, { $ne: false });
  assert.ok(Array.isArray(capturedFilter.$and));
  assert.ok(capturedFilter.$and[0].$or.some(
    (filter) => filter.subjectType === "project" && filter.roomId === "room-1",
  ));
  assert.ok(capturedFilter.$and[1].$or.some(
    (filter) => filter.allowedUseTypes === "student_reply",
  ));
});

test("nightly consolidation preserves a teacher edited judgment summary", async () => {
  let candidateClaimed = false;
  let capturedMemoryUpdate = null;
  const Candidate = {
    async updateMany() {},
    findOneAndUpdate() {
      return {
        async lean() {
          if (candidateClaimed) return null;
          candidateClaimed = true;
          return {
            _id: "candidate-1",
            roomId: "room-1",
            courseId: "course-1",
            projectId: "room-1:3",
            subjectType: "student",
            subjectId: "student-1",
            memoryType: "ability_judgment",
            conceptKey: "web_debugging_preview",
            summary: "系统形成的新判断。",
            payload: { level: "needs_support" },
            confidence: 0.8,
            boundaryAt: new Date("2026-08-15T15:30:00.000Z"),
          };
        },
      };
    },
    async updateOne() {},
  };
  const Memory = {
    findOne() {
      return {
        async lean() {
          return {
            _id: "memory-1",
            roomId: "room-1",
            projectId: "room-1:2",
            summary: "教师确认：该学生目前调试能力较弱。",
            teacherEditedAt: new Date("2026-08-14T10:00:00.000Z"),
            evidenceCount: 1,
            sourceCandidateIds: [],
          };
        },
      };
    },
    findOneAndUpdate(_filter, update) {
      capturedMemoryUpdate = update;
      return { async lean() { return {}; } };
    },
  };
  await consolidateEligibleLongitudinalMemories({
    Candidate,
    Memory,
    now: new Date("2026-08-16T15:30:00.000Z"),
  });
  assert.equal(Object.hasOwn(capturedMemoryUpdate.$set, "summary"), false);
  assert.equal(capturedMemoryUpdate.$inc.evidenceCount, 1);
  assert.match(
    capturedMemoryUpdate.$push.history.$each[0].summary,
    /系统形成的新判断/,
  );
});

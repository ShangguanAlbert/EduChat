import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const modeSelectionPagePath = path.resolve("src/pages/ModeSelectionPage.jsx");
const finalTestCssPath = path.resolve("src/styles/final-test.css");
const teacherHomePagePath = path.resolve("src/pages/TeacherHomePage.jsx");
const studentFinalTestPanelPath = path.resolve(
  "src/features/classroom/components/StudentFinalTestPanel.jsx",
);

const modeSelectionPageSource = fs.readFileSync(modeSelectionPagePath, "utf8");
const finalTestCssSource = fs.readFileSync(finalTestCssPath, "utf8");
const teacherHomePageSource = fs.readFileSync(teacherHomePagePath, "utf8");
const studentFinalTestPanelSource = fs.readFileSync(
  studentFinalTestPanelPath,
  "utf8",
);

test("student mode selection exposes the final test entry and panel", () => {
  assert.match(modeSelectionPageSource, /label:\s*"期末测试"/);
  assert.match(modeSelectionPageSource, /key:\s*"final-test"/);
  assert.match(modeSelectionPageSource, /StudentFinalTestPanel/);
});

test("final test stylesheet keeps the UI square", () => {
  assert.match(finalTestCssSource, /border-radius:\s*0\s*!important;/);
});

test("teacher home keeps the final test editor while hiding its sidebar entry", () => {
  assert.doesNotMatch(
    teacherHomePageSource,
    /\{\s*key:\s*"final-test",\s*label:\s*"期末测试"/,
  );
  assert.match(teacherHomePageSource, /activePanel\s*===\s*"final-test"/);
  assert.match(teacherHomePageSource, /saveAdminFinalTestConfig/);
  assert.match(teacherHomePageSource, /添加任务/);
});

test("student final test panel reads teacher-authored final test content", () => {
  assert.match(studentFinalTestPanelSource, /taskSettings\?\.finalTestConfig/);
});

test("final test turnback dialog renders inline error feedback", () => {
  assert.match(studentFinalTestPanelSource, /dialog\.errorMessage/);
  assert.match(studentFinalTestPanelSource, /final-test-dialog-error/);
  assert.match(finalTestCssSource, /\.final-test-dialog-error\s*\{/);
});

test("student final test panel includes exam honesty confirmation and demo mode copy", () => {
  assert.match(studentFinalTestPanelSource, /会记录所有时间和操作/);
  assert.match(studentFinalTestPanelSource, /诚信测试/);
  assert.match(studentFinalTestPanelSource, /演示模式/);
});

test("student final test title stays generic without class names", () => {
  assert.match(studentFinalTestPanelSource, /const finalTestTitle = "期末测试";/);
  assert.doesNotMatch(studentFinalTestPanelSource, /810 班级期末测试/);
  assert.doesNotMatch(studentFinalTestPanelSource, /811 班级期末测试/);
});

test("stage1 submission seeds stage2 draft with the independent-thinking content", () => {
  const confirmStage1SubmitBlock = studentFinalTestPanelSource.match(
    /async function confirmStage1Submit\(\)\s*\{[\s\S]*?\n\s{2}\}\n\n\s{2}async function confirmEnterStage3/,
  )?.[0];
  assert.ok(confirmStage1SubmitBlock, "expected confirmStage1Submit implementation block");
  assert.match(
    confirmStage1SubmitBlock,
    /status:\s*"stage2_active"[\s\S]*stage1:\s*\{[\s\S]*draftText[\s\S]*stage2:\s*\{[\s\S]*draftText,/,
  );
});

test("submitted final test flow shows task 1 survey, offline task 2, and task 2 survey", () => {
  assert.match(studentFinalTestPanelSource, /TASK1_SURVEY_URL\s*=\s*"https:\/\/wj\.qq\.com\/s2\/26868195\/6777\/"/);
  assert.match(studentFinalTestPanelSource, /TASK2_SURVEY_URL\s*=\s*"https:\/\/wj\.qq\.com\/s2\/26868239\/d762\/"/);
  assert.match(studentFinalTestPanelSource, /postSubmitStep\s*===\s*"task1-survey"/);
  assert.match(studentFinalTestPanelSource, /postSubmitStep\s*===\s*"task2-offline"/);
  assert.match(studentFinalTestPanelSource, /postSubmitStep\s*===\s*"task2-survey"/);
  assert.match(studentFinalTestPanelSource, /我已完成任务 1 问卷，进入任务 2/);
  assert.match(studentFinalTestPanelSource, /确认已完成线下任务 2，进入任务 2 问卷/);
  assert.match(studentFinalTestPanelSource, /recordPostSubmitStep/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASSROOM_FILE_KIND_HOMEWORK,
  CLASSROOM_FILE_KIND_LESSON,
  CLASSROOM_FILE_KIND_TASK,
  getClassroomFileDownloadErrorText,
  getClassroomFileFallbackName,
  getClassroomFileLabel,
} from "../../shared/classroomFileLabels.js";

test("classroom file label helpers return stable labels by kind", () => {
  assert.equal(getClassroomFileLabel(CLASSROOM_FILE_KIND_LESSON), "课程文件");
  assert.equal(getClassroomFileLabel(CLASSROOM_FILE_KIND_TASK), "任务附件");
  assert.equal(getClassroomFileLabel(CLASSROOM_FILE_KIND_HOMEWORK), "作业文件");
});

test("classroom file label helpers build consistent fallback names and errors", () => {
  assert.equal(getClassroomFileFallbackName(CLASSROOM_FILE_KIND_TASK), "任务附件.bin");
  assert.equal(
    getClassroomFileDownloadErrorText(CLASSROOM_FILE_KIND_TASK),
    "任务附件下载失败，请稍后重试。",
  );
});

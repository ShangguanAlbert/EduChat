import assert from "node:assert/strict";
import test from "node:test";
import {
  TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
  normalizeAdminClassroomLessonFileDoc,
} from "../../server/services/core-runtime.js";

test("normalizeAdminClassroomLessonFileDoc preserves teacher classroom file sizes up to 100MB", () => {
  const doc = normalizeAdminClassroomLessonFileDoc({
    fileId: "lesson-file-1",
    fileName: "任务附件.zip",
    mimeType: "application/zip",
    size: TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
    uploadedAt: "2026-05-05T08:00:00.000Z",
  });

  assert.equal(doc.size, TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES);
});

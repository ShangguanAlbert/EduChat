import assert from "node:assert/strict";
import test from "node:test";
import {
  TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
  repairAdminClassroomCoursePlansFileMetadata,
  sanitizeAdminClassroomCourseFilePayload,
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

test("sanitizeAdminClassroomCourseFilePayload preserves classroom file sizes up to 100MB", () => {
  const file = sanitizeAdminClassroomCourseFilePayload({
    id: "lesson-file-1",
    name: "任务附件.zip",
    mimeType: "application/zip",
    size: 80 * 1024 * 1024,
    uploadedAt: "2026-05-05T08:00:00.000Z",
  });

  assert.equal(file.size, 80 * 1024 * 1024);
});

test("repairAdminClassroomCoursePlansFileMetadata backfills stored file sizes from lesson file docs", () => {
  const repaired = repairAdminClassroomCoursePlansFileMetadata(
    [
      {
        id: "lesson-1",
        courseName: "第七节课",
        files: [],
        tasks: [
          {
            id: "task-1",
            title: "任务 1",
            type: "text",
            content: "请下载附件",
            files: [
              {
                id: "lesson-file-1",
                name: "第七节课.zip",
                mimeType: "application/zip",
                size: 10 * 1024 * 1024 - 1,
                uploadedAt: "2026-05-05T14:14:52.000Z",
              },
            ],
          },
        ],
      },
    ],
    [
      {
        fileId: "lesson-file-1",
        fileName: "第七节课.zip",
        mimeType: "application/zip",
        size: 80 * 1024 * 1024,
        uploadedAt: "2026-05-05T14:14:52.000Z",
      },
    ],
  );

  assert.equal(repaired[0].tasks[0].files[0].size, 80 * 1024 * 1024);
});

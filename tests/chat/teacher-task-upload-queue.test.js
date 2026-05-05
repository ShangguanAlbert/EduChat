import assert from "node:assert/strict";
import test from "node:test";
import {
  TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
  appendTeacherTaskUploadDrafts,
  markTeacherTaskUploadDraftsFailed,
  markTeacherTaskUploadDraftsUploading,
  removeTeacherTaskUploadDraft,
} from "../../src/features/classroom/teacherTaskUploadQueue.js";

test("appendTeacherTaskUploadDrafts appends draft cards for selected files", () => {
  const result = appendTeacherTaskUploadDrafts([], [
    { name: "任务说明.pdf", size: 1024, type: "application/pdf" },
    { name: "样例代码.zip", size: 2048, type: "application/zip" },
  ]);

  assert.equal(result.error, "");
  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts[0].name, "任务说明.pdf");
  assert.equal(result.drafts[0].status, "draft");
  assert.equal(result.drafts[1].name, "样例代码.zip");
  assert.equal(result.drafts[1].status, "draft");
});

test("appendTeacherTaskUploadDrafts rejects files larger than 100MB", () => {
  const existing = [{ localId: "draft-1", name: "现有附件.docx", size: 1, status: "draft" }];
  const result = appendTeacherTaskUploadDrafts(existing, [
    {
      name: "超大视频.mp4",
      size: TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES + 1,
      type: "video/mp4",
    },
  ]);

  assert.equal(result.drafts, existing);
  assert.match(result.error, /单个文件最大 100MB/);
});

test("appendTeacherTaskUploadDrafts enforces the per-upload draft limit", () => {
  const existing = Array.from({ length: 5 }, (_, index) => ({
    localId: `draft-${index + 1}`,
    name: `已选文件-${index + 1}.txt`,
    size: 100,
    status: "draft",
  }));

  const result = appendTeacherTaskUploadDrafts(existing, [
    { name: "新增附件-1.txt", size: 100, type: "text/plain" },
    { name: "新增附件-2.txt", size: 100, type: "text/plain" },
  ]);

  assert.equal(result.drafts, existing);
  assert.match(result.error, /每次最多上传 6 个文件/);
});

test("upload draft helpers update and remove queued cards", () => {
  const drafts = appendTeacherTaskUploadDrafts([], [
    { name: "任务一.pdf", size: 1234, type: "application/pdf" },
    { name: "任务二.pdf", size: 5678, type: "application/pdf" },
  ]).drafts;

  const uploading = markTeacherTaskUploadDraftsUploading(drafts);
  assert.ok(uploading.every((item) => item.status === "uploading"));

  const failed = markTeacherTaskUploadDraftsFailed(uploading, "上传失败，请稍后重试。");
  assert.ok(failed.every((item) => item.status === "failed"));
  assert.ok(failed.every((item) => item.error === "上传失败，请稍后重试。"));

  const next = removeTeacherTaskUploadDraft(failed, failed[0].localId);
  assert.equal(next.length, 1);
  assert.equal(next[0].name, "任务二.pdf");
});

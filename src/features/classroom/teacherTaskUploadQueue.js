export const TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES =
  100 * 1024 * 1024;
export const TEACHER_TASK_UPLOAD_MAX_FILES = 6;

function createDraftId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `teacher-task-upload-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

export function buildTeacherTaskUploadScopeKey(lessonId, taskId) {
  const safeLessonId = String(lessonId || "").trim();
  const safeTaskId = String(taskId || "").trim();
  if (!safeLessonId || !safeTaskId) return "";
  return `${safeLessonId}::${safeTaskId}`;
}

export function appendTeacherTaskUploadDrafts(
  currentDrafts = [],
  sourceFiles = [],
) {
  const drafts = Array.isArray(currentDrafts) ? currentDrafts : [];
  const files = Array.isArray(sourceFiles) ? sourceFiles.filter(Boolean) : [];
  if (files.length === 0) {
    return { drafts, error: "" };
  }

  const oversizedFile = files.find(
    (file) =>
      Number(file?.size || 0) > TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
  );
  if (oversizedFile) {
    return {
      drafts,
      error: "单个文件最大 100MB，请压缩后重试。",
    };
  }

  if (drafts.length + files.length > TEACHER_TASK_UPLOAD_MAX_FILES) {
    return {
      drafts,
      error: `每次最多上传 ${TEACHER_TASK_UPLOAD_MAX_FILES} 个文件，请删除后再上传。`,
    };
  }

  return {
    drafts: [
      ...drafts,
      ...files.map((file) => ({
        localId: createDraftId(),
        file,
        name: String(file?.name || "任务附件").trim() || "任务附件",
        size: Number(file?.size || 0),
        mimeType: String(file?.type || "").trim(),
        status: "draft",
        error: "",
      })),
    ],
    error: "",
  };
}

export function markTeacherTaskUploadDraftsUploading(currentDrafts = []) {
  const drafts = Array.isArray(currentDrafts) ? currentDrafts : [];
  return drafts.map((item) => ({
    ...item,
    status: "uploading",
    error: "",
  }));
}

export function markTeacherTaskUploadDraftsFailed(
  currentDrafts = [],
  errorMessage = "",
) {
  const drafts = Array.isArray(currentDrafts) ? currentDrafts : [];
  const safeError = String(errorMessage || "").trim();
  return drafts.map((item) => ({
    ...item,
    status: "failed",
    error: safeError,
  }));
}

export function removeTeacherTaskUploadDraft(currentDrafts = [], localId = "") {
  const drafts = Array.isArray(currentDrafts) ? currentDrafts : [];
  const safeLocalId = String(localId || "").trim();
  if (!safeLocalId) return drafts;
  return drafts.filter((item) => String(item?.localId || "") !== safeLocalId);
}

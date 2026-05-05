export const CLASSROOM_FILE_KIND_LESSON = "lesson";
export const CLASSROOM_FILE_KIND_TASK = "task";
export const CLASSROOM_FILE_KIND_HOMEWORK = "homework";

export function getClassroomFileLabel(kind = CLASSROOM_FILE_KIND_LESSON) {
  if (kind === CLASSROOM_FILE_KIND_TASK) return "任务附件";
  if (kind === CLASSROOM_FILE_KIND_HOMEWORK) return "作业文件";
  return "课程文件";
}

export function getClassroomFileFallbackName(
  kind = CLASSROOM_FILE_KIND_LESSON,
) {
  return `${getClassroomFileLabel(kind)}.bin`;
}

export function getClassroomFileDownloadErrorText(
  kind = CLASSROOM_FILE_KIND_LESSON,
) {
  return `${getClassroomFileLabel(kind)}下载失败，请稍后重试。`;
}

export function resolveClassroomFileKindByTask(task = null) {
  return task ? CLASSROOM_FILE_KIND_TASK : CLASSROOM_FILE_KIND_LESSON;
}

import crypto from "node:crypto";

export const STUDENT_IMPORT_MAX_ROWS = 500;
export const STUDENT_IMPORT_HEADERS = Object.freeze([
  "姓名",
  "学号",
  "班级",
  "初始密码（选填）",
  "年级（选填）",
  "性别（选填）",
]);

const HEADER_ALIASES = Object.freeze({
  name: ["姓名", "学生姓名", "name"],
  studentId: ["学号", "学生学号", "账号", "studentid", "username"],
  className: ["班级", "班级名称", "classname", "class"],
  password: ["初始密码（选填）", "初始密码", "密码", "password"],
  grade: ["年级（选填）", "年级", "grade"],
  gender: ["性别（选填）", "性别", "gender"],
});

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function readCell(row, aliases) {
  const entries = Object.entries(row && typeof row === "object" ? row : {});
  const aliasKeys = new Set(aliases.map(normalizeHeader));
  const matched = entries.find(([key]) => aliasKeys.has(normalizeHeader(key)));
  return String(matched?.[1] ?? "").trim();
}

export function generateStudentInitialPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function normalizeStudentImportRows(rawRows, options = {}) {
  const allowedClassNames = Array.from(
    new Set(
      (Array.isArray(options.allowedClassNames) ? options.allowedClassNames : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  const allowedClassKeyToName = new Map(
    allowedClassNames.map((name) => [name.replace(/\s+/g, ""), name]),
  );
  const rows = Array.isArray(rawRows) ? rawRows.slice(0, STUDENT_IMPORT_MAX_ROWS) : [];
  const seenStudentIds = new Set();

  return rows.map((rawRow, index) => {
    const rowNumber = index + 2;
    const name = readCell(rawRow, HEADER_ALIASES.name);
    const studentId = readCell(rawRow, HEADER_ALIASES.studentId);
    const inputClassName = readCell(rawRow, HEADER_ALIASES.className);
    const className =
      allowedClassKeyToName.get(inputClassName.replace(/\s+/g, "")) ||
      inputClassName;
    const suppliedPassword = readCell(rawRow, HEADER_ALIASES.password);
    const grade = readCell(rawRow, HEADER_ALIASES.grade);
    const gender = readCell(rawRow, HEADER_ALIASES.gender);
    const errors = [];

    if (!name) {
      errors.push("姓名不能为空");
    } else if (!/^[\u4e00-\u9fa5·]{2,20}$/.test(name)) {
      errors.push("姓名应为 2 至 20 位中文字符");
    }
    if (!/^\d{2,20}$/.test(studentId)) {
      errors.push("学号应为 2 至 20 位数字");
    } else if (seenStudentIds.has(studentId)) {
      errors.push("学号在文件中重复");
    } else {
      seenStudentIds.add(studentId);
    }
    if (!className) {
      errors.push("班级不能为空");
    } else if (
      allowedClassKeyToName.size > 0 &&
      !allowedClassKeyToName.has(className.replace(/\s+/g, ""))
    ) {
      errors.push("班级不在该教师的授权范围内");
    }
    if (suppliedPassword && (suppliedPassword.length < 6 || suppliedPassword.length > 128)) {
      errors.push("初始密码应为 6 至 128 位");
    }

    return {
      rowNumber,
      name,
      studentId,
      username: studentId,
      className,
      password: suppliedPassword || generateStudentInitialPassword(),
      passwordGenerated: !suppliedPassword,
      grade,
      gender,
      errors,
    };
  });
}

export function buildStudentImportTemplateWorkbook(XLSX, options = {}) {
  const allowedClassNames = Array.from(
    new Set(
      (Array.isArray(options.allowedClassNames) ? options.allowedClassNames : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  const teacherName = String(options.teacherName || "").trim();
  const workbook = XLSX.utils.book_new();
  const importSheet = XLSX.utils.aoa_to_sheet([STUDENT_IMPORT_HEADERS]);
  importSheet["!cols"] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, importSheet, "学生账号导入");

  const notes = [
    ["学生账号批量导入说明"],
    ["绑定教师", teacherName || "当前教师"],
    [
      "授权班级",
      allowedClassNames.join("、") || "尚未绑定班级；模板仍可下载，导入前请先在课程下建立班级。",
    ],
    ["填写规则", "姓名、学号、班级为必填；学号将作为登录账号。"],
    ["密码规则", "初始密码可留空，系统会自动生成；导入结果仅显示一次，请及时保存。"],
    ["数据限制", `每次最多导入 ${STUDENT_IMPORT_MAX_ROWS} 名学生；不要修改第一行表头。`],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet["!cols"] = [{ wch: 18 }, { wch: 88 }];
  XLSX.utils.book_append_sheet(workbook, notesSheet, "填写说明");
  return workbook;
}

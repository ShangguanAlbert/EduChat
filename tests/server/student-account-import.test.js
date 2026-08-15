import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  STUDENT_IMPORT_HEADERS,
  buildStudentImportTemplateWorkbook,
  normalizeStudentImportRows,
} from "../../server/modules/auth/student-account-import.js";

test("student import template contains the import sheet and instructions", () => {
  const workbook = buildStudentImportTemplateWorkbook(XLSX, {
    teacherName: "施高俊",
    allowedClassNames: ["810班", "811班"],
  });

  assert.deepEqual(workbook.SheetNames, ["学生账号导入", "填写说明"]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["学生账号导入"], {
    header: 1,
  });
  assert.deepEqual(rows[0], STUDENT_IMPORT_HEADERS);
  const notes = XLSX.utils.sheet_to_json(workbook.Sheets["填写说明"], {
    header: 1,
  });
  assert.match(notes.flat().join("\n"), /810班、811班/);
});

test("student import validates authorized classes and duplicate student ids", () => {
  const rows = normalizeStudentImportRows(
    [
      { 姓名: "张三", 学号: "81001", 班级: "810班", 初始密码: "abc12345" },
      { 姓名: "李四", 学号: "81001", 班级: "810班" },
      { 姓名: "王五", 学号: "81101", 班级: "812班" },
    ],
    { allowedClassNames: ["810班", "811班"] },
  );

  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].password, "abc12345");
  assert.equal(rows[0].passwordGenerated, false);
  assert.match(rows[1].errors.join("；"), /文件中重复/);
  assert.match(rows[2].errors.join("；"), /授权范围/);
});

test("student import generates a one-time initial password when blank", () => {
  const [row] = normalizeStudentImportRows(
    [{ 姓名: "赵六", 学号: "81102", 班级: "811班" }],
    { allowedClassNames: ["811班"] },
  );

  assert.equal(row.errors.length, 0);
  assert.equal(row.passwordGenerated, true);
  assert.ok(row.password.length >= 10);
});

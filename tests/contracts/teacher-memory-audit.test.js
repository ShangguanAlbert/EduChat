import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const teacherHomeSource = fs.readFileSync("src/pages/TeacherHomePage.jsx", "utf8");
const memoryDialogSource = fs.readFileSync(
  "src/features/admin/components/TeacherRoomMemoryDialog.jsx",
  "utf8",
);
const adminRouteSource = fs.readFileSync("server/routes/admin.js", "utf8");

test("teacher pair classroom cards expose the room memory audit dialog", () => {
  assert.match(teacherHomeSource, /记忆档案/);
  assert.match(teacherHomeSource, /TeacherRoomMemoryDialog/);
  assert.match(memoryDialogSource, /查看判断依据/);
  assert.match(memoryDialogSource, /教师确认后的判断/);
  assert.match(memoryDialogSource, /Agent 逐次使用记录/);
});

test("teacher memory audit API includes evidence and use controls", () => {
  assert.match(
    adminRouteSource,
    /collaboration-classrooms\/:roomId\/memories\/:memoryId\/evidence/,
  );
  assert.match(adminRouteSource, /retrievalEnabled/);
  assert.match(adminRouteSource, /allowedUseTypes/);
  assert.match(adminRouteSource, /publicDisclosure/);
});

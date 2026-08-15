import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRegistrationUsername,
  validateStudentRegistrationProfile,
} from "../../server/modules/auth/registration.js";

test("student registration uses the student ID as the login username", () => {
  assert.equal(
    resolveRegistrationUsername({
      registrationRole: "student",
      username: "ignored-name",
      profile: { studentId: " 20260001 " },
    }),
    "20260001",
  );
});

test("teacher registration keeps an explicit login username", () => {
  assert.equal(
    resolveRegistrationUsername({
      registrationRole: "teacher",
      username: " teacher-one ",
      profile: { studentId: "20260001" },
    }),
    "teacher-one",
  );
});

test("student registration only requires identity and class admission fields", () => {
  assert.deepEqual(
    validateStudentRegistrationProfile({
      name: "陈语棋",
      studentId: "20260001",
      className: "810班",
      gender: "",
      grade: "",
    }),
    {},
  );

  assert.deepEqual(
    validateStudentRegistrationProfile({
      name: "Albert",
      studentId: "A-01",
      className: "",
    }),
    {
      name: "姓名仅支持汉字",
      studentId: "学号仅支持 2 至 20 位数字",
      className: "请输入班级",
    },
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  PAIR_CLASSROOM_STUDENT_LIMIT,
  buildPairClassroomMonitoringFields,
  normalizePairClassroomStudentUserIds,
  validatePairClassroomStudentUserIds,
} from "../../server/modules/party-coding/classroom-management.js";

test("pair classroom monitoring fields start and stop one monitoring session", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");
  assert.deepEqual(
    buildPairClassroomMonitoringFields(true, { now, adminId: " admin-1 " }),
    {
      paiaMonitoringEnabled: true,
      paiaMonitoringStartedAt: now,
      paiaMonitoringUpdatedAt: now,
      paiaMonitoringUpdatedByAdminId: "admin-1",
    },
  );
  assert.deepEqual(buildPairClassroomMonitoringFields(false, { now }), {
    paiaMonitoringEnabled: false,
    paiaMonitoringStartedAt: null,
    paiaMonitoringUpdatedAt: now,
    paiaMonitoringUpdatedByAdminId: "",
  });
});

test("pair classroom keeps exactly two distinct student ids", () => {
  const result = validatePairClassroomStudentUserIds(
    ["student-a", "student-b", "student-a"],
    { isValidUserId: (value) => value.startsWith("student-") },
  );

  assert.equal(PAIR_CLASSROOM_STUDENT_LIMIT, 2);
  assert.deepEqual(result, {
    valid: true,
    userIds: ["student-a", "student-b"],
    error: "",
  });
});

test("pair classroom rejects one student or an invalid account id", () => {
  assert.equal(
    validatePairClassroomStudentUserIds(["student-a"]).valid,
    false,
  );
  assert.equal(
    validatePairClassroomStudentUserIds(
      ["student-a", "invalid"],
      { isValidUserId: (value) => value.startsWith("student-") },
    ).valid,
    false,
  );
});

test("pair classroom normalization trims ids and removes duplicates", () => {
  assert.deepEqual(
    normalizePairClassroomStudentUserIds([" a ", "b", "a", ""]),
    ["a", "b"],
  );
});

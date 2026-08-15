import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ADMIN_LOGIN_TARGET,
  resolveAdminLoginTarget,
} from "../../src/pages/login/loginNavigation.js";

test("resolveAdminLoginTarget restores the protected teacher panel after login", () => {
  assert.equal(
    resolveAdminLoginTarget({
      pathname: "/admin/settings",
      search: "?teacherPanel=party-manage",
      hash: "",
    }),
    "/admin/settings?teacherPanel=party-manage",
  );
});

test("resolveAdminLoginTarget preserves an admin route hash", () => {
  assert.equal(
    resolveAdminLoginTarget({
      pathname: "/admin/collaboration-observer/room-1",
      search: "?slot=teacher-a",
      hash: "#timeline",
    }),
    "/admin/collaboration-observer/room-1?slot=teacher-a#timeline",
  );
});

test("resolveAdminLoginTarget rejects non-admin and external targets", () => {
  assert.equal(
    resolveAdminLoginTarget({ pathname: "/party", search: "", hash: "" }),
    DEFAULT_ADMIN_LOGIN_TARGET,
  );
  assert.equal(
    resolveAdminLoginTarget({
      pathname: "//example.com/admin/settings",
      search: "?teacherPanel=party-manage",
      hash: "",
    }),
    DEFAULT_ADMIN_LOGIN_TARGET,
  );
});

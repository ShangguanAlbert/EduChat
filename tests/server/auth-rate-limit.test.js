import assert from "node:assert/strict";
import test from "node:test";
import { createAuthRateLimiter } from "../../server/modules/auth/rate-limit.js";

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("auth limiter rejects attempts beyond the configured address quota", () => {
  const limiter = createAuthRateLimiter({
    windowMs: 60_000,
    maxAttempts: 2,
    errorMessage: "请求过多",
  });
  const req = { ip: "127.0.0.1" };

  let allowedCount = 0;
  limiter(req, createResponse(), () => {
    allowedCount += 1;
  });
  limiter(req, createResponse(), () => {
    allowedCount += 1;
  });
  const blockedResponse = createResponse();
  limiter(req, blockedResponse, () => {
    allowedCount += 1;
  });

  assert.equal(allowedCount, 2);
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.body?.error, "请求过多");
  assert.ok(Number(blockedResponse.headers["Retry-After"]) > 0);
});

test("auth limiter counts different addresses independently", () => {
  const limiter = createAuthRateLimiter({
    windowMs: 60_000,
    maxAttempts: 1,
  });
  let allowedCount = 0;

  limiter({ ip: "10.0.0.1" }, createResponse(), () => {
    allowedCount += 1;
  });
  limiter({ ip: "10.0.0.2" }, createResponse(), () => {
    allowedCount += 1;
  });

  assert.equal(allowedCount, 2);
});

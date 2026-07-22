import test from "node:test";
import assert from "node:assert/strict";

import { buildDevProcessSpecs } from "../../scripts/dev-runtime.mjs";

test("buildDevProcessSpecs includes Python runner and group chat AI worker in the local dev stack", () => {
  assert.deepEqual(buildDevProcessSpecs(), [
    {
      name: "python-runner",
      npmArgs: ["run", "python-runner:dev"],
      waitForApiReady: false,
    },
    {
      name: "server",
      npmArgs: ["run", "server"],
      waitForApiReady: true,
    },
    {
      name: "group-chat-ai-worker",
      npmArgs: ["run", "worker:group-chat-ai"],
      waitForApiReady: false,
    },
    {
      name: "vite",
      npmArgs: ["run", "dev:web"],
      waitForApiReady: false,
    },
  ]);
});

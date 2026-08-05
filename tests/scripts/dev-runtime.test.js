import test from "node:test";
import assert from "node:assert/strict";

import { buildDevProcessSpecs } from "../../scripts/dev-runtime.mjs";

test("buildDevProcessSpecs includes the server, group chat AI worker, and Vite", () => {
  assert.deepEqual(buildDevProcessSpecs(), [
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

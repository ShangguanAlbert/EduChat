import { spawn } from "node:child_process";

const TASKS = [
  {
    name: "chat-state-preservation",
    command: "npm",
    args: ["run", "test:chat-state-preservation"],
  },
  {
    name: "session-notes",
    command: "npm",
    args: ["run", "test:session-notes"],
  },
  {
    name: "session-notes:integration",
    command: "npm",
    args: ["run", "test:session-notes:integration"],
  },
];

function runTask(task) {
  return new Promise((resolve) => {
    console.log(`\n=== Running ${task.name} ===`);
    const child = spawn(task.command, task.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.on("close", (code, signal) => {
      const ok = code === 0;
      resolve({
        ...task,
        ok,
        code: Number.isInteger(code) ? code : null,
        signal: signal || "",
      });
    });
  });
}

const results = [];
for (const task of TASKS) {
  // 顺序执行，方便看哪一步失败，也避免并发占用同一测试资源。
  // eslint-disable-next-line no-await-in-loop
  const result = await runTask(task);
  results.push(result);
  if (!result.ok) break;
}

console.log("\n=== Memory Test Summary ===");
results.forEach((item, index) => {
  console.log(
    `${index + 1}. ${item.ok ? "PASS" : "FAIL"} | ${item.name}${
      item.ok ? "" : ` | code=${item.code ?? "unknown"}${item.signal ? ` | signal=${item.signal}` : ""}`
    }`,
  );
});

const failed = results.find((item) => !item.ok);
if (failed) {
  console.error(`\n结论：memory 聚合回归在 ${failed.name} 失败。`);
  process.exitCode = failed.code || 1;
} else {
  console.log("\n结论：memory 聚合回归全部通过。");
}

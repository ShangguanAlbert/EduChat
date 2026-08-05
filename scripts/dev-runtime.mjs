export function buildDevProcessSpecs() {
  return [
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
  ];
}

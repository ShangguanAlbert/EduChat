import { registerLegacyChatRoutes } from "../../routes/chat.js";

export function registerChatRoutes(app, deps) {
  registerLegacyChatRoutes(app, deps.legacyRegistrarDeps);
}

import {
  buildGroupChatAiRedisKeys,
  createGroupChatAiRedisConnection,
  isGroupChatAiRedisEnabled,
  resolveGroupChatAiRedisPrefix,
} from "./group-chat-ai-redis.js";

export function subscribeGroupChatAiEvents({
  env = process.env,
  onMessageCreated,
  onMessageUpdated,
  onRealtimePayload,
  logger = console,
} = {}) {
  if (!isGroupChatAiRedisEnabled(env)) {
    return async () => {};
  }

  const subscriber = createGroupChatAiRedisConnection({
    env,
    logger,
    connectionName: "group-chat-ai-events",
  });
  const prefix = resolveGroupChatAiRedisPrefix(env);
  const channel = buildGroupChatAiRedisKeys({ prefix }).events;

  subscriber.on("message", (_channel, payloadText) => {
    try {
      const payload = JSON.parse(String(payloadText || "{}"));
      const type = String(payload?.type || "").trim().toLowerCase();
      if (type === "message_created") {
        logger.info?.(
          `[group-chat-ai-events] received message_created roomId=${String(
            payload?.roomId || payload?.message?.roomId || "",
          ).trim()} messageId=${String(payload?.message?.id || "").trim()}`,
        );
        onMessageCreated?.(payload);
      } else if (type === "message_updated") {
        logger.info?.(
          `[group-chat-ai-events] received message_updated roomId=${String(
            payload?.roomId || payload?.message?.roomId || "",
          ).trim()} messageId=${String(payload?.message?.id || "").trim()}`,
        );
        onMessageUpdated?.(payload);
      } else if (type === "realtime_payload") {
        onRealtimePayload?.(payload);
      }
    } catch (error) {
      logger.warn?.("[group-chat-ai-events] failed to parse event payload:", error);
    }
  });

  void subscriber.subscribe(channel).catch((error) => {
    logger.warn?.("[group-chat-ai-events] subscribe failed:", error);
  });

  return async () => {
    try {
      await subscriber.unsubscribe(channel);
    } catch {
      // ignore
    }
    try {
      await subscriber.quit();
    } catch {
      // ignore
    }
  };
}

export function createWelcomeMessage() {
  return {
    id: `m${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content: "你好，今天做点啥？",
    firstTextAt: new Date().toISOString(),
  };
}

export function createNewSessionRecord() {
  const id = `s${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    session: { id, title: "新对话", groupId: null, pinned: false },
    messages: [createWelcomeMessage()],
  };
}

export function hasUserTurn(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => {
    if (m?.role !== "user") return false;
    const hasText = String(m?.content || "").trim().length > 0;
    const hasAttachments = Array.isArray(m?.attachments) && m.attachments.length > 0;
    return hasText || hasAttachments;
  });
}

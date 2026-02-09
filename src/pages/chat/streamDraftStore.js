import { useSyncExternalStore } from "react";

let state = {
  bySession: {},
};

const listeners = new Set();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function getState() {
  return state;
}

export function subscribeStreamDraft(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionStreamDraft(sessionId) {
  return useSyncExternalStore(
    subscribeStreamDraft,
    () => {
      if (!sessionId) return null;
      return getState().bySession[sessionId] || null;
    },
    () => null,
  );
}

export function startStreamDraft(sessionId, draft) {
  if (!sessionId || !draft) return;
  state = {
    ...state,
    bySession: {
      ...state.bySession,
      [sessionId]: draft,
    },
  };
  emitChange();
}

export function updateStreamDraft(sessionId, updater) {
  if (!sessionId || typeof updater !== "function") return;
  const current = state.bySession[sessionId];
  const next = updater(current || null);
  if (!next) return;
  if (next === current) return;

  state = {
    ...state,
    bySession: {
      ...state.bySession,
      [sessionId]: next,
    },
  };
  emitChange();
}

export function getStreamDraft(sessionId) {
  if (!sessionId) return null;
  return state.bySession[sessionId] || null;
}

export function clearStreamDraft(sessionId) {
  if (!sessionId) return;
  if (!state.bySession[sessionId]) return;

  const nextBySession = { ...state.bySession };
  delete nextBySession[sessionId];

  state = {
    ...state,
    bySession: nextBySession,
  };
  emitChange();
}

export function clearManyStreamDrafts(sessionIds) {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) return;

  let changed = false;
  const nextBySession = { ...state.bySession };
  sessionIds.forEach((id) => {
    if (!id) return;
    if (!(id in nextBySession)) return;
    delete nextBySession[id];
    changed = true;
  });

  if (!changed) return;

  state = {
    ...state,
    bySession: nextBySession,
  };
  emitChange();
}

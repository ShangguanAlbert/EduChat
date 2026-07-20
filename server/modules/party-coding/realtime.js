import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { getPartyCodingWorkspaceModel } from "./model.js";

const MAX_CODE_LENGTH = 200_000;
const MAX_STDIN_LENGTH = 20_000;
const MAX_CONSOLE_OUTPUT_LENGTH = 200_000;
const MAX_UPDATE_BYTES = 512 * 1024;
const VERSION_LIMIT = 20;
const PERSIST_DELAY_MS = 800;
const COLLABORATION_TEXT_NAME = "code";
const SERVER_INITIALIZATION_ORIGIN = { type: "party-coding-server-initialization" };

function sanitizeCode(value) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, MAX_CODE_LENGTH);
}

function sanitizeStdin(value) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, MAX_STDIN_LENGTH);
}

function sanitizeConsoleOutput(value) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, MAX_CONSOLE_OUTPUT_LENGTH);
}

function normalizeWorkspace(doc) {
  if (!doc) return null;
  return {
    roomId: String(doc.roomId || ""),
    code: sanitizeCode(doc.code),
    stdin: sanitizeStdin(doc.stdin),
    revision: Math.max(1, Number(doc.revision || 1)),
    versions: (Array.isArray(doc.versions) ? doc.versions : []).map((item) => ({
      revision: Number(item?.revision || 0),
      code: sanitizeCode(item?.code),
      savedByName: String(item?.savedByName || "成员").slice(0, 60),
      createdAt: item?.createdAt ? new Date(item.createdAt).toISOString() : "",
    })),
    run: {
      status: String(doc?.run?.status || "idle") === "running" ? "running" : "idle",
      startedByUserId: String(doc?.run?.startedByUserId || ""),
      startedByName: String(doc?.run?.startedByName || "成员").slice(0, 60),
      startedAt: doc?.run?.startedAt ? new Date(doc.run.startedAt).toISOString() : "",
      completedAt: doc?.run?.completedAt ? new Date(doc.run.completedAt).toISOString() : "",
      stdout: sanitizeConsoleOutput(doc?.run?.stdout),
      stderr: sanitizeConsoleOutput(doc?.run?.stderr),
      exitCode: doc?.run?.exitCode == null || doc.run.exitCode === "" ? null : Number.isFinite(Number(doc.run.exitCode)) ? Number(doc.run.exitCode) : null,
      durationMs: doc?.run?.durationMs == null || doc.run.durationMs === "" ? null : Number.isFinite(Number(doc.run.durationMs)) ? Number(doc.run.durationMs) : null,
    },
  };
}

function encodeUpdate(update) {
  return Buffer.from(update).toString("base64");
}

function decodeUpdate(value) {
  const encoded = String(value || "").trim();
  if (!encoded || encoded.length > MAX_UPDATE_BYTES * 2) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_UPDATE_BYTES) return null;
  return new Uint8Array(buffer);
}

function sanitizeAwarenessClientIds(rawClientIds) {
  if (!Array.isArray(rawClientIds)) return [];
  return Array.from(
    new Set(
      rawClientIds
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value >= 0),
    ),
  ).slice(0, 8);
}

export function createPartyCodingRealtime(deps) {
  const {
    mongoose,
    sanitizeId,
    broadcastGroupChatWsPayload,
    sendGroupChatWsPayload,
  } = deps;
  const Workspace = getPartyCodingWorkspaceModel(mongoose);
  const rooms = new Map();

  async function getRoom(roomId) {
    const safeRoomId = sanitizeId(roomId, "");
    if (!safeRoomId) throw new Error("无效协作编程房间。");
    const existing = rooms.get(safeRoomId);
    if (existing) return existing;

    const loading = createRoom(safeRoomId);
    rooms.set(safeRoomId, loading);
    try {
      const room = await loading;
      rooms.set(safeRoomId, room);
      return room;
    } catch (error) {
      rooms.delete(safeRoomId);
      throw error;
    }
  }

  async function createRoom(roomId) {
    const workspace = await Workspace.findOneAndUpdate(
      { roomId },
      { $setOnInsert: { roomId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    const doc = new Y.Doc();
    const text = doc.getText(COLLABORATION_TEXT_NAME);
    const storedState = Buffer.isBuffer(workspace?.collaborationState)
      ? workspace.collaborationState
      : null;
    if (storedState?.length) {
      Y.applyUpdate(doc, new Uint8Array(storedState), SERVER_INITIALIZATION_ORIGIN);
    } else {
      doc.transact(() => {
        text.insert(0, sanitizeCode(workspace?.code));
      }, SERVER_INITIALIZATION_ORIGIN);
    }

    const room = {
      roomId,
      doc,
      text,
      awareness: new Awareness(doc),
      clientIdsBySocket: new Map(),
      persistTimer: 0,
      persistPromise: Promise.resolve(),
      lastAuthor: { userId: "", name: "成员" },
    };
    doc.on("update", (_update, origin) => {
      if (origin === SERVER_INITIALIZATION_ORIGIN) return;
      if (origin?.partyCodingAuthor) {
        room.lastAuthor = origin.partyCodingAuthor;
      }
      schedulePersist(room);
    });
    return room;
  }

  function schedulePersist(room) {
    if (room.persistTimer) clearTimeout(room.persistTimer);
    room.persistTimer = setTimeout(() => {
      room.persistTimer = 0;
      void persistRoom(room);
    }, PERSIST_DELAY_MS);
  }

  async function persistRoom(room, author = room.lastAuthor) {
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = 0;
    }
    room.persistPromise = room.persistPromise.then(async () => {
      const code = sanitizeCode(room.text.toString());
      if (code !== room.text.toString()) {
        room.doc.transact(() => {
          room.text.delete(MAX_CODE_LENGTH, room.text.length - MAX_CODE_LENGTH);
        }, SERVER_INITIALIZATION_ORIGIN);
      }
      const current = await Workspace.findOne({ roomId: room.roomId }).lean();
      const collaborationState = Buffer.from(Y.encodeStateAsUpdate(room.doc));
      const changedCode = sanitizeCode(current?.code) !== code;
      const safeAuthor = {
        userId: sanitizeId(author?.userId, ""),
        name: String(author?.name || "成员").trim().slice(0, 60) || "成员",
      };
      const revision = Math.max(1, Number(current?.revision || 1) + (changedCode ? 1 : 0));
      const update = {
        $set: {
          code,
          collaborationState,
          revision,
        },
      };
      if (changedCode) {
        update.$push = {
          versions: {
            $each: [{
              revision,
              code,
              savedByUserId: safeAuthor.userId,
              savedByName: safeAuthor.name,
              createdAt: new Date(),
            }],
            $slice: -VERSION_LIMIT,
          },
        };
      }
      const workspace = await Workspace.findOneAndUpdate(
        { roomId: room.roomId },
        update,
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      broadcastGroupChatWsPayload(room.roomId, {
        type: "coding_workspace_updated",
        roomId: room.roomId,
        workspace: normalizeWorkspace(workspace),
      });
      return workspace;
    }).catch(() => null);
    return room.persistPromise;
  }

  function getAuthor(meta) {
    return {
      userId: sanitizeId(meta?.userId, ""),
      name: String(meta?.userName || "成员").trim().slice(0, 60) || "成员",
    };
  }

  async function handleWsMessage({ socket, payload, meta }) {
    const type = String(payload?.type || "").trim().toLowerCase();
    if (!type.startsWith("coding_collab_")) return false;
    const roomId = sanitizeId(payload?.roomId, "");
    if (!roomId || !meta?.authed || !meta?.userId || !meta.joinedRooms?.has(roomId)) {
      return true;
    }
    const room = await getRoom(roomId);

    if (type === "coding_collab_join") {
      sendGroupChatWsPayload(socket, {
        type: "coding_collab_sync",
        roomId,
        update: encodeUpdate(Y.encodeStateAsUpdate(room.doc)),
      });
      const awarenessClientIds = Array.from(room.awareness.getStates().keys());
      if (awarenessClientIds.length) {
        sendGroupChatWsPayload(socket, {
          type: "coding_collab_awareness",
          roomId,
          clientIds: awarenessClientIds,
          update: encodeUpdate(encodeAwarenessUpdate(room.awareness, awarenessClientIds)),
        });
      }
      const workspace = await Workspace.findOne({ roomId }).lean();
      sendGroupChatWsPayload(socket, {
        type: "coding_collab_run_updated",
        roomId,
        workspace: normalizeWorkspace(workspace),
      });
      return true;
    }

    if (type === "coding_collab_stdin") {
      const stdin = sanitizeStdin(payload?.stdin);
      await Workspace.updateOne(
        { roomId },
        { $set: { stdin } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      broadcastGroupChatWsPayload(roomId, {
        type: "coding_collab_stdin",
        roomId,
        stdin,
      });
      return true;
    }

    if (type === "coding_collab_output_clear") {
      const workspace = await Workspace.findOneAndUpdate(
        { roomId, "run.status": { $ne: "running" } },
        {
          $set: {
            "run.stdout": "",
            "run.stderr": "",
            "run.exitCode": null,
            "run.durationMs": null,
            "run.completedAt": null,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      if (workspace) {
        broadcastGroupChatWsPayload(roomId, {
          type: "coding_collab_run_updated",
          roomId,
          workspace: normalizeWorkspace(workspace),
        });
      }
      return true;
    }

    if (type === "coding_collab_update") {
      const update = decodeUpdate(payload?.update);
      if (!update) return true;
      Y.applyUpdate(room.doc, update, { partyCodingAuthor: getAuthor(meta) });
      broadcastGroupChatWsPayload(roomId, {
        type: "coding_collab_update",
        roomId,
        update: encodeUpdate(update),
      });
      return true;
    }

    if (type === "coding_collab_awareness") {
      const update = decodeUpdate(payload?.update);
      const clientIds = sanitizeAwarenessClientIds(payload?.clientIds);
      if (!update || clientIds.length === 0) return true;
      applyAwarenessUpdate(room.awareness, update, socket);
      room.clientIdsBySocket.set(socket, new Set(clientIds));
      broadcastGroupChatWsPayload(roomId, {
        type: "coding_collab_awareness",
        roomId,
        clientIds,
        update: encodeUpdate(update),
      });
      return true;
    }

    return true;
  }

  async function replaceRoomCode({ roomId, code, author }) {
    const room = await getRoom(roomId);
    const before = Y.encodeStateVector(room.doc);
    const safeCode = sanitizeCode(code);
    room.doc.transact(() => {
      room.text.delete(0, room.text.length);
      room.text.insert(0, safeCode);
    }, { partyCodingAuthor: author });
    const update = Y.encodeStateAsUpdate(room.doc, before);
    if (update.length) {
      broadcastGroupChatWsPayload(room.roomId, {
        type: "coding_collab_update",
        roomId: room.roomId,
        update: encodeUpdate(update),
      });
    }
    const workspace = await persistRoom(room, author);
    return normalizeWorkspace(workspace);
  }

  function handleSocketRoomLeft(socket, roomId) {
    const room = rooms.get(sanitizeId(roomId, ""));
    if (!room || typeof room.then === "function") return;
    const clientIds = Array.from(room.clientIdsBySocket.get(socket) || []);
    room.clientIdsBySocket.delete(socket);
    if (!clientIds.length) return;
    removeAwarenessStates(room.awareness, clientIds, socket);
    broadcastGroupChatWsPayload(room.roomId, {
      type: "coding_collab_awareness",
      roomId: room.roomId,
      clientIds,
      update: encodeUpdate(encodeAwarenessUpdate(room.awareness, clientIds)),
    });
  }

  function handleSocketClosed(socket) {
    Array.from(rooms.keys()).forEach((roomId) => handleSocketRoomLeft(socket, roomId));
  }

  return {
    handleWsMessage,
    handleSocketRoomLeft,
    handleSocketClosed,
    replaceRoomCode,
  };
}

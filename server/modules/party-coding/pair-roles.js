function normalizeMemberIds(rawMemberIds) {
  return Array.from(new Set(
    (Array.isArray(rawMemberIds) ? rawMemberIds : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )).slice(0, 2);
}

export function resolvePartyPairRoles(rawMemberIds, current = {}) {
  const memberUserIds = normalizeMemberIds(rawMemberIds);
  const currentDriverUserId = String(current?.driverUserId || "").trim();
  const currentNavigatorUserId = String(current?.navigatorUserId || "").trim();
  const currentRolesAreValid = memberUserIds.length === 2
    && memberUserIds.includes(currentDriverUserId)
    && memberUserIds.includes(currentNavigatorUserId)
    && currentDriverUserId !== currentNavigatorUserId;

  if (currentRolesAreValid) {
    return {
      memberUserIds,
      pairReady: true,
      driverUserId: currentDriverUserId,
      navigatorUserId: currentNavigatorUserId,
      changed: false,
    };
  }

  const driverUserId = memberUserIds.includes(currentDriverUserId)
    ? currentDriverUserId
    : (memberUserIds[0] || "");
  const navigatorUserId = memberUserIds.find((userId) => userId !== driverUserId) || "";
  return {
    memberUserIds,
    pairReady: memberUserIds.length === 2 && !!driverUserId && !!navigatorUserId,
    driverUserId,
    navigatorUserId,
    changed: driverUserId !== currentDriverUserId || navigatorUserId !== currentNavigatorUserId,
  };
}

export async function ensurePartyPairRoles({ Workspace, roomId, memberUserIds }) {
  const current = await Workspace.findOneAndUpdate(
    { roomId },
    { $setOnInsert: { roomId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  const roles = resolvePartyPairRoles(memberUserIds, current);
  if (!roles.changed) return current;
  return Workspace.findOneAndUpdate(
    { roomId },
    {
      $set: {
        driverUserId: roles.driverUserId,
        navigatorUserId: roles.navigatorUserId,
        rolesUpdatedAt: roles.pairReady ? new Date() : null,
      },
    },
    { new: true },
  ).lean();
}

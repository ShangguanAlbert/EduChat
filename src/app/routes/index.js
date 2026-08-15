import { buildLoginRedirect } from "./navigationTargets.js";
import { adminRoutes } from "../../features/admin/routes.js";
import { authRoutes } from "../../features/auth/routes.js";
import { chatRoutes } from "../../features/chat/routes.js";
import { classroomRoutes } from "../../features/classroom/routes.js";
import { partyRoutes } from "../../features/party/routes.js";

export const appRoutes = [
  ...authRoutes,
  ...classroomRoutes,
  ...chatRoutes,
  ...partyRoutes,
  ...adminRoutes,
  {
    path: "*",
    auth: "public",
    redirectTo: ({ activeSlot }) => buildLoginRedirect(activeSlot),
  },
];

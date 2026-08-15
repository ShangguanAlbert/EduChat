import { Navigate, useLocation } from "react-router-dom";
import { resolveActiveAuthSlot, withAuthSlot } from "./authStorage.js";
import { getAdminToken } from "../pages/login/adminSession.js";

export default function RequireAdminAuth({ children }) {
  const location = useLocation();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const token = getAdminToken();
  if (!token) {
    return (
      <Navigate
        to={withAuthSlot("/login", activeSlot)}
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}

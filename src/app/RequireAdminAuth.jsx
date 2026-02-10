import { Navigate } from "react-router-dom";
import { getAdminToken } from "../pages/login/adminSession.js";

export default function RequireAdminAuth({ children }) {
  const token = getAdminToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

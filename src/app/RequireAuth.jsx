import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ children }) {
  const token = localStorage.getItem("token");
  const location = useLocation();

  if (!token) {
    // 记住用户原本想去的页面，未来接真实登录时可以“登录后跳回去”
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

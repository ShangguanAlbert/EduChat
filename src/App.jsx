import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import AdminSettingsPage from "./pages/AdminSettingsPage.jsx";
import ImageGenerationPage from "./pages/ImageGenerationPage.jsx";
import PartyChatPage from "./pages/PartyChatPage.jsx";
import RequireAuth from "./app/RequireAuth.jsx";
import RequireAdminAuth from "./app/RequireAdminAuth.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/chat"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />

      <Route
        path="/image-generation"
        element={
          <RequireAuth>
            <ImageGenerationPage />
          </RequireAuth>
        }
      />

      <Route
        path="/party"
        element={
          <RequireAuth>
            <PartyChatPage />
          </RequireAuth>
        }
      />

      <Route
        path="/admin/settings"
        element={
          <RequireAdminAuth>
            <AdminSettingsPage />
          </RequireAdminAuth>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

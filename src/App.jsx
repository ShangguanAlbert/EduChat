import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import LicensePage from "./pages/LicensePage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ModeSelectionPage from "./pages/ModeSelectionPage.jsx";
import ClassroomTaskPage from "./pages/ClassroomTaskPage.jsx";
import ProductImprovementTaskPage from "./pages/ProductImprovementTaskPage.jsx";
import AdminSettingsPage from "./pages/AdminSettingsPage.jsx";
import AdminOnlineUsersPage from "./pages/AdminOnlineUsersPage.jsx";
import AdminClassroomSettingsPage from "./pages/AdminClassroomSettingsPage.jsx";
import TeacherHomePage from "./pages/TeacherHomePage.jsx";
import ImageGenerationPage from "./pages/ImageGenerationPage.jsx";
import PartyChatPage from "./pages/PartyChatPage.jsx";
import RequireAuth from "./app/RequireAuth.jsx";
import RequireAdminAuth from "./app/RequireAdminAuth.jsx";
import { resolveActiveAuthSlot, syncAuthSlotFromLocation, withAuthSlot } from "./app/authStorage.js";

export default function App() {
  const location = useLocation();
  const activeSlot = resolveActiveAuthSlot(location.search);

  useEffect(() => {
    syncAuthSlotFromLocation(location.search);
  }, [location.search]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/license" element={<LicensePage />} />

      <Route
        path="/mode-selection"
        element={
          <RequireAuth>
            <ModeSelectionPage />
          </RequireAuth>
        }
      />

      <Route
        path="/classroom/tasks"
        element={
          <RequireAuth>
            <ClassroomTaskPage />
          </RequireAuth>
        }
      />

      <Route
        path="/classroom/tasks/product-improvement"
        element={
          <RequireAuth>
            <ProductImprovementTaskPage />
          </RequireAuth>
        }
      />

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
            <TeacherHomePage />
          </RequireAdminAuth>
        }
      />

      <Route
        path="/admin/agent-settings"
        element={
          <RequireAdminAuth>
            <AdminSettingsPage />
          </RequireAdminAuth>
        }
      />

      <Route
        path="/admin/classroom-settings"
        element={
          <RequireAdminAuth>
            <AdminClassroomSettingsPage />
          </RequireAdminAuth>
        }
      />

      <Route
        path="/admin/online-users"
        element={
          <RequireAdminAuth>
            <AdminOnlineUsersPage />
          </RequireAdminAuth>
        }
      />

      <Route path="*" element={<Navigate to={withAuthSlot("/login", activeSlot)} replace />} />
    </Routes>
  );
}

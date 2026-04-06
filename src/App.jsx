import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import LicensePage from "./pages/LicensePage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ChatEntryPage from "./pages/ChatEntryPage.jsx";
import ModeSelectionPage from "./pages/ModeSelectionPage.jsx";
import ProductImprovementTaskPage from "./pages/ProductImprovementTaskPage.jsx";
import AdminSettingsPage from "./pages/AdminSettingsPage.jsx";
import AdminOnlineUsersPage from "./pages/AdminOnlineUsersPage.jsx";
import AdminClassroomSettingsPage from "./pages/AdminClassroomSettingsPage.jsx";
import TeacherHomePage from "./pages/TeacherHomePage.jsx";
import ImageGenerationPage from "./pages/ImageGenerationPage.jsx";
import PartyChatPage from "./pages/PartyChatPage.jsx";
import AgentLabPage from "./pages/agent-lab/AgentLabPage.jsx";
import AdminAgentLabPage from "./pages/agent-lab/AdminAgentLabPage.jsx";
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
            <Navigate to={withAuthSlot("/mode-selection", activeSlot)} replace />
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
            <ChatEntryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/chat/:sessionId"
        element={
          <RequireAuth>
            <ChatEntryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/c"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route
        path="/c/:sessionId"
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
        path="/image-generation/:libraryView"
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
        path="/agent-lab"
        element={
          <RequireAuth>
            <AgentLabPage />
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

      <Route
        path="/admin/agent-lab"
        element={
          <RequireAdminAuth>
            <AdminAgentLabPage />
          </RequireAdminAuth>
        }
      />

      <Route path="*" element={<Navigate to={withAuthSlot("/login", activeSlot)} replace />} />
    </Routes>
  );
}

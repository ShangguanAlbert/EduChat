import { useEffect, useState } from "react";
import ImageGenerationDesktopPage from "../desktop/ImageGenerationDesktopPage.jsx";
import "../../../styles/image-generation-mobile.css";

export default function ImageGenerationMobilePage() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const isAnyDrawerOpen = isSettingsOpen || isHistoryOpen;

  useEffect(() => {
    if (!isAnyDrawerOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
        setIsHistoryOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAnyDrawerOpen]);

  function openSettingsDrawer() {
    setIsHistoryOpen(false);
    setIsSettingsOpen(true);
  }

  function openHistoryDrawer() {
    setIsSettingsOpen(false);
    setIsHistoryOpen(true);
  }

  function closeAllDrawers() {
    setIsSettingsOpen(false);
    setIsHistoryOpen(false);
  }

  return (
    <div
      className={`image-mobile-shell${isHistoryOpen ? " is-history-open" : ""}${
        isSettingsOpen ? " is-settings-open" : ""
      }`}
      data-layout="mobile"
    >
      <ImageGenerationDesktopPage
        isMobileSettingsDrawer
        isSettingsDrawerOpen={isSettingsOpen}
        onToggleSettingsDrawer={setIsSettingsOpen}
        isMobileHistoryDrawer
        isHistoryDrawerOpen={isHistoryOpen}
        onToggleHistoryDrawer={setIsHistoryOpen}
      />

      <div className="image-mobile-action-row">
        <button
          type="button"
          className="image-mobile-action-btn"
          onClick={openSettingsDrawer}
          aria-expanded={isSettingsOpen}
          aria-controls="image-settings-panel"
        >
          设置
        </button>

        <button
          type="button"
          className="image-mobile-action-btn"
          onClick={openHistoryDrawer}
          aria-expanded={isHistoryOpen}
          aria-controls="image-history-panel"
        >
          历史记录
        </button>
      </div>

      <button
        type="button"
        className="image-mobile-history-overlay"
        onClick={closeAllDrawers}
        aria-label="关闭抽屉"
      />
    </div>
  );
}

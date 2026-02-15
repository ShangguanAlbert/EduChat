import PartyChatDesktopPage from "./party-chat/desktop/PartyChatDesktopPage.jsx";
import PartyChatMobilePage from "./party-chat/mobile/PartyChatMobilePage.jsx";
import useIsMobileViewport from "./party-chat/shared/useIsMobileViewport.js";

export default function PartyChatPage() {
  const isMobileViewport = useIsMobileViewport();
  if (isMobileViewport) {
    return <PartyChatMobilePage />;
  }
  return <PartyChatDesktopPage />;
}

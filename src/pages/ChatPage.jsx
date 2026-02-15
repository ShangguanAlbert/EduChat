import ChatDesktopPage from "./chat/desktop/ChatDesktopPage.jsx";
import ChatMobilePage from "./chat/mobile/ChatMobilePage.jsx";
import useIsMobileViewport from "./chat/shared/useIsMobileViewport.js";

export default function ChatPage() {
  const isMobileViewport = useIsMobileViewport();
  if (isMobileViewport) {
    return <ChatMobilePage />;
  }
  return <ChatDesktopPage />;
}

import ChatDesktopPage from "../desktop/ChatDesktopPage.jsx";
import "../../../styles/chat-mobile.css";

export default function ChatMobilePage() {
  return (
    <div className="chat-mobile-shell" data-layout="mobile">
      <ChatDesktopPage />
    </div>
  );
}

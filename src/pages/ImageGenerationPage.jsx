import ImageGenerationDesktopPage from "./image-generation/desktop/ImageGenerationDesktopPage.jsx";
import ImageGenerationMobilePage from "./image-generation/mobile/ImageGenerationMobilePage.jsx";
import useIsMobileViewport from "./image-generation/shared/useIsMobileViewport.js";

export default function ImageGenerationPage() {
  const isMobileViewport = useIsMobileViewport();
  if (isMobileViewport) {
    return <ImageGenerationMobilePage />;
  }
  return <ImageGenerationDesktopPage />;
}

import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import licenseText from "../../LICENSE?raw";
import { withAuthSlot } from "../app/authStorage.js";
import "../styles/license-page.css";

const LICENSE_CONTENT = String(licenseText || "").trim();
const LICENSE_FALLBACK_TEXT = "License 内容暂时不可用。";

export default function LicensePage() {
  return (
    <main className="license-page">
      <section className="license-card">
        <header className="license-header">
          <Link className="license-back-link" to={withAuthSlot("/login")}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>返回登录</span>
          </Link>
          <h1 className="license-title">开源协议 License</h1>
          <p className="license-subtitle">本项目遵循 GNU AGPL v3.0.</p>
        </header>
        <pre className="license-content">{LICENSE_CONTENT || LICENSE_FALLBACK_TEXT}</pre>
      </section>
    </main>
  );
}

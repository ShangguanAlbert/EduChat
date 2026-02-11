import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ModalOverlay from "../components/login/ModalOverlay.jsx";
import {
  adminLogin,
  fetchAuthStatus,
  loginAccount,
  registerAccount,
  resetForgotPassword,
  verifyForgotAccount,
} from "./auth/authApi.js";
import { setAdminToken } from "./login/adminSession.js";
import { EMPTY_AUTH_STATUS, PRIVACY_POLICY_SECTIONS } from "./login/loginConstants.js";
import "../styles/login.css";

function readErrorMessage(error) {
  return error?.message || "请求失败，请稍后再试。";
}

export default function LoginPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  const [authStatusLoading, setAuthStatusLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState(EMPTY_AUTH_STATUS);
  const [adminNotice, setAdminNotice] = useState("");

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerErr, setRegisterErr] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotMatched, setForgotMatched] = useState(false);
  const [forgotMatchLoading, setForgotMatchLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotPasswordConfirm, setForgotPasswordConfirm] = useState("");
  const [forgotErr, setForgotErr] = useState("");
  const [forgotSaving, setForgotSaving] = useState(false);

  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginErr, setAdminLoginErr] = useState("");

  const bootstrapMode = !authStatus.hasAnyUser;

  const loginHint = useMemo(() => {
    if (authStatusLoading) return "正在读取账号状态…";
    if (bootstrapMode) return "首次运行请先注册管理员账号（admin）。";
    return "请输入数据库中已注册的账号与密码。";
  }, [authStatusLoading, bootstrapMode]);

  async function refreshAuthStatus() {
    setAuthStatusLoading(true);
    try {
      const data = await fetchAuthStatus();
      setAuthStatus({
        hasAnyUser: !!data.hasAnyUser,
        hasAdmin: !!data.hasAdmin,
        adminUsername: data.adminUsername || "admin",
      });
      setAdminUsername(data.adminUsername || "admin");
    } catch (error) {
      setErr(readErrorMessage(error));
      setAuthStatus(EMPTY_AUTH_STATUS);
    } finally {
      setAuthStatusLoading(false);
    }
  }

  useEffect(() => {
    refreshAuthStatus();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setAdminNotice("");

    if (!username.trim()) return setErr("请输入用户名");
    if (!password) return setErr("请输入密码");
    if (!privacyAgreed) return setErr("请先勾选并同意隐私政策");
    if (bootstrapMode) return setErr("尚未注册账号，请先注册管理员账号。");

    setLoading(true);
    try {
      const data = await loginAccount({
        username: username.trim(),
        password,
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user || {}));
      navigate("/chat");
    } catch (error) {
      setErr(readErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openRegisterModal() {
    setRegisterErr("");
    setRegisterPassword("");
    setRegisterPasswordConfirm("");
    setRegisterUsername(bootstrapMode ? "admin" : "");
    setShowRegisterModal(true);
    setAdminNotice("");
  }

  async function onRegisterSubmit(e) {
    e.preventDefault();
    setRegisterErr("");

    const targetUsername = bootstrapMode ? "admin" : registerUsername.trim();
    if (!targetUsername) return setRegisterErr("请输入用户名。");
    if (!registerPassword) return setRegisterErr("请输入密码。");
    if (registerPassword !== registerPasswordConfirm) {
      return setRegisterErr("两次密码不一致。");
    }

    setRegisterLoading(true);
    try {
      const data = await registerAccount({
        username: targetUsername,
        password: registerPassword,
      });

      setShowRegisterModal(false);
      setUsername(data?.user?.username || targetUsername);
      setPassword("");
      setErr(
        data.bootstrapAdmin
          ? "管理员账号已创建，请使用 admin 登录。"
          : "注册成功，请登录。",
      );
      await refreshAuthStatus();
    } catch (error) {
      setRegisterErr(readErrorMessage(error));
    } finally {
      setRegisterLoading(false);
    }
  }

  function openForgotModal() {
    setShowForgotModal(true);
    setForgotErr("");
    setForgotUsername(username.trim());
    setForgotMatched(false);
    setForgotPassword("");
    setForgotPasswordConfirm("");
    setAdminNotice("");
  }

  async function onVerifyForgotUsername() {
    setForgotErr("");
    if (!forgotUsername.trim()) return setForgotErr("请输入账号。");

    setForgotMatchLoading(true);
    try {
      const data = await verifyForgotAccount({
        username: forgotUsername.trim(),
      });
      if (!data.exists) {
        setForgotMatched(false);
        setForgotErr("未找到该账号，请确认后再试。");
        return;
      }
      setForgotMatched(true);
      setForgotErr("");
    } catch (error) {
      setForgotMatched(false);
      setForgotErr(readErrorMessage(error));
    } finally {
      setForgotMatchLoading(false);
    }
  }

  async function onResetForgotPassword(e) {
    e.preventDefault();
    setForgotErr("");

    if (!forgotMatched) return setForgotErr("请先匹配账号。");
    if (!forgotPassword) return setForgotErr("请输入新密码。");
    if (forgotPassword !== forgotPasswordConfirm) {
      return setForgotErr("两次输入的新密码不一致。");
    }

    setForgotSaving(true);
    try {
      await resetForgotPassword({
        username: forgotUsername.trim(),
        newPassword: forgotPassword,
        confirmPassword: forgotPasswordConfirm,
      });
      setShowForgotModal(false);
      setUsername(forgotUsername.trim());
      setPassword("");
      setErr("密码已重置，请使用新密码登录。");
    } catch (error) {
      setForgotErr(readErrorMessage(error));
    } finally {
      setForgotSaving(false);
    }
  }

  function onAdminEntryClick() {
    setAdminNotice("");
    setAdminLoginErr("");
    if (authStatusLoading) return;
    if (!authStatus.hasAdmin) {
      setAdminNotice("管理员未注册，请先注册");
      return;
    }

    setAdminPassword("");
    setShowAdminLoginModal(true);
  }

  async function onAdminLoginSubmit(e) {
    e.preventDefault();
    setAdminLoginErr("");

    if (!adminPassword) {
      setAdminLoginErr("请输入管理员密码。");
      return;
    }

    setAdminLoginLoading(true);
    try {
      const loginData = await adminLogin({
        username: adminUsername.trim() || "admin",
        password: adminPassword,
      });

      const nextToken = String(loginData?.token || "").trim();
      if (!nextToken) {
        setAdminLoginErr("管理员会话创建失败，请重试。");
        return;
      }

      setAdminToken(nextToken);
      setShowAdminLoginModal(false);
      navigate("/admin/settings");
    } catch (error) {
      setAdminLoginErr(readErrorMessage(error));
    } finally {
      setAdminLoginLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-brand">
          <div className="login-logo">E</div>
          <div>
            <div className="login-title">EduChat</div>
            <div className="login-subtitle">教育实验对话平台</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="login-card">
          <h2 className="login-h2">登录</h2>
          <p className="login-hint">{loginHint}</p>

          <div className="login-field">
            <label className="login-label">用户名</label>
            <input
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入账号"
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label className="login-label">密码</label>
            <input
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>

          <div className="login-consent-row">
            <label
              className="login-consent-label"
              htmlFor="privacy-agree-checkbox"
            >
              <input
                id="privacy-agree-checkbox"
                className="login-consent-checkbox"
                type="checkbox"
                checked={privacyAgreed}
                onChange={(e) => {
                  setPrivacyAgreed(e.target.checked);
                  if (err) setErr("");
                }}
              />
              <span>我已阅读并同意</span>
            </label>
            <button
              type="button"
              className="login-link-btn login-consent-link"
              onClick={() => setShowPrivacyPolicy(true)}
            >
              《隐私政策（知情同意）》
            </button>
          </div>

          <div className="login-actions">
            <button
              className="login-btn"
              type="submit"
              disabled={loading || !privacyAgreed || authStatusLoading}
            >
              {loading ? (
                <span className="btn-inner">
                  <span className="spinner" aria-hidden="true"></span>
                  登录中…
                </span>
              ) : (
                "登录"
              )}
            </button>
            <div className="login-err">{err}</div>
          </div>

          <div className="login-footer">
            <button
              type="button"
              className="login-link-btn"
              onClick={openRegisterModal}
            >
              注册账号
            </button>
            <span className="login-footer-divider" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              className="login-link-btn"
              onClick={openForgotModal}
            >
              忘记密码
            </button>
            <span className="login-footer-divider" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              className="login-link-btn"
              onClick={() => setShowPrivacyPolicy(true)}
            >
              隐私政策
            </button>
          </div>
        </form>
      </div>

      <button
        type="button"
        className="login-admin-entry"
        onClick={onAdminEntryClick}
      >
        管理员入口
      </button>
      {adminNotice ? <p className="login-admin-notice">{adminNotice}</p> : null}

      {showRegisterModal && (
        <ModalOverlay
          title="注册账号"
          subtitle={
            bootstrapMode
              ? "首次注册将自动创建管理员账号（admin）"
              : "创建普通用户账号用于登录"
          }
          onClose={() => setShowRegisterModal(false)}
        >
          <form onSubmit={onRegisterSubmit}>
            <div className="login-field">
              <label className="login-label">用户名</label>
              <input
                className="login-input"
                value={bootstrapMode ? "admin" : registerUsername}
                onChange={(e) => setRegisterUsername(e.target.value)}
                placeholder="请输入用户名"
                disabled={bootstrapMode || registerLoading}
                autoComplete="username"
              />
            </div>

            <div className="login-field">
              <label className="login-label">密码</label>
              <input
                className="login-input"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                type="password"
                placeholder="至少 6 位"
                autoComplete="new-password"
              />
            </div>

            <div className="login-field">
              <label className="login-label">确认密码</label>
              <input
                className="login-input"
                value={registerPasswordConfirm}
                onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                type="password"
                placeholder="再次输入密码"
                autoComplete="new-password"
              />
            </div>

            <p className="login-modal-error">{registerErr}</p>
            <div className="login-modal-actions">
              <button
                type="button"
                className="login-modal-btn secondary"
                onClick={() => setShowRegisterModal(false)}
                disabled={registerLoading}
              >
                取消
              </button>
              <button
                type="submit"
                className="login-modal-btn"
                disabled={registerLoading}
              >
                {registerLoading ? "注册中…" : "注册"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {showForgotModal && (
        <ModalOverlay
          title="忘记密码"
          subtitle="先匹配账号，匹配成功后设置新密码。"
          onClose={() => setShowForgotModal(false)}
        >
          <form onSubmit={onResetForgotPassword}>
            <div className="login-field">
              <label className="login-label">账号</label>
              <div className="login-verify-row">
                <input
                  className="login-input"
                  value={forgotUsername}
                  onChange={(e) => {
                    setForgotUsername(e.target.value);
                    setForgotMatched(false);
                    if (forgotErr) setForgotErr("");
                  }}
                  placeholder="请输入账号"
                  autoComplete="username"
                />
                <button
                  type="button"
                  className="login-mini-btn"
                  onClick={onVerifyForgotUsername}
                  disabled={forgotMatchLoading}
                >
                  {forgotMatchLoading ? "匹配中…" : "匹配账号"}
                </button>
              </div>
              {forgotMatched ? (
                <div className="login-verify-ok">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>账号匹配成功</span>
                </div>
              ) : null}
            </div>

            <div className="login-field">
              <label className="login-label">新密码</label>
              <input
                className="login-input"
                value={forgotPassword}
                onChange={(e) => setForgotPassword(e.target.value)}
                type="password"
                placeholder="至少 6 位"
                autoComplete="new-password"
                disabled={!forgotMatched}
              />
            </div>

            <div className="login-field">
              <label className="login-label">重复新密码</label>
              <input
                className="login-input"
                value={forgotPasswordConfirm}
                onChange={(e) => setForgotPasswordConfirm(e.target.value)}
                type="password"
                placeholder="再次输入新密码"
                autoComplete="new-password"
                disabled={!forgotMatched}
              />
            </div>

            <p className="login-modal-error">{forgotErr}</p>
            <div className="login-modal-actions">
              <button
                type="button"
                className="login-modal-btn secondary"
                onClick={() => setShowForgotModal(false)}
                disabled={forgotSaving}
              >
                取消
              </button>
              <button
                type="submit"
                className="login-modal-btn"
                disabled={forgotSaving || !forgotMatched}
              >
                {forgotSaving ? "保存中…" : "重置密码"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {showAdminLoginModal && (
        <ModalOverlay
          title="管理员登录"
          subtitle="登录后进入独立管理页面进行导出与智能体配置。"
          onClose={() => setShowAdminLoginModal(false)}
        >
          <form onSubmit={onAdminLoginSubmit}>
            <div className="login-field">
              <label className="login-label">管理员账号</label>
              <input
                className="login-input"
                value={adminUsername}
                readOnly
                autoComplete="username"
              />
            </div>

            <div className="login-field">
              <label className="login-label">管理员密码</label>
              <input
                className="login-input"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>

            <p className="login-modal-error">{adminLoginErr}</p>
            <div className="login-modal-actions">
              <button
                type="button"
                className="login-modal-btn secondary"
                onClick={() => setShowAdminLoginModal(false)}
                disabled={adminLoginLoading}
              >
                取消
              </button>
              <button
                type="submit"
                className="login-modal-btn"
                disabled={adminLoginLoading}
              >
                {adminLoginLoading ? "登录中…" : "进入管理页面"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {showPrivacyPolicy && (
        <div
          className="login-policy-overlay"
          role="presentation"
          onClick={() => setShowPrivacyPolicy(false)}
        >
          <div
            className="login-policy-modal"
            role="dialog"
            aria-modal="true"
            aria-label="隐私政策（知情同意）"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="login-policy-title">隐私政策（知情同意）</h3>
            <div className="login-policy-reader">
              {PRIVACY_POLICY_SECTIONS.map((line, idx) => (
                <p key={idx} className="login-policy-text">
                  {line}
                </p>
              ))}
            </div>
            <div className="login-policy-actions">
              <button
                type="button"
                className="login-policy-confirm"
                onClick={() => {
                  setPrivacyAgreed(true);
                  setShowPrivacyPolicy(false);
                  if (err) setErr("");
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

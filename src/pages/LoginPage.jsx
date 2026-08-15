import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ModalOverlay from "../components/login/ModalOverlay.jsx";
import {
  resolveActiveAuthSlot,
  setStoredAuthUser,
  setUserToken,
  withAuthSlot,
} from "../app/authStorage.js";
import {
  adminLogin,
  fetchAuthStatus,
  loginAccount,
  registerAccount,
} from "./auth/authApi.js";
import { setAdminToken } from "./login/adminSession.js";
import { EMPTY_AUTH_STATUS, PRIVACY_POLICY_SECTIONS } from "./login/loginConstants.js";
import { resolveAdminLoginTarget } from "./login/loginNavigation.js";
import {
  getTeacherScopeStudentEntryPath,
  SHI_GAOJUN_TEACHER_SCOPE_KEY,
} from "../../shared/teacherScopes.js";
import "../styles/login.css";

function readErrorMessage(error) {
  return error?.message || "请求失败，请稍后再试。";
}

const REGISTER_GENDER_OPTIONS = ["男", "女"];
const REGISTER_GRADE_OPTIONS = [
  "7年级",
  "8年级",
  "9年级",
  "高一",
  "高二",
  "高三",
  "大学一年级",
  "大学二年级",
  "大学三年级",
  "大学四年级",
  "硕士研究生",
  "博士研究生",
];
const EMPTY_REGISTER_PROFILE = Object.freeze({
  name: "",
  studentId: "",
  gender: "",
  grade: "",
  className: "",
});

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlot = resolveActiveAuthSlot(location.search);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const teacherScopeKey = SHI_GAOJUN_TEACHER_SCOPE_KEY;
  const [pairProgrammingInviteCode, setPairProgrammingInviteCode] =
    useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  const [authStatusLoading, setAuthStatusLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState(EMPTY_AUTH_STATUS);
  const [teacherLoginLoading, setTeacherLoginLoading] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerRole, setRegisterRole] = useState("student");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerProfile, setRegisterProfile] = useState(
    EMPTY_REGISTER_PROFILE,
  );
  const [registerInviteCode, setRegisterInviteCode] = useState("");
  const [registerErr, setRegisterErr] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  const loginHint = useMemo(() => {
    if (authStatusLoading) return "正在读取账号状态…";
    if (!authStatus.hasAnyUser) return "尚未导入学生账号，请联系指导教师。";
    return "";
  }, [authStatus.hasAnyUser, authStatusLoading]);

  const pairProgrammingInviteRequired = true;

  async function refreshAuthStatus() {
    setAuthStatusLoading(true);
    try {
      const data = await fetchAuthStatus();
      const adminUsernames = Array.isArray(data.adminUsernames)
        ? data.adminUsernames.filter(Boolean)
        : [];
      setAuthStatus({
        hasAnyUser: !!data.hasAnyUser,
        hasAdmin: !!data.hasAdmin,
        adminUsernames,
        preloadedStudentCount: Number(data.preloadedStudentCount || 0),
        preloadedStudentTeacherScopeKey: String(data.preloadedStudentTeacherScopeKey || ""),
        preloadedStudentTeacherScopeLabel: String(data.preloadedStudentTeacherScopeLabel || ""),
      });
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

  function openRegisterModal() {
    setRegisterRole("student");
    setRegisterUsername("");
    setRegisterPassword("");
    setRegisterPasswordConfirm("");
    setRegisterProfile(EMPTY_REGISTER_PROFILE);
    setRegisterInviteCode("");
    setRegisterErr("");
    setShowRegisterModal(true);
  }

  async function onRegisterSubmit(event) {
    event.preventDefault();
    setRegisterErr("");
    const targetUsername = registerUsername.trim();
    if (!targetUsername) return setRegisterErr("请输入用户名。");
    if (!registerPassword) return setRegisterErr("请输入密码。");
    if (registerPassword !== registerPasswordConfirm) {
      return setRegisterErr("两次输入的密码不一致。");
    }
    if (!registerInviteCode.trim()) {
      return setRegisterErr(
        registerRole === "teacher"
          ? "请输入教师邀请码。"
          : "请输入结对编程课堂邀请码。",
      );
    }
    if (!privacyAgreed) {
      return setRegisterErr("请先在登录页勾选并同意隐私政策。");
    }

    setRegisterLoading(true);
    try {
      const data = await registerAccount({
        registrationRole: registerRole,
        username: targetUsername,
        password: registerPassword,
        profile: registerProfile,
        ...(registerRole === "teacher"
          ? { teacherInviteCode: registerInviteCode.trim() }
          : { classInviteCode: registerInviteCode.trim() }),
      });
      setShowRegisterModal(false);
      setUsername(data?.user?.username || targetUsername);
      setPassword("");
      setErr(
        registerRole === "teacher"
          ? "教师账号注册成功，请使用「教师登录」。"
          : "学生账号已提交，等待施高俊老师确认绑定后即可登录。",
      );
      await refreshAuthStatus();
    } catch (error) {
      setRegisterErr(readErrorMessage(error));
    } finally {
      setRegisterLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    if (!username.trim()) return setErr("请输入用户名");
    if (!password) return setErr("请输入密码");
    if (pairProgrammingInviteRequired && !pairProgrammingInviteCode.trim()) {
      return setErr("请输入结对编程邀请码");
    }
    if (!privacyAgreed) return setErr("请先勾选并同意隐私政策");

    setLoading(true);
    try {
      const data = await loginAccount({
        username: username.trim(),
        password,
        teacherScopeKey,
        inviteCode: pairProgrammingInviteRequired
          ? pairProgrammingInviteCode.trim()
          : "",
      });
      setUserToken(data.token);
      setStoredAuthUser({
        ...(data.user || {}),
        teacherScopeKey: data.teacherScopeKey || teacherScopeKey,
        teacherScopeLabel: data.teacherScopeLabel || "",
      });
      const nextTeacherScopeKey = String(
        data.teacherScopeKey || teacherScopeKey,
      )
        .trim()
        .toLowerCase();
      navigate(
        withAuthSlot(
          getTeacherScopeStudentEntryPath(nextTeacherScopeKey),
        ),
      );
    } catch (error) {
      setErr(readErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function onTeacherLogin() {
    setErr("");
    if (authStatusLoading) return;
    if (!authStatus.hasAdmin) return setErr("管理员账号未初始化。");
    if (!username.trim()) return setErr("请输入用户名");
    if (!password) return setErr("请输入密码");
    if (!privacyAgreed) return setErr("请先勾选并同意隐私政策");

    setTeacherLoginLoading(true);
    try {
      const loginData = await adminLogin({
        username: username.trim(),
        password,
      });

      const nextToken = String(loginData?.token || "").trim();
      if (!nextToken) {
        setErr("教师会话创建失败，请重试。");
        return;
      }

      setAdminToken(nextToken);
      const target = resolveAdminLoginTarget(location.state?.from);
      navigate(withAuthSlot(target, activeSlot), { replace: true });
    } catch (error) {
      setErr(readErrorMessage(error));
    } finally {
      setTeacherLoginLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-brand">
          <div className="login-logo">元</div>
          <div>
            <div className="login-title">元协坊</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="login-card">
          <h2 className="login-h2">登录</h2>
          {loginHint ? <p className="login-hint">{loginHint}</p> : null}

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

          <div className="login-field">
            <label className="login-label" htmlFor="login-teacher-name">
              指导教师
            </label>
            <input
              id="login-teacher-name"
              className="login-input"
              value="施高俊"
              readOnly
              aria-readonly="true"
            />
          </div>

          {pairProgrammingInviteRequired ? (
            <div className="login-field">
              <label
                className="login-label"
                htmlFor="pair-programming-invite-code"
              >
                结对编程邀请码
              </label>
              <input
                id="pair-programming-invite-code"
                className="login-input"
                value={pairProgrammingInviteCode}
                onChange={(event) => {
                  setPairProgrammingInviteCode(event.target.value);
                  if (err) setErr("");
                }}
                type="password"
                placeholder="请输入邀请码"
                autoComplete="off"
              />
              <p className="login-field-note">
                仅获得课堂邀请码的学生可以进入结对编程。
              </p>
            </div>
          ) : null}

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
            <div className="login-action-row">
              <button
                className="login-btn login-btn-secondary"
                type="button"
                onClick={onTeacherLogin}
                disabled={authStatusLoading || loading || teacherLoginLoading}
              >
                {teacherLoginLoading ? "登录中…" : "教师登录"}
              </button>
              <button
                className="login-btn"
                type="submit"
                disabled={loading || teacherLoginLoading || !privacyAgreed || authStatusLoading}
              >
                {loading ? (
                  <span className="btn-inner">
                    <span className="spinner" aria-hidden="true"></span>
                    登录中…
                  </span>
                ) : (
                  "学生登录"
                )}
              </button>
            </div>
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
              onClick={() => setShowPrivacyPolicy(true)}
            >
              隐私政策
            </button>
          </div>
        </form>
        <div className="login-license" aria-label="开源协议声明">
          <p>
            开源协议：本项目遵循{" "}
            <Link className="login-license-link" to={withAuthSlot("/license")}>
              MIT License
            </Link>
            。
          </p>
          <p>Copyright © 2026 上官福泽</p>
        </div>
      </div>

      {showRegisterModal ? (
        <ModalOverlay
          title="注册账号"
          subtitle="账号注册与身份准入分开：教师需教师邀请码，学生提交后还需指导教师确认。"
          onClose={() => setShowRegisterModal(false)}
        >
          <form onSubmit={onRegisterSubmit}>
            <div className="login-field">
              <label className="login-label" htmlFor="register-role">
                注册身份
              </label>
              <select
                id="register-role"
                className="login-input login-select"
                value={registerRole}
                onChange={(event) => {
                  setRegisterRole(event.target.value);
                  setRegisterInviteCode("");
                  setRegisterErr("");
                }}
                disabled={registerLoading}
              >
                <option value="student">学生</option>
                <option value="teacher">教师</option>
              </select>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="register-username">
                用户名
              </label>
              <input
                id="register-username"
                className="login-input"
                value={registerUsername}
                onChange={(event) => setRegisterUsername(event.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                disabled={registerLoading}
              />
            </div>

            <div className="login-profile-fields">
              <div className="login-field">
                <label className="login-label" htmlFor="register-password">
                  密码
                </label>
                <input
                  id="register-password"
                  className="login-input"
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                  disabled={registerLoading}
                />
              </div>
              <div className="login-field">
                <label
                  className="login-label"
                  htmlFor="register-password-confirm"
                >
                  确认密码
                </label>
                <input
                  id="register-password-confirm"
                  className="login-input"
                  type="password"
                  value={registerPasswordConfirm}
                  onChange={(event) =>
                    setRegisterPasswordConfirm(event.target.value)
                  }
                  placeholder="再次输入"
                  autoComplete="new-password"
                  disabled={registerLoading}
                />
              </div>
            </div>

            <div className="login-modal-section-title">
              {registerRole === "teacher" ? "教师信息" : "学生信息"}
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="register-name">
                真实姓名
              </label>
              <input
                id="register-name"
                className="login-input"
                value={registerProfile.name}
                onChange={(event) =>
                  setRegisterProfile((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="请输入中文姓名"
                autoComplete="name"
                disabled={registerLoading}
                required
              />
            </div>

            {registerRole === "student" ? (
              <>
                <div className="login-field">
                  <label className="login-label" htmlFor="register-student-id">
                    学号
                  </label>
                  <input
                    id="register-student-id"
                    className="login-input"
                    value={registerProfile.studentId}
                    onChange={(event) =>
                      setRegisterProfile((current) => ({
                        ...current,
                        studentId: event.target.value,
                      }))
                    }
                    inputMode="numeric"
                    pattern="[0-9]{1,20}"
                    disabled={registerLoading}
                    required
                  />
                </div>
                <div className="login-profile-fields">
                  <div className="login-field">
                    <label className="login-label" htmlFor="register-gender">
                      性别
                    </label>
                    <select
                      id="register-gender"
                      className="login-input login-select"
                      value={registerProfile.gender}
                      onChange={(event) =>
                        setRegisterProfile((current) => ({
                          ...current,
                          gender: event.target.value,
                        }))
                      }
                      disabled={registerLoading}
                      required
                    >
                      <option value="">请选择</option>
                      {REGISTER_GENDER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="register-grade">
                      年级
                    </label>
                    <select
                      id="register-grade"
                      className="login-input login-select"
                      value={registerProfile.grade}
                      onChange={(event) =>
                        setRegisterProfile((current) => ({
                          ...current,
                          grade: event.target.value,
                        }))
                      }
                      disabled={registerLoading}
                      required
                    >
                      <option value="">请选择</option>
                      {REGISTER_GRADE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="register-class-name">
                    班级
                  </label>
                  <input
                    id="register-class-name"
                    className="login-input"
                    value={registerProfile.className}
                    onChange={(event) =>
                      setRegisterProfile((current) => ({
                        ...current,
                        className: event.target.value,
                      }))
                    }
                    placeholder="例如：810班"
                    disabled={registerLoading}
                    required
                  />
                </div>
              </>
            ) : null}

            <div className="login-field">
              <label className="login-label" htmlFor="register-invite-code">
                {registerRole === "teacher"
                  ? "教师邀请码"
                  : "结对编程课堂邀请码"}
              </label>
              <input
                id="register-invite-code"
                className="login-input"
                type="password"
                value={registerInviteCode}
                onChange={(event) => setRegisterInviteCode(event.target.value)}
                placeholder={
                  registerRole === "teacher"
                    ? "请向系统管理员获取"
                    : "请向施高俊老师获取"
                }
                autoComplete="off"
                disabled={registerLoading}
              />
              <p className="login-field-note">
                {registerRole === "teacher"
                  ? "教师邀请码属于管理权限凭证，请勿转发。"
                  : "提交后会进入待确认列表，教师绑定后才能登录。"}
              </p>
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
                {registerLoading ? "注册中…" : "提交注册"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      ) : null}

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

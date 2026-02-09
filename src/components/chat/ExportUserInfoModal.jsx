export default function ExportUserInfoModal({
  open,
  userInfo,
  errors,
  genderOptions,
  gradeOptions,
  onClose,
  onSubmit,
  onFieldChange,
  title = "用户信息",
  hint = "导出前需要完整填写并确认用户信息。",
  submitLabel = "保存并导出",
  showCancel = true,
  lockOverlayClose = false,
  dialogLabel = "用户信息",
}) {
  if (!open) return null;

  function handleOverlayClick() {
    if (lockOverlayClose) return;
    onClose?.();
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={handleOverlayClick}>
      <div
        className="group-modal user-info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="group-modal-title">{title}</h3>
        {hint ? <p className="group-modal-inline-hint">{hint}</p> : null}
        <form className="group-modal-form" onSubmit={onSubmit}>
          <label className="group-modal-label" htmlFor="export-user-info-name">
            姓名（仅汉字）
          </label>
          <input
            id="export-user-info-name"
            className="group-modal-input"
            value={userInfo.name}
            onChange={(e) => onFieldChange("name", e.target.value)}
            maxLength={20}
            placeholder="例如：张三"
            autoFocus
          />
          {errors.name && <p className="group-modal-error">{errors.name}</p>}

          <label className="group-modal-label" htmlFor="export-user-info-student-id">
            学号（仅数字，最多 20 位）
          </label>
          <input
            id="export-user-info-student-id"
            className="group-modal-input"
            value={userInfo.studentId}
            onChange={(e) =>
              onFieldChange("studentId", e.target.value.replace(/\D/g, "").slice(0, 20))
            }
            maxLength={20}
            inputMode="numeric"
            placeholder="例如：202601011234"
          />
          {errors.studentId && <p className="group-modal-error">{errors.studentId}</p>}

          <label className="group-modal-label" htmlFor="export-user-info-gender">
            性别
          </label>
          <select
            id="export-user-info-gender"
            className="group-modal-input"
            value={userInfo.gender}
            onChange={(e) => onFieldChange("gender", e.target.value)}
          >
            <option value="">请选择</option>
            {genderOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {errors.gender && <p className="group-modal-error">{errors.gender}</p>}

          <label className="group-modal-label" htmlFor="export-user-info-grade">
            年级
          </label>
          <select
            id="export-user-info-grade"
            className="group-modal-input"
            value={userInfo.grade}
            onChange={(e) => onFieldChange("grade", e.target.value)}
          >
            <option value="">请选择</option>
            {gradeOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {errors.grade && <p className="group-modal-error">{errors.grade}</p>}

          <label className="group-modal-label" htmlFor="export-user-info-class-name">
            班级
          </label>
          <input
            id="export-user-info-class-name"
            className="group-modal-input"
            value={userInfo.className}
            onChange={(e) => onFieldChange("className", e.target.value)}
            maxLength={40}
            placeholder="例如：高一（3）班"
          />
          {errors.className && <p className="group-modal-error">{errors.className}</p>}
          {errors._form && <p className="group-modal-error">{errors._form}</p>}

          <div className="group-modal-actions">
            {showCancel && (
              <button
                type="button"
                className="group-modal-btn group-modal-btn-secondary"
                onClick={onClose}
              >
                取消
              </button>
            )}
            <button type="submit" className="group-modal-btn group-modal-btn-primary">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

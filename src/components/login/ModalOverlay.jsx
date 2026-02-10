export default function ModalOverlay({
  title,
  subtitle = "",
  onClose,
  children,
  cardClassName = "",
}) {
  return (
    <div className="login-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`login-modal-card ${cardClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="login-modal-head">
          <h3 className="login-modal-title">{title}</h3>
          {subtitle ? <p className="login-modal-subtitle">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

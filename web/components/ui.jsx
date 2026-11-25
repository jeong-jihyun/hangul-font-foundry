"use client";
// 공통 부품 — 디자인 시스템 v1.1(Glyphroom) 규칙을 한 곳에 모아 둔 것.
// 모든 화면은 이 부품만 써서 모양·색·간격이 화면마다 달라지지 않게 한다.

// 상태 표시: 색만으로 구분하지 않도록 아이콘+글자를 함께 쓴다.
const STATUS = {
  success: { icon: "✓", cls: "chip-success" },
  warning: { icon: "△", cls: "chip-warning" },
  error: { icon: "✕", cls: "chip-error" },
  running: { icon: "◌", cls: "chip-running" },
  neutral: { icon: "", cls: "" },
};

export function StatusChip({ status = "neutral", children }) {
  const s = STATUS[status] || STATUS.neutral;
  return (
    <span className={"badge chip " + s.cls}>
      {s.icon && <span aria-hidden="true">{s.icon} </span>}
      {children}
    </span>
  );
}

export function PageHead({ eyebrow, title, desc, badge }) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {badge && <span className="badge">{badge}</span>}
    </div>
  );
}

export function Card({ title, aside, children, className = "" }) {
  return (
    <div className={"card " + className}>
      {(title || aside) && (
        <div className="cardhead">
          {title && <h3>{title}</h3>}
          {typeof aside === "string" ? <span className="muted">{aside}</span> : aside}
        </div>
      )}
      {children}
    </div>
  );
}

// 주요 버튼: 실행 중에는 눌러도 다시 실행되지 않게 막는다(중복 요청 방지).
export function Button({ children, onClick, loading = false, variant = "", disabled = false, type = "button" }) {
  return (
    <button type={type} className={"btn " + variant} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ id, label, help, error, children }) {
  return (
    <div className={"field" + (error ? " has-error" : "")}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="help error-text" role="alert">✕ {error}</div> : help && <div className="help">{help}</div>}
    </div>
  );
}

export function Result({ show, tone = "success", children }) {
  return (
    <div className={"result" + (show ? " show" : "") + (tone !== "success" ? " result-" + tone : "")} role="status">
      {children}
    </div>
  );
}

export function Notice({ children }) {
  return <div className="notice">{children}</div>;
}

// 산출물 한 줄: 형식 · 파일명 · 설명 · 오른쪽 동작
export function ArtifactRow({ type, name, desc, right }) {
  return (
    <div className="artifact">
      <div className="filetype">{type}</div>
      <div className="grow"><b className="ellipsis">{name}</b><small>{desc}</small></div>
      {right}
    </div>
  );
}

// 검수 문제 한 줄: 심각도 · 파일명 · 메시지 · 고치는 방법 순서
export function IssueRow({ severity = "error", file, message, suggestion }) {
  return (
    <div className="issue">
      <StatusChip status={severity === "error" ? "error" : "warning"}>{severity === "error" ? "오류" : "주의"}</StatusChip>
      <div className="grow">
        <b className="ellipsis mono">{file}</b>
        <small>{message}</small>
        {suggestion && <small className="fix">→ {suggestion}</small>}
      </div>
    </div>
  );
}

export function DemoBadge({ online = false, short = false }) {
  return online
    ? <span className="demo demo-online">● {short ? "ONLINE" : "ENGINE ONLINE"}</span>
    : <span className="demo">● {short ? "OFFLINE" : "DEMO · ENGINE OFFLINE"}</span>;
}

"use client";
// 홈: 실제 작업 상태로 '다음 할 일' 하나를 크게 보여 주고, 누르면 바로 그 화면(편집기 포함)으로 간다.
import { Button, StatusChip } from "./ui";

const REQUIRED = 2438;

// 흐름(10단계에서 단순화): ① 글자 그리기(앱 안 편집기, 또는 zip 올리기) ② 고칠 곳 고치기 ③ 폰트 만들기 ④ 받기
function plan(check, build, saved) {
  const s = check?.summary;
  const drawn = s ? s.passed + (s.errors ? 0 : 0) : saved || 0;
  const built = build?.status === "succeeded";
  const building = build && (build.status === "queued" || build.status === "running");
  const steps = [
    { n: 1, t: "글자 만들기", d: drawn ? `준비된 글자 ${drawn.toLocaleString()}자` : "손글씨 종이 사진 → 자동 조합 (또는 앱에서 직접 그리기)", done: drawn > 0 },
    { n: 2, t: "고칠 곳 고치기", d: s ? (s.errors ? `고칠 곳 ${s.errors}건` : "고칠 곳 없음 (저장할 때마다 자동 검수)") : "저장하면 자동으로 검수", done: !!s && s.errors === 0 },
    { n: 3, t: "폰트 만들기", d: building ? "만드는 중…" : built ? `${build.familyName} · ${build.glyphCount}자${build.allowMissing ? " (시험용)" : ""}` : "그린 글자로 TTF·견본 만들기", done: built },
    { n: 4, t: "받기·써 보기", d: built ? "폰트 파일 받기, 문장 써 보기" : "만든 폰트 설치·확인", done: false },
  ];
  let next;
  if (!s && !saved) next = { title: "손글씨 종이 1장부터 써 보세요", desc: "종이를 인쇄해 검은 펜으로 자음·모음을 쓰고 사진을 올리면, 1장만으로 192자(가·개·거·나…)가 바로 만들어져요. 6장이면 2,350자예요.", btn: "손글씨로 시작", to: "handwriting", alt: { btn: "앱에서 직접 그리기", act: { edit: "가" } }, step: 1 };
  else if (!s && saved) next = { title: `저장된 글자 ${saved.toLocaleString()}자가 있어요`, desc: "이어서 그리거나, 검수 탭에서 '검수 실행'을 누르면 저장된 글자를 불러와 바로 폰트를 만들 수 있어요.", btn: "다음 글자 그리기", act: { edit: "next" }, alt: { btn: "저장된 글자 검수", to: "check" }, step: 1 };
  else if (s.errors) next = { title: `고칠 곳 ${s.errors}건이 있어요`, desc: "문제 목록에서 이유를 보고, 그 글자를 편집기로 열어 고치거나 자동 정리된 파일로 다시 올리세요.", btn: "고칠 곳 보기", to: "check", step: 2 };
  else if (building) next = { title: "폰트를 만드는 중이에요", desc: "보통 수십 초면 끝나요. 진행 상황을 볼 수 있어요.", btn: "진행 상황 보기", to: "build", step: 3 };
  else if (!built) next = { title: s.passed < s.required ? `${s.passed}자로 시험용 폰트를 만들어 보세요` : "정식 폰트를 만들 수 있어요", desc: s.passed < s.required ? `필수 ${s.required.toLocaleString()}자 중 ${(s.required - s.passed).toLocaleString()}자가 아직 없지만, 있는 글자로 모양을 확인할 수 있어요.` : "모든 필수 글자가 준비됐어요.", btn: "폰트 만들기", to: "build", alt: { btn: "다음 글자 그리기", act: { edit: "next" } }, step: 3 };
  else next = { title: "만든 폰트를 받아 보세요", desc: "폰트 파일을 받아 설치하고, 화면에서 문장을 직접 써 볼 수 있어요.", btn: "받기·써 보기", to: "build", alt: { btn: "다음 글자 그리기", act: { edit: "next" } }, step: 4 };
  return { steps: steps.map((x) => ({ ...x, current: x.n === next.step })), next };
}

export function HomeScreen({ go, check, build, engine, openEditor, saved = 0, fontName }) {
  const { steps, next } = plan(check, build, saved);
  const run = (x) => (x.act?.edit ? openEditor(x.act.edit) : go(x.to));
  const s = check?.summary;
  const pct = s ? Math.round((s.passed / s.required) * 1000) / 10 : 0;
  return (
    <section className="screen active" id="home">
      <div className="welcome">
        <div>
          <h1>좋은 글자는<br />좋은 흐름에서 시작돼요.</h1>
          <p>글자를 그리고, 검수하고, 나만의 폰트로 완성하세요.</p>
        </div>
      </div>

      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow">다음 할 일{fontName ? ` · ${fontName}` : ""}</div>
          <h2>{next.title}</h2>
          <p>{next.desc}</p>
          <div className="row-gap">
            <Button onClick={() => run(next)}>{next.btn}&nbsp; ↗</Button>
            {next.alt && <Button variant="ghost" onClick={() => run(next.alt)}>{next.alt.btn}</Button>}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true"><span>{next.step}</span></div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-top">필수 글자 <span className="metric-icon">ㄱ</span></div>
          <strong>{(s?.required || REQUIRED).toLocaleString()}</strong><small>한글 2,350 + 숫자·영문·기호</small>
        </div>
        <div className="metric">
          <div className="metric-top">준비된 글자 <span className="metric-icon">▦</span></div>
          <strong>{s ? s.passed.toLocaleString() : saved.toLocaleString()}<span style={{ fontSize: 13, color: "#999" }}> · {s ? pct : Math.round((saved / REQUIRED) * 1000) / 10}%</span></strong><small>{s ? "마지막 검수 기준" : saved ? "GitHub에 저장된 글자" : "아직 그린 글자 없음"}</small>
        </div>
        <div className="metric">
          <div className="metric-top">고칠 곳 <span className="metric-icon">✓</span></div>
          <strong style={{ color: s?.errors ? "var(--danger)" : undefined }}>{s ? s.errors : "–"}</strong><small>{s ? (s.errors ? "검수 탭에서 확인" : "문제 없음") : "검수 전"}</small>
        </div>
      </div>

      <div className="section-title"><h2>작업 순서</h2><span>지금 {next.step}번째</span></div>
      <div className="panel">
        <ol className="flow">
          {steps.map((x) => (
            <li key={x.n} className={(x.done ? "done" : "") + (x.current ? " current" : "")}>
              <span className="num" aria-hidden="true">{x.done ? "✓" : x.n}</span>
              <span className="grow"><b>{x.t}</b><small>{x.d}</small></span>
              {x.current && <StatusChip status="running">지금</StatusChip>}
              {x.done && !x.current && <span className="sr-only">완료</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="section-title"><h2>최근 작업</h2></div>
      <div className="panel">
        {!check && !build && <p className="muted" style={{ margin: 0 }}>아직 작업이 없습니다. 위의 "다음 할 일"부터 시작해 보세요.</p>}
        {build && (
          <div className="activity"><div className="activity-icon">↗</div>
            <div className="grow"><b>폰트 만들기 · {build.familyName}</b><small>{new Date(build.finishedAt || build.createdAt).toLocaleString("ko-KR")}</small></div>
            {build.status === "succeeded" ? <StatusChip status="success">완료</StatusChip> : build.status === "failed" ? <StatusChip status="error">실패</StatusChip> : build.status === "cancelled" ? <StatusChip>취소</StatusChip> : <StatusChip status="running">진행 중</StatusChip>}
          </div>
        )}
        {check && (
          <div className="activity"><div className="activity-icon">✓</div>
            <div className="grow"><b>검수 · {check.fileName}</b><small>{new Date(check.checkedAt).toLocaleString("ko-KR")} · 준비 {s.passed}자</small></div>
            {s.errors ? <StatusChip status="error">고칠 곳 {s.errors}</StatusChip> : <StatusChip status="success">오류 0</StatusChip>}
          </div>
        )}
      </div>
      {engine.status !== "online" && <p className="muted" style={{ margin: "12px 4px 0" }}>엔진 상태: {engine.status === "offline" ? "연결 안 됨 — 설정 탭에서 다시 확인" : "확인 중·깨우는 중"}</p>}
    </section>
  );
}

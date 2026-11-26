"use client";
// 홈: 실제 작업 상태로 '지금 몇 번째 단계인지'와 '다음 할 일' 하나를 크게 보여 준다.
import { Button, StatusChip } from "./ui";

const REQUIRED = 2438;

function plan(check, build) {
  const s = check?.summary;
  const built = build?.status === "succeeded";
  const building = build && (build.status === "queued" || build.status === "running");
  const steps = [
    { n: 1, t: "글자 그리기", d: "템플릿에 그려 U+AC00.svg 처럼 저장", done: !!s },
    { n: 2, t: "올리기·검수", d: s ? `${check.fileName} · 준비 ${s.passed}자` : "zip으로 묶어 올리면 규칙을 검사", done: !!s },
    { n: 3, t: "고치기", d: s ? (s.errors ? `고칠 곳 ${s.errors}건` : "고칠 곳 없음") : "문제 글자만 고쳐 다시 올리기", done: !!s && s.errors === 0 },
    { n: 4, t: "폰트 만들기", d: building ? "만드는 중…" : built ? `${build.familyName} · ${build.glyphCount}자${build.allowMissing ? " (시험용)" : ""}` : "TTF·견본·초안 만들기", done: built },
    { n: 5, t: "받기·써 보기", d: built ? "폰트 파일 받기, 문장 써 보기" : "만든 폰트 설치·확인", done: false },
  ];
  // 다음 할 일 하나
  let next;
  if (!s) next = { title: "연습용 파일로 먼저 체험해 보세요", desc: "검수 탭의 '글리프 만드는 법'에서 연습용 zip을 받아 올리면 전체 흐름을 3분 안에 볼 수 있어요.", btn: "글자 올리러 가기", to: "check", step: 2 };
  else if (s.errors) next = { title: `고칠 곳 ${s.errors}건이 있어요`, desc: "문제 목록에서 고치는 법을 보고, 글리프 탭에서 그 글자만 고친 파일로 바꿔 올리세요.", btn: "고칠 곳 보기", to: "check", step: 3 };
  else if (building) next = { title: "폰트를 만드는 중이에요", desc: "보통 수십 초면 끝나요. 진행 상황을 볼 수 있어요.", btn: "진행 상황 보기", to: "build", step: 4 };
  else if (!built) next = { title: s.passed < s.required ? `${s.passed}자로 시험용 폰트를 만들어 보세요` : "정식 폰트를 만들 수 있어요", desc: s.passed < s.required ? `필수 ${s.required.toLocaleString()}자 중 ${(s.required - s.passed).toLocaleString()}자가 아직 없지만, 있는 글자로 모양을 확인할 수 있어요.` : "모든 필수 글자가 준비됐어요.", btn: "폰트 만들기", to: "build", step: 4 };
  else next = { title: "만든 폰트를 받아 보세요", desc: "폰트 파일을 받아 설치하고, 화면에서 문장을 직접 써 볼 수 있어요. 더 그릴 글자는 글리프 탭에서 확인하세요.", btn: "받기·써 보기", to: "build", step: 5 };
  const current = next.step;
  return { steps: steps.map((x) => ({ ...x, current: x.n === current })), next };
}

export function HomeScreen({ go, check, build, engine }) {
  const { steps, next } = plan(check, build);
  const s = check?.summary;
  const pct = s ? Math.round((s.passed / s.required) * 1000) / 10 : 0;
  return (
    <section className="screen active" id="home">
      <div className="welcome">
        <div>
          <div className="eyebrow">YOUR TYPE WORKSPACE</div>
          <h1>좋은 글자는<br />좋은 흐름에서 시작돼요.</h1>
          <p>글자를 그리고, 검수하고, 나만의 폰트로 완성하세요.</p>
        </div>
      </div>

      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow">다음 할 일 · 작업 순서 {next.step}번</div>
          <h2>{next.title}</h2>
          <p>{next.desc}</p>
          <Button onClick={() => go(next.to)}>{next.btn}&nbsp; ↗</Button>
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
          <strong>{s ? s.passed.toLocaleString() : 0}<span style={{ fontSize: 13, color: "#999" }}> · {pct}%</span></strong><small>{s ? "마지막 검수 기준" : "아직 올린 글자 없음"}</small>
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

      <div className="section-title"><h2>최근 작업</h2><span>RECENT</span></div>
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

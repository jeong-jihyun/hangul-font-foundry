"use client";
// 화면 위쪽 '지금 작업 중인 폰트' 막대: 로그인, 폰트 고르기·새로 만들기·이름 바꾸기·지우기
import { useState } from "react";
import { unlock, lock } from "../lib/store";
import { Button, Field, StatusChip } from "./ui";

export function ProjectBar({ auth, projects, current, onSelect, onCreate, onRename, onDelete, onUnlocked, saving, toast }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // new | rename | delete
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (auth.status === "off") return null; // 저장 설정 전에는 숨김
  if (auth.status === "loading") return <div className="projbar"><span className="muted">저장소 확인 중…</span></div>;

  if (auth.status === "out") {
    if (!open) {
      return (
        <button className="projbar out slim" onClick={() => setOpen(true)} aria-expanded="false">
          <span aria-hidden="true">🔒</span>
          <span className="grow"><b>폰트 저장 잠김</b><small>열면 만든 폰트를 GitHub에 저장하고 이어서 작업해요</small></span>
          <span className="linkish">열기</span>
        </button>
      );
    }
    return (
      <div className="projbar out">
        <div className="grow"><b>비밀번호(PIN) 넣기</b><small>숫자 6자리</small></div>
        <button type="button" className="xbtn" aria-label="닫기" onClick={() => { setOpen(false); setName(""); }}>✕</button>
        <form className="pinform" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try { await unlock(name.trim()); setName(""); setOpen(false); onUnlocked(); toast("들어왔어요"); }
          catch (err) { toast(err.message); }
          finally { setBusy(false); }
        }}>
          <input type="password" inputMode="numeric" autoComplete="current-password" placeholder="비밀번호(PIN)" aria-label="비밀번호(PIN)" value={name} onChange={(e) => setName(e.target.value)} maxLength={12} autoFocus />
          <Button type="submit" loading={busy}>열기</Button>
        </form>
      </div>
    );
  }

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast(msg); setMode(null); setName(""); }
    catch (e) { toast(e.message || "처리하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return (
    <div className="projbar">
      <button className="projbtn" onClick={() => { setOpen(!open); setMode(null); }} aria-expanded={open}>
        <small>작업 중인 폰트</small>
        <b>{current ? current.name : "폰트를 만들어 주세요"} <span aria-hidden="true">{open ? "▴" : "▾"}</span></b>
      </button>
      {saving && <StatusChip status="running">{saving}</StatusChip>}
      {open && (
        <div className="projpanel">
          <div className="projlist">
            {projects.length === 0 && <p className="muted" style={{ margin: 0 }}>아직 폰트가 없습니다. 아래에서 새로 만들어 주세요.</p>}
            {projects.map((p) => (
              <button key={p.id} className={"projitem" + (current?.id === p.id ? " active" : "")} onClick={() => { onSelect(p.id); setOpen(false); }}>
                <span className="grow"><b>{p.name}</b><small>저장된 글자 {p.glyphCount || 0}자</small></span>
                {current?.id === p.id && <StatusChip status="success">지금</StatusChip>}
              </button>
            ))}
          </div>
          {mode === "new" || mode === "rename" ? (
            <div className="projform">
              <Field id="projName" label={mode === "new" ? "새 폰트 이름" : "바꿀 이름"} help="예: 나의 고딕, 손글씨체">
                <input id="projName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
              </Field>
              <div className="row-gap">
                <Button loading={busy} onClick={() => {
                  if (!name.trim()) { toast("이름을 입력해 주세요."); return; }
                  act(() => (mode === "new" ? onCreate(name.trim()) : onRename(current.id, name.trim())), mode === "new" ? "새 폰트를 만들었어요" : "이름을 바꿨어요");
                }}>{mode === "new" ? "만들기" : "바꾸기"}</Button>
                <Button variant="light" onClick={() => setMode(null)}>취소</Button>
              </div>
            </div>
          ) : mode === "delete" ? (
            <div className="projform">
              <p className="warnbox">✕ <b>{current.name}</b>의 글자 {current.glyphCount || 0}자와 기록이 모두 지워지고 되돌릴 수 없습니다. 정말 지울까요?</p>
              <div className="row-gap">
                <Button loading={busy} onClick={() => act(() => onDelete(current.id), "폰트를 지웠어요")}>지우기</Button>
                <Button variant="light" onClick={() => setMode(null)}>취소</Button>
              </div>
            </div>
          ) : (
            <div className="projacts">
              <Button onClick={() => { setMode("new"); setName(""); }}>＋ 새 폰트</Button>
              {current && <Button variant="light" onClick={() => { setMode("rename"); setName(current.name); }}>이름 바꾸기</Button>}
              {current && <Button variant="light" onClick={() => setMode("delete")}>지우기</Button>}
              <Button variant="light" onClick={async () => { await lock(); onUnlocked(); }}>잠그기</Button>
            </div>
          )}
          <p className="muted" style={{ margin: "8px 0 0" }}>글자는 GitHub 비공개 저장소 hangul-font-glyphs 에 폰트별 폴더로 저장되고, 저장할 때마다 기록이 남습니다.</p>
        </div>
      )}
    </div>
  );
}

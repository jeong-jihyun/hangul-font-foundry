"use client";
// SVG-Edit(PC용 고급 편집기)로 같은 글자 열기. 다 고치면 '적용' → 앱 편집기로 돌아와 자동 정리.
// SVG-Edit 파일은 /public/svgedit 에 함께 올려 두어 같은 주소에서 열린다 (다른 사이트로 글자를 보내지 않음).
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

// 바닥선·틀을 안내선 레이어로 함께 넣는다 (id 가 guide 로 시작하면 글자로 읽지 않음)
const withGuides = (svg) => svg.replace(/<path /, '<g id="guide-layer"><rect id="guide-frame" x="0" y="0" width="1000" height="1000" fill="none" stroke="#b9b5aa" stroke-width="2"/><line id="guide-baseline" x1="0" y1="800" x2="1000" y2="800" stroke="#d85d3f" stroke-width="2"/></g>\n  <path fill="#000" ');

export function SvgEditModal({ svg, onApply, onClose, toast }) {
  const frame = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      const w = frame.current?.contentWindow;
      if (w?.glyphroomReady && w.svgEditor) {
        clearInterval(id);
        try { w.svgEditor.loadFromString(withGuides(svg || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><path d=""/></svg>'), { noAlert: true }); }
        catch { toast?.("SVG-Edit에 글자를 넣지 못했습니다."); }
        setReady(true);
      } else if (++n > 150) { clearInterval(id); toast?.("SVG-Edit를 열지 못했습니다. 새로고침 후 다시 시도해 주세요."); }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const apply = () => {
    const w = frame.current?.contentWindow;
    try { onApply(w.svgEditor.svgCanvas.getSvgString()); onClose(); }
    catch { toast?.("SVG-Edit에서 그림을 가져오지 못했습니다."); }
  };
  return (
    <div className="svgedit-modal" role="dialog" aria-label="SVG-Edit 편집">
      <div className="ed-top">
        <button className="ed-icon" onClick={onClose} aria-label="SVG-Edit 닫기">✕</button>
        <div className="ed-title"><b style={{ fontFamily: "inherit", fontSize: 15 }}>SVG-Edit</b><small>{ready ? "PC에서 쓰기 좋습니다 · 빨간 선 = 바닥선" : "여는 중…"}</small></div>
        <Button onClick={apply} disabled={!ready}>적용하고 돌아가기</Button>
      </div>
      <iframe ref={frame} src="/svgedit/glyph.html" title="SVG-Edit" className="svgedit-frame" />
    </div>
  );
}

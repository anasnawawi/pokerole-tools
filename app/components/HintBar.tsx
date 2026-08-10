"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The button-hint strip Gen 3 puts on every menu screen — a blue bar reading
 * things like "◆PICK  ◎OK  ◉CANCEL". The glyphs stand for the D-pad, A and B;
 * on the web the equivalents are pointer and keyboard, so the labels describe
 * what the screen does rather than naming console buttons.
 */
export type Hint = { key: string; label: string };

export default function HintBar({hints, align = "right"}:{hints:Hint[];align?:"left"|"right"}) {
  return (
    <div className="fr-bar" style={{
      display:"flex", alignItems:"center", gap:14, flexShrink:0,
      justifyContent: align === "right" ? "flex-end" : "flex-start",
      padding:"0 12px", height:22, borderTop:"2px solid #18305A",
      overflowX:"auto", overflowY:"hidden",
    }}>
      {hints.map(h=>(
        <span key={h.key+h.label} style={{display:"inline-flex",alignItems:"center",gap:3,whiteSpace:"nowrap",flexShrink:0}}>
          <span style={{fontSize:9,color:"#FFE070"}}>{h.key}</span>
          <span style={{fontSize:8,letterSpacing:"0.5px"}}>{h.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Wraps a scrollable list and overlays the red ▲/▼ chevrons Gen 3 shows when
 * there is more content off-screen. Each arrow appears only in the direction
 * that can actually be scrolled, so an unscrolled or short list shows none.
 */
export function ScrollList({children, style}:{children:React.ReactNode;style?:React.CSSProperties}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({up:false, down:false});

  useEffect(()=>{
    const el = ref.current;
    if (!el) return;
    const check = () => setMore({
      up: el.scrollTop > 2,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - 2,
    });
    check();
    el.addEventListener("scroll", check, {passive:true});
    // Content can change height without scrolling (filters, search).
    const ro = new ResizeObserver(check);
    ro.observe(el);
    Array.from(el.children).forEach(c=>ro.observe(c));
    return ()=>{el.removeEventListener("scroll", check); ro.disconnect();};
  },[children]);

  return (
    <div style={{position:"relative", flex:1, minHeight:0, display:"flex"}}>
      <div ref={ref} style={{flex:1, overflowY:"auto", minHeight:0, ...style}}>{children}</div>
      {more.up   && <span className="fr-arrow" style={{position:"absolute", top:2,    right:8, zIndex:2}}>▲</span>}
      {more.down && <span className="fr-arrow" style={{position:"absolute", bottom:2, right:8, zIndex:2}}>▼</span>}
    </div>
  );
}

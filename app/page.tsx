"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* The three groups the device pages between. */
const SECTIONS = [
  {
    id:"players", title:"TRAINER TOOLS", accent:"#2E9BD6",
    items:[
      {href:"/reference?tab=pokedex",icon:"📖",label:"Pokédex",desc:"Browse all 1025 Pokémon with stats, types, abilities and learnable moves."},
      {href:"/reference?tab=moves",icon:"⚡",label:"Moves",desc:"All 894 moves with power, accuracy, category and full effect text."},
      {href:"/reference?tab=abilities",icon:"✨",label:"Abilities",desc:"305 ability descriptions, including unique signature abilities."},
      {href:"/reference?tab=items",icon:"🎒",label:"Items",desc:"236 items by pocket, with costs and give-to-party support."},
      {href:"/characters",icon:"👤",label:"Characters",desc:"Build trainers and their Pokémon party, saved automatically."},
    ],
  },
  {
    id:"gm", title:"GAME MASTER", accent:"#E8543C",
    items:[
      {href:"/gm-screen",icon:"🖥️",label:"GM Screen",desc:"A modular panel grid you arrange yourself, with shareable layouts."},
      {href:"/encounter",icon:"🌿",label:"Encounters",desc:"Roll random wild encounters by habitat and rank."},
      {href:"/battle-tracker",icon:"⚔️",label:"Battle",desc:"Full initiative and combat on a FireRed battle stage."},
    ],
  },
  {
    id:"rules", title:"RULES DATA", accent:"#E8A81C",
    items:[
      {href:"/reference/quick-ref",icon:"📚",label:"Quick Ref",desc:"Roll rules, difficulty, damage and the pain penalty at a glance."},
      {href:"/reference?tab=types",icon:"🔣",label:"Type Chart",desc:"The full defensive effectiveness matrix for every type."},
      {href:"/reference?tab=status",icon:"💢",label:"Status",desc:"Every status effect and exactly what it does each round."},
      {href:"/reference?tab=weather",icon:"🌤️",label:"Weather",desc:"Weather and terrain, and how each changes a battle."},
    ],
  },
];

/* Every app on one home screen, the way a PDA shows them. Each keeps its
   section so the grid can stay colour-coded and grouped. */
const APPS = SECTIONS.flatMap((s,si)=>s.items.map(it=>({...it,si,accent:s.accent})));

/* Palette lifted from the reference illustration: a crimson shell with a
   darker tone for moulded edges, navy for the hard chrome, cyan for the
   display and keys, and a single yellow accent bar. */
const C = {
  shell:      "#DC1B4B",
  shellDark:  "#A81038",
  shellDeep:  "#7E0A28",
  outline:    "#2A0812",
  navy:       "#18203C",
  navyLight:  "#28325A",
  cyan:       "#6FDCF0",
  cyanDeep:   "#38BEDA",
  cyanPale:   "#BFF1FA",
  yellow:     "#F5D33F",
  grey:       "#C9CFDA",
  bezel:      "#EDF0F4",
  cream:      "#F7E7B6",
};

export default function Home() {
  const router = useRouter();
  const [idx,setIdx] = useState(0);
  const [narrow,setNarrow] = useState(false);
  const [lamp,setLamp] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const entry = APPS[idx];
  const sec = entry.si;
  const cols = narrow ? 2 : 3;

  useEffect(()=>{
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  },[]);

  // The three indicator lamps cycle, so the device reads as powered on.
  useEffect(()=>{
    const t = setInterval(()=>setLamp(l=>(l+1)%3), 900);
    return ()=>clearInterval(t);
  },[]);

  const pickSection = useCallback((n:number)=>{
    const s = ((n % SECTIONS.length) + SECTIONS.length) % SECTIONS.length;
    setIdx(APPS.findIndex(a=>a.si===s));
  },[]);
  const step = useCallback((d:number)=>{
    setIdx(i=>((i + d) % APPS.length + APPS.length) % APPS.length);
  },[]);
  const stepRow = useCallback((d:number)=>{
    setIdx(i=>Math.max(0,Math.min(APPS.length-1, i + d*cols)));
  },[cols]);
  const open = useCallback(()=>{ router.push(APPS[idx].href); },[router,idx]);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="ArrowRight"){e.preventDefault();step(1);}
      else if(e.key==="ArrowLeft"){e.preventDefault();step(-1);}
      else if(e.key==="ArrowDown"){e.preventDefault();stepRow(1);}
      else if(e.key==="ArrowUp"){e.preventDefault();stepRow(-1);}
      else if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[step,stepRow,open]);

  useEffect(()=>{
    gridRef.current?.querySelector<HTMLElement>('[data-on="true"]')?.scrollIntoView({block:"nearest"});
  },[idx]);

  /* ── Shared chrome pieces ──────────────────────────────────────────────── */
  const dpadArm:React.CSSProperties = {
    background:C.navy,border:`2px solid ${C.outline}`,color:"#FFFFFF",
    display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:narrow?11:13,lineHeight:1,padding:0,cursor:"pointer",touchAction:"manipulation",
  };
  const dpadCell = narrow ? 26 : 30;

  return (
    /* The device fills the window, sitting on the cream ground from the
       reference so its moulded outline reads as a physical edge. dvh so a
       mobile URL bar can't push the controls out of reach. */
    <div style={{height:"100dvh",width:"100vw",overflow:"hidden",display:"flex",
      background:C.cream,padding:narrow?8:16,
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:narrow?"column":"row",
        background:C.shell,border:`4px solid ${C.outline}`,borderRadius:16,
        boxShadow:`0 6px 0 ${C.shellDeep}, 0 10px 24px rgba(0,0,0,0.3)`,overflow:"hidden"}}>

        {/* ── LEFT HALF — lens, lamps, display, D-pad ─────────────────────── */}
        {/* Stacked, this half takes the space that's left rather than its
            natural height — at `0 0 auto` the display's own height pushed the
            right half clean off the bottom of the viewport. */}
        <div style={{flex:narrow?"1 1 0":"1 1 58%",minWidth:0,minHeight:0,
          display:"flex",flexDirection:"column",gap:narrow?8:12,
          padding:narrow?10:18,
          /* The clamshell seam: a darker band down the hinge side (or along
             the bottom when stacked), which is what makes the two halves read
             as separate moulded parts rather than one flat rectangle. */
          borderRight:narrow?"none":`4px solid ${C.shellDeep}`,
          borderBottom:narrow?`4px solid ${C.shellDeep}`:"none"}}>

          {/* Lens + indicator lamps */}
          <div style={{display:"flex",alignItems:"center",gap:narrow?10:14,flexShrink:0}}>
            <div style={{width:narrow?38:54,height:narrow?38:54,borderRadius:"50%",flexShrink:0,
              background:C.bezel,border:`3px solid ${C.outline}`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:"68%",height:"68%",borderRadius:"50%",position:"relative",
                background:`radial-gradient(circle at 34% 30%, #BFF1FA 0%, ${C.cyan} 45%, ${C.cyanDeep} 100%)`,
                border:`2px solid ${C.outline}`}}>
                <span style={{position:"absolute",top:"14%",left:"18%",width:"26%",height:"18%",
                  borderRadius:"50%",background:"rgba(255,255,255,0.9)"}}/>
              </div>
            </div>
            {/* Lamps cycle so the unit looks powered rather than static */}
            <div style={{display:"flex",gap:narrow?6:8}}>
              {["#F2544F","#F5D33F","#5BD07A"].map((col,i)=>(
                <span key={col} style={{width:narrow?11:14,height:narrow?11:14,borderRadius:"50%",
                  background:col,border:`2px solid ${C.outline}`,
                  opacity:lamp===i?1:0.45,transition:"opacity 200ms"}}/>
              ))}
            </div>
          </div>

          {/* ── Display ──────────────────────────────────────────────────── */}
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",
            background:C.bezel,border:`3px solid ${C.outline}`,borderRadius:10,
            padding:narrow?6:8,position:"relative"}}>
            {/* Two dots on the bezel, as on the reference's screen housing */}
            <div style={{display:"flex",gap:5,paddingBottom:5,flexShrink:0}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:C.navy,opacity:0.5}}/>
              <span style={{width:5,height:5,borderRadius:"50%",background:C.navy,opacity:0.5}}/>
            </div>

            <div style={{flex:1,minHeight:0,position:"relative",overflow:"hidden",borderRadius:5,
              border:`2px solid ${C.outline}`,background:`linear-gradient(160deg, ${C.cyanPale} 0%, ${C.cyan} 55%, ${C.cyanDeep} 100%)`}}>
              {/* Diagonal glass streaks from the reference — decorative only */}
              <div aria-hidden style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",
                background:"repeating-linear-gradient(115deg, rgba(255,255,255,0.30) 0px, rgba(255,255,255,0.30) 14px, transparent 14px, transparent 52px)"}}/>

              {/* App grid */}
              <div ref={gridRef} style={{position:"relative",zIndex:1,height:"100%",overflowY:"auto",
                padding:narrow?8:12,display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,
                gap:narrow?7:10,alignContent:"start"}}>
                {APPS.map((it,i)=>{
                  const on = i===idx;
                  const first = i===0 || APPS[i-1].si!==it.si;
                  return (
                    <div key={it.href} style={{gridColumn:first?"1 / -1":undefined,display:"contents"}}>
                      {first&&(
                        <div style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:6,
                          margin:i===0?0:"6px 0 0"}}>
                          <span style={{width:8,height:8,borderRadius:2,background:it.accent,border:`2px solid ${C.outline}`}}/>
                          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:8,color:C.navy}}>
                            {SECTIONS[it.si].title}
                          </span>
                          <span style={{flex:1,height:2,background:"rgba(24,32,60,0.25)"}}/>
                        </div>
                      )}
                      <button data-on={on} onClick={()=>setIdx(i)} onDoubleClick={open}
                        aria-label={it.label} aria-current={on}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,
                          padding:narrow?"8px 4px":"11px 6px",cursor:"pointer",touchAction:"manipulation",
                          borderRadius:8,background:on?C.navy:"#FFFFFF",
                          border:`2px solid ${on?C.outline:"rgba(24,32,60,0.35)"}`,
                          boxShadow:on?`0 0 0 2px ${C.yellow}`:"0 2px 0 rgba(24,32,60,0.18)"}}>
                        <span style={{fontSize:narrow?18:24,lineHeight:1}}>{it.icon}</span>
                        <span style={{fontSize:narrow?9:11,fontWeight:700,textAlign:"center",lineHeight:1.25,
                          color:on?"#FFFFFF":C.navy}}>{it.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Speaker rules + status dot beneath the screen */}
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:6,flexShrink:0}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:"#F2544F",border:`2px solid ${C.outline}`}}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
                {[1,2,3].map(n=><span key={n} style={{width:n===3?"40%":"55%",height:2,background:C.navy,opacity:0.55}}/>)}
              </div>
            </div>
          </div>

          {/* ── Controls: round key, dashes, D-pad ───────────────────────── */}
          <div style={{display:"flex",alignItems:"center",gap:narrow?10:16,flexShrink:0}}>
            <button onClick={open} aria-label="Open selected tool"
              style={{width:narrow?38:46,height:narrow?38:46,borderRadius:"50%",flexShrink:0,cursor:"pointer",
                touchAction:"manipulation",border:`3px solid ${C.outline}`,
                background:`radial-gradient(circle at 34% 30%, #BFF1FA 0%, ${C.cyan} 50%, ${C.cyanDeep} 100%)`,
                boxShadow:`0 3px 0 ${C.shellDeep}`}}/>
            <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
              {[1,2].map(n=><span key={n} style={{width:narrow?20:26,height:4,borderRadius:2,background:C.navy,border:`1px solid ${C.outline}`}}/>)}
            </div>
            <div style={{flex:1}}/>
            {/* D-pad, drawn as the reference's solid cross */}
            <div style={{display:"grid",gridTemplateColumns:`repeat(3,${dpadCell}px)`,gridTemplateRows:`repeat(3,${dpadCell}px)`,flexShrink:0}}>
              <span/>
              <button aria-label="Up" onClick={()=>stepRow(-1)} style={{...dpadArm,borderRadius:"4px 4px 0 0",borderBottom:"none"}}>▲</button>
              <span/>
              <button aria-label="Previous" onClick={()=>step(-1)} style={{...dpadArm,borderRadius:"4px 0 0 4px",borderRight:"none"}}>◀</button>
              <span style={{background:C.navy,borderTop:`2px solid ${C.outline}`,borderBottom:`2px solid ${C.outline}`}}/>
              <button aria-label="Next" onClick={()=>step(1)} style={{...dpadArm,borderRadius:"0 4px 4px 0",borderLeft:"none"}}>▶</button>
              <span/>
              <button aria-label="Down" onClick={()=>stepRow(1)} style={{...dpadArm,borderRadius:"0 0 4px 4px",borderTop:"none"}}>▼</button>
              <span/>
            </div>
          </div>

          {/* Yellow accent bar */}
          <div style={{height:narrow?14:18,borderRadius:4,background:C.yellow,
            border:`3px solid ${C.outline}`,flexShrink:0}}/>
        </div>

        {/* ── RIGHT HALF — readout, category keys, actions ────────────────── */}
        {/* Stacked, this half is a compact strip sized to its own content
            (readout capped below), not a second flexible pane competing with
            the display for height. */}
        <div style={{flex:narrow?"0 0 auto":"1 1 42%",minWidth:0,minHeight:0,
          display:"flex",flexDirection:"column",gap:narrow?8:12,padding:narrow?10:18,
          background:`linear-gradient(180deg, ${C.shell} 0%, ${C.shellDark} 100%)`}}>

          {/* Striped navy header, as on the reference's right panel */}
          <div style={{flexShrink:0,height:narrow?30:40,borderRadius:6,border:`3px solid ${C.outline}`,
            background:`repeating-linear-gradient(115deg, ${C.navy} 0px, ${C.navy} 10px, ${C.navyLight} 10px, ${C.navyLight} 20px)`,
            display:"flex",alignItems:"center",padding:"0 10px"}}>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:9,color:"#FFFFFF"}}>
              {SECTIONS[sec].title}
            </span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:9,color:C.yellow}}>
              {idx+1}/{APPS.length}
            </span>
          </div>

          {/* Cyan key row — one per section, jumps straight to it */}
          <div style={{display:"flex",gap:narrow?6:8,flexShrink:0}}>
            {SECTIONS.map((s,i)=>(
              <button key={s.id} onClick={()=>pickSection(i)} title={s.title} aria-label={s.title}
                style={{flex:1,height:narrow?28:34,borderRadius:5,cursor:"pointer",touchAction:"manipulation",
                  border:`3px solid ${C.outline}`,
                  background:i===sec?C.yellow:C.cyan,
                  boxShadow:i===sec?`inset 0 0 0 2px #FFFFFF`:"none"}}/>
            ))}
          </div>

          {/* Selected-tool readout */}
          <div style={{flex:narrow?"0 0 auto":"1",minHeight:0,maxHeight:narrow?110:undefined,
            borderRadius:6,border:`3px solid ${C.outline}`,
            background:C.bezel,padding:narrow?10:14,display:"flex",flexDirection:"column",gap:8,overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <span style={{fontSize:narrow?24:30,lineHeight:1}}>{entry.icon}</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?9:11,color:C.navy,lineHeight:1.5}}>
                {entry.label}
              </span>
            </div>
            <p style={{fontSize:narrow?12:13,lineHeight:1.6,color:"#2B3350",margin:0}}>{entry.desc}</p>
          </div>

          {/* Action row: grey keys as hints, navy OPEN as the live control */}
          <div style={{display:"flex",gap:narrow?6:8,flexShrink:0,alignItems:"center"}}>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {["◆","▲▼"].map(k=>(
                <span key={k} style={{minWidth:narrow?30:38,height:narrow?24:30,borderRadius:4,
                  border:`3px solid ${C.outline}`,background:C.grey,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:narrow?8:10,color:C.navy}}>{k}</span>
              ))}
            </div>
            <button onClick={open}
              style={{flex:1,height:narrow?32:40,borderRadius:5,cursor:"pointer",touchAction:"manipulation",
                border:`3px solid ${C.outline}`,background:C.navy,color:"#FFFFFF",
                fontFamily:"'Press Start 2P',monospace",fontSize:narrow?9:11,
                boxShadow:`0 3px 0 ${C.shellDeep}`}}>OPEN</button>
            <span style={{width:narrow?12:14,height:narrow?12:14,borderRadius:"50%",flexShrink:0,
              background:C.yellow,border:`2px solid ${C.outline}`}}/>
          </div>
        </div>
      </div>
    </div>
  );
}

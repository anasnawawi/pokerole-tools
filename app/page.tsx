"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* The three home-screen pages of the device. */
const SECTIONS = [
  {
    id:"players", title:"TRAINER TOOLS", accent:"#1E7BB0",
    items:[
      {href:"/reference?tab=pokedex",icon:"📖",label:"Pokédex",desc:"Browse all 1025 Pokémon with stats, types, abilities and learnable moves."},
      {href:"/reference?tab=moves",icon:"⚡",label:"Moves",desc:"All 894 moves with power, accuracy, category and full effect text."},
      {href:"/reference?tab=abilities",icon:"✨",label:"Abilities",desc:"305 ability descriptions, including unique signature abilities."},
      {href:"/reference?tab=items",icon:"🎒",label:"Items",desc:"236 items by pocket, with costs and give-to-party support."},
      {href:"/characters",icon:"👤",label:"Characters",desc:"Build trainers and their Pokémon party, saved automatically."},
    ],
  },
  {
    id:"gm", title:"GAME MASTER", accent:"#C43A24",
    items:[
      {href:"/gm-screen",icon:"🖥️",label:"GM Screen",desc:"A modular panel grid you arrange yourself, with shareable layouts."},
      {href:"/encounter",icon:"🌿",label:"Encounters",desc:"Roll random wild encounters by habitat and rank."},
      {href:"/battle-tracker",icon:"⚔️",label:"Battle",desc:"Full initiative and combat on a FireRed battle stage."},
    ],
  },
  {
    id:"rules", title:"RULES DATA", accent:"#9A6E00",
    items:[
      {href:"/reference/quick-ref",icon:"📚",label:"Quick Ref",desc:"Roll rules, difficulty, damage and the pain penalty at a glance."},
      {href:"/reference?tab=types",icon:"🔣",label:"Type Chart",desc:"The full defensive effectiveness matrix for every type."},
      {href:"/reference?tab=status",icon:"💢",label:"Status",desc:"Every status effect and exactly what it does each round."},
      {href:"/reference?tab=weather",icon:"🌤️",label:"Weather",desc:"Weather and terrain, and how each changes a battle."},
    ],
  },
];

/* Rotom's face sits at the top of the panel. The pupils drift toward whichever
   column is selected, and it blinks on its own, so the device reads as alive
   rather than as a static frame. */
function RotomFace({look,blink}:{look:number;blink:boolean}) {
  const eye = (
    <span style={{position:"relative",width:34,height:blink?4:30,borderRadius:blink?3:"50%",
      background:"#F8FDFF",border:"3px solid #0E2E42",transition:"height 90ms, border-radius 90ms",
      display:"inline-flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      {!blink&&(
        <span style={{position:"absolute",width:13,height:13,borderRadius:"50%",background:"#0E2E42",
          transform:`translateX(${look*5}px)`,transition:"transform 140ms ease"}}/>
      )}
    </span>
  );
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"6px 0 4px",flexShrink:0}}>
      {eye}
      {/* Mouth */}
      <span style={{width:26,height:12,borderTop:"none",border:"3px solid #0E2E42",borderTopColor:"transparent",
        borderRadius:"0 0 16px 16px",background:"#F26A4B"}}/>
      {eye}
    </div>
  );
}

/* Every app on one home screen, the way a PDA shows them — paging through
   three near-empty screens made the panel feel unfinished. Each app keeps its
   section so the grid can stay colour-coded and grouped. */
const APPS = SECTIONS.flatMap((s,si)=>s.items.map(it=>({...it,si,accent:s.accent})));

export default function Home() {
  const router = useRouter();
  const [idx,setIdx] = useState(0);
  const [blink,setBlink] = useState(false);
  const [narrow,setNarrow] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const entry = APPS[idx];
  const sec = entry.si;
  const section = SECTIONS[sec];
  const cols = narrow ? 3 : 4;

  useEffect(()=>{
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  },[]);

  // Blink on a loop, with the eye shut only briefly.
  useEffect(()=>{
    let shut:ReturnType<typeof setTimeout>;
    const t = setInterval(()=>{
      setBlink(true);
      shut = setTimeout(()=>setBlink(false),130);
    },3400);
    return ()=>{clearInterval(t);clearTimeout(shut);};
  },[]);

  /* Jump the selection to the first app of the neighbouring section. */
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
  },[idx,sec]);

  // -1 / 0 / +1 depending on which side of the grid the selection sits.
  const look = (idx % cols) / Math.max(1, cols-1) * 2 - 1;

  const pageBtn:React.CSSProperties = {
    width:narrow?40:44,height:narrow?40:44,borderRadius:"50%",flexShrink:0,cursor:"pointer",touchAction:"manipulation",
    background:"linear-gradient(180deg,#FFFFFF 0%,#D6E8F4 100%)",border:"3px solid #0E2E42",
    color:"#0E2E42",fontSize:15,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",
    boxShadow:"0 3px 0 rgba(0,0,0,0.3)",
  };

  return (
    /* Rotom's plasma-orange chassis is the window itself. dvh so a mobile URL
       bar can't push the controls out of reach. */
    <div style={{height:"100dvh",width:"100vw",overflow:"hidden",display:"flex",flexDirection:"column",
      background:"linear-gradient(160deg,#FF9A45 0%,#F4762A 40%,#DE5A1C 72%,#B8420E 100%)",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      padding:narrow?"8px 8px 10px":"14px 18px 16px",gap:narrow?8:12,
      boxShadow:"inset 0 3px 0 rgba(255,255,255,0.28), inset 0 -8px 20px rgba(0,0,0,0.4), inset 0 0 0 4px #0E2E42"}}>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <div style={{background:"#0E2E42",borderRadius:16,padding:narrow?7:10,flex:1,minHeight:0,display:"flex",flexDirection:"column",
        boxShadow:"inset 0 2px 6px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.14)"}}>
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",
          borderRadius:11,border:"2px solid #071B28",background:"linear-gradient(180deg,#EAF6FF 0%,#D2E9F8 100%)"}}>

          <RotomFace look={look} blink={blink}/>

          {/* Page title + page dots */}
          <div style={{display:"flex",alignItems:"center",gap:9,flexShrink:0,margin:"0 8px",
            background:section.accent,borderRadius:8,padding:"5px 10px",border:"2px solid #0E2E42"}}>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?8:10,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.5)"}}>{section.title}</span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:9,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.5)"}}>
              {idx+1}/{APPS.length}
            </span>
            {/* Dots track which section holds the selection */}
            <div style={{display:"flex",gap:5}}>
              {SECTIONS.map((s,i)=>(
                <span key={s.id} style={{width:8,height:8,borderRadius:"50%",border:"2px solid #0E2E42",
                  background:i===sec?"#FFFFFF":"rgba(0,0,0,0.28)"}}/>
              ))}
            </div>
          </div>

          {/* ── App grid ────────────────────────────────────────────────── */}
          <div ref={gridRef} style={{flex:1,minHeight:0,overflowY:"auto",padding:narrow?"9px 8px 12px":"12px 12px 16px",
            display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:narrow?8:12,alignContent:"start"}}>
            {APPS.map((it,i)=>{
              const on = i===idx;
              const first = i===0 || APPS[i-1].si!==it.si;
              return (
                <div key={it.href} style={{display:"contents"}}>
                  {/* Section label spans the row above its apps */}
                  {first&&(
                    <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8,margin:i===0?"0 2px 2px":"10px 2px 2px"}}>
                      <span style={{width:9,height:9,borderRadius:2,background:it.accent,border:"2px solid #0E2E42",flexShrink:0}}/>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:8,color:"#0E2E42"}}>{SECTIONS[it.si].title}</span>
                      <span style={{flex:1,height:2,background:"rgba(14,46,66,0.18)",borderRadius:1}}/>
                    </div>
                  )}
                  <button data-on={on} onClick={()=>setIdx(i)} onDoubleClick={open}
                    aria-label={it.label} aria-current={on}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,
                      padding:narrow?"9px 4px":"12px 6px",cursor:"pointer",touchAction:"manipulation",
                      borderRadius:14,background:on?it.accent:"#FFFFFF",
                      border:`3px solid ${on?"#0E2E42":"#A8C8DE"}`,
                      boxShadow:on?"0 0 0 3px rgba(255,255,255,0.9), 0 3px 0 rgba(0,0,0,0.28)":"0 3px 0 rgba(14,46,66,0.18)",
                      transform:on?"translateY(-1px)":"none",transition:"transform 90ms"}}>
                    <span style={{fontSize:narrow?22:30,lineHeight:1}}>{it.icon}</span>
                    <span style={{fontSize:narrow?9:11,fontWeight:700,textAlign:"center",lineHeight:1.25,
                      color:on?"#FFFFFF":"#0E2E42",textShadow:on?"1px 1px 0 rgba(0,0,0,0.4)":"none"}}>{it.label}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected-app readout */}
          <div style={{flexShrink:0,background:"#0E2E42",padding:narrow?"7px 10px":"9px 13px",
            display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?8:9,color:"#7DE8F8",marginBottom:4}}>{entry.label}</div>
              <div style={{fontSize:narrow?11:12,lineHeight:1.5,color:"#DCEEF8"}}>{entry.desc}</div>
            </div>
            <button onClick={open} style={{flexShrink:0,background:"#7DE8F8",color:"#062334",border:"2px solid #F8FDFF",
              borderRadius:8,padding:narrow?"7px 11px":"9px 15px",cursor:"pointer",touchAction:"manipulation",
              fontFamily:"'Press Start 2P',monospace",fontSize:9,boxShadow:"0 3px 0 rgba(0,0,0,0.35)"}}>OPEN</button>
          </div>
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"center",gap:narrow?10:14,flexShrink:0}}>
        <button aria-label="Previous page" onClick={()=>pickSection(sec-1)} style={pageBtn}>◀</button>
        <button aria-label="Next page" onClick={()=>pickSection(sec+1)} style={pageBtn}>▶</button>

        {/* Vents — soak up the spare width so the chassis reads as moulded */}
        <div style={{flex:1,minWidth:20,height:16,borderRadius:4,border:"2px solid #0E2E42",
          background:"repeating-linear-gradient(90deg,#C9581C 0px,#C9581C 5px,#A5430F 5px,#A5430F 10px)"}}/>

        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFE6D2",
          textShadow:"1px 1px 0 rgba(0,0,0,0.4)",whiteSpace:"nowrap",flexShrink:0}}>
          {narrow?"ROTOM-DEX":"ROTOM-DEX · POKéROLE 3.0"}
        </span>

        <button onClick={open} aria-label="Open selected tool"
          style={{width:narrow?52:58,height:narrow?52:58,borderRadius:"50%",flexShrink:0,cursor:"pointer",touchAction:"manipulation",
            background:"radial-gradient(circle at 34% 28%, #BFF4FF 0%, #7DE8F8 45%, #2E9BD6 100%)",
            border:"3px solid #0E2E42",boxShadow:"0 3px 0 rgba(0,0,0,0.35)",
            fontFamily:"'Press Start 2P',monospace",fontSize:14,color:"#062334"}}>A</button>
      </div>
    </div>
  );
}

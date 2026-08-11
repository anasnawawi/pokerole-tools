"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* The device's three "pages" — the category keys select between them. */
const SECTIONS = [
  {
    id:"players", title:"TRAINER TOOLS", accent:"#2858C0",
    items:[
      {href:"/reference?tab=pokedex",icon:"📖",label:"Pokédex",desc:"Browse all 1025 Pokémon with stats, types, abilities and learnable moves."},
      {href:"/reference?tab=moves",icon:"⚡",label:"Moves",desc:"All 894 moves with power, accuracy, category and full effect text."},
      {href:"/reference?tab=abilities",icon:"✨",label:"Abilities",desc:"305 ability descriptions, including unique signature abilities."},
      {href:"/reference?tab=items",icon:"🎒",label:"Items",desc:"236 items by pocket, with costs and give-to-party support."},
      {href:"/characters",icon:"👤",label:"Character Creator",desc:"Build trainers and their Pokémon party, saved automatically."},
    ],
  },
  {
    id:"gm", title:"GAME MASTER", accent:"#D82808",
    items:[
      {href:"/gm-screen",icon:"🖥️",label:"GM Screen",desc:"A modular panel grid you arrange yourself, with shareable layouts."},
      {href:"/encounter",icon:"🌿",label:"Encounter Generator",desc:"Roll random wild encounters by habitat and rank."},
      {href:"/battle-tracker",icon:"⚔️",label:"Battle Tracker",desc:"Full initiative and combat on a FireRed battle stage."},
    ],
  },
  {
    id:"rules", title:"RULES DATA", accent:"#B08808",
    items:[
      {href:"/reference/quick-ref",icon:"📚",label:"Quick Reference",desc:"Roll rules, difficulty, damage and the pain penalty at a glance."},
      {href:"/reference?tab=types",icon:"🔣",label:"Type Chart",desc:"The full defensive effectiveness matrix for every type."},
      {href:"/reference?tab=status",icon:"💢",label:"Status Conditions",desc:"Every status effect and exactly what it does each round."},
      {href:"/reference?tab=weather",icon:"🌤️",label:"Weather Effects",desc:"Weather and terrain, and how each changes a battle."},
    ],
  },
];

/* Faint horizontal banding, as on a backlit handheld panel. */
function Scanlines(){
  return <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,
    background:"repeating-linear-gradient(0deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 1px, transparent 1px, transparent 3px)"}}/>;
}

export default function Home() {
  const router = useRouter();
  const [sec,setSec] = useState(0);
  const [idx,setIdx] = useState(0);
  const [blink,setBlink] = useState(true);
  /* Below this the chassis switches to a portrait handheld: screen stacked
     over the controls, and the entry detail below the list rather than beside. */
  const [narrow,setNarrow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const section = SECTIONS[sec];
  const entry = section.items[idx];

  useEffect(()=>{const t=setInterval(()=>setBlink(b=>!b),600);return()=>clearInterval(t);},[]);

  useEffect(()=>{
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  },[]);

  const pickSection = useCallback((n:number)=>{
    setSec(((n % SECTIONS.length) + SECTIONS.length) % SECTIONS.length);
    setIdx(0);
  },[]);
  const move = useCallback((d:number)=>{
    setIdx(i=>{
      const len = SECTIONS[sec].items.length;
      return ((i + d) % len + len) % len;
    });
  },[sec]);
  const open = useCallback(()=>{ router.push(SECTIONS[sec].items[idx].href); },[router,sec,idx]);

  // The device is keyboard-driven, like the handheld it imitates.
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="ArrowDown"){e.preventDefault();move(1);}
      else if(e.key==="ArrowUp"){e.preventDefault();move(-1);}
      else if(e.key==="ArrowRight"){e.preventDefault();pickSection(sec+1);}
      else if(e.key==="ArrowLeft"){e.preventDefault();pickSection(sec-1);}
      else if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[move,pickSection,open,sec]);

  // Keep the cursor row in view when it moves off the visible part of the list.
  useEffect(()=>{
    listRef.current?.querySelector<HTMLElement>('[data-on="true"]')
      ?.scrollIntoView({block:"nearest"});
  },[idx,sec]);

  const dpadKey:React.CSSProperties = {
    background:"linear-gradient(180deg,#4A4A4A 0%,#282828 100%)",border:"2px solid #181818",
    color:"#F8F8F8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:13,lineHeight:1,padding:0,touchAction:"manipulation",
  };
  const dpadCell = narrow ? 30 : 26;

  return (
    /* The chassis is the whole window — no page background behind it, so the
       browser frame reads as the edge of the device. 100dvh rather than 100vh
       so mobile URL bars don't push the controls out of reach. */
    <div style={{height:"100dvh",width:"100vw",overflow:"hidden",display:"flex",flexDirection:"column",
      background:"linear-gradient(160deg,#F04030 0%,#D02010 45%,#A01608 75%,#7C1004 100%)",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      padding:narrow?"8px 8px 10px":"14px 18px 16px",gap:narrow?8:12,
      /* Moulded edge: highlight along the top, shadow into the corners. */
      boxShadow:"inset 0 3px 0 rgba(255,255,255,0.22), inset 0 -6px 18px rgba(0,0,0,0.45), inset 0 0 0 4px #181818"}}>

      {/* Lens, lamps, model plate */}
      <div style={{display:"flex",alignItems:"center",gap:narrow?9:12,flexShrink:0}}>
        <div style={{width:narrow?34:46,height:narrow?34:46,borderRadius:"50%",flexShrink:0,position:"relative",
          background:"radial-gradient(circle at 34% 28%, #D8F8FF 0%, #78C8F0 30%, #2878C0 68%, #184880 100%)",
          border:"4px solid #181818",boxShadow:"inset -3px -3px 6px rgba(0,30,60,0.5), 0 2px 0 rgba(0,0,0,0.35)"}}>
          <div style={{position:"absolute",top:6,left:9,width:10,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.85)",filter:"blur(1px)"}}/>
        </div>
        <div style={{display:"flex",gap:6}}>
          {["#F83838","#F8D030","#58D838"].map((c,i)=>(
            <div key={c} style={{width:11,height:11,borderRadius:"50%",background:c,border:"2px solid #181818",
              opacity:i===0&&!blink?0.45:1,boxShadow:"inset -1px -1px 2px rgba(0,0,0,0.35)"}}/>
          ))}
        </div>
        <div style={{flex:1}}/>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:8,color:"#FFD8CC",textShadow:"1px 1px 0 #7A1008",whiteSpace:"nowrap"}}>
          {narrow?"PKR-01":"POKéROLE TOOLS · MODEL PKR-01"}
        </span>
      </div>

      {/* ── Screen ────────────────────────────────────────────────────────── */}
      <div style={{background:"#181818",borderRadius:10,padding:narrow?6:9,flex:1,minHeight:0,display:"flex",flexDirection:"column",
        boxShadow:"inset 0 2px 5px rgba(0,0,0,0.7), 0 2px 0 rgba(255,255,255,0.10)"}}>
        <div style={{position:"relative",flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",
          borderRadius:5,border:"2px solid #0C1418",background:"#E8F4D8"}}>
          <Scanlines/>

          {/* Screen title bar */}
          <div style={{position:"relative",zIndex:3,display:"flex",alignItems:"center",gap:8,flexShrink:0,
            background:section.accent,padding:"6px 10px",borderBottom:"2px solid #181818"}}>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?8:10,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.55)"}}>{section.title}</span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:9,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.55)"}}>
              {idx+1}/{section.items.length}
            </span>
          </div>

          {/* Entry list + detail */}
          <div style={{position:"relative",zIndex:3,flex:1,minHeight:0,display:"flex",flexDirection:narrow?"column":"row"}}>
            {/* Portrait: the list takes only the height it needs (capped, so a
                long category still scrolls) and the entry fills the rest. */}
            <div ref={listRef} style={{
              width:narrow?"auto":"44%",minWidth:narrow?0:200,
              flex:narrow?"0 1 auto":"none",maxHeight:narrow?"52%":undefined,minHeight:0,
              borderRight:narrow?"none":"2px solid #A8B898",
              borderBottom:narrow?"2px solid #A8B898":"none",
              overflowY:"auto",padding:"5px 4px"}}>
              {section.items.map((it,i)=>{
                const on = i===idx;
                return (
                  <div key={it.href+it.label} data-on={on} onClick={()=>setIdx(i)} onDoubleClick={open}
                    style={{display:"flex",alignItems:"center",gap:6,padding:narrow?"8px 7px":"6px 7px",cursor:"pointer",borderRadius:3,
                      background:on?"#B8CCA0":"transparent",color:"#182818",touchAction:"manipulation"}}>
                    <span style={{width:10,flexShrink:0,fontSize:9,color:on?"#182818":"transparent"}}>▶</span>
                    <span style={{fontSize:15,flexShrink:0}}>{it.icon}</span>
                    <span style={{fontSize:13,fontWeight:on?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      textShadow:"1px 1px 0 rgba(255,255,255,0.6)"}}>{it.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Detail pane — the Pokédex "entry" for the highlighted tool */}
            <div style={{flex:1,minWidth:0,minHeight:0,padding:narrow?"9px 11px":"12px 14px",
              display:"flex",flexDirection:"column",gap:8,overflowY:"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <span style={{fontSize:narrow?24:30}}>{entry.icon}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?9:11,color:"#182818",lineHeight:1.5,
                  textShadow:"1px 1px 0 rgba(255,255,255,0.7)"}}>{entry.label}</span>
              </div>
              <p style={{fontSize:narrow?12:13,lineHeight:1.6,color:"#243424",margin:0}}>{entry.desc}</p>
              <button onClick={open}
                style={{alignSelf:"flex-start",marginTop:narrow?4:"auto",background:"#182818",color:"#E8F4D8",border:"2px solid #0C1408",
                  borderRadius:4,padding:"7px 14px",cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontSize:9,touchAction:"manipulation"}}>
                OPEN <span style={{opacity:blink?1:0.25}}>▶</span>
              </button>
            </div>
          </div>

          {/* In-screen hint strip */}
          <div style={{position:"relative",zIndex:3,flexShrink:0,display:"flex",gap:12,justifyContent:"flex-end",
            background:"#182818",padding:"4px 10px"}}>
            {[["◆","MOVE"],["Ⓐ","OPEN"],["◀▶","PAGE"]].map(([k,l])=>(
              <span key={l} style={{display:"inline-flex",gap:3,alignItems:"center",fontFamily:"'Press Start 2P',monospace"}}>
                <span style={{fontSize:8,color:"#F8D030"}}>{k}</span>
                <span style={{fontSize:7,color:"#E8F4D8"}}>{l}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"center",gap:narrow?10:16,flexShrink:0}}>
        {/* D-pad */}
        <div style={{display:"grid",gridTemplateColumns:`repeat(3,${dpadCell}px)`,gridTemplateRows:`repeat(3,${dpadCell}px)`,flexShrink:0}}>
          <span/>
          <button aria-label="Previous entry" onClick={()=>move(-1)} style={{...dpadKey,borderRadius:"5px 5px 0 0"}}>▲</button>
          <span/>
          <button aria-label="Previous category" onClick={()=>pickSection(sec-1)} style={{...dpadKey,borderRadius:"5px 0 0 5px"}}>◀</button>
          <span style={{background:"#282828",border:"2px solid #181818"}}/>
          <button aria-label="Next category" onClick={()=>pickSection(sec+1)} style={{...dpadKey,borderRadius:"0 5px 5px 0"}}>▶</button>
          <span/>
          <button aria-label="Next entry" onClick={()=>move(1)} style={{...dpadKey,borderRadius:"0 0 5px 5px"}}>▼</button>
          <span/>
        </div>

        {/* Category keys — each lamp jumps straight to that page */}
        <div style={{display:"flex",gap:narrow?8:9,flexShrink:0}}>
          {SECTIONS.map((s,i)=>(
            <button key={s.id} onClick={()=>pickSection(i)} title={s.title} aria-label={s.title}
              style={{width:narrow?30:30,height:narrow?30:30,borderRadius:"50%",background:s.accent,cursor:"pointer",touchAction:"manipulation",
                border:i===sec?"3px solid #F8F8E8":"3px solid #181818",
                boxShadow:i===sec?"0 0 0 2px #181818, 0 2px 0 rgba(0,0,0,0.3)":"inset -2px -2px 3px rgba(0,0,0,0.35), 0 2px 0 rgba(0,0,0,0.3)"}}/>
          ))}
        </div>

        {/* Speaker grille — soaks up the spare width so the chassis feels moulded */}
        <div style={{flex:1,minWidth:24,height:16,borderRadius:3,border:"2px solid #181818",
          background:"repeating-linear-gradient(90deg,#B02010 0px,#B02010 5px,#8C1408 5px,#8C1408 10px)"}}/>

        {/* A button */}
        <button onClick={open} aria-label="Open selected tool"
          style={{width:narrow?52:56,height:narrow?52:56,borderRadius:"50%",flexShrink:0,cursor:"pointer",touchAction:"manipulation",
            background:"radial-gradient(circle at 34% 28%, #78E8B0 0%, #38B878 45%, #187848 100%)",
            border:"3px solid #181818",boxShadow:"0 3px 0 rgba(0,0,0,0.35)",
            fontFamily:"'Press Start 2P',monospace",fontSize:14,color:"#08200F"}}>A</button>
      </div>
    </div>
  );
}

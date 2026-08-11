"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "./components/SiteNav";

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
  return <div style={{position:"absolute",inset:0,pointerEvents:"none",
    background:"repeating-linear-gradient(0deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 1px, transparent 1px, transparent 3px)"}}/>;
}

export default function Home() {
  const router = useRouter();
  const [sec,setSec] = useState(0);
  const [idx,setIdx] = useState(0);
  const [blink,setBlink] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const section = SECTIONS[sec];
  const entry = section.items[idx];

  useEffect(()=>{const t=setInterval(()=>setBlink(b=>!b),600);return()=>clearInterval(t);},[]);

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
    fontSize:11,lineHeight:1,padding:0,
  };

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",
      background:"linear-gradient(180deg,#B85030 0%,#68402C 45%,#3C281C 100%)",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <SiteNav/>

      <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"14px 16px"}}>
        {/* ── The Pokédex itself ─────────────────────────────────────────────── */}
        <div style={{width:"100%",maxWidth:900,maxHeight:"100%",display:"flex",flexDirection:"column",
          background:"linear-gradient(160deg,#F03828 0%,#D02010 55%,#981406 100%)",
          border:"4px solid #181818",borderRadius:20,boxShadow:"8px 10px 0 rgba(0,0,0,0.4)",padding:16}}>

          {/* Lens, lamps, model plate */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexShrink:0}}>
            <div style={{width:44,height:44,borderRadius:"50%",flexShrink:0,position:"relative",
              background:"radial-gradient(circle at 34% 28%, #D8F8FF 0%, #78C8F0 30%, #2878C0 68%, #184880 100%)",
              border:"4px solid #181818",boxShadow:"inset -3px -3px 6px rgba(0,30,60,0.5), 0 2px 0 rgba(0,0,0,0.3)"}}>
              <div style={{position:"absolute",top:7,left:10,width:11,height:7,borderRadius:"50%",background:"rgba(255,255,255,0.85)",filter:"blur(1px)"}}/>
            </div>
            <div style={{display:"flex",gap:6}}>
              {["#F83838","#F8D030","#58D838"].map((c,i)=>(
                <div key={c} style={{width:11,height:11,borderRadius:"50%",background:c,border:"2px solid #181818",
                  opacity:i===0&&!blink?0.45:1,boxShadow:"inset -1px -1px 2px rgba(0,0,0,0.35)"}}/>
              ))}
            </div>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FFD8CC",textShadow:"1px 1px 0 #7A1008"}}>MODEL PKR-01</span>
          </div>

          {/* ── Screen ──────────────────────────────────────────────────────── */}
          <div style={{background:"#181818",borderRadius:10,padding:8,flex:1,minHeight:0,display:"flex",flexDirection:"column",
            boxShadow:"inset 0 2px 4px rgba(0,0,0,0.6)"}}>
            <div style={{position:"relative",flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",
              borderRadius:5,border:"2px solid #0C1418",background:"#E8F4D8"}}>
              <Scanlines/>

              {/* Screen title bar */}
              <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:8,flexShrink:0,
                background:section.accent,padding:"5px 9px",borderBottom:"2px solid #181818"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.55)"}}>{section.title}</span>
                <div style={{flex:1}}/>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.55)"}}>
                  {idx+1}/{section.items.length}
                </span>
              </div>

              {/* Entry list + detail */}
              <div style={{position:"relative",zIndex:1,flex:1,minHeight:0,display:"flex"}}>
                <div ref={listRef} style={{width:"46%",minWidth:190,borderRight:"2px solid #A8B898",overflowY:"auto",padding:"5px 3px"}}>
                  {section.items.map((it,i)=>{
                    const on = i===idx;
                    return (
                      <div key={it.href+it.label} data-on={on} onClick={()=>setIdx(i)} onDoubleClick={open}
                        style={{display:"flex",alignItems:"center",gap:5,padding:"5px 6px",cursor:"pointer",borderRadius:3,
                          background:on?"#B8CCA0":"transparent",color:"#182818"}}>
                        <span style={{width:10,flexShrink:0,fontSize:9,color:on?"#182818":"transparent"}}>▶</span>
                        <span style={{fontSize:13,flexShrink:0}}>{it.icon}</span>
                        <span style={{fontSize:12,fontWeight:on?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          textShadow:"1px 1px 0 rgba(255,255,255,0.6)"}}>{it.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Detail pane — the Pokédex "entry" for the highlighted tool */}
                <div style={{flex:1,minWidth:0,padding:"10px 12px",display:"flex",flexDirection:"column",gap:7,overflowY:"auto"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:26}}>{entry.icon}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:"#182818",lineHeight:1.5,
                      textShadow:"1px 1px 0 rgba(255,255,255,0.7)"}}>{entry.label}</span>
                  </div>
                  <p style={{fontSize:12,lineHeight:1.6,color:"#243424",margin:0}}>{entry.desc}</p>
                  <button onClick={open}
                    style={{alignSelf:"flex-start",marginTop:"auto",background:"#182818",color:"#E8F4D8",border:"2px solid #0C1408",
                      borderRadius:4,padding:"5px 12px",cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontSize:9}}>
                    OPEN <span style={{opacity:blink?1:0.25}}>▶</span>
                  </button>
                </div>
              </div>

              {/* In-screen hint strip */}
              <div style={{position:"relative",zIndex:1,flexShrink:0,display:"flex",gap:12,justifyContent:"flex-end",
                background:"#182818",padding:"3px 9px"}}>
                {[["◆","MOVE"],["Ⓐ","OPEN"],["◀▶","PAGE"]].map(([k,l])=>(
                  <span key={l} style={{display:"inline-flex",gap:3,alignItems:"center",fontFamily:"'Press Start 2P',monospace"}}>
                    <span style={{fontSize:8,color:"#F8D030"}}>{k}</span>
                    <span style={{fontSize:7,color:"#E8F4D8"}}>{l}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Controls ────────────────────────────────────────────────────── */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginTop:12,flexShrink:0,flexWrap:"wrap"}}>
            {/* D-pad */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,20px)",gridTemplateRows:"repeat(3,20px)",flexShrink:0}}>
              <span/>
              <button aria-label="Previous entry" onClick={()=>move(-1)} style={{...dpadKey,borderRadius:"4px 4px 0 0"}}>▲</button>
              <span/>
              <button aria-label="Previous category" onClick={()=>pickSection(sec-1)} style={{...dpadKey,borderRadius:"4px 0 0 4px"}}>◀</button>
              <span style={{background:"#282828",border:"2px solid #181818"}}/>
              <button aria-label="Next category" onClick={()=>pickSection(sec+1)} style={{...dpadKey,borderRadius:"0 4px 4px 0"}}>▶</button>
              <span/>
              <button aria-label="Next entry" onClick={()=>move(1)} style={{...dpadKey,borderRadius:"0 0 4px 4px"}}>▼</button>
              <span/>
            </div>

            {/* Category keys — each lamp jumps straight to that page */}
            <div style={{display:"flex",gap:7,flexShrink:0}}>
              {SECTIONS.map((s,i)=>(
                <button key={s.id} onClick={()=>pickSection(i)} title={s.title}
                  style={{width:26,height:26,borderRadius:"50%",background:s.accent,cursor:"pointer",
                    border:i===sec?"3px solid #F8F8E8":"3px solid #181818",
                    boxShadow:i===sec?"0 0 0 2px #181818, 0 2px 0 rgba(0,0,0,0.3)":"inset -2px -2px 3px rgba(0,0,0,0.35), 0 2px 0 rgba(0,0,0,0.3)"}}/>
              ))}
            </div>

            {/* Speaker grille */}
            <div style={{flex:1,minWidth:60,height:14,borderRadius:3,border:"2px solid #181818",
              background:"repeating-linear-gradient(90deg,#B02010 0px,#B02010 5px,#8C1408 5px,#8C1408 10px)"}}/>

            {/* A button */}
            <button onClick={open} aria-label="Open selected tool"
              style={{width:44,height:44,borderRadius:"50%",flexShrink:0,cursor:"pointer",
                background:"radial-gradient(circle at 34% 28%, #78E8B0 0%, #38B878 45%, #187848 100%)",
                border:"3px solid #181818",boxShadow:"0 3px 0 rgba(0,0,0,0.35)",
                fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#0C2818"}}>A</button>
          </div>
        </div>
      </div>
    </div>
  );
}

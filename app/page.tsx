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

/* Rotom's face, following the Pokédex artwork: a black visor band carrying two
   large blue eyes, with a toothy grin sitting just below it. The pupils drift
   toward whichever column is selected and it blinks on its own, so the device
   reads as alive rather than as a static frame. */
/* Rotom's face, redrawn against the actual Pokédex artwork: both eyes sit
   inside one black band (not just a bridge between two separate rims), each
   eye is a bold white lens with a thick black ring and a blue iris, and the
   mouth is a small pale-blue bubble — much smaller than the eyes, not a wide
   grin. */
function RotomFace({look,blink,narrow}:{look:number;blink:boolean;narrow:boolean}) {
  const eyeD = narrow ? 30 : 40;
  /* Sized to hug the eyes rather than float around them with slack border. */
  const bandW = eyeD*2 + (narrow?24:32);
  const bandH = eyeD + (narrow?10:14);

  const eye = (side:-1|1) => (
    <span key={side} style={{position:"relative",width:eyeD,height:blink?5:eyeD,
      borderRadius:blink?3:"50%",background:"#FFFFFF",border:`${narrow?3:4}px solid #101010`,
      transition:"height 90ms",overflow:"hidden",flexShrink:0,
      display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
      {/* Iris stays mounted through a blink so the lid closes over it, rather
          than the eye flashing blank white for the length of the animation. */}
      <span style={{position:"absolute",width:eyeD*0.62,height:eyeD*0.62,borderRadius:"50%",
        background:"radial-gradient(circle at 34% 28%, #8FC2FF 0%, #3A72D8 48%, #14337F 100%)",
        border:"2px solid #0C2360",transform:`translateX(${look*(eyeD*0.12)}px)`,transition:"transform 140ms ease"}}/>
      <span style={{position:"absolute",width:eyeD*0.18,height:eyeD*0.18,borderRadius:"50%",background:"#FFFFFF",
        transform:`translate(${look*(eyeD*0.12)-eyeD*0.14}px, -${eyeD*0.13}px)`,transition:"transform 140ms ease"}}/>
    </span>
  );

  return (
    <div style={{position:"relative",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",
      alignSelf:"center",zIndex:2}}>
      {/* One black band the eyes sit inside, its lower edge dipping between
          them — not a thin bridge connecting two separate rims. */}
      <div style={{position:"relative",width:bandW,height:bandH,background:"#101010",
        borderRadius:"50% 50% 42% 42% / 60% 60% 40% 40%",
        display:"flex",alignItems:"center",justifyContent:"center",gap:narrow?6:9,
        boxShadow:"0 3px 0 rgba(0,0,0,0.3)"}}>
        {eye(-1)}
        {eye(1)}
      </div>
      {/* Mouth: a small pale-blue bubble tucked up against the band, as in the
          artwork, rather than floating below it with a gap. */}
      <div style={{marginTop:narrow?-3:-4,width:narrow?20:26,height:narrow?14:18,
        background:"linear-gradient(180deg,#EAF7FF 0%,#BFE6F8 100%)",border:"2px solid #101010",
        borderRadius:"45% 45% 50% 50% / 55% 55% 45% 45%"}}/>
    </div>
  );
}

/* The side vents/arms from the artwork. Decorative only, so they never
   intercept a tap meant for the panel. The top-corner prongs from the first
   pass are gone — the artwork's only top feature is a single antenna, which
   the chassis doesn't have room for above the face, so it's omitted rather
   than guessed at. */
function RotomBits({narrow}:{narrow:boolean}) {
  const vent = (side:"left"|"right"):React.CSSProperties => ({
    position:"absolute",top:"46%",[side]:narrow?1:8,
    width:narrow?28:52,height:narrow?58:92,
    background:"linear-gradient(150deg,#F8867A 0%,#E8524A 45%,#C7332A 100%)",
    filter:"drop-shadow(0 2px 0 rgba(0,0,0,0.35))",
    clipPath: side==="left"
      ? "polygon(0% 14%, 100% 0%, 100% 100%, 0% 86%)"
      : "polygon(100% 14%, 0% 0%, 0% 100%, 100% 86%)",
    display:"flex",alignItems:"center",justifyContent:"center",
  });
  const oval:React.CSSProperties = {
    width:narrow?12:18,height:narrow?22:32,borderRadius:"50%",
    background:"radial-gradient(circle at 40% 32%, #C8C8C8 0%, #8A8A8A 60%, #5E5E5E 100%)",
    border:"2px solid #101010",
  };
  return (
    <div aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
      <div style={vent("left")}><span style={oval}/></div>
      <div style={vent("right")}><span style={oval}/></div>
      {/* Rivet dots dusted over the shell */}
      {[[8,16],[15,72],[86,20],[92,66],[24,7],[74,6]].map(([l,t],i)=>(
        <span key={i} style={{position:"absolute",left:`${l}%`,top:`${t}%`,width:7,height:7,borderRadius:"50%",
          background:"#8E241C",border:"1px solid #5E140E",opacity:0.85}}/>
      ))}
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
    background:"linear-gradient(180deg,#FFFFFF 0%,#D6E8F4 100%)",border:"3px solid #101010",
    color:"#101010",fontSize:15,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",
    boxShadow:"0 3px 0 rgba(0,0,0,0.3)",
  };

  return (
    /* Rotom's coral-red shell is the window itself. dvh so a mobile URL bar
       can't push the controls out of reach. */
    <div style={{height:"100dvh",width:"100vw",overflow:"hidden",display:"flex",flexDirection:"column",position:"relative",
      background:"linear-gradient(160deg,#F4756A 0%,#E8524A 38%,#D0392F 70%,#A82A22 100%)",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      /* Generous side padding so the prongs and vents have shell to sit on —
         a thin frame hid them behind the panel entirely. */
      padding:narrow?"6px 34px 10px":"10px 74px 16px",gap:narrow?6:9,
      boxShadow:"inset 0 3px 0 rgba(255,255,255,0.28), inset 0 -8px 20px rgba(0,0,0,0.4), inset 0 0 0 4px #101010"}}>

      <RotomBits narrow={narrow}/>

      {/* Face sits on the shell, above the screen, as in the artwork */}
      <RotomFace look={look} blink={blink} narrow={narrow}/>

      {/* ── Panel — the white screen bezel with its cyan inner display ────── */}
      <div style={{background:"#FFFFFF",borderRadius:10,padding:narrow?6:9,flex:1,minHeight:0,display:"flex",flexDirection:"column",
        position:"relative",zIndex:1,border:"3px solid #101010",
        boxShadow:"inset 0 2px 6px rgba(0,0,0,0.18), 6px 7px 0 rgba(0,0,0,0.28)"}}>
        <div style={{position:"relative",flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",
          borderRadius:6,border:"2px solid #101010",background:"#FFFFFF"}}>

          {/* The screen motif: the cyan plate that sits inset on the white
              display in the artwork, its lower-right corner swept away. Purely
              a backdrop — the grid and readout draw over it. */}
          <div aria-hidden style={{position:"absolute",inset:narrow?6:10,zIndex:0,pointerEvents:"none",
            background:"linear-gradient(150deg,#D8F0FA 0%,#A8DCF0 45%,#7FC8E8 100%)",
            borderRadius:"14px 14px 14px 60px",
            clipPath:"polygon(0% 0%, 100% 0%, 100% 78%, 78% 100%, 0% 100%)"}}/>
          {/* Faint sheen across the plate, as on a glossy panel */}
          <div aria-hidden style={{position:"absolute",inset:narrow?6:10,zIndex:0,pointerEvents:"none",
            background:"linear-gradient(115deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%)",
            borderRadius:"14px 14px 14px 60px",
            clipPath:"polygon(0% 0%, 100% 0%, 100% 78%, 78% 100%, 0% 100%)"}}/>

          {/* Page title + page dots */}
          <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:9,flexShrink:0,margin:narrow?"10px 12px 0":"14px 18px 0",
            background:section.accent,borderRadius:8,padding:"5px 10px",border:"2px solid #101010"}}>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?8:10,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.5)"}}>{section.title}</span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:9,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.5)"}}>
              {idx+1}/{APPS.length}
            </span>
            {/* Dots track which section holds the selection */}
            <div style={{display:"flex",gap:5}}>
              {SECTIONS.map((s,i)=>(
                <span key={s.id} style={{width:8,height:8,borderRadius:"50%",border:"2px solid #101010",
                  background:i===sec?"#FFFFFF":"rgba(0,0,0,0.28)"}}/>
              ))}
            </div>
          </div>

          {/* ── App grid ────────────────────────────────────────────────── */}
          <div ref={gridRef} style={{position:"relative",zIndex:1,flex:1,minHeight:0,overflowY:"auto",
            padding:narrow?"9px 12px 12px":"12px 18px 16px",
            display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:narrow?8:12,alignContent:"start"}}>
            {APPS.map((it,i)=>{
              const on = i===idx;
              const first = i===0 || APPS[i-1].si!==it.si;
              return (
                <div key={it.href} style={{display:"contents"}}>
                  {/* Section label spans the row above its apps */}
                  {first&&(
                    <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8,margin:i===0?"0 2px 2px":"10px 2px 2px"}}>
                      <span style={{width:9,height:9,borderRadius:2,background:it.accent,border:"2px solid #101010",flexShrink:0}}/>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:8,color:"#101010"}}>{SECTIONS[it.si].title}</span>
                      <span style={{flex:1,height:2,background:"rgba(14,46,66,0.18)",borderRadius:1}}/>
                    </div>
                  )}
                  <button data-on={on} onClick={()=>setIdx(i)} onDoubleClick={open}
                    aria-label={it.label} aria-current={on}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,
                      padding:narrow?"9px 4px":"12px 6px",cursor:"pointer",touchAction:"manipulation",
                      borderRadius:14,background:on?it.accent:"#FFFFFF",
                      border:`3px solid ${on?"#101010":"#7FB8CE"}`,
                      boxShadow:on?"0 0 0 3px rgba(255,255,255,0.9), 0 3px 0 rgba(0,0,0,0.28)":"0 3px 0 rgba(14,46,66,0.18)",
                      transform:on?"translateY(-1px)":"none",transition:"transform 90ms"}}>
                    <span style={{fontSize:narrow?22:30,lineHeight:1}}>{it.icon}</span>
                    <span style={{fontSize:narrow?9:11,fontWeight:700,textAlign:"center",lineHeight:1.25,
                      color:on?"#FFFFFF":"#101010",textShadow:on?"1px 1px 0 rgba(0,0,0,0.4)":"none"}}>{it.label}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected-app readout */}
          <div style={{position:"relative",zIndex:1,flexShrink:0,background:"#101010",padding:narrow?"7px 10px":"9px 13px",
            display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?8:9,color:"#8FD8F0",marginBottom:4}}>{entry.label}</div>
              <div style={{fontSize:narrow?11:12,lineHeight:1.5,color:"#DCEEF8"}}>{entry.desc}</div>
            </div>
            <button onClick={open} style={{flexShrink:0,background:"#8FD8F0",color:"#0A2630",border:"2px solid #F8FDFF",
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
        <div style={{flex:1,minWidth:20,height:16,borderRadius:4,border:"2px solid #101010",
          background:"repeating-linear-gradient(90deg,#C03A30 0px,#C03A30 5px,#8E241C 5px,#8E241C 10px)"}}/>

        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFE0DA",
          textShadow:"1px 1px 0 rgba(0,0,0,0.4)",whiteSpace:"nowrap",flexShrink:0}}>
          {narrow?"ROTOM-DEX":"ROTOM-DEX · POKéROLE 3.0"}
        </span>

        <button onClick={open} aria-label="Open selected tool"
          style={{width:narrow?52:58,height:narrow?52:58,borderRadius:"50%",flexShrink:0,cursor:"pointer",touchAction:"manipulation",
            background:"radial-gradient(circle at 34% 28%, #BFF4FF 0%, #8FD8F0 45%, #2E9BD6 100%)",
            border:"3px solid #101010",boxShadow:"0 3px 0 rgba(0,0,0,0.35)",
            fontFamily:"'Press Start 2P',monospace",fontSize:14,color:"#0A2630"}}>A</button>
      </div>
    </div>
  );
}

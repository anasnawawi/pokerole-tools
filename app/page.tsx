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

/* Rotom's face, matched against a close-up reference: eyes are tilted ovals
   TALLER than they are wide (not the flattened horizontal slit the previous
   pass used), the black shape is a shallow dome/brow sitting ABOVE the eye
   row rather than a band wrapping fully around it, and the mouth is a white
   toothy grin with tooth dividers, not a plain blue bubble. The whole face
   now renders inside the screen itself (see the panel below), so the mouth
   is part of the display rather than sitting on the shell above it. */
/* The brow no longer lives here — see the Home component, where it's
   anchored directly to the screen panel's own top edge so it gets clipped
   to the exact same arc as the screen (see the comment at that call site
   for why: a self-contained dome shape here could never match the screen's
   actual curvature, only approximate it). RotomFace now draws only the
   eyes, sized off the same eyeH/eyeW the cap sizing in Home reads too, so
   the two can't drift out of sync with each other. */
function RotomFace({look,blink,narrow,eyeH,eyeW}:{look:number;blink:boolean;narrow:boolean;eyeH:string;eyeW:string}) {
  const eyeBorder = narrow ? "clamp(3px, 1vw, 5px)" : "clamp(4px, 0.6vw, 7px)";
  // The seam is a construction line, not a ring segment — thinner than the
  // eye's own outline, not the same weight as it.
  const seamW = narrow ? "clamp(1px, 0.35vw, 2px)" : "clamp(1.5px, 0.22vw, 2.5px)";

  const eye = (side:-1|1) => (
    /* Tilted so the TOP leans outward, away from the black cap — the
       reference's eyes flare outward like raised eyebrows. */
    <span key={side} style={{position:"relative",width:eyeW,height:eyeH,
      borderRadius:"50%",background:"#FFFFFF",border:`${eyeBorder} solid #101010`,
      transform:`rotate(${side*18}deg)`,transformOrigin:"center",
      overflow:"hidden",flexShrink:0,
      display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
      {/* The seam sits behind the pupil (earlier in DOM + lower z-index) and
          mostly hidden by it — only its outer end shows past the pupil's
          edge, as in the reference. It had been drawn after the pupil (so
          on top of it) and at the ring's own border weight (so too thick). */}
      <span style={{position:"absolute",zIndex:0,width:"46%",height:seamW,background:"#101010",
        top:"57%",left:"11%",transform:"rotate(-38deg)",opacity:0.85}}/>
      {/* Solid flat iris — no gradient, no border, no glossy highlight dot.
          Blink scales this vertically toward a line (a slit) rather than
          covering the eye with an opaque lid — "closing into the slit"
          means the pupil itself collapses, not a shape painted over it. */}
      <span style={{position:"absolute",zIndex:1,width:"70%",height:"78%",borderRadius:"50%",
        background:"#2451B8",
        transform:`translateX(${look*14}%) scaleY(${blink?0.06:1})`,
        transformOrigin:"center",transition:"transform 90ms ease"}}/>
    </span>
  );

  return (
    <div style={{position:"relative",zIndex:2,flexShrink:0,alignSelf:"center",display:"flex",alignItems:"center",justifyContent:"center",
      gap:narrow?"2.6vw":"1.4vw"}}>
      {eye(-1)}
      {eye(1)}
    </div>
  );
}

/* The grin: a white toothy smile with two tooth dividers, idling side to
   side on its own animation loop (see @keyframes rotomGrin in globals.css) —
   independent of the eyes' look-tracking, so the mouth stays alive even
   while the cursor sits still. */
function RotomMouth({narrow}:{narrow:boolean}) {
  /* The grin spans most of the eye row's width in the reference — the first
     pass sized it independently and it came out roughly half that. */
  const w = narrow ? "clamp(46px, 13vw, 82px)" : "clamp(78px, 10.5vw, 220px)";
  const h = narrow ? "clamp(18px, 5.4vw, 32px)" : "clamp(30px, 4.4vw, 88px)";
  return (
    <div style={{width:w,height:h,marginTop:narrow?4:6,position:"relative",flexShrink:0,
      background:"#FFFFFF",border:"2px solid #101010",overflow:"hidden",
      borderRadius:"18% 18% 40% 40% / 30% 30% 70% 70%",
      animation:"rotomGrin 2.6s ease-in-out infinite"}}>
      <span style={{position:"absolute",left:"32%",top:"6%",width:"6%",height:"70%",background:"#101010",transform:"rotate(6deg)"}}/>
      <span style={{position:"absolute",left:"63%",top:"6%",width:"6%",height:"70%",background:"#101010",transform:"rotate(-6deg)"}}/>
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

  // Vertical reach of the screen's domed top — scales with viewport for the
  // same reason the face does, so the arch stays proportionate at any width.
  const archR = narrow ? "clamp(46px, 11vw, 76px)" : "clamp(64px, 7vw, 150px)";
  // Eye size lives here (not inside RotomFace) because the brow cap below
  // needs the exact same numbers to size itself against — two independently
  // maintained copies is exactly how the cap and the eyes drifted apart
  // before.
  const eyeH = narrow ? "clamp(38px, 10vw, 64px)" : "clamp(64px, 10vw, 168px)";
  const eyeW = narrow ? "clamp(27px, 7.2vw, 46px)" : "clamp(46px, 7.2vw, 121px)";

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

      {/* ── Panel — the white screen bezel with its cyan inner display ────── */}
      {/* Arched top instead of a flat rectangle: 50% horizontal radius makes
          it a true dome regardless of the panel's actual width, and archR
          controls how tall that dome is. Bottom corners stay a plain small
          rounded rect, matching the reference's screen shape. */}
      <div style={{background:"#FFFFFF",borderRadius:`50% 50% 10px 10px / ${archR} ${archR} 10px 10px`,padding:narrow?6:9,flex:1,minHeight:0,display:"flex",flexDirection:"column",
        position:"relative",zIndex:1,border:"3px solid #101010",
        boxShadow:"inset 0 2px 6px rgba(0,0,0,0.18), 6px 7px 0 rgba(0,0,0,0.28)"}}>
        <div style={{position:"relative",flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",
          borderRadius:`50% 50% 6px 6px / ${archR} ${archR} 6px 6px`,border:"2px solid #101010",background:"#FFFFFF"}}>

          {/* The brow cap: anchored flush to the fill's own top:0, with NO
              border-radius of its own on top. Its top edge is invisible —
              pushed above the visible area — and what actually shows is
              wherever the fill's own overflow:hidden + arch border-radius
              clips it, which is exactly the screen's real curve. A
              self-contained dome shape (the earlier version) could only ever
              approximate that curve, never match it, because it was drawn
              independently of the arch instead of being cut by it. Height
              reaches from the true top down to roughly where the eyes sit,
              matching eyeH + the face's own top offset below. */}
          {/* zIndex:1, not 0 — the cyan motif below is also z0 and comes later
              in DOM order, so at equal z-index it was painting over the cap
              entirely (later wins). The eyes still render above this, since
              their wrapper is z1 too but later in DOM than this cap.
              Width is derived from eyeW/the eye row's gap (2.6x eyeW
              approximates the two eyes plus their gap plus a little
              overhang) rather than a flat 60% of the whole screen, which
              was far wider than the eye row it's meant to sit over. */}
          <div aria-hidden style={{position:"absolute",zIndex:1,top:0,left:"50%",transform:"translateX(-50%)",
            width:`calc(${eyeW} * 2.6 + ${narrow?"2.6vw":"1.4vw"})`,
            height:`calc(${archR} * 0.4 + ${eyeH} * 0.3)`,
            background:"#101010",borderRadius:`0 0 50% 50% / 0 0 40% 40%`}}/>

          {/* The face is part of the screen itself — sitting in the domed
              top, with the grin drawn on the display below the eyes —
              rather than perched on the shell above a flat-topped panel.
              Tied to archR (the dome's own height) rather than an
              independent vw value, so it sits inset within the arch at
              every size instead of crowding its curved top edge. */}
          <div style={{position:"relative",zIndex:1,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",
            paddingTop:`calc(${archR} * 0.4)`}}>
            <RotomFace look={look} blink={blink} narrow={narrow} eyeH={eyeH} eyeW={eyeW}/>
            <RotomMouth narrow={narrow}/>
          </div>

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

"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { C } from "./components/PokedexFrame";
import { loadFromStorage } from "./lib/storage";

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

/* What the device knows about this trainer's saved session. Each row reads a
   real localStorage key the tools already write, so the readout reflects
   actual work rather than being decoration. */
type Saved = {trainers:number;party:number;battle:number;panels:number};
const SAVED_ROWS: {
  icon:string; label:string; href:string;
  count:(s:Saved)=>number; detail:(n:number)=>string;
}[] = [
  {icon:"👤",label:"TRAINERS",href:"/characters",count:s=>s.trainers,
   detail:n=>n?`${n} saved · ${n===1?"open sheet":"open sheets"}`:"No trainers yet — create one"},
  {icon:"🎮",label:"PARTY",href:"/characters",count:s=>s.party,
   detail:n=>n?`${n} Pokémon on file`:"No Pokémon built yet"},
  {icon:"⚔️",label:"BATTLE",href:"/battle-tracker",count:s=>s.battle,
   detail:n=>n?`${n} in the fight — resume`:"No battle in progress"},
  {icon:"🖥️",label:"GM SCREEN",href:"/gm-screen",count:s=>s.panels,
   detail:n=>n?`${n} ${n===1?"panel":"panels"} laid out`:"No panels placed yet"},
];

/* localStorage is an external store, so it's read through
   useSyncExternalStore rather than in an effect: the server snapshot is
   null (no storage during SSR) and React swaps in the client snapshot after
   hydration, with no markup mismatch. getSnapshot runs on every render and
   must return a stable identity, so the counts are cached against the raw
   strings — which also means coming back from a tool re-reads changed data
   instead of showing whatever was true at first mount. */
const SAVED_KEYS = ["trainers","pokemon_sheets","bt_entries","gm_grid"];
let savedRaw: string | null = null;
let savedCache: Saved = {trainers:0,party:0,battle:0,panels:0};
function readSaved(): Saved {
  const raw = SAVED_KEYS.map(k=>{
    try { return localStorage.getItem(k) ?? ""; } catch { return ""; }
  }).join("\u0000");
  if (raw !== savedRaw) {
    savedRaw = raw;
    savedCache = {
      trainers: (loadFromStorage<unknown[]>("trainers",[]) ?? []).length,
      party:    Object.keys(loadFromStorage<Record<string,unknown>>("pokemon_sheets",{}) ?? {}).length,
      battle:   (loadFromStorage<unknown[]>("bt_entries",[]) ?? []).length,
      panels:   (loadFromStorage<(unknown|null)[]>("gm_grid",[]) ?? []).filter(Boolean).length,
    };
  }
  return savedCache;
}
// Cross-tab writes fire "storage"; same-tab writes are picked up by the
// re-render that follows them.
function subscribeSaved(onChange:()=>void){
  window.addEventListener("storage", onChange);
  return ()=>window.removeEventListener("storage", onChange);
}
const serverSaved = ():Saved|null => null;


export default function Home() {
  const router = useRouter();
  const [idx,setIdx] = useState(0);
  const [hover,setHover] = useState<number|null>(null);
  const [narrow,setNarrow] = useState(false);
  const [lamp,setLamp] = useState(0);
  const status = useSyncExternalStore(subscribeSaved, readSaved, serverSaved);
  const gridRef = useRef<HTMLDivElement>(null);

  const entry = APPS[idx];
  const sec = entry.si;
  const cols = narrow ? 2 : 3;
  // Hover wins over keyboard focus for the caption, so pointing at one app
  // while another is focused describes the one under the cursor.
  const caption = APPS[hover ?? idx];

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
                      {/* One tap opens. Selecting-then-confirming made the
                          first tap do nothing useful, hid the real action
                          behind an undiscoverable double-tap, and left the
                          OPEN button duplicating it. Hover/focus only feeds
                          the caption strip below, so the description is
                          readable without costing a click. */}
                      <button data-on={on} onClick={()=>{setIdx(i);router.push(it.href);}}
                        onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
                        onFocus={()=>setIdx(i)}
                        title={it.desc} aria-label={`${it.label} — ${it.desc}`}
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

            {/* Caption strip: describes whatever is hovered or focused. This
                is what replaced the old right-hand description pane — the
                text appears without a click, so nothing has to be selected
                before it can be read. */}
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:6,flexShrink:0,minHeight:narrow?26:30}}>
              <span style={{width:9,height:9,borderRadius:"50%",flexShrink:0,
                background:"#F2544F",border:`2px solid ${C.outline}`}}/>
              <span style={{flex:1,minWidth:0,fontSize:narrow?10:12,lineHeight:1.35,color:C.navy}}>
                {caption.desc}
              </span>
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
              TRAINER DATA
            </span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:9,color:C.yellow}}>
              {status ? "SYNCED" : "…"}
            </span>
          </div>

          {/* Cyan key row — jumps the display to a section */}
          <div style={{display:"flex",gap:narrow?6:8,flexShrink:0}}>
            {SECTIONS.map((s,i)=>(
              <button key={s.id} onClick={()=>pickSection(i)} title={`Jump to ${s.title}`} aria-label={`Jump to ${s.title}`}
                style={{flex:1,height:narrow?28:34,borderRadius:5,cursor:"pointer",touchAction:"manipulation",
                  border:`3px solid ${C.outline}`,
                  background:i===sec?C.yellow:C.cyan,
                  boxShadow:i===sec?`inset 0 0 0 2px #FFFFFF`:"none"}}/>
            ))}
          </div>

          {/* ── Session readout ────────────────────────────────────────────
              This half used to restate the highlighted tool's description and
              offer an OPEN button — both redundant once one tap opens and the
              caption strip carries the text. It now reports what's actually
              saved on the device and jumps straight into it, which is the
              thing a trainer's own tool would know and the landing page had
              no way to surface. Counts read after mount: localStorage isn't
              available during SSR, so reading it in render would desync
              hydration. */}
          <div style={{flex:narrow?"0 0 auto":"1",minHeight:0,
            borderRadius:6,border:`3px solid ${C.outline}`,
            background:C.bezel,padding:narrow?8:10,display:"flex",flexDirection:"column",gap:narrow?6:8,overflowY:"auto"}}>
            {SAVED_ROWS.map(row=>{
              const n = status ? row.count(status) : 0;
              const has = n > 0;
              return (
                <button key={row.href} onClick={()=>router.push(row.href)}
                  aria-label={`${row.label}: ${status ? row.detail(n) : "loading"}`}
                  style={{display:"flex",alignItems:"center",gap:9,textAlign:"left",cursor:"pointer",
                    touchAction:"manipulation",padding:narrow?"7px 9px":"9px 11px",borderRadius:5,
                    background:has?"#FFFFFF":"rgba(24,32,60,0.06)",
                    border:`2px solid ${has?C.outline:"rgba(24,32,60,0.3)"}`}}>
                  <span style={{fontSize:narrow?16:20,lineHeight:1,flexShrink:0,opacity:has?1:0.5}}>{row.icon}</span>
                  <span style={{flex:1,minWidth:0}}>
                    <span style={{display:"block",fontFamily:"'Press Start 2P',monospace",
                      fontSize:narrow?7:8,color:C.navy,marginBottom:3}}>{row.label}</span>
                    <span style={{display:"block",fontSize:narrow?11:12,color:has?"#2B3350":"#6A7188"}}>
                      {status ? row.detail(n) : "reading…"}
                    </span>
                  </span>
                  <span style={{flexShrink:0,fontFamily:"'Press Start 2P',monospace",
                    fontSize:narrow?8:10,color:has?C.navy:"#8A90A4"}}>▶</span>
                </button>
              );
            })}
          </div>

          {/* Control legend — states the two ways in rather than being a
              third control that duplicates them. */}
          <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:narrow?6:9,flexWrap:"wrap"}}>
            <span style={{minWidth:narrow?30:38,height:narrow?24:28,borderRadius:4,flexShrink:0,
              border:`3px solid ${C.outline}`,background:C.grey,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:narrow?8:10,color:C.navy}}>✛</span>
            <span style={{fontSize:narrow?10:11,color:"#FFFFFF",flex:1,minWidth:0}}>
              Tap an app to open it, or steer with the D-pad and press the round key.
            </span>
            <span style={{width:narrow?12:14,height:narrow?12:14,borderRadius:"50%",flexShrink:0,
              background:C.yellow,border:`2px solid ${C.outline}`}}/>
          </div>
        </div>
      </div>
    </div>
  );
}

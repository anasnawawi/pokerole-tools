"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "./components/PokedexFrame";
import PartyBar from "./components/PartyBar";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { TrainerData, makeBlankTrainer, setActiveTrainer, TRAINERS_KEY } from "./lib/trainer";
import { notifySession, partyOf, useSession } from "./lib/session";
import { Rank, TrainerAge } from "./data/game-rules";

/* ── The start menu ──────────────────────────────────────────────────────────
   The device opens on the menu a Pokémon game opens on, so the fourth row is
   the player's own name — that's the row that makes this feel like *their*
   save rather than a website's nav. Everything the toolset does is reachable
   from these eight rows; the reference tabs (moves, abilities, types, status,
   weather) live inside POKéDEX and BAG, where a player would look for them. */
type MenuItem = { id: string; icon: string; label: string; href: string; desc: string };

function menuFor(trainer: TrainerData | null, party: number): MenuItem[] {
  const who = (trainer?.name || "").trim();
  return [
    /* The player's own name leads the menu — it's the row that says whose save
       this is, and the card behind it is the one they'll open most often. */
    { id:"trainer", icon:"👤", label: who ? who.toUpperCase() : "TRAINER", href:"/trainer-card",
      desc:"Your trainer card — ID, money, badges, attributes and skills." },
    { id:"pokedex", icon:"📖", label:"POKéDEX", href:"/reference?tab=pokedex",
      desc:"All 1025 Pokémon — stats, types, abilities and learnable moves." },
    { id:"pokemon", icon:"🔴", label:"POKéMON", href:"/characters?tab=pokemon",
      desc: party ? `Your party of ${party}. Train them, feed them, teach them moves.`
                  : "Your party — empty for now. Catch something." },
    { id:"bag", icon:"🎒", label:"BAG", href:"/reference?tab=items",
      desc:"236 items by pocket, with costs and give-to-party support." },
    { id:"battle", icon:"⚔️", label:"BATTLE", href:"/battle-tracker",
      desc:"Run a fight on the battle stage, with full initiative and combat." },
    { id:"encounter", icon:"🌿", label:"ENCOUNTERS", href:"/encounter",
      desc:"Roll random wild encounters by habitat and rank." },
    { id:"gm", icon:"🖥️", label:"GM SCREEN", href:"/gm-screen",
      desc:"A modular panel grid you arrange yourself, with shareable layouts." },
    { id:"rules", icon:"📚", label:"RULES", href:"/reference/quick-ref",
      desc:"Roll rules, difficulty, damage and the pain penalty at a glance." },
  ];
}

export default function Home() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [lamp, setLamp] = useState(0);
  const [newName, setNewName] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const session = useSession();
  const trainer = session?.trainer ?? null;
  const registered = !!trainer;
  const party = partyOf(session);

  // Memoised so the keyboard handler's deps are stable — rebuilt only when
  // the trainer's name or party size actually changes the rows.
  const menu = useMemo(() => menuFor(trainer, party.length), [trainer, party.length]);
  const caption = menu[hover ?? idx];

  /* Two separate questions, which a single width breakpoint was conflating:
     `narrow` is how much room there is for type and padding, `portrait` is
     which way the clamshell opens. A phone held upright stacks the halves and
     leaves the lower one short, so the party there has to be the compact
     strip; the same phone turned sideways gets the side-by-side split and the
     full party list, exactly like a desktop window. */
  useEffect(() => {
    const size = window.matchMedia("(max-width: 820px)");
    const orient = window.matchMedia("(orientation: portrait)");
    const sync = () => { setNarrow(size.matches); setPortrait(orient.matches); };
    sync();
    size.addEventListener("change", sync);
    orient.addEventListener("change", sync);
    return () => { size.removeEventListener("change", sync); orient.removeEventListener("change", sync); };
  }, []);

  // The three indicator lamps cycle, so the device reads as powered on.
  useEffect(() => {
    const t = setInterval(() => setLamp(l => (l + 1) % 3), 900);
    return () => clearInterval(t);
  }, []);

  const step = useCallback((d: number) => {
    setIdx(i => ((i + d) % menu.length + menu.length) % menu.length);
  }, [menu.length]);
  const open = useCallback(() => { router.push(menu[idx].href); }, [router, menu, idx]);

  useEffect(() => {
    if (!registered) return; // the setup screen owns the keyboard
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, open, registered]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-on="true"]')?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  /* Registering writes a real trainer through the same keys the Characters
     page uses, so the sheet the player lands on afterwards is already theirs
     to fill in. */
  const register = useCallback((name: string, rank: Rank, age: TrainerAge) => {
    const t = { ...makeBlankTrainer(), name: name.trim(), rank, age };
    const all = loadFromStorage<TrainerData[]>(TRAINERS_KEY, []) ?? [];
    saveToStorage(TRAINERS_KEY, [...all, t]);
    setActiveTrainer(t.id);
    notifySession();
  }, []);

  /* The round key swaps which saved trainer the device is playing as — the
     whole machine follows: the menu's name row, the party below, and the
     strip every tool page carries. A GM running NPCs alongside their own
     trainer switches here instead of going to the Characters page. */
  const trainers = session?.trainers ?? [];
  const canSwitch = trainers.length > 1;
  const nextTrainer = canSwitch
    ? trainers[(trainers.findIndex(t => t.id === trainer?.id) + 1) % trainers.length]
    : null;
  const switchTrainer = useCallback(() => {
    if (!nextTrainer) return;
    setActiveTrainer(nextTrainer.id);
    notifySession();
  }, [nextTrainer]);

  /* ── Shared chrome pieces ──────────────────────────────────────────────── */
  const dpadArm: React.CSSProperties = {
    background: C.navy, border: `2px solid ${C.outline}`, color: "#FFFFFF",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: narrow ? 11 : 13, lineHeight: 1, padding: 0, cursor: "pointer", touchAction: "manipulation",
  };
  const dpadCell = narrow ? 26 : 30;
  const pixel = "'Press Start 2P',monospace";

  return (
    /* The device fills the window, sitting on the cream ground from the
       reference so its moulded outline reads as a physical edge. dvh so a
       mobile URL bar can't push the controls out of reach. */
    <div style={{height:"100dvh",width:"100vw",overflow:"hidden",display:"flex",
      background:C.cream,padding:narrow?8:16,
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:portrait?"column":"row",
        background:C.shell,border:`4px solid ${C.outline}`,borderRadius:16,
        boxShadow:`0 6px 0 ${C.shellDeep}, 0 10px 24px rgba(0,0,0,0.3)`,overflow:"hidden"}}>

        {/* ── UPPER SCREEN — lens, lamps, start menu, D-pad ─────────────────── */}
        <div style={{flex:portrait?"1 1 0":"1 1 58%",minWidth:0,minHeight:0,
          display:"flex",flexDirection:"column",gap:narrow?8:12,
          padding:narrow?10:18,
          borderRight:portrait?"none":`4px solid ${C.shellDeep}`,
          borderBottom:portrait?`4px solid ${C.shellDeep}`:"none"}}>

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
            <div style={{display:"flex",gap:narrow?6:8}}>
              {["#F2544F","#F5D33F","#5BD07A"].map((col,i)=>(
                <span key={col} style={{width:narrow?11:14,height:narrow?11:14,borderRadius:"50%",
                  background:col,border:`2px solid ${C.outline}`,
                  opacity:lamp===i?1:0.45,transition:"opacity 200ms"}}/>
              ))}
            </div>
            {/* Money and badges, the two numbers a Pokémon menu always shows */}
            {registered&&(
              <div style={{marginLeft:"auto",display:"flex",gap:narrow?6:8,alignItems:"center"}}>
                <span style={{fontFamily:pixel,fontSize:narrow?7:8,color:"#FFFFFF"}}>
                  ₽{trainer.money.toLocaleString()}
                </span>
                <span style={{fontFamily:pixel,fontSize:narrow?7:8,color:C.yellow}}>
                  {trainer.gymBadges.filter(Boolean).length}/8
                </span>
              </div>
            )}
          </div>

          {/* ── Display ──────────────────────────────────────────────────── */}
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",
            background:C.bezel,border:`3px solid ${C.outline}`,borderRadius:10,
            padding:narrow?6:8,position:"relative"}}>
            <div style={{display:"flex",gap:5,paddingBottom:5,flexShrink:0}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:C.navy,opacity:0.5}}/>
              <span style={{width:5,height:5,borderRadius:"50%",background:C.navy,opacity:0.5}}/>
            </div>

            <div style={{flex:1,minHeight:0,position:"relative",overflow:"hidden",borderRadius:5,
              border:`2px solid ${C.outline}`,background:`linear-gradient(160deg, ${C.cyanPale} 0%, ${C.cyan} 55%, ${C.cyanDeep} 100%)`}}>
              <div aria-hidden style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",
                background:"repeating-linear-gradient(115deg, rgba(255,255,255,0.30) 0px, rgba(255,255,255,0.30) 14px, transparent 14px, transparent 52px)"}}/>

              {session===null ? (
                <div style={{position:"relative",zIndex:1,height:"100%",display:"flex",
                  alignItems:"center",justifyContent:"center",fontFamily:pixel,
                  fontSize:narrow?8:10,color:C.navy}}>LOADING…</div>
              ) : !registered ? (
                <NewGame narrow={narrow} name={newName} setName={setNewName} onBegin={register}/>
              ) : (
                /* The menu box: cream panel with a heavy navy border and a ▶
                   cursor on the current row, the way the start menu is drawn
                   in the GBA games. */
                <div ref={listRef} style={{position:"relative",zIndex:1,height:"100%",overflowY:"auto",
                  padding:narrow?8:12}}>
                  <div style={{background:"#F8F8F0",border:`3px solid ${C.navy}`,borderRadius:4,
                    boxShadow:`inset 0 0 0 2px #FFFFFF, 3px 3px 0 rgba(24,32,60,0.35)`,
                    padding:narrow?4:5}}>
                    {menu.map((it,i)=>{
                      const on = i===idx;
                      return (
                        <button key={it.id} data-on={on}
                          onClick={()=>{setIdx(i);router.push(it.href);}}
                          onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
                          onFocus={()=>setIdx(i)}
                          title={it.desc} aria-label={`${it.label} — ${it.desc}`}
                          style={{display:"flex",alignItems:"center",gap:narrow?6:9,width:"100%",
                            textAlign:"left",cursor:"pointer",touchAction:"manipulation",
                            padding:narrow?"6px 6px":"8px 9px",borderRadius:3,
                            background:on?"rgba(40,80,160,0.14)":"transparent"}}>
                          <span aria-hidden style={{width:narrow?9:11,flexShrink:0,fontFamily:pixel,
                            fontSize:narrow?8:10,color:on?C.navy:"transparent"}}>▶</span>
                          <span style={{fontSize:narrow?15:19,lineHeight:1,flexShrink:0}}>{it.icon}</span>
                          <span style={{flex:1,minWidth:0,fontFamily:pixel,
                            fontSize:narrow?8:10,lineHeight:1.5,color:C.navy,
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {it.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Caption strip — the message box under the menu. */}
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:6,flexShrink:0,minHeight:narrow?26:30}}>
              <span style={{width:9,height:9,borderRadius:"50%",flexShrink:0,
                background:"#F2544F",border:`2px solid ${C.outline}`}}/>
              <span style={{flex:1,minWidth:0,fontSize:narrow?10:12,lineHeight:1.35,color:C.navy}}>
                {registered ? caption.desc : "Register your trainer to start the game."}
              </span>
            </div>
          </div>

          {/* ── Controls: round key, dashes, D-pad ───────────────────────── */}
          <div style={{display:"flex",alignItems:"center",gap:narrow?10:16,flexShrink:0}}>
            {/* Trainer switch. Opening a menu row is already one tap on the
                row itself, so this key does the thing nothing else could. */}
            <button onClick={switchTrainer} disabled={!canSwitch}
              title={canSwitch ? `Switch trainer — next: ${nextTrainer!.name.trim() || "Unnamed"}`
                : registered ? "Only one trainer saved. Create another on the Characters page to switch."
                : "No trainer registered yet."}
              aria-label={canSwitch ? `Switch trainer to ${nextTrainer!.name.trim() || "Unnamed"}` : "Switch trainer (none to switch to)"}
              style={{width:narrow?38:46,height:narrow?38:46,borderRadius:"50%",flexShrink:0,
                cursor:canSwitch?"pointer":"default",opacity:canSwitch?1:0.5,
                touchAction:"manipulation",border:`3px solid ${C.outline}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                background:`radial-gradient(circle at 34% 30%, #BFF1FA 0%, ${C.cyan} 50%, ${C.cyanDeep} 100%)`,
                boxShadow:`0 3px 0 ${C.shellDeep}`}}>
              <span aria-hidden style={{fontSize:narrow?14:17,lineHeight:1,color:C.navy}}>⇄</span>
            </button>
            <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
              {[1,2].map(n=><span key={n} style={{width:narrow?20:26,height:4,borderRadius:2,background:C.navy,border:`1px solid ${C.outline}`}}/>)}
            </div>
            <div style={{flex:1}}/>
            <div style={{display:"grid",gridTemplateColumns:`repeat(3,${dpadCell}px)`,gridTemplateRows:`repeat(3,${dpadCell}px)`,flexShrink:0,opacity:registered?1:0.5}}>
              <span/>
              <button aria-label="Up" disabled={!registered} onClick={()=>step(-1)} style={{...dpadArm,borderRadius:"4px 4px 0 0",borderBottom:"none"}}>▲</button>
              <span/>
              <button aria-label="Previous" disabled={!registered} onClick={()=>step(-1)} style={{...dpadArm,borderRadius:"4px 0 0 4px",borderRight:"none"}}>◀</button>
              <span style={{background:C.navy,borderTop:`2px solid ${C.outline}`,borderBottom:`2px solid ${C.outline}`}}/>
              <button aria-label="Next" disabled={!registered} onClick={()=>step(1)} style={{...dpadArm,borderRadius:"0 4px 4px 0",borderLeft:"none"}}>▶</button>
              <span/>
              <button aria-label="Down" disabled={!registered} onClick={()=>step(1)} style={{...dpadArm,borderRadius:"0 0 4px 4px",borderTop:"none"}}>▼</button>
              <span/>
            </div>
          </div>

          {/* Landscape has room for the full party list on the right (below),
              but that means the always-there six-slot glance loses its home —
              this keeps it pinned to the bottom of the menu screen instead,
              same spot every time, regardless of what the right side is
              showing. Portrait doesn't need it here: the lower screen there
              *is* the compact strip already. */}
          {!portrait && (
            <div style={{flexShrink:0,borderRadius:6,border:`3px solid ${C.outline}`,
              background:C.bezel,padding:narrow?6:8}}>
              <PartyBar compact onPanel/>
            </div>
          )}

          <div style={{height:narrow?14:18,borderRadius:4,background:C.yellow,
            border:`3px solid ${C.outline}`,flexShrink:0}}/>
        </div>

        {/* ── LOWER SCREEN — the party ─────────────────────────────────────── */}
        <div style={{flex:portrait?"0 0 auto":"1 1 42%",minWidth:0,minHeight:0,
          display:"flex",flexDirection:"column",gap:narrow?8:12,padding:narrow?10:18,
          background:`linear-gradient(180deg, ${C.shell} 0%, ${C.shellDark} 100%)`}}>

          <div style={{flexShrink:0,height:narrow?30:40,borderRadius:6,border:`3px solid ${C.outline}`,
            background:`repeating-linear-gradient(115deg, ${C.navy} 0px, ${C.navy} 10px, ${C.navyLight} 10px, ${C.navyLight} 20px)`,
            display:"flex",alignItems:"center",padding:"0 10px",gap:8}}>
            <span style={{fontFamily:pixel,fontSize:narrow?7:9,color:"#FFFFFF",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {registered && trainer.name.trim() ? `${trainer.name.trim().toUpperCase()}'S PARTY` : "PARTY"}
            </span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:pixel,fontSize:narrow?7:9,color:C.yellow,flexShrink:0}}>
              {party.length}/6
            </span>
          </div>

          {/* Landscape has a whole browser-half to fill, so this half gets the
              full FRLG list — the compact glance lives on the menu screen's
              bottom now (see above), so this side is free to always be the
              expanded view. Portrait's lower half is a short strip under the
              menu, so it still gets the compact six-across itself. */}
          <div style={{flex:portrait?"0 0 auto":"1",minHeight:0,
            borderRadius:6,border:`3px solid ${C.outline}`,
            background:C.bezel,padding:narrow?8:10,display:"flex",flexDirection:"column",
            justifyContent:portrait?"center":undefined,overflowY:"auto"}}>
            <PartyBar compact={portrait} onPanel/>
          </div>

          <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:narrow?6:9,flexWrap:"wrap"}}>
            <span style={{minWidth:narrow?30:38,height:narrow?24:28,borderRadius:4,flexShrink:0,
              border:`3px solid ${C.outline}`,background:C.grey,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:narrow?8:10,color:C.navy}}>✛</span>
            <span style={{fontSize:narrow?10:11,color:"#FFFFFF",flex:1,minWidth:0}}>
              {!registered ? "The device is waiting for a trainer."
                : canSwitch ? "Pick a menu row to open it. The round key switches trainer."
                : "Pick a menu row to open it, or steer with the D-pad and press Enter."}
            </span>
            <span style={{width:narrow?12:14,height:narrow?12:14,borderRadius:"50%",flexShrink:0,
              background:C.yellow,border:`2px solid ${C.outline}`}}/>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── New game ────────────────────────────────────────────────────────────────
   The games ask for a name before anything else, and that one answer is what
   turns this from a reference site into someone's save file. Rank and age are
   asked here too because every points budget on the trainer sheet derives from
   them; everything else is left for the sheet itself. */
const RANKS: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
const AGES: TrainerAge[] = ["Child","Teen","Adult","Senior"];

function NewGame({ narrow, name, setName, onBegin }: {
  narrow: boolean; name: string; setName: (s: string) => void;
  onBegin: (name: string, rank: Rank, age: TrainerAge) => void;
}) {
  const [rank, setRank] = useState<Rank>("Rookie");
  const [age, setAge] = useState<TrainerAge>("Teen");
  const pixel = "'Press Start 2P',monospace";
  const ok = name.trim().length > 0;

  const field: React.CSSProperties = {
    width:"100%",padding:narrow?"7px 8px":"9px 10px",borderRadius:3,
    border:`2px solid ${C.navy}`,background:"#FFFFFF",color:C.navy,
    fontSize:narrow?12:13,fontFamily:"inherit",
  };

  return (
    <div style={{position:"relative",zIndex:1,height:"100%",overflowY:"auto",padding:narrow?8:12}}>
      <form onSubmit={e=>{e.preventDefault(); if(ok) onBegin(name,rank,age);}}
        style={{background:"#F8F8F0",border:`3px solid ${C.navy}`,borderRadius:4,
          boxShadow:`inset 0 0 0 2px #FFFFFF, 3px 3px 0 rgba(24,32,60,0.35)`,
          padding:narrow?10:14,display:"flex",flexDirection:"column",gap:narrow?9:12}}>

        <span style={{fontFamily:pixel,fontSize:narrow?9:11,lineHeight:1.6,color:C.navy}}>
          What is your name?
        </span>

        <label style={{display:"flex",flexDirection:"column",gap:5}}>
          <span style={{fontSize:narrow?10:11,color:"#4A5470"}}>Trainer name</span>
          {/* The games put the cursor in the name box, and there is nothing
              else on this screen to compete with it. */}
          <input autoFocus value={name} onChange={e=>setName(e.target.value)}
            maxLength={24} placeholder="RED" style={field}/>
        </label>

        <div style={{display:"flex",gap:narrow?8:10}}>
          <label style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:5}}>
            <span style={{fontSize:narrow?10:11,color:"#4A5470"}}>Rank</span>
            <select value={rank} onChange={e=>setRank(e.target.value as Rank)} style={field}>
              {RANKS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:5}}>
            <span style={{fontSize:narrow?10:11,color:"#4A5470"}}>Age</span>
            <select value={age} onChange={e=>setAge(e.target.value as TrainerAge)} style={field}>
              {AGES.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>

        <button type="submit" disabled={!ok}
          style={{padding:narrow?"9px 10px":"11px 12px",borderRadius:3,
            border:`3px solid ${C.outline}`,background:ok?C.navy:"#9AA2B8",
            color:"#FFFFFF",fontFamily:pixel,fontSize:narrow?9:10,
            cursor:ok?"pointer":"default",touchAction:"manipulation",
            boxShadow:ok?`0 3px 0 ${C.shellDeep}`:"none"}}>
          BEGIN
        </button>

        <span style={{fontSize:narrow?10:11,lineHeight:1.5,color:"#5A6280"}}>
          Rank and age set your starting attribute and skill budgets. Everything
          else is filled in on the trainer sheet.
        </span>
      </form>
    </div>
  );
}

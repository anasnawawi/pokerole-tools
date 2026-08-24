"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import PartyBar from "./PartyBar";

/* Palette lifted from the Pokédex reference illustration: a crimson shell
   with a darker tone for moulded edges, navy for hard chrome, cyan for the
   display and keys, and a single yellow accent. Exported so the landing
   page's larger clamshell and this frame can't drift apart. */
export const C = {
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

/* One canonical destination list, shared by every framed page.
   The reference page carries its own Pokédex/Moves/Abilities/Items/Types/
   Status/Weather sub-nav one level down — a separate chassis key per one of
   those tabs was the same destination pressed twice, so DEX now points at
   the page itself and lets its own sub-nav pick the tab. */
export const SITE_LINKS = [
  {href:"/characters",              label:"TRAINER", match:"characters"},
  {href:"/battle-tracker",          label:"BATTLE",  match:"battle-tracker"},
  {href:"/gm-screen",               label:"GM",      match:"gm-screen"},
  {href:"/reference/quick-ref",     label:"RULES",   match:"quick-ref"},
];

/* ── Hall of Fame easter egg ───────────────────────────────────────────────────
   Clicking the lens is a no-op everywhere else this chrome is drawn, so it's a
   safe, discoverable spot for a hidden extra — the GBA end-game screen, styled
   for the credits it's actually carrying. Three fixed entries, not data-driven;
   this isn't meant to reflect anyone's real save. Lives here (not the landing
   page, where it started) so the same lens button on every framed tool page
   carries the same egg instead of it only existing on the front screen. */
const HALL_OF_FAME: { num: number; name: string; caption: string }[] = [
  { num: 155, name: "AHDA NAWAWI", caption: "The best Pokémon Trainer" },
  { num: 928, name: "ANAS NAWAWI", caption: "Guy who needed to make this instead of remember rules" },
  { num: 700, name: "AFIQ OMAR", caption: "First Champion Alpha Tester" },
];

export function HallOfFame({ onClose }: { onClose: () => void }) {
  const pixel = "'Press Start 2P',monospace";
  return (
    <div onClick={onClose} role="dialog" aria-modal aria-label="Hall of Fame"
      style={{position:"fixed",inset:0,zIndex:500,background:"rgba(6,8,18,0.86)",
        display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"min(760px,94vw)",cursor:"default",
        position:"relative",overflow:"hidden",borderRadius:8,
        border:"4px solid #14162A",boxShadow:"0 16px 48px rgba(0,0,0,0.65)",
        background:"linear-gradient(180deg,#9098D0 0%,#7078B8 42%,#484868 42%,#383858 100%)",
        padding:"30px 28px 26px"}}>
        {/* Scanlines, the one texture every GBA cutscene shares */}
        <div aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none",opacity:0.5,
          background:"repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 4px)"}}/>
        <button onClick={onClose} title="Close" aria-label="Close"
          style={{position:"absolute",top:10,right:10,zIndex:1,width:26,height:26,borderRadius:"50%",
            border:"2px solid #14162A",background:"#F8F8E8",color:"#14162A",
            fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>

        {/* Three even columns — same width, same gap, regardless of name length */}
        <div style={{position:"relative",zIndex:1,display:"grid",
          gridTemplateColumns:"repeat(3, 1fr)",gap:14}}>
          {HALL_OF_FAME.map(p=>(
            <div key={p.num} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,minWidth:0}}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local
                  pixel art at a fixed small size; next/image would blur it. */}
              <img src={`/sprites/pokemon/${p.num}.png`} alt="" width={104} height={104}
                style={{imageRendering:"pixelated",objectFit:"contain",
                  filter:"drop-shadow(2px 5px 3px rgba(0,0,0,0.5))"}}/>
              <span style={{fontFamily:pixel,fontSize:10,color:"#FFFFFF",textAlign:"center",
                textShadow:"1px 1px 0 #14162A",lineHeight:1.6}}>{p.name}</span>
              <span style={{fontSize:10,color:"#E4E6FF",textAlign:"center",lineHeight:1.45}}>{p.caption}</span>
            </div>
          ))}
        </div>

        <div style={{position:"relative",zIndex:1,marginTop:24,textAlign:"center"}}>
          <span style={{fontFamily:pixel,fontSize:12,color:"#FFFFFF",textShadow:"1px 1px 0 #14162A"}}>
            Welcome to the HALL OF FAME!
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The device chassis every tool page runs inside, so the tools read as
 * software on the Pokédex rather than as separate web pages that happen to
 * share a palette.
 *
 * Deliberately slim: the tool pages are dense, so the chrome is one top
 * strip and a thin accent bar, leaving the display nearly the full height.
 * The landing page keeps its own fuller two-panel clamshell — that one is
 * the device presented as an object; this is the same device in use.
 *
 * `children` render inside the display as flex-column items, so a page can
 * hand over its existing sub-nav / content / footer rows unchanged.
 */
export default function PokedexFrame({active,children,actions,hideParty}:{
  active?:string; children?:React.ReactNode; actions?:React.ReactNode;
  /** Drop the party strip. For the GM Screen and Battle Tracker, which need
   *  every pixel of height to lay out panels and read a fight — and which
   *  show the party's live state themselves anyway. */
  hideParty?:boolean;
}) {
  const pathname = usePathname();
  const current = active ?? SITE_LINKS.find(l=>l.href===pathname)?.match;
  const [narrow,setNarrow] = useState(false);
  // Portrait (height > width) is a different axis than narrow (a plain
  // width breakpoint) — a tall phone and a wide-but-short landscape phone
  // can both be narrow by width alone, but only the tall one is what the
  // cream margin around the shell actually costs real space on. Edge-to-
  // edge (see isPortrait below) is scoped to this, not narrow, on purpose.
  const [isPortrait,setIsPortrait] = useState(false);
  const [lamp,setLamp] = useState(0);
  const [showHOF,setShowHOF] = useState(false);

  useEffect(()=>{
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  },[]);

  useEffect(()=>{
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setIsPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  },[]);

  // Lamps cycle so the unit reads as powered, matching the landing device.
  useEffect(()=>{
    const t = setInterval(()=>setLamp(l=>(l+1)%3), 900);
    return ()=>clearInterval(t);
  },[]);

  return (
    <div style={{height:"100dvh",width:"100vw",overflow:"hidden",display:"flex",
      background:C.cream,padding:isPortrait?0:(narrow?6:12),
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      {/* isPortrait drops the outer padding above and, to match, the
          rounded corners/floating shadow here — those read as "a card
          sitting on a surface," which only makes sense once there's a
          surface (the cream margin) visible around it. Edge-to-edge, the
          shell IS the surface, so it goes flush and square instead. */}
      <div style={{flex:1,minWidth:0,minHeight:0,display:"flex",flexDirection:"column",
        gap:narrow?6:8,padding:isPortrait?3:(narrow?7:11),
        background:C.shell,border:`4px solid ${C.outline}`,borderRadius:isPortrait?0:14,
        boxShadow:isPortrait?"none":`0 5px 0 ${C.shellDeep}, 0 9px 20px rgba(0,0,0,0.28)`,overflow:"hidden"}}>

        {/* ── Top chrome: lens, lamps, destination keys ─────────────────── */}
        <div style={{display:"flex",alignItems:"center",gap:narrow?6:9,flexShrink:0,minWidth:0}}>
          {/* Lens — a real button here too, same quiet way in to the Hall of
              Fame screen as the landing page's own lens (see HallOfFame in
              this file). A no-op everywhere else this chrome is drawn, so
              it's a safe, discoverable spot for the egg on every tool page,
              not just the front screen. */}
          <button onClick={()=>setShowHOF(true)} title="???" aria-label="???"
            style={{width:narrow?24:30,height:narrow?24:30,borderRadius:"50%",flexShrink:0,
            background:C.bezel,border:`2px solid ${C.outline}`,padding:0,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:"66%",height:"66%",borderRadius:"50%",position:"relative",
              background:`radial-gradient(circle at 34% 30%, ${C.cyanPale} 0%, ${C.cyan} 45%, ${C.cyanDeep} 100%)`,
              border:`1px solid ${C.outline}`}}>
              <span style={{position:"absolute",top:"14%",left:"18%",width:"28%",height:"20%",
                borderRadius:"50%",background:"rgba(255,255,255,0.9)"}}/>
            </div>
          </button>
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {["#F2544F","#F5D33F","#5BD07A"].map((col,i)=>(
              <span key={col} style={{width:narrow?7:9,height:narrow?7:9,borderRadius:"50%",
                background:col,border:`1px solid ${C.outline}`,
                opacity:lamp===i?1:0.45,transition:"opacity 200ms"}}/>
            ))}
          </div>

          {/* Home — back to the device's own front screen. A drawn house
              (roof + walls, both centered strokes) reads cleanly at this
              size; the ⌂ glyph it replaced sat off-center and blurred into
              a squiggle at Press Start 2P's pixel size. */}
          <Link href="/" title="Pokédex home" aria-label="Pokédex home"
            style={{flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:narrow?22:26,height:narrow?22:26,borderRadius:4,textDecoration:"none",
              background:C.yellow,border:`2px solid ${C.outline}`}}>
            <svg width={narrow?13:15} height={narrow?13:15} viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 11.5 12 4l8 7.5" stroke={C.navy} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 10.5V20h12v-9.5" stroke={C.navy} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9.75 20v-5.5h4.5V20" stroke={C.navy} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>

          {/* Destination keys. Scrolls rather than clipping — a nav that
              silently hides its tail is worse than one that scrolls. */}
          <div style={{flex:1,minWidth:0,display:"flex",gap:narrow?4:5,overflowX:"auto",overflowY:"hidden"}}>
            {SITE_LINKS.map(l=>{
              const on = current===l.match;
              return (
                <Link key={l.href} href={l.href}
                  style={{flexShrink:0,display:"inline-flex",alignItems:"center",
                    height:narrow?22:26,padding:narrow?"0 7px":"0 10px",borderRadius:4,textDecoration:"none",
                    background:on?C.navy:C.cyan,border:`2px solid ${C.outline}`,
                    boxShadow:on?`inset 0 0 0 2px ${C.yellow}`:"none",
                    fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:8,
                    color:on?"#FFFFFF":C.navy,whiteSpace:"nowrap"}}>
                  {l.label}
                </Link>
              );
            })}
          </div>

          {actions&&<div style={{flexShrink:0,display:"flex",alignItems:"center",gap:6}}>{actions}</div>}
        </div>

        {/* ── Display: the page's own UI runs in here ───────────────────── */}
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",
          background:C.bezel,border:`3px solid ${C.outline}`,borderRadius:9,padding:narrow?4:6}}>
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden",
            borderRadius:5,border:`2px solid ${C.outline}`,background:"#FFFFFF"}}>
            {children}
          </div>
        </div>

        {/* ── Party strip ───────────────────────────────────────────────────
            The active party travels with you, the way it does in the games:
            whatever tool you're in, you can see who you're carrying and how
            hurt they are without going back to look. */}
        {!hideParty&&(
          <div style={{flexShrink:0,minWidth:0}}>
            <PartyBar compact/>
          </div>
        )}

        {/* Yellow accent bar, as on the device's front */}
        <div style={{height:narrow?9:12,borderRadius:3,background:C.yellow,
          border:`2px solid ${C.outline}`,flexShrink:0}}/>
      </div>

      {showHOF && <HallOfFame onClose={()=>setShowHOF(false)}/>}
    </div>
  );
}

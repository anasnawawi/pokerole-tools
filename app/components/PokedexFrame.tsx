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

/* One canonical destination list, shared by every framed page. */
export const SITE_LINKS = [
  {href:"/reference?tab=pokedex",   label:"DEX",     match:"pokedex"},
  {href:"/reference?tab=moves",     label:"MOVES",   match:"moves"},
  {href:"/reference?tab=abilities", label:"ABIL",    match:"abilities"},
  {href:"/reference?tab=items",     label:"ITEMS",   match:"items"},
  {href:"/encounter",               label:"ENCTR",   match:"encounter"},
  {href:"/battle-tracker",          label:"BATTLE",  match:"battle-tracker"},
  {href:"/gm-screen",               label:"GM",      match:"gm-screen"},
  {href:"/characters",              label:"CHARS",   match:"characters"},
  {href:"/reference/quick-ref",     label:"RULES",   match:"quick-ref"},
];

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
  const [lamp,setLamp] = useState(0);

  useEffect(()=>{
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setNarrow(mq.matches);
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
      background:C.cream,padding:narrow?6:12,
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      <div style={{flex:1,minWidth:0,minHeight:0,display:"flex",flexDirection:"column",
        gap:narrow?6:8,padding:narrow?7:11,
        background:C.shell,border:`4px solid ${C.outline}`,borderRadius:14,
        boxShadow:`0 5px 0 ${C.shellDeep}, 0 9px 20px rgba(0,0,0,0.28)`,overflow:"hidden"}}>

        {/* ── Top chrome: lens, lamps, home, destination keys ────────────── */}
        <div style={{display:"flex",alignItems:"center",gap:narrow?6:9,flexShrink:0,minWidth:0}}>
          {/* Lens */}
          <div style={{width:narrow?24:30,height:narrow?24:30,borderRadius:"50%",flexShrink:0,
            background:C.bezel,border:`2px solid ${C.outline}`,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:"66%",height:"66%",borderRadius:"50%",position:"relative",
              background:`radial-gradient(circle at 34% 30%, ${C.cyanPale} 0%, ${C.cyan} 45%, ${C.cyanDeep} 100%)`,
              border:`1px solid ${C.outline}`}}>
              <span style={{position:"absolute",top:"14%",left:"18%",width:"28%",height:"20%",
                borderRadius:"50%",background:"rgba(255,255,255,0.9)"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {["#F2544F","#F5D33F","#5BD07A"].map((col,i)=>(
              <span key={col} style={{width:narrow?7:9,height:narrow?7:9,borderRadius:"50%",
                background:col,border:`1px solid ${C.outline}`,
                opacity:lamp===i?1:0.45,transition:"opacity 200ms"}}/>
            ))}
          </div>

          {/* Home — back to the device's own front screen */}
          <Link href="/" title="Pokédex home" aria-label="Pokédex home"
            style={{flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",
              height:narrow?22:26,padding:"0 9px",borderRadius:4,textDecoration:"none",
              background:C.yellow,border:`2px solid ${C.outline}`,
              fontFamily:"'Press Start 2P',monospace",fontSize:narrow?7:8,color:C.navy}}>⌂</Link>

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
    </div>
  );
}

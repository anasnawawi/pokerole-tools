"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* The one canonical destination list for the whole app. Every page renders this
   same bar so navigation never changes shape between tools. */
export const SITE_LINKS = [
  {href:"/reference?tab=pokedex",   label:"Pokédex",        match:"pokedex"},
  {href:"/reference?tab=moves",     label:"Moves",          match:"moves"},
  {href:"/reference?tab=abilities", label:"Abilities",      match:"abilities"},
  {href:"/reference?tab=items",     label:"Items",          match:"items"},
  {href:"/encounter",               label:"Encounter",      match:"encounter"},
  {href:"/battle-tracker",          label:"Battle",         match:"battle-tracker"},
  {href:"/gm-screen",               label:"GM Screen",      match:"gm-screen"},
  {href:"/characters",              label:"Characters",     match:"characters"},
  {href:"/reference/quick-ref",     label:"Rules",          match:"quick-ref"},
];

/**
 * FireRed system bar used as the top-level nav on every page.
 *
 * `active` names the current destination (a `match` value above). Pages under
 * /reference pass their tab explicitly, since the tab lives in a query string
 * and reading it here would force every caller behind a Suspense boundary.
 *
 * `children` renders on the right for page-specific controls, so a tool's own
 * actions sit in the shared bar rather than in a second, differently-styled one.
 */
export default function SiteNav({active,children}:{active?:string;children?:React.ReactNode}) {
  const pathname = usePathname();
  const current = active ?? SITE_LINKS.find(l=>l.href===pathname)?.match;

  return (
    <nav className="fr-bar" style={{borderBottom:"2px solid #18305A",padding:"0 10px",height:44,display:"flex",alignItems:"center",gap:4,flexShrink:0,
      /* Scrolls rather than clipping — a nav that silently hides its tail is worse than one that scrolls */
      overflowX:"auto",overflowY:"hidden"}}>
      {/* Explicit way back to the Rotom Pokédex. The wordmark alone was the only
          route home, which isn't an obvious affordance. */}
      <Link href="/" title="Back to the Pokédex" aria-label="Back to the Pokédex"
        style={{display:"inline-flex",alignItems:"center",gap:5,textDecoration:"none",flexShrink:0,marginRight:8,whiteSpace:"nowrap",
          background:"#F4762A",border:"2px solid #18305A",borderRadius:6,padding:"3px 9px",boxShadow:"0 2px 0 rgba(0,0,0,0.3)"}}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#FF8C42";}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#F4762A";}}>
        <span style={{fontSize:12,lineHeight:1,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.45)"}}>⌂</span>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FFFFFF",textShadow:"1px 1px 0 rgba(0,0,0,0.45)"}}>POKéDEX</span>
      </Link>
      {SITE_LINKS.map(l=>{
        const on = current===l.match;
        return (
          <Link key={l.href} href={l.href}
            style={{fontFamily:"'Exo 2',sans-serif",fontSize:12,fontWeight:700,textDecoration:"none",padding:"4px 9px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0,
              color:on?"#202020":"#FFFFFF",background:on?"#FFFFFF":"transparent",textShadow:on?"1px 1px 0 #A8A8A8":"1px 1px 0 #183868"}}
            onMouseEnter={e=>{if(!on)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.18)";}}
            onMouseLeave={e=>{if(!on)(e.currentTarget as HTMLElement).style.background="transparent";}}>
            {l.label}
          </Link>
        );
      })}
      {children&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,paddingLeft:10,flexShrink:0}}>{children}</div>}
    </nav>
  );
}

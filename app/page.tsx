"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const SECTIONS = [
  {
    id:"players", title:"TRAINER TOOLS", accent:"#2858C0",
    items:[
      {href:"/reference?tab=pokedex",icon:"📖",label:"Pokédex",desc:"Browse all 1025 Pokémon"},
      {href:"/reference?tab=moves",icon:"⚡",label:"Moves",desc:"All 894 moves & effects"},
      {href:"/reference?tab=abilities",icon:"✨",label:"Abilities",desc:"305 ability descriptions"},
      {href:"/reference?tab=items",icon:"🎒",label:"Items",desc:"236 items + give to party"},
      {href:"/characters",icon:"👤",label:"Character Creator",desc:"Build trainers & Pokémon"},
    ],
  },
  {
    id:"gm", title:"GAME MASTER", accent:"#D82808",
    items:[
      {href:"/gm-screen",icon:"🖥️",label:"GM Screen",desc:"Modular reference panels"},
      {href:"/encounter",icon:"🌿",label:"Encounter Generator",desc:"Random wild encounters"},
      {href:"/battle-tracker",icon:"⚔️",label:"Battle Tracker",desc:"Full initiative & combat"},
    ],
  },
  {
    id:"rules", title:"RULES DATA", accent:"#807008",
    items:[
      {href:"/reference/quick-ref",icon:"📚",label:"Quick Reference",desc:"Roll rules & mechanics"},
      {href:"/reference?tab=types",icon:"🔣",label:"Type Chart",desc:"Effectiveness matrix"},
      {href:"/reference?tab=status",icon:"💢",label:"Status Conditions",desc:"All status effects"},
      {href:"/reference?tab=weather",icon:"🌤️",label:"Weather Effects",desc:"Weather & terrain"},
    ],
  },
];

const NAV_LINKS = [
  {href:"/reference?tab=pokedex",label:"Pokédex"},
  {href:"/reference?tab=moves",label:"Moves"},
  {href:"/reference?tab=abilities",label:"Abilities"},
  {href:"/encounter",label:"Encounter"},
  {href:"/battle-tracker",label:"Battle Tracker"},
  {href:"/gm-screen",label:"GM Screen"},
  {href:"/characters",label:"Characters"},
  {href:"/reference/quick-ref",label:"Rules"},
];

function ScanlineOverlay(){
  return <div style={{position:"absolute",inset:0,pointerEvents:"none",borderRadius:6,
    background:"repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 3px)"}}/>;
}

export default function Home() {
  const [blink,setBlink]=useState(true);
  useEffect(()=>{const t=setInterval(()=>setBlink(b=>!b),600);return()=>clearInterval(t);},[]);

  return (
    <div style={{height:"100vh",background:"linear-gradient(180deg,#B85030 0%,#68402C 40%,#3C281C 100%)",color:"#181818",overflowY:"auto",overflowX:"hidden",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      {/* Nav — FireRed white panel style, matching the battle tracker */}
      <nav style={{background:"#F8F8E8",borderBottom:"3px solid #181818",boxShadow:"0 3px 0 #787878",padding:"0 16px",height:48,display:"flex",alignItems:"center",gap:6,position:"sticky",top:0,zIndex:100,overflowX:"auto"}}>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontWeight:400,fontSize:11,color:"#181818",letterSpacing:"-0.5px",flexShrink:0,marginRight:10}}>
          PokeRole<span style={{color:"#D82808"}}> Tools</span>
        </span>
        {NAV_LINKS.map(l=>(
          <Link key={l.href} href={l.href} style={{fontSize:9,fontFamily:"'Press Start 2P',monospace",color:"#484830",textDecoration:"none",padding:"5px 8px",whiteSpace:"nowrap",flexShrink:0,border:"1px solid transparent"}}
            onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.color="#D82808";el.style.background="#F0ECD4";el.style.border="1px solid #181818";}}
            onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.color="#484830";el.style.background="transparent";el.style.border="1px solid transparent";}}>
            {l.label}
          </Link>
        ))}
      </nav>

      {/* ── POKéDEX DEVICE HERO ─────────────────────────────────────────────── */}
      <div style={{padding:"36px 16px 28px",display:"flex",justifyContent:"center"}}>
        <div style={{maxWidth:820,width:"100%",background:"linear-gradient(160deg,#F03828 0%,#D02010 55%,#981406 100%)",
          border:"4px solid #181818",borderRadius:20,boxShadow:"8px 10px 0 rgba(0,0,0,0.4)",padding:"22px 22px 26px",position:"relative"}}>

          {/* Top row — lens + indicator lights */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
            <div style={{width:52,height:52,borderRadius:"50%",flexShrink:0,
              background:"radial-gradient(circle at 34% 28%, #D8F8FF 0%, #78C8F0 30%, #2878C0 68%, #184880 100%)",
              border:"4px solid #181818",boxShadow:"inset -3px -3px 6px rgba(0,30,60,0.5), 0 2px 0 rgba(0,0,0,0.3)",position:"relative"}}>
              <div style={{position:"absolute",top:9,left:12,width:12,height:8,borderRadius:"50%",background:"rgba(255,255,255,0.85)",filter:"blur(1px)"}}/>
            </div>
            <div style={{display:"flex",gap:7}}>
              {["#F83838","#F8D030","#58D838"].map(c=>(
                <div key={c} style={{width:13,height:13,borderRadius:"50%",background:c,border:"2px solid #181818",boxShadow:"inset -1px -1px 2px rgba(0,0,0,0.35), 0 0 4px "+c}}/>
              ))}
            </div>
            <div style={{flex:1}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FFD0C0"}}>MODEL PKR-01</span>
          </div>

          {/* Screen bezel */}
          <div style={{background:"#181818",borderRadius:12,padding:12,marginBottom:18,boxShadow:"inset 0 2px 4px rgba(0,0,0,0.6)"}}>
            <div style={{position:"relative",overflow:"hidden",borderRadius:7,border:"3px solid #0C1418",
              background:"linear-gradient(160deg,#B8F0F0 0%,#68C8E0 55%,#3888B8 100%)",
              padding:"32px 20px",textAlign:"center",boxShadow:"inset 0 0 24px rgba(0,20,40,0.35)"}}>
              <ScanlineOverlay/>
              <div style={{position:"relative",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(16px,4.2vw,30px)",color:"#F8F8E8",
                textShadow:"3px 3px 0 #205888",letterSpacing:"1px",lineHeight:1.4}}>
                POKÉROLE<br/>TOOLS
              </div>
              <div style={{position:"relative",fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#0C3050",marginTop:12,lineHeight:1.8}}>
                Complete reference for PokeRole 3.0
                <span style={{opacity:blink?1:0}}>▮</span>
              </div>
            </div>
          </div>

          {/* Quick-jump buttons — one per section, styled like device keys */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
            {SECTIONS.map(s=>(
              <a key={s.id} href={`#${s.id}`} style={{textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                padding:"10px 8px",borderRadius:9,background:"linear-gradient(180deg,#78C0E8 0%,#3878B8 100%)",
                border:"3px solid #181818",boxShadow:"0 3px 0 #103858",cursor:"pointer"}}
                onMouseEnter={e=>{const el=e.currentTarget as HTMLAnchorElement;el.style.transform="translateY(1px)";el.style.boxShadow="0 2px 0 #103858";}}
                onMouseLeave={e=>{const el=e.currentTarget as HTMLAnchorElement;el.style.transform="";el.style.boxShadow="0 3px 0 #103858";}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:s.accent,border:"1px solid #181818",flexShrink:0}}/>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#F8F8E8",textShadow:"1px 1px 0 #103858",whiteSpace:"nowrap"}}>{s.title}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTIONS — FireRed chrome cards ─────────────────────────────────── */}
      <div style={{maxWidth:900,margin:"0 auto",padding:"0 16px 60px"}}>
        {SECTIONS.map(section=>(
          <div key={section.id} id={section.id} style={{marginBottom:32,scrollMarginTop:64}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,paddingBottom:6,borderBottom:`3px solid ${section.accent}`}}>
              <span style={{width:10,height:10,background:section.accent,border:"2px solid #181818",flexShrink:0}}/>
              <h2 style={{fontFamily:"'Press Start 2P',monospace",fontWeight:400,fontSize:12,color:"#F8F0E0",textShadow:"2px 2px 0 rgba(0,0,0,0.4)",margin:0}}>{section.title}</h2>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
              {section.items.map(item=>(
                <Link key={item.href+item.label} href={item.href} style={{textDecoration:"none"}}>
                  <div style={{background:"#F0ECD4",border:"2px solid #181818",boxShadow:"3px 3px 0 #181818",borderRadius:4,
                    padding:"16px 12px",textAlign:"center",cursor:"pointer",transition:"transform 0.1s",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:8,height:"100%"}}
                    onMouseEnter={e=>{const el=e.currentTarget as HTMLDivElement;el.style.transform="translate(-2px,-2px)";el.style.boxShadow=`5px 5px 0 ${section.accent}`;el.style.background="#F8F4E0";}}
                    onMouseLeave={e=>{const el=e.currentTarget as HTMLDivElement;el.style.transform="";el.style.boxShadow="3px 3px 0 #181818";el.style.background="#F0ECD4";}}>
                    <span style={{fontSize:26}}>{item.icon}</span>
                    <span style={{fontSize:9,fontWeight:700,color:"#181818",fontFamily:"'Press Start 2P',monospace",lineHeight:1.5}}>{item.label}</span>
                    <span style={{fontSize:10,color:"#5a5a48",lineHeight:1.4}}>{item.desc}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* GM Quick Start — FireRed dialogue box style */}
        <div style={{background:"#F8F8E8",border:"3px solid #181818",boxShadow:"4px 4px 0 rgba(0,0,0,0.4)",borderRadius:4,padding:"14px 18px"}}>
          <div style={{fontSize:9,fontFamily:"'Press Start 2P',monospace",color:"#D82808",marginBottom:8}}>▶ GM QUICK START</div>
          <div style={{fontSize:13,color:"#484830",lineHeight:1.7}}>
            Open the <Link href="/gm-screen" style={{color:"#2858C0",fontWeight:700}}>GM Screen</Link> and click <strong style={{color:"#D82808"}}>+ Panel</strong> to add modular reference panels — Battle Tracker, Type Chart, Status Ref, Catch Guide and more. Use the <Link href="/encounter" style={{color:"#2858C0",fontWeight:700}}>Encounter Generator</Link> and click any Pokémon to add it directly to the tracker.
          </div>
        </div>
      </div>
    </div>
  );
}

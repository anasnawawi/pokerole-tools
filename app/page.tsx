"use client";
import Link from "next/link";

const SECTIONS = [
  {
    title:"Players", color:"#00d4aa",
    items:[
      {href:"/reference?tab=pokedex",icon:"📖",label:"Pokédex"},
      {href:"/reference?tab=moves",icon:"⚡",label:"Moves"},
      {href:"/reference?tab=abilities",icon:"✨",label:"Abilities"},
      {href:"/reference?tab=items",icon:"🎒",label:"Items"},
      {href:"/characters",icon:"👤",label:"Character\nCreator"},
    ],
  },
  {
    title:"Game Master", color:"#a040a0",
    items:[
      {href:"/gm-screen",icon:"🖥️",label:"GM Screen"},
      {href:"/encounter",icon:"🌿",label:"Encounter\nGenerator"},
      {href:"/gm-screen",icon:"⚔️",label:"Battle\nTracker"},
    ],
  },
  {
    title:"Rules Reference", color:"#3d8bff",
    items:[
      {href:"/reference/quick-ref",icon:"📚",label:"Quick\nReference"},
      {href:"/reference?tab=types",icon:"🔣",label:"Type Chart"},
      {href:"/reference?tab=status",icon:"💢",label:"Status\nConditions"},
      {href:"/reference?tab=weather",icon:"🌤️",label:"Weather\nEffects"},
    ],
  },
];

export default function Home() {
  return (
    <div style={{minHeight:"100vh",background:"#0f1117",color:"#e8eaf0",overflow:"auto"}}>
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 24px",height:48,display:"flex",alignItems:"center",gap:8,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:16}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#00d4aa,#3d8bff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⬡</div>
          <span style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:16,color:"#e8eaf0"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></span>
          <span style={{fontSize:10,color:"#3a4060",fontWeight:700}}>3.0</span>
        </div>
        {[{href:"/reference?tab=pokedex",label:"Pokédex"},{href:"/reference?tab=moves",label:"Moves"},{href:"/reference?tab=abilities",label:"Abilities"},{href:"/encounter",label:"Encounter"},{href:"/gm-screen",label:"GM Screen"},{href:"/characters",label:"Characters"},{href:"/reference/quick-ref",label:"Rules"}].map(l=>(
          <Link key={l.href} href={l.href} style={{fontSize:13,fontWeight:600,color:"#8b90a8",textDecoration:"none",padding:"4px 10px",borderRadius:5}}
            onMouseEnter={e=>(e.target as HTMLElement).style.color="#e8eaf0"}
            onMouseLeave={e=>(e.target as HTMLElement).style.color="#8b90a8"}>
            {l.label}
          </Link>
        ))}
      </nav>

      <div style={{textAlign:"center",padding:"48px 24px 32px",background:"linear-gradient(180deg,#13151f 0%,#0f1117 100%)"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:16,marginBottom:16}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#00d4aa,#3d8bff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>⬡</div>
          <div style={{textAlign:"left"}}>
            <h1 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:32,color:"#e8eaf0",lineHeight:1,margin:0}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></h1>
            <p style={{fontSize:13,color:"#8b90a8",margin:"6px 0 0"}}>A suite of tools for PokeRole 3.0 players and Game Masters</p>
          </div>
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px 60px"}}>
        {SECTIONS.map(section=>(
          <div key={section.title} style={{marginBottom:36}}>
            <h2 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:20,color:section.color,marginBottom:14,borderBottom:`2px solid ${section.color}25`,paddingBottom:6}}>{section.title}</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
              {section.items.map(item=>(
                <Link key={item.href+item.label} href={item.href} style={{textDecoration:"none"}}>
                  <div style={{background:"#1e2235",border:`1px solid ${section.color}25`,borderRadius:8,padding:"18px 14px",textAlign:"center",cursor:"pointer",transition:"all 0.15s",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}
                    onMouseEnter={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor=section.color;el.style.transform="translateY(-2px)";el.style.boxShadow=`0 4px 20px ${section.color}18`;}}
                    onMouseLeave={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor=`${section.color}25`;el.style.transform="";el.style.boxShadow="";}}>
                    <span style={{fontSize:28}}>{item.icon}</span>
                    <span style={{fontSize:12,fontWeight:700,color:"#e8eaf0",fontFamily:"'Exo 2'",whiteSpace:"pre-line"}}>{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div style={{background:"#13151f",border:"1px solid #2a2f45",borderRadius:8,padding:"14px 18px",borderLeft:"4px solid #00d4aa"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#00d4aa",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>GM Quick Start</div>
          <div style={{fontSize:13,color:"#8b90a8",lineHeight:1.6}}>
            Open the <Link href="/gm-screen" style={{color:"#00d4aa"}}>GM Screen</Link> and click <strong style={{color:"#a040a0"}}>+ Panel</strong> to add modular reference panels — Battle Tracker, Type Chart, Status Ref, Catch Guide and more. Use the <Link href="/encounter" style={{color:"#00d4aa"}}>Encounter Generator</Link> and click any Pokémon to add it directly to the tracker.
          </div>
        </div>
      </div>
    </div>
  );
}

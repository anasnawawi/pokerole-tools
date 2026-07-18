"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { POKEMON, HABITATS, TYPE_COLORS, HabitatData, PokemonType, Rank } from "../data/pokerole-data";
import { saveToStorage, loadFromStorage } from "../lib/storage";

const RANK_ORDER: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};

function TypeBadge({type}:{type:PokemonType}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"2px 7px",borderRadius:4,fontSize:11,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]}}>{type}</span>;
}
function TypeBadgeSmall({type}:{type:PokemonType}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]}}>{type}</span>;
}

export default function EncounterPage() {
  const router = useRouter();
  const [habitat, setHabitat] = useState<HabitatData>(HABITATS[1]);
  const [rankFilter, setRankFilter] = useState<Set<Rank>>(new Set(RANK_ORDER));
  const [rolled, setRolled] = useState<typeof POKEMON[0]|null>(null);
  const [addedMsg, setAddedMsg] = useState(false);

  const filtered = useMemo(() => POKEMON.filter(p => {
    if (!rankFilter.has(p.suggestedRank)) return false;
    const allHabTypes = [...habitat.commonTypes, ...habitat.uncommonTypes, ...habitat.rareTypes];
    return p.types.some(t => allHabTypes.includes(t));
  }), [habitat, rankFilter]);

  const rollRandom = () => {
    if (!filtered.length) return;
    setRolled(filtered[Math.floor(Math.random() * filtered.length)]);
    setAddedMsg(false);
  };

  const addToTracker = (p: typeof POKEMON[0]) => {
    // Save to storage so GM Screen can pick it up
    const existing = loadFromStorage<number[]>("encounter_queue", []);
    saveToStorage("encounter_queue", [...existing, p.number]);
    setAddedMsg(true);
    setTimeout(() => setAddedMsg(false), 2000);
  };

  const toggleRank = (r: Rank) => {
    setRankFilter(prev => { const n = new Set(prev); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  };

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",color:"#e8eaf0",display:"flex",flexDirection:"column"}}>
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 20px",height:48,display:"flex",alignItems:"center",gap:12}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#00d4aa",fontWeight:600}}>🌿 Encounter Generator</span>
        <div style={{marginLeft:"auto"}}>
          <Link href="/gm-screen" style={{fontSize:12,color:"#a040a0",textDecoration:"none",background:"rgba(160,64,160,0.1)",border:"1px solid rgba(160,64,160,0.3)",borderRadius:5,padding:"4px 12px",fontWeight:700}}>
            🖥️ Open GM Screen
          </Link>
        </div>
      </nav>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Habitat sidebar */}
        <div style={{width:200,background:"#13151f",borderRight:"1px solid #2a2f45",overflowY:"auto",flexShrink:0}}>
          <div style={{padding:"10px 8px"}}>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Habitats</div>
            {HABITATS.map(h=>(
              <button key={h.name} onClick={()=>setHabitat(h)} style={{display:"block",width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:5,cursor:"pointer",border:"none",background:habitat.name===h.name?h.color+"20":"transparent",color:habitat.name===h.name?h.color:"#8b90a8",borderLeft:`2px solid ${habitat.name===h.name?h.color:"transparent"}`,fontSize:12,fontWeight:habitat.name===h.name?700:400,marginBottom:2}}>
                {h.emoji} {h.name}
              </button>
            ))}
          </div>
        </div>
        {/* Main */}
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          {/* Habitat info */}
          <div style={{background:"#1e2235",border:`1px solid ${habitat.color}40`,borderRadius:8,padding:16,marginBottom:20}}>
            <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:habitat.color,marginBottom:8}}>{habitat.emoji} {habitat.name}</h2>
            <p style={{fontSize:13,color:"#8b90a8",lineHeight:1.6,marginBottom:12}}>{habitat.description}</p>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              {[["Common",habitat.commonTypes],["Uncommon",habitat.uncommonTypes],["Rare",habitat.rareTypes]].map(([label,types])=>(
                <div key={label as string}>
                  <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>{label}</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(types as PokemonType[]).map(t=><TypeBadgeSmall key={t} type={t}/>)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rank filter */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Filter by Rank</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {RANK_ORDER.map(r=>(
                <button key={r} onClick={()=>toggleRank(r)} style={{padding:"3px 8px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${RANK_COLORS[r]}60`,background:rankFilter.has(r)?RANK_COLORS[r]+"20":"transparent",color:rankFilter.has(r)?RANK_COLORS[r]:"#5a6080"}}>{r}</button>
              ))}
            </div>
          </div>

          {/* Roll */}
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:20}}>
            <button onClick={rollRandom} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:6,padding:"10px 20px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Exo 2'"}}>🎲 Roll Random Encounter</button>
            <span style={{fontSize:13,color:"#5a6080"}}>{filtered.length} Pokémon available</span>
          </div>

          {/* Rolled result */}
          {rolled && (
            <div style={{background:"#1e2235",border:`2px solid ${TYPE_COLORS[rolled.types[0]]}`,borderRadius:8,padding:16,marginBottom:20}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Wild Encounter!</div>
              <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:220}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#e8eaf0"}}>{rolled.name}</span>
                    <span style={{fontSize:11,color:"#5a6080"}}>#{String(rolled.number).padStart(3,"0")}</span>
                    {rolled.types.map(t=><TypeBadge key={t} type={t}/>)}
                    <span style={{fontSize:11,fontWeight:700,color:RANK_COLORS[rolled.suggestedRank]}}>{rolled.suggestedRank}</span>
                  </div>
                  <p style={{fontSize:12,color:"#8b90a8",marginBottom:8,lineHeight:1.5}}>{rolled.description}</p>
                  <div style={{display:"flex",gap:12,fontSize:11,flexWrap:"wrap"}}>
                    <span style={{color:"#5a6080"}}>HP: <strong style={{color:"#e8eaf0"}}>{rolled.baseHp+rolled.attributes.vitality}</strong></span>
                    <span style={{color:"#5a6080"}}>STR: <strong style={{color:"#e8eaf0"}}>{rolled.attributes.strength}</strong></span>
                    <span style={{color:"#5a6080"}}>DEX: <strong style={{color:"#e8eaf0"}}>{rolled.attributes.dexterity}</strong></span>
                    <span style={{color:"#5a6080"}}>SPC: <strong style={{color:"#e8eaf0"}}>{rolled.attributes.special}</strong></span>
                  </div>
                  <div style={{fontSize:11,color:"#5a6080",marginTop:4}}>Abilities: <span style={{color:"#00d4aa"}}>{rolled.abilities.join(", ")}</span></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>addToTracker(rolled)} style={{background:addedMsg?"#00d4aa30":"#ff4757",color:addedMsg?"#00d4aa":"#fff",border:addedMsg?"1px solid #00d4aa":"none",borderRadius:6,padding:"8px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Exo 2'",transition:"all 0.3s"}}>
                    {addedMsg?"✓ Added to Tracker!":"⚔️ Add to Battle Tracker"}
                  </button>
                  <Link href="/gm-screen" style={{display:"block",textAlign:"center",background:"rgba(160,64,160,0.15)",color:"#a040a0",border:"1px solid rgba(160,64,160,0.3)",borderRadius:6,padding:"7px 14px",fontWeight:700,fontSize:12,textDecoration:"none"}}>
                    🖥️ Open GM Screen
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Pokemon grid */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
            {filtered.map(p=>(
              <div key={`${p.number}-${p.name}`} onClick={()=>{setRolled(p);setAddedMsg(false);}} style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:6,padding:"10px 12px",cursor:"pointer",transition:"all 0.12s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=TYPE_COLORS[p.types[0]];}}
                onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#2a2f45";}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#e8eaf0"}}>{p.name}</span>
                  <span style={{fontSize:9,color:"#3a4060"}}>#{String(p.number).padStart(3,"0")}</span>
                </div>
                <div style={{display:"flex",gap:3,marginBottom:5}}>{p.types.map(t=><TypeBadgeSmall key={t} type={t}/>)}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,fontWeight:700,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
                  <span style={{fontSize:10,color:"#5a6080"}}>HP {p.baseHp+p.attributes.vitality} | STR {p.attributes.strength} | SPC {p.attributes.special}</span>
                </div>
              </div>
            ))}
          </div>
          {filtered.length===0&&<div style={{textAlign:"center",color:"#5a6080",padding:40}}>No Pokémon match the current filters for this habitat.</div>}
        </div>
      </div>
    </div>
  );
}

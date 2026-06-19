"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { POKEMON, HABITATS, TYPE_COLORS, HabitatData, PokemonType, Rank } from "../data/pokerole-data";

const RANK_ORDER: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};

function TypeBadge({type}:{type:PokemonType}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:700,color:"#fff",background:TYPE_COLORS[type],textShadow:"0 1px 2px rgba(0,0,0,0.4)"}}>{type}</span>;
}

export default function EncounterPage() {
  const [habitat, setHabitat] = useState<HabitatData>(HABITATS[1]);
  const [rankFilter, setRankFilter] = useState<Rank[]>([...RANK_ORDER]);
  const [typeFilter, setTypeFilter] = useState<PokemonType|null>(null);
  const [rolled, setRolled] = useState<typeof POKEMON[0]|null>(null);

  const filtered = useMemo(() => {
    return POKEMON.filter(p => {
      if (!rankFilter.includes(p.suggestedRank)) return false;
      if (typeFilter && !p.types.includes(typeFilter)) return false;
      // habitat type filter
      const allHabTypes = [...habitat.commonTypes, ...habitat.uncommonTypes, ...habitat.rareTypes];
      if (!p.types.some(t => allHabTypes.includes(t))) return false;
      return true;
    });
  }, [habitat, rankFilter, typeFilter]);

  const rollRandom = () => {
    if (!filtered.length) return;
    setRolled(filtered[Math.floor(Math.random() * filtered.length)]);
  };

  const toggleRank = (r: Rank) => {
    setRankFilter(prev => prev.includes(r) ? prev.filter(x=>x!==r) : [...prev, r]);
  };

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",color:"#e8eaf0",display:"flex",flexDirection:"column"}}>
      {/* Nav */}
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 20px",height:48,display:"flex",alignItems:"center",gap:12}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#00d4aa",fontWeight:600}}>🌿 Encounter Generator</span>
      </nav>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Habitat sidebar */}
        <div style={{width:200,background:"#13151f",borderRight:"1px solid #2a2f45",overflowY:"auto",flexShrink:0}}>
          <div style={{padding:"10px 8px"}}>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>Habitats</div>
            {HABITATS.map(h=>(
              <button key={h.name} onClick={()=>setHabitat(h)} style={{
                display:"block",width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:5,cursor:"pointer",
                border:"none",background:habitat.name===h.name?h.color+"20":"transparent",
                color:habitat.name===h.name?h.color:"#8b90a8",
                borderLeft:`2px solid ${habitat.name===h.name?h.color:"transparent"}`,
                fontSize:12,fontWeight:habitat.name===h.name?700:400,marginBottom:2,
              }}>
                {h.emoji} {h.name}
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          {/* Habitat info */}
          <div style={{background:"#1e2235",border:`1px solid ${habitat.color}40`,borderRadius:8,padding:16,marginBottom:20}}>
            <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:habitat.color,marginBottom:8}}>
              {habitat.emoji} {habitat.name}
            </h2>
            <p style={{fontSize:13,color:"#8b90a8",lineHeight:1.6,marginBottom:12}}>{habitat.description}</p>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Common</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{habitat.commonTypes.map(t=><TypeBadge key={t} type={t}/>)}</div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Uncommon</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{habitat.uncommonTypes.map(t=><TypeBadge key={t} type={t}/>)}</div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Rare</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{habitat.rareTypes.map(t=><TypeBadge key={t} type={t}/>)}</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Filter by Rank</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {RANK_ORDER.map(r=>(
                  <button key={r} onClick={()=>toggleRank(r)} style={{
                    padding:"3px 8px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1px solid ${RANK_COLORS[r]}60`,
                    background:rankFilter.includes(r)?RANK_COLORS[r]+"20":"transparent",
                    color:rankFilter.includes(r)?RANK_COLORS[r]:"#5a6080",
                  }}>{r}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Roll button */}
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:20}}>
            <button onClick={rollRandom} style={{
              background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:6,
              padding:"10px 20px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Exo 2'",
            }}>🎲 Roll Random Encounter</button>
            <span style={{fontSize:13,color:"#5a6080"}}>{filtered.length} Pokémon available</span>
          </div>

          {/* Rolled result */}
          {rolled && (
            <div style={{background:"#1e2235",border:`2px solid ${TYPE_COLORS[rolled.types[0]]}`,borderRadius:8,padding:16,marginBottom:20}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Wild Encounter!</div>
              <div style={{display:"flex",alignItems:"flex-start",gap:16}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#e8eaf0"}}>{rolled.name}</span>
                    <span style={{fontSize:11,color:"#5a6080"}}>#{String(rolled.number).padStart(3,"0")}</span>
                    {rolled.types.map(t=><TypeBadge key={t} type={t}/>)}
                    <span style={{fontSize:11,fontWeight:700,color:RANK_COLORS[rolled.suggestedRank]}}>{rolled.suggestedRank}</span>
                  </div>
                  <p style={{fontSize:12,color:"#8b90a8",marginBottom:8}}>{rolled.description}</p>
                  <div style={{display:"flex",gap:12,fontSize:11}}>
                    <span style={{color:"#5a6080"}}>HP: <strong style={{color:"#e8eaf0"}}>{rolled.baseHp + rolled.attributes.vitality}</strong></span>
                    <span style={{color:"#5a6080"}}>STR: <strong style={{color:"#e8eaf0"}}>{rolled.attributes.strength}</strong></span>
                    <span style={{color:"#5a6080"}}>DEX: <strong style={{color:"#e8eaf0"}}>{rolled.attributes.dexterity}</strong></span>
                    <span style={{color:"#5a6080"}}>SPC: <strong style={{color:"#e8eaf0"}}>{rolled.attributes.special}</strong></span>
                    <span style={{color:"#5a6080"}}>Abilities: <strong style={{color:"#00d4aa"}}>{rolled.abilities.join(", ")}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pokemon grid */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
            {filtered.map(p=>(
              <div key={p.number} style={{
                background:"#1e2235",border:"1px solid #2a2f45",borderRadius:6,padding:"10px 12px",
                cursor:"pointer",transition:"all 0.12s",
              }}
              onClick={()=>setRolled(p)}
              onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=TYPE_COLORS[p.types[0]];}}
              onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#2a2f45";}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#e8eaf0"}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#3a4060"}}>#{String(p.number).padStart(3,"0")}</span>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:6}}>{p.types.map(t=><TypeBadge key={t} type={t}/>)}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,fontWeight:700,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
                  <span style={{fontSize:10,color:"#5a6080"}}>HP {p.baseHp+p.attributes.vitality} | STR {p.attributes.strength} | SPC {p.attributes.special}</span>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div style={{textAlign:"center",color:"#5a6080",padding:40}}>
              No Pokémon match the current filters for this habitat.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

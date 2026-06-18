"use client";

import { useState, useMemo, useCallback } from "react";
import {
  POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART,
  PokemonEntry, Move, Ability, Item, PokemonType, MoveCategory, Rank,
} from "./data/pokerole-data";

const RANK_COLORS: Record<Rank, string> = {
  Starter: "#78c850", Rookie: "#6890f0", Standard: "#f8d030",
  Advanced: "#f08030", Expert: "#a040a0", Ace: "#e04040",
  Master: "#705898", Champion: "#ffd700",
};

const CAT_COLORS: Record<MoveCategory, { text: string; bg: string }> = {
  Physical: { text: "#f08030", bg: "rgba(240,128,48,0.15)" },
  Special: { text: "#6890f0", bg: "rgba(104,144,240,0.15)" },
  Support: { text: "#78c850", bg: "rgba(120,200,80,0.15)" },
};

const ALL_TYPES: PokemonType[] = [
  "Normal","Fire","Water","Electric","Grass","Ice","Fight","Poison",
  "Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"
];

function TypeBadge({ type, small }: { type: PokemonType; small?: boolean }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",
      padding:small?"1px 6px":"2px 8px",borderRadius:4,
      fontSize:small?10:11,fontWeight:700,letterSpacing:"0.5px",
      color:"#fff",background:TYPE_COLORS[type],textShadow:"0 1px 2px rgba(0,0,0,0.4)",
    }}>{type}</span>
  );
}

function StatPips({ value, limit }: { value: number; limit?: number }) {
  const max = Math.max(limit??value,value,6);
  return (
    <div style={{display:"flex",gap:3}}>
      {Array.from({length:max}).map((_,i)=>(
        <div key={i} style={{
          width:12,height:12,borderRadius:3,
          border:`1px solid ${i<(limit??value)?(i<value?"#00d4aa":"rgba(0,212,170,0.3)"):"#2a2f45"}`,
          background:i<value?"#00d4aa":"transparent",
        }}/>
      ))}
    </div>
  );
}

function HpBar({current,max}:{current:number;max:number}) {
  const pct=max>0?Math.max(0,Math.min(1,current/max)):0;
  const color=pct>0.5?"#00d4aa":pct>0.25?"#ffd32a":"#ff4757";
  return (
    <div style={{background:"#0f1117",borderRadius:4,height:6,overflow:"hidden",marginTop:2}}>
      <div style={{width:`${pct*100}%`,height:"100%",background:color,borderRadius:4,transition:"width 0.3s"}}/>
    </div>
  );
}

function StatBox({label,value}:{label:string;value:string}) {
  return (
    <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
      <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>{label}</div>
      <div style={{fontSize:13,color:"#e8eaf0",fontWeight:600}}>{value}</div>
    </div>
  );
}

function StatRow({label,value}:{label:string;value:string}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:11,color:"#5a6080"}}>{label}</span>
      <span style={{fontSize:12,color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:600}}>{value}</span>
    </div>
  );
}

function TypeRow({label,types,color}:{label:string;types:PokemonType[];color:string}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:11,color,width:56,fontWeight:600}}>{label}</span>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {types.map(t=><TypeBadge key={t} type={t} small/>)}
      </div>
    </div>
  );
}

// ─── Battle Tracker ───────────────────────────────────────────────────────────
interface TrackedPokemon {
  id:string; pokemon:PokemonEntry; nickname:string;
  currentHp:number; maxHp:number; currentWill:number; maxWill:number;
  status:string; notes:string; isExpanded:boolean;
}

const adjBtn:React.CSSProperties={
  width:22,height:22,background:"#242842",border:"1px solid #3a4060",
  borderRadius:4,color:"#00d4aa",cursor:"pointer",fontSize:16,
  display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,
};

function BattleCard({t,onRemove,onUpdate}:{t:TrackedPokemon;onRemove:(id:string)=>void;onUpdate:(id:string,u:Partial<TrackedPokemon>)=>void}) {
  const upd=(u:Partial<TrackedPokemon>)=>onUpdate(t.id,u);
  return (
    <div style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:8,overflow:"hidden",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#161925",cursor:"pointer"}}
        onClick={()=>upd({isExpanded:!t.isExpanded})}>
        <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,background:TYPE_COLORS[t.pokemon.types[0]]}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontFamily:"'Exo 2'",fontWeight:700,color:"#e8eaf0"}}>
            {t.nickname||t.pokemon.name}
            {t.nickname&&<span style={{fontSize:10,color:"#5a6080",marginLeft:6}}>({t.pokemon.name})</span>}
          </div>
          <HpBar current={t.currentHp} max={t.maxHp}/>
        </div>
        <span style={{fontSize:11,color:t.currentHp/t.maxHp>0.5?"#00d4aa":t.currentHp/t.maxHp>0.25?"#ffd32a":"#ff4757",fontFamily:"'Exo 2'",fontWeight:700}}>
          {t.currentHp}/{t.maxHp}
        </span>
        <button onClick={e=>{e.stopPropagation();onRemove(t.id);}}
          style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:14,padding:2}}>✕</button>
      </div>
      {t.isExpanded&&(
        <div style={{padding:"10px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:12}}>
            <div style={{display:"flex",flexDirection:"column",gap:6,flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#5a6080",width:24}}>HP</span>
                <button onClick={()=>upd({currentHp:Math.max(0,t.currentHp-1)})} style={adjBtn}>−</button>
                <span style={{fontSize:13,color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700,minWidth:28,textAlign:"center"}}>{t.currentHp}</span>
                <button onClick={()=>upd({currentHp:Math.min(t.maxHp,t.currentHp+1)})} style={adjBtn}>+</button>
                <span style={{fontSize:11,color:"#5a6080"}}>/{t.maxHp}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#5a6080",width:24}}>WP</span>
                <button onClick={()=>upd({currentWill:Math.max(0,t.currentWill-1)})} style={adjBtn}>−</button>
                <span style={{fontSize:13,color:"#6890f0",fontFamily:"'Exo 2'",fontWeight:700,minWidth:28,textAlign:"center"}}>{t.currentWill}</span>
                <button onClick={()=>upd({currentWill:Math.min(t.maxWill,t.currentWill+1)})} style={adjBtn}>+</button>
                <span style={{fontSize:11,color:"#5a6080"}}>/{t.maxWill}</span>
              </div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#5a6080",width:46}}>Status</span>
            <select value={t.status} onChange={e=>upd({status:e.target.value})}
              style={{flex:1,background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:t.status==="Healthy"?"#00d4aa":"#ff4757",fontSize:11,padding:"3px 6px"}}>
              {["Healthy","Burned","Frozen","Paralyzed","Poisoned","Badly Poisoned","Asleep","Confused","Flinched"].map(s=>(
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Moves</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {t.pokemon.moves.slice(0,6).map((m,i)=>(
                <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
                  <TypeBadge type={m.type} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{m.name}</span>
                  <span style={{fontSize:10,color:"#5a6080",marginLeft:"auto"}}>{m.rank}</span>
                </div>
              ))}
            </div>
          </div>
          <input value={t.nickname} onChange={e=>upd({nickname:e.target.value})}
            placeholder="Nickname..."
            style={{background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:11,padding:"4px 8px",width:"100%"}}/>
          <textarea placeholder="Notes..." value={t.notes} onChange={e=>upd({notes:e.target.value})}
            style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:11,padding:6,resize:"none",minHeight:40,fontFamily:"inherit"}}/>
        </div>
      )}
    </div>
  );
}

// ─── Detail Panels ────────────────────────────────────────────────────────────
function PokemonDetail({pokemon,onTrack}:{pokemon:PokemonEntry;onTrack:(p:PokemonEntry)=>void}) {
  const typeData=useMemo(()=>{
    const weakSet=new Set<PokemonType>();const resSet=new Set<PokemonType>();const immSet=new Set<PokemonType>();
    pokemon.types.forEach(t=>{
      const c=TYPE_CHART[t];
      c.weaknesses.forEach(w=>weakSet.add(w));c.resistances.forEach(r=>resSet.add(r));c.immunities.forEach(i=>immSet.add(i));
    });
    resSet.forEach(r=>weakSet.delete(r));immSet.forEach(i=>{weakSet.delete(i);resSet.delete(i);});
    return{weaknesses:[...weakSet],resistances:[...resSet],immunities:[...immSet]};
  },[pokemon]);

  const attrs=[{label:"STR",key:"strength"as const},{label:"DEX",key:"dexterity"as const},{label:"VIT",key:"vitality"as const},{label:"SPC",key:"special"as const},{label:"INS",key:"insight"as const}];

  const rankGroups=useMemo(()=>{
    const g:Partial<Record<Rank,typeof pokemon.moves>>={};
    pokemon.moves.forEach(m=>{if(!g[m.rank])g[m.rank]=[];g[m.rank]!.push(m);});
    return g;
  },[pokemon]);

  return (
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:20}} className="fade-in">
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
        <div>
          <div style={{fontSize:11,color:"#5a6080",fontFamily:"'Exo 2'",fontWeight:700,letterSpacing:1}}>
            #{String(pokemon.number).padStart(4,"0")} · {pokemon.evolutiveStage} Stage
          </div>
          <h1 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:28,color:"#e8eaf0",lineHeight:1.1}}>{pokemon.name}</h1>
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            {pokemon.types.map(t=><TypeBadge key={t} type={t}/>)}
            <span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:RANK_COLORS[pokemon.suggestedRank]+"20",border:`1px solid ${RANK_COLORS[pokemon.suggestedRank]}40`,color:RANK_COLORS[pokemon.suggestedRank]}}>{pokemon.suggestedRank}</span>
          </div>
        </div>
        <button onClick={()=>onTrack(pokemon)} style={{flexShrink:0,background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:6,padding:"8px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Exo 2'",whiteSpace:"nowrap"}}>
          ⚔️ Track in Battle
        </button>
      </div>

      <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,padding:"12px 16px",background:"#13151f",borderRadius:6,borderLeft:"3px solid #00d4aa"}}>
        {pokemon.description}
      </p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:"#13151f",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:12}}>Attributes</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {attrs.map(a=>(
              <div key={a.key} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:32,fontSize:11,fontWeight:700,color:"#5a6080"}}>{a.label}</span>
                <StatPips value={pokemon.attributes[a.key]} limit={pokemon.attributeLimits?.[a.key]}/>
                <span style={{marginLeft:"auto",fontSize:12,color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700}}>
                  {pokemon.attributes[a.key]}{pokemon.attributeLimits&&<span style={{color:"#5a6080",fontSize:10}}>/{pokemon.attributeLimits[a.key]}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#13151f",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:12}}>Combat Stats</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <StatRow label="Base HP" value={`${pokemon.baseHp} + VIT (${pokemon.baseHp+pokemon.attributes.vitality} at base)`}/>
            <StatRow label="Will Points" value={`INS + 3 (${pokemon.attributes.insight+3} at base)`}/>
            <StatRow label="Defense" value={`= Vitality (${pokemon.attributes.vitality})`}/>
            <StatRow label="Sp. Defense" value={`= Insight (${pokemon.attributes.insight})`}/>
            <StatRow label="Max Moves" value={`INS + 3 = ${pokemon.attributes.insight+3}`}/>
            <StatRow label="Height" value={pokemon.height}/>
            <StatRow label="Weight" value={pokemon.weight}/>
          </div>
        </div>
      </div>

      <div>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Abilities</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {pokemon.abilities.map(a=>{
            const ab=ABILITIES.find(x=>x.name===a);
            return (
              <div key={a} style={{flex:1,minWidth:180,background:"#13151f",border:"1px solid #2a2f45",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#e8eaf0",marginBottom:4}}>{a}</div>
                <div style={{fontSize:11,color:"#8b90a8",lineHeight:1.5}}>{ab?.effect??"See Abilities reference"}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Type Matchups</div>
        <div style={{background:"#13151f",borderRadius:8,padding:14,display:"flex",flexDirection:"column",gap:10}}>
          {typeData.weaknesses.length>0&&<TypeRow label="Weak to" types={typeData.weaknesses} color="#ff4757"/>}
          {typeData.resistances.length>0&&<TypeRow label="Resists" types={typeData.resistances} color="#00d4aa"/>}
          {typeData.immunities.length>0&&<TypeRow label="Immune" types={typeData.immunities} color="#ffd32a"/>}
          {typeData.weaknesses.length===0&&typeData.resistances.length===0&&<div style={{fontSize:12,color:"#5a6080"}}>No special type interactions</div>}
        </div>
      </div>

      {(pokemon.evolvesTo||pokemon.evolutiveStage)&&(
        <div style={{background:"#13151f",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Evolution</div>
          <div style={{fontSize:12,color:"#5a6080",marginBottom:6}}>Stage: {pokemon.evolutiveStage}</div>
          {pokemon.evolvesTo&&(
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontWeight:700,fontSize:13,color:"#e8eaf0"}}>{pokemon.name}</span>
              <span style={{color:"#3a4060",fontSize:16}}>→</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:"#00d4aa"}}>{pokemon.evolvesTo}</div>
                {pokemon.evolvesWith&&<div style={{fontSize:11,color:"#5a6080"}}>via: {pokemon.evolvesWith}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Learnable Moves</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(Object.entries(rankGroups) as [Rank,typeof pokemon.moves][]).map(([rank,moves])=>(
            <div key={rank}>
              <div style={{fontSize:10,fontWeight:700,color:RANK_COLORS[rank],letterSpacing:"0.5px",textTransform:"uppercase",padding:"3px 8px",background:RANK_COLORS[rank]+"12",borderRadius:4,marginBottom:6,borderLeft:`2px solid ${RANK_COLORS[rank]}`}}>{rank}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,paddingLeft:8}}>
                {moves.map((m,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,padding:"4px 8px"}}>
                    <TypeBadge type={m.type} small/><span style={{fontSize:12,color:"#e8eaf0"}}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoveDetail({move}:{move:Move}) {
  const cat=CAT_COLORS[move.category];
  const relatedPokemon=POKEMON.filter(p=>p.moves.some(m=>m.name===move.name));
  return (
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}} className="fade-in">
      <div>
        <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
          <TypeBadge type={move.type}/>
          <span style={{fontSize:12,fontWeight:700,color:cat.text,background:cat.bg,padding:"2px 8px",borderRadius:4,border:`1px solid ${cat.text}40`}}>{move.category}</span>
        </div>
        <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:26,color:"#e8eaf0"}}>{move.name}</h2>
      </div>
      <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,padding:"12px 16px",background:"#13151f",borderRadius:6,borderLeft:`3px solid ${TYPE_COLORS[move.type]}`}}>{move.description}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <StatBox label="Power" value={move.power==="−"||move.power==="-"?"—":move.power}/>
        <StatBox label="Accuracy Roll" value={move.accuracy}/>
        <StatBox label="Damage Pool" value={move.damagePool==="−"||move.damagePool==="-"?"—":move.damagePool}/>
        <StatBox label="Added Effects" value={move.effect}/>
      </div>
      {relatedPokemon.length>0&&(
        <div>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Pokémon that learn this move</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {relatedPokemon.map(p=>(
              <div key={p.number} style={{display:"flex",alignItems:"center",gap:5,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,padding:"4px 8px"}}>
                <TypeBadge type={p.types[0]} small/><span style={{fontSize:12,color:"#e8eaf0"}}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AbilityDetail({ability}:{ability:Ability}) {
  const pokemon=POKEMON.filter(p=>p.abilities.includes(ability.name));
  return (
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}} className="fade-in">
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:26,color:"#e8eaf0"}}>{ability.name}</h2>
        {ability.isUnique&&<span style={{fontSize:11,fontWeight:700,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"2px 8px",borderRadius:4,border:"1px solid rgba(255,211,42,0.3)"}}>UNIQUE</span>}
      </div>
      <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,padding:"12px 16px",background:"#13151f",borderRadius:6,borderLeft:"3px solid #00d4aa"}}>{ability.description}</p>
      <div style={{background:"#13151f",borderRadius:6,padding:"14px 16px"}}>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Effect</div>
        <div style={{fontSize:13,color:"#e8eaf0",lineHeight:1.7}}>{ability.effect}</div>
      </div>
      {pokemon.length>0&&(
        <div>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Pokémon with this Ability</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {pokemon.map(p=>(
              <div key={p.number} style={{display:"flex",alignItems:"center",gap:5,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,padding:"4px 8px"}}>
                <TypeBadge type={p.types[0]} small/><span style={{fontSize:12,color:"#e8eaf0"}}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemDetail({item}:{item:Item}) {
  return (
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}} className="fade-in">
      <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:26,color:"#e8eaf0"}}>{item.name}</h2>
      <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,padding:"12px 16px",background:"#13151f",borderRadius:6,borderLeft:"3px solid #ffd32a"}}>{item.description}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <StatBox label="Effect" value={item.effect}/>
        <StatBox label="Cost" value={item.cost?`₽${item.cost.toLocaleString()}`:"—"}/>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
type Tab="pokedex"|"moves"|"abilities"|"items";

export default function App() {
  const [tab,setTab]=useState<Tab>("pokedex");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState<PokemonType|null>(null);
  const [catFilter,setCatFilter]=useState<MoveCategory|null>(null);
  const [selPokemon,setSelPokemon]=useState<PokemonEntry|null>(POKEMON[0]);
  const [selMove,setSelMove]=useState<Move|null>(null);
  const [selAbility,setSelAbility]=useState<Ability|null>(null);
  const [selItem,setSelItem]=useState<Item|null>(null);
  const [tracked,setTracked]=useState<TrackedPokemon[]>([]);
  const [showTracker,setShowTracker]=useState(true);

  const filtPokemon=useMemo(()=>POKEMON.filter(p=>{
    if(search&&!p.name.toLowerCase().includes(search.toLowerCase())&&!String(p.number).includes(search))return false;
    if(typeFilter&&!p.types.includes(typeFilter))return false;
    return true;
  }),[search,typeFilter]);

  const filtMoves=useMemo(()=>MOVES.filter(m=>{
    if(search&&!m.name.toLowerCase().includes(search.toLowerCase()))return false;
    if(typeFilter&&m.type!==typeFilter)return false;
    if(catFilter&&m.category!==catFilter)return false;
    return true;
  }),[search,typeFilter,catFilter]);

  const filtAbilities=useMemo(()=>ABILITIES.filter(a=>{
    if(search&&!a.name.toLowerCase().includes(search.toLowerCase())&&!a.effect.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  }),[search]);

  const filtItems=useMemo(()=>ITEMS.filter(i=>{
    if(search&&!i.name.toLowerCase().includes(search.toLowerCase())&&!i.effect.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  }),[search]);

  const trackPokemon=useCallback((pokemon:PokemonEntry)=>{
    const hp=pokemon.baseHp+pokemon.attributes.vitality;
    const will=pokemon.attributes.insight+3;
    setTracked(prev=>[...prev,{id:`${pokemon.number}-${Date.now()}`,pokemon,nickname:"",currentHp:hp,maxHp:hp,currentWill:will,maxWill:will,status:"Healthy",notes:"",isExpanded:true}]);
    setShowTracker(true);
  },[]);

  const updateTracked=useCallback((id:string,u:Partial<TrackedPokemon>)=>{
    setTracked(prev=>prev.map(t=>t.id===id?{...t,...u}:t));
  },[]);

  const changeTab=(t:Tab)=>{setTab(t);setSearch("");setTypeFilter(null);setCatFilter(null);};

  const tabStyle=(t:Tab):React.CSSProperties=>({
    padding:"6px 14px",borderRadius:6,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",
    color:tab===t?"#00d4aa":"#8b90a8",background:tab===t?"rgba(0,212,170,0.12)":"transparent",
  });

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",overflow:"hidden"}}>
      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"0 16px",height:50,background:"#13151f",borderBottom:"1px solid #2a2f45",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:4}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#00d4aa,#3d8bff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⬡</div>
          <span style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></span>
          <span style={{fontSize:10,color:"#3a4060",fontWeight:600,marginLeft:4}}>3.0</span>
        </div>
        {(["pokedex","moves","abilities","items"] as Tab[]).map(t=>(
          <button key={t} onClick={()=>changeTab(t)} style={tabStyle(t)}>
            {t==="pokedex"?"Pokédex":t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,color:"#5a6080"}}>v3.0 Reference</span>
          <button onClick={()=>setShowTracker(!showTracker)} style={{
            padding:"5px 12px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",
            border:`1px solid ${showTracker?"#00d4aa":"#3a4060"}`,
            color:showTracker?"#00d4aa":"#8b90a8",background:showTracker?"rgba(0,212,170,0.1)":"transparent",
          }}>
            ⚔️ Tracker{tracked.length>0?` (${tracked.length})`:""}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:272,display:"flex",flexDirection:"column",background:"#13151f",borderRight:"1px solid #2a2f45",flexShrink:0}}>
          <div style={{padding:"10px",display:"flex",flexDirection:"column",gap:8,borderBottom:"1px solid #2a2f45"}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#5a6080",fontSize:13,pointerEvents:"none"}}>🔍</span>
              <input type="text" placeholder={`Search ${tab==="pokedex"?"Pokémon":tab}…`} value={search}
                onChange={e=>setSearch(e.target.value)}
                style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:6,padding:"7px 10px 7px 30px",color:"#e8eaf0",fontSize:13,outline:"none"}}
                onFocus={e=>{(e.target as HTMLInputElement).style.borderColor="#00d4aa";}}
                onBlur={e=>{(e.target as HTMLInputElement).style.borderColor="#2a2f45";}}/>
            </div>
            {(tab==="pokedex"||tab==="moves")&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                <button onClick={()=>setTypeFilter(null)} style={{fontSize:10,padding:"2px 6px",borderRadius:3,cursor:"pointer",border:"1px solid #3a4060",fontWeight:600,background:typeFilter===null?"#3a4060":"transparent",color:typeFilter===null?"#e8eaf0":"#5a6080"}}>All</button>
                {ALL_TYPES.map(t=>(
                  <button key={t} onClick={()=>setTypeFilter(typeFilter===t?null:t)} style={{fontSize:9,padding:"2px 5px",borderRadius:3,cursor:"pointer",border:`1px solid ${TYPE_COLORS[t]}60`,background:typeFilter===t?TYPE_COLORS[t]:`${TYPE_COLORS[t]}15`,color:typeFilter===t?"#fff":TYPE_COLORS[t],fontWeight:700}}>{t}</button>
                ))}
              </div>
            )}
            {tab==="moves"&&(
              <div style={{display:"flex",gap:4}}>
                {(["Physical","Special","Support"] as MoveCategory[]).map(c=>(
                  <button key={c} onClick={()=>setCatFilter(catFilter===c?null:c)} style={{flex:1,fontSize:10,padding:"3px 4px",borderRadius:4,cursor:"pointer",fontWeight:700,border:`1px solid ${CAT_COLORS[c].text}50`,background:catFilter===c?CAT_COLORS[c].bg:"transparent",color:catFilter===c?CAT_COLORS[c].text:"#5a6080"}}>{c}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"5px 8px",fontSize:11,color:"#5a6080",borderBottom:"1px solid #2a2f45"}}>
            {tab==="pokedex"&&`${filtPokemon.length} Pokémon`}
            {tab==="moves"&&`${filtMoves.length} Moves`}
            {tab==="abilities"&&`${filtAbilities.length} Abilities`}
            {tab==="items"&&`${filtItems.length} Items`}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"4px"}}>
            {tab==="pokedex"&&filtPokemon.map(p=>(
              <div key={p.number} onClick={()=>setSelPokemon(p)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:5,cursor:"pointer",transition:"background 0.1s",background:selPokemon?.number===p.number?"#242842":"transparent",borderLeft:`2px solid ${selPokemon?.number===p.number?"#00d4aa":"transparent"}`}}
                onMouseEnter={e=>{if(selPokemon?.number!==p.number)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                onMouseLeave={e=>{if(selPokemon?.number!==p.number)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                <span style={{fontSize:10,color:"#3a4060",fontFamily:"'Exo 2'",fontWeight:700,width:30,flexShrink:0}}>#{String(p.number).padStart(3,"0")}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                  <div style={{display:"flex",gap:4,marginTop:2}}>{p.types.map(t=><TypeBadge key={t} type={t} small/>)}</div>
                </div>
                <div style={{fontSize:10,color:RANK_COLORS[p.suggestedRank],flexShrink:0,fontWeight:600}}>{p.suggestedRank}</div>
              </div>
            ))}
            {tab==="moves"&&filtMoves.map(m=>(
              <div key={m.name} onClick={()=>setSelMove(m)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:5,cursor:"pointer",transition:"background 0.1s",background:selMove?.name===m.name?"#242842":"transparent",borderLeft:`2px solid ${selMove?.name===m.name?TYPE_COLORS[m.type]:"transparent"}`}}
                onMouseEnter={e=>{if(selMove?.name!==m.name)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                onMouseLeave={e=>{if(selMove?.name!==m.name)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                <TypeBadge type={m.type} small/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e8eaf0"}}>{m.name}</div>
                  <div style={{fontSize:10,color:CAT_COLORS[m.category].text,fontWeight:600}}>{m.category}</div>
                </div>
                {m.power!=="-"&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#8b90a8",flexShrink:0}}>PWR {m.power}</span>}
              </div>
            ))}
            {tab==="abilities"&&filtAbilities.map(a=>(
              <div key={a.name} onClick={()=>setSelAbility(a)} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",borderRadius:5,cursor:"pointer",transition:"background 0.1s",background:selAbility?.name===a.name?"#242842":"transparent",borderLeft:`2px solid ${selAbility?.name===a.name?"#00d4aa":"transparent"}`}}
                onMouseEnter={e=>{if(selAbility?.name!==a.name)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                onMouseLeave={e=>{if(selAbility?.name!==a.name)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#e8eaf0"}}>{a.name}</span>
                    {a.isUnique&&<span style={{fontSize:9,fontWeight:700,color:"#ffd32a"}}>UNIQUE</span>}
                  </div>
                  <div style={{fontSize:11,color:"#5a6080",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.effect.slice(0,55)}…</div>
                </div>
              </div>
            ))}
            {tab==="items"&&filtItems.map(i=>(
              <div key={i.name} onClick={()=>setSelItem(i)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:5,cursor:"pointer",transition:"background 0.1s",background:selItem?.name===i.name?"#242842":"transparent",borderLeft:`2px solid ${selItem?.name===i.name?"#ffd32a":"transparent"}`}}
                onMouseEnter={e=>{if(selItem?.name!==i.name)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                onMouseLeave={e=>{if(selItem?.name!==i.name)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e8eaf0"}}>{i.name}</div>
                  <div style={{fontSize:11,color:"#5a6080",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.effect}</div>
                </div>
                {i.cost&&<span style={{fontSize:11,color:"#ffd32a",flexShrink:0}}>₽{i.cost.toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div style={{flex:1,overflowY:"auto",background:"#0f1117"}}>
          {tab==="pokedex"&&selPokemon&&<PokemonDetail pokemon={selPokemon} onTrack={trackPokemon}/>}
          {tab==="moves"&&selMove&&<MoveDetail move={selMove}/>}
          {tab==="abilities"&&selAbility&&<AbilityDetail ability={selAbility}/>}
          {tab==="items"&&selItem&&<ItemDetail item={selItem}/>}
          {((tab==="pokedex"&&!selPokemon)||(tab==="moves"&&!selMove)||(tab==="abilities"&&!selAbility)||(tab==="items"&&!selItem))&&(
            <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#3a4060",flexDirection:"column",gap:8}}>
              <div style={{fontSize:40}}>📖</div>
              <div style={{fontSize:14}}>Select an entry to view details</div>
            </div>
          )}
        </div>

        {/* Battle Tracker */}
        {showTracker&&(
          <div style={{width:296,display:"flex",flexDirection:"column",background:"#13151f",borderLeft:"1px solid #2a2f45",flexShrink:0}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0"}}>⚔️ Battle Tracker</div>
                <div style={{fontSize:10,color:"#5a6080",marginTop:1}}>{tracked.length} Pokémon pinned</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {tracked.length>0&&<button onClick={()=>setTracked([])} style={{fontSize:11,color:"#ff4757",background:"none",border:"none",cursor:"pointer"}}>Clear</button>}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
              {tracked.length===0?(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,padding:24}}>
                  <div style={{fontSize:36}}>⚔️</div>
                  <div style={{color:"#5a6080",fontSize:12,textAlign:"center",lineHeight:1.5}}>
                    Click <strong style={{color:"#00d4aa"}}>Track in Battle</strong> on any Pokémon to pin it here and track HP, Will, status, and moves during a session.
                  </div>
                </div>
              ):tracked.map(t=>(
                <BattleCard key={t.id} t={t} onRemove={id=>setTracked(prev=>prev.filter(x=>x.id!==id))} onUpdate={updateTracked}/>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

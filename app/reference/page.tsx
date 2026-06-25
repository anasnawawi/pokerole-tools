"use client";
import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART, STATUS_EFFECTS, WEATHER_EFFECTS, MISSINGNO, PokemonEntry, Move, Ability, Item, PokemonType, MoveCategory, Rank } from "../data/pokerole-data";

const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};
const CAT_COLORS: Record<MoveCategory,{text:string;bg:string}> = {Physical:{text:"#f08030",bg:"rgba(240,128,48,0.15)"},Special:{text:"#6890f0",bg:"rgba(104,144,240,0.15)"},Support:{text:"#78c850",bg:"rgba(120,200,80,0.15)"}};
const ALL_TYPES: PokemonType[] = ["Normal","Fire","Water","Electric","Grass","Ice","Fight","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

type Tab = "pokedex"|"moves"|"abilities"|"items"|"types"|"status"|"weather";

function TypeBadge({type,small}:{type:PokemonType;small?:boolean}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 8px",borderRadius:4,fontSize:small?9:11,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]}}>{type}</span>;
}

function MovePopupPanel({move,onClose}:{move:Move;onClose:()=>void}) {
  const cat=CAT_COLORS[move.category];
  const related=POKEMON.filter(p=>p.moves.some(m=>m.name===move.name));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"85vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",gap:8,alignItems:"center"}}>
          <TypeBadge type={move.type}/><span style={{fontSize:11,fontWeight:700,color:cat.text,background:cat.bg,padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#e8eaf0",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:17}}>✕</button>
        </div>
        <div style={{padding:16}}>
          <p style={{fontSize:12,color:"#8b90a8",marginBottom:12,lineHeight:1.6}}>{move.description}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[["Power",move.power],["Accuracy",move.accuracy],["Damage Pool",move.damagePool],["Effect",move.effect]].map(([l,v])=>(
              <div key={l} style={{background:"#13151f",borderRadius:5,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                <div style={{fontSize:12,color:"#e8eaf0",fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          {related.length>0&&(
            <div>
              <div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Learned by</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {related.map(p=>(
                  <div key={p.number} style={{display:"flex",alignItems:"center",gap:4,background:"#13151f",border:"1px solid #2a2f45",borderRadius:3,padding:"2px 7px"}}>
                    <TypeBadge type={p.types[0]} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AbilityPopupPanel({ability,onClose}:{ability:Ability;onClose:()=>void}) {
  const pokemon=POKEMON.filter(p=>p.abilities.includes(ability.name));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:420,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",gap:8}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#e8eaf0",margin:0,flex:1}}>{ability.name}</h3>
          {ability.isUnique&&<span style={{fontSize:10,fontWeight:700,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"2px 7px",borderRadius:3}}>UNIQUE</span>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:17}}>✕</button>
        </div>
        <div style={{padding:16}}>
          <p style={{fontSize:12,color:"#8b90a8",marginBottom:12,lineHeight:1.6}}>{ability.description}</p>
          <div style={{background:"#13151f",borderRadius:5,padding:"10px 12px",marginBottom:12,borderLeft:"3px solid #00d4aa"}}>
            <div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Effect</div>
            <div style={{fontSize:12,color:"#e8eaf0",lineHeight:1.6}}>{ability.effect}</div>
          </div>
          {pokemon.length>0&&(
            <div>
              <div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Pokémon with this ability</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {pokemon.map(p=>(
                  <div key={p.number} style={{display:"flex",alignItems:"center",gap:4,background:"#13151f",border:"1px solid #2a2f45",borderRadius:3,padding:"2px 7px"}}>
                    <TypeBadge type={p.types[0]} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PokemonDetail({pokemon,onTrack}:{pokemon:PokemonEntry;onTrack:(p:PokemonEntry)=>void}) {
  const [movePopup,setMovePopup]=useState<Move|null>(null);
  const [abilityPopup,setAbilityPopup]=useState<Ability|null>(null);

  const typeData=useMemo(()=>{
    const wk=new Set<PokemonType>(),rs=new Set<PokemonType>(),im=new Set<PokemonType>();
    pokemon.types.forEach(t=>{const c=TYPE_CHART[t];c.weaknesses.forEach(w=>wk.add(w));c.resistances.forEach(r=>rs.add(r));c.immunities.forEach(i=>im.add(i));});
    rs.forEach(r=>wk.delete(r));im.forEach(i=>{wk.delete(i);rs.delete(i);});
    return{weaknesses:[...wk],resistances:[...rs],immunities:[...im]};
  },[pokemon]);

  const rankGroups=useMemo(()=>{
    const g:Partial<Record<Rank,typeof pokemon.moves>>={};
    pokemon.moves.forEach(m=>{if(!g[m.rank])g[m.rank]=[];g[m.rank]!.push(m);});
    return g;
  },[pokemon]);

  const attrs=[{l:"STR",k:"strength"as const},{l:"DEX",k:"dexterity"as const},{l:"VIT",k:"vitality"as const},{l:"SPC",k:"special"as const},{l:"INS",k:"insight"as const}];

  return (
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:18}}>
      {movePopup&&<MovePopupPanel move={movePopup} onClose={()=>setMovePopup(null)}/>}
      {abilityPopup&&<AbilityPopupPanel ability={abilityPopup} onClose={()=>setAbilityPopup(null)}/>}

      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
        <div>
          <div style={{fontSize:11,color:"#5a6080",fontFamily:"'Exo 2'",fontWeight:700,letterSpacing:1}}>#{String(pokemon.number).padStart(4,"0")} · {pokemon.evolutiveStage} Stage</div>
          <h1 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:28,color:"#e8eaf0",lineHeight:1.1}}>{pokemon.name}</h1>
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            {pokemon.types.map(t=><TypeBadge key={t} type={t}/>)}
            <span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:RANK_COLORS[pokemon.suggestedRank]+"20",border:`1px solid ${RANK_COLORS[pokemon.suggestedRank]}40`,color:RANK_COLORS[pokemon.suggestedRank]}}>{pokemon.suggestedRank}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",flexShrink:0}}>
          <button onClick={()=>{
            const w=window.open("","_blank","width=600,height=800,resizable=yes,scrollbars=yes");
            if(!w)return;
            const attrs=`STR ${pokemon.attributes.strength}/${pokemon.attributeLimits?.strength??5} | DEX ${pokemon.attributes.dexterity}/${pokemon.attributeLimits?.dexterity??5} | VIT ${pokemon.attributes.vitality}/${pokemon.attributeLimits?.vitality??5} | SPC ${pokemon.attributes.special}/${pokemon.attributeLimits?.special??5} | INS ${pokemon.attributes.insight}/${pokemon.attributeLimits?.insight??5}`;
            const moves=pokemon.moves.slice(0,20).map(m=>`<tr><td style="padding:2px 8px;color:#a0a8c0">${m.rank}</td><td style="padding:2px 8px;color:#e8eaf0">${m.name}</td><td style="padding:2px 8px;color:#8b90a8">${m.type}</td></tr>`).join("");
            w.document.write(`<!DOCTYPE html><html><head><title>${pokemon.name} — PokeRole</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f1117;color:#e8eaf0;font-family:Inter,sans-serif;padding:20px;font-size:13px}h1{font-family:'Exo 2',sans-serif;font-size:24px;margin-bottom:6px}h3{font-family:'Exo 2',sans-serif;font-size:14px;color:#5a6080;margin:14px 0 6px;text-transform:uppercase;letter-spacing:1px}p{color:#8b90a8;line-height:1.5;margin-bottom:10px}.badge{display:inline-flex;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;margin-right:4px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #1a1d27}</style></head><body>
            <h1>${pokemon.name} <span style="font-size:14px;color:#5a6080">#${String(pokemon.number).padStart(3,"0")} · ${pokemon.evolutiveStage} Stage</span></h1>
            ${pokemon.types.map(t=>`<span class="badge" style="background:#4a5060">${t}</span>`).join("")}
            <span style="font-size:11px;color:#8b90a8;margin-left:8px">${pokemon.suggestedRank}</span>
            <p style="margin-top:10px">${pokemon.description}</p>
            <h3>Attributes</h3><p>${attrs}</p>
            <p>HP: ${pokemon.baseHp + pokemon.attributes.vitality} | WP: ${pokemon.attributes.insight+3} | DEF: ${pokemon.attributes.vitality} | SP.DEF: ${pokemon.attributes.insight}</p>
            <h3>Abilities</h3><p>${pokemon.abilities.join(" / ")}</p>
            <h3>Moves</h3><table>${moves}</table>
            </body></html>`);
            w.document.close();
          }} style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:5,color:"#8b90a8",padding:"6px 8px",cursor:"pointer",fontSize:13,fontWeight:700}} title="Pop out to new window">↗</button>
          <button onClick={()=>onTrack(pokemon)} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:6,padding:"8px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Exo 2'",whiteSpace:"nowrap"}}>⚔️ Add to Battle Tracker</button>
        </div>
      </div>

      <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,padding:"10px 14px",background:"#13151f",borderRadius:6,borderLeft:"3px solid #00d4aa"}}>{pokemon.description}</p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:"#13151f",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Attributes</div>
          {attrs.map(a=>(
            <div key={a.k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:32,fontSize:11,fontWeight:700,color:"#5a6080"}}>{a.l}</span>
              <div style={{display:"flex",gap:3}}>
                {Array.from({length:Math.max(pokemon.attributeLimits?.[a.k]??pokemon.attributes[a.k],pokemon.attributes[a.k],6)}).map((_,i)=>(
                  <div key={i} style={{width:12,height:12,borderRadius:2,border:`1px solid ${i<(pokemon.attributeLimits?.[a.k]??pokemon.attributes[a.k])?(i<pokemon.attributes[a.k]?"#00d4aa":"rgba(0,212,170,0.3)"):"#2a2f45"}`,background:i<pokemon.attributes[a.k]?"#00d4aa":"transparent"}}/>
                ))}
              </div>
              <span style={{marginLeft:"auto",fontSize:12,color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700}}>{pokemon.attributes[a.k]}{pokemon.attributeLimits&&<span style={{color:"#5a6080",fontSize:10}}>/{pokemon.attributeLimits[a.k]}</span>}</span>
            </div>
          ))}
        </div>
        <div style={{background:"#13151f",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Combat Stats</div>
          {[["Base HP",`${pokemon.baseHp} + VIT (${pokemon.baseHp+pokemon.attributes.vitality})`],["Will Points",`INS + 3 (${pokemon.attributes.insight+3})`],["Defense",`= VIT (${pokemon.attributes.vitality})`],["Sp. Defense",`= INS (${pokemon.attributes.insight})`],["Max Moves",`INS + 3 = ${pokemon.attributes.insight+3}`],["Height",pokemon.height],["Weight",pokemon.weight]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:11,color:"#5a6080"}}>{l}</span>
              <span style={{fontSize:12,color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Abilities with popups */}
      <div>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Abilities <span style={{color:"#00d4aa",fontWeight:400,letterSpacing:0,textTransform:"none"}}>(click to expand)</span></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {pokemon.abilities.map(a=>{
            const ab=ABILITIES.find(x=>x.name===a);
            return (
              <button key={a} onClick={()=>ab&&setAbilityPopup(ab)} style={{flex:1,minWidth:160,background:"#13151f",border:"1px solid #2a2f45",borderRadius:6,padding:"8px 12px",cursor:ab?"pointer":"default",textAlign:"left",transition:"border-color 0.1s"}}
                onMouseEnter={e=>{if(ab)(e.currentTarget as HTMLButtonElement).style.borderColor="#00d4aa";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2a2f45";}}>
                <div style={{fontWeight:700,fontSize:13,color:"#00d4aa",marginBottom:3}}>{a}</div>
                <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{ab?.effect?.slice(0,70)??"See ability reference"}…</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Type matchups */}
      <div style={{background:"#13151f",borderRadius:8,padding:14}}>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Type Matchups</div>
        {typeData.weaknesses.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:11,color:"#ff4757",width:56,fontWeight:600}}>Weak to</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{typeData.weaknesses.map(t=><TypeBadge key={t} type={t} small/>)}</div>
          </div>
        )}
        {typeData.resistances.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:11,color:"#00d4aa",width:56,fontWeight:600}}>Resists</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{typeData.resistances.map(t=><TypeBadge key={t} type={t} small/>)}</div>
          </div>
        )}
        {typeData.immunities.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"#ffd32a",width:56,fontWeight:600}}>Immune</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{typeData.immunities.map(t=><TypeBadge key={t} type={t} small/>)}</div>
          </div>
        )}
      </div>

      {/* Evolution */}
      {pokemon.evolvesTo&&(
        <div style={{background:"#13151f",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Evolution — Stage: {pokemon.evolutiveStage}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontWeight:700,fontSize:13,color:"#e8eaf0"}}>{pokemon.name}</span>
            <span style={{color:"#3a4060",fontSize:18}}>→</span>
            <div><div style={{fontWeight:700,fontSize:13,color:"#00d4aa"}}>{pokemon.evolvesTo}</div>{pokemon.evolvesWith&&<div style={{fontSize:11,color:"#5a6080"}}>via: {pokemon.evolvesWith}</div>}</div>
          </div>
        </div>
      )}

      {/* Moves with popups */}
      <div>
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Learnable Moves <span style={{color:"#00d4aa",fontWeight:400,letterSpacing:0,textTransform:"none"}}>(click for details)</span></div>
        {(Object.entries(rankGroups) as [Rank,typeof pokemon.moves][]).map(([rank,moves])=>(
          <div key={rank} style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:RANK_COLORS[rank],letterSpacing:"0.5px",textTransform:"uppercase",padding:"3px 8px",background:RANK_COLORS[rank]+"12",borderRadius:4,marginBottom:5,borderLeft:`2px solid ${RANK_COLORS[rank]}`}}>{rank}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,paddingLeft:8}}>
              {moves.map((m,i)=>{
                const moveData=MOVES.find(mv=>mv.name===m.name);
                return (
                  <button key={i} onClick={()=>moveData&&setMovePopup(moveData)}
                    style={{display:"flex",alignItems:"center",gap:5,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,padding:"4px 8px",cursor:moveData?"pointer":"default",transition:"border-color 0.1s"}}
                    onMouseEnter={e=>{if(moveData)(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type];}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2a2f45";}}>
                    <TypeBadge type={m.type} small/><span style={{fontSize:12,color:"#e8eaf0"}}>{m.name}</span>
                    {moveData&&<span style={{fontSize:9,color:"#5a6080"}}>▶</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReferenceTabs() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "pokedex";
  const [tab,setTab]=useState<Tab>(initialTab);
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState<PokemonType|null>(null);
  const [catFilter,setCatFilter]=useState<MoveCategory|null>(null);
  const [selPokemon,setSelPokemon]=useState<PokemonEntry|null>(POKEMON[0]);
  const [selMove,setSelMove]=useState<Move|null>(null);
  const [selAbility,setSelAbility]=useState<Ability|null>(null);
  const [selItem,setSelItem]=useState<Item|null>(null);

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
    if(search&&!i.name.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  }),[search]);

  const changeTab=(t:Tab)=>{setTab(t);setSearch("");setTypeFilter(null);setCatFilter(null);};

  const trackPokemon=(p:PokemonEntry)=>{
    sessionStorage.setItem("track_pokemon",String(p.number));
    window.open("/gm-screen","_blank");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",overflow:"hidden"}}>
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 16px",height:48,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060",margin:"0 4px"}}>/</span>
        {(["pokedex","moves","abilities","items","types","status","weather"] as Tab[]).map(t=>(
          <button key={t} onClick={()=>changeTab(t)} style={{padding:"5px 12px",borderRadius:5,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",color:tab===t?"#00d4aa":"#8b90a8",background:tab===t?"rgba(0,212,170,0.12)":"transparent"}}>
            {t==="pokedex"?"Pokédex":t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </nav>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        {["pokedex","moves","abilities","items"].includes(tab)&&(
          <div style={{width:260,display:"flex",flexDirection:"column",background:"#13151f",borderRight:"1px solid #2a2f45",flexShrink:0}}>
            <div style={{padding:"10px",display:"flex",flexDirection:"column",gap:7,borderBottom:"1px solid #2a2f45"}}>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:"#5a6080",fontSize:12,pointerEvents:"none"}}>🔍</span>
                <input type="text" placeholder={`Search ${tab==="pokedex"?"Pokémon":tab}…`} value={search} onChange={e=>setSearch(e.target.value)}
                  style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:5,padding:"6px 8px 6px 28px",color:"#e8eaf0",fontSize:12,outline:"none"}}
                  onFocus={e=>{(e.target as HTMLInputElement).style.borderColor="#00d4aa";}}
                  onBlur={e=>{(e.target as HTMLInputElement).style.borderColor="#2a2f45";}}/>
              </div>
              {(tab==="pokedex"||tab==="moves")&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  <button onClick={()=>setTypeFilter(null)} style={{fontSize:9,padding:"2px 5px",borderRadius:3,cursor:"pointer",border:"1px solid #3a4060",fontWeight:600,background:typeFilter===null?"#3a4060":"transparent",color:typeFilter===null?"#e8eaf0":"#5a6080"}}>All</button>
                  {ALL_TYPES.map(t=>(
                    <button key={t} onClick={()=>setTypeFilter(typeFilter===t?null:t)} style={{fontSize:8,padding:"1px 4px",borderRadius:3,cursor:"pointer",border:`1px solid ${TYPE_COLORS[t]}60`,background:typeFilter===t?TYPE_COLORS[t]:`${TYPE_COLORS[t]}15`,color:typeFilter===t?"#fff":TYPE_COLORS[t],fontWeight:700}}>{t}</button>
                  ))}
                </div>
              )}
              {tab==="moves"&&(
                <div style={{display:"flex",gap:3}}>
                  {(["Physical","Special","Support"] as MoveCategory[]).map(c=>(
                    <button key={c} onClick={()=>setCatFilter(catFilter===c?null:c)} style={{flex:1,fontSize:9,padding:"3px 4px",borderRadius:3,cursor:"pointer",fontWeight:700,border:`1px solid ${CAT_COLORS[c].text}50`,background:catFilter===c?CAT_COLORS[c].bg:"transparent",color:catFilter===c?CAT_COLORS[c].text:"#5a6080"}}>{c}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:4}}>
              {tab==="pokedex"&&(
                <>
                  {/* Column headers */}
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"3px 8px",borderBottom:"1px solid #2a2f45",marginBottom:2}}>
                    <span style={{fontSize:9,color:"#3a4060",fontWeight:700,width:28,flexShrink:0}}>#</span>
                    <span style={{fontSize:9,color:"#5a6080",fontWeight:700,flex:1}}>NAME / TYPE</span>
                    <span style={{fontSize:9,color:"#5a6080",fontWeight:700,flexShrink:0}}>RANK</span>
                  </div>
                  {filtPokemon.length===0&&<div style={{textAlign:"center",color:"#5a6080",padding:20,fontSize:11}}>No Pokémon match "{search}"</div>}
                  {filtPokemon.map(p=>(
                    <div key={`${p.number}-${p.name}`} onClick={()=>setSelPokemon(p)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,cursor:"pointer",background:selPokemon?.number===p.number&&selPokemon?.name===p.name?"#242842":"transparent",borderLeft:`2px solid ${selPokemon?.number===p.number&&selPokemon?.name===p.name?"#00d4aa":"transparent"}`}}
                      onMouseEnter={e=>{if(!(selPokemon?.number===p.number&&selPokemon?.name===p.name))(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                      onMouseLeave={e=>{if(!(selPokemon?.number===p.number&&selPokemon?.name===p.name))(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                      <span style={{fontSize:9,color:"#3a4060",fontFamily:"'Exo 2'",fontWeight:700,width:28,flexShrink:0}}>#{String(p.number).padStart(3,"0")}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{display:"flex",gap:3,marginTop:1}}>{p.types.map(t=><TypeBadge key={t} type={t} small/>)}</div>
                      </div>
                      <div style={{fontSize:9,color:RANK_COLORS[p.suggestedRank],flexShrink:0,fontWeight:600}}>{p.suggestedRank}</div>
                    </div>
                  ))}
                </>
              )}
              {tab==="moves"&&filtMoves.map(m=>(
                <div key={m.name} onClick={()=>setSelMove(m)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,cursor:"pointer",background:selMove?.name===m.name?"#242842":"transparent",borderLeft:`2px solid ${selMove?.name===m.name?TYPE_COLORS[m.type]:"transparent"}`}}
                  onMouseEnter={e=>{if(selMove?.name!==m.name)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                  onMouseLeave={e=>{if(selMove?.name!==m.name)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                  <TypeBadge type={m.type} small/>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#e8eaf0"}}>{m.name}</div><div style={{fontSize:9,color:CAT_COLORS[m.category].text,fontWeight:600}}>{m.category}</div></div>
                  {m.power!=="-"&&<span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:"#8b90a8"}}>PWR {m.power}</span>}
                </div>
              ))}
              {tab==="abilities"&&filtAbilities.map(a=>(
                <div key={a.name} onClick={()=>setSelAbility(a)} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 8px",borderRadius:4,cursor:"pointer",background:selAbility?.name===a.name?"#242842":"transparent",borderLeft:`2px solid ${selAbility?.name===a.name?"#00d4aa":"transparent"}`}}
                  onMouseEnter={e=>{if(selAbility?.name!==a.name)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                  onMouseLeave={e=>{if(selAbility?.name!==a.name)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                  <div><div style={{fontSize:12,fontWeight:600,color:"#e8eaf0"}}>{a.name}{a.isUnique&&<span style={{fontSize:8,color:"#ffd32a",marginLeft:4}}>UNIQUE</span>}</div><div style={{fontSize:10,color:"#5a6080",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{a.effect.slice(0,50)}…</div></div>
                </div>
              ))}
              {tab==="items"&&filtItems.map(i=>(
                <div key={i.name} onClick={()=>setSelItem(i)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,cursor:"pointer",background:selItem?.name===i.name?"#242842":"transparent",borderLeft:`2px solid ${selItem?.name===i.name?"#ffd32a":"transparent"}`}}
                  onMouseEnter={e=>{if(selItem?.name!==i.name)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                  onMouseLeave={e=>{if(selItem?.name!==i.name)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#e8eaf0"}}>{i.name}</div><div style={{fontSize:10,color:"#5a6080",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.effect}</div></div>
                  {i.cost&&<span style={{fontSize:10,color:"#ffd32a"}}>₽{i.cost.toLocaleString()}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Detail */}
        <div style={{flex:1,overflowY:"auto",background:"#0f1117"}}>
          {tab==="pokedex"&&selPokemon&&<PokemonDetail pokemon={selPokemon} onTrack={trackPokemon}/>}
          {tab==="moves"&&selMove&&(
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                <TypeBadge type={selMove.type}/>
                <span style={{fontSize:12,fontWeight:700,color:CAT_COLORS[selMove.category].text,background:CAT_COLORS[selMove.category].bg,padding:"2px 8px",borderRadius:4}}>{selMove.category}</span>
                {(selMove.priority??0)>0&&<span style={{fontSize:10,fontWeight:700,color:"#00d4aa",background:"rgba(0,212,170,0.12)",padding:"1px 6px",borderRadius:3}}>PRIORITY {selMove.priority}</span>}
                <button onClick={()=>{const w=window.open("","_blank","width=500,height=500,resizable=yes");if(!w)return;w.document.write(`<!DOCTYPE html><html><head><title>${selMove.name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f1117;color:#e8eaf0;font-family:Inter,sans-serif;padding:20px;font-size:13px}h2{font-family:'Exo 2',sans-serif;margin-bottom:12px}p{color:#8b90a8;line-height:1.5;margin-bottom:12px}.field{background:#1e2235;padding:10px 12px;border-radius:5px;margin-bottom:8px}.label{font-size:9px;color:#5a6080;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}</style></head><body><h2>${selMove.name}</h2><p>${selMove.type} · ${selMove.category}</p><p>${selMove.description}</p><div class="field"><div class="label">Power</div>${selMove.power}</div><div class="field"><div class="label">Accuracy Roll</div>${selMove.accuracy}</div><div class="field"><div class="label">Damage Pool</div>${selMove.damagePool}</div><div class="field"><div class="label">Effect</div>${selMove.effect}</div></body></html>`);w.document.close();}} style={{marginLeft:"auto",background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",padding:"4px 8px",cursor:"pointer",fontSize:12}} title="Pop out">↗</button>
              </div>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#e8eaf0",marginBottom:12}}>{selMove.name}</h2>
              <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,marginBottom:14,padding:"10px 14px",background:"#13151f",borderRadius:6,borderLeft:`3px solid ${TYPE_COLORS[selMove.type]}`}}>{selMove.description}</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["Power",selMove.power],["Accuracy Roll",selMove.accuracy],["Damage Pool",selMove.damagePool],["Added Effect",selMove.effect]].map(([l,v])=>(
                  <div key={l} style={{background:"#13151f",borderRadius:5,padding:"10px 12px"}}>
                    <div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,color:"#e8eaf0",fontWeight:600}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab==="abilities"&&selAbility&&(
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#e8eaf0"}}>{selAbility.name}</h2>
                {selAbility.isUnique&&<span style={{fontSize:11,fontWeight:700,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"2px 8px",borderRadius:4}}>UNIQUE</span>}
                <button onClick={()=>{const w=window.open("","_blank","width=500,height=400,resizable=yes");if(!w)return;w.document.write(`<!DOCTYPE html><html><head><title>${selAbility.name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f1117;color:#e8eaf0;font-family:Inter,sans-serif;padding:20px;font-size:13px}h2{font-family:'Exo 2',sans-serif;margin-bottom:12px}p{color:#8b90a8;line-height:1.5;margin-bottom:12px}.effect{background:#1e2235;padding:12px;border-radius:5px;border-left:3px solid #00d4aa;line-height:1.6}</style></head><body><h2>${selAbility.name}${selAbility.isUnique?" (UNIQUE)":""}</h2><p>${selAbility.description}</p><div class="effect">${selAbility.effect}</div></body></html>`);w.document.close();}} style={{marginLeft:"auto",background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",padding:"4px 8px",cursor:"pointer",fontSize:12}} title="Pop out">↗</button>
              </div>
              <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,marginBottom:14,padding:"10px 14px",background:"#13151f",borderRadius:6,borderLeft:"3px solid #00d4aa"}}>{selAbility.description}</p>
              <div style={{background:"#13151f",borderRadius:6,padding:"12px 16px"}}><div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Effect</div><div style={{fontSize:13,color:"#e8eaf0",lineHeight:1.6}}>{selAbility.effect}</div></div>
            </div>
          )}
          {tab==="items"&&selItem&&(
            <div style={{padding:"20px 24px"}}>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#e8eaf0",marginBottom:14}}>{selItem.name}</h2>
              <p style={{color:"#8b90a8",fontSize:13,lineHeight:1.6,marginBottom:14,padding:"10px 14px",background:"#13151f",borderRadius:6,borderLeft:"3px solid #ffd32a"}}>{selItem.description}</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:"#13151f",borderRadius:5,padding:"10px 12px"}}><div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Effect</div><div style={{fontSize:13,color:"#e8eaf0",fontWeight:600}}>{selItem.effect}</div></div>
                <div style={{background:"#13151f",borderRadius:5,padding:"10px 12px"}}><div style={{fontSize:9,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Cost</div><div style={{fontSize:13,color:"#ffd32a",fontWeight:600,fontFamily:"'Exo 2'"}}>{selItem.cost?`₽${selItem.cost.toLocaleString()}`:"—"}</div></div>
              </div>
            </div>
          )}
          {tab==="types"&&(
            <div style={{padding:24}}>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:"#e8eaf0",marginBottom:16}}>Defensive Type Chart</h2>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
                  <thead><tr>
                    <th style={{padding:"8px 12px",textAlign:"left",color:"#5a6080",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Type</th>
                    <th style={{padding:"8px 12px",color:"#ff4757",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Weak to</th>
                    <th style={{padding:"8px 12px",color:"#00d4aa",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Resists</th>
                    <th style={{padding:"8px 12px",color:"#ffd32a",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Immune to</th>
                  </tr></thead>
                  <tbody>
                    {ALL_TYPES.map((t,i)=>{
                      const chart=TYPE_CHART[t];
                      return (
                        <tr key={t} style={{background:i%2===0?"transparent":"#1e223540",borderBottom:"1px solid #2a2f4520"}}>
                          <td style={{padding:"6px 12px"}}><TypeBadge type={t}/></td>
                          <td style={{padding:"6px 12px"}}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{chart.weaknesses.map(w=><TypeBadge key={w} type={w} small/>)}</div></td>
                          <td style={{padding:"6px 12px"}}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{chart.resistances.map(r=><TypeBadge key={r} type={r} small/>)}</div></td>
                          <td style={{padding:"6px 12px"}}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{chart.immunities.map(im=><TypeBadge key={im} type={im} small/>)}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab==="status"&&(
            <div style={{padding:24}}>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:"#e8eaf0",marginBottom:16}}>Status Conditions</h2>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {Object.values(STATUS_EFFECTS).filter(s=>s.name!=="Healthy").map(s=>(
                  <div key={s.name} style={{background:"#1e2235",border:`1px solid ${s.color}40`,borderRadius:8,padding:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:s.color}}>{s.name}</span>
                      {s.endOfRound&&<span style={{fontSize:10,color:"#ff4757",background:"rgba(255,71,87,0.1)",padding:"2px 7px",borderRadius:3}}>End of Round Effect</span>}
                    </div>
                    <p style={{fontSize:12,color:"#8b90a8",marginBottom:s.endOfRound?8:0,lineHeight:1.5}}>{s.description}</p>
                    {s.endOfRound&&<div style={{fontSize:11,color:"#ff4757",background:"rgba(255,71,87,0.08)",padding:"5px 8px",borderRadius:4}}>🔄 {s.endOfRound}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab==="weather"&&(
            <div style={{padding:24}}>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:"#e8eaf0",marginBottom:16}}>Weather & Terrain Effects</h2>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {WEATHER_EFFECTS.map(w=>(
                  <div key={w.name} style={{background:"#1e2235",border:`1px solid ${w.color}40`,borderRadius:8,padding:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:18}}>{w.emoji.split(" ")[0]}</span>
                      <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#e8eaf0"}}>{w.name}</span>
                      {w.modifiers.typeBoost&&<span style={{fontSize:10,color:"#f08030",background:"rgba(240,128,48,0.1)",padding:"2px 7px",borderRadius:3}}>Boosts {w.modifiers.typeBoost}</span>}
                      {w.modifiers.typeWeaken&&<span style={{fontSize:10,color:"#6890f0",background:"rgba(104,144,240,0.1)",padding:"2px 7px",borderRadius:3}}>Weakens {w.modifiers.typeWeaken}</span>}
                    </div>
                    <p style={{fontSize:12,color:"#8b90a8",lineHeight:1.5,marginBottom:w.endOfRoundEffect?8:0}}>{w.description}</p>
                    {w.endOfRoundEffect&&<div style={{fontSize:11,color:"#ff4757",background:"rgba(255,71,87,0.08)",padding:"5px 8px",borderRadius:4,marginBottom:6}}>🔄 {w.endOfRoundEffect}</div>}
                    {w.triggeredAbilities&&w.triggeredAbilities.length>0&&(
                      <div style={{fontSize:10,color:"#5a6080"}}>Triggers: <span style={{color:"#00d4aa"}}>{w.triggeredAbilities.join(", ")}</span></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReferencePage() {
  return (
    <Suspense fallback={<div style={{background:"#0f1117",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#5a6080"}}>Loading…</div>}>
      <ReferenceTabs/>
    </Suspense>
  );
}

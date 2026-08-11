"use client";
import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART, STATUS_EFFECTS, WEATHER_EFFECTS, MISSINGNO, PokemonEntry, Move, Ability, PokemonType, MoveCategory, Rank } from "../data/pokerole-data";
import type { ItemData } from "../data/pokerole-data";
import { loadFromStorage, saveToStorage } from "../lib/storage";
import { readableInk } from "../lib/contrast";
import PokedexFrame from "../components/PokedexFrame";
import HintBar, { ScrollList } from "../components/HintBar";

const RANK_COLORS: Record<Rank,string> = {Starter:"#2F6B1E",Rookie:"#2A54B8",Standard:"#7A6100",Advanced:"#99450A",Expert:"#7A2E7A",Ace:"#B02525",Master:"#4C3B6B",Champion:"#7D6800"};
const CAT_COLORS: Record<MoveCategory,{text:string;bg:string}> = {Physical:{text:"#f08030",bg:"rgba(240,128,48,0.15)"},Special:{text:"#6890f0",bg:"rgba(104,144,240,0.15)"},Support:{text:"#78c850",bg:"rgba(120,200,80,0.15)"}};
const ALL_TYPES: PokemonType[] = ["Normal","Fire","Water","Electric","Grass","Ice","Fight","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

type Tab = "pokedex"|"moves"|"abilities"|"items"|"types"|"status"|"weather";

function TypeBadge({type,small}:{type:PokemonType;small?:boolean}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 8px",borderRadius:4,fontSize:small?9:11,fontWeight:700,color:readableInk(TYPE_COLORS[type]),background:TYPE_COLORS[type]}}>{type}</span>;
}

function MovePopupPanel({move,onClose}:{move:Move;onClose:()=>void}) {
  const cat=CAT_COLORS[move.category];
  const related=POKEMON.filter(p=>p.moves.some(m=>m.name===move.name));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,width:440,maxHeight:"85vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",gap:8,alignItems:"center"}}>
          <TypeBadge type={move.type}/><span style={{fontSize:11,fontWeight:700,color:cat.text,background:cat.bg,padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#202020",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:17}}>✕</button>
        </div>
        <div style={{padding:16}}>
          <p style={{fontSize:12,color:"#383838",marginBottom:12,lineHeight:1.6}}>{move.description}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[["Power",move.power],["Accuracy",move.accuracy],["Damage Pool",move.damagePool],["Effect",move.effect]].map(([l,v])=>(
              <div key={l} style={{background:"#F8F4D0",borderRadius:5,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                <div style={{fontSize:12,color:"#202020",fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          {related.length>0&&(
            <div>
              <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Learned by</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {related.map(p=>(
                  <div key={p.number} style={{display:"flex",alignItems:"center",gap:4,background:"#F8F4D0",border:"1px solid #2850A0",borderRadius:3,padding:"2px 7px"}}>
                    <TypeBadge type={p.types[0]} small/><span style={{fontSize:11,color:"#202020"}}>{p.name}</span>
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
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,width:420,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",gap:8}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#202020",margin:0,flex:1}}>{ability.name}</h3>
          {ability.isUnique&&<span style={{fontSize:10,fontWeight:700,color:"#A07000",background:"rgba(255,211,42,0.12)",padding:"2px 7px",borderRadius:3}}>UNIQUE</span>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:17}}>✕</button>
        </div>
        <div style={{padding:16}}>
          <p style={{fontSize:12,color:"#383838",marginBottom:12,lineHeight:1.6}}>{ability.description}</p>
          <div style={{background:"#F8F4D0",borderRadius:5,padding:"10px 12px",marginBottom:12,borderLeft:"3px solid #2850A0"}}>
            <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Effect</div>
            <div style={{fontSize:12,color:"#202020",lineHeight:1.6}}>{ability.effect}</div>
          </div>
          {pokemon.length>0&&(
            <div>
              <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Pokémon with this ability</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {pokemon.map(p=>(
                  <div key={p.number} style={{display:"flex",alignItems:"center",gap:4,background:"#F8F4D0",border:"1px solid #2850A0",borderRadius:3,padding:"2px 7px"}}>
                    <TypeBadge type={p.types[0]} small/><span style={{fontSize:11,color:"#202020"}}>{p.name}</span>
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
          {/* Sits directly on the green field, not a blue panel, so it needs
              white rather than the panel's pale label ink. */}
          <div style={{fontSize:11,color:"#FFFFFF",fontFamily:"'Exo 2'",fontWeight:700,letterSpacing:1}}>#{String(pokemon.number).padStart(4,"0")} · {pokemon.evolutiveStage} Stage</div>
          <h1 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:28,color:"#FFFFFF",lineHeight:1.1}}>{pokemon.name}</h1>
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            {pokemon.types.map(t=><TypeBadge key={t} type={t}/>)}
            {/* Dark scrim rather than a white one: 16% white over the green field
                lifted it enough that white text fell to 3.8:1. */}
            <span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:"rgba(0,0,0,0.30)",border:`1px solid rgba(255,255,255,0.5)`,color:"#FFFFFF"}}>{pokemon.suggestedRank}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",flexShrink:0}}>
          <button onClick={()=>{
            const w=window.open("","_blank","width=600,height=800,resizable=yes,scrollbars=yes");
            if(!w)return;
            const attrs=`STR ${pokemon.attributes.strength}/${pokemon.attributeLimits?.strength??5} | DEX ${pokemon.attributes.dexterity}/${pokemon.attributeLimits?.dexterity??5} | VIT ${pokemon.attributes.vitality}/${pokemon.attributeLimits?.vitality??5} | SPC ${pokemon.attributes.special}/${pokemon.attributeLimits?.special??5} | INS ${pokemon.attributes.insight}/${pokemon.attributeLimits?.insight??5}`;
            const moves=pokemon.moves.slice(0,20).map(m=>`<tr><td style="padding:2px 8px;color:#484848">${m.rank}</td><td style="padding:2px 8px;color:#202020">${m.name}</td><td style="padding:2px 8px;color:#383838">${m.type}</td></tr>`).join("");
            w.document.write(`<!DOCTYPE html><html><head><title>${pokemon.name} — PokeRole</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#35785F;color:#202020;font-family:Inter,sans-serif;padding:20px;font-size:13px}h1{font-family:'Exo 2',sans-serif;font-size:24px;margin-bottom:6px}h3{font-family:'Exo 2',sans-serif;font-size:14px;color:#585858;margin:14px 0 6px;text-transform:uppercase;letter-spacing:1px}p{color:#383838;line-height:1.5;margin-bottom:10px}.badge{display:inline-flex;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;margin-right:4px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #2E6B58}</style></head><body>
            <h1>${pokemon.name} <span style="font-size:14px;color:#585858">#${String(pokemon.number).padStart(3,"0")} · ${pokemon.evolutiveStage} Stage</span></h1>
            ${pokemon.types.map(t=>`<span class="badge" style="background:#606878">${t}</span>`).join("")}
            <span style="font-size:11px;color:#383838;margin-left:8px">${pokemon.suggestedRank}</span>
            <p style="margin-top:10px">${pokemon.description}</p>
            <h3>Attributes</h3><p>${attrs}</p>
            <p>HP: ${pokemon.baseHp + pokemon.attributes.vitality} | WP: ${pokemon.attributes.insight+3} | DEF: ${pokemon.attributes.vitality} | SP.DEF: ${pokemon.attributes.insight}</p>
            <h3>Abilities</h3><p>${pokemon.abilities.join(" / ")}</p>
            <h3>Moves</h3><table>${moves}</table>
            </body></html>`);
            w.document.close();
          }} style={{background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:5,color:"#383838",padding:"6px 8px",cursor:"pointer",fontSize:13,fontWeight:700}} title="Pop out to new window">↗</button>
          <button onClick={()=>onTrack(pokemon)} style={{background:"#2850A0",color:"#FFFFFF",border:"none",borderRadius:6,padding:"8px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Exo 2'",whiteSpace:"nowrap"}}>⚔️ Add to Battle Tracker</button>
        </div>
      </div>

      <p style={{color:"#383838",fontSize:13,lineHeight:1.6,padding:"10px 14px",background:"#F8F4D0",borderRadius:6,borderLeft:"3px solid #2850A0"}}>{pokemon.description}</p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div className="frw" style={{padding:14}}>
          <div style={{fontSize:10,color:"var(--fr-panel-label)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Attributes</div>
          {attrs.map(a=>(
            <div key={a.k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:32,fontSize:11,fontWeight:700,color:"var(--fr-panel-label)"}}>{a.l}</span>
              <div style={{display:"flex",gap:3}}>
                {Array.from({length:Math.max(pokemon.attributeLimits?.[a.k]??pokemon.attributes[a.k],pokemon.attributes[a.k],6)}).map((_,i)=>(
                  <div key={i} style={{width:12,height:12,borderRadius:2,border:`1px solid ${i<(pokemon.attributeLimits?.[a.k]??pokemon.attributes[a.k])?(i<pokemon.attributes[a.k]?"#2850A0":"rgba(0,212,170,0.3)"):"#2850A0"}`,background:i<pokemon.attributes[a.k]?"#2850A0":"transparent"}}/>
                ))}
              </div>
              <span style={{marginLeft:"auto",fontSize:12,color:"#FFFFFF",fontFamily:"'Exo 2'",fontWeight:700}}>{pokemon.attributes[a.k]}{pokemon.attributeLimits&&<span style={{color:"var(--fr-panel-label)",fontSize:10}}>/{pokemon.attributeLimits[a.k]}</span>}</span>
            </div>
          ))}
        </div>
        <div className="frw" style={{padding:14}}>
          <div style={{fontSize:10,color:"var(--fr-panel-label)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Combat Stats</div>
          {[["Base HP",`${pokemon.baseHp} + VIT (${pokemon.baseHp+pokemon.attributes.vitality})`],["Will Points",`INS + 3 (${pokemon.attributes.insight+3})`],["Defense",`= VIT (${pokemon.attributes.vitality})`],["Sp. Defense",`= INS (${pokemon.attributes.insight})`],["Max Moves",`INS + 3 = ${pokemon.attributes.insight+3}`],["Height",pokemon.height],["Weight",pokemon.weight]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:11,color:"var(--fr-panel-label)"}}>{l}</span>
              <span style={{fontSize:12,color:"#FFFFFF",fontFamily:"'Exo 2'",fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Abilities with popups */}
      <div>
        <div style={{fontSize:10,color:"var(--fr-panel-label)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Abilities <span style={{color:"#E8F8F0",fontWeight:400,letterSpacing:0,textTransform:"none"}}>(click to expand)</span></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {pokemon.abilities.map(a=>{
            const ab=ABILITIES.find(x=>x.name===a);
            return (
              <button key={a} onClick={()=>ab&&setAbilityPopup(ab)} style={{flex:1,minWidth:160,background:"#F8F4D0",border:"1px solid #2850A0",borderRadius:6,padding:"8px 12px",cursor:ab?"pointer":"default",textAlign:"left",transition:"border-color 0.1s"}}
                onMouseEnter={e=>{if(ab)(e.currentTarget as HTMLButtonElement).style.borderColor="#2850A0";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2850A0";}}>
                <div style={{fontWeight:700,fontSize:13,color:"#2850A0",marginBottom:3}}>{a}</div>
                <div style={{fontSize:10,color:"#383838",lineHeight:1.4}}>{ab?.effect?.slice(0,70)??"See ability reference"}…</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Type matchups */}
      <div className="frw" style={{padding:14}}>
        <div style={{fontSize:10,color:"var(--fr-panel-label)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Type Matchups</div>
        {typeData.weaknesses.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:11,color:"#FFD4D0",width:56,fontWeight:600}}>Weak to</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{typeData.weaknesses.map(t=><TypeBadge key={t} type={t} small/>)}</div>
          </div>
        )}
        {typeData.resistances.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:11,color:"#2850A0",width:56,fontWeight:600}}>Resists</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{typeData.resistances.map(t=><TypeBadge key={t} type={t} small/>)}</div>
          </div>
        )}
        {typeData.immunities.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"#FFE8A8",width:56,fontWeight:600}}>Immune</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{typeData.immunities.map(t=><TypeBadge key={t} type={t} small/>)}</div>
          </div>
        )}
      </div>

      {/* Evolution */}
      {pokemon.evolvesTo&&(
        <div className="frw" style={{padding:14}}>
          <div style={{fontSize:10,color:"var(--fr-panel-label)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Evolution — Stage: {pokemon.evolutiveStage}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontWeight:700,fontSize:13,color:"#FFFFFF"}}>{pokemon.name}</span>
            <span style={{color:"#4A5468",fontSize:18}}>→</span>
            <div><div style={{fontWeight:700,fontSize:13,color:"#2850A0"}}>{pokemon.evolvesTo}</div>{pokemon.evolvesWith&&<div style={{fontSize:11,color:"var(--fr-panel-label)"}}>via: {pokemon.evolvesWith}</div>}</div>
          </div>
        </div>
      )}

      {/* Moves with popups */}
      <div>
        <div style={{fontSize:10,color:"var(--fr-panel-label)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Learnable Moves <span style={{color:"#E8F8F0",fontWeight:400,letterSpacing:0,textTransform:"none"}}>(click for details)</span></div>
        {(Object.entries(rankGroups) as [Rank,typeof pokemon.moves][]).map(([rank,moves])=>(
          <div key={rank} style={{marginBottom:10}}>
            {/* This band sits on the green field. The rank inks were darkened for
                cream lists, so on green they read at ~1.2:1 — use white on a dark
                scrim and keep the rank colour as the edge marker. */}
            <div style={{fontSize:10,fontWeight:700,color:"#FFFFFF",letterSpacing:"0.5px",textTransform:"uppercase",padding:"3px 8px",background:"rgba(0,0,0,0.30)",borderRadius:4,marginBottom:5,borderLeft:`3px solid ${RANK_COLORS[rank]}`}}>{rank}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,paddingLeft:8}}>
              {moves.map((m,i)=>{
                const moveData=MOVES.find(mv=>mv.name===m.name);
                return (
                  <button key={i} onClick={()=>moveData&&setMovePopup(moveData)}
                    style={{display:"flex",alignItems:"center",gap:5,background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:4,padding:"4px 8px",cursor:moveData?"pointer":"default",transition:"border-color 0.1s"}}
                    onMouseEnter={e=>{if(moveData)(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type];}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2850A0";}}>
                    <TypeBadge type={m.type} small/><span style={{fontSize:12,color:"#202020"}}>{m.name}</span>
                    {moveData&&<span style={{fontSize:9,color:"#585858"}}>▶</span>}
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

function AddToInventoryModal({item, onClose}:{item:ItemData; onClose:()=>void}) {
  const trainers = loadFromStorage<any[]>("trainers",[]);
  const [selTrainerId, setSelTrainerId] = useState<string>(trainers[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<"gift"|"purchase">("gift");
  const defaultCost = item.cost && !isNaN(Number(item.cost)) ? Number(item.cost) : null;
  const [price, setPrice] = useState(defaultCost ?? 0);

  const selTrainer = trainers.find((t:any)=>t.id===selTrainerId);
  const canAfford = selTrainer ? (selTrainer.money ?? 0) >= price * qty : false;

  const confirm = () => {
    if(!selTrainer) return;
    const saved = loadFromStorage<any[]>("trainers",[]);
    const idx = saved.findIndex((x:any)=>x.id===selTrainerId);
    if(idx<0) return;
    const inv = [...(saved[idx].inventory||[])];
    const existing = inv.findIndex((i:any)=>i.name===item.name);
    if(existing>=0) inv[existing].quantity=(inv[existing].quantity||1)+qty;
    else inv.push({name:item.name,quantity:qty,description:item.description});
    const newMoney = mode==="purchase" ? Math.max(0,(saved[idx].money??2000) - price*qty) : (saved[idx].money??2000);
    saved[idx]={...saved[idx],inventory:inv,money:newMoney};
    saveToStorage("trainers",saved);
    onClose();
  };

  if(trainers.length===0) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,padding:24,maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <p style={{color:"#383838",fontSize:13}}>No characters saved. Create trainers first.</p>
        <button onClick={onClose} style={{marginTop:12,padding:"6px 14px",borderRadius:5,border:"none",background:"#7888A8",color:"#202020",cursor:"pointer"}}>Close</button>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,width:380,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>🎒</span>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:"#202020",fontFamily:"'Exo 2'"}}>{item.name}</div>
            <div style={{fontSize:10,color:"#585858"}}>{item.category}{item.pocket?` · ${item.pocket}`:""}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
          {/* Trainer */}
          <div>
            <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Trainer</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {trainers.map((t:any)=>(
                <button key={t.id} onClick={()=>setSelTrainerId(t.id)}
                  style={{padding:"5px 12px",borderRadius:5,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${selTrainerId===t.id?"#2850A0":"#7888A8"}`,background:selTrainerId===t.id?"rgba(0,212,170,0.12)":"transparent",color:selTrainerId===t.id?"#2850A0":"#383838"}}>
                  {t.name}
                  {mode==="purchase"&&<span style={{fontSize:9,color:"#A07000",marginLeft:6}}>₽{t.money??0}</span>}
                </button>
              ))}
            </div>
          </div>
          {/* Quantity */}
          <div>
            <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Quantity</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:28,height:28,borderRadius:4,border:"1px solid #7888A8",background:"#F8F4D0",color:"#2850A0",cursor:"pointer",fontSize:16}}>−</button>
              <input type="number" min={1} value={qty} onChange={e=>setQty(Math.max(1,parseInt(e.target.value)||1))}
                style={{width:56,textAlign:"center",background:"#F8F4D0",border:"1px solid #7888A8",borderRadius:4,color:"#202020",fontSize:14,padding:"4px 0"}}/>
              <button onClick={()=>setQty(q=>q+1)} style={{width:28,height:28,borderRadius:4,border:"1px solid #7888A8",background:"#F8F4D0",color:"#2850A0",cursor:"pointer",fontSize:16}}>+</button>
            </div>
          </div>
          {/* Mode */}
          <div>
            <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Transaction Type</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setMode("gift")} style={{flex:1,padding:"6px 0",borderRadius:5,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${mode==="gift"?"#2850A0":"#7888A8"}`,background:mode==="gift"?"rgba(0,212,170,0.12)":"transparent",color:mode==="gift"?"#2850A0":"#383838"}}>🎁 Gifted</button>
              <button onClick={()=>setMode("purchase")} style={{flex:1,padding:"6px 0",borderRadius:5,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${mode==="purchase"?"#A07000":"#7888A8"}`,background:mode==="purchase"?"rgba(255,211,42,0.1)":"transparent",color:mode==="purchase"?"#A07000":"#383838"}}>💰 Purchase</button>
            </div>
          </div>
          {/* Price (purchase only) */}
          {mode==="purchase"&&(
            <div>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Price per item (₽)</div>
              <input type="number" min={0} value={price} onChange={e=>setPrice(Math.max(0,parseInt(e.target.value)||0))}
                style={{width:"100%",background:"#F8F4D0",border:`1px solid ${canAfford?"#A0700050":"#C0282050"}`,borderRadius:5,color:"#A07000",fontSize:16,padding:"6px 10px",fontFamily:"'Exo 2'",fontWeight:700}}/>
              <div style={{marginTop:6,fontSize:11,color:canAfford?"#585858":"#C02820"}}>
                Total: ₽{(price*qty).toLocaleString()}
                {selTrainer&&<span style={{marginLeft:8}}>· {selTrainer.name} has ₽{(selTrainer.money??0).toLocaleString()}</span>}
                {!canAfford&&<span style={{marginLeft:8,fontWeight:700}}>⚠ Not enough funds</span>}
              </div>
            </div>
          )}
          {/* Confirm */}
          <button onClick={confirm} disabled={mode==="purchase"&&!canAfford}
            style={{padding:"8px 0",borderRadius:6,fontSize:13,fontWeight:700,cursor:mode==="purchase"&&!canAfford?"not-allowed":"pointer",border:"none",background:mode==="purchase"&&!canAfford?"#2850A0":mode==="purchase"?"rgba(255,211,42,0.2)":"rgba(0,212,170,0.2)",color:mode==="purchase"&&!canAfford?"#585858":mode==="purchase"?"#A07000":"#2850A0"}}>
            {mode==="gift"?`🎁 Add ${qty}× to ${selTrainer?.name??"—"}'s Inventory`:`💰 Purchase ${qty}× for ₽${(price*qty).toLocaleString()}`}
          </button>
        </div>
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
  const [selItem,setSelItem]=useState<ItemData|null>(null);
  const [addModalItem,setAddModalItem]=useState<ItemData|null>(null);
  const [itemPocketFilter,setItemPocketFilter]=useState<string|null>(null);
  const [itemCatFilter,setItemCatFilter]=useState<string|null>(null);

  const filtPokemon=useMemo(()=>{
    const RANKS=["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
    return POKEMON.filter(p=>{
      if(search&&RANKS.includes(search))return p.suggestedRank===search;
      if(search&&!p.name.toLowerCase().includes(search.toLowerCase())&&!String(p.number).includes(search))return false;
      if(typeFilter&&!p.types.includes(typeFilter))return false;
      return true;
    });
  },[search,typeFilter]);

  const filtMoves=useMemo(()=>MOVES.filter(m=>{
    if(search==="priority:true")return (m.priority??0)>0;
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
    if(search&&!i.name.toLowerCase().includes(search.toLowerCase())&&!i.description.toLowerCase().includes(search.toLowerCase()))return false;
    if(itemPocketFilter&&i.pocket!==itemPocketFilter)return false;
    if(itemCatFilter&&i.category!==itemCatFilter)return false;
    return true;
  }),[search,itemPocketFilter,itemCatFilter]);

  const itemPockets=useMemo(()=>[...new Set(ITEMS.map(i=>i.pocket).filter(Boolean))].sort(),[]);
  const itemCategories=useMemo(()=>[...new Set(ITEMS.filter(i=>!itemPocketFilter||i.pocket===itemPocketFilter).map(i=>i.category).filter(Boolean))].sort(),[itemPocketFilter]);

  // Pocket display config
  const POCKET_LABELS: Record<string,{label:string;color:string;icon:string}> = {
    HeldItems:{label:"Held Items",color:"#6890f0",icon:"💎"},
    Medicine:{label:"Medicine",color:"#f85888",icon:"💊"},
    TrainerItems:{label:"Trainer Items",color:"#f08030",icon:"🎒"},
  };
  const CAT_ITEM_COLORS: Record<string,string> = {
    MegaStone:"#a040a0", ZCrystal:"#2850A0", BattleItem:"#f08030",
    Berry:"#78c850", Status:"#f85888", Vitamin:"#6890f0",
    TypeBoosting:"#A07000", Tera:"#e04040", "":"#585858",
  };

  const changeTab=(t:Tab)=>{setTab(t);setSearch("");setTypeFilter(null);setCatFilter(null);};

  const trackPokemon=(p:PokemonEntry)=>{
    sessionStorage.setItem("track_pokemon",String(p.number));
    window.open("/gm-screen","_blank");
  };

  return (
    <PokedexFrame active={tab}>
      {/* Page sub-nav: the reference tabs, one level below the device keys */}
      <div style={{background:"#D8E0F0",borderBottom:"2px solid #2850A0",padding:"0 12px",height:34,display:"flex",alignItems:"center",gap:4,flexShrink:0,overflowX:"auto"}}>
        {(["pokedex","moves","abilities","items","types","status","weather"] as Tab[]).map(t=>(
          <button key={t} onClick={()=>changeTab(t)} style={{padding:"3px 10px",borderRadius:4,fontSize:12,fontWeight:700,cursor:"pointer",border:"none",fontFamily:"'Exo 2',sans-serif",whiteSpace:"nowrap",flexShrink:0,
            color:tab===t?"#F8F4D0":"#2850A0",textShadow:tab===t?"1px 1px 0 #183868":"none",background:tab===t?"#2850A0":"transparent"}}>
            {t==="pokedex"?"Pokédex":t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        {["pokedex","moves","abilities","items"].includes(tab)&&(
          <div style={{width:260,display:"flex",flexDirection:"column",background:"#F8F4D0",borderRight:"1px solid #2850A0",flexShrink:0}}>
            <div style={{padding:"10px",display:"flex",flexDirection:"column",gap:7,borderBottom:"1px solid #2850A0"}}>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:"#585858",fontSize:12,pointerEvents:"none"}}>🔍</span>
                <input type="text" placeholder={`Search ${tab==="pokedex"?"Pokémon":tab}…`} value={search} onChange={e=>setSearch(e.target.value)}
                  style={{width:"100%",background:"#35785F",border:"1px solid #2850A0",borderRadius:5,padding:"6px 8px 6px 28px",color:"#202020",fontSize:12,outline:"none"}}
                  onFocus={e=>{(e.target as HTMLInputElement).style.borderColor="#2850A0";}}
                  onBlur={e=>{(e.target as HTMLInputElement).style.borderColor="#2850A0";}}/>
              </div>
              {(tab==="pokedex"||tab==="moves")&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  <button onClick={()=>setTypeFilter(null)} style={{fontSize:9,padding:"2px 5px",borderRadius:3,cursor:"pointer",border:"1px solid #7888A8",fontWeight:600,background:typeFilter===null?"#7888A8":"transparent",color:typeFilter===null?"#202020":"#585858"}}>All</button>
                  {ALL_TYPES.map(t=>(
                    <button key={t} onClick={()=>setTypeFilter(typeFilter===t?null:t)} style={{fontSize:8,padding:"1px 4px",borderRadius:3,cursor:"pointer",border:`1px solid ${TYPE_COLORS[t]}60`,background:typeFilter===t?TYPE_COLORS[t]:`${TYPE_COLORS[t]}15`,color:typeFilter===t?"#fff":TYPE_COLORS[t],fontWeight:700}}>{t}</button>
                  ))}
                </div>
              )}
              {tab==="pokedex"&&(
                <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                  {(["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"] as Rank[]).map(r=>(
                    <button key={r} onClick={()=>setSearch(search===r?"":r)} style={{fontSize:8,padding:"2px 5px",borderRadius:3,cursor:"pointer",fontWeight:700,border:`1px solid ${RANK_COLORS[r]}50`,background:search===r?`${RANK_COLORS[r]}25`:"transparent",color:search===r?RANK_COLORS[r]:"#585858"}}>{r}</button>
                  ))}
                </div>
              )}
              {tab==="moves"&&(
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {(["Physical","Special","Support"] as MoveCategory[]).map(c=>(
                    <button key={c} onClick={()=>setCatFilter(catFilter===c?null:c)} style={{fontSize:9,padding:"3px 6px",borderRadius:3,cursor:"pointer",fontWeight:700,border:`1px solid ${CAT_COLORS[c].text}50`,background:catFilter===c?CAT_COLORS[c].bg:"transparent",color:catFilter===c?CAT_COLORS[c].text:"#585858"}}>{c}</button>
                  ))}
                  <button onClick={()=>setSearch(search==="priority:true"?"":"priority:true")} style={{fontSize:9,padding:"3px 6px",borderRadius:3,cursor:"pointer",fontWeight:700,border:"1px solid #2850A050",background:search==="priority:true"?"rgba(0,212,170,0.2)":"transparent",color:search==="priority:true"?"#2850A0":"#585858"}}>⚡ Priority Only</button>
                </div>
              )}
            </div>
            <ScrollList style={{padding:4}}>
              {tab==="pokedex"&&(
                <>
                  {/* Column headers */}
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"3px 8px",borderBottom:"1px solid #2850A0",marginBottom:2}}>
                    <span style={{fontSize:9,color:"#4A5468",fontWeight:700,width:28,flexShrink:0}}>#</span>
                    <span style={{fontSize:9,color:"#585858",fontWeight:700,flex:1}}>NAME / TYPE</span>
                    <span style={{fontSize:9,color:"#585858",fontWeight:700,flexShrink:0}}>RANK</span>
                  </div>
                  {filtPokemon.length===0&&<div style={{textAlign:"center",color:"#585858",padding:20,fontSize:11}}>No Pokémon match "{search}"</div>}
                  {filtPokemon.map(p=>(
                    /* Gen 3 marks the selected row with a ▶ cursor and a grey band */
                    <div key={`${p.number}-${p.name}`} className="fr-row" onClick={()=>setSelPokemon(p)}
                      aria-selected={selPokemon?.number===p.number&&selPokemon?.name===p.name}
                      style={{gap:8,padding:"6px 8px",borderRadius:4}}>
                      <span style={{fontSize:9,color:"#4A5468",fontFamily:"'Exo 2'",fontWeight:700,width:28,flexShrink:0,textShadow:"none"}}>#{String(p.number).padStart(3,"0")}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"#202020",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{display:"flex",gap:3,marginTop:1}}>{p.types.map(t=><TypeBadge key={t} type={t} small/>)}</div>
                      </div>
                      <div style={{fontSize:9,color:RANK_COLORS[p.suggestedRank],flexShrink:0,fontWeight:600,textShadow:"none"}}>{p.suggestedRank}</div>
                    </div>
                  ))}
                </>
              )}
              {tab==="moves"&&filtMoves.map(m=>(
                <div key={m.name} className="fr-row" onClick={()=>setSelMove(m)} aria-selected={selMove?.name===m.name}
                  style={{gap:8,padding:"6px 8px",borderRadius:4}}>
                  <TypeBadge type={m.type} small/>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#202020"}}>{m.name}</div><div style={{fontSize:9,color:CAT_COLORS[m.category].text,fontWeight:600,textShadow:"none"}}>{m.category}</div></div>
                  {m.power!=="-"&&<span className="fr-val" style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700}}>PWR {m.power}</span>}
                </div>
              ))}
              {tab==="abilities"&&filtAbilities.map(a=>(
                <div key={a.name} className="fr-row" onClick={()=>setSelAbility(a)} aria-selected={selAbility?.name===a.name}
                  style={{alignItems:"flex-start",gap:8,padding:"6px 8px",borderRadius:4}}>
                  <div><div style={{fontSize:12,fontWeight:600,color:"#202020"}}>{a.name}{a.isUnique&&<span className="fr-val" style={{fontSize:8,marginLeft:4}}>UNIQUE</span>}</div><div style={{fontSize:10,color:"#585858",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180,textShadow:"none"}}>{a.effect.slice(0,50)}…</div></div>
                </div>
              ))}
              {tab==="items"&&(
                <>
                  {/* Pocket filters */}
                  <div style={{padding:"6px 4px 4px",borderBottom:"1px solid #2850A0",marginBottom:4}}>
                    <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5,paddingLeft:4}}>Pocket</div>
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <button onClick={()=>{setItemPocketFilter(null);setItemCatFilter(null);}} style={{textAlign:"left",padding:"4px 8px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:itemPocketFilter===null?"rgba(0,212,170,0.15)":"transparent",color:itemPocketFilter===null?"#2850A0":"#383838"}}>🗂 All Pockets</button>
                      {itemPockets.map(p=>{const cfg=POCKET_LABELS[p]||{label:p,color:"#585858",icon:"📦"};return(
                        <button key={p} onClick={()=>{setItemPocketFilter(itemPocketFilter===p?null:p);setItemCatFilter(null);}} style={{textAlign:"left",padding:"4px 8px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:itemPocketFilter===p?`${cfg.color}20`:"transparent",color:itemPocketFilter===p?cfg.color:"#383838"}}>
                          {cfg.icon} {cfg.label}
                        </button>
                      );})}
                    </div>
                  </div>
                  {/* Category filters */}
                  {itemCategories.length>0&&(
                    <div style={{padding:"6px 4px 4px",borderBottom:"1px solid #2850A0",marginBottom:4}}>
                      <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5,paddingLeft:4}}>Category</div>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        <button onClick={()=>setItemCatFilter(null)} style={{textAlign:"left",padding:"3px 8px",borderRadius:4,fontSize:10,cursor:"pointer",border:"none",background:itemCatFilter===null?"rgba(255,255,255,0.06)":"transparent",color:itemCatFilter===null?"#202020":"#585858"}}>All Categories</button>
                        {itemCategories.map(c=>{const color=CAT_ITEM_COLORS[c]||"#585858";return(
                          <button key={c} onClick={()=>setItemCatFilter(itemCatFilter===c?null:c)} style={{textAlign:"left",padding:"3px 8px",borderRadius:4,fontSize:10,cursor:"pointer",border:"none",background:itemCatFilter===c?`${color}20`:"transparent",color:itemCatFilter===c?color:"#585858",fontWeight:itemCatFilter===c?700:400}}>
                            {c||"(none)"}
                          </button>
                        );})}
                      </div>
                    </div>
                  )}
                  {/* Item count */}
                  <div style={{padding:"4px 8px",fontSize:9,color:"#585858"}}>{filtItems.length} item{filtItems.length!==1?"s":""}</div>
                </>
              )}
            </ScrollList>
          </div>
        )}
        {/* Detail */}
        <div style={{flex:1,overflowY:"auto",background:"#35785F"}}>
          {tab==="pokedex"&&selPokemon&&<PokemonDetail pokemon={selPokemon} onTrack={trackPokemon}/>}
          {tab==="moves"&&selMove&&(
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                <TypeBadge type={selMove.type}/>
                <span style={{fontSize:12,fontWeight:700,color:CAT_COLORS[selMove.category].text,background:CAT_COLORS[selMove.category].bg,padding:"2px 8px",borderRadius:4}}>{selMove.category}</span>
                {(selMove.priority??0)>0&&<span style={{fontSize:10,fontWeight:700,color:"#2850A0",background:"rgba(0,212,170,0.12)",padding:"1px 6px",borderRadius:3}}>PRIORITY {selMove.priority}</span>}
                <button onClick={()=>{const w=window.open("","_blank","width=500,height=500,resizable=yes");if(!w)return;w.document.write(`<!DOCTYPE html><html><head><title>${selMove.name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#35785F;color:#202020;font-family:Inter,sans-serif;padding:20px;font-size:13px}h2{font-family:'Exo 2',sans-serif;margin-bottom:12px}p{color:#383838;line-height:1.5;margin-bottom:12px}.field{background:#FBF8E4;padding:10px 12px;border-radius:5px;margin-bottom:8px}.label{font-size:9px;color:#585858;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}</style></head><body><h2>${selMove.name}</h2><p>${selMove.type} · ${selMove.category}</p><p>${selMove.description}</p><div class="field"><div class="label">Power</div>${selMove.power}</div><div class="field"><div class="label">Accuracy Roll</div>${selMove.accuracy}</div><div class="field"><div class="label">Damage Pool</div>${selMove.damagePool}</div><div class="field"><div class="label">Effect</div>${selMove.effect}</div></body></html>`);w.document.close();}} style={{marginLeft:"auto",background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:4,color:"#383838",padding:"4px 8px",cursor:"pointer",fontSize:12}} title="Pop out">↗</button>
              </div>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#202020",marginBottom:12}}>{selMove.name}</h2>
              <p style={{color:"#383838",fontSize:13,lineHeight:1.6,marginBottom:14,padding:"10px 14px",background:"#F8F4D0",borderRadius:6,borderLeft:`3px solid ${TYPE_COLORS[selMove.type]}`}}>{selMove.description}</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["Power",selMove.power],["Accuracy Roll",selMove.accuracy],["Damage Pool",selMove.damagePool],["Added Effect",selMove.effect]].map(([l,v])=>(
                  <div key={l} style={{background:"#F8F4D0",borderRadius:5,padding:"10px 12px"}}>
                    <div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,color:"#202020",fontWeight:600}}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Who can learn this move */}
              {(()=>{
                const learners=POKEMON.filter(p=>p.moves.some(m=>m.name===selMove.name));
                if(learners.length===0)return null;
                const RANK_COLORS2:Record<string,string>={Starter:"#2F6B1E",Rookie:"#2A54B8",Standard:"#7A6100",Advanced:"#99450A",Expert:"#7A2E7A",Ace:"#B02525",Master:"#4C3B6B",Champion:"#7D6800"};
                return(
                  <div style={{marginTop:16}}>
                    <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Learned by ({learners.length} Pokémon)</div>
                    <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:4}}>
                      {learners.map(p=>{
                        const learnedAt=p.moves.find(m=>m.name===selMove.name);
                        return(
                          <div key={`${p.number}-${p.name}`} style={{display:"flex",alignItems:"center",gap:4,background:"#F8F4D0",borderRadius:4,padding:"3px 8px",cursor:"pointer"}}
                            onClick={()=>{/* Could select pokemon */}}>
                            <span style={{fontSize:9,color:"#4A5468",fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
                            <span style={{fontSize:11,color:"#202020"}}>{p.name}</span>
                            {learnedAt&&<span style={{fontSize:8,color:RANK_COLORS2[learnedAt.rank]}}>{learnedAt.rank}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          {tab==="abilities"&&selAbility&&(
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:24,color:"#202020"}}>{selAbility.name}</h2>
                {selAbility.isUnique&&<span style={{fontSize:11,fontWeight:700,color:"#A07000",background:"rgba(255,211,42,0.12)",padding:"2px 8px",borderRadius:4}}>UNIQUE</span>}
                <button onClick={()=>{const w=window.open("","_blank","width=500,height=400,resizable=yes");if(!w)return;w.document.write(`<!DOCTYPE html><html><head><title>${selAbility.name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#35785F;color:#202020;font-family:Inter,sans-serif;padding:20px;font-size:13px}h2{font-family:'Exo 2',sans-serif;margin-bottom:12px}p{color:#383838;line-height:1.5;margin-bottom:12px}.effect{background:#FBF8E4;padding:12px;border-radius:5px;border-left:3px solid #2850A0;line-height:1.6}</style></head><body><h2>${selAbility.name}${selAbility.isUnique?" (UNIQUE)":""}</h2><p>${selAbility.description}</p><div class="effect">${selAbility.effect}</div></body></html>`);w.document.close();}} style={{marginLeft:"auto",background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:4,color:"#383838",padding:"4px 8px",cursor:"pointer",fontSize:12}} title="Pop out">↗</button>
              </div>
              <p style={{color:"#383838",fontSize:13,lineHeight:1.6,marginBottom:14,padding:"10px 14px",background:"#F8F4D0",borderRadius:6,borderLeft:"3px solid #2850A0"}}>{selAbility.description}</p>
              <div style={{background:"#F8F4D0",borderRadius:6,padding:"12px 16px"}}><div style={{fontSize:9,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Effect</div><div style={{fontSize:13,color:"#202020",lineHeight:1.6}}>{selAbility.effect}</div></div>
            </div>
          )}
          {addModalItem&&<AddToInventoryModal item={addModalItem} onClose={()=>setAddModalItem(null)}/>}
          {tab==="items"&&(()=>{
            // Group by pocket → category
            const grouped: Record<string, Record<string, ItemData[]>> = {};
            filtItems.forEach(i=>{
              const p=i.pocket||"Other";
              const c=i.category||"General";
              if(!grouped[p])grouped[p]={};
              if(!grouped[p][c])grouped[p][c]=[];
              grouped[p][c].push(i);
            });
            const pocketOrder=["Medicine","HeldItems","TrainerItems","Other"];
            const sortedPockets=Object.keys(grouped).sort((a,b)=>pocketOrder.indexOf(a)-pocketOrder.indexOf(b)||a.localeCompare(b));
            if(filtItems.length===0)return(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#585858",flexDirection:"column",gap:8}}>
                <div style={{fontSize:32}}>🔍</div><div>No items match your filters.</div>
              </div>
            );
            return(
              <div style={{padding:"16px 20px"}}>
                {/* Header */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:20,color:"#202020",margin:0}}>
                    {itemPocketFilter?(POCKET_LABELS[itemPocketFilter]?.label??itemPocketFilter):itemCatFilter?itemCatFilter:"All Items"}
                  </h2>
                </div>
                {sortedPockets.map(pocket=>{
                  const pocketCfg=POCKET_LABELS[pocket]||{label:pocket,color:"#585858",icon:"📦"};
                  const cats=Object.keys(grouped[pocket]).sort();
                  return(
                    <div key={pocket} style={{marginBottom:24}}>
                      {!itemPocketFilter&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <span style={{fontSize:16}}>{pocketCfg.icon}</span>
                        <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:pocketCfg.color,margin:0}}>{pocketCfg.label}</h3>
                        <div style={{flex:1,height:1,background:`${pocketCfg.color}25`}}/>
                      </div>}
                      {cats.map(cat=>{
                        const catColor=CAT_ITEM_COLORS[cat==="General"?"":cat]||"#585858";
                        const items=grouped[pocket][cat];
                        return(
                          <div key={cat} style={{marginBottom:16}}>
                            {(cats.length>1||itemPocketFilter)&&cat!=="General"&&(
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                <span style={{fontSize:10,fontWeight:700,color:catColor,background:`${catColor}18`,border:`1px solid ${catColor}30`,borderRadius:3,padding:"1px 7px"}}>{cat}</span>
                                <div style={{flex:1,height:1,background:"#2850A0"}}/>
                                <span style={{fontSize:9,color:"#585858"}}>{items.length}</span>
                              </div>
                            )}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
                              {items.map(item=>{
                                const catCol=CAT_ITEM_COLORS[item.category]||"#585858";
                                return(
                                  <div key={item.name} style={{background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:7,padding:"10px 12px",borderLeft:`3px solid ${catCol}60`}}>
                                    <div style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:6}}>
                                      <div style={{flex:1}}>
                                        <div style={{fontSize:13,fontWeight:700,color:"#202020",lineHeight:1.3}}>{item.name}</div>
                                        {item.category&&<span style={{fontSize:9,fontWeight:700,color:catCol,background:`${catCol}18`,borderRadius:3,padding:"1px 5px",marginTop:3,display:"inline-block"}}>{item.category}</span>}
                                      </div>
                                      <div style={{textAlign:"right",flexShrink:0}}>
                                        {item.cost&&item.cost!=="Not for Sale"&&<div style={{fontSize:11,fontWeight:700,color:"#A07000",fontFamily:"'Exo 2'"}}>{item.cost}₽</div>}
                                        {item.cost==="Not for Sale"&&<div style={{fontSize:9,color:"#585858"}}>Not for sale</div>}
                                        {item.cost==="Rare"&&<div style={{fontSize:9,color:"#a040a0",fontWeight:700}}>Rare</div>}
                                        {item.oneUse&&<div style={{fontSize:9,color:"#f08030"}}>One-use</div>}
                                      </div>
                                    </div>
                                    <p style={{fontSize:11,color:"#383838",lineHeight:1.5,margin:"0 0 8px"}}>{item.description}</p>
                                    {item.forPokemon&&<div style={{fontSize:10,color:"#2850A0",marginBottom:6}}>For: {item.forPokemon}</div>}
                                    <button onClick={()=>setAddModalItem(item)}
                                      style={{fontSize:10,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontWeight:700,background:"rgba(255,211,42,0.08)",border:"1px solid #A0700030",color:"#A07000",width:"100%"}}>
                                      🎒 Add to Inventory
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {tab==="types"&&(
            <div style={{padding:24}}>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:"#202020",marginBottom:16}}>Defensive Type Chart</h2>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
                  <thead><tr>
                    <th style={{padding:"8px 12px",textAlign:"left",color:"#585858",background:"#F8F4D0",borderBottom:"1px solid #2850A0"}}>Type</th>
                    <th style={{padding:"8px 12px",color:"#C02820",background:"#F8F4D0",borderBottom:"1px solid #2850A0"}}>Weak to</th>
                    <th style={{padding:"8px 12px",color:"#2850A0",background:"#F8F4D0",borderBottom:"1px solid #2850A0"}}>Resists</th>
                    <th style={{padding:"8px 12px",color:"#A07000",background:"#F8F4D0",borderBottom:"1px solid #2850A0"}}>Immune to</th>
                  </tr></thead>
                  <tbody>
                    {ALL_TYPES.map((t,i)=>{
                      const chart=TYPE_CHART[t];
                      return (
                        <tr key={t} style={{background:i%2===0?"transparent":"#FBF8E440",borderBottom:"1px solid #2850A020"}}>
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
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:"#202020",marginBottom:16}}>Status Conditions</h2>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {Object.values(STATUS_EFFECTS).filter(s=>s.name!=="Healthy").map(s=>(
                  <div key={s.name} style={{background:"#FBF8E4",border:`1px solid ${s.color}40`,borderRadius:8,padding:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:s.color}}>{s.name}</span>
                      {s.endOfRound&&<span style={{fontSize:10,color:"#C02820",background:"rgba(255,71,87,0.1)",padding:"2px 7px",borderRadius:3}}>End of Round Effect</span>}
                    </div>
                    <p style={{fontSize:12,color:"#383838",marginBottom:s.endOfRound?8:0,lineHeight:1.5}}>{s.description}</p>
                    {s.endOfRound&&<div style={{fontSize:11,color:"#C02820",background:"rgba(255,71,87,0.08)",padding:"5px 8px",borderRadius:4}}>🔄 {s.endOfRound}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab==="weather"&&(
            <div style={{padding:24}}>
              <h2 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:22,color:"#202020",marginBottom:16}}>Weather & Terrain Effects</h2>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {WEATHER_EFFECTS.map(w=>(
                  <div key={w.name} style={{background:"#FBF8E4",border:`1px solid ${w.color}40`,borderRadius:8,padding:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:18}}>{w.emoji.split(" ")[0]}</span>
                      <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#202020"}}>{w.name}</span>
                      {w.modifiers.typeBoost&&<span style={{fontSize:10,color:"#f08030",background:"rgba(240,128,48,0.1)",padding:"2px 7px",borderRadius:3}}>Boosts {w.modifiers.typeBoost}</span>}
                      {w.modifiers.typeWeaken&&<span style={{fontSize:10,color:"#6890f0",background:"rgba(104,144,240,0.1)",padding:"2px 7px",borderRadius:3}}>Weakens {w.modifiers.typeWeaken}</span>}
                    </div>
                    <p style={{fontSize:12,color:"#383838",lineHeight:1.5,marginBottom:w.endOfRoundEffect?8:0}}>{w.description}</p>
                    {w.endOfRoundEffect&&<div style={{fontSize:11,color:"#C02820",background:"rgba(255,71,87,0.08)",padding:"5px 8px",borderRadius:4,marginBottom:6}}>🔄 {w.endOfRoundEffect}</div>}
                    {w.triggeredAbilities&&w.triggeredAbilities.length>0&&(
                      <div style={{fontSize:10,color:"#585858"}}>Triggers: <span style={{color:"#2850A0"}}>{w.triggeredAbilities.join(", ")}</span></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <HintBar hints={[
        {key:"◆",label:"BROWSE"},
        {key:"◎",label:"SELECT"},
        {key:"◉",label:tab==="items"?"ADD TO PARTY":"DETAILS"},
      ]}/>
    </PokedexFrame>
  );
}

export default function ReferencePage() {
  return (
    <Suspense fallback={<div style={{background:"#35785F",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#585858"}}>Loading…</div>}>
      <ReferenceTabs/>
    </Suspense>
  );
}

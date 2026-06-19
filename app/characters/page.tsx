"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { POKEMON, NATURES, TYPE_COLORS, Rank, TrainerAge, AGE_BONUSES, RANK_BONUSES, PokemonType } from "../data/pokerole-data";
import { saveToStorage, loadFromStorage } from "../lib/storage";

const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};
const RANKS: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
const AGES: TrainerAge[] = ["Child","Teen","Adult","Senior"];

interface Trainer {
  id: string; name: string; playerName: string; concept: string; nature: string;
  age: TrainerAge; rank: Rank; money: number;
  attributes: { strength: number; dexterity: number; vitality: number; insight: number };
  socialAttributes: { tough: number; cool: number; beauty: number; cute: number; clever: number };
  skills: { brawl: number; channel: number; clash: number; evasion: number; alert: number; athletic: number; nature: number; stealth: number; etiquette: number; intimidate: number; perform: number };
  achievements: string[]; notes: string; gymBadges: boolean[]; pokemon: string[];
}

function makeBlank(): Trainer {
  return { id:Date.now().toString(),name:"",playerName:"",concept:"",nature:"Hardy",age:"Teen",rank:"Rookie",money:2000,
    attributes:{strength:1,dexterity:1,vitality:1,insight:1},
    socialAttributes:{tough:1,cool:1,beauty:1,cute:1,clever:1},
    skills:{brawl:0,channel:0,clash:0,evasion:0,alert:0,athletic:0,nature:0,stealth:0,etiquette:0,intimidate:0,perform:0},
    achievements:[],notes:"",gymBadges:Array(8).fill(false),pokemon:[],
  };
}

function TypeBadge({type}:{type:PokemonType}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]}}>{type}</span>;
}

function PipRow({label,value,max=5,onChange}:{label:string;value:number;max?:number;onChange:(v:number)=>void}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
      <span style={{width:72,fontSize:11,color:"#5a6080",flexShrink:0}}>{label}</span>
      <div style={{display:"flex",gap:2}}>
        {Array.from({length:max}).map((_,i)=>(
          <div key={i} onClick={()=>onChange(i<value?i:i+1)} style={{width:14,height:14,borderRadius:2,cursor:"pointer",border:`1px solid ${i<value?"#00d4aa":"#2a2f45"}`,background:i<value?"#00d4aa":"transparent"}}/>
        ))}
      </div>
      <span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:"#e8eaf0",minWidth:16}}>{value}</span>
      <button onClick={()=>onChange(Math.max(0,value-1))} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:13}}>−</button>
      <button onClick={()=>onChange(Math.min(max,value+1))} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:13}}>+</button>
    </div>
  );
}

export default function CharactersPage() {
  const [trainers,setTrainers]=useState<Trainer[]>(()=>loadFromStorage("trainers",[]));
  const [selId,setSelId]=useState<string|null>(null);
  const [tab,setTab]=useState<"sheet"|"pokemon">("sheet");
  const [pSearch,setPSearch]=useState("");

  useEffect(()=>{saveToStorage("trainers",trainers);},[trainers]);
  const sel=trainers.find(t=>t.id===selId);

  const upd=useCallback((id:string,u:Partial<Trainer>)=>{
    setTrainers(prev=>prev.map(t=>t.id===id?{...t,...u}:t));
  },[]);

  const filtPokemon=POKEMON.filter(p=>!pSearch||p.name.toLowerCase().includes(pSearch.toLowerCase()));
  const rankBonus=sel?RANK_BONUSES[sel.rank]:RANK_BONUSES.Rookie;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",color:"#e8eaf0",overflow:"hidden"}}>
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 16px",height:48,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#3d8bff",fontWeight:700}}>👤 Characters</span>
      </nav>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:220,background:"#13151f",borderRight:"1px solid #2a2f45",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"10px 8px",borderBottom:"1px solid #2a2f45"}}>
            <button onClick={()=>{const t=makeBlank();setTrainers(p=>[...p,t]);setSelId(t.id);}}
              style={{width:"100%",background:"#3d8bff",color:"#fff",border:"none",borderRadius:5,padding:7,fontWeight:700,fontSize:12,cursor:"pointer"}}>+ New Trainer</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:4}}>
            {trainers.length===0&&<div style={{textAlign:"center",color:"#5a6080",padding:20,fontSize:12}}>No trainers yet</div>}
            {trainers.map(t=>(
              <div key={t.id} onClick={()=>setSelId(t.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:5,cursor:"pointer",background:selId===t.id?"#242842":"transparent",borderLeft:`2px solid ${selId===t.id?"#3d8bff":"transparent"}`}}
                onMouseEnter={e=>{if(selId!==t.id)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                onMouseLeave={e=>{if(selId!==t.id)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name||"Unnamed"}</div>
                  <div style={{fontSize:10,color:RANK_COLORS[t.rank]}}>{t.rank} · {t.age}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();setTrainers(p=>p.filter(x=>x.id!==t.id));if(selId===t.id)setSelId(null);}}
                  style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12}}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        {!sel?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#5a6080"}}>
            <div style={{fontSize:40}}>👤</div><div>Select or create a trainer</div>
          </div>
        ):(
          <div style={{flex:1,overflowY:"auto",padding:24}}>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {[["sheet","📋 Trainer Sheet"],["pokemon","🎮 Pokémon Party"]] .map(([v,l])=>(
                <button key={v} onClick={()=>setTab(v as "sheet"|"pokemon")} style={{padding:"6px 16px",borderRadius:6,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:tab===v?"rgba(61,139,255,0.15)":"transparent",color:tab===v?"#3d8bff":"#8b90a8"}}>{l}</button>
              ))}
            </div>

            {tab==="sheet"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                {/* Identity */}
                <div style={{gridColumn:"1/-1",background:"#1e2235",border:"1px solid #2a2f45",borderRadius:8,padding:16}}>
                  <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:"#3d8bff",marginBottom:14}}>Trainer Identity</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    {[["Trainer Name","name"],["Player Name","playerName"],["Concept","concept"]].map(([l,k])=>(
                      <div key={k}>
                        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                        <input value={(sel as any)[k]} onChange={e=>upd(sel.id,{[k]:e.target.value})}
                          style={{width:"100%",background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,padding:"6px 8px",color:"#e8eaf0",fontSize:13,outline:"none"}}/>
                      </div>
                    ))}
                    <div>
                      <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Age</div>
                      <select value={sel.age} onChange={e=>upd(sel.id,{age:e.target.value as TrainerAge})}
                        style={{width:"100%",background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,padding:"6px 8px",color:"#e8eaf0",fontSize:13}}>
                        {AGES.map(a=><option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Rank</div>
                      <select value={sel.rank} onChange={e=>upd(sel.id,{rank:e.target.value as Rank})}
                        style={{width:"100%",background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,padding:"6px 8px",color:RANK_COLORS[sel.rank],fontSize:13}}>
                        {RANKS.map(r=><option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Nature</div>
                      <select value={sel.nature} onChange={e=>upd(sel.id,{nature:e.target.value})}
                        style={{width:"100%",background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,padding:"6px 8px",color:"#e8eaf0",fontSize:13}}>
                        {NATURES.map(n=><option key={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:20,marginTop:14}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:10,color:"#5a6080",marginBottom:4}}>Max HP = 4+VIT</div>
                      <div style={{fontSize:22,fontFamily:"'Exo 2'",fontWeight:800,color:"#00d4aa"}}>{4+sel.attributes.vitality}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:10,color:"#5a6080",marginBottom:4}}>Will = INS+3</div>
                      <div style={{fontSize:22,fontFamily:"'Exo 2'",fontWeight:800,color:"#6890f0"}}>{sel.attributes.insight+3}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:10,color:"#5a6080",marginBottom:4}}>Money ₽</div>
                      <input type="number" value={sel.money} onChange={e=>upd(sel.id,{money:+e.target.value})}
                        style={{width:80,textAlign:"center",background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,color:"#ffd32a",fontSize:16,fontFamily:"'Exo 2'",fontWeight:700,padding:"2px 6px"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#5a6080",marginBottom:4}}>Gym Badges</div>
                      <div style={{display:"flex",gap:4}}>
                        {sel.gymBadges.map((b,i)=>(
                          <button key={i} onClick={()=>{const bg=[...sel.gymBadges];bg[i]=!b;upd(sel.id,{gymBadges:bg});}}
                            style={{width:24,height:24,borderRadius:3,border:`1px solid ${b?"#ffd32a":"#3a4060"}`,background:b?"rgba(255,211,42,0.2)":"transparent",color:b?"#ffd32a":"#5a6080",fontSize:12,cursor:"pointer"}}>🏅</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attributes */}
                <div style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:8,padding:16}}>
                  <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0",marginBottom:12}}>Attributes</h3>
                  {(["strength","dexterity","vitality","insight"] as const).map(attr=>(
                    <PipRow key={attr} label={attr.charAt(0).toUpperCase()+attr.slice(1)} value={sel.attributes[attr]} max={5}
                      onChange={v=>upd(sel.id,{attributes:{...sel.attributes,[attr]:v}})}/>
                  ))}
                  <div style={{borderTop:"1px solid #2a2f45",paddingTop:12,marginTop:8}}>
                    <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Social Attributes</div>
                    {(["tough","cool","beauty","cute","clever"] as const).map(attr=>(
                      <PipRow key={attr} label={attr.charAt(0).toUpperCase()+attr.slice(1)} value={sel.socialAttributes[attr]} max={5}
                        onChange={v=>upd(sel.id,{socialAttributes:{...sel.socialAttributes,[attr]:v}})}/>
                    ))}
                  </div>
                </div>

                {/* Skills */}
                <div style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:8,padding:16}}>
                  <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0",marginBottom:4}}>
                    Skills <span style={{fontSize:10,color:"#5a6080",fontWeight:400}}>Limit {rankBonus.skillLimit} per skill · {rankBonus.skills} total points</span>
                  </h3>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}>
                    {(Object.keys(sel.skills) as (keyof typeof sel.skills)[]).map(skill=>(
                      <PipRow key={skill} label={skill.charAt(0).toUpperCase()+skill.slice(1)} value={sel.skills[skill]} max={rankBonus.skillLimit}
                        onChange={v=>upd(sel.id,{skills:{...sel.skills,[skill]:v}})}/>
                    ))}
                  </div>
                </div>

                {/* Notes & Achievements */}
                <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:8,padding:16}}>
                    <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0",marginBottom:10}}>Achievements</h3>
                    {sel.achievements.map((a,i)=>(
                      <div key={i} style={{display:"flex",gap:6,marginBottom:5}}>
                        <input value={a} onChange={e=>{const arr=[...sel.achievements];arr[i]=e.target.value;upd(sel.id,{achievements:arr});}}
                          style={{flex:1,background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,color:"#e8eaf0",fontSize:12,padding:"4px 8px"}}/>
                        <button onClick={()=>upd(sel.id,{achievements:sel.achievements.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                    <button onClick={()=>upd(sel.id,{achievements:[...sel.achievements,""]})}
                      style={{fontSize:11,color:"#00d4aa",background:"none",border:"1px dashed #00d4aa40",borderRadius:4,padding:"4px 10px",cursor:"pointer",width:"100%"}}>+ Add</button>
                  </div>
                  <div style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:8,padding:16}}>
                    <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0",marginBottom:10}}>Notes</h3>
                    <textarea value={sel.notes} onChange={e=>upd(sel.id,{notes:e.target.value})}
                      style={{width:"100%",background:"#13151f",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:12,padding:8,resize:"none",height:110,fontFamily:"inherit",lineHeight:1.5,outline:"none"}}/>
                  </div>
                </div>
              </div>
            )}

            {tab==="pokemon"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <div>
                  <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10}}>Party ({sel.pokemon.length}/6)</div>
                  {sel.pokemon.map((pNum,idx)=>{
                    const p=POKEMON.find(x=>x.number===+pNum);
                    if(!p) return null;
                    return (
                      <div key={idx} style={{background:"#1e2235",border:`1px solid ${TYPE_COLORS[p.types[0]]}40`,borderRadius:6,padding:"10px 12px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0"}}>{p.name}</span>
                          {p.types.map(t=><TypeBadge key={t} type={t}/>)}
                          <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
                          <button onClick={()=>{const arr=[...sel.pokemon];arr.splice(idx,1);upd(sel.id,{pokemon:arr});}} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer"}}>✕</button>
                        </div>
                        <div style={{fontSize:11,color:"#8b90a8"}}>HP {p.baseHp+p.attributes.vitality} · STR {p.attributes.strength} · DEX {p.attributes.dexterity} · SPC {p.attributes.special}</div>
                        <div style={{fontSize:10,color:"#5a6080",marginTop:2}}>{p.abilities.join(" / ")}</div>
                      </div>
                    );
                  })}
                  {sel.pokemon.length===0&&<div style={{fontSize:12,color:"#5a6080",fontStyle:"italic"}}>No Pokémon yet</div>}
                  <div style={{marginTop:16,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:6,padding:12}}>
                    <Link href="/gm-screen" style={{display:"inline-block",background:"#00d4aa",color:"#0f1117",borderRadius:4,padding:"6px 14px",fontWeight:700,fontSize:12,textDecoration:"none"}}>
                      ⚔️ Open Battle Tracker
                    </Link>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Add Pokémon</div>
                  <input type="text" placeholder="Search…" value={pSearch} onChange={e=>setPSearch(e.target.value)}
                    style={{width:"100%",background:"#1e2235",border:"1px solid #2a2f45",borderRadius:5,padding:"6px 10px",color:"#e8eaf0",fontSize:12,marginBottom:8,outline:"none"}}/>
                  <div style={{maxHeight:500,overflowY:"auto"}}>
                    {filtPokemon.map(p=>{
                      const inParty=sel.pokemon.includes(String(p.number));
                      return (
                        <div key={p.number} onClick={()=>{if(!inParty&&sel.pokemon.length<6)upd(sel.id,{pokemon:[...sel.pokemon,String(p.number)]});}}
                          style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:4,cursor:inParty||sel.pokemon.length>=6?"not-allowed":"pointer",opacity:inParty||sel.pokemon.length>=6?0.5:1}}
                          onMouseEnter={e=>{if(!inParty&&sel.pokemon.length<6)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                          <span style={{fontSize:9,color:"#3a4060",width:26,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
                          <span style={{fontSize:12,color:"#e8eaf0",flex:1}}>{p.name}</span>
                          {p.types.map(t=><TypeBadge key={t} type={t}/>)}
                          {inParty&&<span style={{fontSize:10,color:"#00d4aa"}}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
// Standalone full-page Battle Tracker — independent of GM Screen
import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  POKEMON, MOVES, ABILITIES, TYPE_COLORS, TYPE_CHART, MISSINGNO, HABITATS,
  PokemonEntry, Move, PokemonType, Rank,
} from "../data/pokerole-data";
import {
  STATUS_CONDITIONS, WEATHER_DATA, WeatherData,
  getDisobedienceLevel, getPainPenalty,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";

// Re-export SelfContainedTracker as the full page
// All the shared components live in gm-screen/page.tsx but we need them here too.
// Rather than duplicate, we create a thin wrapper that imports the same data layer
// and renders the battle tracker directly.

const RANK_COLORS: Record<Rank,string> = {
  Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",
  Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700",
};
type AttrSet={strength:number;dexterity:number;vitality:number;special:number;insight:number};
interface StatMod{source:string;attr:string;amount:number;}
interface AbilityState{name:string;active:boolean;disabledReason?:string;}
interface BattleEntry{
  id:string;pokemon:PokemonEntry;nickname:string;
  initiative:number;currentHp:number;maxHp:number;currentWill:number;maxWill:number;
  status:string;statusTurnsLeft:number;
  notes:string;isExpanded:boolean;hasTakenTurn:boolean;
  side:"player"|"enemy"|"neutral";trainerRank:Rank;
  abilities:AbilityState[];moves:Move[];
  attrs:AttrSet;statMods:StatMod[];
  weatherImmune:boolean;actionCount:number;
  linkedTrainerId?:string;showTrainerView?:boolean;
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function TypeBadge({type,small}:{type:PokemonType;small?:boolean}){
  return <span style={{display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 7px",borderRadius:3,fontSize:small?9:11,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]}}>{type}</span>;
}
function rollDice(pool:number):{rolls:number[];successes:number}{
  const p=Math.max(1,pool);
  const rolls=Array.from({length:p},()=>Math.floor(Math.random()*6)+1);
  return {rolls,successes:rolls.filter(r=>r>=4).length};
}
function HpBar({current,max}:{current:number;max:number}){
  const pct=max>0?Math.max(0,Math.min(1,current/max)):0;
  const c=pct>0.5?"#00d4aa":pct>0.25?"#ffd32a":"#ff4757";
  return <div style={{background:"#0f1117",borderRadius:3,height:5,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:c,transition:"width 0.3s"}}/></div>;
}
const adjBtn:React.CSSProperties={width:20,height:20,background:"#1a1d27",border:"1px solid #3a4060",borderRadius:3,color:"#00d4aa",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"};
function getEffectiveAttrs(e:BattleEntry):AttrSet{
  const sc=STATUS_CONDITIONS[e.status];const accPen=sc?.accuracyPenalty??0;
  const mods=e.statMods.reduce<Partial<AttrSet>>((acc,m)=>{const k=m.attr as keyof AttrSet;if(k in e.attrs)acc[k]=(acc[k]??e.attrs[k])+m.amount;return acc;},{});
  return{strength:Math.max(0,mods.strength??e.attrs.strength),dexterity:Math.max(0,(mods.dexterity??e.attrs.dexterity)-accPen),vitality:Math.max(0,mods.vitality??e.attrs.vitality),special:Math.max(0,mods.special??e.attrs.special),insight:Math.max(0,mods.insight??e.attrs.insight)};
}
function calcAccPool(move:Move,attrs:AttrSet,actionCount:number):number{
  const acc=move.accuracy.toLowerCase();let pool=0;
  if(acc.includes("strength"))pool+=attrs.strength;if(acc.includes("dexterity"))pool+=attrs.dexterity;
  if(acc.includes("special"))pool+=attrs.special;if(acc.includes("insight"))pool+=attrs.insight;
  if(acc.includes("cute")||acc.includes("cool")||acc.includes("beauty"))pool+=1;
  pool+=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
  return Math.max(1,pool);
}
function calcDmgPool(move:Move,attrs:AttrSet,weather:WeatherData,stab:boolean,abilBonus:number):number{
  const dmg=move.damagePool.toLowerCase();if(dmg==="-")return 0;let pool=0;
  if(dmg.includes("strength"))pool+=attrs.strength;if(dmg.includes("special"))pool+=attrs.special;
  const pm=move.power.match(/(\d+)/);if(pm)pool+=parseInt(pm[1]);
  if(stab)pool+=1;if(weather.typeBoost===move.type&&weather.typeBoostDice)pool+=weather.typeBoostDice;
  if(weather.typeWeaken===move.type&&weather.typeWeakenDice)pool=Math.max(1,pool-weather.typeWeakenDice);
  return Math.max(1,pool+abilBonus);
}
function getTypeMult(mt:PokemonType,dts:PokemonType[]):{label:string;color:string;dmgMod:number}{
  let w=false,r=false,i=false;
  dts.forEach(dt=>{const c=TYPE_CHART[dt];if(c.weaknesses.includes(mt))w=true;if(c.resistances.includes(mt))r=true;if(c.immunities.includes(mt))i=true;});
  if(i)return{label:"Immune",color:"#5a6080",dmgMod:-999};
  if(w)return{label:"Super Effective ×2",color:"#ff4757",dmgMod:2};
  if(r)return{label:"Not very effective ×0.5",color:"#00d4aa",dmgMod:-1};
  return{label:"Normal",color:"#8b90a8",dmgMod:0};
}
function calcAbilityBonus(entry:BattleEntry,move:Move,weather:WeatherData):{bonus:number;reasons:string[]}{
  const res:{bonus:number;reasons:string[]}={bonus:0,reasons:[]};
  const mt=move.type as PokemonType;const atHalf=entry.currentHp<=entry.maxHp/2;
  const isPhys=move.category==="Physical";
  entry.abilities.filter(a=>a.active).forEach(ab=>{const n=ab.name;
    if((n==="Blaze"&&mt==="Fire")||(n==="Overgrow"&&mt==="Grass")||(n==="Torrent"&&mt==="Water")||(n==="Swarm"&&mt==="Bug")){if(atHalf){res.bonus+=2;res.reasons.push(`${n} +2 (HP≤50%)`);}}
    else if(n==="Technician"&&move.power!=="-"&&parseInt(move.power)<=2){res.bonus+=2;res.reasons.push("Technician +2");}
    else if(n==="Huge Power"||n==="Pure Power"){res.bonus+=2;res.reasons.push(`${n} +2`);}
    else if(n==="Tough Claws"&&isPhys){res.bonus+=2;res.reasons.push("Tough Claws +2");}
    else if(n==="Iron Fist"&&move.effect.toLowerCase().includes("punch")){res.bonus+=2;res.reasons.push("Iron Fist +2");}
    else if(n==="Strong Jaw"&&move.effect.toLowerCase().includes("bite")){res.bonus+=2;res.reasons.push("Strong Jaw +2");}
    else if(n==="Transistor"&&mt==="Electric"){res.bonus+=2;res.reasons.push("Transistor +2");}
    else if(n==="Guts"&&isPhys&&entry.status!=="Healthy"){res.bonus+=2;res.reasons.push(`Guts +2`);}
    else if(n==="Gorilla Tactics"&&isPhys){res.bonus+=2;res.reasons.push("Gorilla Tactics +2");}
    else if(n==="Flash Fire"&&mt==="Fire"){res.bonus+=2;res.reasons.push("Flash Fire +2");}
    else if(n==="Dark Aura"&&mt==="Dark"){res.bonus+=1;res.reasons.push("Dark Aura +1");}
    else if(n==="Fairy Aura"&&mt==="Fairy"){res.bonus+=1;res.reasons.push("Fairy Aura +1");}
    else if(n==="Adaptability"&&entry.pokemon.types.includes(mt)){res.bonus+=1;res.reasons.push("Adaptability +1");}
    else if(n==="Sniper"){res.reasons.push("Sniper: crits +2 extra dice");}
    else if(n==="Parental Bond"&&move.category!=="Support"){res.reasons.push("Parental Bond: hits twice");}
  });
  return res;
}

// ── Move Attack Popup ─────────────────────────────────────────────────────────
function MovePopup({move,attacker,allEntries,weather,onClose,onApplyDmg,onApplyEffect}:{
  move:Move;attacker:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;
  onClose:()=>void;onApplyDmg:(id:string,dmg:number)=>void;
  onApplyEffect:(id:string,attr:string,amount:number,src:string)=>void;
}){
  const [targets,setTargets]=useState<string[]>([]);
  const [accResult,setAccResult]=useState<{rolls:number[];successes:number}|null>(null);
  const [dmgResults,setDmgResults]=useState<Record<string,{rolls:number[];successes:number}>>({});
  const [applied,setApplied]=useState<Set<string>>(new Set());
  const sc=STATUS_CONDITIONS[attacker.status];
  const flinched=attacker.status==="Flinched";
  const needsPreRoll=!flinched&&(sc?.requiresRollToAct??false);
  const [preRollDone,setPreRollDone]=useState<{canAct:boolean;detail:string}|null>(
    flinched?{canAct:false,detail:"Flinched — cannot act this turn."}:!needsPreRoll?{canAct:true,detail:""}:null
  );
  const [loyaltyRoll,setLoyaltyRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const attrs=getEffectiveAttrs(attacker);
  const stab=attacker.pokemon.types.includes(move.type as PokemonType);
  const actReq=[1,2,3,4,5][Math.min(attacker.actionCount,4)];
  const isAOE=move.effect.toLowerCase().includes("all")&&!move.effect.toLowerCase().includes("single");
  const isClash=move.name==="Clash"||(move.priority??0)>=6;
  const others=allEntries.filter(e=>e.id!==attacker.id&&e.currentHp>0);
  const abilMods=calcAbilityBonus(attacker,move,weather);
  const accPool=calcAccPool(move,attrs,attacker.actionCount);
  const canAct=preRollDone?.canAct??false;
  const disobedience=getDisobedienceLevel(attacker.pokemon.suggestedRank,attacker.trainerRank);

  // Pool breakdown
  const accBreakdown=(()=>{
    const acc=move.accuracy.toLowerCase();const parts:string[]=[];
    if(acc.includes("strength"))parts.push(`STR ${attrs.strength}`);
    if(acc.includes("dexterity"))parts.push(`DEX ${attrs.dexterity}`);
    if(acc.includes("special"))parts.push(`SPC ${attrs.special}`);
    if(acc.includes("insight"))parts.push(`INS ${attrs.insight}`);
    const skill=(acc.includes("brawl")?"Brawl":acc.includes("athletic")?"Athletic":acc.includes("channel")?"Channel":acc.includes("perform")?"Perform":acc.includes("clash")?"Clash":"Skill");
    const sv=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
    parts.push(`${skill} ${sv}`);
    const dexMod=attacker.statMods.filter(m=>m.attr==="dexterity").reduce((s,m)=>s+m.amount,0);
    if(dexMod!==0&&acc.includes("dexterity"))parts.push(`Mod ${dexMod>0?"+":""}${dexMod}`);
    const statusPen=STATUS_CONDITIONS[attacker.status]?.accuracyPenalty??0;
    if(statusPen>0)parts.push(`${attacker.status} −${statusPen}`);
    return parts.join(" + ");
  })();

  const toggleTarget=(id:string)=>{if(isAOE)setTargets(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);else setTargets([id]);};
  const doPreRoll=()=>{
    if(attacker.status==="Asleep"||attacker.status==="Frozen"){const r=Math.floor(Math.random()*6)+1;const ok=attacker.status==="Asleep"?r>=4:r>=5;setPreRollDone({canAct:ok,detail:`Rolled ${r}. ${ok?`✓ ${attacker.status==="Asleep"?"Woke up":"Thawed"}!`:`✗ Still ${attacker.status}.`}`});}
    else if(attacker.status==="Paralyzed"){const r=Math.floor(Math.random()*6)+1;setPreRollDone({canAct:r>=3,detail:`Paralysis: ${r} — ${r>=3?"✓ Can act (−2 acc).":"✗ Cannot act."}`});}
    else if(attacker.status==="Confused"){const r=Math.floor(Math.random()*6)+1;setPreRollDone({canAct:r>=4,detail:`Confusion: ${r} — ${r>=4?"✓ Acts normally.":"✗ Hits itself!"}`});}
    else if(attacker.status==="Infatuated"){const res=rollDice(attacker.currentWill);setPreRollDone({canAct:res.successes>=2,detail:`WP [${res.rolls.join(",")}]=${res.successes} — ${res.successes>=2?"✓ Can act.":"✗ Distracted!"}`});}
  };
  const doDmgFor=(tid:string)=>{const pool=calcDmgPool(move,attrs,weather,stab,abilMods.bonus);setDmgResults(prev=>({...prev,[tid]:rollDice(pool)}));};
  const applyDmgToTarget=(tid:string)=>{
    const t=allEntries.find(e=>e.id===tid);const dr=dmgResults[tid];if(!t||!dr)return;
    const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);if(tm.dmgMod===-999){alert("Immune!");return;}
    const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
    let succ=Math.max(1,dr.successes);if(tm.dmgMod===2)succ=Math.ceil(succ*1.5);if(tm.dmgMod===-1)succ=Math.max(1,succ-1);
    const finalDmg=Math.max(1,succ-def);
    onApplyDmg(tid,finalDmg);setApplied(prev=>new Set([...prev,tid]));onClose();
  };
  const statFx:{attr:string;amount:number}[]=[];
  const el=move.effect.toLowerCase();
  if(el.includes("strength")&&el.includes("by 1")&&!el.includes("increase"))statFx.push({attr:"strength",amount:-1});
  if(el.includes("defense")&&el.includes("by 1")&&!el.includes("sp.")&&!el.includes("increase"))statFx.push({attr:"vitality",amount:-1});
  if(el.includes("sp. def")&&el.includes("by 1"))statFx.push({attr:"insight",amount:-1});
  if(el.includes("increase")&&el.includes("strength"))statFx.push({attr:"strength",amount:1});

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:500,maxWidth:"95vw",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",gap:8}}>
          <TypeBadge type={move.type as PokemonType}/>
          <span style={{fontSize:11,fontWeight:700,color:move.category==="Physical"?"#f08030":move.category==="Special"?"#6890f0":"#78c850",background:move.category==="Physical"?"rgba(240,128,48,0.15)":move.category==="Special"?"rgba(104,144,240,0.15)":"rgba(120,200,80,0.15)",padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          {stab&&<span style={{fontSize:9,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"1px 5px",borderRadius:3,fontWeight:700}}>STAB +1</span>}
          {(move.priority??0)>0&&<span style={{fontSize:9,color:"#00d4aa",background:"rgba(0,212,170,0.12)",padding:"1px 5px",borderRadius:3,fontWeight:700}}>PRIORITY {move.priority}</span>}
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#e8eaf0",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
          <p style={{fontSize:12,color:"#8b90a8",lineHeight:1.5,margin:0}}>{move.description}</p>
          <div style={{background:"#13151f",borderRadius:5,padding:"7px 10px",fontSize:11,color:"#e8eaf0"}}><strong style={{color:"#5a6080"}}>Effect: </strong>{move.effect}</div>
          {(abilMods.bonus>0||abilMods.reasons.length>0)&&<div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa20",borderRadius:5,padding:"8px 10px"}}><div style={{fontSize:10,color:"#00d4aa",fontWeight:700,marginBottom:4}}>Active Ability Modifiers</div>{abilMods.reasons.map((r,i)=><div key={i} style={{fontSize:10,color:"#8b90a8"}}>✦ {r}</div>)}{abilMods.bonus>0&&<div style={{fontSize:11,color:"#00d4aa",fontWeight:700,marginTop:3}}>+{abilMods.bonus} dice to damage pool</div>}</div>}
          {(weather.typeBoost===move.type||weather.typeWeaken===move.type)&&<div style={{background:"rgba(255,211,42,0.08)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ffd32a"}}>{weather.emoji?.split(" ")[0]} {weather.name}: {weather.typeBoost===move.type?`+${weather.typeBoostDice} dice`:`−${weather.typeWeakenDice} dice`}</div>}
          {attacker.actionCount>0&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757"}}>Action #{attacker.actionCount+1} — needs {actReq} hit{actReq>1?"s":""} to connect</div>}
          {disobedience!=="none"&&<div style={{background:disobedience==="high"?"rgba(255,71,87,0.1)":"rgba(255,211,42,0.08)",border:`1px solid ${disobedience==="high"?"#ff475740":"#ffd32a40"}`,borderRadius:4,padding:"8px 10px"}}><div style={{fontWeight:700,color:disobedience==="high"?"#ff4757":"#ffd32a",fontSize:11,marginBottom:4}}>{disobedience==="high"?"🔴 High Disobedience — ignores commands":"⚠ Low Disobedience — Loyalty check required"}</div>{disobedience==="low"&&<div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={()=>setLoyaltyRoll(rollDice(3))} style={{background:"rgba(255,211,42,0.15)",border:"1px solid #ffd32a40",borderRadius:4,color:"#ffd32a",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Loyalty (3+)</button>{loyaltyRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:loyaltyRoll.successes>=3?"#00d4aa":"#ff4757"}}>[{loyaltyRoll.rolls.join(",")}]={loyaltyRoll.successes} {loyaltyRoll.successes>=3?"✓":"✗"}</span>}</div>}</div>}
          {(needsPreRoll||flinched)&&<div style={{background:"rgba(168,64,160,0.1)",border:"1px solid #a040a040",borderRadius:4,padding:"8px 10px"}}><div style={{fontSize:11,fontWeight:700,color:sc?.color,marginBottom:4}}>{attacker.status}: {sc?.shortDesc}</div><div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>{sc?.rollToActDesc}</div>{!preRollDone&&!flinched&&<button onClick={doPreRoll} style={{background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Pre-Action Check</button>}{preRollDone&&<div style={{fontSize:12,fontWeight:700,color:preRollDone.canAct?"#00d4aa":"#ff4757"}}>{preRollDone.detail}</div>}</div>}
          {canAct&&<div><div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>{isAOE?"Select Targets (multi)":"Select Target"}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{others.map(t=><button key={t.id} onClick={()=>toggleTarget(t.id)} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#e8eaf0":"#8b90a8"}}>{t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})</button>)}</div></div>}
          {canAct&&targets.map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;return<div key={tid} style={{background:tm.color+"10",border:`1px solid ${tm.color}30`,borderRadius:4,padding:"6px 10px"}}><div style={{fontSize:11,fontWeight:700,color:tm.color}}>{t.nickname||t.pokemon.name}: {tm.label}</div><div style={{fontSize:10,color:"#8b90a8",marginTop:2}}>Defense: {def} ({move.category==="Physical"?"VIT":"INS"})</div></div>;})}
          {canAct&&<div><div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>1. Accuracy — {move.accuracy} · Need {actReq}+</div><div style={{fontSize:10,color:"#5a6080",marginBottom:6,fontStyle:"italic"}}>Pool: {accBreakdown} = <strong style={{color:"#6890f0"}}>{accPool}d</strong></div><div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={()=>setAccResult(rollDice(accPool))} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Accuracy ({accPool}d)</button>{accResult&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:accResult.successes>=actReq?"#00d4aa":"#ff4757"}}>[{accResult.rolls.join(",")}]={accResult.successes} {accResult.successes>=actReq?"✓ HIT":"✗ MISS"}</span>}</div></div>}
          {canAct&&accResult&&accResult.successes>=actReq&&move.category!=="Support"&&!isClash&&targets.map(tid=>{
            const t=allEntries.find(e=>e.id===tid);if(!t)return null;
            const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);
            const pool=calcDmgPool(move,attrs,weather,stab,abilMods.bonus);
            const dr=dmgResults[tid];const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
            const finalDmg=dr?Math.max(1,(tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes)-def):null;
            const wasApplied=applied.has(tid);
            return<div key={tid} style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>2. Damage → {t.nickname||t.pokemon.name} ({pool}d)</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}><button onClick={()=>doDmgFor(tid)} disabled={!!dr} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:dr?"#5a6080":"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:dr?"default":"pointer"}}>🎲 Roll Damage ({pool}d)</button>{dr&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{dr.rolls.join(",")}]={dr.successes}</span>}</div>
              {dr&&tm.dmgMod!==-999&&<div>{<div style={{fontSize:11,color:"#8b90a8",marginBottom:6}}>{dr.successes}{tm.dmgMod===2?" ×2 SE":tm.dmgMod===-1?" ×0.5 NVE":""} − {def} DEF = <strong style={{color:"#ff4757"}}>{finalDmg} damage</strong></div>}{!wasApplied&&<button onClick={()=>applyDmgToTarget(tid)} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>⚔ Apply {finalDmg} to {t.nickname||t.pokemon.name}</button>}{wasApplied&&<div style={{textAlign:"center",color:"#00d4aa",fontWeight:700}}>✓ Applied</div>}</div>}
            </div>;
          })}
          {canAct&&accResult&&accResult.successes>=actReq&&statFx.length>0&&targets.length>0&&<div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Stat Changes</div>{statFx.map((se,i)=>targets.map(tid=>{const t=allEntries.find(e=>e.id===tid);return<button key={`${i}-${tid}`} onClick={()=>onApplyEffect(tid,se.attr,se.amount,move.name)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",background:se.amount<0?"rgba(255,71,87,0.1)":"rgba(0,212,170,0.1)",border:`1px solid ${se.amount<0?"#ff475730":"#00d4aa30"}`,color:se.amount<0?"#ff4757":"#00d4aa",fontSize:11,fontWeight:700,width:"100%",marginBottom:3}}>{se.amount>0?"▲":"▼"} Apply {se.attr} {se.amount>0?"+":"−"}1 to {t?.nickname||t?.pokemon.name}</button>;}))}</div>}
        </div>
      </div>
    </div>
  );
}

// ── End-of-Round popup ────────────────────────────────────────────────────────
function EORPopup({entries,weather,round,onApply,onClose}:{entries:BattleEntry[];weather:WeatherData;round:number;onApply:(id:string,hp:number,r:string)=>void;onClose:()=>void;}){
  const effects:{entry:BattleEntry;desc:string;hp:number}[]=[];
  entries.filter(e=>e.currentHp>0).forEach(e=>{
    if(e.status==="Burned")effects.push({entry:e,desc:"Burn: −1 HP",hp:-1});
    if(e.status==="Poisoned")effects.push({entry:e,desc:"Poison: −1 HP",hp:-1});
    if(e.status==="Badly Poisoned")effects.push({entry:e,desc:"Bad Poison: −2 HP",hp:-2});
    if(weather.endOfRoundDmg&&!e.weatherImmune&&!(weather.immuneTypes??[]).some((t:string)=>e.pokemon.types.includes(t as PokemonType)))effects.push({entry:e,desc:`${weather.name} chip`,hp:-weather.endOfRoundDmg});
  });
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🔄 End of Round {round}</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button></div>
        <div style={{padding:16,overflowY:"auto"}}>
          {effects.length===0?<div style={{color:"#5a6080",textAlign:"center",padding:20}}>No end-of-round effects.</div>
          :effects.map((ef,i)=><div key={i} style={{background:"#13151f",borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><div><div style={{fontSize:12,fontWeight:700,color:"#e8eaf0"}}>{ef.entry.nickname||ef.entry.pokemon.name}</div><div style={{fontSize:11,color:"#8b90a8",marginTop:2}}>{ef.desc}</div></div><button onClick={()=>onApply(ef.entry.id,ef.hp,ef.desc)} style={{background:"#ff475720",border:"1px solid #ff475740",borderRadius:4,color:"#ff4757",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Apply {ef.hp}</button></div>)}
          {effects.length>0&&<button onClick={()=>{effects.forEach(ef=>onApply(ef.entry.id,ef.hp,ef.desc));onClose();}} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:8}}>Apply All & Close</button>}
        </div>
      </div>
    </div>
  );
}

// ── Priority Popup ────────────────────────────────────────────────────────────
function PriorityPopup({entries,onClose}:{entries:BattleEntry[];onClose:()=>void;}){
  const pri=useMemo(()=>{
    const r:{entry:BattleEntry;move:Move}[]=[];
    entries.filter(e=>e.currentHp>0).forEach(e=>{
      const pm=e.moves.filter(m=>(m.priority??0)>0);
      if(pm.length>0)r.push({entry:e,move:pm.sort((a,b)=>(b.priority??0)-(a.priority??0))[0]});
    });
    return r.sort((a,b)=>(b.move.priority??0)-(a.move.priority??0));
  },[entries]);
  if(pri.length===0)return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #00d4aa40",borderRadius:10,width:460,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:"#00d4aa",margin:0}}>⚡ Priority Phase</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button></div>
        <div style={{padding:16,overflowY:"auto"}}>
          <p style={{fontSize:11,color:"#8b90a8",marginBottom:12}}>These combatants have priority/reaction moves. Declare usage before normal turn order.</p>
          {pri.map(({entry,move})=><div key={entry.id} style={{background:"#13151f",border:`1px solid ${TYPE_COLORS[move.type as PokemonType]||"#2a2f45"}30`,borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}><div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#e8eaf0"}}>{entry.nickname||entry.pokemon.name}</div><div style={{display:"flex",gap:6,alignItems:"center",marginTop:3}}><TypeBadge type={move.type as PokemonType} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{move.name}</span><span style={{fontSize:10,fontWeight:700,color:"#00d4aa"}}>Priority {move.priority}</span></div></div><span style={{fontSize:11,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span></div>)}
          <button onClick={onClose} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>Continue to Normal Turn Order ▶</button>
        </div>
      </div>
    </div>
  );
}

// ── Capture Popup ─────────────────────────────────────────────────────────────
function CapturePopup({target,onClose}:{target:BattleEntry;onClose:()=>void;}){
  const [ballType,setBallType]=useState<"Pokéball"|"Great Ball"|"Ultra Ball">("Pokéball");
  const [throwRoll,setThrowRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [sealRoll,setSealRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const bp={"Pokéball":4,"Great Ball":6,"Ultra Ball":8};
  const req:Record<Rank,number>={Starter:3,Rookie:4,Standard:6,Advanced:8,Expert:9,Ace:10,Master:12,Champion:14};
  const required=req[target.pokemon.suggestedRank]??6;
  const atHalf=target.currentHp<=target.maxHp/2&&target.currentHp>1;
  const atOne=target.currentHp===1;
  const hpBonus=atOne?2:atHalf?1:0;const statusBonus=target.status!=="Healthy"?1:0;const totalBonus=hpBonus+statusBonus;
  const totalSuccesses=(throwRoll?.successes??0)+(sealRoll?.successes??0)+totalBonus;
  const caught=!!(throwRoll&&sealRoll&&totalSuccesses>=required);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"85vh",overflow:"auto"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🎯 Capture — {target.nickname||target.pokemon.name}</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button></div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px",fontSize:11}}><span style={{color:"#5a6080"}}>Rank: </span><strong style={{color:"#ffd32a"}}>{target.pokemon.suggestedRank}</strong><span style={{color:"#5a6080",marginLeft:12}}>Needs: </span><strong style={{color:"#ffd32a"}}>{required} successes</strong><span style={{color:"#5a6080",marginLeft:12}}>HP: </span><strong style={{color:atOne?"#ff4757":atHalf?"#ffd32a":"#00d4aa"}}>{target.currentHp}/{target.maxHp}</strong></div>
          {totalBonus>0&&<div style={{background:"rgba(0,212,170,0.08)",border:"1px solid #00d4aa30",borderRadius:5,padding:"8px 10px",fontSize:11}}><div style={{color:"#00d4aa",fontWeight:700,marginBottom:3}}>Bonus: +{totalBonus}</div>{hpBonus>0&&<div style={{color:"#8b90a8"}}>{atOne?"At 1 HP +2":"At half HP +1"}</div>}{statusBonus>0&&<div style={{color:"#8b90a8"}}>{target.status} +1</div>}</div>}
          <div style={{display:"flex",gap:6}}>{(["Pokéball","Great Ball","Ultra Ball"] as const).map(b=><button key={b} onClick={()=>setBallType(b)} style={{flex:1,padding:"6px",borderRadius:5,border:`1px solid ${ballType===b?"#ffd32a":"#3a4060"}`,background:ballType===b?"rgba(255,211,42,0.15)":"transparent",color:ballType===b?"#ffd32a":"#8b90a8",fontSize:11,fontWeight:ballType===b?700:400,cursor:"pointer"}}>{b}<div style={{fontSize:9,color:"#5a6080"}}>{bp[b]}d</div></button>)}</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={()=>setThrowRoll(rollDice(4))} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Throw (4d)</button>{throwRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{throwRoll.rolls.join(",")}]={throwRoll.successes}</span>}</div>
          {throwRoll&&throwRoll.successes>0&&<div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={()=>setSealRoll(rollDice(bp[ballType]))} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:"#f08030",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Seal ({bp[ballType]}d)</button>{sealRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{sealRoll.rolls.join(",")}]={sealRoll.successes}</span>}</div>}
          {throwRoll&&sealRoll&&<div style={{background:caught?"rgba(0,212,170,0.15)":"rgba(255,71,87,0.15)",border:`1px solid ${caught?"#00d4aa":"#ff4757"}40`,borderRadius:6,padding:"12px 16px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,fontFamily:"'Exo 2'",color:caught?"#00d4aa":"#ff4757",marginBottom:4}}>{caught?"✓ Caught!":"✗ Broke Free!"}</div><div style={{fontSize:12,color:"#8b90a8"}}>{throwRoll.successes}+{sealRoll.successes}+{totalBonus}={totalSuccesses}/{required}</div>{!caught&&<div style={{fontSize:11,color:"#5a6080",marginTop:3}}>Need {required-totalSuccesses} more.</div>}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Battle Card ───────────────────────────────────────────────────────────────
function BattleCard({entry,allEntries,weather,isActive,onUpdate,onRemove,onDragStart,onDragOver,onDrop}:{
  entry:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;isActive:boolean;
  onUpdate:(id:string,u:Partial<BattleEntry>)=>void;onRemove:(id:string)=>void;
  onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:()=>void;
}){
  const [movePopup,setMovePopup]=useState<Move|null>(null);
  const [showEditMoves,setShowEditMoves]=useState(false);
  const [showCapture,setShowCapture]=useState(false);
  const [showTrainerView,setShowTrainerView]=useState(false);
  const upd=(u:Partial<BattleEntry>)=>onUpdate(entry.id,u);
  const sc=STATUS_CONDITIONS[entry.status];
  const sideColor={player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[entry.side];
  const painPenalty=getPainPenalty(entry.currentHp,entry.maxHp);
  const disobedience=getDisobedienceLevel(entry.pokemon.suggestedRank,entry.trainerRank);
  const linkedTrainer=useMemo(()=>{if(!entry.linkedTrainerId)return null;return loadFromStorage<any[]>("trainers",[]).find((t:any)=>t.id===entry.linkedTrainerId)||null;},[entry.linkedTrainerId]);
  const attrModSummary=(attr:keyof typeof entry.attrs)=>entry.statMods.filter(m=>m.attr===attr).reduce((s,m)=>s+m.amount,0);
  const applyDmg=(tid:string,dmg:number)=>{const t=allEntries.find(e=>e.id===tid);if(t)onUpdate(tid,{currentHp:Math.max(0,t.currentHp-dmg)});};
  const applyEffect=(tid:string,attr:string,amount:number,src:string)=>{const t=allEntries.find(e=>e.id===tid);if(!t)return;const nm=[...t.statMods];const i=nm.findIndex(m=>m.attr===attr&&m.source===src);if(i>=0)nm[i].amount+=amount;else nm.push({source:src,attr,amount});onUpdate(tid,{statMods:nm});};
  const actionSlots=[0,1,2,3,4];
  return(
    <>
      {movePopup&&<MovePopup move={movePopup} attacker={entry} allEntries={allEntries} weather={weather} onClose={()=>setMovePopup(null)} onApplyDmg={applyDmg} onApplyEffect={applyEffect}/>}
      {showCapture&&<CapturePopup target={entry} onClose={()=>setShowCapture(false)}/>}
      <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} style={{background:entry.hasTakenTurn?"#13151f":"#1e2235",border:`1px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor+"40"}`,borderLeft:`3px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor}`,borderRadius:8,opacity:entry.hasTakenTurn&&!isActive?0.65:1,boxShadow:isActive?`0 0 0 2px ${sideColor}30,0 4px 20px rgba(0,0,0,0.4)`:undefined,marginBottom:10,cursor:"default"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:isActive?sideColor+"15":"#13151f",borderRadius:"8px 8px 0 0"}}>
          <span style={{color:"#3a4060",cursor:"grab",fontSize:12}}>⠿</span>
          <button onClick={()=>upd({hasTakenTurn:!entry.hasTakenTurn})} style={{width:18,height:18,borderRadius:"50%",border:"none",background:entry.hasTakenTurn?"#00d4aa":"#2a2f45",color:entry.hasTakenTurn?"#0f1117":"#5a6080",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✓</button>
          <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
          <input value={entry.nickname} onChange={e=>upd({nickname:e.target.value})} placeholder={entry.pokemon.name} style={{flex:1,background:"transparent",border:"none",color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,outline:"none",minWidth:0}}/>
          {isActive&&<span style={{fontSize:9,fontWeight:700,color:sideColor,background:sideColor+"20",padding:"1px 5px",borderRadius:3}}>ACTIVE</span>}
          {disobedience!=="none"&&<span style={{fontSize:9,color:disobedience==="high"?"#ff4757":"#ffd32a"}}>⚠{disobedience==="high"?"REBEL":"DISOBEY"}</span>}
          <div style={{display:"flex",alignItems:"center",gap:2}}><span style={{fontSize:9,color:"#5a6080"}}>INI:</span><input type="number" value={entry.initiative} onChange={e=>upd({initiative:+e.target.value})} style={{width:28,background:"transparent",border:"none",color:"#6890f0",fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,textAlign:"center",outline:"none"}}/></div>
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})} style={{background:"#0f1117",border:"none",color:sideColor,fontSize:9,borderRadius:2,padding:"1px 3px"}}><option value="player">Player</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option></select>
          <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span>
          {(linkedTrainer||entry.side==="player")&&<button onClick={()=>setShowTrainerView(!showTrainerView)} style={{background:showTrainerView?"rgba(61,139,255,0.2)":"none",border:showTrainerView?"1px solid #3d8bff40":"none",borderRadius:3,color:showTrainerView?"#3d8bff":"#5a6080",cursor:"pointer",fontSize:11,padding:"0 4px"}}>👤</button>}
          {entry.side==="enemy"&&<button onClick={()=>setShowCapture(true)} style={{background:"none",border:"none",color:"#ffd32a",cursor:"pointer",fontSize:13,padding:"0 2px"}}>🎯</button>}
          <button onClick={()=>upd({isExpanded:!entry.isExpanded})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:11}}>{entry.isExpanded?"▲":"▼"}</button>
          <button onClick={()=>onRemove(entry.id)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
        <HpBar current={entry.currentHp} max={entry.maxHp}/>
        {entry.isExpanded&&(
          <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:10}}>
            {showTrainerView&&linkedTrainer?(
              <div style={{background:"rgba(61,139,255,0.06)",border:"1px solid #3d8bff30",borderRadius:6,padding:"10px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div><div style={{fontSize:14,fontWeight:800,fontFamily:"'Exo 2'",color:"#3d8bff"}}>{linkedTrainer.name}</div><div style={{fontSize:10,color:"#5a6080"}}>{linkedTrainer.rank} · {linkedTrainer.age}</div></div><button onClick={()=>setShowTrainerView(false)} style={{background:"none",border:"1px solid #3d8bff40",borderRadius:4,color:"#3d8bff",padding:"3px 8px",fontSize:10,cursor:"pointer"}}>← Pokémon</button></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}}>{[["STR","strength"],["DEX","dexterity"],["VIT","vitality"],["INS","insight"]].map(([l,k])=><div key={k} style={{textAlign:"center",background:"#13151f",borderRadius:4,padding:"5px 0"}}><div style={{fontSize:9,color:"#5a6080"}}>{l}</div><div style={{fontSize:16,fontFamily:"'Exo 2'",fontWeight:700,color:"#3d8bff"}}>{(linkedTrainer.attributes||{})[k]||1}</div></div>)}</div>
                <div style={{fontSize:10,color:"#5a6080",marginBottom:6}}>HP {4+((linkedTrainer.attributes?.vitality)||1)} · WP {((linkedTrainer.attributes?.insight)||1)+3} · {linkedTrainer.rank}</div>
                <div style={{fontSize:10,color:"#5a6080",marginBottom:5}}>Skills</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{Object.entries(linkedTrainer.skills||{}).filter(([,v])=>(v as number)>0).map(([s,v])=><span key={s} style={{fontSize:9,background:"rgba(61,139,255,0.1)",border:"1px solid #3d8bff30",borderRadius:3,padding:"1px 5px",color:"#3d8bff"}}>{s} {v as number}</span>)}</div>
              </div>
            ):(
              <>
                {/* Action economy */}
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:10,color:"#5a6080",flexShrink:0}}>Actions:</span><div style={{display:"flex",gap:4}}>{actionSlots.map(i=><button key={i} onClick={()=>upd({actionCount:entry.actionCount===i+1?i:i+1})} style={{width:22,height:22,borderRadius:4,border:`1px solid ${i<entry.actionCount?"#f08030":"#3a4060"}`,background:i<entry.actionCount?"#f0803020":"transparent",cursor:"pointer",fontSize:9,color:i<entry.actionCount?"#f08030":"#5a6080",fontWeight:700}}>{i+1}</button>)}</div>{entry.actionCount>0&&<span style={{fontSize:9,color:"#ff4757"}}>Next: {Math.min(entry.actionCount+1,5)}+ succ</span>}{isActive&&<button onClick={()=>upd({actionCount:Math.min(4,entry.actionCount+1)})} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:3,color:"#f08030",padding:"2px 8px",fontSize:10,cursor:"pointer"}}>+Action</button>}</div>
                {/* Status */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-start"}}>
                  <select value={entry.status} onChange={e=>upd({status:e.target.value,statusTurnsLeft:e.target.value==="Asleep"?3:0})} style={{background:"#0f1117",border:`1px solid ${sc?.color??"#2a2f45"}`,borderRadius:4,color:sc?.color??"#5a6080",fontSize:11,padding:"2px 6px",fontWeight:700,flexShrink:0}}>{Object.keys(STATUS_CONDITIONS).map(s=><option key={s} value={s}>{s}</option>)}</select>
                  {sc&&sc.name!=="Healthy"&&<details style={{flex:1,minWidth:0}}><summary style={{fontSize:10,color:sc.color,cursor:"pointer",listStyle:"none",whiteSpace:"normal"}}>{sc.shortDesc} <span style={{fontSize:8,opacity:0.6}}>(expand)</span></summary><div style={{fontSize:10,color:"#8b90a8",marginTop:4,lineHeight:1.5}}>{sc.fullDesc}</div>{sc.endOfRoundEffect&&<div style={{fontSize:10,color:"#ff4757",marginTop:2}}>🔄 {sc.endOfRoundEffect}</div>}{sc.rollToActDesc&&<div style={{fontSize:10,color:"#a040a0",marginTop:2}}>🎲 {sc.rollToActDesc}</div>}{entry.status==="Asleep"&&entry.statusTurnsLeft>0&&<div style={{fontSize:10,color:"#ffd32a",marginTop:2}}>⏱ {entry.statusTurnsLeft} turns remaining</div>}</details>}
                  {painPenalty>0&&<div style={{fontSize:10,color:"#ff4757",background:"rgba(255,71,87,0.1)",padding:"1px 5px",borderRadius:3,flexShrink:0}}>Pain −{painPenalty}d</div>}
                  {!entry.weatherImmune&&weather.name!=="Clear"&&<div style={{fontSize:10,color:"#ffd32a",background:"rgba(255,211,42,0.1)",padding:"1px 5px",borderRadius:3,flexShrink:0}}>{weather.emoji?.split(" ")[0]} {weather.name}</div>}
                </div>
                {/* HP + WP */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{[{label:"HP",cur:entry.currentHp,max:entry.maxHp,color:"#00d4aa",f:"currentHp" as const,mf:"maxHp" as const},{label:"WP",cur:entry.currentWill,max:entry.maxWill,color:"#6890f0",f:"currentWill" as const,mf:"maxWill" as const}].map(f=><div key={f.label}><div style={{fontSize:10,color:"#5a6080",marginBottom:3}}>{f.label}</div><div style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={()=>upd({[f.f]:Math.max(0,f.cur-1)})} style={adjBtn}>−</button><input type="number" value={f.cur} onChange={e=>upd({[f.f]:Math.max(0,Math.min(f.max,+e.target.value||0))})} style={{width:34,textAlign:"center",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,color:f.color,fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,padding:"1px 2px"}}/><span style={{fontSize:10,color:"#5a6080"}}>/{f.max}</span><button onClick={()=>upd({[f.f]:Math.min(f.max,f.cur+1)})} style={adjBtn}>+</button></div></div>)}</div>
                {/* Attributes */}
                <div><div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Attributes</div><div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>{(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};const base=entry.attrs[attr];const mod=attrModSummary(attr);const statusPen=attr==="dexterity"?(STATUS_CONDITIONS[entry.status]?.accuracyPenalty??0):0;const final=Math.max(0,base+mod-statusPen);return<div key={attr} style={{textAlign:"center"}}><div style={{fontSize:9,color:"#5a6080",marginBottom:2}}>{labels[attr]}</div><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:1}}><button onClick={()=>upd({attrs:{...entry.attrs,[attr]:Math.max(0,base-1)}})} style={{...adjBtn,width:14,height:14,fontSize:11}}>−</button><span style={{fontSize:13,fontFamily:"'Exo 2'",fontWeight:700,color:final<base?"#ff4757":mod>0?"#00d4aa":"#e8eaf0",minWidth:18,textAlign:"center"}}>{final}{mod!==0&&<sup style={{fontSize:7,color:mod>0?"#00d4aa":"#ff4757"}}>{mod>0?`+${mod}`:mod}</sup>}</span><button onClick={()=>upd({attrs:{...entry.attrs,[attr]:base+1}})} style={{...adjBtn,width:14,height:14,fontSize:11}}>+</button></div></div>;})} </div>{entry.statMods.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:3}}>{entry.statMods.map((m,i)=><div key={i} style={{fontSize:9,display:"flex",alignItems:"center",gap:3,background:m.amount>0?"rgba(0,212,170,0.1)":"rgba(255,71,87,0.1)",border:`1px solid ${m.amount>0?"#00d4aa30":"#ff475730"}`,borderRadius:3,padding:"1px 5px"}}><span style={{color:m.amount>0?"#00d4aa":"#ff4757"}}>{m.amount>0?"▲":"▼"}{Math.abs(m.amount)} {m.attr}</span><span style={{color:"#5a6080",fontSize:8}}>({m.source})</span><button onClick={()=>upd({statMods:entry.statMods.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:10,padding:0}}>×</button></div>)}</div>}</div>
                {/* Abilities */}
                <div><div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Abilities</div>{entry.abilities.map((ab,i)=>{const abData=ABILITIES.find(a=>a.name===ab.name);return<div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 8px",background:ab.active?"rgba(0,212,170,0.06)":"rgba(90,96,128,0.1)",borderRadius:4,marginBottom:4,border:`1px solid ${ab.active?"#00d4aa20":"#3a4060"}`}}><button onClick={()=>{const abs=[...entry.abilities];abs[i]={...abs[i],active:!abs[i].active,disabledReason:abs[i].active?"Manually disabled":undefined};upd({abilities:abs});}} style={{width:16,height:16,borderRadius:3,border:`1px solid ${ab.active?"#00d4aa":"#3a4060"}`,background:ab.active?"#00d4aa":"transparent",cursor:"pointer",flexShrink:0,marginTop:1}}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:ab.active?"#e8eaf0":"#5a6080"}}>{ab.name}{!ab.active&&ab.disabledReason&&<span style={{fontSize:9,color:"#5a6080",marginLeft:4}}>({ab.disabledReason})</span>}</div>{ab.active&&abData&&<div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{abData.effect}</div>}</div></div>;})}{entry.pokemon.number===0&&<select onChange={e=>{if(e.target.value)upd({abilities:[...entry.abilities,{name:e.target.value,active:true}]});e.target.value="";}} style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:11,padding:"3px 6px",marginTop:4}}><option value="">+ Add ability…</option>{ABILITIES.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}</select>}</div>
                {/* Moves */}
                <div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}><div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase"}}>Moves</div><button onClick={()=>setShowEditMoves(!showEditMoves)} style={{fontSize:10,color:"#00d4aa",background:"none",border:"none",cursor:"pointer"}}>{showEditMoves?"Done":"+ Edit"}</button></div>
                {showEditMoves?<div style={{maxHeight:160,overflowY:"auto"}}>{MOVES.slice(0,200).map(m=>{const has=entry.moves.some(em=>em.name===m.name);return<div key={m.name} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}><input type="checkbox" checked={has} onChange={()=>upd({moves:has?entry.moves.filter(em=>em.name!==m.name):[...entry.moves,m]})}/><TypeBadge type={m.type as PokemonType} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{m.name}</span>{(m.priority??0)>0&&<span style={{fontSize:9,color:"#00d4aa"}}>P{m.priority}</span>}</div>;})}</div>
                :<div style={{display:"flex",flexDirection:"column",gap:3}}>{entry.moves.map((m,i)=>{const stab2=entry.pokemon.types.includes(m.type as PokemonType);const abilMods2=calcAbilityBonus(entry,m,weather);return<button key={i} onClick={()=>setMovePopup(m)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",background:"#13151f",border:`1px solid ${TYPE_COLORS[m.type as PokemonType]||"#2a2f45"}25`,borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%"}} onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type as PokemonType]||"#00d4aa"} onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=`${TYPE_COLORS[m.type as PokemonType]||"#2a2f45"}25`}><TypeBadge type={m.type as PokemonType} small/><span style={{fontSize:12,color:"#e8eaf0",flex:1}}>{m.name}</span>{stab2&&<span style={{fontSize:9,color:"#ffd32a",fontWeight:700}}>STAB</span>}{(m.priority??0)>0&&<span style={{fontSize:9,color:"#00d4aa",fontWeight:700}}>P{m.priority}</span>}{abilMods2.bonus>0&&<span style={{fontSize:9,color:"#00d4aa"}}>+{abilMods2.bonus}</span>}{m.power!=="-"&&<span style={{fontSize:9,color:"#5a6080"}}>P{m.power}</span>}<span style={{fontSize:9,color:"#5a6080"}}>▶</span></button>;})} {entry.moves.length===0&&<div style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>No moves. Click Edit.</div>}</div>}
                </div>
                <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Notes…" style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:10,padding:5,resize:"none",minHeight:32,fontFamily:"inherit",lineHeight:1.4,outline:"none"}}/>
                <label style={{fontSize:10,color:"#8b90a8",display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}><input type="checkbox" checked={entry.weatherImmune} onChange={e=>upd({weatherImmune:e.target.checked})}/>Immune to weather chip damage</label>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────
function SearchBar({onAdd}:{onAdd:(p:PokemonEntry)=>void}){
  const [q,setQ]=useState("");
  const filtered=useMemo(()=>{if(!q)return [];const ql=q.toLowerCase();return POKEMON.filter(p=>p.name.toLowerCase().includes(ql)||String(p.number).includes(q)).slice(0,10);},[q]);
  return(
    <div style={{position:"relative"}}>
      <input type="text" placeholder="Add Pokémon to battle…" value={q} onChange={e=>setQ(e.target.value)}
        style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:5,padding:"6px 8px",color:"#e8eaf0",fontSize:12,outline:"none"}}
        onFocus={e=>(e.target as HTMLInputElement).style.borderColor="#00d4aa"}
        onBlur={e=>{(e.target as HTMLInputElement).style.borderColor="#2a2f45";}}/>
      {filtered.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e2235",border:"1px solid #3a4060",borderRadius:5,zIndex:100,maxHeight:280,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
          <div onClick={()=>{onAdd(MISSINGNO);setQ("");}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",cursor:"pointer",borderBottom:"1px solid #2a2f45"}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#242842"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}><span style={{fontSize:10,color:"#ffd32a",fontWeight:700}}>✦ Custom (Missingno.)</span></div>
          {filtered.map(p=>(
            <div key={`${p.number}-${p.name}`} onClick={()=>{onAdd(p);setQ("");}} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#242842"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
              <span style={{fontSize:9,color:"#3a4060",width:26,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
              <span style={{fontSize:12,color:"#e8eaf0",flex:1}}>{p.name}</span>
              {p.types.map(t=><TypeBadge key={t} type={t as PokemonType} small/>)}
              <span style={{fontSize:9,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Battle Tracker Page ──────────────────────────────────────────────────
export default function BattleTrackerPage(){
  const [entries,setEntries]=useState<BattleEntry[]>(()=>loadFromStorage("bt_entries",[]));
  const [weather,setWeather]=useState<WeatherData>(WEATHER_DATA[0]);
  const [turn,setTurn]=useState(0);
  const [round,setRound]=useState(1);
  const [showEOR,setShowEOR]=useState(false);
  const [showPriority,setShowPriority]=useState(false);
  const [dragId,setDragId]=useState<string|null>(null);

  useEffect(()=>{saveToStorage("bt_entries",entries);},[entries]);

  // Consume encounter queue
  useEffect(()=>{
    const queue=loadFromStorage<number[]>("encounter_queue",[]);
    if(queue.length>0){saveToStorage("encounter_queue",[]);queue.forEach(num=>{const p=POKEMON.find(x=>x.number===num);if(p)addPokemon(p);});}
    const pending=loadFromStorage<{pokemonNumber:number;trainerId:string;nickname:string}|null>("pending_link",null);
    if(pending){saveToStorage("pending_link",null);setTimeout(()=>setEntries(prev=>{const idx=[...prev].reverse().findIndex(e=>e.pokemon.number===pending.pokemonNumber&&!e.linkedTrainerId);if(idx<0)return prev;const ri=prev.length-1-idx;const u=[...prev];u[ri]={...u[ri],linkedTrainerId:pending.trainerId,side:"player",nickname:pending.nickname||u[ri].nickname};return u;}),100);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry=sorted[turn%Math.max(1,sorted.length)];

  const addPokemon=useCallback((pokemon:PokemonEntry)=>{
    const hp=pokemon.number===0?10:pokemon.baseHp+pokemon.attributes.vitality;
    const will=pokemon.number===0?5:pokemon.attributes.insight+3;
    const ini=Math.floor(Math.random()*6)+1+(pokemon.attributes?.dexterity??1);
    setEntries(prev=>[...prev,{id:`${pokemon.number}-${Date.now()}`,pokemon,nickname:pokemon.number===0?"Custom":"",initiative:ini,currentHp:hp,maxHp:hp,currentWill:will,maxWill:will,status:"Healthy",statusTurnsLeft:0,notes:"",isExpanded:false,hasTakenTurn:false,side:"enemy",trainerRank:"Rookie",abilities:pokemon.abilities.map(a=>({name:a,active:true})),moves:pokemon.moves.slice(0,4).map(m=>MOVES.find(mv=>mv.name===m.name)||{name:m.name,type:m.type,category:"Physical" as const,power:"-",accuracy:"-",damagePool:"-",effect:"",description:""} as Move),attrs:{...pokemon.attributes},statMods:[],weatherImmune:false,actionCount:0}]);
  },[]);

  const upd=useCallback((id:string,u:Partial<BattleEntry>)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e)),[]);
  const remove=useCallback((id:string)=>setEntries(prev=>prev.filter(e=>e.id!==id)),[]);
  const applyEOR=(id:string,hp:number,_r?:string)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp+hp)}:e));

  const nextTurn=()=>{
    if(activeEntry){setEntries(prev=>prev.map(e=>{if(e.id!==activeEntry.id)return e;let ns=e.status,nt=e.statusTurnsLeft;if(e.status==="Flinched")ns="Healthy";if(e.status==="Asleep"){nt=Math.max(0,e.statusTurnsLeft-1);if(nt===0)ns="Healthy";}return{...e,hasTakenTurn:true,actionCount:0,status:ns,statusTurnsLeft:nt};}));}
    const next=(turn+1)%Math.max(1,sorted.length);
    if(next===0){setRound(r=>r+1);setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false,actionCount:0})));setShowEOR(true);const hasPri=entries.some(e=>e.currentHp>0&&e.moves.some(m=>(m.priority??0)>0));if(hasPri)setTimeout(()=>setShowPriority(true),400);}
    setTurn(next);
  };
  const rollAllIni=()=>{setEntries(prev=>prev.map(e=>({...e,initiative:Math.floor(Math.random()*6)+1+(e.attrs?.dexterity??1)})));setTurn(0);};

  const handleDrop=(targetId:string)=>{if(!dragId||dragId===targetId){setDragId(null);return;}setEntries(prev=>{const a=[...prev];const fi=a.findIndex(e=>e.id===dragId);const ti=a.findIndex(e=>e.id===targetId);const [item]=a.splice(fi,1);a.splice(ti,0,item);return a;});setDragId(null);};

  const sideColor=activeEntry?{player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[activeEntry.side]:"#5a6080";

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",color:"#e8eaf0",overflow:"hidden"}}>
      {showEOR&&<EORPopup entries={entries} weather={weather} round={round} onApply={applyEOR} onClose={()=>setShowEOR(false)}/>}
      {showPriority&&<PriorityPopup entries={entries} onClose={()=>setShowPriority(false)}/>}

      {/* Nav */}
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 12px",height:48,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#ff4757",fontWeight:700}}>⚔️ Battle Tracker</span>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          <select value={weather.name} onChange={e=>setWeather(WEATHER_DATA.find(w=>w.name===e.target.value)!)} style={{background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,color:"#ffd32a",fontSize:11,padding:"3px 6px"}}>{WEATHER_DATA.map(w=><option key={w.name} value={w.name}>{w.emoji?.split(" ")[0]} {w.name}</option>)}</select>
          <div style={{display:"flex",alignItems:"center",gap:4,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:4,padding:"3px 8px"}}>
            <span style={{fontSize:10,color:"#5a6080"}}>Rnd {round} ·</span>
            <span style={{fontSize:10,color:sideColor,fontWeight:600,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeEntry?.nickname||activeEntry?.pokemon.name||"—"}</span>
          </div>
          <button onClick={nextTurn} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:4,padding:"4px 10px",fontWeight:700,fontSize:11,cursor:"pointer"}}>Next Turn ▶</button>
          <button onClick={rollAllIni} style={{background:"#6890f015",border:"1px solid #6890f040",borderRadius:4,color:"#6890f0",padding:"3px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 INI</button>
          <button onClick={()=>setShowPriority(true)} style={{background:"#00d4aa10",border:"1px solid #00d4aa30",borderRadius:4,color:"#00d4aa",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>⚡ Priority</button>
          <button onClick={()=>setShowEOR(true)} style={{background:"#ffd32a10",border:"1px solid #ffd32a30",borderRadius:4,color:"#ffd32a",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🔄 EOR</button>
          <Link href="/gm-screen" style={{fontSize:11,color:"#a040a0",textDecoration:"none",background:"rgba(160,64,160,0.1)",border:"1px solid rgba(160,64,160,0.3)",borderRadius:4,padding:"3px 8px"}}>🖥️ GM Screen</Link>
        </div>
      </nav>

      {/* Weather banner */}
      {weather.name!=="Clear"&&<div style={{background:weather.color+"12",padding:"4px 14px",display:"flex",gap:8,alignItems:"center",fontSize:11,flexShrink:0,borderBottom:`1px solid ${weather.color}20`}}><span>{weather.emoji?.split(" ")[0]}</span><span style={{fontWeight:700,color:"#e8eaf0"}}>{weather.name}</span><span style={{color:"#8b90a8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{weather.description}</span></div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Left sidebar: search */}
        <div style={{width:240,background:"#13151f",borderRight:"1px solid #2a2f45",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"8px 8px 4px"}}><SearchBar onAdd={addPokemon}/></div>
          <div style={{flex:1,overflowY:"auto",padding:"4px 6px"}}>
            {entries.length===0&&<div style={{textAlign:"center",color:"#5a6080",padding:20,fontSize:11}}>Search above to add combatants</div>}
            {sorted.map(e=>(
              <div key={e.id} onClick={()=>upd(e.id,{isExpanded:!e.isExpanded})} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:4,cursor:"pointer",background:activeEntry?.id===e.id?{player:"rgba(0,212,170,0.1)",enemy:"rgba(255,71,87,0.1)",neutral:"rgba(90,96,128,0.1)"}[e.side]:"transparent",borderLeft:`2px solid ${activeEntry?.id===e.id?{player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[e.side]:"transparent"}`}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:TYPE_COLORS[e.pokemon.types[0]],flexShrink:0}}/>
                <span style={{fontSize:11,color:"#e8eaf0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.nickname||e.pokemon.name}</span>
                <span style={{fontSize:10,color:e.currentHp/e.maxHp>0.5?"#00d4aa":e.currentHp/e.maxHp>0.25?"#ffd32a":"#ff4757",fontFamily:"'Exo 2'",fontWeight:700,flexShrink:0}}>{e.currentHp}/{e.maxHp}</span>
              </div>
            ))}
          </div>
          <div style={{padding:"6px 8px",borderTop:"1px solid #2a2f45"}}>
            <button onClick={()=>setEntries([])} style={{width:"100%",background:"rgba(255,71,87,0.1)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,color:"#ff4757",padding:"5px",fontSize:11,cursor:"pointer"}}>Clear All</button>
          </div>
        </div>
        {/* Main tracker area */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
          {sorted.map(e=>(
            <div key={e.id} style={{opacity:dragId===e.id?0.4:1,outline:dragId&&dragId!==e.id?"2px dashed transparent":"none",borderRadius:8}}>
              <BattleCard entry={e} allEntries={entries} weather={weather} isActive={activeEntry?.id===e.id} onUpdate={upd} onRemove={remove}
                onDragStart={()=>setDragId(e.id)}
                onDragOver={(ev)=>{ev.preventDefault();}}
                onDrop={()=>handleDrop(e.id)}/>
            </div>
          ))}
          {entries.length===0&&<div style={{textAlign:"center",color:"#5a6080",padding:60,fontSize:14}}>⚔️<br/><br/>Search for a Pokémon in the sidebar to begin tracking</div>}
        </div>
      </div>
    </div>
  );
}

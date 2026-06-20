"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART, MISSINGNO,
  PokemonEntry, Move, PokemonType, Rank,
} from "../data/pokerole-data";
import {
  STATUS_CONDITIONS, WEATHER_DATA, WeatherData,
  RANK_ORDER, getDisobedienceLevel, getPainPenalty,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";

/* ─── Colour constants ──────────────────────────────────────────────────────── */
const RANK_COLORS: Record<Rank,string> = {
  Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",
  Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700",
};

/* ─── Types ──────────────────────────────────────────────────────────────────── */
type AttrSet = {strength:number;dexterity:number;vitality:number;special:number;insight:number};
interface StatMod {source:string;attr:string;amount:number;}
interface AbilityState {name:string;active:boolean;disabledReason?:string;}
interface BattleEntry {
  id:string; pokemon:PokemonEntry; nickname:string;
  initiative:number; currentHp:number; maxHp:number; currentWill:number; maxWill:number;
  status:string; statusTurnsLeft:number;
  notes:string; isExpanded:boolean; hasTakenTurn:boolean;
  side:"player"|"enemy"|"neutral"; trainerRank:Rank;
  abilities:AbilityState[]; moves:Move[];
  attrs:AttrSet; statMods:StatMod[];
  weatherImmune:boolean; actionCount:number;
  linkedTrainerId?:string;
}
type PanelType = "tracker"|"notes"|"weather_ref"|"status_ref"|"type_chart"|"catch_ref"|"quick_roll"|"encounter"|"rules"|"characters";
interface Panel {id:string;type:PanelType;colSpan?:number;rowSpan?:number;}

/* ─── Panel catalog ──────────────────────────────────────────────────────────── */
const PANEL_CATALOG:{type:PanelType;label:string;icon:string;desc:string}[] = [
  {type:"tracker",icon:"⚔️",label:"Battle Tracker",desc:"Track HP, moves, status for all combatants"},
  {type:"notes",icon:"📝",label:"GM Notes",desc:"Session notes, NPC details, secrets"},
  {type:"encounter",icon:"🌿",label:"Encounter Generator",desc:"Browse habitats and roll wild encounters"},
  {type:"type_chart",icon:"🔣",label:"Type Chart",desc:"Full defensive type matchup reference"},
  {type:"status_ref",icon:"💢",label:"Status Reference",desc:"All status conditions and their effects"},
  {type:"weather_ref",icon:"🌤️",label:"Weather Reference",desc:"Weather and terrain effects"},
  {type:"catch_ref",icon:"🎯",label:"Catch Guide",desc:"Catching mechanics, seal potency, bonuses"},
  {type:"quick_roll",icon:"🎲",label:"Quick Roller",desc:"Fast dice roller for any pool size"},
  {type:"rules",icon:"📚",label:"Rules Summary",desc:"Key rules: actions, damage, pain penalty"},
  {type:"characters",icon:"👤",label:"Characters & Party",desc:"View saved trainers and add their Pokémon to the tracker"},
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function TypeBadge({type,small}:{type:PokemonType;small?:boolean}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 7px",borderRadius:3,fontSize:small?9:11,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]}}>{type}</span>;
}
function rollDice(pool:number):{rolls:number[];successes:number} {
  const p=Math.max(1,pool);
  const rolls=Array.from({length:p},()=>Math.floor(Math.random()*6)+1);
  return {rolls,successes:rolls.filter(r=>r>=4).length};
}
function HpBar({current,max}:{current:number;max:number}) {
  const pct=max>0?Math.max(0,Math.min(1,current/max)):0;
  const c=pct>0.5?"#00d4aa":pct>0.25?"#ffd32a":"#ff4757";
  return <div style={{background:"#0f1117",borderRadius:3,height:5,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:c,transition:"width 0.3s"}}/></div>;
}
const adjBtn:React.CSSProperties={width:20,height:20,background:"#1a1d27",border:"1px solid #3a4060",borderRadius:3,color:"#00d4aa",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"};
function getEffectiveAttrs(e:BattleEntry):AttrSet {
  const sc=STATUS_CONDITIONS[e.status];
  const accPen=sc?.accuracyPenalty??0;
  const mods=e.statMods.reduce<Partial<AttrSet>>((acc,m)=>{
    const k=m.attr as keyof AttrSet;
    if(k in e.attrs)acc[k]=(acc[k]??e.attrs[k])+m.amount;
    return acc;
  },{});
  return {
    strength:Math.max(0,mods.strength??e.attrs.strength),
    dexterity:Math.max(0,(mods.dexterity??e.attrs.dexterity)-accPen),
    vitality:Math.max(0,mods.vitality??e.attrs.vitality),
    special:Math.max(0,mods.special??e.attrs.special),
    insight:Math.max(0,mods.insight??e.attrs.insight),
  };
}
function calcAccPool(move:Move,attrs:AttrSet,actionCount:number):number {
  const acc=move.accuracy.toLowerCase();
  let pool=0;
  if(acc.includes("strength"))pool+=attrs.strength;
  if(acc.includes("dexterity"))pool+=attrs.dexterity;
  if(acc.includes("special"))pool+=attrs.special;
  if(acc.includes("insight"))pool+=attrs.insight;
  if(acc.includes("cute")||acc.includes("cool")||acc.includes("beauty"))pool+=1;
  const skill=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
  pool+=skill;
  return Math.max(1,pool);
}
function calcDmgPool(move:Move,attrs:AttrSet,weather:WeatherData,stab:boolean,abilityBonus:number):number {
  const dmg=move.damagePool.toLowerCase();
  if(dmg==="-")return 0;
  let pool=0;
  if(dmg.includes("strength"))pool+=attrs.strength;
  if(dmg.includes("special"))pool+=attrs.special;
  const pm=move.power.match(/(\d+)/);
  if(pm)pool+=parseInt(pm[1]);
  if(stab)pool+=1;
  if(weather.typeBoost===move.type&&weather.typeBoostDice)pool+=weather.typeBoostDice;
  if(weather.typeWeaken===move.type&&weather.typeWeakenDice)pool=Math.max(1,pool-weather.typeWeakenDice);
  pool+=abilityBonus;
  return Math.max(1,pool);
}

// Calculate ability bonuses for a given attacker + move combo
// Returns {bonus:number, reasons:string[]}
function calcAbilityBonus(entry:BattleEntry,move:Move,weather:WeatherData):{bonus:number;reasons:string[]} {
  const bonus:{bonus:number;reasons:string[]}={bonus:0,reasons:[]};
  const mtype=move.type as PokemonType;
  const atHalf=entry.currentHp<=entry.maxHp/2;
  const isPhysical=move.category==="Physical";
  const isSpecial=move.category==="Special";

  entry.abilities.filter(a=>a.active).forEach(ab=>{
    const n=ab.name;
    // Starter-type boosters (at half HP)
    if((n==="Blaze"&&mtype==="Fire")||( n==="Overgrow"&&mtype==="Grass")||(n==="Torrent"&&mtype==="Water")||(n==="Swarm"&&mtype==="Bug")){
      if(atHalf){bonus.bonus+=2;bonus.reasons.push(`${n} +2 (HP ≤50%)`);}
    }
    // Type-specific boosts
    else if(n==="Iron Fist"&&entry.pokemon.moves.some(m=>m.name===move.name)&&move.effect.toLowerCase().includes("punch")){
      bonus.bonus+=2;bonus.reasons.push("Iron Fist +2");
    }
    else if(n==="Strong Jaw"&&move.effect.toLowerCase().includes("bite")){
      bonus.bonus+=2;bonus.reasons.push("Strong Jaw +2");
    }
    else if(n==="Tough Claws"&&isPhysical){
      bonus.bonus+=2;bonus.reasons.push("Tough Claws +2");
    }
    else if(n==="Reckless"&&move.effect.toLowerCase().includes("recoil")){
      bonus.bonus+=2;bonus.reasons.push("Reckless +2");
    }
    else if(n==="Sheer Force"&&move.effect.toLowerCase().includes("roll")){
      bonus.bonus+=2;bonus.reasons.push("Sheer Force +2 (no added effect)");
    }
    else if(n==="Technician"&&move.power!=="-"&&parseInt(move.power)<=2){
      bonus.bonus+=2;bonus.reasons.push(`Technician +2 (Power ≤2)`);
    }
    else if(n==="Adaptability"&&stab(entry,mtype)){
      bonus.bonus+=1;bonus.reasons.push("Adaptability STAB +1 extra");
    }
    else if(n==="Transistor"&&mtype==="Electric"){
      bonus.bonus+=2;bonus.reasons.push("Transistor +2");
    }
    else if(n==="Dragon's Maw"&&mtype==="Dragon"){
      bonus.bonus+=1;bonus.reasons.push("Dragon's Maw +1");
    }
    else if(n==="Steelworker"&&mtype==="Steel"){
      bonus.bonus+=1;bonus.reasons.push("Steelworker +1");
    }
    else if(n==="Steely Spirit"&&mtype==="Steel"){
      bonus.bonus+=1;bonus.reasons.push("Steely Spirit +1");
    }
    else if(n==="Flare Boost"&&isSpecial&&entry.status==="Burned"){
      bonus.bonus+=2;bonus.reasons.push("Flare Boost +2 (Burned)");
    }
    else if(n==="Guts"&&isPhysical&&entry.status!=="Healthy"){
      bonus.bonus+=2;bonus.reasons.push(`Guts +2 (${entry.status})`);
    }
    else if(n==="Gorilla Tactics"&&isPhysical){
      bonus.bonus+=2;bonus.reasons.push("Gorilla Tactics +2");
    }
    else if(n==="Huge Power"||n==="Pure Power"){
      bonus.bonus+=2;bonus.reasons.push(`${n} +2`);
    }
    else if(n==="Hustle"&&isPhysical){
      bonus.bonus+=1;bonus.reasons.push("Hustle +1 (–2 acc)");
    }
    else if(n==="Life Orb"||n==="Power Spot"){
      bonus.bonus+=2;bonus.reasons.push(`${n} +2`);
    }
    else if(n==="Flash Fire"&&mtype==="Fire"){
      bonus.bonus+=2;bonus.reasons.push("Flash Fire +2 (activated)");
    }
    else if(n==="Solar Power"&&isSpecial&&weather.name==="Sunny"){
      bonus.bonus+=2;bonus.reasons.push("Solar Power +2 (Sun)");
    }
    else if(n==="Sand Force"&&(mtype==="Rock"||mtype==="Ground"||mtype==="Steel")&&weather.name==="Sandstorm"){
      bonus.bonus+=2;bonus.reasons.push("Sand Force +2 (Sandstorm)");
    }
    else if(n==="Pixilate"&&mtype==="Fairy"){
      bonus.bonus+=1;bonus.reasons.push("Pixilate +1");
    }
    else if(n==="Refrigerate"&&mtype==="Ice"){
      bonus.bonus+=1;bonus.reasons.push("Refrigerate +1");
    }
    else if(n==="Galvanize"&&mtype==="Electric"){
      bonus.bonus+=1;bonus.reasons.push("Galvanize +1");
    }
    else if(n==="Normalize"&&mtype==="Normal"){
      bonus.bonus+=1;bonus.reasons.push("Normalize +1");
    }
    else if(n==="Liquid Voice"&&mtype==="Water"){
      bonus.bonus+=1;bonus.reasons.push("Liquid Voice +1");
    }
    else if(n==="Dark Aura"&&mtype==="Dark"){
      bonus.bonus+=1;bonus.reasons.push("Dark Aura +1");
    }
    else if(n==="Fairy Aura"&&mtype==="Fairy"){
      bonus.bonus+=1;bonus.reasons.push("Fairy Aura +1");
    }
    else if(n==="Sniper"&&move.category!=="Support"){
      // Sniper enhances crits - note it
      bonus.reasons.push("Sniper: crits deal +2 extra dice");
    }
    else if(n==="Parental Bond"&&move.category!=="Support"){
      bonus.reasons.push("Parental Bond: hits twice (2nd=half dmg)");
    }
    else if(n==="Moxie"||n==="Chilling Neigh"||n==="Soul-Heart"||n==="Grim Neigh"){
      bonus.reasons.push(`${n}: +1 STR/SPC after KO (up to 3)`);
    }
    else if(n==="Speed Boost"){
      bonus.reasons.push("Speed Boost: +1 DEX/round");
    }
    else if(n==="Serene Grace"){
      bonus.reasons.push("Serene Grace: double added-effect rolls");
    }
  });

  return bonus;
}
function stab(entry:BattleEntry,type:PokemonType):boolean {
  return entry.pokemon.types.includes(type);
}
function getTypeMult(moveType:PokemonType,defTypes:PokemonType[]):{label:string;color:string;dmgMod:number} {
  let weak=false,resist=false,immune=false;
  defTypes.forEach(dt=>{
    const c=TYPE_CHART[dt];
    if(c.weaknesses.includes(moveType))weak=true;
    if(c.resistances.includes(moveType))resist=true;
    if(c.immunities.includes(moveType))immune=true;
  });
  if(immune)return{label:"Immune — no effect",color:"#5a6080",dmgMod:-999};
  if(weak)return{label:"Super Effective! ×2",color:"#ff4757",dmgMod:2};
  if(resist)return{label:"Not very effective ×0.5",color:"#00d4aa",dmgMod:-1};
  return{label:"Normal effectiveness",color:"#8b90a8",dmgMod:0};
}

/* ─── Move Attack Popup ──────────────────────────────────────────────────────── */
function MoveAttackPopup({move,attacker,allEntries,weather,onClose,onApplyDmg,onApplyEffect}:{
  move:Move;attacker:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;
  onClose:()=>void;
  onApplyDmg:(targetId:string,dmg:number)=>void;
  onApplyEffect:(targetId:string,attr:string,amount:number,source:string)=>void;
}) {
  const [targets,setTargets]=useState<string[]>([]);
  const [accResult,setAccResult]=useState<{rolls:number[];successes:number}|null>(null);
  const [dmgResults,setDmgResults]=useState<Record<string,{rolls:number[];successes:number}>>({});
  const [preRollDone,setPreRollDone]=useState<{canAct:boolean;detail:string}|null>(
    (STATUS_CONDITIONS[attacker.status]?.requiresRollToAct||attacker.status==="Flinched")
      ? attacker.status==="Flinched"?{canAct:false,detail:"Flinched — skip turn"}:null
      : {canAct:true,detail:""}
  );
  const [loyaltyRoll,setLoyaltyRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [applied,setApplied]=useState<Set<string>>(new Set());

  const attrs=getEffectiveAttrs(attacker);
  const stabBonus=attacker.pokemon.types.includes(move.type as PokemonType);
  const stab=stabBonus;
  const actReq=[1,2,3,4,5][Math.min(attacker.actionCount,4)];
  const sc=STATUS_CONDITIONS[attacker.status];
  const disobedience=getDisobedienceLevel(attacker.pokemon.suggestedRank,attacker.trainerRank);
  const isMultiTarget=move.effect.toLowerCase().includes("all")&&!move.effect.toLowerCase().includes("single");
  const otherEntries=allEntries.filter(e=>e.id!==attacker.id&&e.currentHp>0);

  // Calculate all ability bonuses
  const abilityMods=calcAbilityBonus(attacker,move,weather);
  const totalAbilBonus=abilityMods.bonus;

  const doPreRoll=()=>{
    if(attacker.status==="Asleep"||attacker.status==="Frozen"){
      const r=Math.floor(Math.random()*6)+1;
      const wakes=attacker.status==="Asleep"?r>=4:r>=5;
      setPreRollDone({canAct:wakes,detail:`Rolled ${r}d6. ${wakes?`✓ ${attacker.status==="Asleep"?"Woke up":"Thawed"}! Can act.`:`✗ Still ${attacker.status}. Skip turn.`}`});
    } else if(attacker.status==="Paralyzed"){
      const r=Math.floor(Math.random()*6)+1;
      const acts=r>=3;
      setPreRollDone({canAct:acts,detail:`Paralysis check: ${r}d6. ${acts?"✓ Can act (still –2 acc).":"✗ Cannot act this turn."}`});
    } else if(attacker.status==="Confused"){
      const r=Math.floor(Math.random()*6)+1;
      const hitsItself=r<=3;
      setPreRollDone({canAct:!hitsItself,detail:`Confusion: ${r}d6. ${hitsItself?"✗ Hits itself! (roll STR+Brawl vs own VIT)":"✓ Acts normally."}`});
    } else if(attacker.status==="Infatuated"){
      const res=rollDice(attacker.currentWill);
      const acts=res.successes>=2;
      setPreRollDone({canAct:acts,detail:`WP check [${res.rolls.join(",")}]=${res.successes}. ${acts?"✓ Can act.":"✗ Too distracted!"}`});
    }
  };

  const toggleTarget=(id:string)=>{
    if(isMultiTarget)setTargets(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
    else setTargets([id]);
  };

  const doAccuracy=()=>setAccResult(rollDice(calcAccPool(move,attrs,attacker.actionCount)));

  const doDmgForTarget=(targetId:string)=>{
    const abilBonus=totalAbilBonus;
    const pool=calcDmgPool(move,attrs,weather,stab,abilBonus);
    setDmgResults(prev=>({...prev,[targetId]:rollDice(pool)}));
  };

  const applyDmgToTarget=(targetId:string)=>{
    const target=allEntries.find(e=>e.id===targetId);
    const dr=dmgResults[targetId];
    if(!target||!dr)return;
    const tm=getTypeMult(move.type as PokemonType,target.pokemon.types);
    if(tm.dmgMod===-999){alert(`${target.nickname||target.pokemon.name} is immune!`);return;}
    const defense=move.category==="Physical"?target.attrs.vitality:target.attrs.insight;
    let succ=Math.max(1,dr.successes);
    if(tm.dmgMod===2)succ=Math.ceil(succ*1.5);
    if(tm.dmgMod===-1)succ=Math.max(1,succ-1);
    const finalDmg=Math.max(1,succ-defense);
    onApplyDmg(targetId,finalDmg);
    setApplied(prev=>new Set([...prev,targetId]));
    // Close popup automatically after applying damage
    onClose();
  };

  const statEffects:{attr:string;amount:number}[]=[];
  const effLower=move.effect.toLowerCase();
  if(effLower.includes("strength")&&effLower.includes("by 1")&&!effLower.includes("increase"))statEffects.push({attr:"strength",amount:-1});
  if(effLower.includes("defense")&&effLower.includes("by 1")&&!effLower.includes("sp.")&&!effLower.includes("increase"))statEffects.push({attr:"vitality",amount:-1});
  if(effLower.includes("sp. def")&&effLower.includes("by 1"))statEffects.push({attr:"insight",amount:-1});
  if(effLower.includes("increase")&&effLower.includes("strength"))statEffects.push({attr:"strength",amount:1});
  if(effLower.includes("increase")&&effLower.includes("dexterity"))statEffects.push({attr:"dexterity",amount:1});
  if(effLower.includes("increase")&&effLower.includes("special"))statEffects.push({attr:"special",amount:1});

  const canAct=preRollDone?.canAct??false;
  const accPool=calcAccPool(move,attrs,attacker.actionCount);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:500,maxWidth:"95vw",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",gap:8}}>
          <TypeBadge type={move.type as PokemonType}/>
          <span style={{fontSize:11,fontWeight:700,color:move.category==="Physical"?"#f08030":move.category==="Special"?"#6890f0":"#78c850",background:move.category==="Physical"?"rgba(240,128,48,0.15)":move.category==="Special"?"rgba(104,144,240,0.15)":"rgba(120,200,80,0.15)",padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          {stab&&<span style={{fontSize:9,fontWeight:700,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"1px 5px",borderRadius:3}}>STAB +1</span>}
          {(move.priority??0)>0&&<span style={{fontSize:9,fontWeight:700,color:"#00d4aa",background:"rgba(0,212,170,0.12)",padding:"1px 5px",borderRadius:3}}>PRIORITY {move.priority}</span>}
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#e8eaf0",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
          <p style={{fontSize:12,color:"#8b90a8",lineHeight:1.5,margin:0}}>{move.description}</p>
          <div style={{background:"#13151f",borderRadius:5,padding:"7px 10px",fontSize:11,color:"#e8eaf0"}}><strong style={{color:"#5a6080"}}>Effect: </strong>{move.effect}</div>

          {/* Action count penalty */}
          {attacker.actionCount>0&&(
            <div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757"}}>
              Action #{attacker.actionCount+1} this round — needs {actReq} success{actReq>1?"es":""} to hit
            </div>
          )}

          {/* Disobedience */}
          {disobedience!=="none"&&(
            <div style={{background:disobedience==="high"?"rgba(255,71,87,0.1)":"rgba(255,211,42,0.08)",border:`1px solid ${disobedience==="high"?"#ff475740":"#ffd32a40"}`,borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontWeight:700,color:disobedience==="high"?"#ff4757":"#ffd32a",marginBottom:4,fontSize:11}}>
                {disobedience==="high"?"🔴 High Disobedience — Pokémon ignores commands":"⚠ Low Disobedience — Loyalty check required"}
              </div>
              {disobedience==="low"&&(
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setLoyaltyRoll(rollDice(3))} style={{background:"rgba(255,211,42,0.15)",border:"1px solid #ffd32a40",borderRadius:4,color:"#ffd32a",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Loyalty (3+)</button>
                  {loyaltyRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:loyaltyRoll.successes>=3?"#00d4aa":"#ff4757"}}>[{loyaltyRoll.rolls.join(",")}]={loyaltyRoll.successes} {loyaltyRoll.successes>=3?"✓":"✗"}</span>}
                </div>
              )}
            </div>
          )}

          {/* Status pre-check */}
          {(STATUS_CONDITIONS[attacker.status]?.requiresRollToAct||attacker.status==="Flinched")&&(
            <div style={{background:"rgba(168,64,160,0.1)",border:"1px solid #a040a040",borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:700,color:STATUS_CONDITIONS[attacker.status]?.color,marginBottom:4}}>{attacker.status}: {STATUS_CONDITIONS[attacker.status]?.shortDesc}</div>
              <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>{STATUS_CONDITIONS[attacker.status]?.rollToActDesc}</div>
              {!preRollDone&&attacker.status!=="Flinched"&&(
                <button onClick={doPreRoll} style={{background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Pre-Action Check</button>
              )}
              {preRollDone&&<div style={{fontSize:12,fontWeight:700,color:preRollDone.canAct?"#00d4aa":"#ff4757"}}>{preRollDone.detail}</div>}
            </div>
          )}

          {/* Ability modifiers */}
          {(abilityMods.bonus>0||abilityMods.reasons.length>0)&&(
            <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa20",borderRadius:5,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:"#00d4aa",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Active Ability Modifiers</div>
              {abilityMods.reasons.map((r,i)=>(
                <div key={i} style={{fontSize:10,color:"#8b90a8",marginBottom:2}}>✦ {r}</div>
              ))}
              {abilityMods.bonus>0&&<div style={{fontSize:11,color:"#00d4aa",fontWeight:700,marginTop:4}}>+{abilityMods.bonus} dice to damage pool</div>}
            </div>
          )}

          {/* Target selector */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>{isMultiTarget?"Select Targets (multi)":"Select Target"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {otherEntries.map(t=>(
                  <button key={t.id} onClick={()=>toggleTarget(t.id)} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#e8eaf0":"#8b90a8"}}>
                    {t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type effectiveness per target */}
          {canAct&&targets.map(tid=>{
            const t=allEntries.find(e=>e.id===tid);
            if(!t)return null;
            const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);
            const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
            return (
              <div key={tid} style={{background:tm.color+"10",border:`1px solid ${tm.color}30`,borderRadius:4,padding:"6px 10px"}}>
                <div style={{fontSize:11,fontWeight:700,color:tm.color}}>{t.nickname||t.pokemon.name}: {tm.label}</div>
                <div style={{fontSize:10,color:"#8b90a8",marginTop:2}}>DEF: {def} ({move.category==="Physical"?"VIT":"INS"})</div>
              </div>
            );
          })}

          {/* Accuracy roll */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>1. Accuracy — {move.accuracy} ({accPool} dice) · Need {actReq}+ to hit</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={doAccuracy} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Accuracy ({accPool}d)</button>
                {accResult&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:accResult.successes>=actReq?"#00d4aa":"#ff4757"}}>[{accResult.rolls.join(",")}]={accResult.successes} {accResult.successes>=actReq?"✓ HIT":"✗ MISS"}</span>}
              </div>
            </div>
          )}

          {/* Damage per target */}
          {canAct&&accResult&&accResult.successes>=actReq&&move.category!=="Support"&&targets.map(tid=>{
            const t=allEntries.find(e=>e.id===tid);
            if(!t)return null;
            const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);
            const pool=calcDmgPool(move,attrs,weather,stab,totalAbilBonus);
            const dr=dmgResults[tid];
            const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
            const finalDmg=dr?Math.max(1,(tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes)-def):null;
            const wasApplied=applied.has(tid);
            return (
              <div key={tid} style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>2. Damage → {t.nickname||t.pokemon.name} ({pool}d base)</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
                  <button onClick={()=>doDmgForTarget(tid)} disabled={!!dr} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:dr?"#5a6080":"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:dr?"default":"pointer"}}>🎲 Roll Damage ({pool}d)</button>
                  {dr&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{dr.rolls.join(",")}]={dr.successes} succ</span>}
                </div>
                {dr&&tm.dmgMod!==-999&&(
                  <div>
                    <div style={{fontSize:11,color:"#8b90a8",marginBottom:6}}>
                      {dr.successes} succ{tm.dmgMod===2?" ×2 SE":tm.dmgMod===-1?" ×0.5 NVE":""} = {tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes} − {def} DEF = <strong style={{color:"#ff4757"}}>{finalDmg} damage</strong>
                    </div>
                    {!wasApplied&&<button onClick={()=>applyDmgToTarget(tid)} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>⚔ Apply {finalDmg} damage to {t.nickname||t.pokemon.name}</button>}
                    {wasApplied&&<div style={{textAlign:"center",color:"#00d4aa",fontWeight:700,fontSize:12}}>✓ Damage applied!</div>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Stat effects */}
          {canAct&&accResult&&accResult.successes>=actReq&&statEffects.length>0&&targets.length>0&&(
            <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Stat Changes (on hit)</div>
              {statEffects.map((se,i)=>targets.map(tid=>{
                const t=allEntries.find(e=>e.id===tid);
                return (
                  <button key={`${i}-${tid}`} onClick={()=>{onApplyEffect(tid,se.attr,se.amount,`${move.name}`);}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",background:se.amount<0?"rgba(255,71,87,0.1)":"rgba(0,212,170,0.1)",border:`1px solid ${se.amount<0?"#ff475730":"#00d4aa30"}`,color:se.amount<0?"#ff4757":"#00d4aa",fontSize:11,fontWeight:700,width:"100%",marginBottom:3}}>
                    {se.amount>0?"▲":"▼"} Apply {se.attr} {se.amount>0?"+":"−"}1 to {t?.nickname||t?.pokemon.name}
                  </button>
                );
              }))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── End of Round Popup ─────────────────────────────────────────────────────── */
function EndOfRoundPopup({entries,weather,round,onApply,onClose}:{entries:BattleEntry[];weather:WeatherData;round:number;onApply:(id:string,hpChange:number,reason:string)=>void;onClose:()=>void;}) {
  const effects:{entry:BattleEntry;desc:string;hpChange:number}[]=[];
  entries.filter(e=>e.currentHp>0).forEach(e=>{
    const sc=STATUS_CONDITIONS[e.status];
    if(e.status==="Burned")effects.push({entry:e,desc:"Burn: −1 HP (ignores DEF)",hpChange:-1});
    else if(e.status==="Poisoned")effects.push({entry:e,desc:"Poison: −1 HP (ignores DEF)",hpChange:-1});
    else if(e.status==="Badly Poisoned")effects.push({entry:e,desc:"Bad Poison: −2 HP (ignores DEF)",hpChange:-2});
    if(weather.endOfRoundDmg&&!e.weatherImmune&&!(weather.immuneTypes??[]).some((t:string)=>e.pokemon.types.includes(t as PokemonType))){
      effects.push({entry:e,desc:`${weather.name}: ${weather.endOfRoundDesc}`,hpChange:-weather.endOfRoundDmg});
    }
  });
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🔄 End of Round {round}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto"}}>
          {effects.length===0?(
            <div style={{color:"#5a6080",textAlign:"center",padding:20}}>No end-of-round effects this round.</div>
          ):effects.map((ef,i)=>(
            <div key={i} style={{background:"#13151f",borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#e8eaf0"}}>{ef.entry.nickname||ef.entry.pokemon.name}</div>
                <div style={{fontSize:11,color:"#8b90a8",marginTop:2}}>{ef.desc}</div>
              </div>
              <button onClick={()=>onApply(ef.entry.id,ef.hpChange,ef.desc)} style={{background:"#ff475720",border:"1px solid #ff475740",borderRadius:4,color:"#ff4757",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                Apply {ef.hpChange} HP
              </button>
            </div>
          ))}
          {effects.length>0&&(
            <button onClick={()=>{effects.forEach(ef=>onApply(ef.entry.id,ef.hpChange,ef.desc));onClose();}} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:8}}>Apply All & Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Priority Phase Popup ───────────────────────────────────────────────────── */
function PriorityPhasePopup({entries,weather,onClose}:{entries:BattleEntry[];weather:WeatherData;onClose:()=>void;}) {
  const priorityEntries=useMemo(()=>{
    const result:{entry:BattleEntry;move:{rank:string;type:PokemonType;name:string;priority?:number}}[]=[];
    entries.filter(e=>e.currentHp>0).forEach(e=>{
      const priMoves=e.pokemon.moves.filter(m=>(m.priority??0)>0);
      if(priMoves.length>0)result.push({entry:e,move:priMoves.sort((a,b)=>(b.priority??0)-(a.priority??0))[0]});
    });
    return result.sort((a,b)=>(b.move.priority??0)-(a.move.priority??0));
  },[entries]);

  if(priorityEntries.length===0){onClose();return null;}

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #00d4aa40",borderRadius:10,width:460,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#00d4aa",margin:0}}>⚡ Priority Phase — Declare before normal turns</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto"}}>
          <p style={{fontSize:12,color:"#8b90a8",marginBottom:12,lineHeight:1.5}}>These Pokémon have Priority Reaction moves available. Declare usage now (highest priority first). Declared moves count as their first action.</p>
          {priorityEntries.map(({entry,move})=>(
            <div key={entry.id} style={{background:"#13151f",border:`1px solid ${TYPE_COLORS[move.type as PokemonType]||"#2a2f45"}30`,borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#e8eaf0"}}>{entry.nickname||entry.pokemon.name}</div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:3}}>
                  <TypeBadge type={move.type as PokemonType} small/>
                  <span style={{fontSize:11,color:"#e8eaf0"}}>{move.name}</span>
                  <span style={{fontSize:10,fontWeight:700,color:"#00d4aa"}}>Priority {move.priority}</span>
                </div>
              </div>
              <span style={{fontSize:11,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp} HP</span>
            </div>
          ))}
          <button onClick={onClose} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>Continue to Normal Turn Order</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Capture Popup ──────────────────────────────────────────────────────────── */
function CapturePopup({target,allEntries,onClose}:{target:BattleEntry;allEntries:BattleEntry[];onClose:()=>void;}) {
  const [ballType,setBallType]=useState<"Pokéball"|"Great Ball"|"Ultra Ball">("Pokéball");
  const [throwRoll,setThrowRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [sealRoll,setSealRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const ballPotency={["Pokéball"]:4,["Great Ball"]:6,["Ultra Ball"]:8};
  const CATCH_REQ: Record<Rank,number>={Starter:3,Rookie:4,Standard:6,Advanced:8,Expert:9,Ace:10,Master:12,Champion:14};
  const required=CATCH_REQ[target.pokemon.suggestedRank]??6;
  const atHalf=target.currentHp<=target.maxHp/2&&target.currentHp>1;
  const atOne=target.currentHp===1;
  const statusBonus=target.status!=="Healthy"?1:0;
  const hpBonus=atOne?2:atHalf?1:0;
  const totalBonus=hpBonus+statusBonus;
  const totalSuccesses=(throwRoll?.successes??0)+(sealRoll?.successes??0)+totalBonus;
  const caught=throwRoll&&sealRoll&&totalSuccesses>=required;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🎯 Capture Attempt — {target.nickname||target.pokemon.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          {/* Status */}
          <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#e8eaf0",marginBottom:6}}>Target Condition</div>
            <div style={{display:"flex",gap:12,fontSize:11,flexWrap:"wrap"}}>
              <span style={{color:"#5a6080"}}>Rank: <strong style={{color:"#ffd32a"}}>{target.pokemon.suggestedRank}</strong></span>
              <span style={{color:"#5a6080"}}>Needs: <strong style={{color:"#ffd32a"}}>{required} successes</strong></span>
              <span style={{color:"#5a6080"}}>HP: <strong style={{color:atOne?"#ff4757":atHalf?"#ffd32a":"#00d4aa"}}>{target.currentHp}/{target.maxHp}</strong></span>
              <span style={{color:"#5a6080"}}>Status: <strong style={{color:"#a040a0"}}>{target.status}</strong></span>
            </div>
          </div>
          {/* Bonuses */}
          <div style={{background:"rgba(0,212,170,0.08)",border:"1px solid #00d4aa30",borderRadius:6,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#00d4aa",marginBottom:6}}>Bonus Successes: +{totalBonus}</div>
            {hpBonus>0&&<div style={{fontSize:10,color:"#8b90a8"}}>HP condition (+{hpBonus}): {atOne?"At 1 HP (+2)":"At half HP (+1)"}</div>}
            {statusBonus>0&&<div style={{fontSize:10,color:"#8b90a8"}}>Status ailment (+1): {target.status}</div>}
            {totalBonus===0&&<div style={{fontSize:10,color:"#5a6080"}}>No bonuses — weaken the target first!</div>}
          </div>
          {/* Ball selector */}
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Select Pokéball</div>
            <div style={{display:"flex",gap:6}}>
              {(["Pokéball","Great Ball","Ultra Ball"] as const).map(b=>(
                <button key={b} onClick={()=>setBallType(b)} style={{flex:1,padding:"6px",borderRadius:5,border:`1px solid ${ballType===b?"#ffd32a":"#3a4060"}`,background:ballType===b?"rgba(255,211,42,0.15)":"transparent",color:ballType===b?"#ffd32a":"#8b90a8",fontSize:11,fontWeight:ballType===b?700:400,cursor:"pointer"}}>
                  {b}<div style={{fontSize:10,color:"#5a6080"}}>{ballPotency[b]}d seal</div>
                </button>
              ))}
            </div>
          </div>
          {/* Step 1: Throw */}
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Step 1 — Throw Ball: DEX/STR + Throw</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setThrowRoll(rollDice(4))} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Throw (4d)</button>
              {throwRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{throwRoll.rolls.join(",")}] = <span style={{color:"#00d4aa"}}>{throwRoll.successes} hits</span></span>}
            </div>
          </div>
          {/* Step 2: Seal */}
          {throwRoll&&throwRoll.successes>0&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Step 2 — Seal Potency ({ballPotency[ballType]}d)</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setSealRoll(rollDice(ballPotency[ballType]))} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:"#f08030",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Seal ({ballPotency[ballType]}d)</button>
                {sealRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{sealRoll.rolls.join(",")}] = <span style={{color:"#f08030"}}>{sealRoll.successes}</span></span>}
              </div>
            </div>
          )}
          {/* Result */}
          {throwRoll&&sealRoll&&(
            <div style={{background:caught?"rgba(0,212,170,0.15)":"rgba(255,71,87,0.15)",border:`1px solid ${caught?"#00d4aa":"#ff4757"}40`,borderRadius:6,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,fontFamily:"'Exo 2'",color:caught?"#00d4aa":"#ff4757",marginBottom:4}}>
                {caught?"✓ Caught!":"✗ Broke Free!"}
              </div>
              <div style={{fontSize:12,color:"#8b90a8"}}>
                {throwRoll.successes} + {sealRoll.successes} + {totalBonus} bonus = <strong style={{color:caught?"#00d4aa":"#ff4757"}}>{totalSuccesses}</strong> / {required} needed
              </div>
              {!caught&&<div style={{fontSize:11,color:"#5a6080",marginTop:4}}>Need {required-totalSuccesses} more success{required-totalSuccesses!==1?"es":""}. Weaken further or use a better ball.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Characters Panel ───────────────────────────────────────────────────────── */
function CharactersPanel({onAddToTracker}:{onAddToTracker:(p:PokemonEntry)=>void}) {
  const [trainers,setTrainers]=useState<any[]>(()=>loadFromStorage("trainers",[]));
  const [pokemonSheets,setPokemonSheets]=useState<Record<string,any>>(()=>loadFromStorage("pokemon_sheets",{}));
  const [selId,setSelId]=useState<string|null>(null);
  const sel=trainers.find(t=>t.id===selId);

  if(trainers.length===0) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"#5a6080",padding:20,textAlign:"center"}}>
      <div style={{fontSize:32}}>👤</div>
      <div style={{fontSize:12}}>No saved trainers yet.</div>
      <Link href="/characters" style={{color:"#3d8bff",fontSize:11,textDecoration:"none"}}>→ Create characters</Link>
    </div>
  );

  return (
    <div style={{display:"flex",height:"100%",minHeight:0}}>
      {/* Trainer list */}
      <div style={{width:130,borderRight:"1px solid #2a2f45",overflowY:"auto",flexShrink:0}}>
        {trainers.map(t=>(
          <div key={t.id} onClick={()=>setSelId(t.id)} style={{padding:"8px 10px",cursor:"pointer",background:selId===t.id?"#242842":"transparent",borderLeft:`2px solid ${selId===t.id?"#3d8bff":"transparent"}`}}
            onMouseEnter={e=>{if(selId!==t.id)(e.currentTarget as HTMLDivElement).style.background="#1e2235";}}
            onMouseLeave={e=>{if(selId!==t.id)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
            <div style={{fontSize:12,fontWeight:700,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name||"Unnamed"}</div>
            <div style={{fontSize:10,color:"#5a6080"}}>{t.rank}</div>
          </div>
        ))}
      </div>
      {/* Pokemon party */}
      <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
        {!sel&&<div style={{color:"#5a6080",fontSize:11,padding:12}}>Select a trainer</div>}
        {sel&&(
          <>
            <div style={{fontSize:11,color:"#8b90a8",marginBottom:8,padding:"0 2px"}}>
              <strong style={{color:"#e8eaf0"}}>{sel.name}</strong> · {sel.rank} · HP {4+sel.attributes?.vitality} · WP {sel.attributes?.insight+3}
            </div>
            {/* Trainer themselves */}
            <div style={{background:"rgba(61,139,255,0.1)",border:"1px solid #3d8bff30",borderRadius:5,padding:"8px 10px",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3d8bff",marginBottom:4}}>👤 Trainer: {sel.name}</div>
              <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>STR {sel.attributes?.strength} DEX {sel.attributes?.dexterity} VIT {sel.attributes?.vitality} INS {sel.attributes?.insight}</div>
              <button onClick={()=>{
                // Add trainer as a special entry
                const fakePoke:PokemonEntry={number:-1,name:sel.name,types:["Normal" as PokemonType],height:"",weight:"",baseHp:4,
                  attributes:sel.attributes||{strength:1,dexterity:1,vitality:1,special:1,insight:1},
                  attributeLimits:{strength:5,dexterity:5,vitality:5,special:5,insight:5},
                  abilities:[],suggestedRank:"Rookie",evolutiveStage:"Final",description:"Trainer",
                  weaknesses:[],resistances:[],immunities:[],moves:[]};
                onAddToTracker(fakePoke);
              }} style={{background:"#3d8bff20",border:"1px solid #3d8bff40",borderRadius:4,color:"#3d8bff",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                + Add Trainer to Battle
              </button>
            </div>
            {/* Party pokemon */}
            {(sel.pokemon||[]).map((key:string)=>{
              const sheet=pokemonSheets[key];
              if(!sheet) return null;
              const p=POKEMON.find(x=>x.number===sheet.number);
              if(!p) return null;
              return (
                <div key={key} style={{background:"#1e2235",border:`1px solid ${TYPE_COLORS[p.types[0]]}30`,borderRadius:5,padding:"8px 10px",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#e8eaf0"}}>{sheet.nickname||p.name}</span>
                    {sheet.nickname&&<span style={{fontSize:9,color:"#5a6080"}}>({p.name})</span>}
                    <span style={{display:"inline-flex",padding:"1px 5px",borderRadius:2,fontSize:8,fontWeight:700,color:"#fff",background:TYPE_COLORS[p.types[0]]}}>{p.types[0]}</span>
                    <span style={{marginLeft:"auto",fontSize:9,color:"#5a6080"}}>HP {p.baseHp+sheet.attributes?.vitality}</span>
                  </div>
                  <button onClick={()=>{
                    const customPoke:PokemonEntry={...p,
                      attributes:sheet.attributes||p.attributes,
                      moves:sheet.moves?.slice(0,6).map((mn:string)=>{
                        const existing=p.moves.find(m=>m.name===mn);
                        return existing||{rank:"Starter",type:p.types[0],name:mn};
                      })||p.moves.slice(0,6),
                    };
                    // Add with linkedTrainerId so trainer toggle works
                    onAddToTracker(customPoke);
                    // We need a way to set linkedTrainerId after adding - use a custom event via storage
                    const pendingLink={pokemonNumber:customPoke.number,pokemonName:customPoke.name,trainerId:sel.id,nickname:sheet.nickname||""};
                    saveToStorage("pending_link",pendingLink);
                  }} style={{background:"#00d4aa20",border:"1px solid #00d4aa40",borderRadius:4,color:"#00d4aa",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    ⚔️ Add to Battle
                  </button>
                </div>
              );
            })}
            {(!sel.pokemon||sel.pokemon.length===0)&&<div style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>No Pokémon in party</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Battle Card ────────────────────────────────────────────────────────────── */
function BattleCard({entry,allEntries,weather,isActive,onUpdate,onRemove,onDragStart,onDragOver,onDrop}:{
  entry:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;
  isActive:boolean;onUpdate:(id:string,u:Partial<BattleEntry>)=>void;onRemove:(id:string)=>void;
  onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:()=>void;
}) {
  const [movePopup,setMovePopup]=useState<Move|null>(null);
  const [showEditMoves,setShowEditMoves]=useState(false);
  const [showCapture,setShowCapture]=useState(false);
  const [showTrainerStats,setShowTrainerStats]=useState(false);

  // Load linked trainer data from storage if this is a player pokemon
  const linkedTrainer=useMemo(()=>{
    if(!entry.linkedTrainerId)return null;
    const trainers=loadFromStorage<any[]>("trainers",[]);
    return trainers.find(t=>t.id===entry.linkedTrainerId)||null;
  },[entry.linkedTrainerId]);
  const upd=(u:Partial<BattleEntry>)=>onUpdate(entry.id,u);
  const sc=STATUS_CONDITIONS[entry.status];
  const eff=getEffectiveAttrs(entry);
  const sideColor={player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[entry.side];
  const painPenalty=getPainPenalty(entry.currentHp,entry.maxHp);
  const disobedience=getDisobedienceLevel(entry.pokemon.suggestedRank,entry.trainerRank);
  const actionSlots=[0,1,2,3,4];

  const applyDmg=(targetId:string,dmg:number)=>{
    const t=allEntries.find(e=>e.id===targetId);
    if(t)onUpdate(targetId,{currentHp:Math.max(0,t.currentHp-dmg)});
  };
  const applyEffect=(targetId:string,attr:string,amount:number,source:string)=>{
    const t=allEntries.find(e=>e.id===targetId);
    if(!t)return;
    const newMods=[...t.statMods];
    const idx=newMods.findIndex(m=>m.attr===attr&&m.source===source);
    if(idx>=0)newMods[idx].amount+=amount;
    else newMods.push({source,attr,amount});
    onUpdate(targetId,{statMods:newMods});
  };

  const attrModSummary=(attr:keyof typeof entry.attrs)=>entry.statMods.filter(m=>m.attr===attr).reduce((s,m)=>s+m.amount,0);

  return (
    <>
      {movePopup&&<MoveAttackPopup move={movePopup} attacker={entry} allEntries={allEntries} weather={weather} onClose={()=>setMovePopup(null)} onApplyDmg={applyDmg} onApplyEffect={applyEffect}/>}
      {showCapture&&<CapturePopup target={entry} allEntries={allEntries} onClose={()=>setShowCapture(false)}/>}
      <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} style={{background:entry.hasTakenTurn?"#13151f":"#1e2235",border:`1px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor+"40"}`,borderLeft:`3px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor}`,borderRadius:8,opacity:entry.hasTakenTurn&&!isActive?0.65:1,boxShadow:isActive?`0 0 0 2px ${sideColor}30,0 4px 20px rgba(0,0,0,0.4)`:undefined,marginBottom:10,cursor:"default"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:isActive?sideColor+"15":"#13151f",borderRadius:"8px 8px 0 0"}}>
          <span style={{color:"#3a4060",cursor:"grab",fontSize:12}}>⠿</span>
          <button onClick={()=>upd({hasTakenTurn:!entry.hasTakenTurn})} style={{width:18,height:18,borderRadius:"50%",border:"none",background:entry.hasTakenTurn?"#00d4aa":"#2a2f45",color:entry.hasTakenTurn?"#0f1117":"#5a6080",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✓</button>
          <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
          <input value={entry.nickname} onChange={e=>upd({nickname:e.target.value})} placeholder={entry.pokemon.name}
            style={{flex:1,background:"transparent",border:"none",color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,outline:"none",minWidth:0}}/>
          {isActive&&<span style={{fontSize:9,fontWeight:700,color:sideColor,background:sideColor+"20",padding:"1px 5px",borderRadius:3}}>ACTIVE</span>}
          {disobedience!=="none"&&<span style={{fontSize:9,color:disobedience==="high"?"#ff4757":"#ffd32a"}}>⚠{disobedience==="high"?"REBEL":"DISOBEY"}</span>}
          <div style={{display:"flex",alignItems:"center",gap:2}}>
            <span style={{fontSize:9,color:"#5a6080"}}>INI:</span>
            <input type="number" value={entry.initiative} onChange={e=>upd({initiative:+e.target.value})}
              style={{width:28,background:"transparent",border:"none",color:"#6890f0",fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,textAlign:"center",outline:"none"}}/>
          </div>
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})}
            style={{background:"#0f1117",border:"none",color:sideColor,fontSize:9,borderRadius:2,padding:"1px 3px"}}>
            <option value="player">Player</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option>
          </select>
          <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span>
          <button onClick={()=>upd({isExpanded:!entry.isExpanded})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:11}}>{entry.isExpanded?"▲":"▼"}</button>
          {entry.side==="enemy"&&<button onClick={()=>setShowCapture(true)} title="Capture this Pokémon" style={{background:"none",border:"none",color:"#ffd32a",cursor:"pointer",fontSize:13,padding:"0 2px"}}>🎯</button>}
          {(linkedTrainer||entry.side==="player")&&<button onClick={()=>setShowTrainerStats(!showTrainerStats)} title="Toggle trainer stats" style={{background:showTrainerStats?"rgba(61,139,255,0.2)":"none",border:showTrainerStats?"1px solid #3d8bff40":"none",borderRadius:3,color:showTrainerStats?"#3d8bff":"#5a6080",cursor:"pointer",fontSize:11,padding:"0 4px"}}>👤</button>}
          <button onClick={()=>onRemove(entry.id)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
        <HpBar current={entry.currentHp} max={entry.maxHp}/>

        {entry.isExpanded&&(
          <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:10}}>
            {/* Action Economy */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:"#5a6080",flexShrink:0}}>Actions this round:</span>
              <div style={{display:"flex",gap:4}}>
                {actionSlots.map(i=>(
                  <button key={i} onClick={()=>upd({actionCount:entry.actionCount===i+1?i:i+1})}
                    style={{width:22,height:22,borderRadius:4,border:`1px solid ${i<entry.actionCount?"#f08030":"#3a4060"}`,background:i<entry.actionCount?"#f0803020":"transparent",cursor:"pointer",fontSize:9,color:i<entry.actionCount?"#f08030":"#5a6080",fontWeight:700}}>
                    {i+1}
                  </button>
                ))}
              </div>
              {entry.actionCount>0&&<span style={{fontSize:9,color:"#ff4757"}}>Next hit needs {Math.min(entry.actionCount+1,5)}+ succ</span>}
              {isActive&&<button onClick={()=>upd({actionCount:Math.min(4,entry.actionCount+1)})} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:3,color:"#f08030",padding:"2px 8px",fontSize:10,cursor:"pointer"}}>+Action</button>}
            </div>

            {/* Status */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <select value={entry.status} onChange={e=>upd({status:e.target.value,statusTurnsLeft:e.target.value==="Asleep"?3:0})}
                style={{background:"#0f1117",border:`1px solid ${sc?.color??"#2a2f45"}`,borderRadius:4,color:sc?.color??"#5a6080",fontSize:11,padding:"2px 6px",fontWeight:700}}>
                {Object.keys(STATUS_CONDITIONS).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              {sc&&sc.name!=="Healthy"&&(
                <div style={{fontSize:10,color:sc.color,flex:1,cursor:"help",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"normal"}} title={sc.fullDesc}>
                  {sc.shortDesc}
                </div>
              )}
              {painPenalty>0&&<div style={{fontSize:10,color:"#ff4757",background:"rgba(255,71,87,0.1)",padding:"1px 5px",borderRadius:3}}>Pain −{painPenalty}d</div>}
              {!entry.weatherImmune&&weather.name!=="Clear"&&<div style={{fontSize:10,color:"#ffd32a",background:"rgba(255,211,42,0.1)",padding:"1px 5px",borderRadius:3}}>{weather.emoji?.split(" ")[0]} {weather.name}</div>}
            </div>

            {/* HP + WP */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{label:"HP",cur:entry.currentHp,max:entry.maxHp,color:"#00d4aa",f:"currentHp" as const,mf:"maxHp" as const},
                {label:"WP",cur:entry.currentWill,max:entry.maxWill,color:"#6890f0",f:"currentWill" as const,mf:"maxWill" as const}].map(f=>(
                <div key={f.label}>
                  <div style={{fontSize:10,color:"#5a6080",marginBottom:3}}>{f.label}</div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <button onClick={()=>upd({[f.f]:Math.max(0,f.cur-1)})} style={adjBtn}>−</button>
                    <input type="number" value={f.cur} onChange={e=>upd({[f.f]:Math.max(0,Math.min(f.max,+e.target.value||0))})}
                      style={{width:34,textAlign:"center",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,color:f.color,fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,padding:"1px 2px"}}/>
                    <span style={{fontSize:10,color:"#5a6080"}}>/{f.max}</span>
                    <button onClick={()=>upd({[f.f]:Math.min(f.max,f.cur+1)})} style={adjBtn}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Attributes */}
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Attributes</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{
                  const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};
                  const base=entry.attrs[attr];
                  const mod=attrModSummary(attr);
                  const statusPen=attr==="dexterity"?(STATUS_CONDITIONS[entry.status]?.accuracyPenalty??0):0;
                  const final=Math.max(0,base+mod-statusPen);
                  return (
                    <div key={attr} style={{textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#5a6080",marginBottom:2}}>{labels[attr]}</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:1}}>
                        <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:Math.max(0,base-1)}})} style={{...adjBtn,width:14,height:14,fontSize:11}}>−</button>
                        <span style={{fontSize:13,fontFamily:"'Exo 2'",fontWeight:700,color:final<base?"#ff4757":mod>0?"#00d4aa":"#e8eaf0",minWidth:18,textAlign:"center"}}>
                          {final}{mod!==0&&<sup style={{fontSize:7,color:mod>0?"#00d4aa":"#ff4757"}}>{mod>0?`+${mod}`:mod}</sup>}
                        </span>
                        <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:base+1}})} style={{...adjBtn,width:14,height:14,fontSize:11}}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {entry.statMods.length>0&&(
                <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:3}}>
                  {entry.statMods.map((m,i)=>(
                    <div key={i} style={{fontSize:9,display:"flex",alignItems:"center",gap:3,background:m.amount>0?"rgba(0,212,170,0.1)":"rgba(255,71,87,0.1)",border:`1px solid ${m.amount>0?"#00d4aa30":"#ff475730"}`,borderRadius:3,padding:"1px 5px"}}>
                      <span style={{color:m.amount>0?"#00d4aa":"#ff4757"}}>{m.amount>0?"▲":"▼"}{Math.abs(m.amount)} {m.attr}</span>
                      <span style={{color:"#5a6080",fontSize:8}}>({m.source})</span>
                      <button onClick={()=>upd({statMods:entry.statMods.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:10,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Abilities */}
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Abilities</div>
              {entry.abilities.map((ab,i)=>{
                const abData=ABILITIES.find(a=>a.name===ab.name);
                return (
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 8px",background:ab.active?"rgba(0,212,170,0.06)":"rgba(90,96,128,0.1)",borderRadius:4,marginBottom:4,border:`1px solid ${ab.active?"#00d4aa20":"#3a4060"}`}}>
                    <button onClick={()=>{const abs=[...entry.abilities];abs[i]={...abs[i],active:!abs[i].active,disabledReason:abs[i].active?"Manually disabled":undefined};upd({abilities:abs});}}
                      style={{width:16,height:16,borderRadius:3,border:`1px solid ${ab.active?"#00d4aa":"#3a4060"}`,background:ab.active?"#00d4aa":"transparent",cursor:"pointer",flexShrink:0,marginTop:1}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:ab.active?"#e8eaf0":"#5a6080"}}>{ab.name}{!ab.active&&ab.disabledReason&&<span style={{fontSize:9,color:"#5a6080",marginLeft:4}}>({ab.disabledReason})</span>}</div>
                      {ab.active&&abData&&<div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{abData.effect}</div>}
                    </div>
                  </div>
                );
              })}
              {entry.pokemon.number===0&&(
                <select onChange={e=>{if(e.target.value)upd({abilities:[...entry.abilities,{name:e.target.value,active:true}]});e.target.value="";}}
                  style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:11,padding:"3px 6px",marginTop:4}}>
                  <option value="">+ Add ability…</option>
                  {ABILITIES.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              )}
            </div>

            {/* Moves */}
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase"}}>Moves</div>
                <button onClick={()=>setShowEditMoves(!showEditMoves)} style={{fontSize:10,color:"#00d4aa",background:"none",border:"none",cursor:"pointer"}}>{showEditMoves?"Done":"+ Edit"}</button>
              </div>
              {showEditMoves?(
                <div style={{maxHeight:160,overflowY:"auto"}}>
                  {MOVES.slice(0,100).map(m=>{
                    const has=entry.moves.some(em=>em.name===m.name);
                    return (
                      <div key={m.name} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}>
                        <input type="checkbox" checked={has} onChange={()=>upd({moves:has?entry.moves.filter(em=>em.name!==m.name):[...entry.moves,m]})}/>
                        <TypeBadge type={m.type as PokemonType} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{m.name}</span>
                        {(m.priority??0)>0&&<span style={{fontSize:9,color:"#00d4aa"}}>P{m.priority}</span>}
                      </div>
                    );
                  })}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {entry.moves.map((m,i)=>{
                    const stab2=entry.pokemon.types.includes(m.type as PokemonType);
                    const wBoost=weather.typeBoost===m.type;
                    const abilMods=calcAbilityBonus(entry,m,weather);
                    return (
                      <button key={i} onClick={()=>setMovePopup(m)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",background:"#13151f",border:`1px solid ${TYPE_COLORS[m.type as PokemonType]||"#2a2f45"}25`,borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%",transition:"border-color 0.1s"}}
                        onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type as PokemonType]||"#00d4aa"}
                        onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=`${TYPE_COLORS[m.type as PokemonType]||"#2a2f45"}25`}>
                        <TypeBadge type={m.type as PokemonType} small/>
                        <span style={{fontSize:12,color:"#e8eaf0",flex:1}}>{m.name}</span>
                        {stab2&&<span style={{fontSize:9,color:"#ffd32a",fontWeight:700}}>STAB</span>}
                        {wBoost&&<span style={{fontSize:9,color:"#f8d030"}}>{weather.emoji?.split(" ")[0]}</span>}
                        {(m.priority??0)>0&&<span style={{fontSize:9,color:"#00d4aa",fontWeight:700}}>P{m.priority}</span>}
                        {abilMods.bonus>0&&<span style={{fontSize:9,color:"#00d4aa",fontWeight:700}}>+{abilMods.bonus}</span>}
                        {m.power!=="-"&&<span style={{fontSize:9,color:"#5a6080"}}>P{m.power}</span>}
                        <span style={{fontSize:9,color:"#5a6080"}}>▶</span>
                      </button>
                    );
                  })}
                  {entry.moves.length===0&&<div style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>No moves. Click Edit to add.</div>}
                </div>
              )}
            </div>

            <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Notes…"
              style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:10,padding:5,resize:"none",minHeight:32,fontFamily:"inherit",lineHeight:1.4,outline:"none"}}/>

            {/* Trainer stats toggle panel */}
            {showTrainerStats&&linkedTrainer&&(
              <div style={{background:"rgba(61,139,255,0.08)",border:"1px solid #3d8bff30",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#3d8bff",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,fontWeight:700}}>👤 Trainer: {linkedTrainer.name}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}}>
                  {[["STR",linkedTrainer.attributes?.strength],["DEX",linkedTrainer.attributes?.dexterity],["VIT",linkedTrainer.attributes?.vitality],["INS",linkedTrainer.attributes?.insight]].map(([l,v])=>(
                    <div key={l as string} style={{textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#5a6080"}}>{l}</div>
                      <div style={{fontSize:14,fontFamily:"'Exo 2'",fontWeight:700,color:"#3d8bff"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#5a6080",marginBottom:6}}>HP {4+(linkedTrainer.attributes?.vitality||1)} · WP {(linkedTrainer.attributes?.insight||1)+3} · {linkedTrainer.rank}</div>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Skills</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {Object.entries(linkedTrainer.skills||{}).filter(([,v])=>(v as number)>0).map(([skill,val])=>(
                    <span key={skill} style={{fontSize:9,background:"rgba(61,139,255,0.1)",border:"1px solid #3d8bff30",borderRadius:3,padding:"1px 5px",color:"#3d8bff"}}>{skill} {val as number}</span>
                  ))}
                </div>
              </div>
            )}
            {showTrainerStats&&!linkedTrainer&&(
              <div style={{background:"rgba(61,139,255,0.06)",border:"1px solid #3d8bff20",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#5a6080"}}>
                No linked trainer. Add this Pokémon from a saved character to see trainer stats.
              </div>
            )}

            <label style={{fontSize:10,color:"#8b90a8",display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
              <input type="checkbox" checked={entry.weatherImmune} onChange={e=>upd({weatherImmune:e.target.checked})}/>
              Immune to weather chip damage
            </label>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Encounter mini-panel ───────────────────────────────────────────────────── */
const HABITATS_MINI = [
  {name:"Towns/Cities",emoji:"🏙️",color:"#a040a0",types:["Normal","Electric","Flying","Dark","Poison","Psychic"]},
  {name:"Plains/Grassland",emoji:"🌾",color:"#78c850",types:["Normal","Flying","Ground","Grass","Fight","Rock","Dark","Electric"]},
  {name:"Forest/Jungle",emoji:"🌲",color:"#228b22",types:["Bug","Grass","Poison","Flying","Fight","Ghost"]},
  {name:"Lakes/Rivers/Sea",emoji:"🌊",color:"#6890f0",types:["Water","Ice","Flying","Electric","Dragon"]},
  {name:"Caves/Mountains",emoji:"⛰️",color:"#b8a038",types:["Rock","Ground","Fight","Steel","Ghost","Dark","Dragon"]},
  {name:"Desert/Volcanoes",emoji:"🌋",color:"#f08030",types:["Fire","Ground","Rock","Dragon","Steel"]},
  {name:"Arctic Regions",emoji:"❄️",color:"#98d8d8",types:["Ice","Water","Steel"]},
];
const RANK_ORDER_LIST: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];

function EncounterPanel({onAddToTracker}:{onAddToTracker:(p:PokemonEntry)=>void}) {
  const [habitat,setHabitat]=useState(HABITATS_MINI[1]);
  const [rankFilter,setRankFilter]=useState<Set<Rank>>(new Set(RANK_ORDER_LIST));
  const [rolled,setRolled]=useState<PokemonEntry|null>(null);

  const filtered=useMemo(()=>POKEMON.filter(p=>{
    if(!rankFilter.has(p.suggestedRank))return false;
    return p.types.some(t=>habitat.types.includes(t));
  }),[habitat,rankFilter]);

  const rollRandom=()=>{
    if(!filtered.length)return;
    setRolled(filtered[Math.floor(Math.random()*filtered.length)]);
  };

  const toggleRank=(r:Rank)=>{
    setRankFilter(prev=>{const n=new Set(prev);if(n.has(r))n.delete(r);else n.add(r);return n;});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,height:"100%",minHeight:0}}>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {HABITATS_MINI.map(h=>(
          <button key={h.name} onClick={()=>setHabitat(h)} style={{fontSize:10,padding:"2px 6px",borderRadius:4,cursor:"pointer",border:`1px solid ${h.color}60`,background:habitat.name===h.name?h.color+"20":"transparent",color:habitat.name===h.name?h.color:"#8b90a8",fontWeight:habitat.name===h.name?700:400}}>
            {h.emoji} {h.name.split("/")[0]}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {RANK_ORDER_LIST.map(r=>(
          <button key={r} onClick={()=>toggleRank(r)} style={{fontSize:9,padding:"1px 5px",borderRadius:3,cursor:"pointer",border:`1px solid ${RANK_COLORS[r]}60`,background:rankFilter.has(r)?RANK_COLORS[r]+"20":"transparent",color:rankFilter.has(r)?RANK_COLORS[r]:"#5a6080",fontWeight:700}}>{r}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={rollRandom} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:"6px 14px",fontWeight:700,fontSize:11,cursor:"pointer"}}>🎲 Roll ({filtered.length})</button>
      </div>
      {rolled&&(
        <div style={{background:"#13151f",border:`2px solid ${TYPE_COLORS[rolled.types[0]]}`,borderRadius:6,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0"}}>{rolled.name}</span>
            <span style={{fontSize:10,color:"#5a6080"}}>#{String(rolled.number).padStart(3,"0")}</span>
            {rolled.types.map(t=><TypeBadge key={t} type={t} small/>)}
            <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:RANK_COLORS[rolled.suggestedRank]}}>{rolled.suggestedRank}</span>
          </div>
          <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>HP {rolled.baseHp+rolled.attributes.vitality} · STR {rolled.attributes.strength} · DEX {rolled.attributes.dexterity} · SPC {rolled.attributes.special}</div>
          <button onClick={()=>onAddToTracker(rolled)} style={{background:"#ff4757",color:"#fff",border:"none",borderRadius:4,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚔️ Add to Battle Tracker</button>
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
        {filtered.slice(0,40).map(p=>(
          <div key={`${p.number}-${p.name}`} onClick={()=>setRolled(p)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:4,cursor:"pointer",transition:"background 0.1s"}}
            onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#1e2235"}
            onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
            <span style={{fontSize:9,color:"#3a4060",width:28,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
            <span style={{fontSize:11,color:"#e8eaf0",flex:1}}>{p.name}</span>
            {p.types.map(t=><TypeBadge key={t} type={t} small/>)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Popout Window ──────────────────────────────────────────────────────────── */
function PopoutButton({title,children}:{title:string;children:React.ReactNode}) {
  const openPopout=()=>{
    const w=window.open("","_blank","width=500,height=700,resizable=yes,scrollbars=yes");
    if(!w)return;
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{margin:0;background:#0f1117;color:#e8eaf0;font-family:Inter,sans-serif;padding:16px;font-size:13px;}*{box-sizing:border-box;}</style></head><body></body></html>`);
    w.document.close();
  };
  return (
    <button onClick={openPopout} title="Pop out to separate window" style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12,padding:"0 4px"}} >↗</button>
  );
}

/* ─── Draggable Tracker List ─────────────────────────────────────────────────── */
function DraggableTrackerList({entries,setEntries,allEntries,weather,activeId}:{
  entries:BattleEntry[];setEntries:React.Dispatch<React.SetStateAction<BattleEntry[]>>;
  allEntries:BattleEntry[];weather:WeatherData;activeId:string|undefined;
}) {
  const [dragId,setDragId]=useState<string|null>(null);
  const [dragOverId,setDragOverId]=useState<string|null>(null);
  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);

  const upd=(id:string,u:Partial<BattleEntry>)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e));
  const remove=(id:string)=>setEntries(prev=>prev.filter(e=>e.id!==id));

  const handleDrop=(targetId:string)=>{
    if(!dragId||dragId===targetId){setDragId(null);setDragOverId(null);return;}
    setEntries(prev=>{
      const arr=[...prev];
      const fromIdx=arr.findIndex(e=>e.id===dragId);
      const toIdx=arr.findIndex(e=>e.id===targetId);
      const [item]=arr.splice(fromIdx,1);
      arr.splice(toIdx,0,item);
      return arr;
    });
    setDragId(null);setDragOverId(null);
  };

  return (
    <>
      {sorted.map(e=>(
        <div key={e.id} style={{opacity:dragOverId===e.id?0.5:1,outline:dragOverId===e.id?"2px dashed #00d4aa":"none",borderRadius:8,transition:"opacity 0.1s"}}>
          <BattleCard entry={e} allEntries={allEntries} weather={weather} isActive={activeId===e.id}
            onUpdate={upd} onRemove={remove}
            onDragStart={()=>setDragId(e.id)}
            onDragOver={(ev)=>{ev.preventDefault();setDragOverId(e.id);}}
            onDrop={()=>handleDrop(e.id)}/>
        </div>
      ))}
    </>
  );
}

/* ─── Panel Content Router ────────────────────────────────────────────────────── */
const ALL_TYPES: PokemonType[] = ["Normal","Fire","Water","Electric","Grass","Ice","Fight","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

function PanelContent({panel,entries,setEntries,weather,turn,onAddToTracker,gmNotes,setGmNotes}:{
  panel:Panel;entries:BattleEntry[];setEntries:React.Dispatch<React.SetStateAction<BattleEntry[]>>;
  weather:WeatherData;turn:number;onAddToTracker:(p:PokemonEntry)=>void;
  gmNotes:string;setGmNotes:(s:string)=>void;
}) {
  const upd=useCallback((id:string,u:Partial<BattleEntry>)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e)),[setEntries]);
  const remove=useCallback((id:string)=>setEntries(prev=>prev.filter(e=>e.id!==id)),[setEntries]);
  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry=sorted[turn%Math.max(1,sorted.length)];

  switch(panel.type) {
    case "tracker": return (
      <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
        <div style={{borderBottom:"1px solid #2a2f45",padding:"6px 8px"}}>
          <TrackerSearch onAdd={onAddToTracker}/>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 6px"}}>
          {entries.length===0?(
            <div style={{textAlign:"center",color:"#5a6080",padding:30,fontSize:12}}>Add Pokémon above to begin</div>
          ):<DraggableTrackerList entries={entries} setEntries={setEntries} allEntries={entries} weather={weather} activeId={sorted[turn%Math.max(1,sorted.length)]?.id}/>}
        </div>
      </div>
    );
    case "characters": return <CharactersPanel onAddToTracker={onAddToTracker}/>;
    case "notes": return (
      <textarea value={gmNotes} onChange={e=>setGmNotes(e.target.value)} placeholder="Session notes, NPC details, secrets…"
        style={{flex:1,width:"100%",height:"100%",background:"transparent",border:"none",color:"#8b90a8",fontSize:12,padding:12,resize:"none",fontFamily:"inherit",lineHeight:1.6,outline:"none"}}/>
    );
    case "encounter": return <EncounterPanel onAddToTracker={onAddToTracker}/>;
    case "type_chart": return (
      <div style={{overflowY:"auto",height:"100%",padding:"6px"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:9}}>
          <thead><tr>
            {["Type","Weak to","Resists","Immune"].map(h=><th key={h} style={{padding:"4px 6px",color:"#5a6080",background:"#13151f",borderBottom:"1px solid #2a2f45",textAlign:"left"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {ALL_TYPES.map((t,i)=>{
              const c=TYPE_CHART[t];
              const badge=(types:PokemonType[])=>(<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{types.map(w=><span key={w} style={{display:"inline-flex",padding:"0px 3px",borderRadius:2,fontSize:7,fontWeight:700,color:"#fff",background:TYPE_COLORS[w]}}>{w}</span>)}</div>);
              return (
                <tr key={t} style={{background:i%2===0?"transparent":"#1e223520"}}>
                  <td style={{padding:"3px 6px"}}><span style={{display:"inline-flex",padding:"1px 5px",borderRadius:2,fontSize:8,fontWeight:700,color:"#fff",background:TYPE_COLORS[t]}}>{t}</span></td>
                  <td style={{padding:"3px 6px"}}>{badge(c.weaknesses)}</td>
                  <td style={{padding:"3px 6px"}}>{badge(c.resistances)}</td>
                  <td style={{padding:"3px 6px"}}>{badge(c.immunities)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    case "status_ref": return (
      <div style={{overflowY:"auto",height:"100%",padding:"8px 10px"}}>
        {Object.values(STATUS_CONDITIONS).filter(s=>s.name!=="Healthy").map(sc=>(
          <div key={sc.name} style={{marginBottom:8,background:"#13151f",borderRadius:6,padding:"8px 10px",border:`1px solid ${sc.color}30`}}>
            <div style={{fontWeight:700,fontSize:12,color:sc.color,marginBottom:3}}>{sc.name}</div>
            <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.5}}>{sc.fullDesc}</div>
            {sc.endOfRoundEffect&&<div style={{fontSize:10,color:"#ff4757",marginTop:2}}>🔄 {sc.endOfRoundEffect}</div>}
          </div>
        ))}
      </div>
    );
    case "weather_ref": return (
      <div style={{overflowY:"auto",height:"100%",padding:"8px 10px"}}>
        {WEATHER_DATA.map(w=>(
          <div key={w.name} style={{marginBottom:8,background:"#13151f",borderRadius:6,padding:"8px 10px",border:`1px solid ${w.color}30`}}>
            <div style={{fontWeight:700,fontSize:12,color:"#e8eaf0",marginBottom:3}}>{w.emoji?.split(" ")[0]} {w.name}</div>
            <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{w.description}</div>
            {w.endOfRoundDmg&&<div style={{fontSize:10,color:"#ff4757",marginTop:2}}>🔄 {w.endOfRoundDesc}</div>}
          </div>
        ))}
      </div>
    );
    case "catch_ref": return (
      <div style={{overflowY:"auto",height:"100%",padding:"10px 12px",fontSize:11}}>
        <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#e8eaf0",marginBottom:10}}>🎯 Catching Pokémon</div>
        <p style={{color:"#8b90a8",marginBottom:10}}>Roll DEX/STR + Throw, then roll Seal Potency.</p>
        {["Starter:3","Rookie:4","Standard:6","Advanced:8","Expert:9","Ace:10","Master:12","Champion:14"].map(r=>{
          const [rank,succ]=r.split(":");
          return <div key={rank} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}><span style={{color:"#8b90a8"}}>{rank}</span><span style={{color:"#ffd32a",fontWeight:700}}>{succ} succ</span></div>;
        })}
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginTop:10,marginBottom:4}}>Bonuses</div>
        {["Half HP:+1","1 HP:+2","Status Ailment:+1 each"].map(b=>{
          const [c,v]=b.split(":");
          return <div key={c} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}><span style={{color:"#8b90a8"}}>{c}</span><span style={{color:"#00d4aa",fontWeight:700}}>{v}</span></div>;
        })}
        <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginTop:10,marginBottom:4}}>Ball Seal Potency</div>
        {["Pokéball:4d","Great Ball:6d","Ultra Ball:8d"].map(b=>{
          const [c,v]=b.split(":");
          return <div key={c} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}><span style={{color:"#8b90a8"}}>{c}</span><span style={{color:"#ffd32a",fontWeight:700}}>{v}</span></div>;
        })}
      </div>
    );
    case "quick_roll": return (
      <div style={{padding:"10px 12px"}}>
        <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#e8eaf0",marginBottom:10}}>🎲 Quick Roller</div>
        {[1,2,3,4,5,6,8,10,12].map(n=><QuickRollRow key={n} n={n}/>)}
      </div>
    );
    case "rules": return (
      <div style={{overflowY:"auto",height:"100%",padding:"10px 12px",fontSize:11}}>
        {[
          ["🎲 Roll","Attribute + Skill. Each 4/5/6 = 1 success."],
          ["⚡ Actions","Up to 5/round. Action 1=1 succ needed, 2=2, 3=3, 4=4, 5=5."],
          ["💥 Physical Dmg","STR + Power − foe VIT. Min 1 die, min 1 damage."],
          ["💫 Special Dmg","SPC + Power − foe INS. Min 1 die, min 1 damage."],
          ["⭐ STAB","+1 die when move type = Pokémon type."],
          ["🔴 Super Effective","+2 dice to damage pool (needs 1+ succ to trigger)."],
          ["💢 Critical Hit","3+ extra succ over required → +2 dmg dice."],
          ["🩹 Pain >50% HP","No penalty. 26–50%: −1d. 1–25%: −2d. 0: Fainted."],
          ["💤 Status","See Status panel for individual effects."],
          ["⚠ Disobedience","Same/lower rank: obeys. 1 above: loyalty roll (3+). 2+: ignores."],
        ].map(([t,d])=>(
          <div key={t as string} style={{marginBottom:8}}>
            <div style={{fontWeight:700,color:"#e8eaf0"}}>{t}</div>
            <div style={{fontSize:10,color:"#8b90a8"}}>{d}</div>
          </div>
        ))}
      </div>
    );
    default: return <div style={{color:"#5a6080",padding:20}}>Unknown panel type</div>;
  }
}

function QuickRollRow({n}:{n:number}) {
  const [res,setRes]=useState<{rolls:number[];s:number}|null>(null);
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
      <button onClick={()=>{const r=rollDice(n);setRes({rolls:r.rolls,s:r.successes});}} style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:4,color:"#6890f0",padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Exo 2'",minWidth:36}}>{n}d</button>
      {res&&<span style={{fontSize:10,fontFamily:"'Exo 2'",color:"#e8eaf0"}}>[{res.rolls.join(",")}] <span style={{color:"#00d4aa",fontWeight:700}}>{res.s}✓</span></span>}
    </div>
  );
}

function TrackerSearch({onAdd}:{onAdd:(p:PokemonEntry)=>void}) {
  const [q,setQ]=useState("");
  const filtered=useMemo(()=>{
    if(!q)return [];
    const ql=q.toLowerCase();
    return POKEMON.filter(p=>p.name.toLowerCase().includes(ql)||String(p.number).includes(q)).slice(0,8);
  },[q]);
  return (
    <div style={{position:"relative"}}>
      <input type="text" placeholder="Search & add Pokémon…" value={q} onChange={e=>setQ(e.target.value)}
        style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:5,padding:"5px 8px",color:"#e8eaf0",fontSize:11,outline:"none"}}
        onFocus={e=>(e.target as HTMLInputElement).style.borderColor="#00d4aa"}
        onBlur={e=>(e.target as HTMLInputElement).style.borderColor="#2a2f45"}/>
      {filtered.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e2235",border:"1px solid #3a4060",borderRadius:5,zIndex:100,maxHeight:240,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
          <div onClick={()=>{onAdd(MISSINGNO);setQ("");}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",cursor:"pointer",borderBottom:"1px solid #2a2f45"}}
            onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#242842"}
            onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
            <span style={{fontSize:10,color:"#ffd32a",fontWeight:700}}>✦ Custom (Missingno.)</span>
          </div>
          {filtered.map(p=>(
            <div key={`${p.number}-${p.name}`} onClick={()=>{onAdd(p);setQ("");}} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer"}}
              onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#242842"}
              onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
              <span style={{fontSize:9,color:"#3a4060",width:26,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
              <span style={{fontSize:11,color:"#e8eaf0",flex:1}}>{p.name}</span>
              {p.types.map(t=><TypeBadge key={t} type={t as PokemonType} small/>)}
              <span style={{fontSize:9,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Panel Picker ────────────────────────────────────────────────────────────── */
function PanelPicker({onPick,onClose}:{onPick:(type:PanelType)=>void;onClose:()=>void;}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,padding:20,width:420,maxWidth:"95vw"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#a040a0",marginBottom:14}}>Choose a Panel</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {PANEL_CATALOG.map(p=>(
            <button key={p.type} onClick={()=>{onPick(p.type);onClose();}} style={{background:"#13151f",border:"1px solid #2a2f45",borderRadius:6,padding:"12px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#a040a0";(e.currentTarget as HTMLButtonElement).style.background="#1e2235";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2a2f45";(e.currentTarget as HTMLButtonElement).style.background="#13151f";}}>
              <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#e8eaf0",marginBottom:2}}>{p.label}</div>
              <div style={{fontSize:10,color:"#5a6080",lineHeight:1.3}}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main GM Screen ─────────────────────────────────────────────────────────── */
const DEFAULT_GRID:Panel[] = Array.from({length:12},(_,i)=>({id:`empty-${i}`,type:"tracker" as PanelType})).map((p,i)=>({...p,id:`slot-${i}`}));

export default function GMScreen() {
  const [entries,setEntries]=useState<BattleEntry[]>(()=>loadFromStorage("bt_entries",[]));
  const [weather,setWeather]=useState<WeatherData>(WEATHER_DATA[0]);
  const [turn,setTurn]=useState(0);
  const [round,setRound]=useState(1);
  const [gmNotes,setGmNotes]=useState(()=>loadFromStorage("gm_notes",""));
  // 4x3 grid of optional panels (null = empty slot)
  const [grid,setGrid]=useState<(Panel|null)[]>(()=>loadFromStorage("gm_grid",Array(12).fill(null)));
  const [pickerSlot,setPickerSlot]=useState<number|null>(null);
  const [showEOR,setShowEOR]=useState(false);
  const [showPriority,setShowPriority]=useState(false);

  useEffect(()=>{saveToStorage("bt_entries",entries);},[entries]);
  useEffect(()=>{saveToStorage("gm_notes",gmNotes);},[gmNotes]);
  useEffect(()=>{saveToStorage("gm_grid",grid);},[grid]);

  // Load pokemon queued from encounter generator page
  useEffect(()=>{
    const queue=loadFromStorage<number[]>("encounter_queue",[]);
    if(queue.length>0){
      saveToStorage("encounter_queue",[]);
      queue.forEach(num=>{
        const p=POKEMON.find(x=>x.number===num);
        if(p)addPokemon(p);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Resolve trainer links for pokemon added from characters panel
  useEffect(()=>{
    const pending=loadFromStorage<{pokemonNumber:number;pokemonName:string;trainerId:string;nickname:string}|null>("pending_link",null);
    if(pending){
      saveToStorage("pending_link",null);
      setEntries(prev=>{
        const idx=prev.findLastIndex(e=>e.pokemon.number===pending.pokemonNumber);
        if(idx<0)return prev;
        const updated=[...prev];
        updated[idx]={...updated[idx],linkedTrainerId:pending.trainerId,side:"player",nickname:pending.nickname||updated[idx].nickname};
        return updated;
      });
    }
  },[entries.length]); // run when entries change (new one added)

  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry=sorted[turn%Math.max(1,sorted.length)];

  const addPokemon=useCallback((pokemon:PokemonEntry)=>{
    const hp=pokemon.number===0?10:pokemon.baseHp+pokemon.attributes.vitality;
    const will=pokemon.number===0?5:pokemon.attributes.insight+3;
    const ini=Math.floor(Math.random()*6)+1+(pokemon.attributes?.dexterity??1);
    setEntries(prev=>[...prev,{
      id:`${pokemon.number}-${Date.now()}`,pokemon,nickname:pokemon.number===0?"Custom":"",
      initiative:ini,currentHp:hp,maxHp:hp,currentWill:will,maxWill:will,
      status:"Healthy",statusTurnsLeft:0,notes:"",isExpanded:false,hasTakenTurn:false,
      side:"enemy",trainerRank:"Rookie",
      abilities:pokemon.abilities.map(a=>({name:a,active:true})),
      moves:pokemon.moves.slice(0,4).map(m=>MOVES.find(mv=>mv.name===m.name)||{name:m.name,type:m.type,category:"Physical" as const,power:"-",accuracy:"-",damagePool:"-",effect:"",description:""} as Move),
      attrs:{...pokemon.attributes},statMods:[],weatherImmune:false,actionCount:0,
    }]);
  },[]);

  const nextTurn=()=>{
    if(activeEntry)setEntries(prev=>prev.map(e=>e.id===activeEntry.id?{...e,hasTakenTurn:true,actionCount:0}:e));
    const next=(turn+1)%Math.max(1,sorted.length);
    if(next===0){
      setRound(r=>r+1);
      setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false,actionCount:0})));
      setShowEOR(true);
      // Check for priority moves on next round start
      const hasPriority=entries.some(e=>e.currentHp>0&&e.pokemon.moves.some(m=>(m.priority??0)>0));
      if(hasPriority)setTimeout(()=>setShowPriority(true),300);
    }
    setTurn(next);
  };

  const applyEOR=(id:string,hpChange:number)=>{
    setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp+hpChange)}:e));
  };

  const rollAllInitiative=()=>{
    setEntries(prev=>prev.map(e=>({...e,initiative:Math.floor(Math.random()*6)+1+(e.attrs?.dexterity??1)})));
    setTurn(0);
  };

  const setPanel=(slot:number,type:PanelType)=>{
    setGrid(prev=>{const n=[...prev];n[slot]={id:`panel-${slot}-${Date.now()}`,type};return n;});
  };
  const clearPanel=(slot:number)=>{
    setGrid(prev=>{const n=[...prev];n[slot]=null;return n;});
  };

  const hasPanels=grid.some(p=>p!==null);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",overflow:"hidden"}}>
      {pickerSlot!==null&&<PanelPicker onPick={(type)=>setPanel(pickerSlot,type)} onClose={()=>setPickerSlot(null)}/>}
      {showEOR&&<EndOfRoundPopup entries={entries} weather={weather} round={round} onApply={applyEOR} onClose={()=>setShowEOR(false)}/>}
      {showPriority&&<PriorityPhasePopup entries={entries} weather={weather} onClose={()=>setShowPriority(false)}/>}

      {/* Nav */}
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 12px",height:48,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#a040a0",fontWeight:700}}>🖥️ GM Screen</span>
        <span style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>Build a personalised GM screen.</span>

        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          <select value={weather.name} onChange={e=>setWeather(WEATHER_DATA.find(w=>w.name===e.target.value)!)}
            style={{background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#ffd32a",fontSize:11,padding:"3px 6px"}}>
            {WEATHER_DATA.map(w=><option key={w.name} value={w.name}>{w.emoji?.split(" ")[0]} {w.name}</option>)}
          </select>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:5,padding:"3px 10px"}}>
            <span style={{fontSize:10,color:"#5a6080"}}>Round</span>
            <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0"}}>{round}</span>
            <span style={{fontSize:10,color:"#5a6080"}}>·</span>
            <span style={{fontSize:10,color:activeEntry?{player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[activeEntry.side]:"#5a6080",fontWeight:600}}>
              {activeEntry?.nickname||activeEntry?.pokemon.name||"No combatants"}
            </span>
          </div>
          <button onClick={nextTurn} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:"5px 12px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Next Turn ▶</button>
          <button onClick={rollAllInitiative} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Initiative</button>
          <button onClick={()=>setGrid(Array(12).fill(null))} style={{background:"rgba(160,64,160,0.1)",border:"1px solid rgba(160,64,160,0.3)",borderRadius:4,color:"#a040a0",padding:"4px 8px",fontSize:11,cursor:"pointer"}} title="Clear all panels">✕ Clear</button>
        </div>
      </nav>

      {/* Weather banner */}
      {weather.name!=="Clear"&&(
        <div style={{background:weather.color+"12",borderBottom:`1px solid ${weather.color}25`,padding:"4px 16px",display:"flex",alignItems:"center",gap:8,fontSize:11,flexShrink:0}}>
          <span>{weather.emoji?.split(" ")[0]}</span>
          <span style={{fontWeight:700,color:"#e8eaf0"}}>{weather.name}</span>
          <span style={{color:"#8b90a8"}}>{weather.description}</span>
          {weather.endOfRoundDmg&&<span style={{color:"#ff4757",marginLeft:"auto"}}>🔄 End-of-round chip damage active</span>}
        </div>
      )}

      {/* 4x3 Panel Grid */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gridTemplateRows:"repeat(3,1fr)",gap:2,padding:2,overflow:"hidden",background:"#0a0c14"}}>
        {grid.map((panel,i)=>(
          <div key={i} style={{background:"#13151f",border:"1px solid #1a1d27",borderRadius:4,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            {panel===null?(
              /* Empty slot */
              <button onClick={()=>setPickerSlot(i)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:"#2a2f45",transition:"all 0.15s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.color="#a040a0";(e.currentTarget as HTMLButtonElement).style.borderColor="#a040a040";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.color="#2a2f45";}}>
                <div style={{width:36,height:36,border:"2px solid currentColor",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>+</div>
                <span style={{fontSize:11}}>Add Panel</span>
              </button>
            ):(
              <>
                {/* Panel header */}
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"#0f1117",borderBottom:"1px solid #1a1d27",flexShrink:0}}>
                  <span style={{fontSize:12}}>{PANEL_CATALOG.find(p=>p.type===panel.type)?.icon}</span>
                  <span style={{fontSize:11,fontWeight:600,color:"#8b90a8",flex:1}}>{PANEL_CATALOG.find(p=>p.type===panel.type)?.label}</span>
                  <PopoutButton title={PANEL_CATALOG.find(p=>p.type===panel.type)?.label||"Panel"}><span/></PopoutButton>
                  <button onClick={()=>setPickerSlot(i)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:11,padding:"0 2px"}} title="Change panel">⇄</button>
                  <button onClick={()=>clearPanel(i)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12}} title="Remove panel">✕</button>
                </div>
                {/* Panel content */}
                <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  <PanelContent panel={panel} entries={entries} setEntries={setEntries} weather={weather} turn={turn} onAddToTracker={addPokemon} gmNotes={gmNotes} setGmNotes={setGmNotes}/>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

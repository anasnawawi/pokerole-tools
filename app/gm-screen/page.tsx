"use client";
import { useState, useMemo, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART, MISSINGNO, HABITATS,
  PokemonEntry, Move, PokemonType, Rank, HabitatData,
} from "../data/pokerole-data";
import {
  STATUS_CONDITIONS, WEATHER_DATA, WeatherData,
  RANK_ORDER, getDisobedienceLevel, getPainPenalty,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";
import PokedexFrame from "../components/PokedexFrame";
import { GenderIcon } from "../components/GenderIcon";

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
  loyalty?:number; happiness?:number;
  status:string; statuses?:string[]; statusTurnsLeft:number;
  notes:string; isExpanded:boolean; hasTakenTurn:boolean;
  side:"player"|"enemy"|"neutral"; trainerRank:Rank;
  abilities:AbilityState[]; moves:Move[];
  attrs:AttrSet; statMods:StatMod[];
  weatherImmune:boolean; actionCount:number;
  reactionUsed?:boolean; isProtected?:boolean;
  linkedTrainerId?:string;
}
type PanelType = "tracker"|"notes"|"weather_ref"|"status_ref"|"type_chart"|"catch_ref"|"quick_roll"|"encounter"|"rules"|"characters";
/* A panel holds one or more tabs; `active` indexes into `tabs`. */
interface Panel {id:string;tabs:PanelType[];active:number;colSpan?:number;rowSpan?:number;}

/* ─── Grid geometry ──────────────────────────────────────────────────────────── */
const MIN_COLS=1, MAX_COLS=8, MIN_ROWS=1, MAX_ROWS=6;
const DEFAULT_COLS=4, DEFAULT_ROWS=3;
const clampDim=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,Math.round(n)||lo));

/* Older saves stored a single `type` per panel; fold it into the tabs array. */
type StoredPanel = Partial<Panel> & {type?:PanelType};
function migratePanel(p:StoredPanel|null):Panel|null{
  if(!p)return null;
  const tabs = p.tabs?.length ? p.tabs : (p.type ? [p.type] : []);
  if(!tabs.length)return null;
  return {
    id: p.id ?? `panel-${Math.random().toString(36).slice(2)}`,
    tabs,
    active: Math.min(p.active ?? 0, tabs.length-1),
    colSpan: p.colSpan, rowSpan: p.rowSpan,
  };
}

/* Re-flow a flat slot array when the grid dimensions change, keeping each panel
   at its old column/row where that cell still exists and clamping its spans. */
function reflowGrid(grid:(Panel|null)[],oldCols:number,newCols:number,newRows:number):(Panel|null)[]{
  const next:(Panel|null)[]=Array(newCols*newRows).fill(null);
  grid.forEach((panel,i)=>{
    if(!panel)return;
    const col=i%oldCols, row=Math.floor(i/oldCols);
    if(col>=newCols||row>=newRows)return; // cell fell outside the new grid
    next[row*newCols+col]={
      ...panel,
      colSpan:Math.max(1,Math.min(newCols-col,panel.colSpan??1)),
      rowSpan:Math.max(1,Math.min(newRows-row,panel.rowSpan??1)),
    };
  });
  return next;
}

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

/* One-click starter layouts offered while the grid is still empty. */
const GM_PRESETS:{name:string;icon:string;desc:string;panels:PanelType[]}[] = [
  {name:"Running Combat",icon:"⚔️",desc:"Tracker, matchups, statuses & dice",panels:["tracker","type_chart","status_ref","quick_roll"]},
  {name:"Full Reference",icon:"📚",desc:"Every rules lookup at a glance",panels:["type_chart","status_ref","weather_ref","catch_ref","rules","quick_roll"]},
  {name:"Exploration",icon:"🌿",desc:"Encounters, party & session notes",panels:["encounter","characters","notes","quick_roll"]},
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
  const c=pct>0.5?"#2850A0":pct>0.25?"#A07000":"#C02820";
  return <div style={{background:"#35785F",borderRadius:3,height:5,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:c,transition:"width 0.3s"}}/></div>;
}
const adjBtn:React.CSSProperties={width:20,height:20,background:"#2E6B58",border:"1px solid #7888A8",borderRadius:3,color:"#2850A0",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"};
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
  if(immune)return{label:"Immune — no effect",color:"#585858",dmgMod:-999};
  if(weak)return{label:"Super Effective! ×2",color:"#C02820",dmgMod:2};
  if(resist)return{label:"Not very effective ×0.5",color:"#2850A0",dmgMod:-1};
  return{label:"Normal effectiveness",color:"#383838",dmgMod:0};
}

/* ─── Clash Section ──────────────────────────────────────────────────────────── */
// Clash (Priority 6) = the target picks one of their own moves to counter with.
// Both roll their chosen move's accuracy simultaneously; highest successes wins.
// Winner deals damage to loser. Ties = no damage.
function ClashSection({attacker,targets,allEntries,move,attrs,weather,stab,totalAbilBonus,onApplyDmg}:{
  attacker:BattleEntry;targets:string[];allEntries:BattleEntry[];move:Move;
  attrs:AttrSet;weather:WeatherData;stab:boolean;totalAbilBonus:number;
  onApplyDmg:(targetId:string,dmg:number)=>void;
}) {
  const [atkRoll,setAtkRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [defResults,setDefResults]=useState<Record<string,{move:Move;roll:{rolls:number[];successes:number}|null}>>({});
  const [clashResult,setClashResult]=useState<string>("");

  const doAtkRoll=()=>{
    const pool=calcAccPool(move,attrs,attacker.actionCount);
    setAtkRoll(rollDice(pool));
  };
  const doDefRoll=(tid:string,defMove:Move)=>{
    const target=allEntries.find(e=>e.id===tid);
    if(!target)return;
    const defAttrs=getEffectiveAttrs(target);
    const pool=calcAccPool(defMove,defAttrs,target.actionCount);
    const roll=rollDice(pool);
    setDefResults(prev=>({...prev,[tid]:{move:defMove,roll}}));
  };
  const resolveClash=()=>{
    if(!atkRoll)return;
    const lines:string[]=[];
    targets.forEach(tid=>{
      const target=allEntries.find(e=>e.id===tid);const dr=defResults[tid];
      if(!target||!dr?.roll)return;
      const atkSucc=atkRoll.successes;const defSucc=dr.roll.successes;
      if(atkSucc>defSucc){
        // Attacker wins — deal damage
        const dmgPool=calcDmgPool(move,attrs,weather,stab,totalAbilBonus);
        const dmgRoll=rollDice(dmgPool);
        const def=move.category==="Physical"?target.attrs.vitality:target.attrs.insight;
        const finalDmg=Math.max(1,dmgRoll.successes-def);
        onApplyDmg(tid,finalDmg);
        lines.push(`${attacker.nickname||attacker.pokemon.name} wins vs ${target.nickname||target.pokemon.name}! (${atkSucc} vs ${defSucc}) — ${finalDmg} damage applied`);
      } else if(defSucc>atkSucc){
        // Defender wins — deal damage back to attacker
        const defMove=dr.move;
        const defAttrs=getEffectiveAttrs(target);
        const dmgPool=calcDmgPool(defMove,defAttrs,weather,target.pokemon.types.includes(defMove.type as PokemonType),0);
        const dmgRoll=rollDice(dmgPool);
        const def=defMove.category==="Physical"?attacker.attrs.vitality:attacker.attrs.insight;
        const finalDmg=Math.max(1,dmgRoll.successes-def);
        onApplyDmg(attacker.id,finalDmg);
        lines.push(`${target.nickname||target.pokemon.name} wins Clash! (${defSucc} vs ${atkSucc}) — ${finalDmg} damage dealt to ${attacker.nickname||attacker.pokemon.name}`);
      } else {
        lines.push(`Tie! (${atkSucc} vs ${defSucc}) — no damage`);
      }
    });
    setClashResult(lines.join("\n"));
  };

  return (
    <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #2850A030",borderRadius:6,padding:"10px 12px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#2850A0",marginBottom:8}}>⚡ Clash Resolution (Priority 6)</div>
      <div style={{fontSize:10,color:"#383838",marginBottom:10,lineHeight:1.5}}>Both sides roll their chosen move's accuracy. Highest successes wins. Winner deals full damage. Tie = no damage.</div>

      {/* Attacker roll */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:"#585858",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Attacker: {attacker.nickname||attacker.pokemon.name} — {move.name}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={doAtkRoll} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll ({calcAccPool(move,attrs,attacker.actionCount)}d)</button>
          {atkRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{atkRoll.rolls.join(",")}] = {atkRoll.successes} hits</span>}
        </div>
      </div>

      {/* Defender move picks + rolls */}
      {targets.map(tid=>{
        const target=allEntries.find(e=>e.id===tid);
        if(!target)return null;
        const dr=defResults[tid];
        return (
          <div key={tid} style={{marginBottom:8,background:"#F8F4D0",borderRadius:5,padding:"8px 10px"}}>
            <div style={{fontSize:10,color:"#585858",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}}>Defender: {target.nickname||target.pokemon.name} — pick their counter move</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
              {target.moves.map((m,i)=>(
                <button key={i} onClick={()=>doDefRoll(tid,m)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:4,border:`1px solid ${dr?.move.name===m.name?"#C02820":"#7888A8"}`,background:dr?.move.name===m.name?"rgba(255,71,87,0.15)":"#FBF8E4",cursor:"pointer",fontSize:10}}>
                  <span style={{display:"inline-flex",padding:"0 4px",borderRadius:2,fontSize:8,fontWeight:700,color:"#fff",background:TYPE_COLORS[m.type as PokemonType]}}>{m.type}</span>
                  {m.name}
                </button>
              ))}
              {target.moves.length===0&&<span style={{fontSize:10,color:"#585858",fontStyle:"italic"}}>No moves in tracker</span>}
            </div>
            {dr?.roll&&<div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#C02820"}}>{target.nickname||target.pokemon.name}: [{dr.roll.rolls.join(",")}] = {dr.roll.successes} hits with {dr.move.name}</div>}
          </div>
        );
      })}

      {/* Resolve */}
      {atkRoll&&Object.keys(defResults).length>0&&(
        <button onClick={resolveClash} style={{width:"100%",background:"#2850A0",color:"#FFFFFF",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>⚡ Resolve Clash & Apply Damage</button>
      )}
      {clashResult&&(
        <div style={{marginTop:8,background:"#F8F4D0",borderRadius:4,padding:"8px 10px",fontSize:11,color:"#202020",lineHeight:1.5,whiteSpace:"pre-line"}}>{clashResult}</div>
      )}
    </div>
  );
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

  const attrs=getEffectiveAttrs(attacker); // already applies Growl/stat mods + status penalties
  const stab=attacker.pokemon.types.includes(move.type as PokemonType); // STAB if type matches
  const actReq=[1,2,3,4,5][Math.min(attacker.actionCount,4)];
  const sc=STATUS_CONDITIONS[attacker.status];
  const disobedience=getDisobedienceLevel(attacker.pokemon.suggestedRank,attacker.trainerRank);
  const isMultiTarget=move.effect.toLowerCase().includes("all")&&!move.effect.toLowerCase().includes("single");
  const isClash=move.name==="Clash"||(move.priority??0)>=6;
  const otherEntries=allEntries.filter(e=>e.id!==attacker.id&&e.currentHp>0);

  // Calculate all ability bonuses
  const abilityMods=calcAbilityBonus(attacker,move,weather);
  const totalAbilBonus=abilityMods.bonus;

  // Pool breakdown for display
  const accPool=calcAccPool(move,attrs,attacker.actionCount);
  const accBreakdown=(()=>{
    const acc=move.accuracy.toLowerCase();
    const parts:string[]=[];
    if(acc.includes("strength"))parts.push(`STR ${attrs.strength}`);
    if(acc.includes("dexterity"))parts.push(`DEX ${attrs.dexterity}`);
    if(acc.includes("special"))parts.push(`SPC ${attrs.special}`);
    if(acc.includes("insight"))parts.push(`INS ${attrs.insight}`);
    const skillBonus=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
    const skillName=acc.includes("brawl")?"Brawl":acc.includes("athletic")?"Athletic":acc.includes("channel")?"Channel":acc.includes("perform")?"Perform":acc.includes("clash")?"Clash":"Skill";
    parts.push(`${skillName} ${skillBonus}`);
    // Show any stat mods affecting accuracy
    const strMod=attacker.statMods.filter(m=>m.attr==="strength").reduce((s,m)=>s+m.amount,0);
    const dexMod=attacker.statMods.filter(m=>m.attr==="dexterity").reduce((s,m)=>s+m.amount,0);
    if(strMod!==0&&acc.includes("strength"))parts.push(`Mod ${strMod>0?"+":""}${strMod}`);
    if(dexMod!==0&&acc.includes("dexterity"))parts.push(`Mod ${dexMod>0?"+":""}${dexMod}`);
    const statusPen=STATUS_CONDITIONS[attacker.status]?.accuracyPenalty??0;
    if(statusPen>0)parts.push(`${attacker.status} −${statusPen}`);
    return parts.join(" + ");
  })();

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
  // accPool already defined above in accBreakdown section

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,width:500,maxWidth:"95vw",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",gap:8}}>
          <TypeBadge type={move.type as PokemonType}/>
          <span style={{fontSize:11,fontWeight:700,color:move.category==="Physical"?"#f08030":move.category==="Special"?"#6890f0":"#78c850",background:move.category==="Physical"?"rgba(240,128,48,0.15)":move.category==="Special"?"rgba(104,144,240,0.15)":"rgba(120,200,80,0.15)",padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          {stab&&<span style={{fontSize:9,fontWeight:700,color:"#A07000",background:"rgba(255,211,42,0.12)",padding:"1px 5px",borderRadius:3}}>STAB +1</span>}
          {(move.priority??0)>0&&<span style={{fontSize:9,fontWeight:700,color:"#2850A0",background:"rgba(0,212,170,0.12)",padding:"1px 5px",borderRadius:3}}>PRIORITY {move.priority}</span>}
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#202020",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
          <p style={{fontSize:12,color:"#383838",lineHeight:1.5,margin:0}}>{move.description}</p>
          <div style={{background:"#F8F4D0",borderRadius:5,padding:"7px 10px",fontSize:11,color:"#202020"}}><strong style={{color:"#585858"}}>Effect: </strong>{move.effect}</div>

          {/* Action count penalty */}
          {attacker.actionCount>0&&(
            <div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#C02820"}}>
              Action #{attacker.actionCount+1} this round — needs {actReq} success{actReq>1?"es":""} to hit
            </div>
          )}

          {/* Disobedience */}
          {disobedience!=="none"&&(
            <div style={{background:disobedience==="high"?"rgba(255,71,87,0.1)":"rgba(255,211,42,0.08)",border:`1px solid ${disobedience==="high"?"#C0282040":"#A0700040"}`,borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontWeight:700,color:disobedience==="high"?"#C02820":"#A07000",marginBottom:4,fontSize:11}}>
                {disobedience==="high"?"🔴 High Disobedience — Pokémon ignores commands":"⚠ Low Disobedience — Loyalty check required"}
              </div>
              {disobedience==="low"&&(
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setLoyaltyRoll(rollDice(3))} style={{background:"rgba(255,211,42,0.15)",border:"1px solid #A0700040",borderRadius:4,color:"#A07000",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Loyalty (3+)</button>
                  {loyaltyRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:loyaltyRoll.successes>=3?"#2850A0":"#C02820"}}>[{loyaltyRoll.rolls.join(",")}]={loyaltyRoll.successes} {loyaltyRoll.successes>=3?"✓":"✗"}</span>}
                </div>
              )}
            </div>
          )}

          {/* Status pre-check */}
          {(STATUS_CONDITIONS[attacker.status]?.requiresRollToAct||attacker.status==="Flinched")&&(
            <div style={{background:"rgba(168,64,160,0.1)",border:"1px solid #a040a040",borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:700,color:STATUS_CONDITIONS[attacker.status]?.color,marginBottom:4}}>{attacker.status}: {STATUS_CONDITIONS[attacker.status]?.shortDesc}</div>
              <div style={{fontSize:10,color:"#383838",marginBottom:6}}>{STATUS_CONDITIONS[attacker.status]?.rollToActDesc}</div>
              {!preRollDone&&attacker.status!=="Flinched"&&(
                <button onClick={doPreRoll} style={{background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Pre-Action Check</button>
              )}
              {preRollDone&&<div style={{fontSize:12,fontWeight:700,color:preRollDone.canAct?"#2850A0":"#C02820"}}>{preRollDone.detail}</div>}
            </div>
          )}

          {/* Ability modifiers */}
          {(abilityMods.bonus>0||abilityMods.reasons.length>0)&&(
            <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #2850A020",borderRadius:5,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:"#2850A0",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Active Ability Modifiers</div>
              {abilityMods.reasons.map((r,i)=>(
                <div key={i} style={{fontSize:10,color:"#383838",marginBottom:2}}>✦ {r}</div>
              ))}
              {abilityMods.bonus>0&&<div style={{fontSize:11,color:"#2850A0",fontWeight:700,marginTop:4}}>+{abilityMods.bonus} dice to damage pool</div>}
            </div>
          )}

          {/* Target selector */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>{isMultiTarget?"Select Targets (multi)":"Select Target"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {otherEntries.map(t=>(
                  <button key={t.id} onClick={()=>toggleTarget(t.id)} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#7888A8"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#202020":"#383838"}}>
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
                <div style={{fontSize:10,color:"#383838",marginTop:2}}>DEF: {def} ({move.category==="Physical"?"VIT":"INS"})</div>
              </div>
            );
          })}

          {/* Accuracy roll */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>1. Accuracy — {move.accuracy} · Need {actReq}+ to hit</div>
              <div style={{fontSize:10,color:"#585858",marginBottom:6,fontStyle:"italic"}}>Pool: {accBreakdown} = <strong style={{color:"#6890f0"}}>{accPool}d</strong>{stab?" + STAB (on damage)":""}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={doAccuracy} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Accuracy ({accPool}d)</button>
                {accResult&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:accResult.successes>=actReq?"#2850A0":"#C02820"}}>[{accResult.rolls.join(",")}]={accResult.successes} {accResult.successes>=actReq?"✓ HIT":"✗ MISS"}</span>}
              </div>
            </div>
          )}

          {/* Clash mechanics — when a target tries to counter */}
          {canAct&&isClash&&targets.length>0&&(
            <ClashSection attacker={attacker} targets={targets} allEntries={allEntries} move={move} attrs={attrs} weather={weather} stab={stab} totalAbilBonus={totalAbilBonus} onApplyDmg={onApplyDmg}/>
          )}

          {/* Damage per target */}
          {canAct&&accResult&&accResult.successes>=actReq&&move.category!=="Support"&&!isClash&&targets.map(tid=>{
            const t=allEntries.find(e=>e.id===tid);
            if(!t)return null;
            const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);
            const pool=calcDmgPool(move,attrs,weather,stab,totalAbilBonus);
            const dr=dmgResults[tid];
            const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
            const finalDmg=dr?Math.max(1,(tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes)-def):null;
            const wasApplied=applied.has(tid);
            return (
              <div key={tid} style={{background:"#F8F4D0",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>2. Damage → {t.nickname||t.pokemon.name} ({pool}d base)</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
                  <button onClick={()=>doDmgForTarget(tid)} disabled={!!dr} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:dr?"#585858":"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:dr?"default":"pointer"}}>🎲 Roll Damage ({pool}d)</button>
                  {dr&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{dr.rolls.join(",")}]={dr.successes} succ</span>}
                </div>
                {dr&&tm.dmgMod!==-999&&(
                  <div>
                    <div style={{fontSize:11,color:"#383838",marginBottom:6}}>
                      {dr.successes} succ{tm.dmgMod===2?" ×2 SE":tm.dmgMod===-1?" ×0.5 NVE":""} = {tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes} − {def} DEF = <strong style={{color:"#C02820"}}>{finalDmg} damage</strong>
                    </div>
                    {!wasApplied&&<button onClick={()=>applyDmgToTarget(tid)} style={{width:"100%",background:"#C02820",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>⚔ Apply {finalDmg} damage to {t.nickname||t.pokemon.name}</button>}
                    {wasApplied&&<div style={{textAlign:"center",color:"#2850A0",fontWeight:700,fontSize:12}}>✓ Damage applied!</div>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Stat effects */}
          {canAct&&accResult&&accResult.successes>=actReq&&statEffects.length>0&&targets.length>0&&(
            <div style={{background:"#F8F4D0",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Stat Changes (on hit)</div>
              {statEffects.map((se,i)=>targets.map(tid=>{
                const t=allEntries.find(e=>e.id===tid);
                return (
                  <button key={`${i}-${tid}`} onClick={()=>{onApplyEffect(tid,se.attr,se.amount,`${move.name}`);}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",background:se.amount<0?"rgba(255,71,87,0.1)":"rgba(0,212,170,0.1)",border:`1px solid ${se.amount<0?"#C0282030":"#2850A030"}`,color:se.amount<0?"#C02820":"#2850A0",fontSize:11,fontWeight:700,width:"100%",marginBottom:3}}>
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
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,width:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#A07000",margin:0}}>🔄 End of Round {round}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto"}}>
          {effects.length===0?(
            <div style={{color:"#585858",textAlign:"center",padding:20}}>No end-of-round effects this round.</div>
          ):effects.map((ef,i)=>(
            <div key={i} style={{background:"#F8F4D0",borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#202020"}}>{ef.entry.nickname||ef.entry.pokemon.name}</div>
                <div style={{fontSize:11,color:"#383838",marginTop:2}}>{ef.desc}</div>
              </div>
              <button onClick={()=>onApply(ef.entry.id,ef.hpChange,ef.desc)} style={{background:"#C0282020",border:"1px solid #C0282040",borderRadius:4,color:"#C02820",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                Apply {ef.hpChange} HP
              </button>
            </div>
          ))}
          {effects.length>0&&(
            <button onClick={()=>{effects.forEach(ef=>onApply(ef.entry.id,ef.hpChange,ef.desc));onClose();}} style={{width:"100%",background:"#C02820",color:"#fff",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:8}}>Apply All & Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Priority Phase Popup ───────────────────────────────────────────────────── */
function PriorityPhasePopup({entries,weather,onClose}:{entries:BattleEntry[];weather:WeatherData;onClose:()=>void;}) {
  const priorityEntries=useMemo(()=>{
    const result:{entry:BattleEntry;move:Move}[]=[];
    entries.filter(e=>e.currentHp>0).forEach(e=>{
      // Check the entry's tracker moves (e.moves), NOT the pokedex moves (e.pokemon.moves)
      const priMoves=e.moves.filter(m=>(m.priority??0)>0);
      if(priMoves.length>0){
        const best=priMoves.sort((a,b)=>(b.priority??0)-(a.priority??0))[0];
        result.push({entry:e,move:best});
      }
    });
    return result.sort((a,b)=>(b.move.priority??0)-(a.move.priority??0));
  },[entries]);
  // Also check: if nextTurn fires with next===0 but the setTimeout races with state update,
  // the popup never fires. Make popup also triggerable via a separate button in tracker UI.

  if(priorityEntries.length===0){onClose();return null;}

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#FBF8E4",border:"1px solid #2850A040",borderRadius:10,width:460,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#2850A0",margin:0}}>⚡ Priority Phase — Declare before normal turns</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto"}}>
          <p style={{fontSize:12,color:"#383838",marginBottom:12,lineHeight:1.5}}>These Pokémon have Priority Reaction moves available. Declare usage now (highest priority first). Declared moves count as their first action.</p>
          {priorityEntries.map(({entry,move})=>(
            <div key={entry.id} style={{background:"#F8F4D0",border:`1px solid ${TYPE_COLORS[move.type as PokemonType]||"#2850A0"}30`,borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#202020"}}>{entry.nickname||entry.pokemon.name}</div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:3}}>
                  <TypeBadge type={move.type as PokemonType} small/>
                  <span style={{fontSize:11,color:"#202020"}}>{move.name}</span>
                  <span style={{fontSize:10,fontWeight:700,color:"#2850A0"}}>Priority {move.priority}</span>
                </div>
              </div>
              <span style={{fontSize:11,color:entry.currentHp/entry.maxHp>0.5?"#2850A0":entry.currentHp/entry.maxHp>0.25?"#A07000":"#C02820"}}>{entry.currentHp}/{entry.maxHp} HP</span>
            </div>
          ))}
          <button onClick={onClose} style={{width:"100%",background:"#2850A0",color:"#FFFFFF",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>Continue to Normal Turn Order</button>
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
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,width:440,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#A07000",margin:0}}>🎯 Capture Attempt — {target.nickname||target.pokemon.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          {/* Status */}
          <div style={{background:"#F8F4D0",borderRadius:6,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#202020",marginBottom:6}}>Target Condition</div>
            <div style={{display:"flex",gap:12,fontSize:11,flexWrap:"wrap"}}>
              <span style={{color:"#585858"}}>Rank: <strong style={{color:"#A07000"}}>{target.pokemon.suggestedRank}</strong></span>
              <span style={{color:"#585858"}}>Needs: <strong style={{color:"#A07000"}}>{required} successes</strong></span>
              <span style={{color:"#585858"}}>HP: <strong style={{color:atOne?"#C02820":atHalf?"#A07000":"#2850A0"}}>{target.currentHp}/{target.maxHp}</strong></span>
              <span style={{color:"#585858"}}>Status: <strong style={{color:"#a040a0"}}>{target.status}</strong></span>
            </div>
          </div>
          {/* Bonuses */}
          <div style={{background:"rgba(0,212,170,0.08)",border:"1px solid #2850A030",borderRadius:6,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#2850A0",marginBottom:6}}>Bonus Successes: +{totalBonus}</div>
            {hpBonus>0&&<div style={{fontSize:10,color:"#383838"}}>HP condition (+{hpBonus}): {atOne?"At 1 HP (+2)":"At half HP (+1)"}</div>}
            {statusBonus>0&&<div style={{fontSize:10,color:"#383838"}}>Status ailment (+1): {target.status}</div>}
            {totalBonus===0&&<div style={{fontSize:10,color:"#585858"}}>No bonuses — weaken the target first!</div>}
          </div>
          {/* Ball selector */}
          <div>
            <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Select Pokéball</div>
            <div style={{display:"flex",gap:6}}>
              {(["Pokéball","Great Ball","Ultra Ball"] as const).map(b=>(
                <button key={b} onClick={()=>setBallType(b)} style={{flex:1,padding:"6px",borderRadius:5,border:`1px solid ${ballType===b?"#A07000":"#7888A8"}`,background:ballType===b?"rgba(255,211,42,0.15)":"transparent",color:ballType===b?"#A07000":"#383838",fontSize:11,fontWeight:ballType===b?700:400,cursor:"pointer"}}>
                  {b}<div style={{fontSize:10,color:"#585858"}}>{ballPotency[b]}d seal</div>
                </button>
              ))}
            </div>
          </div>
          {/* Step 1: Throw */}
          <div>
            <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Step 1 — Throw Ball: DEX/STR + Throw</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setThrowRoll(rollDice(4))} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Throw (4d)</button>
              {throwRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{throwRoll.rolls.join(",")}] = <span style={{color:"#2850A0"}}>{throwRoll.successes} hits</span></span>}
            </div>
          </div>
          {/* Step 2: Seal */}
          {throwRoll&&throwRoll.successes>0&&(
            <div>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Step 2 — Seal Potency ({ballPotency[ballType]}d)</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setSealRoll(rollDice(ballPotency[ballType]))} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:"#f08030",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Seal ({ballPotency[ballType]}d)</button>
                {sealRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{sealRoll.rolls.join(",")}] = <span style={{color:"#f08030"}}>{sealRoll.successes}</span></span>}
              </div>
            </div>
          )}
          {/* Result */}
          {throwRoll&&sealRoll&&(
            <div style={{background:caught?"rgba(0,212,170,0.15)":"rgba(255,71,87,0.15)",border:`1px solid ${caught?"#2850A0":"#C02820"}40`,borderRadius:6,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,fontFamily:"'Exo 2'",color:caught?"#2850A0":"#C02820",marginBottom:4}}>
                {caught?"✓ Caught!":"✗ Broke Free!"}
              </div>
              <div style={{fontSize:12,color:"#383838"}}>
                {throwRoll.successes} + {sealRoll.successes} + {totalBonus} bonus = <strong style={{color:caught?"#2850A0":"#C02820"}}>{totalSuccesses}</strong> / {required} needed
              </div>
              {!caught&&<div style={{fontSize:11,color:"#585858",marginTop:4}}>Need {required-totalSuccesses} more success{required-totalSuccesses!==1?"es":""}. Weaken further or use a better ball.</div>}
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
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"#585858",padding:20,textAlign:"center"}}>
      <div style={{fontSize:32}}>👤</div>
      <div style={{fontSize:12}}>No saved trainers yet.</div>
      <Link href="/characters" style={{color:"#2850A0",fontSize:11,textDecoration:"none"}}>→ Create characters</Link>
    </div>
  );

  return (
    <div style={{display:"flex",height:"100%",minHeight:0}}>
      {/* Trainer list */}
      <div style={{width:130,borderRight:"1px solid #2850A0",overflowY:"auto",flexShrink:0}}>
        {trainers.map(t=>(
          <div key={t.id} onClick={()=>setSelId(t.id)} style={{padding:"8px 10px",cursor:"pointer",background:selId===t.id?"#D8D8D8":"transparent",borderLeft:`2px solid ${selId===t.id?"#2850A0":"transparent"}`}}
            onMouseEnter={e=>{if(selId!==t.id)(e.currentTarget as HTMLDivElement).style.background="#FBF8E4";}}
            onMouseLeave={e=>{if(selId!==t.id)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
            <div style={{fontSize:12,fontWeight:700,color:"#202020",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name||"Unnamed"}</div>
            <div style={{fontSize:10,color:"#585858"}}>{t.rank}</div>
          </div>
        ))}
      </div>
      {/* Pokemon party */}
      <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
        {!sel&&<div style={{color:"#585858",fontSize:11,padding:12}}>Select a trainer</div>}
        {sel&&(
          <>
            <div style={{fontSize:11,color:"#383838",marginBottom:8,padding:"0 2px"}}>
              <strong style={{color:"#202020"}}>{sel.name}</strong> · {sel.rank} · HP {4+sel.attributes?.vitality} · WP {sel.attributes?.insight+3}
            </div>
            {/* Trainer themselves */}
            <div style={{background:"rgba(61,139,255,0.1)",border:"1px solid #2850A030",borderRadius:5,padding:"8px 10px",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#2850A0",marginBottom:4,display:"flex",alignItems:"center",gap:5}}>👤 Trainer: {sel.name} <GenderIcon gender={sel.gender}/></div>
              <div style={{fontSize:10,color:"#383838",marginBottom:6}}>STR {sel.attributes?.strength} DEX {sel.attributes?.dexterity} VIT {sel.attributes?.vitality} INS {sel.attributes?.insight}</div>
              <button onClick={()=>{
                // Add trainer as a special entry
                const fakePoke:PokemonEntry={number:-1,name:sel.name,types:["Normal" as PokemonType],height:"",weight:"",baseHp:4,
                  attributes:sel.attributes||{strength:1,dexterity:1,vitality:1,special:1,insight:1},
                  attributeLimits:{strength:5,dexterity:5,vitality:5,special:5,insight:5},
                  abilities:[],suggestedRank:"Rookie",evolutiveStage:"Final",description:"Trainer",
                  weaknesses:[],resistances:[],immunities:[],moves:[]};
                onAddToTracker(fakePoke);
              }} style={{background:"#2850A020",border:"1px solid #2850A040",borderRadius:4,color:"#2850A0",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
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
                <div key={key} style={{background:"#FBF8E4",border:`1px solid ${TYPE_COLORS[p.types[0]]}30`,borderRadius:5,padding:"8px 10px",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#202020"}}>{sheet.nickname||p.name}</span>
                    <GenderIcon gender={sheet.gender}/>
                    {sheet.nickname&&<span style={{fontSize:9,color:"#585858"}}>({p.name})</span>}
                    <span style={{display:"inline-flex",padding:"1px 5px",borderRadius:2,fontSize:8,fontWeight:700,color:"#fff",background:TYPE_COLORS[p.types[0]]}}>{p.types[0]}</span>
                    <span style={{marginLeft:"auto",fontSize:9,color:"#585858"}}>HP {p.baseHp+sheet.attributes?.vitality}</span>
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
                  }} style={{background:"#2850A020",border:"1px solid #2850A040",borderRadius:4,color:"#2850A0",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    ⚔️ Add to Battle
                  </button>
                </div>
              );
            })}
            {(!sel.pokemon||sel.pokemon.length===0)&&<div style={{fontSize:11,color:"#585858",fontStyle:"italic"}}>No Pokémon in party</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Trainer Skill Definitions ──────────────────────────────────────────────── */
const TRAINER_SKILLS: Record<string,{attr1:string;attr2?:string;skillKey:string;desc:string;combatEffect:string}> = {
  brawl:     {attr1:"strength",                skillKey:"brawl",     desc:"Melee combat and wrestling.",           combatEffect:"Roll STR + Brawl. Damage = successes − target VIT (physical def)."},
  channel:   {attr1:"special",                 skillKey:"channel",   desc:"Use devices, throw Pokéballs, channel energy.", combatEffect:"Roll SPC + Channel. Used for catching or technical actions."},
  clash:     {attr1:"strength",  attr2:"dexterity", skillKey:"clash", desc:"Reaction — intercept and counter an attack.", combatEffect:"Reaction 6. Roll STR/DEX + Clash. On success, negate the triggering attack and deal STR damage to attacker."},
  evasion:   {attr1:"dexterity",               skillKey:"evasion",   desc:"Dodge incoming attacks.",                combatEffect:"Reaction 6. Roll DEX + Evasion vs attacker accuracy to fully dodge."},
  alert:     {attr1:"insight",                 skillKey:"alert",     desc:"Detect hidden threats, avoid surprise.", combatEffect:"Roll INS + Alert vs foe's stealth pool to detect ambushes or hidden targets."},
  athletic:  {attr1:"strength",  attr2:"dexterity", skillKey:"athletic", desc:"Running, climbing, swimming.",        combatEffect:"Roll STR or DEX + Athletic for physically demanding actions in combat."},
  nature:    {attr1:"insight",                 skillKey:"nature",    desc:"Interact with wild Pokémon and environments.", combatEffect:"Roll INS + Nature to calm, read or influence Pokémon in or out of battle."},
  stealth:   {attr1:"dexterity",               skillKey:"stealth",   desc:"Move silently, hide or set ambushes.",  combatEffect:"Roll DEX + Stealth vs target Alert to set up a surprise action."},
  etiquette: {attr1:"insight",                 skillKey:"etiquette", desc:"Social protocol, persuasion.",           combatEffect:"Roll INS + Etiquette to negotiate, calm or de-escalate during confrontations."},
  intimidate:{attr1:"strength",                skillKey:"intimidate",desc:"Frighten or coerce others.",             combatEffect:"Roll STR + Intimidate. On 3+ successes, target gains Flinch or −1 to next roll."},
  perform:   {attr1:"special",                 skillKey:"perform",   desc:"Entertain, distract or dazzle.",         combatEffect:"Roll SPC + Perform. On success, distract a foe causing −2 dice on their next action."},
};

/* ─── Trainer Skill Popup ────────────────────────────────────────────────────── */
function TrainerSkillPopup({trainerData,trainerEntry,allEntries,onClose}:{
  trainerData:any; trainerEntry:BattleEntry; allEntries:BattleEntry[]; onClose:()=>void;
}) {
  const [selSkill,setSelSkill]=useState<string|null>(null);
  const [targets,setTargets]=useState<string[]>([]);
  const [rollResult,setRollResult]=useState<{rolls:number[];successes:number}|null>(null);
  const [brawlDmgRoll,setBrawlDmgRoll]=useState<{rolls:number[];successes:number}|null>(null);

  const attrs=trainerData?.attributes||{strength:1,dexterity:1,vitality:1,insight:1};
  const skills=trainerData?.skills||{};
  const actReq=[1,2,3,4,5][Math.min(trainerEntry.actionCount,4)];

  const skillDef=selSkill?TRAINER_SKILLS[selSkill]:null;
  const attrVal=(key:string)=>(attrs as any)[key]??1;
  const pool=skillDef?attrVal(skillDef.attr1)+(skills[selSkill!]||0):0;
  const others=allEntries.filter(e=>e.id!==trainerEntry.id&&e.currentHp>0);
  const combatSkills=["brawl","clash","evasion","intimidate","channel"];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#FBF8E4",border:"1px solid #2850A040",borderRadius:10,width:490,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2850A0",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>👤</span>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#2850A0",margin:0,flex:1}}>{trainerData?.name||"Trainer"} — Skill Action</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
          {/* Trainer stats */}
          <div style={{background:"#F8F4D0",borderRadius:6,padding:"10px 12px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[["STR","strength"],["DEX","dexterity"],["VIT","vitality"],["INS","insight"]].map(([l,k])=>(
              <div key={k} style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#585858"}}>{l}</div>
                <div style={{fontSize:16,fontFamily:"'Exo 2'",fontWeight:700,color:"#2850A0"}}>{attrVal(k)}</div>
              </div>
            ))}
          </div>
          {trainerEntry.actionCount>0&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#C02820"}}>Action #{trainerEntry.actionCount+1} — needs {actReq}+ to succeed</div>}

          {/* Skill grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {Object.entries(TRAINER_SKILLS).map(([skill,def])=>{
              const sv=skills[skill]||0; const av=attrVal(def.attr1);
              const active=selSkill===skill;
              return (
                <button key={skill} onClick={()=>{setSelSkill(skill);setRollResult(null);setTargets([]);setBrawlDmgRoll(null);}} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:5,cursor:"pointer",border:`1px solid ${active?"#2850A0":"#2850A0"}`,background:active?"rgba(61,139,255,0.12)":"#F8F4D0",textAlign:"left"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:active?"#2850A0":"#202020",textTransform:"capitalize"}}>{skill}</div>
                    <div style={{fontSize:9,color:"#585858"}}>{def.attr1.slice(0,3).toUpperCase()} {av} + {sv} = {av+sv}d</div>
                  </div>
                  <div style={{fontSize:14,fontFamily:"'Exo 2'",fontWeight:800,color:active?"#2850A0":"#585858"}}>{av+sv}</div>
                </button>
              );
            })}
          </div>

          {selSkill&&skillDef&&(
            <>
              <div style={{background:"#F8F4D0",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:12,color:"#202020",marginBottom:4}}>{skillDef.desc}</div>
                <div style={{fontSize:11,color:"#383838",lineHeight:1.5}}><strong style={{color:"#585858"}}>Combat: </strong>{skillDef.combatEffect}</div>
                <div style={{fontSize:11,color:"#2850A0",marginTop:5}}>Pool: {skillDef.attr1} ({attrVal(skillDef.attr1)}){skillDef.attr2?<span> or {skillDef.attr2} ({attrVal(skillDef.attr2)})</span>:null} + {selSkill} ({skills[selSkill]||0}) = <strong>{pool}d</strong></div>
              </div>

              {combatSkills.includes(selSkill)&&(
                <div>
                  <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Target</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {others.map(t=>(
                      <button key={t.id} onClick={()=>setTargets(prev=>prev.includes(t.id)?prev.filter(x=>x!==t.id):[...prev,t.id])} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#7888A8"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#202020":"#383838"}}>
                        {t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                  Roll {selSkill.charAt(0).toUpperCase()+selSkill.slice(1)} ({pool}d) · Need {actReq}+ to succeed
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setRollResult(rollDice(pool))} style={{background:"#2850A020",border:"1px solid #2850A060",borderRadius:4,color:"#2850A0",padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll ({pool}d)</button>
                  {rollResult&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:rollResult.successes>=actReq?"#2850A0":"#C02820"}}>[{rollResult.rolls.join(",")}]={rollResult.successes} {rollResult.successes>=actReq?"✓ Success":"✗ Fail"} (need {actReq})</span>}
                </div>
              </div>

              {rollResult&&rollResult.successes>=actReq&&selSkill==="brawl"&&targets.length>0&&(
                <div style={{background:"#F8F4D0",borderRadius:5,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#202020",marginBottom:4}}>Damage Roll (Brawl)</div>
                  <div style={{fontSize:10,color:"#383838",marginBottom:6}}>STR ({attrVal("strength")}) dice → successes − target VIT = damage</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button onClick={()=>setBrawlDmgRoll(rollDice(attrVal("strength")))} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Damage ({attrVal("strength")}d)</button>
                    {brawlDmgRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{brawlDmgRoll.rolls.join(",")}] = {brawlDmgRoll.successes} hits</span>}
                  </div>
                  {brawlDmgRoll&&targets.length>0&&(()=>{
                    const t=allEntries.find(e=>e.id===targets[0]);
                    const def=t?.attrs.vitality??1;
                    const dmg=Math.max(1,brawlDmgRoll.successes-def);
                    return t?(
                      <div style={{fontSize:11,color:"#383838",marginTop:6}}>
                        {brawlDmgRoll.successes} hits − {def} DEF ({t.nickname||t.pokemon.name}) = <strong style={{color:"#C02820"}}>{dmg} damage</strong>
                      </div>
                    ):null;
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Trainer Card View (replaces pokemon card when 👤 toggled) ──────────────── */
function TrainerCardView({trainer,entry,allEntries,onClose}:{trainer:any|null;entry:BattleEntry;allEntries:BattleEntry[];onClose:()=>void;}) {
  const [showSkillPopup,setShowSkillPopup]=useState(false);
  if(!trainer) return (
    <div style={{background:"rgba(61,139,255,0.06)",border:"1px solid #2850A020",borderRadius:5,padding:12,fontSize:11,color:"#585858",textAlign:"center"}}>
      <div style={{marginBottom:8}}>No linked trainer found.</div>
      <div>Add this Pokémon from the <strong style={{color:"#2850A0"}}>Characters & Party</strong> panel to link a trainer.</div>
      <button onClick={onClose} style={{marginTop:8,background:"none",border:"1px solid #2850A040",borderRadius:4,color:"#2850A0",padding:"4px 10px",fontSize:11,cursor:"pointer"}}>← Back to Pokémon</button>
    </div>
  );
  const attrs=trainer.attributes||{strength:1,dexterity:1,vitality:1,insight:1};
  const social=trainer.socialAttributes||{};
  const skills=trainer.skills||{};
  const maxHp=4+(attrs.vitality||1);
  const maxWp=(attrs.insight||1)+3;
  return (
    <>
      {showSkillPopup&&<TrainerSkillPopup trainerData={trainer} trainerEntry={entry} allEntries={allEntries} onClose={()=>setShowSkillPopup(false)}/>}
      <div style={{background:"rgba(61,139,255,0.06)",border:"1px solid #2850A030",borderRadius:6,padding:"10px 12px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,fontFamily:"'Exo 2'",color:"#2850A0"}}>{trainer.name}</div>
            <div style={{fontSize:10,color:"#585858"}}>{trainer.rank} · {trainer.age} · {trainer.concept||""}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid #2850A040",borderRadius:4,color:"#2850A0",padding:"3px 8px",fontSize:10,cursor:"pointer"}}>← Pokémon</button>
        </div>

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}}>
          {[["STR",attrs.strength],["DEX",attrs.dexterity],["VIT",attrs.vitality],["INS",attrs.insight]].map(([l,v])=>(
            <div key={l as string} style={{textAlign:"center",background:"#F8F4D0",borderRadius:4,padding:"5px 0"}}>
              <div style={{fontSize:9,color:"#585858"}}>{l}</div>
              <div style={{fontSize:16,fontFamily:"'Exo 2'",fontWeight:700,color:"#2850A0"}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:12,fontSize:11,color:"#585858",marginBottom:8}}>
          <span>HP <strong style={{color:"#2850A0"}}>{maxHp}</strong></span>
          <span>WP <strong style={{color:"#6890f0"}}>{maxWp}</strong></span>
          <span>Nature <strong style={{color:"#202020"}}>{trainer.nature||"—"}</strong></span>
        </div>

        {/* Skills as clickable move-like buttons */}
        <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Skills (click to use)</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {Object.entries(skills).filter(([,v])=>(v as number)>0).map(([skill,val])=>{
            const def=TRAINER_SKILLS[skill];
            const attrV=(def?.attr1&&(attrs as any)[def.attr1])||1;
            const pool=attrV+(val as number);
            return (
              <button key={skill} onClick={()=>setShowSkillPopup(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"#F8F4D0",border:"1px solid #2850A025",borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%",transition:"border-color 0.1s"}}
                onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor="#2850A0"}
                onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor="#2850A025"}>
                <span style={{fontSize:9,background:"rgba(61,139,255,0.15)",color:"#2850A0",padding:"1px 5px",borderRadius:3,fontWeight:700,textTransform:"capitalize"}}>{skill}</span>
                <span style={{fontSize:11,color:"#202020",flex:1,textTransform:"capitalize"}}>{def?.desc||skill}</span>
                <span style={{fontSize:10,color:"#585858"}}>{pool}d</span>
                <span style={{fontSize:10,color:"#585858"}}>▶</span>
              </button>
            );
          })}
          {Object.keys(skills).filter(k=>skills[k]>0).length===0&&(
            <div style={{fontSize:11,color:"#585858",fontStyle:"italic"}}>No skills trained.</div>
          )}
        </div>

        {/* Gym badges */}
        {trainer.gymBadges?.some((b:boolean)=>b)&&(
          <div style={{marginTop:8}}>
            <div style={{fontSize:10,color:"#585858",marginBottom:3}}>Badges</div>
            <div style={{display:"flex",gap:3}}>
              {(trainer.gymBadges as boolean[]).map((b,i)=>b&&<span key={i} style={{fontSize:14}}>🏅</span>)}
            </div>
          </div>
        )}
      </div>
    </>
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
  const [showTrainerView,setShowTrainerView]=useState(false);

  // Load linked trainer data from storage if this is a player pokemon
  const linkedTrainer=useMemo(()=>{
    if(!entry.linkedTrainerId)return null;
    const trainers=loadFromStorage<any[]>("trainers",[]);
    return trainers.find(t=>t.id===entry.linkedTrainerId)||null;
  },[entry.linkedTrainerId]);
  const upd=(u:Partial<BattleEntry>)=>onUpdate(entry.id,u);
  const sc=STATUS_CONDITIONS[entry.status];
  const sideColor={player:"#2850A0",enemy:"#C02820",neutral:"#383838"}[entry.side];
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
      <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} style={{background:entry.hasTakenTurn?"#F8F4D0":"#FBF8E4",border:`1px solid ${isActive?sideColor:entry.hasTakenTurn?"#2850A0":sideColor+"40"}`,borderLeft:`3px solid ${isActive?sideColor:entry.hasTakenTurn?"#2850A0":sideColor}`,borderRadius:8,opacity:entry.hasTakenTurn&&!isActive?0.65:1,boxShadow:isActive?`0 0 0 2px ${sideColor}30,0 4px 20px rgba(0,0,0,0.4)`:undefined,marginBottom:10,cursor:"default"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:isActive?sideColor+"15":"#F8F4D0",borderRadius:"8px 8px 0 0"}}>
          <span style={{color:"#4A5468",cursor:"grab",fontSize:12}}>⠿</span>
          <button onClick={()=>upd({hasTakenTurn:!entry.hasTakenTurn})} style={{width:18,height:18,borderRadius:"50%",border:"none",background:entry.hasTakenTurn?"#2850A0":"#2850A0",color:entry.hasTakenTurn?"#35785F":"#585858",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✓</button>
          <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
          <input value={entry.nickname} onChange={e=>upd({nickname:e.target.value})} placeholder={entry.pokemon.name}
            style={{flex:1,background:"transparent",border:"none",color:"#202020",fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,outline:"none",minWidth:0}}/>
          {isActive&&<span style={{fontSize:9,fontWeight:700,color:sideColor,background:sideColor+"20",padding:"1px 5px",borderRadius:3}}>ACTIVE</span>}
          {disobedience!=="none"&&<span style={{fontSize:9,color:disobedience==="high"?"#C02820":"#A07000"}}>⚠{disobedience==="high"?"REBEL":"DISOBEY"}</span>}
          <div style={{display:"flex",alignItems:"center",gap:2}}>
            <span style={{fontSize:9,color:"#585858"}}>INI:</span>
            <input type="number" value={entry.initiative} onChange={e=>upd({initiative:+e.target.value})}
              style={{width:28,background:"transparent",border:"none",color:"#6890f0",fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,textAlign:"center",outline:"none"}}/>
          </div>
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})}
            style={{background:"#35785F",border:"none",color:sideColor,fontSize:9,borderRadius:2,padding:"1px 3px"}}>
            <option value="player">Player</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option>
          </select>
          <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:entry.currentHp/entry.maxHp>0.5?"#2850A0":entry.currentHp/entry.maxHp>0.25?"#A07000":"#C02820"}}>{entry.currentHp}/{entry.maxHp}</span>
          <button onClick={()=>upd({isExpanded:!entry.isExpanded})} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:11}}>{entry.isExpanded?"▲":"▼"}</button>
          {entry.side==="enemy"&&<button onClick={()=>setShowCapture(true)} title="Capture this Pokémon" style={{background:"none",border:"none",color:"#A07000",cursor:"pointer",fontSize:13,padding:"0 2px"}}>🎯</button>}
          {(linkedTrainer||entry.side==="player")&&<button onClick={()=>setShowTrainerView(!showTrainerView)} title="Toggle trainer view" style={{background:showTrainerView?"rgba(61,139,255,0.2)":"none",border:showTrainerView?"1px solid #2850A040":"none",borderRadius:3,color:showTrainerView?"#2850A0":"#585858",cursor:"pointer",fontSize:11,padding:"0 4px"}}>👤</button>}
          <button onClick={()=>onRemove(entry.id)} style={{background:"none",border:"none",color:"#D8E4F8",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
        <HpBar current={entry.currentHp} max={entry.maxHp}/>

        {entry.isExpanded&&(
          <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:10}}>

            {/* ── TRAINER VIEW: replaces entire expanded content ── */}
            {showTrainerView&&(
              <TrainerCardView trainer={linkedTrainer} entry={entry} allEntries={allEntries} onClose={()=>setShowTrainerView(false)}/>
            )}

            {/* ── POKÉMON VIEW: normal expanded content ── */}
            {!showTrainerView&&<>

            {/* Action Economy */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:"#585858",flexShrink:0}}>Actions this round:</span>
              <div style={{display:"flex",gap:4}}>
                {actionSlots.map(i=>(
                  <button key={i} onClick={()=>upd({actionCount:entry.actionCount===i+1?i:i+1})}
                    style={{width:22,height:22,borderRadius:4,border:`1px solid ${i<entry.actionCount?"#f08030":"#7888A8"}`,background:i<entry.actionCount?"#f0803020":"transparent",cursor:"pointer",fontSize:9,color:i<entry.actionCount?"#f08030":"#585858",fontWeight:700}}>
                    {i+1}
                  </button>
                ))}
              </div>
              {entry.actionCount>0&&<span style={{fontSize:9,color:"#C02820"}}>Next hit needs {Math.min(entry.actionCount+1,5)}+ succ</span>}
              {isActive&&<button onClick={()=>upd({actionCount:Math.min(4,entry.actionCount+1)})} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:3,color:"#f08030",padding:"2px 8px",fontSize:10,cursor:"pointer"}}>+Action</button>}
            </div>

            {/* Status */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-start"}}>
              <select value={entry.status} onChange={e=>upd({status:e.target.value,statusTurnsLeft:e.target.value==="Asleep"?3:0})}
                style={{background:"#35785F",border:`1px solid ${sc?.color??"#2850A0"}`,borderRadius:4,color:sc?.color??"#585858",fontSize:11,padding:"2px 6px",fontWeight:700,flexShrink:0}}>
                {Object.keys(STATUS_CONDITIONS).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              {sc&&sc.name!=="Healthy"&&(
                <details style={{flex:1,minWidth:0}}>
                  <summary style={{fontSize:10,color:sc.color,cursor:"pointer",listStyle:"none",whiteSpace:"normal",lineHeight:1.4}}>
                    {sc.shortDesc} <span style={{fontSize:8,opacity:0.6}}>(expand)</span>
                  </summary>
                  <div style={{fontSize:10,color:"#383838",marginTop:4,lineHeight:1.5,whiteSpace:"normal"}}>{sc.fullDesc}</div>
                  {sc.endOfRoundEffect&&<div style={{fontSize:10,color:"#C02820",marginTop:2}}>🔄 {sc.endOfRoundEffect}</div>}
                  {sc.rollToActDesc&&<div style={{fontSize:10,color:"#a040a0",marginTop:2}}>🎲 {sc.rollToActDesc}</div>}
                  {entry.status==="Asleep"&&entry.statusTurnsLeft>0&&(
                    <div style={{fontSize:10,color:"#A07000",marginTop:2}}>⏱ {entry.statusTurnsLeft} turn{entry.statusTurnsLeft!==1?"s":""} remaining</div>
                  )}
                </details>
              )}
              {painPenalty>0&&<div style={{fontSize:10,color:"#C02820",background:"rgba(255,71,87,0.1)",padding:"1px 5px",borderRadius:3,flexShrink:0}}>Pain −{painPenalty}d</div>}
              {!entry.weatherImmune&&weather.name!=="Clear"&&<div style={{fontSize:10,color:"#A07000",background:"rgba(255,211,42,0.1)",padding:"1px 5px",borderRadius:3,flexShrink:0}}>{weather.emoji?.split(" ")[0]} {weather.name}</div>}
            </div>

            {/* HP + WP */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{label:"HP",cur:entry.currentHp,max:entry.maxHp,color:"#2850A0",f:"currentHp" as const,mf:"maxHp" as const},
                {label:"WP",cur:entry.currentWill,max:entry.maxWill,color:"#6890f0",f:"currentWill" as const,mf:"maxWill" as const}].map(f=>(
                <div key={f.label}>
                  <div style={{fontSize:10,color:"#585858",marginBottom:3}}>{f.label}</div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <button onClick={()=>upd({[f.f]:Math.max(0,f.cur-1)})} style={adjBtn}>−</button>
                    <input type="number" value={f.cur} onChange={e=>upd({[f.f]:Math.max(0,Math.min(f.max,+e.target.value||0))})}
                      style={{width:34,textAlign:"center",background:"#35785F",border:"1px solid #2850A0",borderRadius:3,color:f.color,fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,padding:"1px 2px"}}/>
                    <span style={{fontSize:10,color:"#585858"}}>/{f.max}</span>
                    <button onClick={()=>upd({[f.f]:Math.min(f.max,f.cur+1)})} style={adjBtn}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Attributes */}
            <div>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Attributes</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{
                  const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};
                  const base=entry.attrs[attr];
                  const mod=attrModSummary(attr);
                  const statusPen=attr==="dexterity"?(STATUS_CONDITIONS[entry.status]?.accuracyPenalty??0):0;
                  const final=Math.max(0,base+mod-statusPen);
                  return (
                    <div key={attr} style={{textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#585858",marginBottom:2}}>{labels[attr]}</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:1}}>
                        <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:Math.max(0,base-1)}})} style={{...adjBtn,width:14,height:14,fontSize:11}}>−</button>
                        <span style={{fontSize:13,fontFamily:"'Exo 2'",fontWeight:700,color:final<base?"#C02820":mod>0?"#2850A0":"#202020",minWidth:18,textAlign:"center"}}>
                          {final}{mod!==0&&<sup style={{fontSize:7,color:mod>0?"#2850A0":"#C02820"}}>{mod>0?`+${mod}`:mod}</sup>}
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
                    <div key={i} style={{fontSize:9,display:"flex",alignItems:"center",gap:3,background:m.amount>0?"rgba(0,212,170,0.1)":"rgba(255,71,87,0.1)",border:`1px solid ${m.amount>0?"#2850A030":"#C0282030"}`,borderRadius:3,padding:"1px 5px"}}>
                      <span style={{color:m.amount>0?"#2850A0":"#C02820"}}>{m.amount>0?"▲":"▼"}{Math.abs(m.amount)} {m.attr}</span>
                      <span style={{color:"#585858",fontSize:8}}>({m.source})</span>
                      <button onClick={()=>upd({statMods:entry.statMods.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#585858",cursor:"pointer",fontSize:10,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Abilities */}
            <div>
              <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Abilities</div>
              {entry.abilities.map((ab,i)=>{
                const abData=ABILITIES.find(a=>a.name===ab.name);
                return (
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 8px",background:ab.active?"rgba(0,212,170,0.06)":"rgba(90,96,128,0.1)",borderRadius:4,marginBottom:4,border:`1px solid ${ab.active?"#2850A020":"#7888A8"}`}}>
                    <button onClick={()=>{const abs=[...entry.abilities];abs[i]={...abs[i],active:!abs[i].active,disabledReason:abs[i].active?"Manually disabled":undefined};upd({abilities:abs});}}
                      style={{width:16,height:16,borderRadius:3,border:`1px solid ${ab.active?"#2850A0":"#7888A8"}`,background:ab.active?"#2850A0":"transparent",cursor:"pointer",flexShrink:0,marginTop:1}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:ab.active?"#202020":"#585858"}}>{ab.name}{!ab.active&&ab.disabledReason&&<span style={{fontSize:9,color:"#585858",marginLeft:4}}>({ab.disabledReason})</span>}</div>
                      {ab.active&&abData&&<div style={{fontSize:10,color:"#383838",lineHeight:1.4}}>{abData.effect}</div>}
                    </div>
                  </div>
                );
              })}
              {entry.pokemon.number===0&&(
                <select onChange={e=>{if(e.target.value)upd({abilities:[...entry.abilities,{name:e.target.value,active:true}]});e.target.value="";}}
                  style={{width:"100%",background:"#35785F",border:"1px solid #2850A0",borderRadius:4,color:"#383838",fontSize:11,padding:"3px 6px",marginTop:4}}>
                  <option value="">+ Add ability…</option>
                  {ABILITIES.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              )}
            </div>

            {/* Moves */}
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase"}}>Moves</div>
                <button onClick={()=>setShowEditMoves(!showEditMoves)} style={{fontSize:10,color:"#2850A0",background:"none",border:"none",cursor:"pointer"}}>{showEditMoves?"Done":"+ Edit"}</button>
              </div>
              {showEditMoves?(
                <div style={{maxHeight:160,overflowY:"auto"}}>
                  {MOVES.slice(0,100).map(m=>{
                    const has=entry.moves.some(em=>em.name===m.name);
                    return (
                      <div key={m.name} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}>
                        <input type="checkbox" checked={has} onChange={()=>upd({moves:has?entry.moves.filter(em=>em.name!==m.name):[...entry.moves,m]})}/>
                        <TypeBadge type={m.type as PokemonType} small/><span style={{fontSize:11,color:"#202020"}}>{m.name}</span>
                        {(m.priority??0)>0&&<span style={{fontSize:9,color:"#2850A0"}}>P{m.priority}</span>}
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
                      <button key={i} onClick={()=>setMovePopup(m)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",background:"#F8F4D0",border:`1px solid ${TYPE_COLORS[m.type as PokemonType]||"#2850A0"}25`,borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%",transition:"border-color 0.1s"}}
                        onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type as PokemonType]||"#2850A0"}
                        onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=`${TYPE_COLORS[m.type as PokemonType]||"#2850A0"}25`}>
                        <TypeBadge type={m.type as PokemonType} small/>
                        <span style={{fontSize:12,color:"#202020",flex:1}}>{m.name}</span>
                        {stab2&&<span style={{fontSize:9,color:"#A07000",fontWeight:700}}>STAB</span>}
                        {wBoost&&<span style={{fontSize:9,color:"#f8d030"}}>{weather.emoji?.split(" ")[0]}</span>}
                        {(m.priority??0)>0&&<span style={{fontSize:9,color:"#2850A0",fontWeight:700}}>P{m.priority}</span>}
                        {abilMods.bonus>0&&<span style={{fontSize:9,color:"#2850A0",fontWeight:700}}>+{abilMods.bonus}</span>}
                        {m.power!=="-"&&<span style={{fontSize:9,color:"#585858"}}>P{m.power}</span>}
                        <span style={{fontSize:9,color:"#585858"}}>▶</span>
                      </button>
                    );
                  })}
                  {entry.moves.length===0&&<div style={{fontSize:11,color:"#585858",fontStyle:"italic"}}>No moves. Click Edit to add.</div>}
                </div>
              )}
            </div>

            <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Notes…"
              style={{width:"100%",background:"#35785F",border:"1px solid #2850A0",borderRadius:4,color:"#383838",fontSize:10,padding:5,resize:"none",minHeight:32,fontFamily:"inherit",lineHeight:1.4,outline:"none"}}/>

            <label style={{fontSize:10,color:"#383838",display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
              <input type="checkbox" checked={entry.weatherImmune} onChange={e=>upd({weatherImmune:e.target.checked})}/>
              Immune to weather chip damage
            </label>
            </>} {/* end !showTrainerView */}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Encounter mini-panel ───────────────────────────────────────────────────── */
const RANK_ORDER_LIST: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];

function EncounterPanel({onAddToTracker}:{onAddToTracker:(p:PokemonEntry)=>void}) {
  const [habitat,setHabitat]=useState(HABITATS[1]);
  const [rankFilter,setRankFilter]=useState<Set<Rank>>(new Set(RANK_ORDER_LIST));
  const [rolled,setRolled]=useState<PokemonEntry|null>(null);

  const filtered=useMemo(()=>POKEMON.filter(p=>{
    if(!rankFilter.has(p.suggestedRank))return false;
    const allTypes=[...habitat.commonTypes,...habitat.uncommonTypes,...habitat.rareTypes];
    return p.types.some(t=>allTypes.includes(t));
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
        {HABITATS.map(h=>(
          <button key={h.name} onClick={()=>setHabitat(h)} style={{fontSize:10,padding:"2px 6px",borderRadius:4,cursor:"pointer",border:`1px solid ${h.color}60`,background:habitat.name===h.name?h.color+"20":"transparent",color:habitat.name===h.name?h.color:"#383838",fontWeight:habitat.name===h.name?700:400}}>
            {h.emoji} {h.name.split("/")[0]}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {RANK_ORDER_LIST.map(r=>(
          <button key={r} onClick={()=>toggleRank(r)} style={{fontSize:9,padding:"1px 5px",borderRadius:3,cursor:"pointer",border:`1px solid ${RANK_COLORS[r]}60`,background:rankFilter.has(r)?RANK_COLORS[r]+"20":"transparent",color:rankFilter.has(r)?RANK_COLORS[r]:"#585858",fontWeight:700}}>{r}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={rollRandom} style={{background:"#2850A0",color:"#FFFFFF",border:"none",borderRadius:5,padding:"6px 14px",fontWeight:700,fontSize:11,cursor:"pointer"}}>🎲 Roll ({filtered.length})</button>
      </div>
      {rolled&&(
        <div style={{background:"#F8F4D0",border:`2px solid ${TYPE_COLORS[rolled.types[0]]}`,borderRadius:6,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#202020"}}>{rolled.name}</span>
            <span style={{fontSize:10,color:"#585858"}}>#{String(rolled.number).padStart(3,"0")}</span>
            {rolled.types.map(t=><TypeBadge key={t} type={t} small/>)}
            <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:RANK_COLORS[rolled.suggestedRank]}}>{rolled.suggestedRank}</span>
          </div>
          <div style={{fontSize:10,color:"#383838",marginBottom:6}}>HP {rolled.baseHp+rolled.attributes.vitality} · STR {rolled.attributes.strength} · DEX {rolled.attributes.dexterity} · SPC {rolled.attributes.special}</div>
          <button onClick={()=>onAddToTracker(rolled)} style={{background:"#C02820",color:"#fff",border:"none",borderRadius:4,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚔️ Add to Battle Tracker</button>
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
        {filtered.slice(0,40).map(p=>(
          <div key={`${p.number}-${p.name}`} onClick={()=>setRolled(p)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:4,cursor:"pointer",transition:"background 0.1s"}}
            onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#FBF8E4"}
            onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
            <span style={{fontSize:9,color:"#4A5468",width:28,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
            <span style={{fontSize:11,color:"#202020",flex:1}}>{p.name}</span>
            {p.types.map(t=><TypeBadge key={t} type={t} small/>)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Popout Window ──────────────────────────────────────────────────────────── */
/* ─── Popout Window ───────────────────────────────────────────────────────────── */
function PopoutButton({panelType,panelLabel}:{panelType:PanelType;panelLabel:string}) {
  const openPopout=()=>{
    // Interactive panels open their dedicated full pages
    if(panelType==="tracker"){window.open("/battle-tracker","_blank","width=900,height=700,resizable=yes,scrollbars=yes");return;}
    if(panelType==="encounter"){window.open("/encounter","_blank","width=800,height=700,resizable=yes,scrollbars=yes");return;}
    if(panelType==="quick_roll"){
      const w=window.open("","_blank","width=320,height=500,resizable=yes");if(!w)return;
      const rows=[1,2,3,4,5,6,8,10,12].map(n=>`<div class="row"><button onclick="roll(${n})">${n}d</button><span id="r${n}"></span></div>`).join("");
      w.document.write(`<!DOCTYPE html><html><head><title>Quick Roller</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#35785F;color:#202020;font-family:Inter,sans-serif;padding:16px}.row{display:flex;gap:8px;align-items:center;margin-bottom:8px}button{background:#FBF8E4;border:1px solid #7888A8;border-radius:4px;color:#6890f0;padding:4px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}span{font-size:12px;color:#202020;font-family:'Exo 2',sans-serif}h2{font-family:'Exo 2',sans-serif;margin-bottom:12px;font-size:16px;color:#6890f0}</style></head><body><h2>🎲 Quick Roller</h2>${rows}<script>function roll(n){const rolls=Array.from({length:n},()=>Math.floor(Math.random()*6)+1);const succ=rolls.filter(r=>r>=4).length;document.getElementById('r'+n).textContent='['+rolls.join(',')+'] = '+succ+'✓';}</script></body></html>`);
      w.document.close();return;
    }
    // Reference panels — write static content
    const styles=`*{box-sizing:border-box;margin:0;padding:0}body{background:#35785F;color:#202020;font-family:Inter,sans-serif;padding:12px;font-size:12px}h2{font-family:'Exo 2',sans-serif;font-size:16px;margin-bottom:10px}h3{font-family:'Exo 2',sans-serif;font-size:12px;color:#585858;text-transform:uppercase;letter-spacing:1px;margin:12px 0 5px}.card{background:#FBF8E4;border-radius:5px;padding:9px 11px;margin-bottom:7px}.row{display:flex;justify-content:space-between;padding:2px 0}`;
    const w=window.open("","_blank","width=520,height=700,resizable=yes,scrollbars=yes");if(!w)return;
    let body=`<h2>${panelLabel}</h2>`;
    const SC={"Burned":{"color":"#f08030","desc":"Loses 1 HP/round. Physical moves −2 dice."},"Frozen":{"color":"#98d8d8","desc":"Cannot act. Roll 1d6 each turn (5–6 thaws)."},"Paralyzed":{"color":"#f8d030","desc":"Accuracy −2 dice. Roll 1d6 (1–2 = cannot act)."},"Poisoned":{"color":"#a040a0","desc":"Loses 1 HP/round."},"Badly Poisoned":{"color":"#7038f8","desc":"Loses 2 HP/round."},"Asleep":{"color":"#705898","desc":"Cannot act. Roll 1d6 (4–6 wake). Auto-wakes after 3 turns."},"Confused":{"color":"#f85888","desc":"Roll 1d6 before each action. 1–3 = hits itself (STR+Brawl vs own VIT)."},"Flinched":{"color":"#c0c0d0","desc":"Cannot act this turn. Clears at end of turn."},"Infatuated":{"color":"#ff69b4","desc":"Must roll WP (2+ successes) to act each turn."}};
    if(panelType==="status_ref"){body+=Object.entries(SC).map(([n,s])=>`<div class="card" style="border-left:3px solid ${s.color}"><div style="font-weight:700;color:${s.color};margin-bottom:3px">${n}</div><div style="font-size:11px;color:#383838">${s.desc}</div></div>`).join("");}
    else if(panelType==="weather_ref"){body+=`<div class="card"><b style="color:#A07000">☀️ Sunny</b><p style="font-size:11px;color:#383838;margin-top:4px">Fire +2 dice, Water −2 dice. Solar Beam instant.</p></div><div class="card"><b style="color:#6890f0">🌧️ Rain</b><p style="font-size:11px;color:#383838;margin-top:4px">Water +2 dice, Fire −2 dice. Thunder always hits.</p></div><div class="card"><b style="color:#e0c068">🌪️ Sandstorm</b><p style="font-size:11px;color:#383838;margin-top:4px">Non-Rock/Ground/Steel: −1 HP/round.</p></div><div class="card"><b style="color:#98d8d8">🧊 Hail</b><p style="font-size:11px;color:#383838;margin-top:4px">Non-Ice: −1 HP/round. Blizzard always hits.</p></div><div class="card"><b style="color:#383838">🌫️ Fog</b><p style="font-size:11px;color:#383838;margin-top:4px">All accuracy rolls −1 die.</p></div><div class="card"><b style="color:#f8d030">⚡ Electric Terrain</b><p style="font-size:11px;color:#383838;margin-top:4px">Electric +1 die. Grounded cannot sleep.</p></div><div class="card"><b style="color:#EE99AC">🌸 Misty Terrain</b><p style="font-size:11px;color:#383838;margin-top:4px">Fairy +1 die. Grounded cannot be statused.</p></div>`;}
    else if(panelType==="catch_ref"){body+=`<h3>Required Successes</h3>${[["Starter","3"],["Rookie","4"],["Standard","6"],["Advanced","8"],["Expert","9"],["Ace","10"],["Master","12"],["Champion","14"]].map(([r,s])=>`<div class="row"><span>${r}</span><strong style="color:#A07000">${s}</strong></div>`).join("")}<h3>Bonuses</h3>${[["Half HP","+1"],["1 HP","+2"],["Status Ailment","+1 each"]].map(([c,v])=>`<div class="row"><span style="color:#383838">${c}</span><span style="color:#2850A0">${v}</span></div>`).join("")}<h3>Ball Seal Potency</h3>${[["Pokéball","4d"],["Great Ball","6d"],["Ultra Ball","8d"]].map(([b,p])=>`<div class="row"><span style="color:#383838">${b}</span><span style="color:#A07000">${p}</span></div>`).join("")}`;}
    else if(panelType==="rules"){body+=`${[["🎲 Roll","Attribute + Skill. Each 4/5/6 = 1 success."],["⚡ Actions","1st=1 needed, 2nd=2, 3rd=3, 4th=4, 5th=5."],["💥 Physical Dmg","STR + Power − foe VIT. Min 1 die, min 1 dmg."],["💫 Special Dmg","SPC + Power − foe INS. Min 1 die, min 1 dmg."],["⭐ STAB","+1 die when move type matches Pokémon type."],["🔴 Super Effective","+2 dice to damage pool (needs 1+ succ)."],["💢 Critical Hit","3+ extra hits → +2 dmg dice."],["🩹 Pain (>50%)","No pen. 26–50%: −1d. 1–25%: −2d. 0: Fainted."],["⚠ Disobedience","Same/lower: obeys. +1 rank: loyalty roll (3+). +2: ignores."]].map(([t,d])=>`<div class="card"><div style="font-weight:700;margin-bottom:3px">${t}</div><div style="font-size:11px;color:#383838">${d}</div></div>`).join("")}`;}
    else{body+=`<p style="color:#585858;margin-top:8px">This panel (${panelLabel}) is for reference. Open it in the GM Screen for interactive features.</p>`;}
    w.document.write(`<!DOCTYPE html><html><head><title>${panelLabel} — PokeRole</title><style>${styles}</style></head><body>${body}</body></html>`);
    w.document.close();
  };
  return <button onClick={openPopout} title="Pop out" style={{background:"none",border:"none",color:"#BCD8CC",cursor:"pointer",fontSize:12,padding:"0 4px"}}>↗</button>;
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
        <div key={e.id} style={{opacity:dragOverId===e.id?0.5:1,outline:dragOverId===e.id?"2px dashed #2850A0":"none",borderRadius:8,transition:"opacity 0.1s"}}>
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

/* ─── Self-Contained Battle Tracker Panel ────────────────────────────────────── */
// This has its OWN weather/round/turn state, fully independent of GM Screen nav
/* ── Tracker Overview Panel (GM Screen) — summary view + link to full tracker ── */
function TrackerOverviewPanel({entries,setEntries}:{entries:BattleEntry[];setEntries:React.Dispatch<React.SetStateAction<BattleEntry[]>>}){
  const [weather,setWeather]=useState<WeatherData>(WEATHER_DATA[0]);
  const [turn,setTurn]=useState(0);
  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const active=sorted[turn%Math.max(1,sorted.length)];
  const sideColor=active?{player:"#2850A0",enemy:"#C02820",neutral:"#383838"}[active.side]:"#585858";

  const upd=(id:string,u:Partial<BattleEntry>)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e));
  const nextTurn=()=>{
    if(active)setEntries(prev=>prev.map(e=>e.id===active.id?{...e,hasTakenTurn:true,actionCount:0}:e));
    const n=(turn+1)%Math.max(1,sorted.length);
    if(n===0)setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false,reactionUsed:false,isProtected:false})));
    setTurn(n);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",fontSize:11}}>
      {/* Header */}
      <div style={{padding:"5px 8px",background:"#24523F",borderBottom:"1px solid #2850A0",display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
        {/* Side is shown as a colour chip; the name stays white, since the side
            colours are tuned for light surfaces and sit at ~1.5:1 on this strip. */}
        <span style={{width:8,height:8,borderRadius:"50%",background:sideColor,border:"1px solid rgba(255,255,255,0.6)",flexShrink:0}}/>
        <span style={{color:"#FFFFFF",fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{active?(active.nickname||active.pokemon.name):"—"}</span>
        <button onClick={nextTurn} style={{background:"#2850A0",color:"#FFFFFF",border:"none",borderRadius:3,padding:"2px 8px",fontWeight:700,fontSize:10,cursor:"pointer"}}>Next ▶</button>
        <a href="/battle-tracker" target="_blank" style={{background:"rgba(0,0,0,0.28)",border:"1px solid rgba(255,255,255,0.45)",borderRadius:3,color:"#FFFFFF",padding:"2px 7px",fontSize:9,textDecoration:"none",whiteSpace:"nowrap"}}>Open Full ↗</a>
      </div>
      {/* Combatant list */}
      <div style={{flex:1,overflowY:"auto",padding:"4px"}}>
        {sorted.length===0&&<div style={{color:"#585858",padding:"16px 8px",textAlign:"center",fontSize:10}}>No combatants. Use the Battle Tracker (↗) to add Pokémon — this panel syncs automatically.</div>}
        {sorted.map((e,i)=>{
          const sc={player:"#2850A0",enemy:"#C02820",neutral:"#383838"}[e.side];
          const sts=(e.statuses||[]).filter(s=>s!=="Healthy");
          return(
            <div key={e.id} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 5px",borderRadius:4,background:active?.id===e.id?sc+"12":"transparent",borderLeft:`2px solid ${active?.id===e.id?sc:"transparent"}`,marginBottom:2,opacity:e.currentHp<=0?0.4:1}}>
              <span style={{fontSize:8,color:"#4A5468",width:14,textAlign:"right",flexShrink:0}}>{i+1}</span>
              <div style={{width:5,height:5,borderRadius:"50%",background:e.currentHp<=0?"#3a3040":TYPE_COLORS[e.pokemon.types[0]],flexShrink:0}}/>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:11,color:e.currentHp<=0?"#585858":"#202020",textDecoration:e.currentHp<=0?"line-through":"none"}}>{e.nickname||e.pokemon.name}</span>
              {sts.map(s=>{const sc2=STATUS_CONDITIONS[s];return<span key={s} style={{fontSize:7,color:sc2?.color,background:(sc2?.color||"#555")+"20",borderRadius:2,padding:"0 2px",flexShrink:0}}>{s.slice(0,3)}</span>;})}
              {e.isProtected&&<span style={{fontSize:8,color:"#6890f0",flexShrink:0}}>🛡</span>}
              {e.hasTakenTurn&&<span style={{fontSize:7,color:"#4A5468",flexShrink:0}}>✓</span>}
              <span style={{fontSize:9,color:e.currentHp<=0?"#705898":e.currentHp/e.maxHp>0.5?"#2850A0":e.currentHp/e.maxHp>0.25?"#A07000":"#C02820",fontFamily:"'Exo 2'",fontWeight:700,flexShrink:0}}>{e.currentHp}/{e.maxHp}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SelfContainedTracker({entries,setEntries,onAddToTracker}:{
  entries:BattleEntry[];
  setEntries:React.Dispatch<React.SetStateAction<BattleEntry[]>>;
  onAddToTracker:(p:PokemonEntry)=>void;
}) {
  const [weather,setWeather]=useState<WeatherData>(WEATHER_DATA[0]);
  const [turn,setTurn]=useState(0);
  const [round,setRound]=useState(1);
  const [showEOR,setShowEOR]=useState(false);
  const [showPriority,setShowPriority]=useState(false);

  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry=sorted[turn%Math.max(1,sorted.length)];
  const sideColor=activeEntry?{player:"#2850A0",enemy:"#C02820",neutral:"#383838"}[activeEntry.side]:"#585858";

  const applyEOR=(id:string,hp:number,_reason?:string)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp+hp)}:e));

  const nextTurn=()=>{
    if(activeEntry){
      setEntries(prev=>prev.map(e=>{
        if(e.id!==activeEntry.id)return e;
        let newStatus=e.status;
        let newTurnsLeft=e.statusTurnsLeft;
        // Flinch auto-clears at end of the affected pokemon's turn
        if(e.status==="Flinched")newStatus="Healthy";
        // Sleep: decrement turns, auto-wake at 0
        if(e.status==="Asleep"){
          newTurnsLeft=Math.max(0,e.statusTurnsLeft-1);
          if(newTurnsLeft===0)newStatus="Healthy";
        }
        return{...e,hasTakenTurn:true,actionCount:0,status:newStatus,statusTurnsLeft:newTurnsLeft};
      }));
    }
    const next=(turn+1)%Math.max(1,sorted.length);
    if(next===0){
      setRound(r=>r+1);
      setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false,actionCount:0})));
      setShowEOR(true);
      // Check tracker moves (e.moves) for priority
      const hasPri=entries.some(e=>e.currentHp>0&&e.moves.some(m=>(m.priority??0)>0));
      if(hasPri)setTimeout(()=>setShowPriority(true),400);
    }
    setTurn(next);
  };
  const rollAllIni=()=>{
    setEntries(prev=>prev.map(e=>({...e,initiative:Math.floor(Math.random()*6)+1+(e.attrs?.dexterity??1)})));
    setTurn(0);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
      {showEOR&&<EndOfRoundPopup entries={entries} weather={weather} round={round} onApply={applyEOR} onClose={()=>setShowEOR(false)}/>}
      {showPriority&&<PriorityPhasePopup entries={entries} weather={weather} onClose={()=>setShowPriority(false)}/>}

      {/* Tracker top bar — weather, round, turn controls */}
      <div style={{padding:"5px 8px",background:"#24523F",borderBottom:"1px solid #2850A0",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
        <select value={weather.name} onChange={e=>setWeather(WEATHER_DATA.find(w=>w.name===e.target.value)!)}
          style={{background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:4,color:"#A07000",fontSize:10,padding:"2px 4px",flexShrink:0}}>
          {WEATHER_DATA.map(w=><option key={w.name} value={w.name}>{w.emoji?.split(" ")[0]} {w.name}</option>)}
        </select>
        <div style={{display:"flex",alignItems:"center",gap:4,background:"#FBF8E4",border:"1px solid #2850A0",borderRadius:4,padding:"2px 6px",flexShrink:0}}>
          <span style={{fontSize:9,color:"#585858"}}>Rnd</span>
          <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:12,color:"#202020"}}>{round}</span>
          <span style={{fontSize:9,color:"#585858",marginLeft:3}}>·</span>
          <span style={{fontSize:9,color:sideColor,fontWeight:600,maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeEntry?.nickname||activeEntry?.pokemon.name||"—"}</span>
        </div>
        <button onClick={nextTurn} style={{background:"#2850A0",color:"#FFFFFF",border:"none",borderRadius:4,padding:"3px 8px",fontWeight:700,fontSize:10,cursor:"pointer",flexShrink:0}}>Next Turn ▶</button>
        <button onClick={rollAllIni} style={{background:"#6890f015",border:"1px solid #6890f040",borderRadius:4,color:"#6890f0",padding:"2px 6px",fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>🎲 INI</button>
        <button onClick={()=>setShowPriority(true)} style={{background:"#2850A015",border:"1px solid #2850A040",borderRadius:4,color:"#2850A0",padding:"2px 6px",fontSize:10,cursor:"pointer",flexShrink:0}} title="Show priority phase">⚡ Priority</button>
        <button onClick={()=>setShowEOR(true)} style={{background:"#A0700010",border:"1px solid #A0700030",borderRadius:4,color:"#A07000",padding:"2px 6px",fontSize:10,cursor:"pointer",flexShrink:0}} title="End of round effects">🔄 EOR</button>
      </div>

      {/* Weather banner */}
      {weather.name!=="Clear"&&(
        <div style={{background:weather.color+"15",padding:"3px 8px",fontSize:10,color:"#202020",display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          <span>{weather.emoji?.split(" ")[0]}</span>
          <span style={{fontWeight:700}}>{weather.name}</span>
          <span style={{color:"#383838",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{weather.description}</span>
        </div>
      )}

      {/* Search */}
      <div style={{padding:"5px 6px",borderBottom:"1px solid #2850A0",flexShrink:0}}>
        <TrackerSearch onAdd={onAddToTracker}/>
      </div>

      {/* Cards */}
      <div style={{flex:1,overflowY:"auto",padding:"6px"}}>
        {entries.length===0?(
          <div style={{textAlign:"center",color:"#585858",padding:24,fontSize:11}}>Search above to add Pokémon to the tracker</div>
        ):(
          <DraggableTrackerList entries={entries} setEntries={setEntries} allEntries={entries} weather={weather} activeId={activeEntry?.id}/>
        )}
      </div>
    </div>
  );
}

/* ─── Panel Content Router ────────────────────────────────────────────────────── */
const ALL_TYPES: PokemonType[] = ["Normal","Fire","Water","Electric","Grass","Ice","Fight","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

function PanelContent({type,entries,setEntries,onAddToTracker,gmNotes,setGmNotes}:{
  type:PanelType;entries:BattleEntry[];setEntries:React.Dispatch<React.SetStateAction<BattleEntry[]>>;
  onAddToTracker:(p:PokemonEntry)=>void;
  gmNotes:string;setGmNotes:(s:string)=>void;
}) {
  switch(type) {
    case "tracker": return <TrackerOverviewPanel entries={entries} setEntries={setEntries}/>;
    case "characters": return <CharactersPanel onAddToTracker={onAddToTracker}/>;
    case "notes": return (
      <textarea value={gmNotes} onChange={e=>setGmNotes(e.target.value)} placeholder="Session notes, NPC details, secrets…"
        style={{flex:1,width:"100%",height:"100%",background:"transparent",border:"none",color:"#383838",fontSize:12,padding:12,resize:"none",fontFamily:"inherit",lineHeight:1.6,outline:"none"}}/>
    );
    case "encounter": return <EncounterPanel onAddToTracker={onAddToTracker}/>;
    case "type_chart": return (
      <div style={{overflowY:"auto",height:"100%",padding:"6px"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:9}}>
          <thead><tr>
            {["Type","Weak to","Resists","Immune"].map(h=><th key={h} style={{padding:"4px 6px",color:"#585858",background:"#F8F4D0",borderBottom:"1px solid #2850A0",textAlign:"left"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {ALL_TYPES.map((t,i)=>{
              const c=TYPE_CHART[t];
              const badge=(types:PokemonType[])=>(<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{types.map(w=><span key={w} style={{display:"inline-flex",padding:"0px 3px",borderRadius:2,fontSize:7,fontWeight:700,color:"#fff",background:TYPE_COLORS[w]}}>{w}</span>)}</div>);
              return (
                <tr key={t} style={{background:i%2===0?"transparent":"#FBF8E420"}}>
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
          <div key={sc.name} style={{marginBottom:8,background:"#F8F4D0",borderRadius:6,padding:"8px 10px",border:`1px solid ${sc.color}30`}}>
            <div style={{fontWeight:700,fontSize:12,color:sc.color,marginBottom:3}}>{sc.name}</div>
            <div style={{fontSize:10,color:"#383838",lineHeight:1.5}}>{sc.fullDesc}</div>
            {sc.endOfRoundEffect&&<div style={{fontSize:10,color:"#C02820",marginTop:2}}>🔄 {sc.endOfRoundEffect}</div>}
          </div>
        ))}
      </div>
    );
    case "weather_ref": return (
      <div style={{overflowY:"auto",height:"100%",padding:"8px 10px"}}>
        {WEATHER_DATA.map(w=>(
          <div key={w.name} style={{marginBottom:8,background:"#F8F4D0",borderRadius:6,padding:"8px 10px",border:`1px solid ${w.color}30`}}>
            <div style={{fontWeight:700,fontSize:12,color:"#202020",marginBottom:3}}>{w.emoji?.split(" ")[0]} {w.name}</div>
            <div style={{fontSize:10,color:"#383838",lineHeight:1.4}}>{w.description}</div>
            {w.endOfRoundDmg&&<div style={{fontSize:10,color:"#C02820",marginTop:2}}>🔄 {w.endOfRoundDesc}</div>}
          </div>
        ))}
      </div>
    );
    case "catch_ref": return (
      <div style={{overflowY:"auto",height:"100%",padding:"10px 12px",fontSize:11}}>
        <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#202020",marginBottom:10}}>🎯 Catching Pokémon</div>
        <p style={{color:"#383838",marginBottom:10}}>Roll DEX/STR + Throw, then roll Seal Potency.</p>
        {["Starter:3","Rookie:4","Standard:6","Advanced:8","Expert:9","Ace:10","Master:12","Champion:14"].map(r=>{
          const [rank,succ]=r.split(":");
          return <div key={rank} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}><span style={{color:"#383838"}}>{rank}</span><span style={{color:"#A07000",fontWeight:700}}>{succ} succ</span></div>;
        })}
        <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginTop:10,marginBottom:4}}>Bonuses</div>
        {["Half HP:+1","1 HP:+2","Status Ailment:+1 each"].map(b=>{
          const [c,v]=b.split(":");
          return <div key={c} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}><span style={{color:"#383838"}}>{c}</span><span style={{color:"#2850A0",fontWeight:700}}>{v}</span></div>;
        })}
        <div style={{fontSize:10,color:"#585858",letterSpacing:"1px",textTransform:"uppercase",marginTop:10,marginBottom:4}}>Ball Seal Potency</div>
        {["Pokéball:4d","Great Ball:6d","Ultra Ball:8d"].map(b=>{
          const [c,v]=b.split(":");
          return <div key={c} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}><span style={{color:"#383838"}}>{c}</span><span style={{color:"#A07000",fontWeight:700}}>{v}</span></div>;
        })}
      </div>
    );
    case "quick_roll": return (
      <div style={{padding:"10px 12px"}}>
        <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#202020",marginBottom:10}}>🎲 Quick Roller</div>
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
            <div style={{fontWeight:700,color:"#202020"}}>{t}</div>
            <div style={{fontSize:10,color:"#383838"}}>{d}</div>
          </div>
        ))}
      </div>
    );
    default: return <div style={{color:"#585858",padding:20}}>Unknown panel type</div>;
  }
}

function QuickRollRow({n}:{n:number}) {
  const [res,setRes]=useState<{rolls:number[];s:number}|null>(null);
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
      <button onClick={()=>{const r=rollDice(n);setRes({rolls:r.rolls,s:r.successes});}} style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:4,color:"#6890f0",padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Exo 2'",minWidth:36}}>{n}d</button>
      {res&&<span style={{fontSize:10,fontFamily:"'Exo 2'",color:"#202020"}}>[{res.rolls.join(",")}] <span style={{color:"#2850A0",fontWeight:700}}>{res.s}✓</span></span>}
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
        style={{width:"100%",background:"#35785F",border:"1px solid #2850A0",borderRadius:5,padding:"5px 8px",color:"#202020",fontSize:11,outline:"none"}}
        onFocus={e=>(e.target as HTMLInputElement).style.borderColor="#2850A0"}
        onBlur={e=>(e.target as HTMLInputElement).style.borderColor="#2850A0"}/>
      {filtered.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:5,zIndex:100,maxHeight:240,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
          <div onClick={()=>{onAdd(MISSINGNO);setQ("");}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",cursor:"pointer",borderBottom:"1px solid #2850A0"}}
            onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#D8D8D8"}
            onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
            <span style={{fontSize:10,color:"#A07000",fontWeight:700}}>✦ Custom (Missingno.)</span>
          </div>
          {filtered.map(p=>(
            <div key={`${p.number}-${p.name}`} onClick={()=>{onAdd(p);setQ("");}} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer"}}
              onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#D8D8D8"}
              onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
              <span style={{fontSize:9,color:"#4A5468",width:26,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
              <span style={{fontSize:11,color:"#202020",flex:1}}>{p.name}</span>
              {p.types.map(t=><TypeBadge key={t} type={t as PokemonType} small/>)}
              <span style={{fontSize:9,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({label,onClick,danger}:{label:string;onClick:()=>void;danger?:boolean}) {
  return (
    <button onClick={onClick}
      style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:danger?"#ff6b6b":"#383838",padding:"7px 9px",fontSize:11,cursor:"pointer",borderRadius:4}}
      onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="#D8D8D8";}}
      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="none";}}>{label}</button>
  );
}

/* ─── Panel Picker ────────────────────────────────────────────────────────────── */
function PanelPicker({onPick,onClose,addTab}:{onPick:(type:PanelType)=>void;onClose:()=>void;addTab:boolean;}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:10,padding:20,width:420,maxWidth:"95vw"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#a040a0",marginBottom:14}}>{addTab?"Add a Tab":"Choose a Panel"}</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {PANEL_CATALOG.map(p=>(
            <button key={p.type} onClick={()=>{onPick(p.type);onClose();}} style={{background:"#F8F4D0",border:"1px solid #2850A0",borderRadius:6,padding:"12px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#a040a0";(e.currentTarget as HTMLButtonElement).style.background="#FBF8E4";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2850A0";(e.currentTarget as HTMLButtonElement).style.background="#F8F4D0";}}>
              <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#202020",marginBottom:2}}>{p.label}</div>
              <div style={{fontSize:10,color:"#585858",lineHeight:1.3}}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main GM Screen ─────────────────────────────────────────────────────────── */
export default function GMScreen() {
  // entries is the single source of truth - shared with SelfContainedTracker panels
  const [entries,setEntries]=useState<BattleEntry[]>(()=>loadFromStorage("bt_entries",[]));

  // Sync with standalone Battle Tracker tab via storage events
  useEffect(()=>{
    const onStorage=(e:StorageEvent)=>{
      if(e.key==="bt_entries"&&e.newValue){try{setEntries(JSON.parse(e.newValue));}catch{}}
    };
    window.addEventListener("storage",onStorage);
    return()=>window.removeEventListener("storage",onStorage);
  },[]);
  const [gmNotes,setGmNotes]=useState(()=>loadFromStorage("gm_notes",""));
  const [dims,setDims]=useState<{cols:number;rows:number}>(()=>{
    const d=loadFromStorage("gm_dims",{cols:DEFAULT_COLS,rows:DEFAULT_ROWS});
    return {cols:clampDim(d.cols,MIN_COLS,MAX_COLS),rows:clampDim(d.rows,MIN_ROWS,MAX_ROWS)};
  });
  const {cols,rows}=dims;
  const [grid,setGrid]=useState<(Panel|null)[]>(()=>{
    const stored=loadFromStorage<StoredPanel[]|null>("gm_grid",null);
    const d=loadFromStorage("gm_dims",{cols:DEFAULT_COLS,rows:DEFAULT_ROWS});
    const c=clampDim(d.cols,MIN_COLS,MAX_COLS), r=clampDim(d.rows,MIN_ROWS,MAX_ROWS);
    const base:(Panel|null)[]=Array(c*r).fill(null);
    if(!stored)return base;
    // Legacy saves are always 12 slots on a 4-wide grid.
    const migrated=stored.map(migratePanel);
    const oldCols=migrated.length===c*r?c:DEFAULT_COLS;
    return reflowGrid(migrated,oldCols,c,r);
  });
  /* `pickerSlot` opens the catalog. `addTab` distinguishes "add a tab here" from
     "replace this panel's active tab". */
  const [pickerSlot,setPickerSlot]=useState<{slot:number;addTab:boolean}|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  /* The grid and its dimensions come from localStorage, which the server can't
     see — so hold the first paint until mount rather than hydrating a mismatch.
     useSyncExternalStore gives a server snapshot of false and a client snapshot
     of true without setting state from an effect. */
  const mounted=useSyncExternalStore(()=>()=>{},()=>true,()=>false);

  useEffect(()=>{saveToStorage("bt_entries",entries);},[entries]);
  useEffect(()=>{saveToStorage("gm_notes",gmNotes);},[gmNotes]);
  useEffect(()=>{saveToStorage("gm_grid",grid);},[grid]);
  useEffect(()=>{saveToStorage("gm_dims",dims);},[dims]);

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
  // pending_link is set by CharactersPanel when adding a party pokemon
  useEffect(()=>{
    const pending=loadFromStorage<{pokemonNumber:number;trainerId:string;nickname:string}|null>("pending_link",null);
    if(pending){
      saveToStorage("pending_link",null);
      // Small delay to ensure the entry is fully added before updating
      setTimeout(()=>{
        setEntries(prev=>{
          // Find the most recently added entry with this pokemon number that has no trainer link
          const idx=[...prev].reverse().findIndex(e=>e.pokemon.number===pending.pokemonNumber&&!e.linkedTrainerId);
          if(idx<0)return prev;
          const realIdx=prev.length-1-idx;
          const updated=[...prev];
          updated[realIdx]={...updated[realIdx],linkedTrainerId:pending.trainerId,side:"player",nickname:pending.nickname||updated[realIdx].nickname};
          return updated;
        });
      },100);
    }
  },[entries.length]);

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

  /* Picking from the catalog either appends a tab or replaces the active one. */
  const setPanel=(slot:number,type:PanelType,addTab:boolean)=>{
    setGrid(prev=>{
      const n=[...prev];const cur=n[slot];
      if(!cur){n[slot]={id:`panel-${slot}-${Date.now()}`,tabs:[type],active:0};return n;}
      if(addTab){n[slot]={...cur,tabs:[...cur.tabs,type],active:cur.tabs.length};return n;}
      const tabs=[...cur.tabs];tabs[cur.active]=type;
      n[slot]={...cur,tabs};return n;
    });
  };
  const clearPanel=(slot:number)=>{
    setGrid(prev=>{const n=[...prev];n[slot]=null;return n;});
  };
  const selectTab=(slot:number,idx:number)=>{
    setGrid(prev=>{const n=[...prev];const c=n[slot];if(c)n[slot]={...c,active:idx};return n;});
  };
  /* Closing the last tab removes the panel entirely. */
  const closeTab=(slot:number,idx:number)=>{
    setGrid(prev=>{
      const n=[...prev];const c=n[slot];if(!c)return prev;
      const tabs=c.tabs.filter((_,i)=>i!==idx);
      n[slot]=tabs.length?{...c,tabs,active:Math.max(0,Math.min(c.active>=idx?c.active-1:c.active,tabs.length-1))}:null;
      return n;
    });
  };
  /* Drag a panel onto another slot; occupants swap. Spans are clamped to fit
     their new position so a wide panel can't overflow the grid edge. */
  const movePanel=(from:number,to:number)=>{
    if(from===to)return;
    setGrid(prev=>{
      const n=[...prev];
      const fit=(p:Panel|null,slot:number):Panel|null=>{
        if(!p)return null;
        const c=slot%cols,r=Math.floor(slot/cols);
        return {...p,colSpan:Math.max(1,Math.min(cols-c,p.colSpan??1)),rowSpan:Math.max(1,Math.min(rows-r,p.rowSpan??1))};
      };
      const a=n[from],b=n[to];
      n[to]=fit(a,to);n[from]=fit(b,from);
      return n;
    });
  };
  const setSpan=(slot:number,cs:number,rs:number)=>{
    setGrid(prev=>{
      const n=[...prev];const p=n[slot];if(!p)return prev;
      const c=slot%cols,r=Math.floor(slot/cols);
      const nc=Math.max(1,Math.min(cols-c,cs)),nr=Math.max(1,Math.min(rows-r,rs));
      if((p.colSpan??1)===nc&&(p.rowSpan??1)===nr)return prev;
      n[slot]={...p,colSpan:nc,rowSpan:nr};return n;
    });
  };
  /* ── Layout portability: file, URL, fullscreen ─────────────────────────────
     Only geometry travels — panel types and spans. Live state (combatants,
     notes) stays in localStorage so sharing a layout never leaks session data. */
  type Layout={v:1;cols:number;rows:number;grid:(Panel|null)[]};
  const currentLayout=useCallback( ():Layout=>({v:1,cols,rows,grid}),[cols,rows,grid]);
  const loadLayout=useCallback((raw:unknown)=>{
    const l=raw as Partial<Layout>;
    if(!l||!Array.isArray(l.grid))throw new Error("Not a GM Screen layout file");
    const c=clampDim(l.cols??DEFAULT_COLS,MIN_COLS,MAX_COLS);
    const r=clampDim(l.rows??DEFAULT_ROWS,MIN_ROWS,MAX_ROWS);
    const migrated=(l.grid as StoredPanel[]).map(migratePanel);
    setGrid(reflowGrid(migrated,c,c,r));
    setDims({cols:c,rows:r});
  },[]);

  const saveToFile=()=>{
    const blob=new Blob([JSON.stringify(currentLayout(),null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`pokerole-gm-screen-${new Date().toISOString().slice(0,10)}.json`;
    a.click();URL.revokeObjectURL(a.href);
    setMenuOpen(false);
  };
  const loadFromFile=(file:File)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      try{loadLayout(JSON.parse(String(fr.result)));setMenuOpen(false);}
      catch(err){window.alert(`Could not load that layout: ${(err as Error).message}`);}
    };
    fr.readAsText(file);
  };
  const copyShareUrl=async()=>{
    // encodeURIComponent first so non-ASCII survives btoa's latin1-only range.
    const enc=btoa(encodeURIComponent(JSON.stringify(currentLayout())));
    const url=`${window.location.origin}${window.location.pathname}#layout=${enc}`;
    try{await navigator.clipboard.writeText(url);window.alert("Shareable layout URL copied to clipboard.");}
    catch{window.prompt("Copy this layout URL:",url);}
    setMenuOpen(false);
  };
  /* Adopt a layout handed over in the URL hash, then strip it from the address
     bar. Also listens for hashchange: pasting a layout link into a tab that
     already has the GM Screen open is a same-document navigation, so without
     this the link would silently do nothing. */
  useEffect(()=>{
    const adopt=()=>{
      const m=window.location.hash.match(/layout=([^&]+)/);
      if(!m)return;
      try{loadLayout(JSON.parse(decodeURIComponent(atob(m[1]))));}
      catch{/* malformed link — keep the existing screen */}
      window.history.replaceState(null,"",window.location.pathname);
    };
    adopt();
    window.addEventListener("hashchange",adopt);
    return()=>window.removeEventListener("hashchange",adopt);
  },[loadLayout]);

  const [isFullscreen,setIsFullscreen]=useState(false);
  useEffect(()=>{
    const h=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",h);
    return()=>document.removeEventListener("fullscreenchange",h);
  },[]);
  const toggleFullscreen=()=>{
    if(document.fullscreenElement)document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(()=>{});
    setMenuOpen(false);
  };

  const applyDims=(nc:number,nr:number)=>{
    const c=clampDim(nc,MIN_COLS,MAX_COLS),r=clampDim(nr,MIN_ROWS,MAX_ROWS);
    setGrid(prev=>reflowGrid(prev,cols,c,r));
    setDims({cols:c,rows:r});
  };

  /* ── Pointer-driven move & resize ─────────────────────────────────────────────
     Both gestures track the pointer against the grid's own box and convert it to
     a cell coordinate, so panels follow the cursor rather than a pixel delta.
     Pointer events (rather than HTML5 drag-and-drop) keep this working on touch. */
  const gridRef=useRef<HTMLDivElement>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const resizeRef=useRef<{slot:number;axis:"x"|"y"|"xy"}|null>(null);
  const [resizingSlot,setResizingSlot]=useState<number|null>(null);
  const moveRef=useRef<number|null>(null);
  const [dragFrom,setDragFrom]=useState<number|null>(null);
  const [dragOver,setDragOver]=useState<number|null>(null);

  const slotFromPoint=useCallback((clientX:number,clientY:number):number|null=>{
    const el=gridRef.current;if(!el)return null;
    const rect=el.getBoundingClientRect();
    const PAD=2;
    const cellW=(rect.width-PAD*2)/cols, cellH=(rect.height-PAD*2)/rows;
    const c=Math.floor((clientX-rect.left-PAD)/cellW);
    const r=Math.floor((clientY-rect.top-PAD)/cellH);
    if(c<0||c>=cols||r<0||r>=rows)return null;
    return r*cols+c;
  },[cols,rows]);

  /* A cell hidden under a spanning panel resolves to that panel's own slot, so
     dropping anywhere on a wide panel swaps with the panel — not with a gap. */
  const anchorOf=useCallback((slot:number):number=>{
    const c=slot%cols,r=Math.floor(slot/cols);
    const owner=grid.findIndex((p,j)=>{
      if(!p)return false;
      const pc=j%cols,pr=Math.floor(j/cols);
      return c>=pc&&c<pc+(p.colSpan??1)&&r>=pr&&r<pr+(p.rowSpan??1);
    });
    return owner===-1?slot:owner;
  },[grid,cols]);

  useEffect(()=>{
    if(dragFrom===null)return;
    const onMove=(e:PointerEvent)=>{
      const s=slotFromPoint(e.clientX,e.clientY);
      setDragOver(s===null?null:anchorOf(s));
    };
    const onUp=(e:PointerEvent)=>{
      const s=slotFromPoint(e.clientX,e.clientY);
      if(s!==null&&moveRef.current!==null)movePanel(moveRef.current,anchorOf(s));
      moveRef.current=null;setDragFrom(null);setDragOver(null);
    };
    window.addEventListener("pointermove",onMove);
    window.addEventListener("pointerup",onUp);
    return()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);};
  // movePanel closes over `cols`/`rows` but always updates via the setState updater
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dragFrom,slotFromPoint,anchorOf]);

  const startMove=(slot:number)=>(e:React.PointerEvent)=>{
    e.preventDefault();e.stopPropagation();
    moveRef.current=slot;setDragFrom(slot);setDragOver(slot);
  };

  useEffect(()=>{
    if(resizingSlot===null)return;
    const onMove=(e:PointerEvent)=>{
      const rz=resizeRef.current, el=gridRef.current;
      if(!rz||!el)return;
      const rect=el.getBoundingClientRect();
      const PAD=2;
      const cellW=(rect.width-PAD*2)/cols, cellH=(rect.height-PAD*2)/rows;
      const c0=rz.slot%cols, r0=Math.floor(rz.slot/cols);
      const cx=Math.floor((e.clientX-rect.left-PAD)/cellW);
      const cy=Math.floor((e.clientY-rect.top-PAD)/cellH);
      const cur=grid[rz.slot];if(!cur)return;
      const cs=rz.axis==="y"?(cur.colSpan??1):cx-c0+1;
      const rs=rz.axis==="x"?(cur.rowSpan??1):cy-r0+1;
      setSpan(rz.slot,cs,rs);
    };
    const onUp=()=>{resizeRef.current=null;setResizingSlot(null);};
    window.addEventListener("pointermove",onMove);
    window.addEventListener("pointerup",onUp);
    return()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);};
  // setSpan is redefined each render but always reads fresh state via the updater
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[resizingSlot,cols,rows,grid]);

  const startResize=(slot:number,axis:"x"|"y"|"xy")=>(e:React.PointerEvent)=>{
    e.preventDefault();e.stopPropagation();
    resizeRef.current={slot,axis};setResizingSlot(slot);
  };

  // Every hook has run by here, so this early return is safe.
  if(!mounted)return <div style={{height:"100vh",background:"#35785F"}}/>;

  return (
    <PokedexFrame active="gm-screen" hideParty actions={
      /* The screen's own controls ride in the chassis's action slot, so they
         sit with the device keys rather than in a second bar of their own. */
      <div style={{display:"flex",gap:8,alignItems:"center",position:"relative"}}>
          {/* Grid dimensions — these sit on the blue system bar, so labels are white */}
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#F8F4D0",textShadow:"1px 1px 0 #183868"}}>
            <span>Grid</span>
            <input type="number" min={MIN_COLS} max={MAX_COLS} value={cols} onChange={e=>applyDims(Number(e.target.value),rows)}
              style={{width:40,background:"#35785F",border:"1px solid #2850A0",borderRadius:4,color:"#202020",padding:"3px 5px",fontSize:11}} title="Columns"/>
            <span>×</span>
            <input type="number" min={MIN_ROWS} max={MAX_ROWS} value={rows} onChange={e=>applyDims(cols,Number(e.target.value))}
              style={{width:40,background:"#35785F",border:"1px solid #2850A0",borderRadius:4,color:"#202020",padding:"3px 5px",fontSize:11}} title="Rows"/>
          </div>
          <button onClick={toggleFullscreen} style={{background:"rgba(0,0,0,0.20)",border:"1px solid rgba(255,255,255,0.5)",borderRadius:4,color:"#FFFFFF",textShadow:"1px 1px 0 #183868",padding:"4px 8px",fontSize:11,cursor:"pointer"}} title="Toggle fullscreen">
            {isFullscreen?"⤡ Exit":"⛶ Fullscreen"}
          </button>
          <button onClick={()=>setMenuOpen(o=>!o)} style={{background:"rgba(0,0,0,0.20)",border:"1px solid rgba(255,255,255,0.5)",borderRadius:4,color:"#FFFFFF",textShadow:"1px 1px 0 #183868",padding:"4px 8px",fontSize:11,cursor:"pointer"}}>☰ Menu</button>
          {menuOpen&&(
            <>
              <div style={{position:"fixed",inset:0,zIndex:400}} onClick={()=>setMenuOpen(false)}/>
              <div style={{position:"absolute",top:34,right:0,zIndex:401,background:"#FBF8E4",border:"1px solid #7888A8",borderRadius:8,padding:6,minWidth:190,boxShadow:"0 6px 20px rgba(0,0,0,0.5)"}}>
                <MenuItem label="💾 Save layout to file" onClick={saveToFile}/>
                <MenuItem label="📂 Load layout from file" onClick={()=>fileInputRef.current?.click()}/>
                <MenuItem label="🔗 Copy shareable URL" onClick={copyShareUrl}/>
                <div style={{height:1,background:"#2850A0",margin:"4px 0"}}/>
                <MenuItem danger label="✕ Reset screen"
                  onClick={()=>{if(window.confirm("Clear every panel from the screen?")){setGrid(Array(cols*rows).fill(null));setMenuOpen(false);}}}/>
              </div>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="application/json" style={{display:"none"}}
            onChange={e=>{const f=e.target.files?.[0];if(f)loadFromFile(f);e.target.value="";}}/>
        </div>
    }>
      {pickerSlot!==null&&<PanelPicker addTab={pickerSlot.addTab} onPick={(type)=>setPanel(pickerSlot.slot,type,pickerSlot.addTab)} onClose={()=>setPickerSlot(null)}/>}

      {/* First-run guidance — explains the grid and offers starter layouts */}
      {grid.every(p=>p===null)&&(
        <div style={{background:"#F8F4D0",borderBottom:"1px solid #2850A0",padding:"14px 16px",flexShrink:0,display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:"1 1 320px",minWidth:260}}>
            <div style={{fontSize:13,fontWeight:700,color:"#202020",marginBottom:4}}>Build your GM screen</div>
            <div style={{fontSize:11,color:"#383838",lineHeight:1.6}}>
              Click any <strong style={{color:"#a040a0"}}>+ Add Panel</strong> slot to drop in one of {PANEL_CATALOG.length} reference panels.
              Drag a panel by its <strong style={{color:"#585858"}}>⠿</strong> handle to move it, drag its right or bottom edge to resize,
              and use <strong style={{color:"#585858"}}>+</strong> in the header to stack extra tabs inside one panel.
              Set the grid size up top, and save, load or share your layout from <strong style={{color:"#585858"}}>☰ Menu</strong>.
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {GM_PRESETS.map(preset=>(
              <button key={preset.name}
                onClick={()=>setGrid(Array.from({length:cols*rows},(_,i)=>{
                  const t=preset.panels[i];
                  return t?{id:`panel-${i}-${Date.now()}`,tabs:[t],active:0}:null;
                }))}
                style={{background:"rgba(160,64,160,0.08)",border:"1px solid rgba(160,64,160,0.3)",borderRadius:4,padding:"8px 12px",cursor:"pointer",textAlign:"left",minWidth:150}}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(160,64,160,0.18)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(160,64,160,0.08)";}}>
                <div style={{fontSize:11,fontWeight:700,color:"#A040A0",marginBottom:2}}>{preset.icon} {preset.name}</div>
                <div style={{fontSize:10,color:"#585858"}}>{preset.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Panel grid — drag a header to move, drag an edge to resize, tabs per panel */}
      <div ref={gridRef} style={{flex:1,display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gridTemplateRows:`repeat(${rows},1fr)`,gap:2,padding:2,overflow:"hidden",background:"#C8C8B8",userSelect:(resizingSlot!==null||dragFrom!==null)?"none":undefined}}>
        {grid.map((panel,i)=>{
          const col=i%cols;const row=Math.floor(i/cols);
          // Skip slots hidden underneath a spanning panel
          const isCovered=grid.some((p,j)=>{
            if(!p||j===i)return false;
            const pc=j%cols;const pr=Math.floor(j/cols);
            const cs=p.colSpan??1;const rs=p.rowSpan??1;
            return col>=pc&&col<pc+cs&&row>=pr&&row<pr+rs;
          });
          if(isCovered)return null;
          const colSpan=panel?.colSpan??1;const rowSpan=panel?.rowSpan??1;
          const isDropTarget=dragOver===i&&dragFrom!==null&&dragFrom!==i;
          const cell:React.CSSProperties={
            background:"#F8F4D0",
            border:`1px solid ${isDropTarget?"#a040a0":resizingSlot===i?"#A040A0":"#2E6B58"}`,
            borderRadius:4,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",
            gridColumn:`${col+1}/span ${colSpan}`,gridRow:`${row+1}/span ${rowSpan}`,
            opacity:dragFrom===i?0.45:1,
            outline:isDropTarget?"2px dashed #a040a0":undefined,outlineOffset:-3,
          };
          return(
            <div key={i} style={cell}>
              {panel===null?(
                <button onClick={()=>setPickerSlot({slot:i,addTab:false})} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:"#2850A0",transition:"all 0.15s"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.color="#a040a0";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.color="#2850A0";}}>
                  <div style={{width:36,height:36,border:"2px solid currentColor",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>+</div>
                  <span style={{fontSize:11}}>Add Panel</span>
                </button>
              ):(()=>{
                const activeType=panel.tabs[panel.active]??panel.tabs[0];
                const meta=(t:PanelType)=>PANEL_CATALOG.find(p=>p.type===t);
                return(
                <>
                  {/* Header: drag handle + tab strip + panel actions */}
                  <div style={{display:"flex",alignItems:"stretch",gap:2,background:"#24523F",borderBottom:"1px solid #2E6B58",flexShrink:0}}>
                    {/* Header is a dark green strip, so every control on it is
                        light — except inside an active tab, which is cream. */}
                    <span onPointerDown={startMove(i)} title="Drag to move panel"
                      style={{display:"flex",alignItems:"center",padding:"0 4px 0 6px",color:dragFrom===i?"#E8B0E8":"#BCD8CC",fontSize:11,flexShrink:0,cursor:"grab",touchAction:"none"}}>⠿</span>
                    {/* Tabs */}
                    <div style={{display:"flex",alignItems:"stretch",gap:2,flex:1,overflowX:"auto",minWidth:0}}>
                      {panel.tabs.map((t,ti)=>{
                        const on=ti===panel.active;
                        return(
                          <div key={`${t}-${ti}`} onClick={()=>selectTab(i,ti)}
                            title={meta(t)?.label}
                            style={{display:"flex",alignItems:"center",gap:3,padding:"4px 6px",cursor:"pointer",flexShrink:0,maxWidth:150,
                              background:on?"#F8F4D0":"transparent",borderTop:`2px solid ${on?"#a040a0":"transparent"}`,color:on?"#202020":"#BCD8CC"}}>
                            <span style={{fontSize:11}}>{meta(t)?.icon}</span>
                            <span style={{fontSize:10,fontWeight:on?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meta(t)?.label}</span>
                            {/* Inherits the tab's own ink: dark on the cream active
                                tab, light on the dark header for inactive ones. */}
                            <button onClick={e=>{e.stopPropagation();closeTab(i,ti);}} title="Close tab"
                              style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:10,padding:"0 1px",lineHeight:1}}>✕</button>
                          </div>
                        );
                      })}
                      <button onClick={()=>setPickerSlot({slot:i,addTab:true})} title="Add a tab to this panel"
                        style={{background:"none",border:"none",color:"#D8E4F8",cursor:"pointer",fontSize:12,padding:"0 6px",flexShrink:0}}>+</button>
                    </div>
                    {/* Actions */}
                    <div style={{display:"flex",alignItems:"center",gap:2,padding:"0 5px",flexShrink:0}}>
                      <span style={{fontSize:8,color:"#BCD8CC",padding:"0 2px"}}>{colSpan}×{rowSpan}</span>
                      <PopoutButton panelType={activeType} panelLabel={meta(activeType)?.label||"Panel"}/>
                      <button onClick={()=>setPickerSlot({slot:i,addTab:false})} style={{background:"none",border:"none",color:"#D8E4F8",cursor:"pointer",fontSize:11,padding:"0 2px"}} title="Replace this tab">⇄</button>
                      <button onClick={()=>clearPanel(i)} style={{background:"none",border:"none",color:"#D8E4F8",cursor:"pointer",fontSize:12}} title="Remove panel">✕</button>
                    </div>
                  </div>
                  <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                    <PanelContent type={activeType} entries={entries} setEntries={setEntries} onAddToTracker={addPokemon} gmNotes={gmNotes} setGmNotes={setGmNotes}/>
                  </div>
                  {/* Resize handles — always present, since dragging inward shrinks
                      a panel that already reaches the grid edge. */}
                  <div onPointerDown={startResize(i,"x")} title="Drag to resize"
                    style={{position:"absolute",top:0,right:0,width:6,height:"100%",cursor:"col-resize",zIndex:3,touchAction:"none"}}/>
                  <div onPointerDown={startResize(i,"y")} title="Drag to resize"
                    style={{position:"absolute",left:0,bottom:0,height:6,width:"100%",cursor:"row-resize",zIndex:3,touchAction:"none"}}/>
                  <div onPointerDown={startResize(i,"xy")} title="Drag to resize"
                    style={{position:"absolute",right:0,bottom:0,width:14,height:14,cursor:"nwse-resize",zIndex:4,touchAction:"none",
                      background:"linear-gradient(135deg,transparent 50%,#2850A0 50%,#2850A0 70%,transparent 70%)"}}/>
                </>
                );
              })()}
            </div>
          );
        })}
      </div>
    </PokedexFrame>
  );
}

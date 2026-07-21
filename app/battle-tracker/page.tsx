"use client";
import React from "react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART, MISSINGNO, HABITATS,
  PokemonEntry, Move, PokemonType, Rank,
} from "../data/pokerole-data";
import type { ItemData } from "../data/pokerole-data";
import {
  STATUS_CONDITIONS, WEATHER_DATA, WeatherData,
  getDisobedienceLevel, getPainPenalty,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";

// ── Types ─────────────────────────────────────────────────────────────────────
const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};
type AttrSet={strength:number;dexterity:number;vitality:number;special:number;insight:number};
interface StatMod{source:string;attr:string;amount:number;appliedBy?:string;}
interface AbilityState{name:string;active:boolean;}
interface BattleEntry{
  id:string; pokemon:PokemonEntry; nickname:string;
  initiative:number; currentHp:number; maxHp:number; currentWill:number; maxWill:number;
  loyalty:number; happiness:number;
  statuses:string[];   // array of active status conditions (no duplicates)
  statusTurnsLeft:number;
  notes:string; isExpanded:boolean; hasTakenTurn:boolean;
  side:"player"|"enemy"|"neutral"; trainerRank:Rank;
  abilities:AbilityState[]; moves:Move[];
  attrs:AttrSet; statMods:StatMod[];
  weatherImmune:boolean; actionCount:number;
  reactionUsed:boolean;
  pokemonSkills?:{brawl:number;channel:number;clash:number;evasion:number;alert:number;athletic:number;nature:number;stealth:number;intimidate:number;perform:number};
  linkedTrainerId?:string; linkedPokemonSheetKey?:string; showTrainerView?:boolean;
  isProtected?:boolean;            // Protect: blocks incoming attacks this round
  morphedTo?:PokemonEntry;         // Transform: copied target's pokemon
  originalAttrs?:AttrSet;          // saved before transform to allow revert
  originalMoves?:Move[];           // saved before transform
  hasSubstitute?:boolean;          // Substitute up
  substituteHp?:number;            // HP remaining in substitute
  // ── Advanced mechanics ──────────────────────────────────────
  isMegaEvolved?:boolean;          // Mega Evolution active
  megaOriginalAttrs?:AttrSet;      // pre-mega attrs for revert
  isDynamaxed?:boolean;            // Dynamax/Gigamax active
  dynamaxRoundsLeft?:number;       // 3→0, decrements each Next Turn
  dynamaxExtraHpCur?:number;       // current extra HP pool
  isGigamax?:boolean;
  isTerastallized?:boolean;
  teraType?:string;                // chosen tera affinity type
  teraFirstMoveBonusUsed?:boolean; // +3/+2 first move bonus spent
  zMoveUsed?:boolean;              // Z-Move activated this battle
  trainerCurrentHp?:number;       // trainer HP tracked separately when linked
  trainerCurrentWp?:number;       // trainer WP tracked separately when linked
  // ── Support move effects ─────────────────────────────────────────────────
  abilityOverride?:string;        // Role Play / Skill Swap / Entrainment
  abilitySuppressed?:boolean;     // Gastro Acid / Simple Beam / Worry Seed
  typeOverride?:string[];         // Soak / Trick-Or-Treat / Forest's Curse / Camouflage
  heldItem?:string;               // tracked held item for Trick/Bestow/Embargo
  itemEmbargoed?:boolean;         // Embargo: cannot use items
  isFollowMeTarget?:boolean;      // Follow Me / Spotlight: all moves redirect here
  chargeActive?:boolean;          // Charge: +2 to next Electric move
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function TypeBadge({type,small}:{type:PokemonType;small?:boolean}){
  const bg = TYPE_COLORS[type]||"#888870";
  // Fairy gets a pink gradient; others use the flat type color
  const background = type==="Fairy"
    ? "linear-gradient(180deg,#F8B8F0 0%,#E898E0 60%,#D878C8 100%)"
    : bg;
  return <span title={type} style={{
    display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0,
    padding: small ? "0 3px" : "0 5px",
    height: small ? 11 : 15,
    background,
    border:"1px solid #282828",color:"#F8F8F8",
    fontSize: small ? 5 : 7,
    fontFamily:"'Press Start 2P',monospace",
    letterSpacing:"-0.5px",textShadow:"1px 1px 0 #282828",
    whiteSpace:"nowrap",
  }}>{type.toUpperCase()}</span>;
}

// Status condition sprites from frlg-status.png (128×96)
const STATUS_SPRITE_COORDS: Partial<Record<string,{x:number;y:number}>> = {
  "Poisoned":       {x:0,  y:80},
  "Paralyzed":      {x:32, y:80},
  "Asleep":         {x:64, y:80},
  "Frozen":         {x:96, y:80},
  "Burned":         {x:0,  y:88},
  "Badly Poisoned": {x:32, y:88},
  "Fainted":        {x:64, y:88},
};
const STATUS_IMG_W=128, STATUS_IMG_H=96, STATUS_BADGE_W=32, STATUS_BADGE_H=9;

function StatusBadge({status,onRemove}:{status:string;onRemove?:()=>void}){
  const sp=STATUS_SPRITE_COORDS[status];
  const sc=(STATUS_CONDITIONS as Record<string,any>)[status];
  const scale=1.5;
  return(
    <span title={sc?.fullDesc||sc?.battleEffect||status} style={{display:"inline-flex",alignItems:"center",gap:1,flexShrink:0}}>
      {sp?(
        <div style={{display:"inline-block",
          width:STATUS_BADGE_W*scale, height:STATUS_BADGE_H*scale,
          backgroundImage:"url('/assets/frlg-status.png')",
          backgroundPosition:`-${sp.x*scale}px -${sp.y*scale}px`,
          backgroundSize:`${STATUS_IMG_W*scale}px ${STATUS_IMG_H*scale}px`,
          imageRendering:"pixelated"}}/>
      ):(
        <span style={{fontSize:7,color:"#F8F8E8",background:sc?.color??"#888870",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}}>
          {status.slice(0,3).toUpperCase()}
        </span>
      )}
      {onRemove&&<button onClick={onRemove} style={{background:"none",border:"none",color:"#F8D8F8",cursor:"pointer",fontSize:8,padding:"0 1px",lineHeight:1}}>×</button>}
    </span>
  );
}
// Offline battle sprite (front/back) — files live in /public/sprites/pokemon.
// Mixed tiers (64×64 FRLG vs 96×96 gen5/default) are bottom-aligned in a fixed box so
// every mon's feet sit on the platform regardless of source dimensions.
function PokeSprite({number,back,boxW=160,boxH=150,fainted}:{number:number;back?:boolean;boxW?:number;boxH?:number;fainted?:boolean}){
  const [broken,setBroken]=useState(false);
  return(
    <div style={{width:boxW,height:boxH,display:"flex",alignItems:"flex-end",justifyContent:"center",pointerEvents:"none"}}>
      {!broken&&number>0&&(
        <img src={`/sprites/pokemon/${back?"back/":""}${number}.png`} alt="" draggable={false}
          onError={()=>setBroken(true)}
          style={{maxWidth:"100%",maxHeight:"100%",imageRendering:"pixelated",objectFit:"contain",
            filter:fainted?"grayscale(1) brightness(1.15)":"drop-shadow(0 3px 2px rgba(0,0,0,0.35))",
            opacity:fainted?0.4:1,transition:"opacity 0.3s"}}/>
      )}
    </div>
  );
}
// Cream HP nameplate in the FireRed battle-screen style. Enemy plates omit HP numbers
// (as in-game); player plates show HP n/n + WP n/n.
function SceneNameplate({entry,enemy,onClick}:{entry:BattleEntry;enemy?:boolean;onClick?:()=>void}){
  const name=(entry.nickname||entry.pokemon.name).toUpperCase();
  const sts=(entry.statuses||[]).filter(s=>s!=="Healthy");
  const rank=entry.trainerRank||entry.pokemon.suggestedRank;
  return(
    <div onClick={onClick} style={{background:"#F0ECD4",border:"2px solid #181818",boxShadow:"3px 3px 0 rgba(24,16,8,0.45)",padding:"5px 9px 6px",minWidth:enemy?188:210,cursor:onClick?"pointer":"default",fontFamily:"'Press Start 2P',monospace"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
        <span style={{fontSize:9,fontWeight:700,color:"#181818",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
        <span style={{fontSize:7,color:entry.side==="player"?"#2858C0":"#D82808"}}>{rank}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <span style={{fontSize:8,fontWeight:700,color:"#C8A000",WebkitTextStroke:"0.4px #705000"}}>HP</span>
        <div style={{flex:1}}><HpBar cur={entry.currentHp} max={entry.maxHp}/></div>
      </div>
      {!enemy&&(
        <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3}}>
          <span style={{fontSize:8,fontWeight:700,color:"#2858C0"}}>WP</span>
          <div style={{flex:1}}><HpBar cur={entry.currentWill} max={entry.maxWill} isWp/></div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:enemy?"flex-end":"space-between",alignItems:"center",gap:4,marginTop:4}}>
        {!enemy&&<span style={{fontSize:8,color:entry.currentHp/entry.maxHp>0.5?"#187028":entry.currentHp/entry.maxHp>0.25?"#807008":"#A00808",fontWeight:700}}>{entry.currentHp}/{entry.maxHp}</span>}
        <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap"}}>
          {sts.map(s=><StatusBadge key={s} status={s}/>)}
          {entry.isProtected&&<span style={{fontSize:7,color:"#F8F8E8",background:"#2858C0",border:"1px solid #181818",padding:"1px 3px"}}>PROT</span>}
        </div>
      </div>
    </div>
  );
}
// A Pokémon standing on a FireRed-style grass platform. The sprite's feet are pinned to
// the platform's mid-line so it sits correctly regardless of the sprite's source size.
function FieldMon({number,back,fainted,onClick}:{number:number;back?:boolean;fainted?:boolean;onClick?:()=>void}){
  const w=back?250:220, h=back?176:150, plat=back?58:48;
  return(
    <div onClick={onClick} style={{position:"relative",width:w,height:h,cursor:onClick?"pointer":"default"}}>
      <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:w,height:plat,borderRadius:"50%",
        background:"radial-gradient(ellipse at 50% 38%, #C8E4A8 0%, #A8D088 45%, #7CAC54 100%)",
        boxShadow:"inset 0 -5px 7px rgba(72,108,44,0.55)",border:"1px solid rgba(80,100,40,0.35)"}}/>
      <div style={{position:"absolute",bottom:Math.round(plat/2),left:0,right:0,display:"flex",justifyContent:"center"}}>
        <PokeSprite number={number} back={back} boxW={back?214:180} boxH={back?176:150} fainted={fainted}/>
      </div>
    </div>
  );
}
function rollDice(n:number):{rolls:number[];successes:number}{
  const p=Math.max(1,n);
  const rolls=Array.from({length:p},()=>Math.floor(Math.random()*6)+1);
  return{rolls,successes:rolls.filter(r=>r>=4).length};
}
// Compatibility: get primary status from statuses array (first non-Healthy)
function primaryStatus(e:{statuses?:string[];status?:string}):string{
  if(e.statuses&&e.statuses.length>0)return e.statuses[0];
  return (e as any).status||"Healthy";
}
function addStatus(statuses:string[],s:string):string[]{
  if(!s||s==="Healthy"||statuses.includes(s))return statuses;
  return [...statuses.filter(x=>x!=="Healthy"),s];
}
function removeStatus(statuses:string[],s:string):string[]{
  const r=statuses.filter(x=>x!==s);
  return r.length===0?["Healthy"]:r;
}

function HpBar({cur,max,isWp}:{cur:number;max:number;isWp?:boolean}){
  const pct=max>0?Math.max(0,Math.min(1,cur/max)):0;
  const barColor=isWp?"#4878F8":pct>0.5?"#58D838":pct>0.25?"#F8C800":"#F82000";
  const hlColor=isWp?"#80A8FF":pct>0.5?"#A0F060":pct>0.25?"#FFE840":"#FF6040";
  return(
    <div style={{background:"#303030",border:"1px solid #181818",height:7,overflow:"hidden",position:"relative"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,#505050 0%,#282828 100%)"}}/>
      <div style={{position:"relative",width:`${pct*100}%`,height:"100%",background:barColor,transition:"width 0.3s"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:hlColor,opacity:0.6}}/>
      </div>
    </div>
  );
}
const adjBtn:React.CSSProperties={width:20,height:20,background:"#1a1d27",border:"1px solid #3a4060",borderRadius:3,color:"#00d4aa",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"};

function getEffectiveAttrs(e:BattleEntry):AttrSet{
  const sc=STATUS_CONDITIONS[primaryStatus(e)];const accPen=sc?.accuracyPenalty??0;
  const pain=getPainPenalty(e.currentHp,e.maxHp);
  const mods=e.statMods.reduce<Partial<AttrSet>>((acc,m)=>{const k=m.attr as keyof AttrSet;if(k in e.attrs)acc[k]=(acc[k]??e.attrs[k])+m.amount;return acc;},{});
  return{strength:Math.max(0,(mods.strength??e.attrs.strength)-pain),dexterity:Math.max(0,(mods.dexterity??e.attrs.dexterity)-accPen-pain),vitality:Math.max(0,mods.vitality??e.attrs.vitality),special:Math.max(0,(mods.special??e.attrs.special)-pain),insight:Math.max(0,(mods.insight??e.attrs.insight)-pain)};
}

type PokemonSkills={brawl:number;channel:number;clash:number;evasion:number;alert:number;athletic:number;nature:number;stealth:number;intimidate:number;perform:number};
function calcAccPool(move:Move,attrs:AttrSet,weather?:WeatherData,skills?:Partial<PokemonSkills>):number{
  const acc=move.accuracy.toLowerCase();let p=0;
  if(acc.includes("strength"))p+=attrs.strength;
  if(acc.includes("dexterity"))p+=attrs.dexterity;
  if(acc.includes("special"))p+=attrs.special;
  if(acc.includes("insight"))p+=attrs.insight;
  if(acc.includes("vitality"))p+=attrs.vitality;
  // Add skill rank — use actual value if non-zero, else fall back to fixed defaults
  const sk=(k:keyof PokemonSkills)=>skills?.[k]||((k==="brawl"||k==="channel"||k==="athletic"||k==="perform"||k==="clash")?2:1);
  if(acc.includes("brawl"))p+=sk("brawl");
  else if(acc.includes("athletic"))p+=sk("athletic");
  else if(acc.includes("channel"))p+=sk("channel");
  else if(acc.includes("perform"))p+=sk("perform");
  else if(acc.includes("clash"))p+=sk("clash");
  else if(acc.includes("alert"))p+=sk("alert");
  else if(acc.includes("intimidate"))p+=sk("intimidate");
  else if(acc.includes("stealth"))p+=sk("stealth");
  else if(acc.includes("nature"))p+=sk("nature");
  else p+=1; // unknown skill — minimal bonus
  if(weather?.accuracyPenalty)p=Math.max(0,p-weather.accuracyPenalty);
  return Math.max(1,p);
}

function calcDmgPool(move:Move,attrs:AttrSet,weather:WeatherData,stab:boolean,abilBonus:number,loyalty:number,happiness:number):number{
  const dmg=move.damagePool.toLowerCase();
  if(dmg==="-")return 0;
  let p=0;
  // Handle special cases first
  if(dmg.includes("samedmg")||dmg.includes("sameasbasepower")){
    // Power is loyalty+happiness (e.g. Acid Downpour)
    const pw=move.power.toLowerCase();
    if(pw.includes("happiness")&&pw.includes("loyalty"))p=happiness+loyalty;
    else if(pw.includes("loyalty"))p=loyalty;
    else if(pw.includes("happiness"))p=happiness;
    else{const pm=move.power.match(/(\d+)/);if(pm)p+=parseInt(pm[1]);}
    // Also add any extra "+loyalty"/"+ happiness" in damagePool itself
    if(dmg.includes("loyalty"))p+=loyalty;
    if(dmg.includes("happiness"))p+=happiness;
    // Subtract the duplicate we just added
    const pwL=pw.includes("loyalty")?loyalty:0;const pwH=pw.includes("happiness")?happiness:0;
    p=Math.max(1,p);
  } else {
    if(dmg.includes("strength"))p+=attrs.strength;
    if(dmg.includes("special"))p+=attrs.special;
    if(dmg.includes("loyalty"))p+=loyalty;
    if(dmg.includes("happiness"))p+=happiness;
    const pm=move.power.match(/(\d+)/);
    if(pm&&!move.power.toLowerCase().includes("loyalty")&&!move.power.toLowerCase().includes("happiness"))p+=parseInt(pm[1]);
    else if(move.power.toLowerCase().includes("happiness")&&move.power.toLowerCase().includes("loyalty"))p+=happiness+loyalty;
    else if(move.power.toLowerCase().includes("loyalty"))p+=loyalty;
    else if(move.power.toLowerCase().includes("happiness"))p+=happiness;
  }
  if(stab)p+=1;
  if(weather.typeBoost===move.type&&weather.typeBoostDice)p+=weather.typeBoostDice;
  if(weather.typeWeaken===move.type&&weather.typeWeakenDice)p=Math.max(1,p-weather.typeWeakenDice);
  return Math.max(1,p+abilBonus);
  // Tera bonus: +1 die after first move bonus; caller adds first-move bonus separately
  // Dynamax Max Moves: +2 acc and dmg dice (handled in MovePopup for now)
}

function getTypeMult(mt:PokemonType,dts:PokemonType[]):{label:string;color:string;mod:number}{
  let w=false,r=false,i=false;
  dts.forEach(dt=>{const c=TYPE_CHART[dt];if(c?.weaknesses?.includes(mt))w=true;if(c?.resistances?.includes(mt))r=true;if(c?.immunities?.includes(mt))i=true;});
  if(i)return{label:"Immune",color:"#5a6080",mod:-999};
  if(w)return{label:"Super Effective ×2",color:"#ff4757",mod:2};
  if(r)return{label:"Not very effective −2",color:"#00d4aa",mod:-1};
  return{label:"Normal",color:"#8b90a8",mod:0};
}

function calcAbilityBonus(entry:BattleEntry,move:Move,weather:WeatherData):{bonus:number;reasons:string[]}{
  const res={bonus:0,reasons:[] as string[]};
  const mt=move.type as PokemonType;const atHalf=entry.currentHp<=entry.maxHp/2;const isP=move.category==="Physical";
  entry.abilities.filter(a=>a.active).forEach(ab=>{const n=ab.name;
    if((n==="Blaze"&&mt==="Fire")||(n==="Overgrow"&&mt==="Grass")||(n==="Torrent"&&mt==="Water")||(n==="Swarm"&&mt==="Bug")){if(atHalf){res.bonus+=2;res.reasons.push(`${n} +2 (HP≤50%)`);}}
    else if(n==="Technician"&&move.power!=="-"&&parseInt(move.power)<=2){res.bonus+=2;res.reasons.push("Technician +2");}
    else if((n==="Huge Power"||n==="Pure Power")&&isP){res.bonus+=2;res.reasons.push(`${n} +2`);}
    else if(n==="Tough Claws"&&isP){res.bonus+=2;res.reasons.push("Tough Claws +2");}
    else if(n==="Iron Fist"&&move.effect.toLowerCase().includes("punch")){res.bonus+=2;res.reasons.push("Iron Fist +2");}
    else if(n==="Strong Jaw"&&move.effect.toLowerCase().includes("bite")){res.bonus+=2;res.reasons.push("Strong Jaw +2");}
    else if(n==="Transistor"&&mt==="Electric"){res.bonus+=2;res.reasons.push("Transistor +2");}
    else if(n==="Guts"&&isP&&primaryStatus(entry)!=="Healthy"){res.bonus+=2;res.reasons.push(`Guts +2 (${primaryStatus(entry)})`);}
    else if(n==="Gorilla Tactics"&&isP){res.bonus+=2;res.reasons.push("Gorilla Tactics +2");}
    else if(n==="Flash Fire"&&mt==="Fire"){res.bonus+=2;res.reasons.push("Flash Fire +2");}
    else if(n==="Dark Aura"&&mt==="Dark"){res.bonus+=1;res.reasons.push("Dark Aura +1");}
    else if(n==="Fairy Aura"&&mt==="Fairy"){res.bonus+=1;res.reasons.push("Fairy Aura +1");}
    else if(n==="Adaptability"&&entry.pokemon.types.includes(mt)){res.bonus+=1;res.reasons.push("Adaptability +1");}
    else if(n==="Sniper"){res.reasons.push("Sniper: crits +2");}
    else if(n==="Parental Bond"&&move.category!=="Support"){res.reasons.push("Parental Bond: hits twice");}
    // Weather-boosted abilities
    else if(n==="Solar Power"&&mt==="Fire"&&weather.name==="Sunny"){res.bonus+=2;res.reasons.push("Solar Power +2 (Sunny)");}
    else if(n==="Chlorophyll"&&weather.name==="Sunny"){res.reasons.push("Chlorophyll: DEX+2 in Sunny (apply manually)");}
    else if(n==="Swift Swim"&&weather.name==="Rain"){res.reasons.push("Swift Swim: DEX+2 in Rain (apply manually)");}
    else if(n==="Sand Rush"&&weather.name==="Sandstorm"){res.reasons.push("Sand Rush: DEX+2 in Sandstorm (apply manually)");}
    else if(n==="Sand Force"&&weather.name==="Sandstorm"&&(mt==="Rock"||mt==="Ground"||mt==="Steel")){res.bonus+=2;res.reasons.push("Sand Force +2 (Sandstorm)");}
    else if(n==="Slush Rush"&&(weather.name==="Hail"||weather.name==="Snow")){res.reasons.push("Slush Rush: DEX+2 in Snow/Hail (apply manually)");}
    else if(n==="Ice Body"&&(weather.name==="Hail"||weather.name==="Snow")){res.reasons.push("Ice Body: +1 HP per round in Snow/Hail (track manually)");}
    else if(n==="Rain Dish"&&weather.name==="Rain"){res.reasons.push("Rain Dish: +1 HP per round in Rain (track manually)");}
    // Type-based damage boosts
    else if((n==="Aerilate")&&mt==="Normal"){res.reasons.push("Aerilate: becomes Flying (change type manually)");}
    else if((n==="Refrigerate")&&mt==="Normal"){res.reasons.push("Refrigerate: becomes Ice (change type manually)");}
    else if((n==="Pixilate")&&mt==="Normal"){res.reasons.push("Pixilate: becomes Fairy (change type manually)");}
    else if((n==="Galvanize")&&mt==="Normal"){res.reasons.push("Galvanize: becomes Electric (change type manually)");}
    else if(n==="Sheer Force"&&move.effect.toLowerCase().match(/chance|may|roll.*chance/)){res.bonus+=2;res.reasons.push("Sheer Force +2 (bonus effect removed)");}
    else if(n==="Reckless"&&move.effect.toLowerCase().includes("recoil")){res.bonus+=2;res.reasons.push("Reckless +2 (recoil move)");}
    else if(n==="Mega Launcher"&&move.effect.toLowerCase().includes("pulse")){res.bonus+=2;res.reasons.push("Mega Launcher +2 (pulse move)");}
    else if(n==="Liquid Voice"&&move.effect.toLowerCase().includes("sound")){res.reasons.push("Liquid Voice: move becomes Water-type");}
    else if((n==="Overpowered")&&isP){res.bonus+=2;res.reasons.push("Overpowered +2");}
    else if(n==="Defiant"&&entry.statMods.some(m=>m.amount<0)){res.bonus+=2;res.reasons.push("Defiant +2 (stat was lowered)");}
    else if(n==="Competitive"&&entry.statMods.some(m=>m.amount<0)){res.bonus+=2;res.reasons.push("Competitive +2 (stat was lowered)");}
    else if(n==="Analytic"&&move.priority===0){res.bonus+=1;res.reasons.push("Analytic +1 (lower initiative — apply if slower)");}
    else if(n==="Compound Eyes"&&move.accuracy.toLowerCase().includes("low")){res.bonus+=2;res.reasons.push("Compound Eyes +2 (low accuracy move)");}
    // Contact/on-hit abilities (informational for defender)
    else if(n==="Flame Body"&&isP){res.reasons.push("Flame Body: attacker rolls 3 chance dice → Burn on contact");}
    else if(n==="Static"&&isP){res.reasons.push("Static: attacker rolls 3 chance dice → Paralyze on contact");}
    else if(n==="Poison Point"&&isP){res.reasons.push("Poison Point: attacker rolls 3 chance dice → Poison on contact");}
    else if(n==="Rough Skin"||n==="Iron Barbs"){if(isP)res.reasons.push(`${n}: attacker takes 1 damage on contact`);}
    else if(n==="Rocky Helmet"){if(isP)res.reasons.push("Rocky Helmet: attacker takes 1 damage on contact");}
    // Screen/utility
    else if(n==="Prankster"&&move.category==="Support"){res.reasons.push("Prankster: this Support move gets Priority 1");}
    else if(n==="Gale Wings"&&mt==="Flying"){res.reasons.push("Gale Wings: this Flying move gets Reaction 1 priority");}
    else if(n==="Mold Breaker"||n==="Teravolt"||n==="Turboblaze"){res.reasons.push(`${n}: ignores target's ability`);}
    else if(n==="Scrappy"&&(mt==="Normal"||mt==="Fight")){res.reasons.push("Scrappy: Normal/Fighting hits Ghost-types");}
    else if(n==="Normalize"){res.reasons.push("Normalize: this move is treated as Normal-type");}
    else if(n==="No Guard"){res.reasons.push("No Guard: this move and incoming moves never miss");}
    else if(n==="Magic Guard"){res.reasons.push("Magic Guard: no indirect damage (weather, status, hazards)");}
    else if(n==="Levitate"){res.reasons.push("Levitate: immune to Ground-type moves and entry hazards");}
    else if(n==="Wonder Guard"){res.reasons.push("Wonder Guard: only super-effective moves deal damage");}
    else if(n==="Intimidate"&&entry.statMods.length===0){res.reasons.push("Intimidate: lowers foe's STR by 1 when entering battle");}
    else if(n==="Download"){res.reasons.push("Download: raises STR or SPC based on foe's lower defense");}
    else if(n==="Speed Boost"){res.reasons.push("Speed Boost: DEX +1 each round (track manually)");}
    else if(n==="Beast Boost"){res.reasons.push("Beast Boost: best stat +1 after KO (apply manually)");}
  });
  return res;
}

function moveTargetsSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  if(move.name==="Transform")return false; // Transform needs to select a COPY target
  return e.startsWith("target self")||e.includes("targets self")||
         (e.includes("self.")&&(e.includes("increase")||e.includes("defense")||e.includes("evasion")))||
         move.name==="Harden"||move.name==="Substitute"||move.name==="Baton Pass"||move.name==="Imprison";
}
function moveSelfDestructsAll(move:Move):boolean{
  return move.name==="Self-Destruct"||move.name==="Explosion"||move.effect.toLowerCase().includes("self-destructs");
}
function isMoveAOE(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("area move")||e.includes("target all")||e.includes("all foes")||
         e.includes("all allies")||e.includes("target battlefield")||e.includes("battlefield")||
         e.includes(",all.")||moveSelfDestructsAll(move);
}
function moveUserFaints(move:Move):boolean{
  return move.effect.toLowerCase().includes("user faints")||move.effect.toLowerCase().includes("lethal")||
         moveSelfDestructsAll(move);
}
function moveHealsSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("basic heal")||(e.includes("heal")&&(e.includes("user")||e.startsWith("target self")))||
         ["Recover","Moonlight","Synthesis","Rest","Roost","Slack Off","Soft-Boiled","Milk Drink","Swallow"].includes(move.name);
}
function moveHealsTarget(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return (e.includes("heal")&&(e.includes("ally")||e.includes("target one")))||
         ["Floral Healing","Heal Pulse","Life Dew","Wish"].includes(move.name);
}
function moveAppliesStatus(move:Move):string|null{
  const e=move.effect.toLowerCase();
  if(e.includes("poison those affected")||e.includes("target is poisoned")||e.includes("badly poison"))return"Poisoned";
  if(e.includes("burn")&&(e.includes("inflict")||e.includes("may")))return"Burned";
  if(e.includes("paralyze"))return"Paralyzed";
  if(e.includes("put to sleep")||e.includes("falls asleep"))return"Asleep";
  if(e.includes("freeze")&&e.includes("inflict"))return"Frozen";
  if(e.includes("confuse"))return"Confused";
  if(e.includes("flinch"))return"Flinched";
  return null;
}
function moveSetsWeather(move:Move):string|null{
  const e=move.effect.toLowerCase();const n=move.name.toLowerCase();
  if(n==="sunny day"||n==="max flare"||e.includes("activate sunny"))return"Sunny";
  if(n==="rain dance"||n==="max geyser"||e.includes("activate rain"))return"Rain";
  if(n==="sandstorm"||n==="max rockfall"||e.includes("activate sandstorm"))return"Sandstorm";
  if(n==="hail"||n==="snow"||n==="max hailstorm"||e.includes("activate hail")||e.includes("snow weather"))return"Hail";
  if(n==="fog"||e.includes("activate fog"))return"Fog";
  return null;
}
function moveHasRecoil(move:Move):boolean{
  return move.effect.toLowerCase().includes("recoil")||move.name==="Wave Crash"||move.name==="Double-Edge"||move.name==="Head Smash"||move.name==="Flare Blitz";
}

function moveIsTransform(move:Move):boolean{return move.name==="Transform"||move.effect.toLowerCase().includes("transform into");}
function moveIsReflectType(move:Move):boolean{return move.name==="Reflect Type"||move.effect.toLowerCase().includes("change the user's type to match");}
function moveIsMetronome(move:Move):boolean{return move.name==="Metronome";}
function moveIsBatonPass(move:Move):boolean{return move.name==="Baton Pass"||move.effect.toLowerCase().includes("switcher move");}
function moveIsImprison(move:Move):boolean{return move.name==="Imprison";}
function movePowerSplit(move:Move):boolean{return move.name==="Power Split"||move.effect.toLowerCase().includes("average the user");}
function movePowerSwap(move:Move):boolean{return move.name==="Power Swap"||move.effect.toLowerCase().includes("switch the user's strength and special with the target");}
function moveIsStatsReset(move:Move):boolean{
  return move.name==="Haze"||move.name==="Clear Smog"||(move.effect.toLowerCase().includes("reset all")&&move.effect.toLowerCase().includes("attrib"));
}
function moveIsEntryHazard(move:Move):boolean{
  return ["Spikes","Stealth Rock","Toxic Spikes","Sticky Web"].includes(move.name)||move.effect.toLowerCase().includes("entry hazard");
}
function moveIsDisableLock(move:Move):boolean{
  return ["Disable","Encore","Taunt","Torment"].includes(move.name);
}
function moveIsCounter(move:Move):boolean{
  return ["Counter","Mirror Coat","Metal Burst"].includes(move.name)||move.effect.toLowerCase().includes("late reaction 5");
}
function moveIsTwoTurn(move:Move):boolean{
  return move.effect.toLowerCase().includes("two-turn")||
         move.effect.toLowerCase().includes("digs underground")||
         move.effect.toLowerCase().includes("flies up high")||
         move.effect.toLowerCase().includes("bounces up")||
         move.effect.toLowerCase().includes("dives underwater")||
         move.effect.toLowerCase().includes("charges");
}
function moveIsMultiHit(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("hits twice")||e.includes("2 to 5")||e.includes("three times")||e.includes("consecutively");
}
function moveIsProtectScreen(move:Move):boolean{
  return ["Reflect","Light Screen","Aurora Veil","Safeguard","Mist"].includes(move.name);
}
function moveIsCopyMove(move:Move):boolean{
  return ["Copycat","Mirror Move","Me First","Mimic","Assist"].includes(move.name);
}
function moveIsWish(move:Move):boolean{
  return move.name==="Wish";
}
function moveIsPerishSong(move:Move):boolean{
  return move.name==="Perish Song";
}
function moveIsTrap(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("trap")&&e.includes("cannot switch")||["Wrap","Bind","Fire Spin","Whirlpool","Clamp","Sand Tomb","Infestation","Magma Storm"].includes(move.name);
}
function moveDrainsHP(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("drain")&&e.includes("user")||["Absorb","Mega Drain","Giga Drain","Leech Life","Draining Kiss","Oblivion Wing","Strength Sap","Horn Leech"].includes(move.name);
}
function moveIsGrudge(move:Move):boolean{
  return move.name==="Grudge"||move.name==="Spite";
}
function moveIsTrickRoom(move:Move):boolean{
  return move.name==="Trick Room"||move.name==="Magic Room"||move.name==="Wonder Room";
}
function moveIsForesight(move:Move):boolean{
  return ["Foresight","Odor Sleuth","Miracle Eye"].includes(move.name);
}
function moveIsRolePlay(move:Move):boolean{return move.name==="Role Play";}
function moveIsSkillSwap(move:Move):boolean{return move.name==="Skill Swap";}
function moveIsEntrainment(move:Move):boolean{return move.name==="Entrainment";}
function moveIsDoodle(move:Move):boolean{return move.name==="Doodle";}
function moveSuppressesAbility(move:Move):boolean{return ["Simple Beam","Worry Seed","Gastro Acid"].includes(move.name);}
function moveIsSoak(move:Move):boolean{return move.name==="Soak";}
function moveIsTrickOrTreat(move:Move):boolean{return move.name==="Trick-Or-Treat";}
function moveIsForestsCurse(move:Move):boolean{return move.name==="Forest's Curse";}
function moveIsCamouflage(move:Move):boolean{return move.name==="Camouflage";}
function moveSetsTerrain(move:Move):boolean{return ["Electric Terrain","Grassy Terrain","Misty Terrain","Psychic Terrain"].includes(move.name);}
function moveIsTrick(move:Move):boolean{return ["Trick","Switcheroo"].includes(move.name);}
function moveIsBestow(move:Move):boolean{return move.name==="Bestow";}
function moveIsEmbargo(move:Move):boolean{return move.name==="Embargo";}
function moveIsCorrosiveGas(move:Move):boolean{return move.name==="Corrosive Gas";}
function moveIsBellyDrum(move:Move):boolean{return move.name==="Belly Drum";}
function moveIsClangorousSoul(move:Move):boolean{return move.name==="Clangorous Soul";}
function moveIsFilletAway(move:Move):boolean{return move.name==="Fillet Away";}
function moveIsFollowMe(move:Move):boolean{return ["Follow Me","Spotlight","Rage Powder"].includes(move.name);}
function moveIsAfterYou(move:Move):boolean{return move.name==="After You";}
function moveIsAttract(move:Move):boolean{return move.name==="Attract";}
function moveIsAcupressure(move:Move):boolean{return move.name==="Acupressure";}
function moveIsCharge(move:Move):boolean{return move.name==="Charge";}

function statAppliestoSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("increase user")||e.includes("increase the user")||e.includes("raises user")||
         e.includes("user's strength increase")||e.includes("user's def")||
         moveTargetsSelf(move);
}

// ── Held Item helpers ────────────────────────────────────────────────────────
function getHeldItem(entry:BattleEntry,trainers:any[]):string|null{
  if(!entry.linkedTrainerId)return null;
  const trainer=trainers.find(t=>t.id===entry.linkedTrainerId);
  if(!trainer)return null;
  // Look for items marked as held (category contains "Held" or explicit held slot)
  const inv:any[]=trainer.inventory||[];
  // Check if any item name matches a known hold item for this pokemon
  const heldKeywords=["band","specs","scarf","orb","helmet","sash","vest","stone","eviolite","leftovers","sludge","berry","plate","drive","memory","silk scarf","black glasses","magnet","mystic water","charcoal","miracle seed","never-melt ice","soft sand","sharp beak","poison barb","twisted spoon","hard stone","spell tag","metal coat","dragon fang","black belt","pink bow","polkadot bow","silverpowder","wave incense","odd incense","rock incense","rose incense","full incense"];
  for(const item of inv){
    if(heldKeywords.some(k=>item.name.toLowerCase().includes(k))){
      return item.name;
    }
  }
  return null;
}

// ── Trainer Skill Defs ────────────────────────────────────────────────────────
const TRAINER_SKILL_DEFS: Record<string,{attr:string;attr2?:string;desc:string;combat:string}> = {
  brawl:     {attr:"strength",            desc:"Melee combat and wrestling.",           combat:"Roll STR + Brawl. Damage = successes − target VIT."},
  channel:   {attr:"special",             desc:"Use devices, throw Pokéballs.",         combat:"Roll SPC + Channel. Used for catching or technical actions."},
  clash:     {attr:"strength",attr2:"dexterity",desc:"Reaction — intercept an attack.",  combat:"Priority 6. Roll STR/DEX + Clash. Negate attack and deal STR dmg."},
  evasion:   {attr:"dexterity",           desc:"Dodge incoming attacks.",               combat:"Priority 6. Roll DEX + Evasion vs attacker accuracy."},
  alert:     {attr:"insight",             desc:"Detect threats, avoid surprise.",        combat:"Roll INS + Alert vs foe's stealth to detect ambush."},
  athletic:  {attr:"strength",attr2:"dexterity",desc:"Running, climbing, swimming.",    combat:"Roll STR or DEX + Athletic for physical feats in combat."},
  nature:    {attr:"insight",             desc:"Interact with wild Pokémon.",            combat:"Roll INS + Nature to calm or influence Pokémon."},
  stealth:   {attr:"dexterity",           desc:"Move silently, set ambushes.",          combat:"Roll DEX + Stealth vs target Alert to set up a surprise."},
  etiquette: {attr:"insight",             desc:"Social protocol and persuasion.",       combat:"Roll INS + Etiquette to negotiate or de-escalate."},
  intimidate:{attr:"strength",            desc:"Frighten or coerce others.",            combat:"Roll STR + Intimidate. 3+ succ: target Flinches or −1 next roll."},
  perform:   {attr:"special",             desc:"Entertain, distract, or dazzle.",       combat:"Roll SPC + Perform. Success: target −2 dice on next action."},
  capture:   {attr:"special",attr2:"dexterity",desc:"Throw Pokéballs accurately.",      combat:"Roll SPC/DEX + Capture (Channel). Seal potency adds to success count."},
};

// ── Clash Section ─────────────────────────────────────────────────────────────
function ClashSection({attacker,targets,allEntries,move,attrs,weather,stab,abilBonus,loyalty,happiness,onApplyDmg,onApplyEffect}:{
  attacker:BattleEntry;targets:string[];allEntries:BattleEntry[];move:Move;
  attrs:AttrSet;weather:WeatherData;stab:boolean;abilBonus:number;loyalty:number;happiness:number;
  onApplyDmg:(id:string,dmg:number)=>void;
  onApplyEffect?:(id:string,attr:string,amount:number,src:string,appliedBy?:string)=>void;
}){
  const [atkRoll,setAtkRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [defMoves,setDefMoves]=useState<Record<string,Move>>({});
  const [defRolls,setDefRolls]=useState<Record<string,{rolls:number[];successes:number}>>({});
  const [resolved,setResolved]=useState<string>("");

  const doAtkRoll=()=>setAtkRoll(rollDice(calcAccPool(move,attrs,undefined,attacker.pokemonSkills)));
  const pickDefMove=(tid:string,m:Move)=>{
    setDefMoves(p=>({...p,[tid]:m}));
    const t=allEntries.find(e=>e.id===tid);
    if(t){const da=getEffectiveAttrs(t);setDefRolls(p=>({...p,[tid]:rollDice(calcAccPool(m,da,undefined,t.pokemonSkills))}));}
  };
  const resolve=()=>{
    if(!atkRoll)return;
    const lines:string[]=[];
    targets.forEach(tid=>{
      const t=allEntries.find(e=>e.id===tid);const dr=defRolls[tid];
      if(!t||!dr)return;
      if(atkRoll.successes>dr.successes){
        const pool=calcDmgPool(move,attrs,weather,stab,abilBonus,loyalty,happiness);
        const dmgR=rollDice(pool);
        const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
        const finalDmg=Math.max(1,dmgR.successes-def);
        onApplyDmg(tid,finalDmg);
        // Auto-apply attacker's stat effects on clash win (e.g. Power-Up Punch +STR)
        if(onApplyEffect){
          const el=move.effect.toLowerCase();
          if(el.includes("increase user")||el.includes("increase the user")||statAppliestoSelf(move)){
            if(el.includes("strength")&&el.includes("increase"))onApplyEffect(attacker.id,"strength",1,move.name,attacker.nickname||attacker.pokemon.name);
            if(el.includes("special")&&el.includes("increase"))onApplyEffect(attacker.id,"special",1,move.name,attacker.nickname||attacker.pokemon.name);
            if(el.includes("defense")&&el.includes("increase")&&!el.includes("sp."))onApplyEffect(attacker.id,"vitality",1,move.name,attacker.nickname||attacker.pokemon.name);
          }
        }
        lines.push(`✓ ${attacker.nickname||attacker.pokemon.name} wins (${atkRoll.successes} vs ${dr.successes}) — ${finalDmg} dmg applied to ${t.nickname||t.pokemon.name}`);
      } else if(dr.successes>atkRoll.successes){
        const dm=defMoves[tid];const defA=getEffectiveAttrs(t);
        const pool=calcDmgPool(dm,defA,weather,t.pokemon.types.includes(dm.type as PokemonType),0,t.loyalty,t.happiness);
        const dmgR=rollDice(pool);
        const def=dm.category==="Physical"?attacker.attrs.vitality:attacker.attrs.insight;
        const finalDmg=Math.max(1,dmgR.successes-def);
        onApplyDmg(attacker.id,finalDmg);
        lines.push(`✗ ${t.nickname||t.pokemon.name} wins Clash (${dr.successes} vs ${atkRoll.successes}) — ${finalDmg} dmg applied to ${attacker.nickname||attacker.pokemon.name}`);
      } else lines.push(`⚖ Tie (${atkRoll.successes} vs ${dr.successes}) — no damage`);
    });
    setResolved(lines.join("\n"));
  };

  return(
    <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa30",borderRadius:6,padding:"10px 12px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#00d4aa",marginBottom:6}}>⚡ Clash Resolution (Priority 6)</div>
      <div style={{fontSize:10,color:"#8b90a8",marginBottom:10,lineHeight:1.5}}>Both sides roll their chosen move's accuracy simultaneously. Highest successes wins — winner deals full damage. Tie = no damage.</div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Attacker: {attacker.nickname||attacker.pokemon.name} — {move.name} ({calcAccPool(move,attrs,undefined,attacker.pokemonSkills)}d)</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={doAtkRoll} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Attacker ({calcAccPool(move,attrs,undefined,attacker.pokemonSkills)}d)</button>
          {atkRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{atkRoll.rolls.join(",")}] = <span style={{color:"#6890f0"}}>{atkRoll.successes} hits</span></span>}
        </div>
      </div>
      {targets.map(tid=>{
        const t=allEntries.find(e=>e.id===tid);if(!t)return null;
        const dm=defMoves[tid];const dr=defRolls[tid];
        return(
          <div key={tid} style={{background:"#13151f",borderRadius:5,padding:"8px 10px",marginBottom:8}}>
            <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}}>Defender: {t.nickname||t.pokemon.name} — pick counter move</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
              {t.moves.map((m,i)=><button key={i} onClick={()=>pickDefMove(tid,m)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:4,border:`1px solid ${dm?.name===m.name?"#ff4757":"#3a4060"}`,background:dm?.name===m.name?"rgba(255,71,87,0.15)":"#1e2235",cursor:"pointer",fontSize:10}}>
                <TypeBadge type={m.type as PokemonType} small/>{m.name}
              </button>)}
              {t.moves.length===0&&<span style={{fontSize:10,color:"#5a6080",fontStyle:"italic"}}>No moves in tracker</span>}
            </div>
            {dm&&dr&&<div style={{fontSize:11,color:"#ff4757",fontFamily:"'Exo 2'",fontWeight:700}}>{t.nickname||t.pokemon.name}: [{dr.rolls.join(",")}] = {dr.successes} hits with {dm.name}</div>}
          </div>
        );
      })}
      {atkRoll&&Object.keys(defRolls).length>0&&!resolved&&(
        <button onClick={resolve} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>⚡ Resolve Clash & Apply Damage</button>
      )}
      {resolved&&<div style={{background:"#13151f",borderRadius:4,padding:"8px 10px",fontSize:11,color:"#e8eaf0",whiteSpace:"pre-line",lineHeight:1.6}}>{resolved}</div>}
    </div>
  );
}

// ── Trainer Skill Popup ───────────────────────────────────────────────────────
function TrainerSkillPopup({trainerData,entry,allEntries,onClose}:{trainerData:any;entry:BattleEntry;allEntries:BattleEntry[];onClose:()=>void;}){
  const [selSkill,setSelSkill]=useState<string|null>(null);
  const [targets,setTargets]=useState<string[]>([]);
  const [roll,setRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [brawlDmg,setBrawlDmg]=useState<{rolls:number[];successes:number}|null>(null);
  const attrs=trainerData?.attributes||{strength:1,dexterity:1,vitality:1,insight:1};
  const skills=trainerData?.skills||{};
  const actReq=[1,2,3,4,5][Math.min(entry.actionCount,4)];
  const def=selSkill?TRAINER_SKILL_DEFS[selSkill]:null;
  const av=(k:string)=>(attrs as any)[k]??1;
  const pool=def?av(def.attr)+(skills[selSkill!]||0):0;
  const others=allEntries.filter(e=>e.id!==entry.id&&e.currentHp>0);
  const combatSkills=["brawl","clash","evasion","intimidate","channel","capture"];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#1e2235",border:"1px solid #3d8bff40",borderRadius:10,width:490,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>👤</span>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#3d8bff",margin:0,flex:1}}>{trainerData?.name||"Trainer"} — Skill Action</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[["STR","strength"],["DEX","dexterity"],["VIT","vitality"],["INS","insight"]].map(([l,k])=><div key={k} style={{textAlign:"center"}}><div style={{fontSize:9,color:"#5a6080"}}>{l}</div><div style={{fontSize:16,fontFamily:"'Exo 2'",fontWeight:700,color:"#3d8bff"}}>{av(k)}</div></div>)}
          </div>
          {entry.actionCount>0&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757"}}>Action #{entry.actionCount+1} — needs {actReq}+ to succeed</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {Object.entries(TRAINER_SKILL_DEFS).map(([sk,d])=>{const sv=skills[sk]||0;const a=av(d.attr);const active=selSkill===sk;return(
              <button key={sk} onClick={()=>{setSelSkill(sk);setRoll(null);setBrawlDmg(null);setTargets([]);}} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:5,cursor:"pointer",border:`1px solid ${active?"#3d8bff":"#2a2f45"}`,background:active?"rgba(61,139,255,0.12)":"#13151f",textAlign:"left"}}>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:active?"#3d8bff":"#e8eaf0",textTransform:"capitalize"}}>{sk}</div><div style={{fontSize:9,color:"#5a6080"}}>{d.attr.slice(0,3).toUpperCase()} {a} + {sv} = {a+sv}d</div></div>
                <div style={{fontSize:14,fontFamily:"'Exo 2'",fontWeight:800,color:active?"#3d8bff":"#5a6080"}}>{a+sv}</div>
              </button>
            );})}
          </div>
          {selSkill&&def&&<>
            <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:12,color:"#e8eaf0",marginBottom:4}}>{def.desc}</div>
              <div style={{fontSize:11,color:"#8b90a8",lineHeight:1.5}}><strong style={{color:"#5a6080"}}>Combat: </strong>{def.combat}</div>
              <div style={{fontSize:11,color:"#3d8bff",marginTop:5}}>Pool: {def.attr} ({av(def.attr)}){def.attr2?<span> or {def.attr2} ({av(def.attr2)})</span>:null} + {selSkill} ({skills[selSkill]||0}) = <strong>{pool}d</strong></div>
            </div>
            {combatSkills.includes(selSkill)&&<div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Target</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {others.map(t=><button key={t.id} onClick={()=>setTargets(p=>p.includes(t.id)?p.filter(x=>x!==t.id):[...p,t.id])} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#e8eaf0":"#8b90a8"}}>{t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})</button>)}
              </div>
            </div>}
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Roll {selSkill} ({pool}d) · Need {actReq}+</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setRoll(rollDice(pool))} style={{background:"#3d8bff20",border:"1px solid #3d8bff60",borderRadius:4,color:"#3d8bff",padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll ({pool}d)</button>
                {roll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:roll.successes>=actReq?"#00d4aa":"#ff4757"}}>[{roll.rolls.join(",")}]={roll.successes} {roll.successes>=actReq?"✓ Success":"✗ Fail"}</span>}
              </div>
            </div>
            {roll&&roll.successes>=actReq&&selSkill==="brawl"&&targets.length>0&&(
              <div style={{background:"#13151f",borderRadius:5,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:"#e8eaf0",fontWeight:700,marginBottom:6}}>Damage (STR {av("strength")}d vs target VIT)</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setBrawlDmg(rollDice(av("strength")))} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Damage</button>
                  {brawlDmg&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{brawlDmg.rolls.join(",")}]={brawlDmg.successes}</span>}
                </div>
                {brawlDmg&&targets.length>0&&(()=>{const t=allEntries.find(e=>e.id===targets[0]);const def2=t?.attrs.vitality??1;const dmg=Math.max(1,brawlDmg.successes-def2);return t?<div style={{fontSize:11,color:"#8b90a8",marginTop:5}}>{brawlDmg.successes} − {def2} DEF = <strong style={{color:"#ff4757"}}>{dmg} damage</strong></div>:null;})()}
              </div>
            )}
          </>}
        </div>
      </div>
    </div>
  );
}

// ── Draggable Popup Hook ─────────────────────────────────────────────────────
function useDraggablePopup():{pos:{x:number;y:number};handlers:{onMouseDown:(e:React.MouseEvent)=>void}}{
  const [pos,setPos]=React.useState({x:0,y:0});
  const dragging=React.useRef(false);
  const start=React.useRef({mx:0,my:0,px:0,py:0});
  const onMouseDown=(e:React.MouseEvent)=>{
    if((e.target as HTMLElement).closest("button,input,select,textarea"))return;
    dragging.current=true;
    start.current={mx:e.clientX,my:e.clientY,px:pos.x,py:pos.y};
    const onMove=(ev:MouseEvent)=>{if(!dragging.current)return;setPos({x:start.current.px+(ev.clientX-start.current.mx),y:start.current.py+(ev.clientY-start.current.my)});};
    const onUp=()=>{dragging.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };
  return{pos,handlers:{onMouseDown}};
}

// ── Move Popup ────────────────────────────────────────────────────────────────
function MovePopup({move,attacker,allEntries,weather,onClose,onApplyDmg,onApplyEffect,onIncrementAction,onSpendWP,onApplySpecial,onEndTurn,fromPriorityPhase,onTargetsChange}:{
  move:Move;attacker:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;
  onClose:()=>void;onApplyDmg:(id:string,dmg:number)=>void;
  onApplyEffect:(id:string,attr:string,amount:number,src:string,appliedBy?:string)=>void;
  onIncrementAction:(id:string,isReaction?:boolean)=>void;
  onSpendWP:(id:string,amount:number)=>void;
  onApplySpecial?:(id:string,u:Partial<BattleEntry>)=>void;
  onEndTurn?:()=>void;
  fromPriorityPhase?:boolean;
  onTargetsChange?:(ids:string[])=>void;
}){
  const {pos:popupPos,handlers:popupHandlers}=useDraggablePopup();
  const [targets,setTargets]=useState<string[]>(()=>{
    if(moveTargetsSelf(move)&&!moveSelfDestructsAll(move)&&!moveIsTransform(move))return[attacker.id];
    return[];
  });
  useEffect(()=>{onTargetsChange?.(targets);},[targets]); // eslint-disable-line react-hooks/exhaustive-deps
  const [accResult,setAccResult]=useState<{rolls:number[];successes:number}|null>(null);
  const [dmgResults,setDmgResults]=useState<Record<string,{rolls:number[];successes:number}>>({});
  const [applied,setApplied]=useState<Set<string>>(new Set());
  // Defender reactions: each target can choose Clash or Evasion as their reaction
  const [defReactions,setDefReactions]=useState<Record<string,{type:"clash"|"evasion";move?:Move;roll?:{rolls:number[];successes:number};atkRoll?:{rolls:number[];successes:number};resolved?:boolean;clashOutcome?:"attackerWins"|"defenderWins"|"tie";clashDmgRoll?:{rolls:number[];successes:number}}>>({});
  const isPriority=fromPriorityPhase===true;
  const isSubstitute=move.name==="Substitute"||move.effect.toLowerCase().includes("substitute");
  const isProtectMove=move.name==="Protect"||move.name==="Detect"||move.name==="King's Shield"||move.name==="Spiky Shield"||move.effect.toLowerCase().includes("user protects itself");
  const weatherSet=moveSetsWeather(move);
  const hasRecoil=moveHasRecoil(move);
  const isStatsReset=moveIsStatsReset(move);
  const isEntryHazard=moveIsEntryHazard(move);
  const isDisableLock=moveIsDisableLock(move);
  const isCounter=moveIsCounter(move);
  const isTwoTurn=moveIsTwoTurn(move);
  const isMultiHit=moveIsMultiHit(move);
  const isProtectScreen=moveIsProtectScreen(move);
  const isCopyMove=moveIsCopyMove(move);
  const isWish=moveIsWish(move);
  const isPerishSong=moveIsPerishSong(move);
  const isTrap=moveIsTrap(move);
  const drains=moveDrainsHP(move);
  const isGrudge=moveIsGrudge(move);
  const isTrickRoom=moveIsTrickRoom(move);
  const isForesight=moveIsForesight(move);
  const isRolePlay=moveIsRolePlay(move);
  const isSkillSwap=moveIsSkillSwap(move);
  const isEntrainment=moveIsEntrainment(move);
  const isDoodle=moveIsDoodle(move);
  const isSuppressAbility=moveSuppressesAbility(move);
  const isSoak=moveIsSoak(move);
  const isTrickOrTreat=moveIsTrickOrTreat(move);
  const isForestsCurse=moveIsForestsCurse(move);
  const isCamouflage=moveIsCamouflage(move);
  const isTerrainMove=moveSetsTerrain(move);
  const isTrick=moveIsTrick(move);
  const isBestow=moveIsBestow(move);
  const isEmbargo=moveIsEmbargo(move);
  const isCorrosiveGas=moveIsCorrosiveGas(move);
  const isBellyDrum=moveIsBellyDrum(move);
  const isClangorousSoul=moveIsClangorousSoul(move);
  const isFilletAway=moveIsFilletAway(move);
  const isFollowMe=moveIsFollowMe(move);
  const isAfterYou=moveIsAfterYou(move);
  const isAttract=moveIsAttract(move);
  const isAcupressure=moveIsAcupressure(move);
  const isCharge=moveIsCharge(move);
  const [acupressureResult,setAcupressureResult]=useState<string|null>(null);
  const [heldItemInputA,setHeldItemInputA]=useState<string>(attacker.heldItem||"");
  const [preRollDone,setPreRollDone]=useState<{canAct:boolean;detail:string}|null>(
    primaryStatus(attacker)==="Flinched"?{canAct:false,detail:"Flinched — cannot act this turn."}:
    !(STATUS_CONDITIONS[primaryStatus(attacker)]?.requiresRollToAct)?{canAct:true,detail:""}:null
  );
  const [loyaltyRoll,setLoyaltyRoll]=useState<{rolls:number[];successes:number}|null>(null);

  const attrs=getEffectiveAttrs(attacker);
  const attackerPain=getPainPenalty(attacker.currentHp,attacker.maxHp);
  const stab=attacker.pokemon.types.includes(move.type as PokemonType);
  const actReq=[1,2,3,4,5][Math.min(attacker.actionCount,4)];
  const abilMods=calcAbilityBonus(attacker,move,weather);
  const accPool=calcAccPool(move,attrs,weather,attacker.pokemonSkills);
  const canAct=preRollDone?.canAct??false;

  // Disobedience: ONLY for player side, and never blocks rolls — just a warning
  const isPlayer=attacker.side==="player";
  const disobedience=isPlayer?getDisobedienceLevel(attacker.pokemon.suggestedRank,attacker.trainerRank):"none";

  // Target detection
  const selfTarget=moveTargetsSelf(move);
  const selfDestruct=moveSelfDestructsAll(move);
  const aoeMove=isMoveAOE(move);
  const isAOE=aoeMove||selfDestruct;
  const isClash=(move.name==="Clash"||(move.priority??0)>=6)&&!selfTarget&&!selfDestruct;
  const isTransformMove=moveIsTransform(move);
  const isReflectType=moveIsReflectType(move);
  const isMetronome=moveIsMetronome(move);
  const isBatonPass=moveIsBatonPass(move);
  const isImprison=moveIsImprison(move);
  const isPowerSplit=movePowerSplit(move);
  const isPowerSwap=movePowerSwap(move);
  const healsUser=moveHealsSelf(move);
  const healsTarget=moveHealsTarget(move);
  const statusEffect=moveAppliesStatus(move);
  const userFaints=moveUserFaints(move);

  // Target options
  const others=allEntries.filter(e=>e.id!==attacker.id&&e.currentHp>0);
  const allCombatants=[attacker,...others];
  // Transform needs to pick a pokemon to copy — shows all entries
  const targetOptions=isTransformMove ? others
    : selfTarget ? [attacker,...(selfDestruct?others:[])]
    : isAOE ? others  // AOE: multi-select from others (+ self if self-destruct)
    : others;

  // Pool breakdown
  const accBreakdown=(()=>{
    const acc=move.accuracy.toLowerCase();const parts:string[]=[];
    if(acc.includes("strength"))parts.push(`STR ${attrs.strength}`);
    if(acc.includes("dexterity"))parts.push(`DEX ${attrs.dexterity}`);
    if(acc.includes("special"))parts.push(`SPC ${attrs.special}`);
    if(acc.includes("insight"))parts.push(`INS ${attrs.insight}`);
    if(acc.includes("vitality"))parts.push(`VIT ${attrs.vitality}`);
    const sk=acc.includes("brawl")?"Brawl":acc.includes("athletic")?"Athletic":acc.includes("channel")?"Channel":acc.includes("perform")?"Perform":acc.includes("clash")?"Clash":acc.includes("alert")?"Alert":acc.includes("intimidate")?"Intimidate":acc.includes("stealth")?"Stealth":acc.includes("nature")?"Nature":"Skill";
    const skKey=sk.toLowerCase() as keyof PokemonSkills;
    const sv=attacker.pokemonSkills?.[skKey]||((acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1);
    parts.push(`${sk} ${sv}`);
    const statusPen=STATUS_CONDITIONS[primaryStatus(attacker)]?.accuracyPenalty??0;
    if(statusPen>0)parts.push(`${primaryStatus(attacker)} −${statusPen}`);
    if(attackerPain>0)parts.push(`Pain −${attackerPain}`);
    if(weather.accuracyPenalty&&weather.accuracyPenalty>0)parts.push(`${weather.name} −${weather.accuracyPenalty}`);
    return parts.join(" + ");
  })();

  // Loyalty/happiness in pool
  const loyaltyInPool=move.power.toLowerCase().includes("loyalty")||move.damagePool.toLowerCase().includes("loyalty");
  const happinessInPool=move.power.toLowerCase().includes("happiness")||move.damagePool.toLowerCase().includes("happiness");
  const chargeBonus=(attacker.chargeActive&&move.type==="Electric")?2:0;
  const dmgPool=calcDmgPool(move,attrs,weather,stab,abilMods.bonus,attacker.loyalty,attacker.happiness)+chargeBonus;
  const dmgBreakdown=(()=>{const dmg=move.damagePool.toLowerCase();const parts:string[]=[];if(dmg.includes("strength"))parts.push(`STR ${attrs.strength}`);if(dmg.includes("special"))parts.push(`SPC ${attrs.special}`);const pm=move.power.match(/(\d+)/);if(pm&&!move.power.toLowerCase().includes("loyalty")&&!move.power.toLowerCase().includes("happiness"))parts.push(`Power ${pm[1]}`);if(stab)parts.push("STAB +1");if(abilMods.bonus!==0)parts.push(`Ability ${abilMods.bonus>0?"+":""}${abilMods.bonus}`);if(attackerPain>0)parts.push(`Pain −${attackerPain}`);if(chargeBonus>0)parts.push("⚡ Charge +2");return parts.join(" + ");})();

  const toggleTarget=(id:string)=>{
    if(isAOE||isTransformMove){
      setTargets(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
    } else {
      setTargets([id]);
    }
  };
  // Pre-select all for AOE moves
  const selectAllTargets=()=>setTargets(targetOptions.map(e=>e.id));

  const doPreRoll=()=>{
    const s=primaryStatus(attacker);
    if(s==="Asleep"||s==="Frozen"){const r=Math.floor(Math.random()*6)+1;const ok=s==="Asleep"?r>=4:r>=5;const woke=s==="Asleep"?"Woke up":"Thawed";setPreRollDone({canAct:ok,detail:"Rolled "+r+" — "+(ok?"✓ "+woke+"!":"✗ Still "+s+".")});}
    else if(s==="Paralyzed"){const r=Math.floor(Math.random()*6)+1;setPreRollDone({canAct:r>=3,detail:`Paralysis: ${r} — ${r>=3?"✓ Can act (−2 acc).":"✗ Cannot act."}`});}
    else if(s==="Confused"){const r=Math.floor(Math.random()*6)+1;setPreRollDone({canAct:r>=4,detail:`Confusion: ${r} — ${r>=4?"✓ Acts normally.":"✗ Hits itself!"}`});}
    else if(s==="Infatuated"){const res=rollDice(attacker.currentWill);setPreRollDone({canAct:res.successes>=2,detail:`WP [${res.rolls.join(",")}]=${res.successes} — ${res.successes>=2?"✓ Can act.":"✗ Distracted!"}`});}
  };
  const doDmg=(tid:string)=>setDmgResults(p=>({...p,[tid]:rollDice(dmgPool)}));
  const applyDmg=(tid:string)=>{
    const isSelf=tid===attacker.id;
    const t=isSelf?attacker:allEntries.find(e=>e.id===tid);
    const dr=dmgResults[tid];if(!t||!dr)return;
    if(isSelf){onApplyDmg(tid,dr.successes);setApplied(p=>new Set([...p,tid]));return;}
    const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);
    if(tm.mod===-999){alert(`${t.nickname||t.pokemon.name} is immune!`);return;}
    const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
    let succ=Math.max(1,dr.successes);
    const brutalBonus2=dr.rolls.filter(r=>r===6).length>=2?2:0;
    const rawDmg=Math.max(1,succ-def);
    const typeAdj=tm.mod===2?rawDmg+2:tm.mod===-1?Math.max(1,rawDmg-2):rawDmg;
    const finalDmg=typeAdj+brutalBonus2;
    onApplyDmg(tid,finalDmg);setApplied(p=>new Set([...p,tid]));
    // Happiness drop when target is in pain
    const defPainPenalty=getPainPenalty(t.currentHp,t.maxHp);
    if(defPainPenalty>0&&onApplySpecial){
      const isSE=tm.mod===2;const isBrutal=brutalBonus2>0;
      const fainted=t.currentHp-finalDmg<=0;
      const happinessDrop=(isSE||isBrutal)?2:1;
      const totalHappinessDrop=happinessDrop+(fainted?1:0);
      const newHappiness=(t.happiness??5)-totalHappinessDrop;
      const loyaltyOverflow=newHappiness<0?Math.abs(newHappiness):0;
      onApplySpecial(tid,{happiness:Math.max(0,newHappiness),loyalty:loyaltyOverflow>0?Math.max(0,(t.loyalty??5)-loyaltyOverflow):t.loyalty});
    }
    // If target had an unresolved evasion reaction that failed, spend their WP and mark resolved
    const evasReact=defReactions[tid];
    if(evasReact?.type==="evasion"&&!evasReact.resolved){
      const atkSucc=accResult?.successes??evasReact.atkRoll?.successes??0;
      const defSucc=evasReact.roll?.successes??0;
      if(defSucc<atkSucc){onSpendWP(tid,1);onIncrementAction(tid,true);setDefReactions(p=>({...p,[tid]:{...p[tid],resolved:true}}));}
    }
    onSpendWP(attacker.id,1);onIncrementAction(attacker.id,isPriority);
    // Clear charge after Electric move fires
    if(chargeBonus>0&&onApplySpecial)onApplySpecial(attacker.id,{chargeActive:false});
    if(!selfDestruct)onClose();
  };

  // Stat effects — each has a toSelf flag: true=applies to attacker, false=applies to target(s)
  const statFx:{attr:string;amount:number;label:string;toSelf:boolean}[]=[];
  const el=move.effect.toLowerCase();
  const selfApply=statAppliestoSelf(move);
  // Debuffs on foe
  if((el.includes("reduce")&&el.includes("strength"))||(el.includes("lower")&&el.includes("strength"))||(el.includes("strength")&&el.includes("by 1")&&!el.includes("increase")))statFx.push({attr:"strength",amount:-1,label:"Str −1",toSelf:false});
  if((el.includes("reduce")&&el.includes("defense")&&!el.includes("sp."))||(el.includes("defense")&&el.includes("by 1")&&!el.includes("sp.")&&!el.includes("increase")))statFx.push({attr:"vitality",amount:-1,label:"Def −1",toSelf:false});
  if((el.includes("reduce")&&el.includes("sp. def"))||(el.includes("sp. def")&&el.includes("by 1")))statFx.push({attr:"insight",amount:-1,label:"Sp.Def −1",toSelf:false});
  // Accuracy/Evasion debuffs on foe (Smokescreen, Flash, Sand Attack)
  if((el.includes("accuracy")&&(el.includes("reduce")||el.includes("lower")||el.includes("decrease")))||(el.includes("accuracy")&&el.includes("by 1")))statFx.push({attr:"dexterity",amount:-1,label:"Acc −1 (DEX)",toSelf:false});
  if(el.includes("evasion")&&(el.includes("raise")||el.includes("increase")||el.includes("double evasion")))statFx.push({attr:"dexterity",amount:1,label:"Evasion +1",toSelf:true});
  // Self-buffs (Harden=Def+1, Swords Dance=Str+2, etc.)
  if(el.includes("increase")&&(el.includes("defense")||el.includes("vitality"))&&!el.includes("sp.")&&!el.includes("lower"))statFx.push({attr:"vitality",amount:1,label:"Def +1",toSelf:true});
  if(el.includes("increase")&&el.includes("strength")&&!el.includes("lower"))statFx.push({attr:"strength",amount:1,label:"Str +1",toSelf:selfApply});
  if(el.includes("increase")&&el.includes("dexterity")&&!el.includes("lower"))statFx.push({attr:"dexterity",amount:1,label:"Dex +1",toSelf:true});
  if(el.includes("increase")&&el.includes("special")&&!el.includes("lower"))statFx.push({attr:"special",amount:1,label:"Spc +1",toSelf:selfApply});
  if(el.includes("increase")&&el.includes("sp. def")&&!el.includes("lower"))statFx.push({attr:"insight",amount:1,label:"Sp.Def +1",toSelf:true});
  if(el.includes("increase")&&el.includes("evasion")&&!el.includes("lower"))statFx.push({attr:"dexterity",amount:1,label:"Evasion +1",toSelf:true});
  // Heal (HP restore)
  const isHeal=healsUser||healsTarget;
  const healAmount=attacker.maxHp-attacker.currentHp; // restore to full by default
  // Status inflict
  const statusToInflict=statusEffect;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(24,24,24,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div {...popupHandlers} style={{background:"#F8F8E8",border:"3px solid #181818",width:520,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"6px 6px 0 #787878",transform:`translate(${popupPos.x}px,${popupPos.y}px)`,cursor:"default",userSelect:"none"}}>
        {/* Header — FireRed dialogue box style */}
        <div style={{padding:"8px 12px",background:"#E8E8D0",borderBottom:"2px solid #181818",display:"flex",alignItems:"center",gap:6,flexShrink:0,cursor:"move"}}>
          <TypeBadge type={move.type as PokemonType}/>
          <span style={{fontSize:7,fontWeight:700,color:move.category==="Physical"?"#B85808":move.category==="Special"?"#2848A8":"#187028",background:move.category==="Physical"?"#F8D8B8":move.category==="Special"?"#C8D8F8":"#C8F0C8",border:"1px solid #181818",padding:"1px 5px",fontFamily:"'Press Start 2P',monospace",flexShrink:0}}>{move.category.slice(0,4).toUpperCase()}</span>
          {stab&&<span style={{fontSize:7,color:"#807008",background:"#F8F0B8",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",flexShrink:0}}>STAB</span>}
          {(move.priority??0)>0&&<span style={{fontSize:7,color:"#187028",background:"#C8F0C8",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",flexShrink:0}}>P+{move.priority}</span>}
          {selfTarget&&<span style={{fontSize:7,color:"#780878",background:"#E8D8F8",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",flexShrink:0}}>SELF</span>}
          {selfDestruct&&<span style={{fontSize:7,color:"#F8F8E8",background:"#D82808",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",flexShrink:0}}>BOOM</span>}
          <span style={{fontSize:11,fontWeight:700,color:"#181818",fontFamily:"'Press Start 2P',monospace",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{move.name}</span>
          <button onClick={onClose} style={{background:"#E8E8D0",border:"2px solid #181818",color:"#181818",cursor:"pointer",fontSize:10,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Press Start 2P',monospace",boxShadow:"2px 2px 0 #787878",flexShrink:0}}>×</button>
        </div>
        <div style={{padding:12,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,flex:1,background:"#F8F8E8"}}>
          <p style={{fontSize:9,color:"#484830",lineHeight:1.6,margin:0,fontFamily:"inherit"}}>{move.description}</p>
          <div style={{background:"#E8E8D0",border:"1px solid #C8C8A8",padding:"6px 8px",fontSize:9,color:"#181818",lineHeight:1.5}}><strong style={{color:"#484830"}}>Effect: </strong>{move.effect}</div>

          {/* Loyalty/Happiness pool info */}
          {(loyaltyInPool||happinessInPool)&&(
            <div style={{background:"rgba(255,211,42,0.08)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:5,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:"#ffd32a",fontWeight:700,marginBottom:3}}>❤ Loyalty/Happiness Move</div>
              <div style={{fontSize:11,color:"#8b90a8"}}>
                Power formula: {move.power} → {loyaltyInPool?`Loyalty (${attacker.loyalty}) `:""}{happinessInPool?`Happiness (${attacker.happiness})`:""}
              </div>
              <div style={{fontSize:11,color:"#ffd32a",fontWeight:700,marginTop:3}}>Damage pool = {dmgPool}d</div>
              {dmgBreakdown&&<div style={{fontSize:9,color:"#5a6080",marginTop:1}}>{dmgBreakdown}</div>}
            </div>
          )}

          {/* Ability modifiers */}
          {(abilMods.bonus>0||abilMods.reasons.length>0)&&<div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa20",borderRadius:5,padding:"8px 10px"}}><div style={{fontSize:10,color:"#00d4aa",fontWeight:700,marginBottom:4}}>Active Ability Modifiers</div>{abilMods.reasons.map((r,i)=><div key={i} style={{fontSize:10,color:"#8b90a8"}}>✦ {r}</div>)}{abilMods.bonus>0&&<div style={{fontSize:11,color:"#00d4aa",fontWeight:700,marginTop:3}}>+{abilMods.bonus} dice to damage pool</div>}</div>}

          {/* Weather */}
          {(weather.typeBoost===move.type||weather.typeWeaken===move.type)&&<div style={{background:"rgba(255,211,42,0.08)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ffd32a"}}>{weather.emoji?.split(" ")[0]} {weather.name}: {weather.typeBoost===move.type?`+${weather.typeBoostDice}d`:`−${weather.typeWeakenDice}d`}</div>}
          {attacker.isTerastallized&&<div style={{background:"rgba(160,64,160,0.08)",border:"1px solid #a040a040",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#a040a0"}}>💎 Tera ({attacker.teraType}): {!attacker.teraFirstMoveBonusUsed?<span>First-move bonus: <strong>+{attacker.pokemon.types.includes(move.type)?3:2} dice</strong> (click Mark in card)</span>:<span>+1 die to all moves</span>}</div>}
          {attacker.isDynamaxed&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475740",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757"}}>💫 Max Move: +2 Accuracy and Damage dice. Cannot be Evaded or Clashed.</div>}

          {/* Action penalty */}
          {attacker.actionCount>0&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757"}}>Action #{attacker.actionCount+1} — needs {actReq}+</div>}

          {/* Disobedience — WARNING ONLY, never blocks rolls */}
          {disobedience!=="none"&&(
            <div style={{background:disobedience==="high"?"rgba(255,71,87,0.1)":"rgba(255,211,42,0.08)",border:`1px solid ${disobedience==="high"?"#ff475740":"#ffd32a40"}`,borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontWeight:700,color:disobedience==="high"?"#ff4757":"#ffd32a",fontSize:11,marginBottom:4}}>
                {disobedience==="high"?"⚠ High Disobedience":"⚠ Low Disobedience"}
                <span style={{fontSize:9,color:"#8b90a8",fontWeight:400,marginLeft:6}}>(rolls are still available — GM decides if action proceeds)</span>
              </div>
              {disobedience==="low"&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setLoyaltyRoll(rollDice(attacker.loyalty||1))} style={{background:"rgba(255,211,42,0.15)",border:"1px solid #ffd32a40",borderRadius:4,color:"#ffd32a",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Loyalty ({attacker.loyalty||1}d, need 3+)</button>
                {loyaltyRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:loyaltyRoll.successes>=3?"#00d4aa":"#ff4757"}}>[{loyaltyRoll.rolls.join(",")}]={loyaltyRoll.successes} {loyaltyRoll.successes>=3?"✓":"✗"}</span>}
              </div>}
            </div>
          )}

          {/* Status pre-check */}
          {primaryStatus(attacker)!=="Healthy"&&primaryStatus(attacker)!=="Flinched"&&(STATUS_CONDITIONS[primaryStatus(attacker)]?.requiresRollToAct)&&(
            <div style={{background:"rgba(168,64,160,0.1)",border:"1px solid #a040a040",borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:700,color:STATUS_CONDITIONS[primaryStatus(attacker)]?.color,marginBottom:4}}>{primaryStatus(attacker)}</div>
              <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>{STATUS_CONDITIONS[primaryStatus(attacker)]?.rollToActDesc}</div>
              <button onClick={doPreRoll} style={{background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Pre-Action Check</button>
              {preRollDone&&<div style={{fontSize:12,fontWeight:700,color:preRollDone.canAct?"#00d4aa":"#ff4757",marginBottom:preRollDone.canAct?0:8}}>{preRollDone.detail}</div>}
              {preRollDone&&!preRollDone.canAct&&<button onClick={()=>{onIncrementAction(attacker.id,isPriority);onClose();if(onEndTurn)onEndTurn();}} style={{background:"rgba(255,71,87,0.15)",border:"1px solid #ff475740",borderRadius:4,color:"#ff4757",padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>⏭ End Turn</button>}
            </div>
          )}
          {primaryStatus(attacker)==="Flinched"&&<div style={{background:"rgba(192,192,208,0.1)",border:"1px solid #c0c0d040",borderRadius:4,padding:"6px 10px",fontSize:11,color:"#c0c0d0"}}>Flinched — cannot act this turn (clears at end of turn)</div>}

          {/* Target selector */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                {isTransformMove?"Select Pokémon to Transform into":selfDestruct?"Select Targets (all take damage — incl. self)":isAOE?"Select Targets (multi-target)":selfTarget?"Target: Self (auto)":"Select Target"}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {(isAOE||selfDestruct)&&<button onClick={selectAllTargets} style={{padding:"4px 8px",borderRadius:4,fontSize:10,cursor:"pointer",border:"1px solid #ff4757",background:"rgba(255,71,87,0.15)",color:"#ff4757",fontWeight:700}}>☑ Select All</button>}
                {selfTarget&&!isTransformMove&&targets.length===0&&(
                  <button onClick={()=>setTargets([attacker.id])} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid #a040a0",background:"rgba(160,64,160,0.15)",color:"#e8eaf0"}}>
                    ✓ {attacker.nickname||attacker.pokemon.name} (Self)
                  </button>
                )}
                {targetOptions.map(t=>{
                  const isSelf=t.id===attacker.id;
                  const sel=targets.includes(t.id);
                  return<button key={t.id} onClick={()=>toggleTarget(t.id)} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${sel?(isSelf?"#a040a0":TYPE_COLORS[t.pokemon.types[0]]):"#3a4060"}`,background:sel?(isSelf?"rgba(160,64,160,0.2)":TYPE_COLORS[t.pokemon.types[0]]+"20"):"transparent",color:sel?"#e8eaf0":"#8b90a8"}}>
                    {isSelf?"(Self) ":""}{t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})
                  </button>;
                })}
              </div>
            </div>
          )}

          {/* Protect warning */}
          {canAct&&targets.filter(tid=>tid!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t||!t.isProtected)return null;return<div key={`prot-${tid}`} style={{background:"rgba(104,144,240,0.1)",border:"1px solid #6890f040",borderRadius:4,padding:"6px 10px",fontSize:11,fontWeight:700,color:"#6890f0"}}>🛡 {t.nickname||t.pokemon.name} is PROTECTED — move has no effect this round!</div>;})}

          {/* Type effectiveness */}
          {canAct&&targets.filter(tid=>tid!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t||t.isProtected)return null;const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;return<div key={tid} style={{background:tm.color+"10",border:`1px solid ${tm.color}30`,borderRadius:4,padding:"6px 10px"}}><div style={{fontSize:11,fontWeight:700,color:tm.color}}>{t.nickname||t.pokemon.name}: {tm.label}</div><div style={{fontSize:10,color:"#8b90a8",marginTop:2}}>DEF: {def} ({move.category==="Physical"?"VIT":"INS"})</div></div>;})}

          {/* Defender Reactions — only shown when target has WP and hasn't reacted */}
          {canAct&&targets.filter(tid=>tid!==attacker.id).map(tid=>{
            const t=allEntries.find(e=>e.id===tid);if(!t||move.category==="Support")return null;
            const react=defReactions[tid];
            const hasWP=t.currentWill>=1;
            const reactionUsed=t.reactionUsed;
            // Hide entire section if reaction unavailable — no clutter
            if((!hasWP&&!react)||reactionUsed&&!react)return null;
            if(react?.resolved)return null;
            return(
              <div key={`react-${tid}`} style={{background:"rgba(168,64,160,0.06)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#a040a0",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                  ⚡ {t.nickname||t.pokemon.name} Reaction {reactionUsed?"(Reaction used this round)":hasWP?"(costs 1 WP)":"(no WP)"}
                </div>
                {!reactionUsed&&hasWP&&!react&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>setDefReactions(p=>({...p,[tid]:{type:"clash"}}))} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(240,128,48,0.1)",border:"1px solid #f0803040",color:"#f08030"}}>⚡ Clash (counter-attack)</button>
                    <button onClick={()=>setDefReactions(p=>({...p,[tid]:{type:"evasion"}}))} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(104,144,240,0.1)",border:"1px solid #6890f040",color:"#6890f0"}}>💨 Evasion (dodge)</button>
                    <button onClick={()=>setDefReactions(p=>({...p,[tid]:{type:"clash",resolved:true}}))} style={{padding:"5px 10px",borderRadius:4,fontSize:10,cursor:"pointer",background:"transparent",border:"1px solid #3a4060",color:"#5a6080"}}>No reaction</button>
                  </div>
                )}
                {(reactionUsed||!hasWP)&&!react&&<div style={{fontSize:10,color:"#5a6080",fontStyle:"italic"}}>{reactionUsed?"Reaction already spent this round.":"Not enough WP to react."}</div>}
                {/* Clash reaction */}
                {react?.type==="clash"&&!react.resolved&&(()=>{
                  const defPainC=getPainPenalty(t.currentHp,t.maxHp);
                  const clashMoves=t.moves.filter(m=>m.category===move.category||m.priority!=null);
                  // Attacker accuracy pool (reuse accResult if available)
                  const atkAccPool=accPool;
                  const atkRollForClash=accResult??react.atkRoll??null;
                  // Defender clash pool (from selected move)
                  const defClashPool=react.move?Math.max(1,calcAccPool(react.move,getEffectiveAttrs(t),undefined,t.pokemonSkills)):null;
                  const bothRolled=atkRollForClash&&react.roll;
                  const atkSucc=atkRollForClash?.successes??0;
                  const defSucc=react.roll?.successes??0;
                  const outcome=bothRolled?(defSucc>atkSucc?"defenderWins":defSucc===atkSucc?"tie":"attackerWins"):null;
                  return(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:10,color:"#f08030",fontWeight:700,letterSpacing:"0.5px",marginBottom:6}}>⚡ Clash Check</div>
                      {/* Move picker */}
                      {!react.clashOutcome&&<div style={{marginBottom:8}}>
                        <div style={{fontSize:9,color:"#5a6080",marginBottom:4}}>Pick counter move ({t.nickname||t.pokemon.name}):</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {clashMoves.map((m,i)=>(
                            <button key={i} onClick={()=>setDefReactions(p=>({...p,[tid]:{...p[tid],move:m,roll:undefined}}))} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:3,border:`1px solid ${react.move?.name===m.name?"#f08030":"#3a4060"}`,background:react.move?.name===m.name?"rgba(240,128,48,0.15)":"#13151f",cursor:"pointer",fontSize:10}}>
                              <TypeBadge type={m.type as PokemonType} small/>{m.name}
                            </button>
                          ))}
                        </div>
                      </div>}
                      {/* Two-column roll panel */}
                      {react.move&&!react.clashOutcome&&(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
                          {/* Attacker accuracy */}
                          <div style={{background:"rgba(240,128,48,0.06)",border:"1px solid #f0803030",borderRadius:5,padding:"6px 8px"}}>
                            <div style={{fontSize:9,color:"#f08030",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{attacker.nickname||attacker.pokemon.name} — Accuracy</div>
                            <div style={{fontSize:9,color:"#5a6080",marginBottom:5}}>{accBreakdown}{attackerPain>0?` − Pain ${attackerPain}`:""} = {atkAccPool}d</div>
                            {accResult?(
                              <div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#f08030"}}>[{accResult.rolls.join(",")}]={accResult.successes} <span style={{fontSize:9,color:"#5a6080"}}>(Phase 1)</span></div>
                            ):(
                              <>
                                <button onClick={()=>setDefReactions(p=>({...p,[tid]:{...p[tid],atkRoll:rollDice(atkAccPool)}}))} style={{width:"100%",background:"#f0803020",border:"1px solid #f0803050",borderRadius:4,color:"#f08030",padding:"4px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🎲 Roll ({atkAccPool}d)</button>
                                {react.atkRoll&&<div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#f08030",marginTop:4}}>[{react.atkRoll.rolls.join(",")}]={react.atkRoll.successes}</div>}
                              </>
                            )}
                          </div>
                          {/* Defender clash roll */}
                          <div style={{background:"rgba(240,128,48,0.06)",border:"1px solid #f0803030",borderRadius:5,padding:"6px 8px"}}>
                            <div style={{fontSize:9,color:"#00d4aa",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{t.nickname||t.pokemon.name} — Clash</div>
                            <div style={{fontSize:9,color:"#5a6080",marginBottom:5}}>{(()=>{const acc=react.move.accuracy.toLowerCase();const da2=getEffectiveAttrs(t);const parts:string[]=[];if(acc.includes("strength"))parts.push(`STR ${da2.strength}`);if(acc.includes("dexterity"))parts.push(`DEX ${da2.dexterity}`);if(acc.includes("special"))parts.push(`SPC ${da2.special}`);if(acc.includes("insight"))parts.push(`INS ${da2.insight}`);if(acc.includes("vitality"))parts.push(`VIT ${da2.vitality}`);const sk=acc.includes("brawl")?"Brawl":acc.includes("athletic")?"Athletic":acc.includes("channel")?"Channel":acc.includes("perform")?"Perform":acc.includes("clash")?"Clash":acc.includes("alert")?"Alert":acc.includes("evasion")?"Evasion":"Skill";const sv=t.pokemonSkills?.[sk.toLowerCase() as keyof PokemonSkills]||2;parts.push(`${sk} ${sv}`);if(defPainC>0)parts.push(`Pain −${defPainC}`);return parts.join(" + ");})() } = {defClashPool}d</div>
                            <button onClick={()=>setDefReactions(p=>({...p,[tid]:{...p[tid],roll:rollDice(defClashPool??1)}}))} style={{width:"100%",background:"#00d4aa20",border:"1px solid #00d4aa50",borderRadius:4,color:"#00d4aa",padding:"4px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🎲 Roll ({defClashPool}d)</button>
                            {react.roll&&<div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#00d4aa",marginTop:4}}>[{react.roll.rolls.join(",")}]={react.roll.successes}</div>}
                          </div>
                        </div>
                      )}
                      {/* Result banner + resolve */}
                      {bothRolled&&!react.clashOutcome&&(
                        <>
                          <div style={{textAlign:"center",padding:"6px 10px",borderRadius:5,background:outcome==="attackerWins"?"rgba(255,71,87,0.12)":outcome==="tie"?"rgba(90,96,128,0.12)":"rgba(0,212,170,0.12)",border:`1px solid ${outcome==="attackerWins"?"#ff475740":outcome==="tie"?"#5a608040":"#00d4aa40"}`,fontSize:12,fontWeight:700,color:outcome==="attackerWins"?"#ff4757":outcome==="tie"?"#5a6080":"#00d4aa",marginBottom:6}}>
                            {outcome==="attackerWins"?`✗ ${t.nickname||t.pokemon.name} loses Clash (${defSucc} vs ${atkSucc}) — ${attacker.nickname||attacker.pokemon.name} hits!`
                              :outcome==="tie"?`⚖ Tie (${atkSucc} vs ${defSucc}) — no damage`
                              :`✓ ${t.nickname||t.pokemon.name} wins Clash (${defSucc} vs ${atkSucc}) — ${attacker.nickname||attacker.pokemon.name}'s move fails!`}
                          </div>
                          <button onClick={()=>{
                            if(outcome==="defenderWins"){
                              // Apply flat clash damage immediately — no dice roll
                              const atkMoveType=move.type as PokemonType;
                              const defMoveType=react.move?.type as PokemonType|undefined;
                              const defTM=getTypeMult(atkMoveType,t.pokemon.types);
                              const defClashDmg=defTM.mod===-999?0:defTM.mod===2?2:defTM.mod===-1?0:1;
                              const atkTM=defMoveType?getTypeMult(defMoveType,attacker.pokemon.types):{mod:0};
                              const atkClashDmg=atkTM.mod===-999?0:atkTM.mod===2?2:atkTM.mod===-1?0:1;
                              if(atkClashDmg>0)onApplyDmg(attacker.id,atkClashDmg);
                              if(defClashDmg>0)onApplyDmg(tid,defClashDmg);
                              onSpendWP(tid,1);onIncrementAction(tid,true);
                              setDefReactions(p=>({...p,[tid]:{...p[tid],clashOutcome:outcome!,resolved:true}}));
                              onSpendWP(attacker.id,1);onIncrementAction(attacker.id,isPriority);onClose();
                            } else if(outcome==="tie"){
                              onSpendWP(tid,1);onIncrementAction(tid,true);
                              setDefReactions(p=>({...p,[tid]:{...p[tid],clashOutcome:outcome!,resolved:true}}));
                              onSpendWP(attacker.id,1);onIncrementAction(attacker.id,isPriority);onClose();
                            } else {
                              onSpendWP(tid,1);onIncrementAction(tid,true);
                              setDefReactions(p=>({...p,[tid]:{...p[tid],clashOutcome:outcome!}}));
                            }
                          }} style={{width:"100%",background:outcome==="defenderWins"?"#00d4aa":outcome==="tie"?"#5a6080":"#ff4757",color:"#fff",border:"none",borderRadius:4,padding:"5px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                            {outcome==="defenderWins"?`✓ ${t.nickname||t.pokemon.name} wins — Apply Clash Damage & Close`
                              :outcome==="tie"?"⚖ Tie — Close"
                              :`✗ ${t.nickname||t.pokemon.name} loses — Roll damage below`}
                          </button>
                        </>
                      )}
                      {react.clashOutcome&&(()=>{
                        // Flat clash damage: 1 base, type effectiveness applied
                        const atkMoveType=move.type as PokemonType;
                        const defMoveType=react.move?.type as PokemonType|undefined;
                        // Damage defender takes (from attacker's move type vs defender's types)
                        const defTM=getTypeMult(atkMoveType,t.pokemon.types);
                        const defClashDmg=defTM.mod===-999?0:defTM.mod===2?2:defTM.mod===-1?0:1;
                        // Damage attacker takes (from defender's clash move type vs attacker's types)
                        const atkTM=defMoveType?getTypeMult(defMoveType,attacker.pokemon.types):{label:"Normal",color:"#8b90a8",mod:0};
                        const atkClashDmg=atkTM.mod===-999?0:atkTM.mod===2?2:atkTM.mod===-1?0:1;
                        return(
                          <>
                            <div style={{textAlign:"center",padding:"6px 10px",borderRadius:5,background:react.clashOutcome==="attackerWins"?"rgba(255,71,87,0.12)":react.clashOutcome==="tie"?"rgba(90,96,128,0.12)":"rgba(0,212,170,0.12)",border:`1px solid ${react.clashOutcome==="attackerWins"?"#ff475740":react.clashOutcome==="tie"?"#5a608040":"#00d4aa40"}`,fontSize:12,fontWeight:700,color:react.clashOutcome==="attackerWins"?"#ff4757":react.clashOutcome==="tie"?"#5a6080":"#00d4aa",marginBottom:6}}>
                              {react.clashOutcome==="attackerWins"?`✗ ${t.nickname||t.pokemon.name} loses Clash (${react.roll?.successes??0} vs ${(accResult??react.atkRoll)?.successes??0}) — ${attacker.nickname||attacker.pokemon.name} hits!`
                                :react.clashOutcome==="tie"?"⚖ Clash Tie — no damage"
                                :`✓ ${t.nickname||t.pokemon.name} wins Clash (${react.roll?.successes??0} vs ${(accResult??react.atkRoll)?.successes??0}) — ${attacker.nickname||attacker.pokemon.name}'s move fails!`}
                            </div>
                            {react.clashOutcome==="attackerWins"&&<div style={{fontSize:10,color:"#ff4757",fontStyle:"italic",textAlign:"center"}}>Roll damage below — WP will be deducted on apply.</div>}
                            {react.clashOutcome==="defenderWins"&&!react.resolved&&(
                              <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px",marginTop:6}}>
                                <div style={{fontSize:9,fontWeight:700,color:"#00d4aa",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>⚡ Clash Damage (flat)</div>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                                  <div style={{background:"rgba(255,71,87,0.06)",border:"1px solid #ff475730",borderRadius:4,padding:"6px 8px"}}>
                                    <div style={{fontSize:9,color:"#ff4757",fontWeight:700,marginBottom:3}}>{attacker.nickname||attacker.pokemon.name} takes</div>
                                    <div style={{fontSize:9,color:"#5a6080",marginBottom:3}}>{defMoveType} vs {attacker.pokemon.types.join("/")} → {atkTM.label}</div>
                                    <div style={{fontSize:14,fontWeight:700,color:"#ff4757"}}>{atkClashDmg} HP</div>
                                  </div>
                                  <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa30",borderRadius:4,padding:"6px 8px"}}>
                                    <div style={{fontSize:9,color:"#00d4aa",fontWeight:700,marginBottom:3}}>{t.nickname||t.pokemon.name} takes</div>
                                    <div style={{fontSize:9,color:"#5a6080",marginBottom:3}}>{atkMoveType} vs {t.pokemon.types.join("/")} → {defTM.label}</div>
                                    <div style={{fontSize:14,fontWeight:700,color:"#00d4aa"}}>{defClashDmg} HP</div>
                                  </div>
                                </div>
                                <button onClick={()=>{
                                  if(atkClashDmg>0)onApplyDmg(attacker.id,atkClashDmg);
                                  if(defClashDmg>0)onApplyDmg(tid,defClashDmg);
                                  setDefReactions(p=>({...p,[tid]:{...p[tid],resolved:true}}));
                                  onSpendWP(attacker.id,1);onIncrementAction(attacker.id,isPriority);onClose();
                                }} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:4,padding:"6px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓ Apply Clash Damage (−1 WP) &amp; Close</button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()}
                {/* Evasion reaction */}
                {react?.type==="evasion"&&!react.resolved&&(()=>{
                  const da=getEffectiveAttrs(t);
                  const defPain=getPainPenalty(t.currentHp,t.maxHp);
                  const evasionRank=t.pokemonSkills?.evasion??1;
                  const evasPool=Math.max(1,da.dexterity+evasionRank);
                  const atkAcc=move.accuracy.toLowerCase();
                  const atkAttrLabel=atkAcc.includes("strength")?"STR":atkAcc.includes("dexterity")?"DEX":atkAcc.includes("special")?"SPC":atkAcc.includes("insight")?"INS":"VIT";
                  const atkAttrVal=atkAcc.includes("strength")?attrs.strength:atkAcc.includes("dexterity")?attrs.dexterity:atkAcc.includes("special")?attrs.special:atkAcc.includes("insight")?attrs.insight:attrs.vitality;
                  const atkSkLabel=atkAcc.includes("brawl")?"Brawl":atkAcc.includes("athletic")?"Athletic":atkAcc.includes("channel")?"Channel":atkAcc.includes("perform")?"Perform":atkAcc.includes("clash")?"Clash":"Skill";
                  const atkSkVal=attacker.pokemonSkills?.[atkSkLabel.toLowerCase() as keyof PokemonSkills]||((atkAcc.includes("brawl")||atkAcc.includes("athletic")||atkAcc.includes("channel")||atkAcc.includes("perform")||atkAcc.includes("clash"))?2:1);
                  const atkPool=Math.max(1,atkAttrVal+atkSkVal);
                  const atkRollForEvasion=accResult??react.atkRoll??null;
                  const bothRolled=react.roll&&atkRollForEvasion;
                  const dodged=bothRolled?react.roll!.successes>=atkRollForEvasion!.successes:false;
                  return(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:10,color:"#6890f0",marginBottom:6,fontWeight:700,letterSpacing:"0.5px"}}>💨 Evasion Check</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
                        {/* Attacker accuracy — reuse Phase 1 roll if available */}
                        <div style={{background:"rgba(104,144,240,0.06)",border:"1px solid #6890f030",borderRadius:5,padding:"6px 8px"}}>
                          <div style={{fontSize:9,color:"#6890f0",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{attacker.nickname||attacker.pokemon.name} — Accuracy</div>
                          <div style={{fontSize:9,color:"#5a6080",marginBottom:5}}>{atkAttrLabel} ({atkAttrVal}) + {atkSkLabel} ({atkSkVal}){attackerPain>0?` − Pain ${attackerPain}`:""} = {atkPool}d</div>
                          {accResult?(
                            <div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#6890f0"}}>[{accResult.rolls.join(",")}]={accResult.successes} <span style={{fontSize:9,color:"#5a6080"}}>(from Phase 1)</span></div>
                          ):(
                            <>
                              <button onClick={()=>setDefReactions(p=>({...p,[tid]:{...p[tid],atkRoll:rollDice(atkPool)}}))} style={{width:"100%",background:"#6890f020",border:"1px solid #6890f050",borderRadius:4,color:"#6890f0",padding:"4px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🎲 Roll ({atkPool}d)</button>
                              {react.atkRoll&&<div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#6890f0",marginTop:4}}>[{react.atkRoll.rolls.join(",")}]={react.atkRoll.successes}</div>}
                            </>
                          )}
                        </div>
                        {/* Target evasion roll */}
                        <div style={{background:"rgba(104,144,240,0.06)",border:"1px solid #6890f030",borderRadius:5,padding:"6px 8px"}}>
                          <div style={{fontSize:9,color:"#00d4aa",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{t.nickname||t.pokemon.name} — Evasion</div>
                          <div style={{fontSize:9,color:"#5a6080",marginBottom:5}}>DEX ({da.dexterity}) + Evasion ({evasionRank}){defPain>0?` − Pain ${defPain}`:""} = {evasPool}d</div>
                          <button onClick={()=>setDefReactions(p=>({...p,[tid]:{...p[tid],roll:rollDice(evasPool)}}))} style={{width:"100%",background:"#00d4aa20",border:"1px solid #00d4aa50",borderRadius:4,color:"#00d4aa",padding:"4px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                            🎲 Roll ({evasPool}d)
                          </button>
                          {react.roll&&<div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#00d4aa",marginTop:4}}>[{react.roll.rolls.join(",")}]={react.roll.successes}</div>}
                        </div>
                      </div>
                      {bothRolled&&(
                        <>
                          <div style={{textAlign:"center",padding:"6px 10px",borderRadius:5,background:dodged?"rgba(0,212,170,0.12)":"rgba(255,71,87,0.12)",border:`1px solid ${dodged?"#00d4aa40":"#ff475740"}`,fontSize:12,fontWeight:700,color:dodged?"#00d4aa":"#ff4757",marginBottom:6}}>
                            {dodged?"✓ DODGED":"✗ Couldn't Dodge"} (def {react.roll!.successes} vs atk {atkRollForEvasion!.successes})
                          </div>
                          {dodged&&<button onClick={()=>{onSpendWP(tid,1);onIncrementAction(tid,true);onIncrementAction(attacker.id,isPriority);setDefReactions(p=>({...p,[tid]:{...p[tid],resolved:true}}));onClose();}} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:4,padding:"5px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓ Dodge successful — Apply (−1 WP) &amp; Close</button>}
                          {!dodged&&<div style={{fontSize:10,color:"#ff4757",fontStyle:"italic",textAlign:"center"}}>Roll damage below — WP will be deducted on apply.</div>}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Phase 1: Accuracy */}
          {canAct&&(
            <div style={{background:"rgba(104,144,240,0.05)",border:"1px solid #6890f020",borderRadius:6,padding:"8px 10px"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#6890f0",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>① Accuracy Roll — {move.accuracy} · Need {actReq}+ hits</div>
              <div style={{fontSize:10,color:"#5a6080",marginBottom:6,fontStyle:"italic"}}>Pool: {accBreakdown} = <strong style={{color:accPool<actReq?"#ff4757":"#6890f0"}}>{accPool}d</strong></div>
              {accPool<=0&&<div style={{background:"rgba(255,71,87,0.12)",border:"1px solid #ff475740",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757",marginBottom:6}}>⚠ Dice pool is 0 — cannot roll. Action is impossible.</div>}
              {accPool>0&&accPool<actReq&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475730",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757",marginBottom:6}}>⚠ Pool ({accPool}d) is less than required hits ({actReq}) — success is very unlikely.</div>}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setAccResult(rollDice(accPool))} disabled={accPool<=0} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:accPool<=0?"#5a6080":"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:accPool<=0?"default":"pointer"}}>🎲 Roll Accuracy ({accPool}d)</button>
                {accResult&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:accResult.successes>=actReq?"#00d4aa":"#ff4757"}}>[{accResult.rolls.join(",")}]={accResult.successes} {accResult.successes>=actReq?"✓ HIT":"✗ MISS"}</span>}
              </div>
              {targets.filter(tid=>{const t=allEntries.find(e=>e.id===tid);return t&&t.reactionUsed;}).map(tid=>{const t=allEntries.find(e=>e.id===tid)!;return<div key={tid} style={{marginTop:5,background:"rgba(255,71,87,0.08)",border:"1px solid #ff475730",borderRadius:4,padding:"5px 10px",fontSize:10,color:"#ff4757"}}>⚠ {t.nickname||t.pokemon.name} has already used their reaction — Clash &amp; Evasion unavailable.</div>;})}
              {/* Miss button — shown when rolled a miss and no pending unresolved reactions */}
              {(()=>{
                if(!accResult||accResult.successes>=actReq)return null;
                const nonSelfTargets=targets.filter(tid=>tid!==attacker.id);
                const allResolved=nonSelfTargets.length===0||nonSelfTargets.every(tid=>{const r=defReactions[tid];return r==null?true:r.resolved===true;});
                if(!allResolved)return null;
                return<button onClick={()=>{onIncrementAction(attacker.id,isPriority);onClose();}} style={{marginTop:6,width:"100%",padding:"8px 10px",background:"#ff4757",border:"none",borderRadius:5,fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>
                  ✗ Miss — Count Action &amp; Close ({isPriority?"Reaction":"Action #"+String((attacker.actionCount||0)+1)})
                </button>;
              })()}
            </div>
          )}

          {/* Clash */}
          {canAct&&isClash&&targets.length>0&&(
            <ClashSection attacker={attacker} targets={targets} allEntries={allEntries} move={move} attrs={attrs} weather={weather} stab={stab} abilBonus={abilMods.bonus} loyalty={attacker.loyalty} happiness={attacker.happiness} onApplyDmg={onApplyDmg} onApplyEffect={onApplyEffect}/>
          )}

          {/* Damage (non-clash move, or clash move won by attacker) */}
          {canAct&&move.category!=="Support"&&targets.map(tid=>{
            // Show damage if Phase-1 accuracy hit OR target failed evasion OR attacker won clash reaction
            const evasR=defReactions[tid];
            const atkSuccEvas=accResult?.successes??evasR?.atkRoll?.successes??0;
            const evasFailed=evasR?.type==="evasion"&&evasR.roll!=null&&atkSuccEvas>evasR.roll.successes;
            const clashWon=evasR?.type==="clash"&&evasR.clashOutcome==="attackerWins";
            const accHit=accResult!=null&&accResult.successes>=actReq&&!isClash;
            if(!accHit&&!evasFailed&&!clashWon)return null;
            const isSelf=tid===attacker.id;
            const t=isSelf?attacker:allEntries.find(e=>e.id===tid);if(!t)return null;
            if(!isSelf&&t.isProtected)return null; // protected - no damage
            const tm=isSelf?{label:"Self",color:"#a040a0",mod:0}:getTypeMult(move.type as PokemonType,t.pokemon.types);
            const def=isSelf?0:(move.category==="Physical"?t.attrs.vitality:t.attrs.insight);
            const dr=dmgResults[tid];
            const brutalHit=dr?(dr.rolls.filter(r=>r===6).length>=2):false;
            const brutalBonus=brutalHit?2:0;
            const rawDmg=dr&&!isSelf?Math.max(1,dr.successes-def):null;
            const typeAdj=rawDmg!=null?(tm.mod===2?rawDmg+2:tm.mod===-1?Math.max(1,rawDmg-2):rawDmg):null;
            const baseDmg=dr?(isSelf?dr.successes:typeAdj??0):null;
            const finalDmg=baseDmg!=null?baseDmg+brutalBonus:null;
            const wasApplied=applied.has(tid);
            return<div key={tid} style={{background:"#13151f",borderRadius:6,padding:"10px 12px",border:brutalHit?"1px solid #ffd32a60":"none"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#f08030",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>② Damage → {isSelf?"SELF":t.nickname||t.pokemon.name} ({dmgPool}d)</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <button onClick={()=>doDmg(tid)} disabled={!!dr} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:dr?"#5a6080":"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:dr?"default":"pointer"}}>🎲 Roll Damage ({dmgPool}d)</button>
                {dr&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{dr.rolls.map(r=>{const s=String(r);return r===6?"★"+s:s;}).join(",")}]={dr.successes}</span>}
              </div>
              {brutalHit&&<div style={{background:"rgba(255,211,42,0.12)",border:"1px solid #ffd32a60",borderRadius:4,padding:"5px 10px",fontSize:12,fontWeight:700,color:"#ffd32a",marginBottom:6,textAlign:"center",letterSpacing:"1px"}}>⚡ BRUTAL HIT! +2 damage</div>}
              {dr&&tm.mod!==-999&&<div>
                <div style={{fontSize:11,color:"#8b90a8",marginBottom:6}}>{isSelf?dr.successes:`${dr.successes} − ${def} DEF${tm.mod===2?" +2 SE":tm.mod===-1?" −2 NVE":""}${brutalHit?" +2 Brutal":""}`} = <strong style={{color:"#ff4757"}}>{finalDmg} damage</strong></div>
                {/* Status chance — inline, before apply button */}
                {statusToInflict&&!isSelf&&!t.isProtected&&(()=>{
                  const chanceKey=`status-${tid}`;
                  const chanceRoll=dmgResults[chanceKey];
                  return<div style={{background:"rgba(160,64,160,0.08)",border:"1px solid #a040a040",borderRadius:4,padding:"6px 8px",marginBottom:6}}>
                    <div style={{fontSize:10,color:"#a040a0",fontWeight:700,marginBottom:4}}>
                      Status Chance: {statusToInflict} (if 4+ on d6)
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <button onClick={()=>{const r=rollDice(1);setDmgResults(p=>({...p,[chanceKey]:r}));}} style={{background:"rgba(160,64,160,0.15)",border:"1px solid #a040a040",borderRadius:3,color:"#a040a0",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🎲 Roll Chance (d6)</button>
                      {chanceRoll&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:chanceRoll.successes>0?"#a040a0":"#5a6080"}}>[{chanceRoll.rolls[0]}] = {chanceRoll.rolls[0]>=4?"✓ Inflict!":"✗ No effect"}</span>}
                    </div>
                    {chanceRoll&&chanceRoll.rolls[0]>=4&&onApplySpecial&&(
                      <button onClick={()=>{onApplySpecial!(tid,{statuses:addStatus(t.statuses||[],statusToInflict!),statusTurnsLeft:statusToInflict==="Asleep"?3:0});}} style={{marginTop:4,width:"100%",background:"#a040a0",color:"#fff",border:"none",borderRadius:4,padding:"5px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        💢 Apply {statusToInflict} to {t.nickname||t.pokemon.name}
                      </button>
                    )}
                  </div>;
                })()}
                {!wasApplied&&<button onClick={()=>applyDmg(tid)} style={{width:"100%",background:isSelf?"#a040a0":"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>⚔ Apply {finalDmg} to {isSelf?"SELF":t.nickname||t.pokemon.name}</button>}
                {wasApplied&&<div style={{textAlign:"center",color:"#00d4aa",fontWeight:700}}>✓ Applied</div>}
              </div>}
            </div>;
          })}

          {/* Effects on success — stat changes, healing, status, Transform, etc. */}
          {canAct&&(accResult?.successes??0)>=actReq&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {/* Stat changes */}
              {statFx.length>0&&(targets.length>0||selfTarget||statFx.some(s=>s.toSelf))&&(
                <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Stat Changes</div>
                  {statFx.map((se,i)=>{
                    // toSelf=true → apply to attacker only; toSelf=false → apply to each selected target
                    const applyTargets=se.toSelf?[attacker.id]:targets.length>0?targets:[attacker.id];
                    return applyTargets.map(tid=>{
                      const isSelf=tid===attacker.id;
                      const t=isSelf?attacker:allEntries.find(e=>e.id===tid);
                      return<div key={`${i}-${tid}`} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:se.amount<0?"rgba(255,71,87,0.1)":"rgba(0,212,170,0.1)",border:`1px solid ${se.amount<0?"#ff475730":"#00d4aa30"}`,color:se.amount<0?"#ff4757":"#00d4aa",fontSize:11,fontWeight:700,width:"100%",marginBottom:3,boxSizing:"border-box"}}>
                        {se.amount>0?"▲":"▼"} {se.label} → {isSelf?"SELF":t?.nickname||t?.pokemon.name}
                      </div>;
                    });
                  })}
                </div>
              )}

              {/* Status is now inline in the damage block above — no separate section needed for damage moves */}
              {/* Support-only status moves (e.g. Stun Spore with no damage) */}
              {statusToInflict&&move.category==="Support"&&targets.filter(t=>t!==attacker.id).length>0&&(
                <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Apply Status (Support Move)</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{
                    const t=allEntries.find(e=>e.id===tid);if(!t)return null;
                    return<button key={tid} onClick={()=>{if(onApplySpecial)onApplySpecial(tid,{statuses:addStatus(t.statuses||[],statusToInflict!),statusTurnsLeft:statusToInflict==="Asleep"?3:0});onIncrementAction(attacker.id,isPriority);}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",background:"rgba(160,64,160,0.1)",border:"1px solid #a040a040",color:"#a040a0",fontSize:11,fontWeight:700,width:"100%",marginBottom:3}}>
                      💢 Apply {statusToInflict} → {t.nickname||t.pokemon.name}
                    </button>;
                  })}
                </div>
              )}

              {/* Healing */}
              {isHeal&&(
                <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa30",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"#00d4aa",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Healing</div>
                  {(healsUser?[attacker]:[]).concat(healsTarget?others.filter(e=>targets.includes(e.id)):[]).map(t=>
                    <button key={t.id} onClick={()=>{const heal=Math.floor(t.maxHp/2);onApplyDmg(t.id,-heal);onIncrementAction(attacker.id,false);onClose();}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",background:"rgba(0,212,170,0.1)",border:"1px solid #00d4aa30",color:"#00d4aa",fontSize:11,fontWeight:700,width:"100%",marginBottom:3}}>
                      💚 Restore ~½ HP to {t.id===attacker.id?"SELF":t.nickname||t.pokemon.name} (+{Math.floor(t.maxHp/2)})
                    </button>
                  )}
                </div>
              )}

              {/* User faints (Self-Destruct, Explosion) */}
              {userFaints&&(
                <button onClick={()=>{onApplyDmg(attacker.id,attacker.currentHp);onIncrementAction(attacker.id,false);onClose();}} style={{padding:"8px",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  💀 User Faints — Apply {attacker.currentHp} damage to {attacker.nickname||attacker.pokemon.name}
                </button>
              )}

              {/* Transform */}
              {isTransformMove&&onApplySpecial&&(
                <div style={{background:"rgba(160,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:6}}>🔄 Transform — Select Pokémon to copy</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {others.map(t=><button key={t.id} onClick={()=>{
                      onApplySpecial!(attacker.id,{
                        morphedTo:t.pokemon,
                        moves:t.moves.slice(0,4),
                        attrs:{...t.attrs},
                        originalAttrs:attacker.originalAttrs||{...attacker.attrs}, // save original if not already saved
                        originalMoves:attacker.originalMoves||[...attacker.moves],
                      });
                      onIncrementAction(attacker.id,false);onClose();
                    }} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(160,64,160,0.15)",border:"1px solid #a040a040",color:"#e8eaf0"}}>
                      🔄 → {t.nickname||t.pokemon.name}
                    </button>)}
                  </div>
                </div>
              )}

              {/* Reflect Type */}
              {isReflectType&&onApplySpecial&&(
                <div style={{background:"rgba(104,144,240,0.08)",border:"1px solid #6890f040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6890f0",marginBottom:6}}>🎭 Reflect Type — Choose new type</div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);return t?<button key={tid} onClick={()=>{onApplySpecial!(attacker.id,{attrs:{...attacker.attrs}});alert(`Type changed to match ${t.nickname||t.pokemon.name}: ${t.pokemon.types.join("/")}. Update manually on card.`);onClose();}} style={{padding:"4px 8px",borderRadius:3,fontSize:10,cursor:"pointer",background:"rgba(104,144,240,0.15)",border:"1px solid #6890f040",color:"#6890f0"}}>Copy {t.nickname||t.pokemon.name}&apos;s type ({t.pokemon.types.join("/")})</button>:null;})}
                  </div>
                </div>
              )}

              {/* Metronome */}
              {isMetronome&&(
                <div style={{background:"rgba(248,216,48,0.08)",border:"1px solid #f8d03040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f8d030",marginBottom:6}}>🎵 Metronome — Random Move</div>
                  <button onClick={()=>{const m=MOVES[Math.floor(Math.random()*MOVES.length)];alert(`Metronome: ${m.name} (${m.type} ${m.category})! Use it as your next action.`);}} style={{padding:"6px 12px",background:"#f8d030",color:"#0f1117",border:"none",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Random Move</button>
                </div>
              )}

              {/* Power Split / Power Swap */}
              {(isPowerSplit||isPowerSwap)&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(120,200,80,0.08)",border:"1px solid #78c85040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#78c850",marginBottom:6}}>{isPowerSplit?"Power Split":"Power Swap"}</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{
                    const t=allEntries.find(e=>e.id===tid);if(!t)return null;
                    return<button key={tid} onClick={()=>{
                      if(isPowerSplit){const avgStr=Math.floor((attacker.attrs.strength+t.attrs.strength)/2);const avgSpc=Math.floor((attacker.attrs.special+t.attrs.special)/2);onApplySpecial!(attacker.id,{attrs:{...attacker.attrs,strength:avgStr,special:avgSpc}});onApplySpecial!(tid,{attrs:{...t.attrs,strength:avgStr,special:avgSpc}});}
                      else{const aStr=attacker.attrs.strength;const aSpc=attacker.attrs.special;onApplySpecial!(attacker.id,{attrs:{...attacker.attrs,strength:t.attrs.strength,special:t.attrs.special}});onApplySpecial!(tid,{attrs:{...t.attrs,strength:aStr,special:aSpc}});}
                      onIncrementAction(attacker.id,false);onClose();
                    }} style={{width:"100%",background:"#78c850",color:"#0f1117",border:"none",borderRadius:4,padding:"7px",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:3}}>
                      {isPowerSplit?"Average":"Swap"} STR/SPC with {t.nickname||t.pokemon.name}
                    </button>;
                  })}
                </div>
              )}

              {/* Baton Pass */}
              {isBatonPass&&(
                <div style={{background:"rgba(248,216,48,0.06)",border:"1px solid #f8d03030",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#f8d030"}}>
                  🏃 Baton Pass — Stat changes on {attacker.nickname||attacker.pokemon.name} will transfer to the next Pokémon switched in. Switch the Pokémon card manually.
                </div>
              )}

              {/* Protect */}
              {isProtectMove&&onApplySpecial&&(
                <button onClick={()=>{onApplySpecial!(attacker.id,{isProtected:true});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"8px",background:"#6890f0",color:"#fff",border:"none",borderRadius:5,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  🛡️ Activate Protect — blocks all incoming moves this round
                </button>
              )}

              {/* Stats Reset (Haze, Clear Smog) */}
              {isStatsReset&&targets.length>0&&onApplySpecial&&(
                <div style={{background:"rgba(90,96,128,0.1)",border:"1px solid #5a608040",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#8b90a8",fontWeight:700,marginBottom:5}}>📊 Stats Reset</div>
                  {targets.map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{statMods:[]});onIncrementAction(attacker.id,false);}} style={{width:"100%",background:"#5a6080",color:"#fff",border:"none",borderRadius:4,padding:"5px",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:3}}>Reset all stat mods on {t.nickname||t.pokemon.name}</button>;})}
                </div>
              )}

              {/* Entry Hazard */}
              {isEntryHazard&&(
                <div style={{background:"rgba(120,200,80,0.08)",border:"1px solid #78c85030",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#78c850"}}>
                  ⚠️ <strong>{move.name}</strong> — Entry Hazard. Note this on the field (no automatic mechanic yet). Affects Pokémon entering the battle on that side.
                </div>
              )}

              {/* Disable / Encore / Taunt / Torment */}
              {isDisableLock&&targets.length>0&&onApplySpecial&&(
                <div style={{background:"rgba(168,64,160,0.08)",border:"1px solid #a040a030",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#a040a0",fontWeight:700,marginBottom:5}}>🔒 {move.name}: {move.effect.slice(0,80)}</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{notes:(t.notes?t.notes+" ":"")+`[${move.name} by ${attacker.nickname||attacker.pokemon.name} — ${move.effect.slice(0,50)}]`});onIncrementAction(attacker.id,false);}} style={{width:"100%",background:"#a040a0",color:"#fff",border:"none",borderRadius:4,padding:"5px",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:3}}>Apply {move.name} to {t.nickname||t.pokemon.name} (noted on card)</button>;})}
                </div>
              )}

              {/* Two-Turn Charge */}
              {isTwoTurn&&onApplySpecial&&(
                <div style={{background:"rgba(255,211,42,0.06)",border:"1px solid #ffd32a30",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#ffd32a",fontWeight:700,marginBottom:5}}>⏳ Two-Turn Move</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:5}}>{move.effect.slice(0,120)}</div>
                  <button onClick={()=>{onApplySpecial!(attacker.id,{notes:(attacker.notes?attacker.notes+" ":"")+`[Charging ${move.name} — attacks next turn]`});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"5px 10px",background:"rgba(255,211,42,0.15)",border:"1px solid #ffd32a30",borderRadius:4,color:"#ffd32a",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    Note Charging (attacks next turn)
                  </button>
                </div>
              )}

              {/* Multi-Hit */}
              {isMultiHit&&(
                <div style={{background:"rgba(240,128,48,0.06)",border:"1px solid #f0803030",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#f08030"}}>
                  💥 <strong>Multi-Hit:</strong> {move.effect.slice(0,80)} — Roll accuracy and damage separately for each hit.
                </div>
              )}

              {/* Reflect / Light Screen / Aurora Veil */}
              {isProtectScreen&&onApplySpecial&&(
                <div style={{background:"rgba(104,144,240,0.06)",border:"1px solid #6890f030",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#6890f0",fontWeight:700,marginBottom:5}}>🛡 {move.name}</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:5}}>{move.effect.slice(0,100)}</div>
                  <button onClick={()=>{onApplySpecial!(attacker.id,{notes:(attacker.notes?attacker.notes+" ":"")+`[${move.name} active — ${move.name==="Reflect"?"-2 dice vs Physical":move.name==="Light Screen"?"-2 dice vs Special":"-2 dice vs both"} for 4 rounds]`});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"5px 10px",background:"rgba(104,144,240,0.15)",border:"1px solid #6890f040",borderRadius:4,color:"#6890f0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    Activate {move.name} (noted on card)
                  </button>
                </div>
              )}

              {/* Copy Move (Copycat, Mirror Move) */}
              {isCopyMove&&(
                <div style={{background:"rgba(248,216,48,0.06)",border:"1px solid #f8d03030",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#f8d030"}}>
                  🔄 <strong>{move.name}:</strong> Copies a move used by another Pokémon. Select the move from that Pokémon's card and use it as your action.
                </div>
              )}

              {/* Wish */}
              {isWish&&onApplySpecial&&(
                <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa30",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#00d4aa",fontWeight:700,marginBottom:5}}>⭐ Wish — Heal next turn</div>
                  <button onClick={()=>{onApplySpecial!(attacker.id,{notes:(attacker.notes?attacker.notes+" ":"")+`[Wish pending — restore ${Math.floor(attacker.maxHp/2)} HP at end of next turn]`});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"5px 10px",background:"rgba(0,212,170,0.1)",border:"1px solid #00d4aa30",borderRadius:4,color:"#00d4aa",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    Note Wish (heal {Math.floor(attacker.maxHp/2)} HP next turn)
                  </button>
                </div>
              )}

              {/* Perish Song */}
              {isPerishSong&&onApplySpecial&&(
                <div style={{background:"rgba(112,88,152,0.08)",border:"1px solid #70589840",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#705898",fontWeight:700,marginBottom:5}}>🎵 Perish Song — 3-round countdown</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {allEntries.filter(e=>e.currentHp>0).map(e=><button key={e.id} onClick={()=>{onApplySpecial!(e.id,{notes:(e.notes?e.notes+" ":"")+`[Perish Song — faints in 3 rounds]`});}} style={{padding:"4px 8px",background:"rgba(112,88,152,0.15)",border:"1px solid #70589840",borderRadius:3,color:"#705898",fontSize:10,fontWeight:700,cursor:"pointer"}}>Apply to {e.nickname||e.pokemon.name}</button>)}
                  </div>
                </div>
              )}

              {/* Trap (Wrap, Bind, Fire Spin etc.) */}
              {isTrap&&targets.length>0&&onApplySpecial&&(
                <div style={{background:"rgba(240,128,48,0.06)",border:"1px solid #f0803030",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#f08030",fontWeight:700,marginBottom:5}}>🔗 {move.name} — Trap</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{notes:(t.notes?t.notes+" ":"")+`[Trapped by ${move.name} — −1 HP/round, cannot switch, 4-5 rounds]`});}} style={{width:"100%",padding:"5px",background:"rgba(240,128,48,0.15)",border:"1px solid #f0803040",borderRadius:4,color:"#f08030",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:3}}>Trap {t.nickname||t.pokemon.name} (noted on card)</button>;})}
                </div>
              )}

              {/* Drain HP (Giga Drain, Leech Life, etc.) */}
              {drains&&accResult&&(accResult.successes??0)>=actReq&&targets.filter(t=>t!==attacker.id).length>0&&(
                <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa30",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#00d4aa",fontWeight:700,marginBottom:5}}>🌿 Drain — heal attacker</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{
                    const dr=dmgResults[tid];
                    const t=allEntries.find(e=>e.id===tid);
                    const def=move.category==="Physical"?t?.attrs.vitality??0:t?.attrs.insight??0;
                    const finalDmg=dr?Math.max(1,(dr.successes)-def):null;
                    const healAmt=finalDmg?Math.floor(finalDmg/2):null;
                    if(!healAmt||!dr)return<div key={tid} style={{fontSize:10,color:"#5a6080"}}>Roll damage first, then drain heal will appear</div>;
                    return<button key={tid} onClick={()=>{onApplyDmg(attacker.id,-healAmt);}} style={{width:"100%",padding:"5px",background:"rgba(0,212,170,0.15)",border:"1px solid #00d4aa40",borderRadius:4,color:"#00d4aa",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:3}}>💚 Heal {healAmt} HP to {attacker.nickname||attacker.pokemon.name} (½ drain)</button>;
                  })}
                </div>
              )}

              {/* Counter / Mirror Coat */}
              {isCounter&&(
                <div style={{background:"rgba(255,71,87,0.06)",border:"1px solid #ff475730",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#ff4757"}}>
                  ⚡ <strong>{move.name} (Late Reaction 5):</strong> Can only be used if last move used against you was {move.name==="Counter"?"Physical":"Special"}. Deal damage equal to the damage you just received. Track incoming damage manually, then apply back.
                </div>
              )}

              {/* Grudge / Spite */}
              {isGrudge&&targets.length>0&&onApplySpecial&&(
                <div style={{background:"rgba(112,88,152,0.08)",border:"1px solid #70589840",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#705898",fontWeight:700,marginBottom:5}}>💀 {move.name}</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;
                    return<button key={tid} onClick={()=>{onApplySpecial!(tid,{currentWill:move.name==="Grudge"?0:Math.max(1,t.currentWill-1)});onApplySpecial!(attacker.id,{currentHp:move.name==="Grudge"?0:attacker.currentHp});onClose();}} style={{width:"100%",padding:"5px",background:"rgba(112,88,152,0.2)",border:"1px solid #70589840",borderRadius:4,color:"#705898",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:3}}>Apply {move.name} → {t.nickname||t.pokemon.name}</button>;
                  })}
                </div>
              )}

              {/* Trick Room / Magic Room / Wonder Room */}
              {isTrickRoom&&(
                <div style={{background:"rgba(160,64,160,0.06)",border:"1px solid #a040a030",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#a040a0"}}>
                  🔮 <strong>{move.name}:</strong> {move.effect.slice(0,100)} — Note this as an active field effect and apply initiative/type changes manually for 5 rounds.
                </div>
              )}

              {/* Foresight / Odor Sleuth / Miracle Eye */}
              {isForesight&&targets.length>0&&onApplySpecial&&(
                <div style={{background:"rgba(248,216,48,0.06)",border:"1px solid #f8d03030",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#f8d030",fontWeight:700,marginBottom:5}}>👁 {move.name}: removes Ghost immunity and Evasion on target</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{notes:(t.notes?t.notes+" ":"")+`[${move.name} — Ghost immune and Evasion removed]`});onClose();}} style={{width:"100%",padding:"5px",background:"rgba(248,216,48,0.1)",border:"1px solid #f8d03040",borderRadius:4,color:"#f8d030",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:3}}>Apply {move.name} to {t.nickname||t.pokemon.name}</button>;})}
                </div>
              )}

              {/* Imprison */}
              {isImprison&&onApplySpecial&&(
                <button onClick={()=>{onApplySpecial!(attacker.id,{notes:attacker.notes?attacker.notes+" [IMPRISON active]":"[IMPRISON active]"});onClose();}} style={{padding:"7px",background:"#705898",color:"#fff",border:"none",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  🔒 Activate Imprison (noted on card)
                </button>
              )}

              {/* Role Play */}
              {isRolePlay&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(168,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:6}}>🎭 Role Play — Copy target's ability</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return(
                    <div key={tid} style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {t.abilities.map(ab=><button key={ab.name} onClick={()=>{onApplySpecial!(attacker.id,{abilityOverride:ab.name});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"4px 8px",borderRadius:3,fontSize:10,cursor:"pointer",background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",color:"#e8eaf0"}}>✨ Copy {ab.name}</button>)}
                    </div>
                  );})}
                </div>
              )}

              {/* Skill Swap */}
              {isSkillSwap&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(168,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:6}}>🔀 Skill Swap — Exchange abilities</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;
                    const atkAbil=attacker.abilityOverride||(attacker.abilities[0]?.name||"—");
                    const defAbil=t.abilityOverride||(t.abilities[0]?.name||"—");
                    return<button key={tid} onClick={()=>{onApplySpecial!(attacker.id,{abilityOverride:defAbil});onApplySpecial!(tid,{abilityOverride:atkAbil});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px 8px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",color:"#e8eaf0"}}>
                      Swap: {attacker.nickname||attacker.pokemon.name} [{atkAbil}] ↔ {t.nickname||t.pokemon.name} [{defAbil}]
                    </button>;
                  })}
                </div>
              )}

              {/* Entrainment */}
              {isEntrainment&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(168,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:6}}>📡 Entrainment — Force target to copy your ability</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                    {attacker.abilities.map(ab=>targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={ab.name+tid} onClick={()=>{onApplySpecial!(tid,{abilityOverride:ab.name});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"4px 8px",borderRadius:3,fontSize:10,cursor:"pointer",background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",color:"#e8eaf0"}}>Force {t.nickname||t.pokemon.name} → {ab.name}</button>;}))}
                  </div>
                </div>
              )}

              {/* Doodle */}
              {isDoodle&&onApplySpecial&&(
                <div style={{background:"rgba(168,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:6}}>🎨 Doodle — Copy ability to all allies</div>
                  {targets.filter(t=>t!==attacker.id).length>0&&attacker.abilities.length>0&&(
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {attacker.abilities.map(ab=><button key={ab.name} onClick={()=>{const allies=allEntries.filter(e=>e.id!==attacker.id&&e.side===attacker.side&&e.currentHp>0);allies.forEach(e=>onApplySpecial!(e.id,{abilityOverride:ab.name}));onIncrementAction(attacker.id,false);onClose();}} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",color:"#e8eaf0"}}>✨ Copy {ab.name} to all allies</button>)}
                    </div>
                  )}
                </div>
              )}

              {/* Suppress ability */}
              {isSuppressAbility&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(90,96,128,0.1)",border:"1px solid #5a608040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#8b90a8",marginBottom:6}}>⊘ {move.name} — Suppress target's ability</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{abilitySuppressed:true});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(90,96,128,0.15)",border:"1px solid #5a608040",color:"#8b90a8",marginBottom:3}}>⊘ Suppress ability on {t.nickname||t.pokemon.name}</button>;})}
                </div>
              )}

              {/* Soak */}
              {isSoak&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(104,144,240,0.08)",border:"1px solid #6890f040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#6890f0",marginBottom:6}}>💧 Soak — Change target's type to Water</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{typeOverride:["Water"]});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(104,144,240,0.15)",border:"1px solid #6890f040",color:"#6890f0",marginBottom:3}}>💧 Make {t.nickname||t.pokemon.name} Water-type</button>;})}
                </div>
              )}

              {/* Trick-Or-Treat */}
              {isTrickOrTreat&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475740",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#ff4757",marginBottom:6}}>👻 Trick-Or-Treat — Add Ghost type</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;const cur=t.typeOverride||t.pokemon.types;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{typeOverride:[...cur,"Ghost"]});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(255,71,87,0.15)",border:"1px solid #ff475740",color:"#ff4757",marginBottom:3}}>👻 Add Ghost to {t.nickname||t.pokemon.name} ({cur.join("/")})</button>;})}
                </div>
              )}

              {/* Forest's Curse */}
              {isForestsCurse&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(120,200,80,0.08)",border:"1px solid #78c85040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#78c850",marginBottom:6}}>🌿 Forest's Curse — Add Grass type</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;const cur=t.typeOverride||t.pokemon.types;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{typeOverride:[...cur,"Grass"]});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(120,200,80,0.15)",border:"1px solid #78c85040",color:"#78c850",marginBottom:3}}>🌿 Add Grass to {t.nickname||t.pokemon.name} ({cur.join("/")})</button>;})}
                </div>
              )}

              {/* Camouflage */}
              {isCamouflage&&onApplySpecial&&(()=>{const typeMap:Record<string,string>={Clear:"Normal",Sunny:"Fire",Rain:"Water",Sandstorm:"Rock",Hail:"Ice","Snow":"Ice"};const newType=typeMap[weather.name]||"Normal";return(
                <div style={{background:"rgba(120,200,80,0.08)",border:"1px solid #78c85040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#78c850",marginBottom:6}}>🦎 Camouflage — Change type to match terrain</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Current weather: {weather.name} → type becomes <strong style={{color:"#78c850"}}>{newType}</strong></div>
                  <button onClick={()=>{onApplySpecial!(attacker.id,{typeOverride:[newType]});onIncrementAction(attacker.id,false);onClose();}} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(120,200,80,0.15)",border:"1px solid #78c85040",color:"#78c850"}}>
                    Become {newType}-type
                  </button>
                </div>
              );})()}

              {/* Terrain moves */}
              {isTerrainMove&&(
                <div style={{background:"rgba(0,212,170,0.08)",border:"1px solid #00d4aa40",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#00d4aa",marginBottom:4}}>🌐 {move.name}</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>{move.name==="Electric Terrain"?"Electric moves +1 die · Grounded cannot sleep":move.name==="Grassy Terrain"?"Grass moves +1 die · Grounded heal 1 HP/round":move.name==="Misty Terrain"?"Fairy moves +1 die · Grounded immune to status":move.name==="Psychic Terrain"?"Psychic moves +1 die · Grounded immune to priority moves":move.effect.slice(0,80)}</div>
                  <div style={{fontSize:10,color:"#ffd32a"}}>⚠ Update the Terrain selector in the nav bar above to <strong>{move.name}</strong>.</div>
                </div>
              )}

              {/* Trick / Switcheroo */}
              {isTrick&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(()=>{
                const tid=targets.find(t=>t!==attacker.id);const t=tid?allEntries.find(e=>e.id===tid):null;
                if(!t)return null;
                return(
                  <div style={{background:"rgba(248,216,48,0.08)",border:"1px solid #f8d03040",borderRadius:6,padding:"10px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#f8d030",marginBottom:6}}>🔀 {move.name} — Swap held items</div>
                    <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,color:"#8b90a8",marginBottom:2}}>{attacker.nickname||attacker.pokemon.name}</div>
                        <input value={heldItemInputA} onChange={e=>setHeldItemInputA(e.target.value)} placeholder="Item name" style={{width:"100%",background:"#13151f",border:"1px solid #2a2f45",borderRadius:3,color:"#e8eaf0",fontSize:10,padding:"3px 6px"}}/>
                      </div>
                      <span style={{color:"#f8d030",fontSize:14}}>⇄</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,color:"#8b90a8",marginBottom:2}}>{t.nickname||t.pokemon.name}</div>
                        <div style={{fontSize:10,color:"#e8eaf0",padding:"4px 6px",background:"#13151f",border:"1px solid #2a2f45",borderRadius:3}}>{t.heldItem||"(no item)"}</div>
                      </div>
                    </div>
                    <button onClick={()=>{onApplySpecial!(attacker.id,{heldItem:t.heldItem});onApplySpecial!(tid!,{heldItem:heldItemInputA||undefined});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(248,216,48,0.15)",border:"1px solid #f8d03040",color:"#f8d030"}}>Swap Items</button>
                  </div>
                );
              })()}

              {/* Bestow */}
              {isBestow&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(248,216,48,0.08)",border:"1px solid #f8d03040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f8d030",marginBottom:6}}>🎁 Bestow — Give your held item</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:4}}>Your item: <strong style={{color:"#f8d030"}}>{attacker.heldItem||"(none)"}</strong></div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{heldItem:attacker.heldItem});onApplySpecial!(attacker.id,{heldItem:undefined});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(248,216,48,0.15)",border:"1px solid #f8d03040",color:"#f8d030",marginBottom:3}}>🎁 Give to {t.nickname||t.pokemon.name}</button>;})}
                </div>
              )}

              {/* Embargo */}
              {isEmbargo&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475740",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#ff4757",marginBottom:6}}>🚫 Embargo — Prevent item use</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{itemEmbargoed:true});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(255,71,87,0.15)",border:"1px solid #ff475740",color:"#ff4757",marginBottom:3}}>🚫 Embargo {t.nickname||t.pokemon.name}</button>;})}
                </div>
              )}

              {/* Corrosive Gas */}
              {isCorrosiveGas&&onApplySpecial&&(
                <div style={{background:"rgba(120,200,80,0.08)",border:"1px solid #78c85040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#78c850",marginBottom:6}}>☠️ Corrosive Gas — Destroy all held items</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Removes held items from all combatants hit.</div>
                  <button onClick={()=>{others.forEach(e=>{if(e.heldItem)onApplySpecial!(e.id,{heldItem:undefined});});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"6px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(120,200,80,0.15)",border:"1px solid #78c85040",color:"#78c850"}}>Destroy all held items (AOE)</button>
                </div>
              )}

              {/* Belly Drum */}
              {isBellyDrum&&onApplySpecial&&(()=>{const cost=Math.max(1,Math.floor(attacker.maxHp/2));const canUse=attacker.currentHp>cost;return(
                <div style={{background:"rgba(240,128,48,0.08)",border:"1px solid #f0803040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f08030",marginBottom:4}}>🥁 Belly Drum — Max STR at half HP</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Costs <strong style={{color:"#ff4757"}}>{cost} HP</strong> · Raises STR by <strong style={{color:"#00d4aa"}}>+3</strong></div>
                  {!canUse&&<div style={{fontSize:10,color:"#ff4757",marginBottom:4}}>⚠ Not enough HP!</div>}
                  <button disabled={!canUse} onClick={()=>{onApplyDmg(attacker.id,cost);onApplyEffect(attacker.id,"strength",3,"Belly Drum",attacker.nickname||attacker.pokemon.name);onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"6px",borderRadius:4,fontSize:11,fontWeight:700,cursor:canUse?"pointer":"not-allowed",background:canUse?"rgba(240,128,48,0.2)":"rgba(90,96,128,0.1)",border:`1px solid ${canUse?"#f0803040":"#5a608030"}`,color:canUse?"#f08030":"#5a6080"}}>
                    🥁 Pay {cost} HP → STR +3
                  </button>
                </div>
              );})()}

              {/* Clangorous Soul */}
              {isClangorousSoul&&onApplySpecial&&(()=>{const cost=Math.max(1,Math.floor(attacker.maxHp/3));const canUse=attacker.currentHp>cost;return(
                <div style={{background:"rgba(160,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:4}}>🎶 Clangorous Soul — All stats +1</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Costs <strong style={{color:"#ff4757"}}>{cost} HP</strong> · All attributes <strong style={{color:"#00d4aa"}}>+1</strong></div>
                  {!canUse&&<div style={{fontSize:10,color:"#ff4757",marginBottom:4}}>⚠ Not enough HP!</div>}
                  <button disabled={!canUse} onClick={()=>{onApplyDmg(attacker.id,cost);(["strength","dexterity","vitality","special","insight"] as const).forEach(a=>onApplyEffect(attacker.id,a,1,"Clangorous Soul",attacker.nickname||attacker.pokemon.name));onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"6px",borderRadius:4,fontSize:11,fontWeight:700,cursor:canUse?"pointer":"not-allowed",background:canUse?"rgba(160,64,160,0.2)":"rgba(90,96,128,0.1)",border:`1px solid ${canUse?"#a040a040":"#5a608030"}`,color:canUse?"#a040a0":"#5a6080"}}>
                    🎶 Pay {cost} HP → All +1
                  </button>
                </div>
              );})()}

              {/* Fillet Away */}
              {isFilletAway&&onApplySpecial&&(()=>{const cost=Math.max(1,Math.floor(attacker.maxHp/4));const canUse=attacker.currentHp>cost;return(
                <div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475740",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#ff4757",marginBottom:4}}>🔪 Fillet Away — Sharp offense at a cost</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Costs <strong style={{color:"#ff4757"}}>{cost} HP</strong> · STR <strong style={{color:"#00d4aa"}}>+2</strong> · SPC <strong style={{color:"#00d4aa"}}>+2</strong></div>
                  {!canUse&&<div style={{fontSize:10,color:"#ff4757",marginBottom:4}}>⚠ Not enough HP!</div>}
                  <button disabled={!canUse} onClick={()=>{onApplyDmg(attacker.id,cost);onApplyEffect(attacker.id,"strength",2,"Fillet Away",attacker.nickname||attacker.pokemon.name);onApplyEffect(attacker.id,"special",2,"Fillet Away",attacker.nickname||attacker.pokemon.name);onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"6px",borderRadius:4,fontSize:11,fontWeight:700,cursor:canUse?"pointer":"not-allowed",background:canUse?"rgba(255,71,87,0.15)":"rgba(90,96,128,0.1)",border:`1px solid ${canUse?"#ff475740":"#5a608030"}`,color:canUse?"#ff4757":"#5a6080"}}>
                    🔪 Pay {cost} HP → STR+2, SPC+2
                  </button>
                </div>
              );})()}

              {/* Follow Me / Spotlight / Rage Powder */}
              {isFollowMe&&onApplySpecial&&(
                <div style={{background:"rgba(0,212,170,0.08)",border:"1px solid #00d4aa40",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#00d4aa",marginBottom:6}}>🎯 {move.name} — Redirect attacks</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>All single-target moves must target the marked Pokémon this round.</div>
                  {move.name==="Spotlight"&&targets.filter(t=>t!==attacker.id).length>0?(
                    targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{isFollowMeTarget:true});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(0,212,170,0.15)",border:"1px solid #00d4aa40",color:"#00d4aa",marginBottom:3}}>🎯 Spotlight {t.nickname||t.pokemon.name}</button>;})
                  ):(
                    <button onClick={()=>{onApplySpecial!(attacker.id,{isFollowMeTarget:true});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"6px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(0,212,170,0.15)",border:"1px solid #00d4aa40",color:"#00d4aa"}}>
                      🎯 {attacker.nickname||attacker.pokemon.name} becomes the focus target
                    </button>
                  )}
                </div>
              )}

              {/* After You */}
              {isAfterYou&&targets.filter(t=>t!==attacker.id).length>0&&(
                <div style={{background:"rgba(248,216,48,0.06)",border:"1px solid #f8d03030",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#f8d030"}}>
                  ⚡ <strong>After You:</strong> {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);return t?`${t.nickname||t.pokemon.name}`:""}).join(", ")} acts immediately next. Move their card to the top of initiative manually.
                </div>
              )}

              {/* Attract */}
              {isAttract&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
                <div style={{background:"rgba(240,128,48,0.08)",border:"1px solid #f0803040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f08030",marginBottom:6}}>💕 Attract — Inflict Infatuated</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Requires opposite gender. Infatuated target must pass WP check (2 succ) to act each turn.</div>
                  {targets.filter(t=>t!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;return<button key={tid} onClick={()=>{onApplySpecial!(tid,{statuses:addStatus(t.statuses||["Healthy"],"Infatuated")});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"5px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(240,128,48,0.15)",border:"1px solid #f0803040",color:"#f08030",marginBottom:3}}>💕 Infatuate {t.nickname||t.pokemon.name}</button>;})}
                </div>
              )}

              {/* Acupressure */}
              {isAcupressure&&onApplySpecial&&(
                <div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa30",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#00d4aa",marginBottom:6}}>📌 Acupressure — Random stat +1</div>
                  {acupressureResult?<div style={{fontSize:11,color:"#00d4aa",marginBottom:6}}>Result: {acupressureResult}</div>:null}
                  <button onClick={()=>{const attrs2:Array<keyof AttrSet>=["strength","dexterity","vitality","special","insight"];const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};const picked=attrs2[Math.floor(Math.random()*attrs2.length)];const tid=targets.length>0?targets[0]:attacker.id;const t=allEntries.find(e=>e.id===tid)||attacker;setAcupressureResult(`${labels[picked]} +1 on ${t.nickname||t.pokemon.name}`);onApplyEffect(tid,picked,1,"Acupressure",attacker.nickname||attacker.pokemon.name);}} style={{padding:"6px 12px",background:"rgba(0,212,170,0.15)",border:"1px solid #00d4aa40",borderRadius:4,color:"#00d4aa",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    🎲 Roll Acupressure
                  </button>
                </div>
              )}

              {/* Charge */}
              {isCharge&&onApplySpecial&&(
                <div style={{background:"rgba(248,216,48,0.08)",border:"1px solid #f8d03040",borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f8d030",marginBottom:4}}>⚡ Charge — Boost next Electric move</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>Marks this Pokémon as Charged. Next Electric move deals +2 damage dice.</div>
                  <button onClick={()=>{onApplySpecial!(attacker.id,{chargeActive:true});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",padding:"6px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:"rgba(248,216,48,0.15)",border:"1px solid #f8d03040",color:"#f8d030"}}>
                    ⚡ Activate Charge
                  </button>
                </div>
              )}

              {/* Weather-setting moves */}
              {weatherSet&&(
                <div style={{background:"rgba(255,211,42,0.06)",border:"1px solid #ffd32a30",borderRadius:5,padding:"8px 10px",fontSize:11,color:"#ffd32a"}}>
                  ☀️ This move sets weather to <strong>{weatherSet}</strong>. Change the weather selector in the nav bar above.
                </div>
              )}

              {/* Recoil */}
              {hasRecoil&&accResult&&accResult.successes>=actReq&&(
                <div style={{background:"rgba(255,71,87,0.06)",border:"1px solid #ff475730",borderRadius:5,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#ff4757",fontWeight:700,marginBottom:4}}>💥 Recoil</div>
                  <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>After damage is dealt, apply recoil to user (½ damage dealt back to self).</div>
                  <button onClick={()=>{const recoilDmg=Math.max(1,Math.floor(attacker.currentHp/4));onApplyDmg(attacker.id,recoilDmg);}} style={{padding:"4px 10px",background:"rgba(255,71,87,0.15)",border:"1px solid #ff475740",borderRadius:4,color:"#ff4757",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    Apply Recoil (~{Math.max(1,Math.floor(attacker.currentHp/4))} HP to {attacker.nickname||attacker.pokemon.name})
                  </button>
                </div>
              )}

              {/* Mark action taken button */}
              <button onClick={()=>{
                // Apply all stat effects
                statFx.forEach(se=>{
                  const applyTargets=se.toSelf?[attacker.id]:targets.length>0?targets:[attacker.id];
                  applyTargets.forEach(tid=>onApplyEffect(tid,se.attr,se.amount,move.name,attacker.nickname||attacker.pokemon.name));
                });
                onIncrementAction(attacker.id,isPriority);onClose();
              }} style={{width:"100%",padding:"8px 10px",background:"#00d4aa",border:"none",borderRadius:5,fontSize:12,fontWeight:700,color:"#0f1117",cursor:"pointer"}}>
                ✓ {statFx.length>0?"Apply Effect & Action Used":"Mark Action Used & Close"}{!isPriority&&` (Action #${(attacker.actionCount||0)+1})`}
              </button>
            </div>
          )}

          {/* Substitute — create a decoy, lose 1/4 HP */}
          {canAct&&(accResult?.successes??0)>=actReq&&isSubstitute&&onApplySpecial&&(
            <div style={{background:"rgba(104,144,240,0.08)",border:"1px solid #6890f040",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6890f0",marginBottom:6}}>🛡️ Substitute</div>
              <div style={{fontSize:10,color:"#8b90a8",marginBottom:8}}>Costs 1/4 max HP to create. A 🛡️ Sub indicator appears on the card.</div>
              <button onClick={()=>{const cost=Math.max(1,Math.floor(attacker.maxHp/4));onApplyDmg(attacker.id,cost);onApplySpecial!(attacker.id,{hasSubstitute:true});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",background:"#6890f0",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                🛡️ Create Substitute (costs {Math.max(1,Math.floor(attacker.maxHp/4))} HP)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Capture Popup (full) ──────────────────────────────────────────────────────
function CapturePopup({allEntries,defaultTargetId,onClose}:{allEntries:BattleEntry[];defaultTargetId?:string;onClose:()=>void;}){
  const trainers=useMemo(()=>loadFromStorage<any[]>("trainers",[]),[]);
  const pokemonSheets=useMemo(()=>loadFromStorage<Record<string,any>>("pokemon_sheets",{}),[]);

  const [throwerId,setThrowerId]=useState<string>("");
  const [targetId,setTargetId]=useState<string>(defaultTargetId||"");
  const [ballKey,setBallKey]=useState<string>("");
  const [throwRoll,setThrowRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [sealRoll,setSealRoll]=useState<{rolls:number[];successes:number}|null>(null);

  const thrower=trainers.find(t=>t.id===throwerId);
  const target=allEntries.find(e=>e.id===targetId);
  const enemies=allEntries.filter(e=>e.side==="enemy"&&e.currentHp>0);

  // Get thrower's pokeballs from inventory
  const throwerInventory:ItemData[]=useMemo(()=>{
    if(!thrower)return[];
    return (thrower.inventory||[]) as ItemData[];
  },[thrower]);
  const balls=throwerInventory.filter(i=>i.pocket==="Pokeballs"||i.category?.toLowerCase().includes("ball")||i.name.toLowerCase().includes("ball"));
  // Fallback: standard balls shown as unavailable if thrower has no inventory
  const STANDARD_BALLS=[
    {name:"Pokéball",description:"Standard ball.",pocket:"Pokeballs",category:"Ball",cost:"200",oneUse:true},
    {name:"Great Ball",description:"Better ball.",pocket:"Pokeballs",category:"Ball",cost:"600",oneUse:true},
    {name:"Ultra Ball",description:"High-quality ball.",pocket:"Pokeballs",category:"Ball",cost:"1200",oneUse:true},
  ] as ItemData[];
  const ballOptions=thrower?(balls.length>0?balls:STANDARD_BALLS):STANDARD_BALLS;
  const isBallAvailable=(b:ItemData)=>!thrower||balls.some(bl=>bl.name===b.name);

  const SEAL_POTENCY:Record<string,number>={"Pokéball":4,"Great Ball":6,"Ultra Ball":8};
  const getSealDice=(name:string)=>SEAL_POTENCY[name]||4;
  const selectedBall=ballOptions.find(b=>b.name===ballKey);
  const sealDice=selectedBall?getSealDice(selectedBall.name):4;

  // Throw pool: SPC/DEX + Channel (skill 2)
  const throwPool=thrower?Math.max(1,(thrower.attributes?.special||1)+(thrower.skills?.channel||0)+2):4;

  // Catch requirements
  const CATCH_REQ:Record<Rank,number>={Starter:3,Rookie:4,Standard:6,Advanced:8,Expert:9,Ace:10,Master:12,Champion:14};
  const required=target?CATCH_REQ[target.pokemon.suggestedRank]??6:6;
  const atHalf=target&&target.currentHp<=target.maxHp/2&&target.currentHp>1;
  const atOne=target&&target.currentHp===1;
  const hpBonus=atOne?2:atHalf?1:0;
  const statusBonus=target&&primaryStatus(target)!=="Healthy"?1:0;
  const totalBonus=hpBonus+statusBonus;
  const totalSuccesses=(throwRoll?.successes??0)+(sealRoll?.successes??0)+totalBonus;
  const caught=!!(throwRoll&&sealRoll&&totalSuccesses>=required);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:480,maxHeight:"88vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🎯 Capture Pokémon</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>

          {/* Step 1: Select Thrower */}
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>1. Select Thrower</div>
            <select value={throwerId} onChange={e=>setThrowerId(e.target.value)} style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#e8eaf0",fontSize:12,padding:"5px 8px"}}>
              <option value="">— choose trainer —</option>
              {trainers.map(t=><option key={t.id} value={t.id}>{t.name} ({t.rank})</option>)}
            </select>
            {thrower&&<div style={{background:"#13151f",borderRadius:5,padding:"8px 10px",marginTop:6,fontSize:11}}>
              <span style={{color:"#5a6080"}}>SPC: </span><strong style={{color:"#e8eaf0"}}>{thrower.attributes?.special||1}</strong>
              <span style={{color:"#5a6080",marginLeft:10}}>Channel skill: </span><strong style={{color:"#e8eaf0"}}>{thrower.skills?.channel||0}</strong>
              <span style={{color:"#5a6080",marginLeft:10}}>Throw pool: </span><strong style={{color:"#3d8bff"}}>{throwPool}d</strong>
            </div>}
          </div>

          {/* Step 2: Select Target */}
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>2. Select Target Pokémon</div>
            <select value={targetId} onChange={e=>setTargetId(e.target.value)} style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#e8eaf0",fontSize:12,padding:"5px 8px"}}>
              <option value="">— choose target —</option>
              {enemies.map(e=><option key={e.id} value={e.id}>{e.nickname||e.pokemon.name} ({e.currentHp}/{e.maxHp} HP, {e.pokemon.suggestedRank})</option>)}
              {allEntries.filter(e=>e.side!=="enemy").map(e=><option key={e.id} value={e.id}>[{e.side}] {e.nickname||e.pokemon.name}</option>)}
            </select>
            {target&&<div style={{background:"#13151f",borderRadius:5,padding:"8px 10px",marginTop:6,fontSize:11}}>
              <span style={{color:"#5a6080"}}>Rank: </span><strong style={{color:"#ffd32a"}}>{target.pokemon.suggestedRank}</strong>
              <span style={{color:"#5a6080",marginLeft:10}}>Needs: </span><strong style={{color:"#ffd32a"}}>{required} successes</strong>
              <span style={{color:"#5a6080",marginLeft:10}}>HP: </span><strong style={{color:atOne?"#ff4757":atHalf?"#ffd32a":"#00d4aa"}}>{target.currentHp}/{target.maxHp}</strong>
              <span style={{color:"#5a6080",marginLeft:10}}>Status: </span><strong style={{color:"#a040a0"}}>{primaryStatus(target)}</strong>
              {totalBonus>0&&<div style={{marginTop:4,color:"#00d4aa",fontWeight:700}}>Bonus +{totalBonus}: {hpBonus>0?`HP +${hpBonus} `:""}{statusBonus>0?`Status +${statusBonus}`:""}</div>}
            </div>}
          </div>

          {/* Step 3: Select Ball */}
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>3. Select Pokéball {thrower&&balls.length===0?"(no balls in inventory — using defaults)":""}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {ballOptions.map(b=>{const avail=isBallAvailable(b);return<button key={b.name} onClick={()=>avail&&setBallKey(b.name)} disabled={!avail} style={{flex:1,minWidth:80,padding:"7px 6px",borderRadius:5,border:`1px solid ${ballKey===b.name?"#ffd32a":avail?"#3a4060":"#2a2f45"}`,background:!avail?"#0a0c14":ballKey===b.name?"rgba(255,211,42,0.15)":"#13151f",color:!avail?"#3a4060":ballKey===b.name?"#ffd32a":"#8b90a8",fontSize:11,fontWeight:ballKey===b.name?700:400,cursor:avail?"pointer":"not-allowed",textAlign:"center",opacity:avail?1:0.5}}>
                {b.name}{!avail&&thrower?<div style={{fontSize:8,color:"#3a4060"}}>Not in inventory</div>:<div style={{fontSize:9,color:"#5a6080"}}>{getSealDice(b.name)}d seal</div>}
              </button>;})}
            </div>
          </div>

          {/* Step 4: Throw Roll */}
          {throwerId&&targetId&&ballKey&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>4. Throw Roll: SPC + Channel + 2 Skill = {throwPool}d · Need {required} total successes</div>
              {throwPool<required&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475730",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757",marginBottom:6}}>⚠ Throw pool ({throwPool}d) is less than required successes ({required}) — bonus from sealing and target condition needed</div>}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setThrowRoll(rollDice(throwPool))} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Throw ({throwPool}d)</button>
                {throwRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:throwRoll.successes>0?"#00d4aa":"#ff4757"}}>[{throwRoll.rolls.join(",")}] = {throwRoll.successes} hits {throwRoll.successes===0?"✗ Miss — ball fails to reach":"✓ Ball lands"}</span>}
              </div>
            </div>
          )}

          {/* Step 5: Seal Potency */}
          {throwRoll&&throwRoll.successes>0&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>5. Seal Potency: {selectedBall?.name} = {sealDice}d</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setSealRoll(rollDice(sealDice))} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:"#f08030",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Seal ({sealDice}d)</button>
                {sealRoll&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700}}>[{sealRoll.rolls.join(",")}] = {sealRoll.successes}</span>}
              </div>
            </div>
          )}

          {/* Result */}
          {throwRoll&&sealRoll&&target&&(
            <div style={{background:caught?"rgba(0,212,170,0.15)":"rgba(255,71,87,0.15)",border:`1px solid ${caught?"#00d4aa":"#ff4757"}40`,borderRadius:6,padding:"14px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:800,fontFamily:"'Exo 2'",color:caught?"#00d4aa":"#ff4757",marginBottom:6}}>{caught?"✓ Caught!":"✗ Broke Free!"}</div>
              <div style={{fontSize:12,color:"#8b90a8"}}>{throwRoll.successes} throw + {sealRoll.successes} seal + {totalBonus} bonus = <strong style={{color:caught?"#00d4aa":"#ff4757"}}>{totalSuccesses}</strong> / {required} needed</div>
              {!caught&&<div style={{fontSize:11,color:"#5a6080",marginTop:4}}>Need {required-totalSuccesses} more success{required-totalSuccesses!==1?"es":""}. Weaken further or use a better ball.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EOR Popup ─────────────────────────────────────────────────────────────────
function EORPopup({entries,weather,round,onApply,onClose}:{entries:BattleEntry[];weather:WeatherData;round:number;onApply:(id:string,hp:number)=>void;onClose:()=>void;}){
  const effects:{entry:BattleEntry;desc:string;hp:number}[]=[];
  entries.filter(e=>e.currentHp>0).forEach(e=>{
    const sts=e.statuses||[primaryStatus(e)];
    if(sts.includes("Burned"))effects.push({entry:e,desc:"Burn −1 HP",hp:-1});
    if(sts.includes("Poisoned"))effects.push({entry:e,desc:"Poison −1 HP",hp:-1});
    if(sts.includes("Badly Poisoned"))effects.push({entry:e,desc:"Bad Poison −2 HP",hp:-2});
    if(weather.endOfRoundDmg&&!e.weatherImmune&&!(weather.immuneTypes??[]).some((t:string)=>e.pokemon.types.includes(t as PokemonType)))effects.push({entry:e,desc:`${weather.name} chip`,hp:-weather.endOfRoundDmg});
    // Hold item passive EOR effects
    const trainers_eor=loadFromStorage<any[]>("trainers",[]);
    const held=getHeldItem(e,trainers_eor);
    if(held){
      const hn=held.toLowerCase();
      if(hn.includes("leftovers"))effects.push({entry:e,desc:`Leftovers +1 HP`,hp:1});
      if((hn.includes("black sludge"))&&e.pokemon.types.includes("Poison"))effects.push({entry:e,desc:`Black Sludge +1 HP`,hp:1});
      if((hn.includes("black sludge"))&&!e.pokemon.types.includes("Poison"))effects.push({entry:e,desc:`Black Sludge −1 HP`,hp:-1});
    }
  });
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🔄 End of Round {round}</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button></div>
        <div style={{padding:16,overflowY:"auto"}}>
          {effects.length===0?<div style={{color:"#5a6080",textAlign:"center",padding:20}}>No end-of-round effects.</div>:effects.map((ef,i)=>(
            <div key={i} style={{background:"#13151f",borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div><div style={{fontSize:12,fontWeight:700,color:"#e8eaf0"}}>{ef.entry.nickname||ef.entry.pokemon.name}</div><div style={{fontSize:11,color:"#8b90a8",marginTop:2}}>{ef.desc}</div></div>
              <button onClick={()=>onApply(ef.entry.id,ef.hp)} style={{background:"#ff475720",border:"1px solid #ff475740",borderRadius:4,color:"#ff4757",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Apply {ef.hp}</button>
            </div>
          ))}
          {effects.length>0&&<button onClick={()=>{effects.forEach(ef=>onApply(ef.entry.id,ef.hp));onClose();}} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:8}}>Apply All & Close</button>}
        </div>
      </div>
    </div>
  );
}

// ── Priority Popup ────────────────────────────────────────────────────────────
function PriorityPopup({entries,allEntries,weather,onClose,onApplyDmg,onApplyEffect,onIncrementAction,onSpendWP,onApplySpecial}:{
  entries:BattleEntry[];allEntries:BattleEntry[];weather:WeatherData;onClose:()=>void;
  onApplyDmg:(id:string,dmg:number)=>void;
  onApplyEffect:(id:string,attr:string,amount:number,src:string,appliedBy?:string)=>void;
  onIncrementAction:(id:string,isReaction?:boolean)=>void;
  onSpendWP:(id:string,amt:number)=>void;
  onApplySpecial?:(id:string,u:Partial<BattleEntry>)=>void;
}){
  const [activeMove,setActiveMove]=useState<{entry:BattleEntry;move:Move}|null>(null);
  const pri=useMemo(()=>{const r:{entry:BattleEntry;move:Move}[]=[];entries.filter(e=>e.currentHp>0&&!e.reactionUsed).forEach(e=>{const pm=e.moves.filter(m=>(m.priority??0)>0);if(pm.length>0)r.push({entry:e,move:pm.sort((a,b)=>(b.priority??0)-(a.priority??0))[0]});});return r.sort((a,b)=>(b.move.priority??0)-(a.move.priority??0));},[entries]);
  if(pri.length===0)return null;
  return(
    <>
    {activeMove&&<MovePopup move={activeMove.move} attacker={activeMove.entry} allEntries={allEntries} weather={weather} onClose={()=>setActiveMove(null)} onApplyDmg={onApplyDmg} onApplyEffect={onApplyEffect} onIncrementAction={onIncrementAction} onSpendWP={onSpendWP} onApplySpecial={onApplySpecial} fromPriorityPhase={true}/>}
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #00d4aa40",borderRadius:10,width:480,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:"#00d4aa",margin:0}}>⚡ Priority Phase — Declare Reactions</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button></div>
        <div style={{padding:16,overflowY:"auto"}}>
          <p style={{fontSize:11,color:"#8b90a8",marginBottom:12}}>Click a move to use it now. Priority order: highest first. Reactions use 1 WP each.</p>
          {pri.map(({entry,move})=>(
            <div key={entry.id} style={{background:"#13151f",border:`1px solid ${TYPE_COLORS[move.type as PokemonType]||"#2a2f45"}40`,borderRadius:6,padding:"10px 12px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700,color:"#e8eaf0",flex:1}}>{entry.nickname||entry.pokemon.name}</span>
                <span style={{fontSize:9,color:"#5a6080"}}>HP</span>
                <span style={{fontSize:11,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span>
                <span style={{fontSize:9,color:"#5a6080",marginLeft:6}}>WP</span>
                <span style={{fontSize:11,color:"#6890f0"}}>{entry.currentWill}/{entry.maxWill}</span>
              </div>
              {/* Show all priority moves for this entry as clickable */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {entry.moves.filter(m=>(m.priority??0)>0).sort((a,b)=>(b.priority??0)-(a.priority??0)).map((m,i)=>(
                  <button key={i} onClick={()=>setActiveMove({entry,move:m})} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:4,border:`1px solid ${TYPE_COLORS[m.type as PokemonType]||"#00d4aa"}40`,background:`${TYPE_COLORS[m.type as PokemonType]||"#00d4aa"}12`,cursor:"pointer"}}>
                    <TypeBadge type={m.type as PokemonType} small/>
                    <span style={{fontSize:11,color:"#e8eaf0"}}>{m.name}</span>
                    <span style={{fontSize:9,fontWeight:700,color:"#00d4aa"}}>P{m.priority}</span>
                    <span style={{fontSize:9,color:"#5a6080"}}>▶ Use</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={onClose} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>Continue to Normal Turn Order ▶</button>
        </div>
      </div>
    </div>
    </>
  );
}

// ── Battle Card (HORIZONTAL COLUMN) ──────────────────────────────────────────
/* ── Move Edit with Search ───────────────────────────────────────────────────── */
function MoveSearchEdit({entry,onUpdate}:{entry:BattleEntry;onUpdate:(u:Partial<BattleEntry>)=>void}){
  const [q,setQ]=useState("");
  const learnableMoves=useMemo(()=>{
    const learned=entry.pokemon.moves.map(pm=>MOVES.find(m=>m.name===pm.name)).filter(Boolean) as Move[];
    // De-dupe: put already-equipped moves first
    const equipped=entry.moves;
    const rest=learned.filter(m=>!equipped.some(em=>em.name===m.name));
    return [...equipped,...rest];
  },[entry.pokemon.moves,entry.moves]);
  const filtered=useMemo(()=>{
    if(!q)return learnableMoves;
    const ql=q.toLowerCase();
    return MOVES.filter(m=>m.name.toLowerCase().includes(ql)||m.type.toLowerCase().includes(ql)).slice(0,80);
  },[q,learnableMoves]);
  return(
    <div>
      <input type="text" placeholder="🔍 Search all 894 moves…" value={q} onChange={e=>setQ(e.target.value)}
        style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,padding:"3px 6px",color:"#e8eaf0",fontSize:10,marginBottom:4,outline:"none"}}/>
      {!q&&<div style={{fontSize:8,color:"#5a6080",marginBottom:3}}>Showing all learnable moves ({learnableMoves.length}). Search to find any move.</div>}
      <div style={{maxHeight:180,overflowY:"auto"}}>
        {filtered.map(m=>{const has=entry.moves.some(em=>em.name===m.name);return(
          <div key={m.name} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 0",borderBottom:"1px solid #1a1d2710"}}>
            <input type="checkbox" checked={has} onChange={()=>onUpdate({moves:has?entry.moves.filter(em=>em.name!==m.name):[...entry.moves,m]})}/>
            <TypeBadge type={m.type as PokemonType} small/>
            <span style={{fontSize:9,color:"#e8eaf0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
            {(m.priority??0)>0&&<span style={{fontSize:7,color:"#00d4aa"}}>P{m.priority}</span>}
            <span style={{fontSize:7,color:"#5a6080"}}>{m.category.slice(0,3)}</span>
          </div>
        );})}
        {filtered.length===0&&q&&<div style={{fontSize:9,color:"#5a6080",fontStyle:"italic",padding:"4px 0"}}>No moves match &quot;{q}&quot;</div>}
      </div>
    </div>
  );
}

/* ── Trainer Card (full card view, replaces pokemon card when toggled) ────────── */
function TrainerSkillsInline({trainer,entry,allEntries,onSpendWP,onIncrementAction,onUpdate}:{
  trainer:any;entry:BattleEntry;allEntries:BattleEntry[];
  onSpendWP:(id:string,amt:number)=>void;
  onIncrementAction:(id:string,isReaction?:boolean)=>void;
  onUpdate?:(id:string,u:Partial<BattleEntry>)=>void;
}){
  const [selSkill,setSelSkill]=useState<string|null>(null);
  const [roll,setRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [targets,setTargets]=useState<string[]>([]);
  const [showBag,setShowBag]=useState(false);
  const attrs=trainer?.attributes||{strength:1,dexterity:1,vitality:1,insight:1};
  const standardSkills=trainer?.skills||{};
  const customSkills:Record<string,number>=Object.fromEntries((trainer?.customSkills||[]).map((cs:any)=>[cs.name,cs.points]));
  const allSkills={...standardSkills,...customSkills};
  const others=allEntries.filter(e=>e.id!==entry.id&&e.currentHp>0);
  const av=(k:string)=>(attrs as any)[k]??1;
  const actReq=[1,2,3,4,5][Math.min(entry.actionCount,4)];
  // Trainer HP/WP derived from attributes
  const trainerMaxHp=4+(attrs.vitality||1);
  const trainerMaxWp=(attrs.insight||1)+3;
  const trainerCurHp=entry.trainerCurrentHp??trainerMaxHp;
  const trainerCurWp=entry.trainerCurrentWp??trainerMaxWp;
  const inventory:any[]=(trainer?.inventory||[]);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:0,padding:0}}>
      {/* HP + WP bars with inline ± buttons */}
      <div style={{padding:"5px 8px 5px",background:"#0f1117"}}>
        {/* HP row */}
        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
          <span style={{fontSize:9,color:"#5a6080",width:16}}>HP</span>
          <button onClick={()=>onUpdate&&onUpdate(entry.id,{trainerCurrentHp:Math.max(0,trainerCurHp-1)})} style={{width:16,height:16,borderRadius:3,border:"1px solid #3a4060",background:"rgba(255,71,87,0.15)",color:"#ff4757",cursor:"pointer",fontSize:11,lineHeight:1,flexShrink:0}}>−</button>
          <span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:trainerCurHp/trainerMaxHp>0.5?"#3d8bff":trainerCurHp/trainerMaxHp>0.25?"#ffd32a":"#ff4757",minWidth:28,textAlign:"center"}}>{trainerCurHp}/{trainerMaxHp}</span>
          <button onClick={()=>onUpdate&&onUpdate(entry.id,{trainerCurrentHp:Math.min(trainerMaxHp,trainerCurHp+1)})} style={{width:16,height:16,borderRadius:3,border:"1px solid #3a4060",background:"rgba(61,139,255,0.15)",color:"#3d8bff",cursor:"pointer",fontSize:11,lineHeight:1,flexShrink:0}}>+</button>
        </div>
        <div style={{background:"#2a2f45",borderRadius:3,height:5,overflow:"hidden",marginBottom:4}}>
          <div style={{width:`${Math.max(0,Math.min(1,trainerCurHp/trainerMaxHp))*100}%`,height:"100%",background:trainerCurHp/trainerMaxHp>0.5?"#3d8bff":trainerCurHp/trainerMaxHp>0.25?"#ffd32a":"#ff4757",transition:"width 0.3s"}}/>
        </div>
        {/* WP row */}
        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
          <span style={{fontSize:9,color:"#5a6080",width:16}}>WP</span>
          <button onClick={()=>onUpdate&&onUpdate(entry.id,{trainerCurrentWp:Math.max(0,trainerCurWp-1)})} style={{width:16,height:16,borderRadius:3,border:"1px solid #3a4060",background:"rgba(255,71,87,0.15)",color:"#ff4757",cursor:"pointer",fontSize:11,lineHeight:1,flexShrink:0}}>−</button>
          <span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:"#6890f0",minWidth:28,textAlign:"center"}}>{trainerCurWp}/{trainerMaxWp}</span>
          <button onClick={()=>onUpdate&&onUpdate(entry.id,{trainerCurrentWp:Math.min(trainerMaxWp,trainerCurWp+1)})} style={{width:16,height:16,borderRadius:3,border:"1px solid #3a4060",background:"rgba(61,139,255,0.15)",color:"#3d8bff",cursor:"pointer",fontSize:11,lineHeight:1,flexShrink:0}}>+</button>
        </div>
        <div style={{background:"#0f1117",borderRadius:3,height:4,overflow:"hidden"}}>
          <div style={{width:`${trainerMaxWp>0?Math.max(0,Math.min(1,trainerCurWp/trainerMaxWp))*100:0}%`,height:"100%",background:"#6890f0",transition:"width 0.3s"}}/>
        </div>
      </div>

      {/* Attribute grid — mirrors Pokémon card quick-stats style */}
      <div style={{padding:"4px 8px",background:"#13151f",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
        {[["STR","strength"],["DEX","dexterity"],["VIT","vitality"],["INS","insight"]].map(([l,k])=>(
          <div key={k} style={{textAlign:"center",background:"#0f1117",borderRadius:3,padding:"4px 0"}}>
            <div style={{fontSize:7,color:"#5a6080",textTransform:"uppercase",letterSpacing:"0.5px"}}>{l}</div>
            <div style={{fontSize:14,fontFamily:"'Exo 2'",fontWeight:700,color:"#3d8bff"}}>{av(k)}</div>
          </div>
        ))}
      </div>

      <div style={{padding:"6px 8px",display:"flex",flexDirection:"column",gap:6}}>

      {/* Skills as Moves */}
      <div>
        <div style={{fontSize:8,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Skills</div>
        {Object.entries(allSkills).filter(([,v])=>(v as number)>0).map(([sk,v])=>{
          const def=TRAINER_SKILL_DEFS[sk];
          const pool=def?av(def.attr)+(v as number):(v as number);
          const isSel=selSkill===sk;
          return(
            <div key={sk} style={{marginBottom:3}}>
              <button onClick={()=>{setSelSkill(isSel?null:sk);setRoll(null);setTargets([]);}} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 7px",background:isSel?"rgba(61,139,255,0.15)":"#13151f",border:`1px solid ${isSel?"#3d8bff":"#3d8bff20"}`,borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%"}}>
                <span style={{fontSize:9,color:"#3d8bff",background:"rgba(61,139,255,0.1)",padding:"1px 5px",borderRadius:2,textTransform:"capitalize",flexShrink:0,minWidth:60}}>{sk}</span>
                <span style={{fontSize:10,color:"#e8eaf0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{def?.desc||sk}</span>
                <span style={{fontSize:10,color:"#3d8bff",fontFamily:"'Exo 2'",fontWeight:700,flexShrink:0}}>{pool}d</span>
                <span style={{fontSize:8,color:"#5a6080",flexShrink:0}}>▶</span>
              </button>
              {isSel&&(
                <div style={{background:"#0f1117",borderRadius:"0 0 4px 4px",padding:"6px 8px",border:"1px solid #3d8bff20",borderTop:"none",marginTop:-1}}>
                  {def&&<div style={{fontSize:9,color:"#8b90a8",marginBottom:5,lineHeight:1.4}}>{def.combat}</div>}
                  <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:5}}>
                    {others.map(t=><button key={t.id} onClick={()=>setTargets(p=>p.includes(t.id)?p.filter(x=>x!==t.id):[...p,t.id])} style={{padding:"2px 6px",borderRadius:3,fontSize:9,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#e8eaf0":"#8b90a8"}}>{t.nickname||t.pokemon.name}</button>)}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <button onClick={()=>setRoll(rollDice(Math.max(1,pool)))} style={{background:"#3d8bff20",border:"1px solid #3d8bff50",borderRadius:3,color:"#3d8bff",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🎲 Roll {sk} ({pool}d)</button>
                    {roll&&<span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:roll.successes>=actReq?"#00d4aa":"#ff4757"}}>[{roll.rolls.join(",")}]={roll.successes} {roll.successes>=actReq?"✓":"✗"} (need {actReq})</span>}
                    {roll&&roll.successes>=actReq&&<button onClick={()=>{onIncrementAction(entry.id);setRoll(null);setSelSkill(null);}} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:3,padding:"3px 6px",fontSize:9,fontWeight:700,cursor:"pointer"}}>✓ +Action</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {Object.entries(allSkills).filter(([,v])=>(v as number)>0).length===0&&<div style={{fontSize:9,color:"#5a6080",fontStyle:"italic"}}>No skills trained.</div>}
      </div>

      {/* Bag / Inventory */}
      <div>
        <button onClick={()=>setShowBag(!showBag)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",background:"#13151f",border:"1px solid #ffd32a20",borderRadius:4,padding:"5px 8px",cursor:"pointer",textAlign:"left"}}>
          <span style={{fontSize:10,fontWeight:700,color:"#ffd32a",flex:1}}>🎒 Bag ({inventory.length} items)</span>
          <span style={{fontSize:8,color:"#5a6080"}}>{showBag?"▲":"▼"}</span>
        </button>
        {showBag&&(
          <div style={{background:"#0f1117",borderRadius:"0 0 4px 4px",padding:"6px 8px",border:"1px solid #ffd32a20",borderTop:"none"}}>
            {inventory.length===0&&<div style={{fontSize:9,color:"#5a6080",fontStyle:"italic"}}>Empty.</div>}
            {inventory.map((item:any,ii:number)=>{
              const n=item.name.toLowerCase();
              const healAmt=n.includes("max potion")||n.includes("max revive")?entry.maxHp:n.includes("hyper potion")?50:n.includes("super potion")?20:n==="potion"||n.includes(" potion")?10:n.includes("oran berry")?10:n.includes("sitrus berry")?Math.floor(entry.maxHp/4):n.includes("moomoo milk")?100:n.includes("lemonade")?70:n.includes("fresh water")?30:n.includes("soda pop")?50:null;
              const isRevive=n.includes("revive");
              const healRevive=n.includes("max revive")?entry.maxHp:isRevive?Math.floor(entry.maxHp/2):null;
              const statusCure=n.includes("antidote")?"Poisoned":n.includes("burn heal")?"Burned":n.includes("ice heal")?"Frozen":(n.includes("paralyze heal")||n.includes("parlyzheal"))?"Paralyzed":(n.includes("awakening")||n.includes("chesto berry"))?"Asleep":(n.includes("full heal")||n.includes("full restore"))?"all":n.includes("pecha berry")?"Poisoned":n.includes("rawst berry")?"Burned":n.includes("aspear berry")?"Frozen":n.includes("cheri berry")?"Paralyzed":n.includes("lum berry")?"all":null;
              const xBoost=n.includes("x attack")?"strength":n.includes("x defense")?"vitality":(n.includes("x sp. atk")||n.includes("x spatk"))?"special":(n.includes("x sp. def")||n.includes("x spdef"))?"insight":n.includes("x speed")?"dexterity":null;
              const holdNote=n.includes("leftovers")?"🔮 +1 HP/round (EOR)":n.includes("choice band")?"🔮 STR+2/locked":n.includes("choice specs")?"🔮 SPC+2/locked":n.includes("choice scarf")?"🔮 DEX+2/locked":n.includes("life orb")?"🔮 +2dmg/recoil":n.includes("focus sash")?"🔮 Survive 1-hit":n.includes("rocky helmet")?"🔮 Contact→1dmg":n.includes("assault vest")?"🔮 VIT+2/no support":n.includes("eviolite")?"🔮 VIT+INS+2":null;
              const canUse=!!(healAmt||healRevive||statusCure||xBoost);
              return(
                <div key={ii} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 0",borderBottom:"1px solid #1a1d27"}}>
                  <span style={{fontSize:9,color:"#ffd32a",flex:1}}>{item.name}</span>
                  {holdNote&&<span style={{fontSize:7,color:"#8b90a8"}} title={holdNote}>{holdNote.slice(0,12)}</span>}
                  <span style={{fontSize:8,color:"#5a6080"}}>×{item.quantity}</span>
                  {onUpdate&&canUse&&<button onClick={()=>{
                    if(healAmt!==null)onUpdate(entry.id,{currentHp:Math.min(entry.maxHp,entry.currentHp+(healAmt as number))});
                    else if(healRevive)onUpdate(entry.id,{currentHp:healRevive as number,statuses:["Healthy"]});
                    else if(statusCure==="all")onUpdate(entry.id,{statuses:["Healthy"],currentHp:entry.maxHp});
                    else if(statusCure)onUpdate(entry.id,{statuses:removeStatus(entry.statuses||[],statusCure as string)});
                    else if(xBoost){const nm=[...entry.statMods];nm.push({source:item.name,attr:xBoost as string,amount:1,appliedBy:"Item"});onUpdate(entry.id,{statMods:nm});}
                    alert(`Used ${item.name} on ${entry.nickname||entry.pokemon.name}!`);
                  }} style={{background:"rgba(255,211,42,0.15)",border:"1px solid #ffd32a40",borderRadius:3,color:"#ffd32a",padding:"2px 6px",fontSize:8,fontWeight:700,cursor:"pointer"}}>Use</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  </div>
  );
}

// ── Advanced Battle Mechanics ────────────────────────────────────────────────
const ALL_TYPES_LIST=["Normal","Fire","Water","Grass","Electric","Ice","Fighting","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"] as const;

function MegaEvolutionPopup({entry,allEntries,onClose,onApply}:{
  entry:BattleEntry;allEntries:BattleEntry[];onClose:()=>void;
  onApply:(id:string,u:Partial<BattleEntry>)=>void;
}){
  // Rules: Costs 1 WP. Restores full HP + full WP + clears all statuses.
  // Pokémon must have Mega-Stone held + Trainer has Key Stone.
  // Attrs may be redistributed. Lasts whole battle. Only one per trainer.
  const canMega=!entry.isMegaEvolved&&entry.currentWill>=1;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #f08030",borderRadius:10,width:460,padding:24,fontFamily:"'Exo 2'"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{color:"#f08030",margin:0,fontSize:16}}>⚡ Mega Evolution</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {entry.isMegaEvolved?(
          <div>
            <div style={{color:"#f08030",fontWeight:700,marginBottom:12}}>🔶 {entry.nickname||entry.pokemon.name} is Mega-Evolved!</div>
            <div style={{fontSize:11,color:"#8b90a8",marginBottom:16}}>Mega Evolution lasts the whole battle. It will revert when the battle ends.</div>
            <button onClick={()=>{
              onApply(entry.id,{isMegaEvolved:false,attrs:entry.megaOriginalAttrs||entry.attrs,megaOriginalAttrs:undefined});
              onClose();
            }} style={{width:"100%",background:"#5a6080",color:"#fff",border:"none",borderRadius:6,padding:10,fontWeight:700,cursor:"pointer"}}>
              Revert to Original Form
            </button>
          </div>
        ):(
          <div>
            <div style={{background:"rgba(240,128,48,0.08)",border:"1px solid #f0803030",borderRadius:6,padding:12,marginBottom:16,fontSize:11,color:"#e8eaf0",lineHeight:1.6}}>
              <strong style={{color:"#f08030"}}>Requirements:</strong><br/>
              • Pokémon holds a Mega-Stone (Held Item slot)<br/>
              • Trainer wears a Key Stone<br/>
              • Costs <strong>1 WP</strong> on Pokémon&apos;s turn<br/>
              • Only one Mega-Evolution per Trainer per battle<br/><br/>
              <strong style={{color:"#f08030"}}>On Mega-Evolving:</strong><br/>
              • Restores <strong>full HP</strong>, all <strong>WP</strong>, heals <strong>all statuses</strong><br/>
              • Attributes may be redistributed at your convenience<br/>
              • Can have a different moveset<br/>
              • Attributes may exceed the cap of 10<br/>
              • Buffs/Debuffs on original form carry over
            </div>
            {!canMega&&<div style={{color:"#ff4757",fontSize:11,marginBottom:12}}>⚠ Not enough WP (need 1)</div>}
            <button onClick={()=>{
              if(!canMega)return;
              onApply(entry.id,{
                isMegaEvolved:true,
                megaOriginalAttrs:{...entry.attrs},
                currentHp:entry.maxHp,
                currentWill:entry.maxWill,
                statuses:["Healthy"],
              });
              onClose();
            }} disabled={!canMega} style={{width:"100%",background:canMega?"#f08030":"#3a4060",color:"#fff",border:"none",borderRadius:6,padding:10,fontWeight:700,cursor:canMega?"pointer":"default",marginBottom:8}}>
              ⚡ Mega Evolve! (−1 WP, +Full HP/WP, −All Status)
            </button>
            <div style={{fontSize:9,color:"#5a6080",textAlign:"center"}}>Manually update the Pokémon&apos;s stats/moves to reflect its Mega form</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DynamaxPopup({entry,onClose,onApply}:{
  entry:BattleEntry;onClose:()=>void;
  onApply:(id:string,u:Partial<BattleEntry>)=>void;
}){
  // Rules: Trainer has Dynamax Band + Dynamax-Ball. Happens start of round.
  // Dynamax: +6 extra HP. Gigamax: +12 extra HP + STR/SPC/DEX/DEF/SPDEF +2.
  // Lasts 3 rounds. Cannot evade/clash. Cannot be copied.
  // All moves become Max Moves (same type/category). Support→Max Guard.
  const [isGiga,setIsGiga]=useState(false);
  const extraHp=isGiga?12:6;
  const isDynaxActive=entry.isDynamaxed;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #ff4757",borderRadius:10,width:460,padding:24,fontFamily:"'Exo 2'"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{color:"#ff4757",margin:0,fontSize:16}}>💫 {isGiga?"Gigamax":"Dynamax"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {isDynaxActive?(
          <div>
            <div style={{color:"#ff4757",fontWeight:700,fontSize:14,marginBottom:8}}>💫 {entry.nickname||entry.pokemon.name} is {entry.isGigamax?"Gigamaxed":"Dynamaxed"}!</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <div style={{background:"rgba(255,71,87,0.1)",borderRadius:5,padding:"8px 12px",textAlign:"center",flex:1}}>
                <div style={{fontSize:10,color:"#5a6080"}}>Extra HP</div>
                <div style={{fontSize:20,fontWeight:700,color:"#ff4757",fontFamily:"'Exo 2'"}}>{entry.dynamaxExtraHpCur??0}/{entry.isGigamax?12:6}</div>
              </div>
              <div style={{background:"rgba(255,71,87,0.1)",borderRadius:5,padding:"8px 12px",textAlign:"center",flex:1}}>
                <div style={{fontSize:10,color:"#5a6080"}}>Rounds Left</div>
                <div style={{fontSize:20,fontWeight:700,color:"#ffd32a",fontFamily:"'Exo 2'"}}>{entry.dynamaxRoundsLeft??0}</div>
              </div>
            </div>
            <div style={{fontSize:10,color:"#8b90a8",marginBottom:12}}>
              All moves are Max Moves. Cannot evade or clash. Immune to Flinch, Infatuation, OHKO moves, Destiny Bond.
            </div>
            {/* Extra HP adjuster */}
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:11,color:"#e8eaf0"}}>Extra HP:</span>
              <button onClick={()=>onApply(entry.id,{dynamaxExtraHpCur:Math.max(0,(entry.dynamaxExtraHpCur??0)-1)})} style={{background:"#ff4757",border:"none",borderRadius:3,color:"#fff",width:24,height:24,cursor:"pointer",fontWeight:700}}>−</button>
              <span style={{fontSize:13,fontWeight:700,color:"#ff4757",fontFamily:"'Exo 2'",minWidth:30,textAlign:"center"}}>{entry.dynamaxExtraHpCur??0}</span>
              <button onClick={()=>onApply(entry.id,{dynamaxExtraHpCur:Math.min(entry.isGigamax?12:6,(entry.dynamaxExtraHpCur??0)+1)})} style={{background:"#3a4060",border:"none",borderRadius:3,color:"#fff",width:24,height:24,cursor:"pointer",fontWeight:700}}>+</button>
            </div>
            <button onClick={()=>{
              onApply(entry.id,{isDynamaxed:false,dynamaxRoundsLeft:0,dynamaxExtraHpCur:0,isGigamax:false});
              onClose();
            }} style={{width:"100%",background:"#5a6080",color:"#fff",border:"none",borderRadius:6,padding:10,fontWeight:700,cursor:"pointer"}}>
              End Dynamax (revert to normal form)
            </button>
          </div>
        ):(
          <div>
            <div style={{background:"rgba(255,71,87,0.06)",border:"1px solid #ff475730",borderRadius:6,padding:12,marginBottom:16,fontSize:11,color:"#e8eaf0",lineHeight:1.6}}>
              <strong style={{color:"#ff4757"}}>Requirements:</strong><br/>
              • Trainer wears Dynamax Band + owns Dynamax-Ball<br/>
              • Transformation at <strong>start of a Round</strong><br/>
              • Only one per Trainer per battle. Lasts <strong>3 Rounds</strong><br/><br/>
              <strong style={{color:"#ff4757"}}>Effects:</strong><br/>
              • <strong>Dynamax:</strong> +6 Extra HP (absorbs damage first)<br/>
              • <strong>Gigamax:</strong> +12 Extra HP + STR/SPC/DEX +2 (buff rules apply)<br/>
              • All moves become Max Moves (same type/category)<br/>
              • Support moves → "Max Guard" (Protect effect)<br/>
              • <strong>Cannot evade or clash</strong><br/>
              • Immune to: Flinch, Infatuation, weight moves, OHKO, Destiny Bond
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button onClick={()=>setIsGiga(false)} style={{flex:1,background:!isGiga?"#ff4757":"rgba(255,71,87,0.1)",border:"1px solid #ff4757",borderRadius:5,color:!isGiga?"#fff":"#ff4757",padding:"8px",fontWeight:700,cursor:"pointer"}}>Dynamax (+6 HP)</button>
              <button onClick={()=>setIsGiga(true)} style={{flex:1,background:isGiga?"#ff4757":"rgba(255,71,87,0.1)",border:"1px solid #ff4757",borderRadius:5,color:isGiga?"#fff":"#ff4757",padding:"8px",fontWeight:700,cursor:"pointer"}}>Gigamax (+12 HP +attrs)</button>
            </div>
            <button onClick={()=>{
              const updates:Partial<BattleEntry>={isDynamaxed:true,dynamaxRoundsLeft:3,dynamaxExtraHpCur:extraHp,isGigamax:isGiga};
              if(isGiga){// Apply +2 to STR/SPC/DEX as stat mods
                updates.statMods=[...entry.statMods,
                  {source:"Gigamax",attr:"strength",amount:2},
                  {source:"Gigamax",attr:"special",amount:2},
                  {source:"Gigamax",attr:"dexterity",amount:2},
                ];
              }
              onApply(entry.id,updates);onClose();
            }} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:6,padding:10,fontWeight:700,cursor:"pointer",marginBottom:8}}>
              💫 {isGiga?"Gigamax":"Dynamax"}! (+{extraHp} Extra HP, 3 rounds)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TerastallizationPopup({entry,onClose,onApply}:{
  entry:BattleEntry;onClose:()=>void;
  onApply:(id:string,u:Partial<BattleEntry>)=>void;
}){
  // Rules: Tera Jewel/Shard held + Trainer has Tera Orb. Used as Reaction 10. Costs 1 WP.
  // Type changes to Stellar-Type → choose any of 18 type affinities.
  // Keeps original STAB + gains chosen type STAB.
  // First move same type as affinity: +3 extra dice (if matches original), +2 (if different).
  // After that: +1 dice to all moves. Tera-vs-Tera = always super effective.
  const [selType,setSelType]=useState<string>(entry.teraType||entry.pokemon.types[0]);
  const isSameAsOriginal=entry.pokemon.types.includes(selType as PokemonType);
  const bonusDice=isSameAsOriginal?3:2;
  const isTeraActive=entry.isTerastallized;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #a040a0",borderRadius:10,width:480,padding:24,fontFamily:"'Exo 2'"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{color:"#a040a0",margin:0,fontSize:16}}>💎 Terastallization</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {isTeraActive?(
          <div>
            <div style={{color:"#a040a0",fontWeight:700,marginBottom:8}}>💎 {entry.nickname||entry.pokemon.name} is Terastallized! ({entry.teraType}-Type)</div>
            <div style={{background:"rgba(160,64,160,0.08)",border:"1px solid #a040a040",borderRadius:5,padding:10,fontSize:11,color:"#e8eaf0",marginBottom:12,lineHeight:1.6}}>
              • Type is now: <strong style={{color:"#a040a0"}}>{entry.teraType}</strong> (removes dual-type, keeps original STAB)<br/>
              • First {entry.teraType}-type move: {entry.teraFirstMoveBonusUsed?<span style={{color:"#5a6080"}}>✓ Bonus used</span>:<span style={{color:"#00d4aa"}}>+{bonusDice} Extra Dice (pending)</span>}<br/>
              • All subsequent moves: +1 Damage Die<br/>
              • vs other Tera Pokémon: always Super Effective (both ways)
            </div>
            {!entry.teraFirstMoveBonusUsed&&(
              <button onClick={()=>{onApply(entry.id,{teraFirstMoveBonusUsed:true});onClose();}} style={{width:"100%",background:"#a040a0",color:"#fff",border:"none",borderRadius:5,padding:8,fontWeight:700,cursor:"pointer",marginBottom:8}}>
                ✓ Mark First-Move Bonus Used (+{bonusDice} dice for first {entry.teraType} move)
              </button>
            )}
            <button onClick={()=>{onApply(entry.id,{isTerastallized:false,teraType:undefined,teraFirstMoveBonusUsed:false});onClose();}} style={{width:"100%",background:"#5a6080",color:"#fff",border:"none",borderRadius:6,padding:10,fontWeight:700,cursor:"pointer"}}>
              Revert (Terastallization lasts whole battle — only do this between battles)
            </button>
          </div>
        ):(
          <div>
            <div style={{background:"rgba(160,64,160,0.06)",border:"1px solid #a040a030",borderRadius:6,padding:12,marginBottom:16,fontSize:11,color:"#e8eaf0",lineHeight:1.6}}>
              <strong style={{color:"#a040a0"}}>Requirements:</strong><br/>
              • Pokémon holds a <strong>Tera Jewel/Shard</strong><br/>
              • Trainer owns and uses a <strong>Tera Orb</strong><br/>
              • Used as <strong>Reaction 10</strong> (high priority reaction)<br/>
              • Costs <strong>1 WP</strong>. One per Trainer per battle<br/><br/>
              <strong style={{color:"#a040a0"}}>Effects:</strong><br/>
              • Type becomes <strong>Stellar-Type</strong> → choose any affinity<br/>
              • Keeps original type STAB + gains new type STAB<br/>
              • Removes Dual-Type while active<br/>
              • First move (matching affinity): <strong>+3 dice</strong> (same as original) or <strong>+2 dice</strong> (different)<br/>
              • All other moves: <strong>+1 Damage Die</strong><br/>
              • Tera vs Tera: always Super Effective (both directions)
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#a040a0",marginBottom:6}}>Select Tera Affinity Type</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {ALL_TYPES_LIST.map(t=>(
                  <button key={t} onClick={()=>setSelType(t)} style={{padding:"3px 8px",borderRadius:3,fontSize:10,cursor:"pointer",fontWeight:700,border:`1px solid ${TYPE_COLORS[t as PokemonType]||"#3a4060"}`,background:selType===t?TYPE_COLORS[t as PokemonType]||"#a040a0":"transparent",color:selType===t?"#fff":TYPE_COLORS[t as PokemonType]||"#8b90a8"}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{fontSize:10,color:"#8b90a8",marginBottom:12}}>
              Chosen: <strong style={{color:"#a040a0"}}>{selType}</strong> — {entry.pokemon.types.includes(selType as PokemonType)?"Matches original type!":"Different from original type"} → First-move bonus: <strong style={{color:"#00d4aa"}}>+{isSameAsOriginal?3:2} Extra Dice</strong>
            </div>
            <button onClick={()=>{
              if(entry.currentWill<1)return;
              onApply(entry.id,{isTerastallized:true,teraType:selType,teraFirstMoveBonusUsed:false,currentWill:entry.currentWill-1});
              onClose();
            }} disabled={entry.currentWill<1} style={{width:"100%",background:entry.currentWill>=1?"#a040a0":"#3a4060",color:"#fff",border:"none",borderRadius:6,padding:10,fontWeight:700,cursor:entry.currentWill>=1?"pointer":"default",marginBottom:8}}>
              💎 Terastallize as {selType}-Type! (−1 WP, Reaction 10)
            </button>
            {entry.currentWill<1&&<div style={{fontSize:9,color:"#ff4757",textAlign:"center"}}>Not enough WP</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ZMovePopup({entry,allEntries,onClose,onApply,onApplyDmg}:{
  entry:BattleEntry;allEntries:BattleEntry[];onClose:()=>void;
  onApply:(id:string,u:Partial<BattleEntry>)=>void;
  onApplyDmg:(id:string,dmg:number)=>void;
}){
  // Rules: Z-Crystal in Held Item + Trainer wears Z-Ring.
  // Power = base move Power + Happiness + Loyalty. Cannot be evaded/clashed.
  // Cannot deal Lethal Damage. Once per battle (repeat costs 3 WP each).
  // Z-Crystal type must match base move type.
  const [selMove,setSelMove]=useState<Move|null>(null);
  const [selTarget,setSelTarget]=useState<string|null>(null);
  const [rolled,setRolled]=useState<{rolls:number[];successes:number}|null>(null);
  const others=allEntries.filter(e=>e.id!==entry.id&&e.currentHp>0);
  const eligibleMoves=entry.moves; // should filter by Z-Crystal type, but we let GM decide
  const zPower=(selMove?parseInt(selMove.power)||1:1)+(entry.loyalty||0)+(entry.happiness||0);
  const attrs=getEffectiveAttrs(entry);
  const dmgBase=selMove?.category==="Physical"?attrs.strength:attrs.special;
  const totalDmgPool=dmgBase+zPower;
  const alreadyUsed=entry.zMoveUsed;
  const repeatCost=3;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #ffd32a",borderRadius:10,width:480,maxHeight:"90vh",display:"flex",flexDirection:"column",padding:24,fontFamily:"'Exo 2'"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{color:"#ffd32a",margin:0,fontSize:16}}>⭐ Z-Move</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {alreadyUsed&&<div style={{background:"rgba(255,71,87,0.1)",border:"1px solid #ff475730",borderRadius:5,padding:8,marginBottom:12,fontSize:11,color:"#ff4757"}}>⚠ Z-Move already used this battle. Using again costs <strong>3 WP</strong> from both Trainer and Pokémon.</div>}
          <div style={{background:"rgba(255,211,42,0.06)",border:"1px solid #ffd32a30",borderRadius:6,padding:12,marginBottom:16,fontSize:11,color:"#e8eaf0",lineHeight:1.6}}>
            <strong style={{color:"#ffd32a"}}>Rules:</strong><br/>
            • Z-Crystal must match move type • Cannot be Evaded, Clashed, or used to Clash<br/>
            • Cannot deal Lethal Damage • Once per day (repeat = −3 WP each)<br/>
            • Power = Base Move Power + <strong>Happiness ({entry.happiness||0}) + Loyalty ({entry.loyalty||0})</strong>
          </div>
          {/* Base Move Picker */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:"#ffd32a",marginBottom:5}}>① Select Base Move (must match Z-Crystal type)</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {eligibleMoves.map((m,i)=>(
                <button key={i} onClick={()=>setSelMove(m)} style={{padding:"4px 8px",borderRadius:3,fontSize:10,cursor:"pointer",border:`1px solid ${TYPE_COLORS[m.type as PokemonType]}`,background:selMove?.name===m.name?TYPE_COLORS[m.type as PokemonType]:"transparent",color:selMove?.name===m.name?"#fff":TYPE_COLORS[m.type as PokemonType]}}>
                  {m.name} ({m.type})
                </button>
              ))}
            </div>
          </div>
          {selMove&&(
            <>
              <div style={{background:"rgba(255,211,42,0.08)",borderRadius:5,padding:10,marginBottom:12,fontSize:11,color:"#e8eaf0"}}>
                <strong style={{color:"#ffd32a"}}>Z-Move damage pool:</strong> {dmgBase} ({selMove.category==="Physical"?"STR":"SPC"}) + {parseInt(selMove.power)||1} (base power) + {(entry.happiness||0)+(entry.loyalty||0)} (H+L) = <strong style={{color:"#ffd32a",fontSize:13}}>{totalDmgPool}d</strong>
                <br/><span style={{color:"#8b90a8"}}>Category: {selMove.category} · Cannot be evaded or clashed</span>
              </div>
              {/* Target picker */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,color:"#ffd32a",marginBottom:5}}>② Select Target</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {others.map(t=>(
                    <button key={t.id} onClick={()=>setSelTarget(t.id)} style={{padding:"4px 8px",borderRadius:3,fontSize:10,cursor:"pointer",border:`1px solid ${selTarget===t.id?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,background:selTarget===t.id?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:selTarget===t.id?"#e8eaf0":"#8b90a8"}}>
                      {t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})
                    </button>
                  ))}
                </div>
              </div>
              {/* Roll + Apply */}
              <button onClick={()=>setRolled(rollDice(totalDmgPool))} style={{background:"#ffd32a",color:"#0f1117",border:"none",borderRadius:5,padding:"8px 16px",fontWeight:700,cursor:"pointer",marginBottom:8}}>
                🎲 Roll Z-Move Damage ({totalDmgPool}d)
              </button>
              {rolled&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:"#ffd32a"}}>[{rolled.rolls.join(",")}] = {rolled.successes} successes</div>
                  {selTarget&&(()=>{
                    const t=allEntries.find(e=>e.id===selTarget);
                    if(!t)return null;
                    const def=selMove.category==="Physical"?t.attrs.vitality:t.attrs.insight;
                    const finalDmg=Math.max(1,rolled.successes-def);
                    return(
                      <button onClick={()=>{
                        onApplyDmg(selTarget,finalDmg);
                        onApply(entry.id,{zMoveUsed:true,currentWill:alreadyUsed?Math.max(0,entry.currentWill-repeatCost):entry.currentWill});
                        onClose();
                      }} style={{width:"100%",background:"#ffd32a",color:"#0f1117",border:"none",borderRadius:5,padding:"8px",fontWeight:700,cursor:"pointer",marginTop:6}}>
                        ⭐ Apply {finalDmg} damage to {t.nickname||t.pokemon.name}{alreadyUsed?` (−${repeatCost} WP)`:""}
                      </button>
                    );
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

function AttrModBadge({mod}:{mod:number}){
  if(mod===0)return null;
  const up=mod>0;
  const clr=up?"#00d4aa":"#ff4757";
  const bg=up?"rgba(0,212,170,0.15)":"rgba(255,71,87,0.15)";
  const bdr=up?"#00d4aa40":"#ff475740";
  return<div style={{marginTop:2,fontSize:7,fontWeight:700,color:clr,background:bg,border:`1px solid ${bdr}`,borderRadius:2,padding:"0 3px",display:"inline-block"}}>
    {up?"▲":"▼"}{Math.abs(mod)}
  </div>;
}

function BattleCard({entry,allEntries,weather,isActive,onUpdate,onRemove,onNextTurn,onDragStart,onDragOver,onDrop}:{
  entry:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;isActive:boolean;
  onUpdate:(id:string,u:Partial<BattleEntry>)=>void;onRemove:(id:string)=>void;
  onNextTurn?:()=>void;
  onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:()=>void;
}){
  const [movePopup,setMovePopup]=useState<Move|null>(null);
  const [showEditMoves,setShowEditMoves]=useState(false);
  const [showCapture,setShowCapture]=useState(false);
  const [showMega,setShowMega]=useState(false);
  const [showDynamax,setShowDynamax]=useState(false);
  const [showTera,setShowTera]=useState(false);
  const [showZMove,setShowZMove]=useState(false);
  const [showTrainerSkills,setShowTrainerSkills]=useState(false);
  const upd=(u:Partial<BattleEntry>)=>onUpdate(entry.id,u);
  const sc=STATUS_CONDITIONS[primaryStatus(entry)];
  const sideColor={player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[entry.side];
  const painPenalty=getPainPenalty(entry.currentHp,entry.maxHp);
  const linkedTrainer=useMemo(()=>{if(!entry.linkedTrainerId)return null;return loadFromStorage<any[]>("trainers",[]).find((t:any)=>t.id===entry.linkedTrainerId)||null;},[entry.linkedTrainerId]);
  const attrModSummary=(attr:keyof AttrSet)=>entry.statMods.filter(m=>m.attr===attr).reduce((s,m)=>s+m.amount,0);
  const applyDmg=(tid:string,dmg:number)=>{const t=allEntries.find(e=>e.id===tid)||entry;onUpdate(t.id,{currentHp:Math.max(0,t.currentHp-dmg)});};
  const applyEffect=(tid:string,attr:string,amount:number,src:string,appliedBy?:string)=>{const t=allEntries.find(e=>e.id===tid);if(!t)return;const nm=[...t.statMods];const idx=nm.findIndex(m=>m.attr===attr&&m.source===src);if(idx>=0){nm[idx]={...nm[idx],amount:nm[idx].amount+amount,appliedBy:appliedBy??nm[idx].appliedBy};}else nm.push({source:src,attr,amount,appliedBy});onUpdate(tid,{statMods:nm});};
  const incrementAction=(id:string,isReaction?:boolean)=>{
    const t=allEntries.find(e=>e.id===id)||entry;
    if(isReaction){onUpdate(id,{reactionUsed:true});}
    else{onUpdate(id,{actionCount:Math.min(5,(allEntries.find(e=>e.id===id)||entry).actionCount+1)});}
  };
  const spendWP=(id:string,amt:number)=>{const t=allEntries.find(e=>e.id===id)||entry;onUpdate(id,{currentWill:Math.max(0,t.currentWill-amt)});};

  return(
    <>
      {movePopup&&<MovePopup move={movePopup} attacker={entry} allEntries={allEntries} weather={weather} onClose={()=>setMovePopup(null)} onApplyDmg={applyDmg} onApplyEffect={applyEffect} onIncrementAction={incrementAction} onSpendWP={spendWP} onApplySpecial={(id,u)=>onUpdate(id,u)} onEndTurn={onNextTurn}/>}
      {showCapture&&<CapturePopup allEntries={allEntries} defaultTargetId={entry.id} onClose={()=>setShowCapture(false)}/>}
      {showMega&&<MegaEvolutionPopup entry={entry} allEntries={allEntries} onClose={()=>setShowMega(false)} onApply={onUpdate}/>}
      {showDynamax&&<DynamaxPopup entry={entry} onClose={()=>setShowDynamax(false)} onApply={onUpdate}/>}
      {showTera&&<TerastallizationPopup entry={entry} onClose={()=>setShowTera(false)} onApply={onUpdate}/>}
      {showZMove&&<ZMovePopup entry={entry} allEntries={allEntries} onClose={()=>setShowZMove(false)} onApply={onUpdate} onApplyDmg={(id,dmg)=>onUpdate(id,{currentHp:Math.max(0,(allEntries.find(e=>e.id===id)?.currentHp??0)-dmg)})}/>}
      {showTrainerSkills&&linkedTrainer&&<TrainerSkillPopup trainerData={linkedTrainer} entry={entry} allEntries={allEntries} onClose={()=>setShowTrainerSkills(false)}/>}

      {/* HORIZONTAL CARD — FireRed party-panel style */}
      <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
        style={{width:290,flexShrink:0,background:entry.currentHp<=0?"linear-gradient(180deg,#808898 0%,#606878 100%)":"linear-gradient(180deg,#7898E0 0%,#4868C0 60%,#3858A8 100%)",border:"3px solid #181818",boxShadow:isActive?`5px 5px 0 ${entry.side==="player"?"#183088":"#980808"}`:"4px 4px 0 #283060",display:"flex",flexDirection:"column",maxHeight:"calc(100vh - 120px)",overflowX:"hidden",overflowY:"auto",opacity:entry.currentHp<=0?0.6:1,cursor:"default"}}>

        {/* Card header — blue panel top strip */}
        {(()=>{
          const trainerView=!!(entry.showTrainerView&&linkedTrainer);
          const sideAccent=entry.side==="player"?"#A8C8F8":"#F8A8A8";
          const displayName=trainerView?(linkedTrainer.name||"Trainer"):entry.nickname;
          const displayPlaceholder=trainerView?(linkedTrainer.name||"Trainer"):entry.pokemon.name;
          return(
            <div style={{padding:"5px 8px",background:"rgba(0,0,0,0.25)",borderBottom:"2px solid #181818",display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:"#B0C0E8",cursor:"grab",fontSize:11,flexShrink:0,userSelect:"none"}} title="Drag to reorder">≡</span>
              {trainerView
                ? <><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#F8F8E8",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,textShadow:"1px 1px 0 #181818"}}>{displayName.toUpperCase()}</span>
                  {linkedTrainer?.rank&&<span style={{fontSize:6,color:sideAccent,border:`1px solid ${sideAccent}80`,padding:"1px 3px",flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}>{linkedTrainer.rank}</span>}
                  <span style={{flex:1}}/></>
                : <input value={entry.nickname} onChange={e=>upd({nickname:e.target.value})} placeholder={displayPlaceholder} style={{flex:1,background:"transparent",border:"none",color:"#F8F8E8",fontFamily:"'Press Start 2P',monospace",fontSize:9,outline:"none",minWidth:0,textTransform:"uppercase",textShadow:"1px 1px 0 #181818"}}/>
              }
              {entry.currentHp<=0&&<span style={{fontSize:7,fontWeight:700,color:"#F8F8E8",background:"#705898",border:"1px solid #181818",padding:"1px 4px",flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}>FNT</span>}
              {isActive&&entry.currentHp>0&&<span style={{fontSize:7,fontWeight:700,color:"#181818",background:sideAccent,border:"1px solid #181818",padding:"1px 4px",flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}>▶</span>}
              {linkedTrainer&&<button onClick={()=>upd({showTrainerView:!entry.showTrainerView})} style={{background:"rgba(255,255,255,0.15)",border:"1px solid #F8F8E880",color:"#F8F8E8",cursor:"pointer",fontSize:7,padding:"1px 3px",flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}>{trainerView?"PKM":"TRN"}</button>}
              <button onClick={()=>upd({isExpanded:!entry.isExpanded})} style={{background:"none",border:"none",color:"#B0C0E8",cursor:"pointer",fontSize:9,flexShrink:0}}>{entry.isExpanded?"▲":"▼"}</button>
              <button onClick={()=>onRemove(entry.id)} style={{background:"none",border:"none",color:"#F8A8A8",cursor:"pointer",fontSize:12,flexShrink:0,fontWeight:700}}>×</button>
            </div>
          );
        })()}

        {/* Action economy + Reaction */}
        <div style={{padding:"3px 7px",background:"rgba(0,0,0,0.18)",display:"flex",gap:3,alignItems:"center",borderBottom:"1px solid rgba(0,0,0,0.3)"}}>
          <span style={{fontSize:7,color:"#C8D8F8",flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}>ACT</span>
          {[0,1,2,3,4].map(i=><button key={i} onClick={()=>upd({actionCount:entry.actionCount===i+1?i:i+1})} style={{width:14,height:14,border:`2px solid ${i<entry.actionCount?"#F8C800":"rgba(255,255,255,0.3)"}`,background:i<entry.actionCount?"#E8A800":"rgba(0,0,0,0.2)",cursor:"pointer",fontSize:6,color:i<entry.actionCount?"#181818":"rgba(255,255,255,0.4)",fontWeight:700,fontFamily:"'Press Start 2P',monospace"}}>{i+1}</button>)}
          {entry.actionCount>0&&<span style={{fontSize:6,color:"#F8C800",marginLeft:2,fontFamily:"'Press Start 2P',monospace"}}>→{Math.min(entry.actionCount+1,5)}+</span>}
          <span style={{width:1,height:10,background:"rgba(255,255,255,0.2)",flexShrink:0,margin:"0 2px"}}/>
          <span style={{fontSize:7,color:"#C8D8F8",flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}>RXN</span>
          <button onClick={()=>upd({reactionUsed:!entry.reactionUsed})} title={entry.reactionUsed?"Reaction used":"Reaction available"} style={{width:14,height:14,border:`2px solid ${entry.reactionUsed?"#C8A8F8":"rgba(255,255,255,0.3)"}`,background:entry.reactionUsed?"#9060D8":"rgba(0,0,0,0.2)",cursor:"pointer",fontSize:7,color:entry.reactionUsed?"#F8F8E8":"rgba(255,255,255,0.4)",fontWeight:700,fontFamily:"'Press Start 2P',monospace"}}>R</button>
          {entry.reactionUsed&&<span style={{fontSize:6,color:"#C8A8F8",fontFamily:"'Press Start 2P',monospace"}}>used</span>}
        </div>

        {/* When trainer view active: show trainer card replacing everything below header */}
        {entry.showTrainerView&&linkedTrainer?(
          <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
            <TrainerSkillsInline trainer={linkedTrainer} entry={entry} allEntries={allEntries} onSpendWP={spendWP} onIncrementAction={incrementAction} onUpdate={onUpdate}/>
          </div>
        ):<>

        {/* HP + WP — cream FR nameplate floating on blue panel */}
        <div style={{margin:"6px 7px 4px",background:"#F0ECD4",border:"2px solid #181818",boxShadow:"2px 2px 0 #181818",padding:"5px 8px"}}>
          {/* HP row */}
          <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:4}}>
            <span style={{fontSize:8,color:"#E07800",width:16,fontFamily:"'Press Start 2P',monospace",flexShrink:0,fontWeight:700}}>HP</span>
            <div style={{flex:1}}><HpBar cur={entry.currentHp} max={entry.maxHp}/></div>
            <button onClick={()=>upd({currentHp:Math.max(0,entry.currentHp-1)})} style={{width:14,height:14,border:"2px solid #181818",background:"#E8E8D0",color:"#D82808",cursor:"pointer",fontSize:10,lineHeight:"10px",flexShrink:0,fontWeight:700}}>−</button>
            <span style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",fontWeight:700,color:entry.currentHp/entry.maxHp>0.5?"#187028":entry.currentHp/entry.maxHp>0.25?"#907000":"#A81000",minWidth:40,textAlign:"right",flexShrink:0}}>{entry.currentHp}/{entry.maxHp}</span>
            <button onClick={()=>upd({currentHp:Math.min(entry.maxHp,entry.currentHp+1)})} style={{width:14,height:14,border:"2px solid #181818",background:"#E8E8D0",color:"#18A830",cursor:"pointer",fontSize:10,lineHeight:"10px",flexShrink:0,fontWeight:700}}>+</button>
          </div>
          {/* WP row */}
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <span style={{fontSize:8,color:"#2040C0",width:16,fontFamily:"'Press Start 2P',monospace",flexShrink:0,fontWeight:700}}>WP</span>
            <div style={{flex:1}}><HpBar cur={entry.currentWill} max={entry.maxWill} isWp/></div>
            <button onClick={()=>upd({currentWill:Math.max(0,entry.currentWill-1)})} style={{width:14,height:14,border:"2px solid #181818",background:"#E8E8D0",color:"#D82808",cursor:"pointer",fontSize:10,lineHeight:"10px",flexShrink:0,fontWeight:700}}>−</button>
            <span style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",fontWeight:700,color:"#2040C0",minWidth:40,textAlign:"right",flexShrink:0}}>{entry.currentWill}/{entry.maxWill}</span>
            <button onClick={()=>upd({currentWill:Math.min(entry.maxWill,entry.currentWill+1)})} style={{width:14,height:14,border:"2px solid #181818",background:"#E8E8D0",color:"#2858C0",cursor:"pointer",fontSize:10,lineHeight:"10px",flexShrink:0,fontWeight:700}}>+</button>
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{padding:"3px 7px",background:"rgba(0,0,0,0.18)",display:"flex",gap:4,alignItems:"center",flexWrap:"wrap",borderBottom:"1px solid rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",gap:2,alignItems:"center",border:"1px solid rgba(255,255,255,0.3)",background:"rgba(0,0,0,0.2)",padding:"1px 4px"}}>
            <span style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace"}}>INI</span>
            <input type="number" value={entry.initiative} onChange={e=>upd({initiative:+e.target.value})} style={{width:22,background:"transparent",border:"none",color:"#F8F800",fontSize:9,fontFamily:"'Press Start 2P',monospace",fontWeight:700,textAlign:"center",outline:"none"}}/>
          </div>
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})} style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.3)",color:entry.side==="player"?"#A8C8F8":"#F8A8A8",fontSize:7,padding:"1px 2px",fontFamily:"'Press Start 2P',monospace"}}>
            <option value="player">PLAYER</option><option value="enemy">ENEMY</option><option value="neutral">NEUT</option>
          </select>
          {(entry.typeOverride||entry.pokemon.types).map(t=><TypeBadge key={t} type={t as PokemonType}/>)}
          {entry.side==="enemy"&&<button onClick={()=>setShowCapture(true)} style={{background:"rgba(255,255,255,0.15)",border:"1px solid #F8F8E880",color:"#F8F8E8",cursor:"pointer",fontSize:7,padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}} title="Capture">CATCH</button>}
          {entry.isMegaEvolved&&<button onClick={()=>setShowMega(true)} style={{background:"#E8A840",border:"1px solid #181818",color:"#181818",cursor:"pointer",fontSize:7,padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}} title="Mega Evolved">MEGA</button>}
          {entry.isDynamaxed&&<button onClick={()=>setShowDynamax(true)} style={{background:"#E84040",border:"1px solid #181818",color:"#F8F8E8",cursor:"pointer",fontSize:7,padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}} title={`Dynamaxed — ${entry.dynamaxRoundsLeft} rounds left`}>MAX{entry.dynamaxRoundsLeft}</button>}
          {entry.isTerastallized&&<button onClick={()=>setShowTera(true)} style={{background:"#B040C0",border:"1px solid #181818",color:"#F8F8E8",cursor:"pointer",fontSize:7,padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}} title={`Terastallized (${entry.teraType})`}>TERA</button>}
          {entry.zMoveUsed&&<span style={{background:"#C8A800",border:"1px solid #181818",color:"#181818",fontSize:7,padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}}>Z✓</span>}
          {(()=>{
            const trainerBattleItem:string=(linkedTrainer as any)?.battleItem??"";
            const isLinked=!!entry.linkedTrainerId;
            const trainerTransformActive=isLinked&&allEntries.some(e=>e.id!==entry.id&&e.linkedTrainerId===entry.linkedTrainerId&&(e.isMegaEvolved||e.isDynamaxed||e.isTerastallized||e.zMoveUsed));
            const thisHasTransform=entry.isMegaEvolved||entry.isDynamaxed||entry.isTerastallized||(entry.zMoveUsed??false);
            const canAccessMega=!isLinked||(trainerBattleItem==="Key Stone"&&(entry.isMegaEvolved||(!trainerTransformActive&&!thisHasTransform)));
            const canAccessDyna=!isLinked||(trainerBattleItem==="Dynamax Band"&&(entry.isDynamaxed||(!trainerTransformActive&&!thisHasTransform)));
            const canAccessTera=!isLinked||(trainerBattleItem==="Tera Orb"&&(entry.isTerastallized||(!trainerTransformActive&&!thisHasTransform)));
            const canAccessZ=!isLinked||(trainerBattleItem==="Z-Power Ring"&&(!entry.zMoveUsed&&!trainerTransformActive));
            if(!canAccessMega&&!canAccessDyna&&!canAccessTera&&!canAccessZ)return null;
            return(
              <div style={{display:"flex",gap:2,marginLeft:"auto"}}>
                {canAccessMega&&!entry.isMegaEvolved&&<button onClick={()=>setShowMega(true)} style={{background:"rgba(255,255,255,0.15)",border:"1px solid #F8F8E860",color:"#F8D8A8",cursor:"pointer",fontSize:7,padding:"1px 3px",fontFamily:"'Press Start 2P',monospace"}} title="Mega Evolution">⚡</button>}
                {canAccessDyna&&!entry.isDynamaxed&&<button onClick={()=>setShowDynamax(true)} style={{background:"rgba(255,255,255,0.15)",border:"1px solid #F8F8E860",color:"#F8A8A8",cursor:"pointer",fontSize:7,padding:"1px 3px",fontFamily:"'Press Start 2P',monospace"}} title="Dynamax">💫</button>}
                {canAccessTera&&!entry.isTerastallized&&<button onClick={()=>setShowTera(true)} style={{background:"rgba(255,255,255,0.15)",border:"1px solid #F8F8E860",color:"#D8A8F8",cursor:"pointer",fontSize:7,padding:"1px 3px",fontFamily:"'Press Start 2P',monospace"}} title="Tera">💎</button>}
                {canAccessZ&&<button onClick={()=>setShowZMove(true)} style={{background:"rgba(255,255,255,0.15)",border:"1px solid #F8F8E860",color:"#F8F0A8",cursor:"pointer",fontSize:7,padding:"1px 3px",fontFamily:"'Press Start 2P',monospace"}} title="Z-Move">⭐</button>}
              </div>
            );
          })()}
        </div>

        {/* Loyalty/Happiness */}
        <div style={{padding:"3px 7px",background:"rgba(0,0,0,0.15)",display:"flex",gap:10,alignItems:"center",borderBottom:"1px solid rgba(0,0,0,0.25)"}}>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <span style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace"}}>LYL</span>
            <div style={{display:"flex",gap:1}}>{[1,2,3,4,5].map(i=><button key={i} onClick={()=>upd({loyalty:entry.loyalty===i?i-1:i})} style={{width:9,height:9,border:`1px solid ${i<=entry.loyalty?"#F85050":"rgba(255,255,255,0.3)"}`,cursor:"pointer",background:i<=entry.loyalty?"#D83030":"rgba(0,0,0,0.2)",padding:0}}/>)}</div>
            <span style={{fontSize:7,color:"#F89090",fontFamily:"'Press Start 2P',monospace",fontWeight:700}}>{entry.loyalty}</span>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <span style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace"}}>HPY</span>
            <div style={{display:"flex",gap:1}}>{[1,2,3,4,5].map(i=><button key={i} onClick={()=>upd({happiness:entry.happiness===i?i-1:i})} style={{width:9,height:9,border:`1px solid ${i<=entry.happiness?"#F890C8":"rgba(255,255,255,0.3)"}`,cursor:"pointer",background:i<=entry.happiness?"#D85898":"rgba(0,0,0,0.2)",padding:0}}/>)}</div>
            <span style={{fontSize:7,color:"#F8B8D8",fontFamily:"'Press Start 2P',monospace",fontWeight:700}}>{entry.happiness}</span>
          </div>
        </div>

        {/* Status chip row */}
        <div style={{padding:"3px 7px",background:"rgba(0,0,0,0.12)",display:"flex",gap:3,alignItems:"center",flexWrap:"wrap",borderBottom:"1px solid rgba(0,0,0,0.25)"}}>
          {(entry.statuses||[]).filter(s=>s!=="Healthy").map(s=><StatusBadge key={s} status={s} onRemove={()=>upd({statuses:removeStatus(entry.statuses||[],s)})}/>)}
          <select onChange={e=>{if(e.target.value&&e.target.value!=="＋")upd({statuses:addStatus(entry.statuses||[],e.target.value),statusTurnsLeft:e.target.value==="Asleep"?3:entry.statusTurnsLeft});e.target.value="＋";}} defaultValue="＋"
            style={{background:"rgba(0,0,0,0.25)",border:"1px solid rgba(255,255,255,0.3)",color:"#C8D8F8",fontSize:7,padding:"1px 2px",fontFamily:"'Press Start 2P',monospace"}}>
            <option value="＋">＋</option>
            {Object.keys(STATUS_CONDITIONS).filter(s=>s!=="Healthy"&&!(entry.statuses||[]).includes(s)).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          {painPenalty>0&&(()=>{const hpPct=entry.maxHp>0?entry.currentHp/entry.maxHp:1;const label=hpPct>0.25?"Badly Hurt":"Critical";const tooltip=`Pain Penalization (${label}): −${painPenalty} die to all dice pools.\nHP below ${hpPct>0.25?"50%":"25%"} causes this penalty.`;return<span title={tooltip} style={{fontSize:7,color:"#F8F8E8",background:"#D82808",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help"}}>PAIN-{painPenalty}</span>;})()}
          {!entry.weatherImmune&&weather.name!=="Clear"&&<span style={{fontSize:9,color:"#807008"}} title={weather.name}>{weather.emoji?.split(" ")[0]}</span>}
          {entry.isProtected&&<span style={{fontSize:7,color:"#F8F8E8",background:"#2858C0",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}}>PROT</span>}
          {(entry.statuses||[]).includes("Asleep")&&entry.statusTurnsLeft>0&&<span style={{fontSize:7,color:"#484830",fontFamily:"'Press Start 2P',monospace"}}>Z{entry.statusTurnsLeft}</span>}
          {entry.abilityOverride&&<span title={`Ability: ${entry.abilityOverride}`} style={{fontSize:7,color:"#807008",background:"#F8F0B8",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help"}}>✨{entry.abilityOverride.slice(0,6).toUpperCase()}</span>}
          {entry.abilitySuppressed&&<span title="Ability suppressed" style={{fontSize:7,color:"#F8F8E8",background:"#888870",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help"}}>NO-ABL</span>}
          {entry.typeOverride&&<span title={`Type: ${entry.typeOverride.join("/")}`} style={{fontSize:7,color:"#F8F8E8",background:"#18A870",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help",display:"flex",alignItems:"center",gap:1}}>{entry.typeOverride.map(t=>t.slice(0,3).toUpperCase()).join("/")}<button onClick={()=>upd({typeOverride:undefined})} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:8,padding:0}}>×</button></span>}
          {entry.heldItem&&<span title={`Item: ${entry.heldItem}`} style={{fontSize:7,color:"#181818",background:"#F8E8C8",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help",display:"flex",alignItems:"center",gap:1}}>🎒{entry.heldItem.slice(0,5).toUpperCase()}<button onClick={()=>upd({heldItem:undefined})} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:8,padding:0}}>×</button></span>}
          {entry.itemEmbargoed&&<span title="Cannot use held items (Embargo)" style={{fontSize:7,color:"#F8F8E8",background:"#D82808",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help",display:"flex",alignItems:"center",gap:1}}>NO-ITM<button onClick={()=>upd({itemEmbargoed:false})} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:8,padding:0}}>×</button></span>}
          {entry.isFollowMeTarget&&<span title="All moves redirect here (Follow Me)" style={{fontSize:7,color:"#F8F8E8",background:"#2858C0",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help",display:"flex",alignItems:"center",gap:1}}>🎯FOCUS<button onClick={()=>upd({isFollowMeTarget:false})} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:8,padding:0}}>×</button></span>}
          {entry.chargeActive&&<span title="Charged: +2 to next Electric move" style={{fontSize:7,color:"#181818",background:"#F8F0B8",border:"1px solid #181818",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help",display:"flex",alignItems:"center",gap:1}}>⚡CHG<button onClick={()=>upd({chargeActive:false})} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:8,padding:0}}>×</button></span>}
        </div>


        {/* Moves list — FireRed FIGHT menu */}
        <div style={{padding:"5px 7px",background:"transparent",display:"flex",flexDirection:"column",gap:3}}>
          {/* TRAINER VIEW: show trainer skills like moves */}
          {entry.showTrainerView&&linkedTrainer?(
            <TrainerSkillsInline trainer={linkedTrainer} entry={entry} allEntries={allEntries} onSpendWP={spendWP} onIncrementAction={incrementAction} onUpdate={onUpdate}/>
          ):(
            <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
              <span style={{fontSize:7,color:"#F8F8E8",fontFamily:"'Press Start 2P',monospace",textShadow:"1px 1px 0 #181818"}}>{entry.morphedTo?"▶ FORM":"FIGHT"}{entry.hasSubstitute?" [SUB]":""}</span>
              <div style={{display:"flex",gap:3}}>
                {entry.morphedTo&&<button onClick={()=>upd({morphedTo:undefined,moves:entry.originalMoves||entry.moves,attrs:entry.originalAttrs||entry.attrs,originalAttrs:undefined,originalMoves:undefined})} style={{fontSize:7,color:"#F8F8E8",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.3)",cursor:"pointer",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}}>REVERT</button>}
                <button onClick={()=>setShowEditMoves(!showEditMoves)} style={{fontSize:7,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.3)",color:"#C8D8F8",cursor:"pointer",padding:"1px 4px",fontFamily:"'Press Start 2P',monospace"}}>{showEditMoves?"DONE":"EDIT"}</button>
              </div>
            </div>
            {showEditMoves?(
              <MoveSearchEdit entry={entry} onUpdate={upd}/>
            ):(
              <>
                {/* 2×2 grid like FireRed FIGHT menu */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
                {entry.moves.map((m,i)=>{
                  const stab=(entry.morphedTo||entry.pokemon).types.includes(m.type as PokemonType);
                  const abilMods=calcAbilityBonus(entry,m,weather);
                  const typeColor=TYPE_COLORS[m.type as PokemonType]||"#888870";
                  return(
                    <button key={i} onClick={()=>setMovePopup(m)}
                      style={{display:"flex",flexDirection:"column",gap:1,padding:"4px 5px",background:"#F0ECD4",border:"2px solid #181818",cursor:"pointer",textAlign:"left",boxShadow:"2px 2px 0 #181818",position:"relative",minHeight:36}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="#C8D8F0";}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="#F0ECD4";}}>
                      <span style={{fontSize:8,color:"#181818",fontFamily:"'Press Start 2P',monospace",fontWeight:700,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{m.name}</span>
                      <div style={{display:"flex",gap:2,alignItems:"center",marginTop:1}}>
                        <TypeBadge type={m.type as PokemonType} small/>
                        {stab&&<span style={{fontSize:6,color:"#807008",fontFamily:"'Press Start 2P',monospace"}}>★</span>}
                        {(m.priority??0)>0&&<span style={{fontSize:6,color:"#18A870",fontFamily:"'Press Start 2P',monospace"}}>P+</span>}
                        {abilMods.bonus>0&&<span style={{fontSize:6,color:"#2858C0",fontFamily:"'Press Start 2P',monospace"}}>+{abilMods.bonus}</span>}
                      </div>
                    </button>
                  );
                })}
                </div>
                {entry.moves.length===0&&<div style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace",padding:"8px 0",textShadow:"1px 1px 0 #181818"}}>No moves — press EDIT{entry.currentWill>0?" or STRUGGLE":""}</div>}
                {entry.moves.length===0&&entry.currentWill>0&&(
                  <button onClick={()=>{const s=MOVES.find(m=>m.name==="Struggle")||{name:"Struggle",type:"Normal" as PokemonType,category:"Physical" as const,power:"1",accuracy:"Strength + Brawl",damagePool:"Strength + 1",effect:"Target Foe. No WP cost. User takes recoil equal to half damage dealt.",description:"A desperate thrashing attack used when no other moves are available."} as Move;setMovePopup(s);}} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",background:"#F0ECD4",border:"2px solid #181818",cursor:"pointer",textAlign:"left",width:"100%",boxShadow:"2px 2px 0 #181818"}}>
                    <span style={{fontSize:8,color:"#A00808",fontFamily:"'Press Start 2P',monospace",fontWeight:700,flex:1}}>STRUGGLE</span>
                    <span style={{fontSize:7,color:"#484830",fontFamily:"'Press Start 2P',monospace"}}>1 WP</span>
                  </button>
                )}
              </>
            )}
            </>
          )}
        </div>

        {/* Expanded section: attrs, abilities, notes */}
        {entry.isExpanded&&(
          <div style={{borderTop:"2px solid #181818",padding:"7px 7px",display:"flex",flexDirection:"column",gap:7,background:"rgba(0,0,0,0.2)"}}>
            {/* Attributes */}
            <div>
              <div style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace",marginBottom:5,textShadow:"1px 1px 0 #181818"}}>STATS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3}}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{
                  const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};
                  const base=entry.attrs[attr];const mod=attrModSummary(attr);
                  const statusPen=attr==="dexterity"?(STATUS_CONDITIONS[primaryStatus(entry)]?.accuracyPenalty??0):0;
                  const final=Math.max(0,base+mod-statusPen);
                  return<div key={attr} style={{textAlign:"center",background:"#F0ECD4",border:"1px solid #181818",padding:"3px 0"}}>
                    <div style={{fontSize:6,color:"#484830",fontFamily:"'Press Start 2P',monospace"}}>{labels[attr]}</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:1,marginTop:2}}>
                      <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:Math.max(0,base-1)}})} style={{width:10,height:10,background:"#D8D4BC",border:"1px solid #181818",color:"#D82808",cursor:"pointer",fontSize:8,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>−</button>
                      <span style={{fontSize:10,fontFamily:"'Press Start 2P',monospace",fontWeight:700,color:final<base?"#D82808":mod>0?"#18A870":"#181818",minWidth:12,textAlign:"center"}}>{final}</span>
                      <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:base+1}})} style={{width:10,height:10,background:"#D8D4BC",border:"1px solid #181818",color:"#18A870",cursor:"pointer",fontSize:8,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>+</button>
                    </div>
                    <div style={{display:"flex",justifyContent:"center",gap:1,marginTop:2}}>
                      <button onClick={()=>applyEffect(entry.id,attr,-1,"Manual")} title={`-1 temp ${labels[attr]}`} style={{width:10,height:8,background:"#F8C8C8",border:"1px solid #181818",color:"#D82808",cursor:"pointer",fontSize:6,lineHeight:1,padding:0}}>▼</button>
                      <button onClick={()=>applyEffect(entry.id,attr,1,"Manual")} title={`+1 temp ${labels[attr]}`} style={{width:10,height:8,background:"#C8F0C8",border:"1px solid #181818",color:"#187028",cursor:"pointer",fontSize:6,lineHeight:1,padding:0}}>▲</button>
                    </div>
                    <AttrModBadge mod={mod}/>
                    {statusPen>0&&<div title={`${primaryStatus(entry)}: −${statusPen}`} style={{marginTop:1,fontSize:6,fontWeight:700,color:"#807008",background:"#F8F0B8",border:"1px solid #181818",padding:"0 2px",display:"inline-block",fontFamily:"'Press Start 2P',monospace"}}>▼{statusPen}</div>}
                  </div>;
                })}
              </div>
              {entry.statMods.length>0&&<div style={{marginTop:4,display:"flex",flexWrap:"wrap",gap:2}}>
                {entry.statMods.map((m,i)=><div key={i} title={m.appliedBy?`${m.attr} ${m.amount>0?"+":""}${m.amount} — ${m.source} used by ${m.appliedBy}`:`${m.attr} ${m.amount>0?"+":""}${m.amount} — ${m.source}`} style={{fontSize:7,display:"flex",alignItems:"center",gap:2,background:m.amount>0?"#C8F0C8":"#F8C8C8",border:"1px solid #181818",padding:"0 4px",fontFamily:"'Press Start 2P',monospace",cursor:"help"}}>
                  <span style={{color:m.amount>0?"#187028":"#A00808"}}>{m.amount>0?"▲":"▼"}{Math.abs(m.amount)} {m.attr.slice(0,3).toUpperCase()}</span>
                  <button onClick={()=>upd({statMods:entry.statMods.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#484830",cursor:"pointer",fontSize:9,padding:0}}>×</button>
                </div>)}
              </div>}
            </div>

            {/* Abilities */}
            <div>
              <div style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace",marginBottom:4,textShadow:"1px 1px 0 #181818"}}>ABILITIES</div>
              {entry.abilities.map((ab,i)=>{const abData=ABILITIES.find(a=>a.name===ab.name);return<div key={i} style={{marginBottom:4,border:`1px solid #181818`,background:ab.active?"#C8F0C8":"#F0ECD4",padding:"4px 6px"}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <button onClick={()=>{const abs=[...entry.abilities];abs[i]={...abs[i],active:!abs[i].active};upd({abilities:abs});}} style={{width:10,height:10,border:"1px solid #181818",background:ab.active?"#18A870":"#E8E8D0",cursor:"pointer",flexShrink:0,padding:0}}/>
                  <span style={{fontSize:8,fontWeight:700,color:ab.active?"#187028":"#484830",fontFamily:"'Press Start 2P',monospace"}}>{ab.name}</span>
                </div>
                {abData&&<div style={{fontSize:8,color:"#484830",lineHeight:1.5,marginTop:2}}>{abData.effect}</div>}
              </div>;})}
            </div>

            {/* HP/WP max editors + notes */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {[{l:"MAX HP",c:entry.currentHp,m:entry.maxHp,col:"#18A870",f:"currentHp" as const,mf:"maxHp" as const},{l:"MAX WP",c:entry.currentWill,m:entry.maxWill,col:"#2858C0",f:"currentWill" as const,mf:"maxWill" as const}].map(f=><div key={f.l} style={{background:"#F0ECD4",border:"1px solid #181818",padding:"4px 5px"}}>
                <div style={{fontSize:6,color:"#484830",fontFamily:"'Press Start 2P',monospace",marginBottom:3}}>{f.l}</div>
                <div style={{display:"flex",gap:2,alignItems:"center"}}>
                  <button onClick={()=>upd({[f.f]:Math.max(0,f.c-1)})} style={{width:14,height:14,background:"#D8D4BC",border:"1px solid #181818",color:"#D82808",cursor:"pointer",fontSize:10,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>−</button>
                  <input type="number" value={f.m} onChange={e=>upd({[f.mf]:Math.max(1,+e.target.value||1)})} style={{width:24,textAlign:"center",background:"#D8D4BC",border:"1px solid #181818",color:f.col,fontSize:9,fontFamily:"'Press Start 2P',monospace",fontWeight:700,padding:"0 1px",outline:"none"}}/>
                  <button onClick={()=>upd({[f.mf]:f.m+1})} style={{width:14,height:14,background:"#D8D4BC",border:"1px solid #181818",color:"#18A870",cursor:"pointer",fontSize:10,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>+</button>
                </div>
              </div>)}
            </div>

            <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Notes…" style={{width:"100%",background:"#F0ECD4",border:"1px solid #181818",color:"#181818",fontSize:8,padding:4,resize:"none",minHeight:28,fontFamily:"inherit",outline:"none"}}/>
            <label style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace",display:"flex",alignItems:"center",gap:4,cursor:"pointer",textShadow:"1px 1px 0 #181818"}}>
              <input type="checkbox" checked={entry.weatherImmune} onChange={e=>upd({weatherImmune:e.target.checked})}/>WX IMMUNE
            </label>
          </div>
        )}
        </>}
      </div>
    </>
  );
}

// ── Character Party Sidebar ───────────────────────────────────────────────────
function CharactersSidebar({onAddPokemon}:{onAddPokemon:(pokemon:PokemonEntry,trainerId:string,nickname:string,loyalty:number,happiness:number,moves:Move[],sheetKey?:string,trainerRank?:string)=>void}){
  const trainers=useMemo(()=>loadFromStorage<any[]>("trainers",[]),[]);
  const pokemonSheets=useMemo(()=>loadFromStorage<Record<string,any>>("pokemon_sheets",{}),[]);
  const [selId,setSelId]=useState<string|null>(null);
  const sel=trainers.find(t=>t.id===selId);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {trainers.length===0&&<div style={{fontSize:8,color:"#888870",fontFamily:"'Press Start 2P',monospace",lineHeight:1.8}}>No saved characters.<br/>Create them in the<br/>Characters page.</div>}
      {trainers.map(t=>(
        <div key={t.id} style={{border:`2px solid ${selId===t.id?"#2858C0":"#181818"}`,overflow:"hidden",boxShadow:selId===t.id?"2px 2px 0 #2858C0":"2px 2px 0 #787878"}}>
          <div onClick={()=>setSelId(selId===t.id?null:t.id)} style={{padding:"5px 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:5,background:selId===t.id?"#C8D8F0":"#E8E8D0"}}>
            <span style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",fontWeight:700,color:"#181818",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name.toUpperCase()}</span>
            <span style={{fontSize:6,color:RANK_COLORS[t.rank as Rank],fontFamily:"'Press Start 2P',monospace"}}>{t.rank?.slice(0,3).toUpperCase()}</span>
            <span style={{fontSize:8,color:"#484830",fontFamily:"'Press Start 2P',monospace"}}>{selId===t.id?"▲":"▼"}</span>
          </div>
          {selId===t.id&&<div style={{padding:"5px 7px",background:"#F8F8E8",borderTop:"1px solid #181818"}}>
            {(t.pokemon||[]).map((key:string)=>{
              const sheet=pokemonSheets[key];if(!sheet)return null;
              const p=POKEMON.find(x=>x.number===sheet.number);if(!p)return null;
              const activeMovs=((sheet.moves||[]) as string[]).map((mn:string)=>MOVES.find(m=>m.name===mn)).filter(Boolean) as Move[];
              return(
                <div key={key} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 0",borderBottom:"1px solid #C8C8A8"}}>
                  <div style={{width:5,height:5,background:TYPE_COLORS[p.types[0]],border:"1px solid #181818",flexShrink:0}}/>
                  <span style={{fontSize:8,color:"#181818",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sheet.nickname||p.name}</span>
                  <button onClick={()=>onAddPokemon(p,t.id,sheet.nickname||"",sheet.loyalty??1,sheet.happiness??1,activeMovs,key,t.rank)} style={{background:"#E8E8D0",border:"1px solid #181818",color:"#187028",padding:"1px 5px",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",boxShadow:"1px 1px 0 #787878"}}>+</button>
                </div>
              );
            })}
            <button onClick={()=>{
              const fakePoke:PokemonEntry={...MISSINGNO,name:t.name,number:-1,attributes:t.attributes||{strength:1,dexterity:1,vitality:1,special:1,insight:1},abilities:[],moves:[]};
              onAddPokemon(fakePoke,t.id,t.name,0,0,[]);
            }} style={{marginTop:5,background:"#C8D8F0",border:"1px solid #181818",color:"#2858C0",padding:"2px 6px",fontSize:7,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",boxShadow:"1px 1px 0 #787878"}}>+ ADD TRAINER</button>
          </div>}
        </div>
      ))}
    </div>
  );
}

// Small CSS pokéball icon — used in list rows instead of a sprite thumbnail for "Custom".
function PokeballIcon({size=14}:{size?:number}){
  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,position:"relative",
      background:`linear-gradient(to bottom, #F83838 0%, #F83838 46%, #181818 46%, #181818 54%, #F8F8F8 54%, #F8F8F8 100%)`,
      border:"1px solid #181818"}}>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:size*0.4,height:size*0.4,borderRadius:"50%",background:"#F8F8F8",border:"1px solid #181818"}}/>
    </div>
  );
}

// ── Add Pokémon modal — styled after the FireRed party/Pokémon menu ────────────
function AddPokemonModal({onAdd,onClose}:{onAdd:(p:PokemonEntry,side:"player"|"enemy"|"neutral")=>void;onClose:()=>void}){
  const [q,setQ]=useState("");
  const [side,setSide]=useState<"player"|"enemy"|"neutral">("enemy");
  const [justAdded,setJustAdded]=useState<number|null>(null);
  const filtered=useMemo(()=>{
    const ql=q.toLowerCase();
    if(!ql)return POKEMON;
    return POKEMON.filter(p=>p.name.toLowerCase().includes(ql)||String(p.number).includes(q));
  },[q]);
  const sideColor={player:"#2858C0",enemy:"#D82808",neutral:"#686858"}[side];
  const handleAdd=(p:PokemonEntry)=>{
    onAdd(p,side);
    setJustAdded(p.number);
    setTimeout(()=>setJustAdded(cur=>cur===p.number?null:cur),500);
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(8,16,8,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={ev=>ev.stopPropagation()} style={{width:420,maxWidth:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column",
        background:"linear-gradient(160deg,#5098A0 0%,#307078 55%,#204C54 100%)",border:"3px solid #0C2024",borderRadius:8,
        boxShadow:"4px 6px 0 rgba(0,0,0,0.45)",padding:10,gap:8,fontFamily:"'Press Start 2P',monospace"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"#F8F8E8",textShadow:"2px 2px 0 #0C2024",flex:1}}>ADD POKéMON</span>
          <button onClick={onClose} style={{width:20,height:20,background:"#F8F8E8",border:"2px solid #0C2024",color:"#181818",cursor:"pointer",fontSize:10,lineHeight:1}}>✕</button>
        </div>
        {/* Side selector */}
        <div style={{display:"flex",gap:5}}>
          {(["player","enemy","neutral"] as const).map(s=>{
            const c={player:"#2858C0",enemy:"#D82808",neutral:"#686858"}[s];
            const active=side===s;
            return(
              <button key={s} onClick={()=>setSide(s)} style={{flex:1,padding:"6px 4px",fontSize:8,fontFamily:"'Press Start 2P',monospace",
                background:active?c:"rgba(248,248,232,0.85)",color:active?"#F8F8E8":c,border:`2px solid ${active?"#0C2024":c}`,
                boxShadow:active?"inset 0 0 0 1px rgba(255,255,255,0.4)":"1px 1px 0 rgba(0,0,0,0.3)",cursor:"pointer"}}>
                {s==="player"?"◆ PLAYER":s==="enemy"?"◆ ENEMY":"◆ NEUTRAL"}
              </button>
            );
          })}
        </div>
        {/* Search input */}
        <input type="text" autoFocus placeholder="Search Pokémon…" value={q} onChange={e=>setQ(e.target.value)}
          style={{width:"100%",background:"#F8F8E8",border:"2px solid #0C2024",padding:"6px 8px",color:"#181818",fontSize:9,outline:"none",fontFamily:"'Press Start 2P',monospace",boxShadow:"2px 2px 0 rgba(0,0,0,0.3)"}}/>
        {/* Results list — cream FireRed rows */}
        <div style={{flex:1,minHeight:0,overflowY:"auto",background:"#F8F8E8",border:"2px solid #0C2024",boxShadow:"inset 0 0 0 2px rgba(255,255,255,0.5)"}}>
          <div onClick={()=>handleAdd(MISSINGNO)} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",cursor:"pointer",borderBottom:"2px solid #181818",background:justAdded===MISSINGNO.number?"#B8F0B8":"#E8E8D0"}}
            onMouseEnter={e=>{if(justAdded!==MISSINGNO.number)(e.currentTarget as HTMLDivElement).style.background="#DCDCC0";}}
            onMouseLeave={e=>{if(justAdded!==MISSINGNO.number)(e.currentTarget as HTMLDivElement).style.background="#E8E8D0";}}>
            <PokeballIcon/>
            <span style={{fontSize:8,color:"#807008",fontWeight:700}}>Custom (blank card)</span>
          </div>
          {filtered.map(p=>{
            const added=justAdded===p.number;
            return(
              <div key={`${p.number}-${p.name}`} onClick={()=>handleAdd(p)} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",cursor:"pointer",borderBottom:"1px solid #C8C8A8",background:added?"#B8F0B8":"transparent"}}
                onMouseEnter={e=>{if(!added)(e.currentTarget as HTMLDivElement).style.background="#C8D8F0";}}
                onMouseLeave={e=>{if(!added)(e.currentTarget as HTMLDivElement).style.background="transparent";}}>
                <img src={`/sprites/pokemon/${p.number}.png`} alt="" width={24} height={24} style={{imageRendering:"pixelated",objectFit:"contain",flexShrink:0}} onError={ev=>{(ev.currentTarget as HTMLImageElement).style.visibility="hidden";}}/>
                <span style={{fontSize:7,color:"#888870",width:26,flexShrink:0}}>#{String(p.number).padStart(3,"0")}</span>
                <span style={{fontSize:9,color:"#181818",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                {p.types.slice(0,2).map(t=><TypeBadge key={t} type={t as PokemonType} small/>)}
                <span style={{fontSize:7,color:RANK_COLORS[p.suggestedRank],flexShrink:0}}>{added?"ADDED":p.suggestedRank.slice(0,3).toUpperCase()}</span>
              </div>
            );
          })}
          {filtered.length===0&&<div style={{padding:16,textAlign:"center",fontSize:8,color:"#888870"}}>No matches.</div>}
        </div>
        <div style={{fontSize:7,color:"#E0F0F0",textAlign:"center",textShadow:"1px 1px 0 #0C2024"}}>Adding to <span style={{color:sideColor,background:"#F8F8E8",padding:"0 4px"}}>{side.toUpperCase()}</span> side — click a row to add, list stays open.</div>
        {/* Footer */}
        <button onClick={onClose} style={{alignSelf:"center",padding:"7px 28px",fontSize:9,fontFamily:"'Press Start 2P',monospace",color:"#F8F8E8",
          background:"linear-gradient(180deg,#F87878 0%,#D83838 100%)",border:"2px solid #0C2024",borderRadius:14,boxShadow:"2px 2px 0 rgba(0,0,0,0.35)",cursor:"pointer"}}>CANCEL</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BattleTrackerPage(){
  const [entries,setEntries]=useState<BattleEntry[]>(()=>loadFromStorage("bt_entries",[]));
  const [weather,setWeather]=useState<WeatherData>(WEATHER_DATA[0]);
  const [terrain,setTerrain]=useState<string>("None");
  const [turn,setTurn]=useState(0);
  const [round,setRound]=useState(1);
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  const [showEOR,setShowEOR]=useState(false);
  const [showPriority,setShowPriority]=useState(false);
  const [battleType,setBattleType]=useState<"default"|"gym"|"boss"|"raid"|"danger">("default");
  const [dragId,setDragId]=useState<string|null>(null);
  const [sidebarTab,setSidebarTab]=useState<"search"|"characters">("search");
  const scrollRef=useRef<HTMLDivElement>(null);
  const cardRefs=useRef<Record<string,HTMLDivElement|null>>({});
  // ── FireRed battle-scene state ──────────────────────────────────────────────
  const [scenePlayerId,setScenePlayerId]=useState<string|null>(null);
  const [sceneEnemyId,setSceneEnemyId]=useState<string|null>(null);
  const [menuMode,setMenuMode]=useState<"root"|"fight"|"bag"|"pokemon">("root");
  const [sceneMsg,setSceneMsg]=useState<string>("");
  const [drawerId,setDrawerId]=useState<string|null>(null);
  const [scenePopup,setScenePopup]=useState<Move|null>(null);
  const [sceneTargetIds,setSceneTargetIds]=useState<string[]>([]);
  const [showAddModal,setShowAddModal]=useState(false);

  useEffect(()=>{saveToStorage("bt_entries",entries);},[entries]);

  // Sync with GM Screen battle tracker (and other tabs) via storage events
  useEffect(()=>{
    const onStorage=(e:StorageEvent)=>{
      if(e.key==="bt_entries"&&e.newValue){
        try{
          const updated=JSON.parse(e.newValue);
          setEntries(updated);
        }catch{}
      }
    };
    window.addEventListener("storage",onStorage);
    return()=>window.removeEventListener("storage",onStorage);
  },[]);

  useEffect(()=>{
    const queue=loadFromStorage<number[]>("encounter_queue",[]);
    if(queue.length>0){saveToStorage("encounter_queue",[]);queue.forEach(num=>{const p=POKEMON.find(x=>x.number===num);if(p)addPokemon(p);});}
    const pending=loadFromStorage<{pokemonNumber:number;trainerId:string;nickname:string}|null>("pending_link",null);
    if(pending){saveToStorage("pending_link",null);setTimeout(()=>setEntries(prev=>{const idx=[...prev].reverse().findIndex(e=>e.pokemon.number===pending.pokemonNumber&&!e.linkedTrainerId);if(idx<0)return prev;const ri=prev.length-1-idx;const u=[...prev];u[ri]={...u[ri],linkedTrainerId:pending.trainerId,side:"player",nickname:pending.nickname||u[ri].nickname};return u;}),100);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry=sorted[turn%Math.max(1,sorted.length)];

  // ── On-field combatants for the battle scene ────────────────────────────────
  // Player side = back sprite (bottom-left), always tracks whichever player mon is
  // currently active (its turn) — falling back to a manual pick / first living player
  // mon only while it isn't a player mon's turn.
  const onFieldPlayer=useMemo(()=>{
    if(activeEntry&&activeEntry.side==="player"&&activeEntry.currentHp>0)return activeEntry;
    const chosen=scenePlayerId?entries.find(e=>e.id===scenePlayerId&&e.side==="player"):null;
    if(chosen)return chosen;
    return sorted.find(e=>e.side==="player"&&e.currentHp>0)||sorted.find(e=>e.side==="player")||null;
  },[scenePlayerId,entries,sorted,activeEntry]);

  // Opponent side: every non-player combatant is rendered (faded) as a bench row; the
  // "focused" one is shown full-size on the platform. Focus priority: a move target
  // currently selected in the FIGHT popup > a manual bench/POKéMON-menu pick (cleared
  // each turn) > the next enemy up in turn order (the current one if it's already an
  // enemy's turn) > fallback.
  const oppEntries=useMemo(()=>sorted.filter(e=>e.side!=="player"),[sorted]);
  const nextEnemyInOrder=useMemo(()=>{
    const n=sorted.length;
    if(n===0)return null;
    for(let i=0;i<n;i++){const e=sorted[(turn+i)%n];if(e.side!=="player"&&e.currentHp>0)return e;}
    for(let i=0;i<n;i++){const e=sorted[(turn+i)%n];if(e.side!=="player")return e;}
    return null;
  },[sorted,turn]);
  const focusedEnemy=useMemo(()=>{
    const targeted=sceneTargetIds.map(id=>entries.find(e=>e.id===id)).filter((e):e is BattleEntry=>!!e&&e.side!=="player");
    if(targeted.length>0)return targeted[0];
    const chosen=sceneEnemyId?entries.find(e=>e.id===sceneEnemyId&&e.side!=="player"):null;
    if(chosen)return chosen;
    if(nextEnemyInOrder)return nextEnemyInOrder;
    return oppEntries.find(e=>e.currentHp>0)||oppEntries[0]||null;
  },[sceneTargetIds,nextEnemyInOrder,sceneEnemyId,entries,oppEntries]);
  const onFieldEnemy=focusedEnemy;
  const focusedTargetIdSet=useMemo(()=>new Set(sceneTargetIds),[sceneTargetIds]);
  const benchEnemies=useMemo(()=>oppEntries.filter(e=>e.id!==focusedEnemy?.id),[oppEntries,focusedEnemy]);

  // MovePopup handlers at the scene level (mirror BattleCard's local versions).
  const sApplyDmg=(tid:string,dmg:number)=>setEntries(prev=>prev.map(e=>e.id===tid?{...e,currentHp:Math.max(0,e.currentHp-dmg)}:e));
  const sApplyEffect=(tid:string,attr:string,amount:number,src:string,appliedBy?:string)=>setEntries(prev=>prev.map(t=>{if(t.id!==tid)return t;const nm=[...t.statMods];const idx=nm.findIndex(m=>m.attr===attr&&m.source===src);if(idx>=0)nm[idx]={...nm[idx],amount:nm[idx].amount+amount,appliedBy:appliedBy??nm[idx].appliedBy};else nm.push({source:src,attr,amount,appliedBy});return{...t,statMods:nm};}));
  const sIncrementAction=(id:string,isReaction?:boolean)=>setEntries(prev=>prev.map(e=>e.id===id?(isReaction?{...e,reactionUsed:true}:{...e,actionCount:Math.min(5,e.actionCount+1)}):e));
  const sSpendWP=(id:string,amt:number)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentWill:Math.max(0,e.currentWill-amt)}:e));
  const sApplySpecial=(id:string,u:Partial<BattleEntry>)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e));

  const addPokemon=useCallback((pokemon:PokemonEntry,trainerId?:string,nickname?:string,loyalty=1,happiness=1,moves?:Move[],sheetKey?:string,trainerRank?:string,side?:"player"|"enemy"|"neutral")=>{
    const hp=pokemon.number<=0?10:pokemon.baseHp+pokemon.attributes.vitality;
    const will=pokemon.number<=0?5:pokemon.attributes.insight+3;
    const ini=Math.floor(Math.random()*6)+1+(pokemon.attributes?.dexterity??1);
    const defaultMoves=pokemon.moves.slice(0,4).map(m=>MOVES.find(mv=>mv.name===m.name)||{name:m.name,type:m.type,category:"Physical" as const,power:"-",accuracy:"-",damagePool:"-",effect:"",description:""} as Move);
    // Load skills from the character sheet if linked
    const sheetSkills=sheetKey?(()=>{const s=loadFromStorage<Record<string,any>>("pokemon_sheets",{});return s[sheetKey]?.skills??null;})():null;
    setEntries(prev=>[...prev,{
      id:`${pokemon.number}-${Date.now()}`,pokemon,nickname:nickname||"",
      initiative:ini,currentHp:hp,maxHp:hp,currentWill:will,maxWill:will,
      loyalty,happiness,
      statuses:["Healthy"],statusTurnsLeft:0,notes:"",isExpanded:false,hasTakenTurn:false,
      side:side||(trainerId?"player":"enemy"),trainerRank:(trainerRank||"Rookie") as any,
      abilities:pokemon.abilities.map(a=>({name:a,active:true})),
      moves:moves||defaultMoves,
      attrs:{...pokemon.attributes},statMods:[],weatherImmune:false,actionCount:0,
      reactionUsed:false,isProtected:false,linkedTrainerId:trainerId,linkedPokemonSheetKey:sheetKey,
      pokemonSkills:sheetSkills??{brawl:1,channel:1,clash:1,evasion:1,alert:1,athletic:1,nature:1,stealth:1,intimidate:1,perform:1},
    }]);
    if(trainerId){
      saveToStorage("pending_link",{pokemonNumber:pokemon.number,trainerId,nickname:nickname||""});
    }
  },[]);

  const syncSheetHappinessLoyalty=(entry:BattleEntry,happiness:number,loyalty:number)=>{
    if(!entry.linkedPokemonSheetKey)return;
    const sheets=loadFromStorage<Record<string,any>>("pokemon_sheets",{});
    if(!sheets[entry.linkedPokemonSheetKey])return;
    sheets[entry.linkedPokemonSheetKey]={...sheets[entry.linkedPokemonSheetKey],happiness,loyalty};
    saveToStorage("pokemon_sheets",sheets);
  };

  const upd=useCallback((id:string,u:Partial<BattleEntry>)=>setEntries(prev=>{
    const next=prev.map(e=>{
      if(e.id!==id)return e;
      let merged={...e,...u};
      // Faint: HP just hit 0 for the first time this update → happiness −1
      if(u.currentHp!==undefined&&u.currentHp<=0&&e.currentHp>0){
        const newHappy=Math.max(0,merged.happiness-1);
        merged={...merged,happiness:newHappy};
        // Sync faint penalty back to character sheet
        if(e.linkedPokemonSheetKey){
          const sheets=loadFromStorage<Record<string,any>>("pokemon_sheets",{});
          if(sheets[e.linkedPokemonSheetKey]){
            sheets[e.linkedPokemonSheetKey]={...sheets[e.linkedPokemonSheetKey],happiness:newHappy,loyalty:merged.loyalty};
            saveToStorage("pokemon_sheets",sheets);
          }
        }
      }
      // Sync manual loyalty/happiness edits back to sheet
      if((u.loyalty!==undefined||u.happiness!==undefined)&&e.linkedPokemonSheetKey){
        setTimeout(()=>syncSheetHappinessLoyalty({...e,...u,...merged},merged.happiness,merged.loyalty),0);
      }
      return merged;
    });
    return next;
  }),[]);

  const endBattle=useCallback(()=>{
    const isMajor=battleType!=="default";
    if(isMajor){
      // Give +1 loyalty to surviving player Pokémon with a sheet key
      const sheets=loadFromStorage<Record<string,any>>("pokemon_sheets",{});
      let changed=false;
      entries.forEach(e=>{
        if(e.side==="player"&&e.currentHp>0&&e.linkedPokemonSheetKey&&sheets[e.linkedPokemonSheetKey]){
          const s=sheets[e.linkedPokemonSheetKey];
          sheets[e.linkedPokemonSheetKey]={...s,loyalty:Math.min(5,(s.loyalty??1)+1)};
          changed=true;
        }
      });
      if(changed)saveToStorage("pokemon_sheets",sheets);
    }
    const msg=isMajor?"Battle ended! Surviving party Pokémon gained +1 Loyalty.":"Battle ended.";
    alert(msg);
    // Clear battle entries
    setEntries([]);setTurn(0);setRound(1);setBattleType("default");
  },[battleType,entries]);
  const remove=useCallback((id:string)=>setEntries(prev=>prev.filter(e=>e.id!==id)),[]);
  const applyEOR=(id:string,hp:number)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp+hp)}:e));

  const startNewRound=(newRound:number)=>{
    // Reset all entries for new round
    setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false,actionCount:0,reactionUsed:false,isProtected:false})));
    setShowEOR(true);
    // Priority fires at start of new round — after EOR closes
    const hasPri=entries.some(e=>e.currentHp>0&&e.moves.some(m=>(m.priority??0)>0));
    if(hasPri)setTimeout(()=>setShowPriority(true),600);
  };

  const prevTurn=()=>{
    setSceneMsg("");setMenuMode("root");setSceneEnemyId(null);setSceneTargetIds([]);
    const prev=(turn-1+Math.max(1,sorted.length))%Math.max(1,sorted.length);
    setTurn(prev);
    // Re-activate the previous entry
    if(sorted[prev]){
      setEntries(p=>p.map(e=>e.id===sorted[prev].id?{...e,hasTakenTurn:false,actionCount:0}:e));
    }
  };

  const nextTurn=()=>{
    setSceneMsg("");setMenuMode("root");setSceneEnemyId(null);setSceneTargetIds([]);
    if(activeEntry){
      setEntries(prev=>prev.map(e=>{
        if(e.id!==activeEntry.id)return e;
        let sts=[...(e.statuses||[])];
        let nt=e.statusTurnsLeft;
        // Clear Flinch at end of turn
        sts=sts.filter(s=>s!=="Flinched");
        if(sts.length===0)sts=["Healthy"];
        // Tick sleep countdown
        if(sts.includes("Asleep")){nt=Math.max(0,e.statusTurnsLeft-1);if(nt===0)sts=removeStatus(sts,"Asleep");}
        // Decrement Dynamax rounds
        let dynRounds=e.dynamaxRoundsLeft??0;
        let isDynaxed=e.isDynamaxed;
        if(isDynaxed&&dynRounds>0){dynRounds--;if(dynRounds===0){isDynaxed=false;// Remove Gigamax stat mods
        }}
        return{...e,hasTakenTurn:true,statuses:sts,statusTurnsLeft:nt,dynamaxRoundsLeft:dynRounds,isDynamaxed:isDynaxed};
      }));
    }
    const next=(turn+1)%Math.max(1,sorted.length);
    if(next===0){
      const newRound=round+1;
      setRound(newRound);
      startNewRound(newRound);
    }
    setTurn(next);
    // Scroll to next active card
    setTimeout(()=>{
      const nextActive=sorted[(next)%Math.max(1,sorted.length)];
      if(nextActive&&scrollRef.current&&cardRefs.current[nextActive.id]){
        const container=scrollRef.current;
        const card=cardRefs.current[nextActive.id]!;
        const cardLeft=card.offsetLeft;
        const cardWidth=card.offsetWidth;
        const containerWidth=container.offsetWidth;
        container.scrollTo({left:cardLeft-containerWidth/2+cardWidth/2,behavior:"smooth"});
      }
    },50);
  };

  // Trigger priority popup on first load if there are entries with priority moves
  useEffect(()=>{
    if(entries.length>0&&entries.some(e=>e.currentHp>0&&e.moves.some(m=>(m.priority??0)>0))){
      setShowPriority(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const rollAllIni=()=>{
    setEntries(prev=>prev.map(e=>({
      ...e,
      initiative:Math.floor(Math.random()*6)+1+(e.attrs?.dexterity??1),
      // Restore HP/WP
      currentHp:e.maxHp,currentWill:e.maxWill,
      // Clear statuses and stat mods
      statuses:["Healthy"],statusTurnsLeft:0,statMods:[],
      // Clear battle-turn state
      actionCount:0,reactionUsed:false,hasTakenTurn:false,
      // Clear round effects
      isProtected:false,hasSubstitute:false,substituteHp:0,
      // Clear mega/dynamax/tera forms
      isMegaEvolved:false,megaOriginalAttrs:undefined,
      isDynamaxed:false,dynamaxRoundsLeft:0,dynamaxExtraHpCur:0,isGigamax:false,
      isTerastallized:false,teraFirstMoveBonusUsed:false,
      // Clear transform
      morphedTo:undefined,originalAttrs:undefined,originalMoves:undefined,
      // Clear notes
      notes:"",
      // Clear support move effects
      abilityOverride:undefined,abilitySuppressed:false,
      typeOverride:undefined,heldItem:undefined,itemEmbargoed:false,
      isFollowMeTarget:false,chargeActive:false,
    })));
    setTurn(0);setRound(1);
  };
  const handleDrop=(targetId:string)=>{if(!dragId||dragId===targetId){setDragId(null);return;}setEntries(prev=>{const a=[...prev];const fi=a.findIndex(e=>e.id===dragId);const ti=a.findIndex(e=>e.id===targetId);const [item]=a.splice(fi,1);a.splice(ti,0,item);return a;});setDragId(null);};

  const sideColor=activeEntry?{player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[activeEntry.side]:"#5a6080";

  return(
    <div suppressHydrationWarning style={{display:"flex",flexDirection:"column",height:"100vh",background:"url('/assets/frlg-grass-bg.png') bottom/auto 45% repeat-x, linear-gradient(180deg,#88B8E8 0%,#60A0D8 42%,#78A848 58%,#507830 100%)",color:"#181818",overflow:"hidden",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      {showAddModal&&<AddPokemonModal onAdd={(p,side)=>addPokemon(p,undefined,undefined,1,1,undefined,undefined,undefined,side)} onClose={()=>setShowAddModal(false)}/>}
      {showEOR&&<EORPopup entries={entries} weather={weather} round={round} onApply={applyEOR} onClose={()=>setShowEOR(false)}/>}
      {showPriority&&<PriorityPopup entries={entries} allEntries={entries} weather={weather} onClose={()=>setShowPriority(false)} onApplyDmg={(id,dmg)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp-dmg)}:e))} onApplyEffect={(id,attr,amt,src)=>setEntries(prev=>prev.map(e=>{if(e.id!==id)return e;const nm=[...e.statMods];const idx=nm.findIndex(m=>m.attr===attr&&m.source===src);if(idx>=0)nm[idx].amount+=amt;else nm.push({source:src,attr,amount:amt});return{...e,statMods:nm};}))} onIncrementAction={(id,isR)=>setEntries(prev=>prev.map(e=>e.id===id?(isR?{...e,reactionUsed:true}:{...e,actionCount:Math.min(4,e.actionCount+1)}):e))} onSpendWP={(id,amt)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentWill:Math.max(0,e.currentWill-amt)}:e))} onApplySpecial={(id,u)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e))}/>}

      {/* Nav — FireRed white panel style */}
      <nav style={{background:"#F8F8E8",borderBottom:"3px solid #181818",boxShadow:"0 3px 0 #787878",padding:"0 10px",height:46,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <Link href="/" style={{fontFamily:"'Press Start 2P',monospace",fontWeight:400,fontSize:10,color:"#181818",textDecoration:"none",letterSpacing:"-0.5px"}}>PokeRole<span style={{color:"#2858C0"}}> Tools</span></Link>
        <span style={{color:"#888870",fontSize:12}}>›</span>
        <span style={{fontSize:9,color:"#D82808",fontWeight:700,fontFamily:"'Press Start 2P',monospace"}}>⚔ BATTLE</span>
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
          <select value={weather.name} onChange={e=>setWeather(WEATHER_DATA.find(w=>w.name===e.target.value)!)} style={{background:"#F8F8E8",border:"2px solid #181818",color:"#181818",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>{WEATHER_DATA.map(w=><option key={w.name} value={w.name}>{w.emoji?.split(" ")[0]} {w.name}</option>)}</select>
          <select value={terrain} onChange={e=>setTerrain(e.target.value)} title="Active Terrain" style={{background:"#F8F8E8",border:"2px solid #181818",color:terrain==="None"?"#888870":"#2858C0",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>
            <option value="None">🌍 No Terrain</option>
            <option value="Electric Terrain">⚡ Electric Terrain</option>
            <option value="Grassy Terrain">🌿 Grassy Terrain</option>
            <option value="Misty Terrain">🌫 Misty Terrain</option>
            <option value="Psychic Terrain">🔮 Psychic Terrain</option>
          </select>
          <div style={{display:"flex",alignItems:"center",gap:4,background:"#E8E8D0",border:"2px solid #181818",padding:"2px 6px",fontSize:9,fontFamily:"'Press Start 2P',monospace"}}>
            <span style={{color:"#888870"}}>RND</span>
            <span style={{color:"#181818",fontWeight:700}}>{round}</span>
            <span style={{color:"#C8C8A8",margin:"0 2px"}}>·</span>
            <span style={{color:mounted&&activeEntry?.side==="player"?"#2858C0":"#D82808",maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mounted?(activeEntry?.nickname||activeEntry?.pokemon.name||"—"):"—"}</span>
          </div>
          {[
            {label:"◀ PREV",onClick:prevTurn,style:{background:"#E8E8D0"}},
            {label:"NEXT ▶",onClick:nextTurn,style:{background:"#2858C0",color:"#F8F8E8",border:"2px solid #181818",boxShadow:"2px 2px 0 #181818"}},
          ].map(b=>(
            <button key={b.label} onClick={b.onClick} style={{border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"3px 8px",fontSize:9,fontFamily:"'Press Start 2P',monospace",cursor:"pointer",background:"#E8E8D0",color:"#181818",...b.style}}>{b.label}</button>
          ))}
          <button onClick={()=>{if(confirm("Reset the battle? All combatants will be cleared.")){setEntries([]);setTurn(0);setRound(1);}}} style={{background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"3px 7px",fontSize:9,fontFamily:"'Press Start 2P',monospace",cursor:"pointer",color:"#D82808"}}>↺</button>
          <button onClick={rollAllIni} style={{background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"3px 7px",fontSize:9,fontFamily:"'Press Start 2P',monospace",cursor:"pointer",color:"#2858C0"}}>INI</button>
          <button onClick={()=>setShowPriority(true)} style={{background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"3px 7px",fontSize:9,fontFamily:"'Press Start 2P',monospace",cursor:"pointer",color:"#2858C0"}} title="Priority phase">⚡</button>
          <button onClick={()=>setShowEOR(true)} style={{background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"3px 7px",fontSize:9,fontFamily:"'Press Start 2P',monospace",cursor:"pointer",color:"#D88018"}} title="End of Round">EOR</button>
          <select value={battleType} onChange={e=>setBattleType(e.target.value as any)} style={{background:"#F8F8E8",border:"2px solid #181818",color:"#181818",fontSize:9,padding:"2px 4px",cursor:"pointer",fontFamily:"'Press Start 2P',monospace"}}>
            <option value="default">DEFAULT</option>
            <option value="gym">GYM</option>
            <option value="boss">BOSS</option>
            <option value="raid">RAID</option>
            <option value="danger">DANGER</option>
          </select>
          <button onClick={endBattle} style={{background:"#D82808",border:"2px solid #181818",boxShadow:"2px 2px 0 #181818",padding:"3px 7px",fontSize:9,fontFamily:"'Press Start 2P',monospace",cursor:"pointer",color:"#F8F8E8",fontWeight:700}} title="End battle">END</button>
          <Link href="/gm-screen" style={{fontSize:9,color:"#181818",textDecoration:"none",background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"3px 6px",fontFamily:"'Press Start 2P',monospace"}}>GM</Link>
        </div>
      </nav>

      {/* Weather banner — FireRed dialogue box style */}
      {weather.name!=="Clear"&&<div style={{background:"#F8F8E8",borderBottom:"2px solid #181818",padding:"3px 14px",display:"flex",gap:8,alignItems:"center",fontSize:9,flexShrink:0,fontFamily:"'Press Start 2P',monospace"}}><span>{weather.emoji?.split(" ")[0]}</span><span style={{fontWeight:700,color:"#181818"}}>{weather.name.toUpperCase()}</span><span style={{color:"#484830",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:8}}>{weather.description}</span>{terrain!=="None"&&<span style={{color:"#2858C0",fontSize:8}}>· {terrain}</span>}</div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Left sidebar — FireRed style */}
        <div style={{width:220,background:"#F0EFD8",borderRight:"3px solid #181818",display:"flex",flexDirection:"column",flexShrink:0}}>
          {/* Sidebar tabs */}
          <div style={{display:"flex",borderBottom:"2px solid #181818",flexShrink:0}}>
            {[{k:"search" as const,l:"SEARCH"},{ k:"characters" as const,l:"PARTY"}].map(t=>(
              <button key={t.k} onClick={()=>setSidebarTab(t.k)} style={{flex:1,padding:"7px",background:sidebarTab===t.k?"#F8F8E8":"#E8E8D0",border:"none",borderBottom:`3px solid ${sidebarTab===t.k?"#2858C0":"transparent"}`,color:sidebarTab===t.k?"#2858C0":"#888870",cursor:"pointer",fontSize:8,fontWeight:700,fontFamily:"'Press Start 2P',monospace"}}>{t.l}</button>
            ))}
          </div>
          <div style={{padding:"8px 8px 4px",flexShrink:0}}>
            {sidebarTab==="search"&&<button onClick={()=>setShowAddModal(true)} style={{width:"100%",background:"#2858C0",border:"2px solid #181818",boxShadow:"2px 2px 0 #181818",color:"#F8F8E8",padding:"7px",fontSize:9,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontWeight:700}}>+ ADD POKéMON</button>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"4px 8px"}}>
            {sidebarTab==="search"&&(
              <div>
                {mounted&&sorted.map((e,idx)=>(
                  <div key={e.id} onClick={()=>upd(e.id,{isExpanded:!e.isExpanded})} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 5px",cursor:"pointer",background:activeEntry?.id===e.id?"#C8D8F0":"transparent",borderLeft:`3px solid ${activeEntry?.id===e.id?"#2858C0":"transparent"}`,opacity:e.currentHp<=0?0.45:1,borderBottom:"1px solid #C8C8A8"}}>
                    <span style={{fontSize:7,color:"#888870",fontFamily:"'Press Start 2P',monospace",width:12,flexShrink:0,textAlign:"right"}}>{idx+1}</span>
                    <div style={{width:5,height:5,background:e.currentHp<=0?"#787878":TYPE_COLORS[e.pokemon.types[0]],border:"1px solid #181818",flexShrink:0}}/>
                    <span style={{fontSize:10,color:e.currentHp<=0?"#888870":"#181818",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:e.currentHp<=0?"line-through":"none",fontWeight:600}}>{e.nickname||e.pokemon.name}</span>
                    <span style={{fontSize:7,color:"#2858C0",fontFamily:"'Press Start 2P',monospace",flexShrink:0}}>{e.initiative}</span>
                    <span style={{fontSize:8,color:e.currentHp<=0?"#888870":e.currentHp/e.maxHp>0.5?"#18C840":e.currentHp/e.maxHp>0.25?"#E8B018":"#D82808",fontFamily:"'Press Start 2P',monospace",fontWeight:700,flexShrink:0}}>{e.currentHp}/{e.maxHp}</span>
                  </div>
                ))}
                {(!mounted||entries.length===0)&&<div style={{textAlign:"center",color:"#888870",padding:16,fontSize:8,fontFamily:"'Press Start 2P',monospace",lineHeight:2}}>+ ADD POKéMON<br/>to begin</div>}
              </div>
            )}
            {sidebarTab==="characters"&&(
              <>
                <div style={{fontSize:9,color:"#5a6080",padding:"4px 4px 8px",lineHeight:1.4}}>
                  Expand a trainer below to see their party. Click <strong style={{color:"#00d4aa"}}>+</strong> to add to battle.
                </div>
                <CharactersSidebar onAddPokemon={(p,tid,nick,loy,hap,movs,sk)=>addPokemon(p,tid,nick,loy,hap,movs,sk)}/>
              </>
            )}
          </div>
          <div style={{padding:"6px 8px",borderTop:"2px solid #181818",flexShrink:0}}>
            <button onClick={()=>setEntries([])} style={{width:"100%",background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",color:"#D82808",padding:"5px",fontSize:8,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontWeight:700}}>CLEAR ALL</button>
          </div>
        </div>

        {/* ── FIRERED BATTLE SCENE ─────────────────────────────────────────── */}
        <div style={{flex:1,position:"relative",overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {/* Thin status summary strip */}
          {mounted&&entries.length>0&&(()=>{
            const withStatus=sorted.filter(e=>e.currentHp>0).filter(e=>(e.statuses||[]).some(s=>s!=="Healthy")||(e.statMods||[]).length>0||e.isProtected);
            if(withStatus.length===0)return null;
            return(
              <div style={{zIndex:6,background:"rgba(24,16,8,0.72)",borderBottom:"2px solid #181818",padding:"3px 8px",display:"flex",gap:6,overflowX:"auto",alignItems:"center",flexShrink:0}}>
                <span style={{fontSize:7,color:"#C8D8F8",fontFamily:"'Press Start 2P',monospace",flexShrink:0,textShadow:"1px 1px 0 #181818"}}>STATUS</span>
                {withStatus.map(e=>{
                  const sc2=e.side==="player"?"#2858C0":e.side==="enemy"?"#D82808":"#888870";
                  const sts=(e.statuses||[]).filter(s=>s!=="Healthy");
                  return(
                    <div key={e.id} style={{display:"flex",alignItems:"center",gap:2,background:"#F8F8E8",border:`2px solid ${sc2}`,padding:"2px 5px",flexShrink:0}}>
                      <span style={{fontSize:7,fontWeight:700,color:sc2,fontFamily:"'Press Start 2P',monospace"}}>{(e.nickname||e.pokemon.name).slice(0,8).toUpperCase()}</span>
                      {sts.map(s=><StatusBadge key={s} status={s}/>)}
                      {e.isProtected&&<span style={{fontSize:7,color:"#2858C0",fontFamily:"'Press Start 2P',monospace"}}>PROT</span>}
                      {(e.statMods||[]).length>0&&<span style={{fontSize:6,color:"#484830",fontFamily:"'Press Start 2P',monospace"}}>+{e.statMods.length}m</span>}
                      <span style={{fontSize:7,color:e.currentHp/e.maxHp>0.5?"#187028":e.currentHp/e.maxHp>0.25?"#807008":"#A00808",fontFamily:"'Press Start 2P',monospace",fontWeight:700}}>{e.currentHp}/{e.maxHp}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {(!mounted||entries.length===0)?(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,padding:40}}>
              <div style={{background:"#F8F8E8",border:"3px solid #181818",boxShadow:"4px 4px 0 #787878",padding:"24px 32px",textAlign:"center"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#181818",fontFamily:"'Press Start 2P',monospace",marginBottom:10}}>NO COMBATANTS</div>
                <div style={{fontSize:8,color:"#484830",fontFamily:"'Press Start 2P',monospace",lineHeight:1.8}}>Use the sidebar to<br/>add Pokémon</div>
              </div>
            </div>
          ):(
            <>
              {/* STAGE */}
              <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:260}}>
                {/* Enemy nameplate — top-left */}
                {mounted&&onFieldEnemy&&<div style={{position:"absolute",top:16,left:16,zIndex:3}}><SceneNameplate entry={onFieldEnemy} enemy onClick={()=>setDrawerId(onFieldEnemy.id)}/></div>}
                {/* Bench row — every other opponent in the tracker, faded, click to focus */}
                {mounted&&benchEnemies.length>0&&(
                  <div style={{position:"absolute",top:96,left:16,zIndex:3,display:"flex",gap:5,flexWrap:"wrap",maxWidth:200}}>
                    {benchEnemies.map(e=>(
                      <button key={e.id} onClick={()=>setSceneEnemyId(e.id)} title={`${e.nickname||e.pokemon.name} — click to focus`}
                        style={{width:34,height:34,padding:0,border:"2px solid #181818",borderRadius:6,background:"rgba(248,248,232,0.82)",cursor:"pointer",opacity:0.4,transition:"opacity .15s",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                        onMouseEnter={ev=>{(ev.currentTarget as HTMLButtonElement).style.opacity="0.85";}}
                        onMouseLeave={ev=>{(ev.currentTarget as HTMLButtonElement).style.opacity="0.4";}}>
                        <img src={`/sprites/pokemon/${e.pokemon.number}.png`} alt="" width={26} height={26} style={{imageRendering:"pixelated",objectFit:"contain",filter:e.currentHp<=0?"grayscale(1)":undefined}}
                          onError={ev=>{(ev.currentTarget as HTMLImageElement).style.visibility="hidden";}}/>
                      </button>
                    ))}
                  </div>
                )}
                {/* Enemy mon — upper-right (glows red while selected as the FIGHT target) */}
                {mounted&&onFieldEnemy&&<div style={{position:"absolute",top:"9%",right:"7%",zIndex:2}}>
                  <div style={{filter:focusedTargetIdSet.has(onFieldEnemy.id)?"drop-shadow(0 0 10px #FF3838) drop-shadow(0 0 4px #FF3838)":undefined,transition:"filter .15s"}}>
                    <FieldMon number={onFieldEnemy.pokemon.number} fainted={onFieldEnemy.currentHp<=0} onClick={()=>setDrawerId(onFieldEnemy.id)}/>
                  </div>
                </div>}
                {/* Player mon — lower-left (back sprite) */}
                {mounted&&onFieldPlayer&&<div style={{position:"absolute",bottom:"3%",left:"5%",zIndex:2}}><FieldMon number={onFieldPlayer.pokemon.number} back fainted={onFieldPlayer.currentHp<=0} onClick={()=>setDrawerId(onFieldPlayer.id)}/></div>}
                {/* Player nameplate — lower-right */}
                {mounted&&onFieldPlayer&&<div style={{position:"absolute",bottom:"9%",right:24,zIndex:3}}><SceneNameplate entry={onFieldPlayer} onClick={()=>setDrawerId(onFieldPlayer.id)}/></div>}

                {/* POKéMON switch overlay */}
                {menuMode==="pokemon"&&(
                  <div style={{position:"absolute",inset:0,zIndex:8,background:"rgba(24,16,8,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                    <div style={{background:"#F8F8E8",border:"3px solid #181818",boxShadow:"4px 4px 0 #787878",padding:12,maxWidth:520,width:"100%",maxHeight:"90%",overflowY:"auto"}}>
                      <div style={{display:"flex",alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:9,fontFamily:"'Press Start 2P',monospace",color:"#181818",flex:1}}>SEND / SWITCH</span>
                        <button onClick={()=>setMenuMode("root")} style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",background:"#E8E8D0",border:"2px solid #181818",padding:"3px 6px",cursor:"pointer"}}>BACK</button>
                      </div>
                      {(["player","enemy"] as const).map(side=>{
                        const list=sorted.filter(e=>side==="player"?e.side==="player":e.side!=="player");
                        if(list.length===0)return null;
                        const onField=side==="player"?onFieldPlayer:onFieldEnemy;
                        return(
                          <div key={side} style={{marginBottom:8}}>
                            <div style={{fontSize:7,fontFamily:"'Press Start 2P',monospace",color:side==="player"?"#2858C0":"#D82808",marginBottom:4}}>{side==="player"?"◆ YOUR SIDE":"◆ OPPONENTS"}</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                              {list.map(e=>{
                                const active=onField?.id===e.id;
                                return(
                                  <div key={e.id} style={{display:"flex",alignItems:"center",gap:5,background:active?"#C8D8F0":"#F0ECD4",border:`2px solid ${active?"#2858C0":"#181818"}`,padding:"3px 5px",opacity:e.currentHp<=0?0.5:1}}>
                                    <img src={`/sprites/pokemon/${e.pokemon.number}.png`} alt="" width={28} height={28} style={{imageRendering:"pixelated",objectFit:"contain",flexShrink:0}}/>
                                    <div style={{flex:1,minWidth:0}}>
                                      <div style={{fontSize:7,fontFamily:"'Press Start 2P',monospace",color:"#181818",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(e.nickname||e.pokemon.name).toUpperCase()}</div>
                                      <div style={{fontSize:7,fontFamily:"'Press Start 2P',monospace",color:e.currentHp/e.maxHp>0.5?"#187028":e.currentHp/e.maxHp>0.25?"#807008":"#A00808"}}>{e.currentHp}/{e.maxHp}</div>
                                    </div>
                                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                                      <button onClick={()=>{side==="player"?setScenePlayerId(e.id):setSceneEnemyId(e.id);setMenuMode("root");}} disabled={active} style={{fontSize:6,fontFamily:"'Press Start 2P',monospace",background:active?"#C8C8A8":"#2858C0",color:"#F8F8E8",border:"1px solid #181818",padding:"2px 3px",cursor:active?"default":"pointer"}}>{active?"OUT":"SEND"}</button>
                                      <button onClick={()=>{setDrawerId(e.id);setMenuMode("root");}} style={{fontSize:6,fontFamily:"'Press Start 2P',monospace",background:"#E8E8D0",color:"#181818",border:"1px solid #181818",padding:"2px 3px",cursor:"pointer"}}>CARD</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* BAG overlay — quick field items */}
                {menuMode==="bag"&&(
                  <div style={{position:"absolute",inset:0,zIndex:8,background:"rgba(24,16,8,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                    <div style={{background:"#F8F8E8",border:"3px solid #181818",boxShadow:"4px 4px 0 #787878",padding:12,maxWidth:340,width:"100%"}}>
                      <div style={{display:"flex",alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:9,fontFamily:"'Press Start 2P',monospace",color:"#181818",flex:1}}>BAG</span>
                        <button onClick={()=>setMenuMode("root")} style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",background:"#E8E8D0",border:"2px solid #181818",padding:"3px 6px",cursor:"pointer"}}>BACK</button>
                      </div>
                      <div style={{fontSize:7,fontFamily:"'Press Start 2P',monospace",color:"#484830",marginBottom:8,lineHeight:1.6}}>Quick restore for {onFieldPlayer?(onFieldPlayer.nickname||onFieldPlayer.pokemon.name):"—"}.</div>
                      {onFieldPlayer?(
                        <div style={{display:"flex",flexDirection:"column",gap:5}}>
                          {[
                            {l:"POTION  (+2 HP)",fn:()=>upd(onFieldPlayer.id,{currentHp:Math.min(onFieldPlayer.maxHp,onFieldPlayer.currentHp+2)}),m:`${onFieldPlayer.nickname||onFieldPlayer.pokemon.name} recovered HP!`},
                            {l:"ETHER   (+2 WP)",fn:()=>upd(onFieldPlayer.id,{currentWill:Math.min(onFieldPlayer.maxWill,onFieldPlayer.currentWill+2)}),m:`${onFieldPlayer.nickname||onFieldPlayer.pokemon.name} recovered WP!`},
                            {l:"FULL RESTORE",fn:()=>upd(onFieldPlayer.id,{currentHp:onFieldPlayer.maxHp,currentWill:onFieldPlayer.maxWill,statuses:["Healthy"],statusTurnsLeft:0}),m:`${onFieldPlayer.nickname||onFieldPlayer.pokemon.name} was fully restored!`},
                          ].map(it=>(
                            <button key={it.l} onClick={()=>{it.fn();setSceneMsg(it.m);setMenuMode("root");}} style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",background:"#F0ECD4",border:"2px solid #181818",boxShadow:"2px 2px 0 #181818",padding:"7px 8px",cursor:"pointer",textAlign:"left"}}>{it.l}</button>
                          ))}
                        </div>
                      ):<div style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",color:"#A00808"}}>No party Pokémon on field.</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* BOTTOM BAR — text box + menu */}
              <div style={{flexShrink:0,height:160,display:"flex",gap:0,borderTop:"3px solid #181818"}}>
                {/* Text box */}
                <div style={{flex:1,padding:6,background:"#3058B0",borderRight:"3px solid #181818"}}>
                  <div style={{height:"100%",border:"3px solid #F8F8E8",borderRadius:8,background:"linear-gradient(180deg,#3868C0 0%,#284C9C 100%)",boxShadow:"inset 0 0 0 2px #204088",padding:"12px 14px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                    <span style={{fontSize:11,lineHeight:1.7,fontFamily:"'Press Start 2P',monospace",color:"#F8F8E8",textShadow:"2px 2px 0 #182848"}}>
                      {menuMode==="fight"?"Choose a move.":menuMode==="pokemon"?"Choose a Pokémon.":menuMode==="bag"?"Choose an item.":
                        (sceneMsg||(onFieldPlayer?`What will ${(onFieldPlayer.nickname||onFieldPlayer.pokemon.name).toUpperCase()} do?`
                          :onFieldEnemy?`${(onFieldEnemy.nickname||onFieldEnemy.pokemon.name).toUpperCase()} appeared!`
                          :"Add a Pokémon to begin the battle."))}
                    </span>
                  </div>
                </div>
                {/* Menu / move list */}
                <div style={{width:"44%",maxWidth:420,minWidth:280,background:"#F8F8E8",padding:8,display:"flex"}}>
                  <div style={{flex:1,border:"3px solid #181818",borderRadius:8,boxShadow:"inset 0 0 0 2px #A0A088",background:"#F8F8E8",padding:8,display:"flex",flexDirection:"column",gap:5,minHeight:0}}>
                    {menuMode!=="root"&&(
                      <button onClick={()=>setMenuMode("root")} style={{alignSelf:"flex-start",flexShrink:0,fontSize:7,fontFamily:"'Press Start 2P',monospace",color:"#484830",background:"#E8E8D0",border:"2px solid #181818",boxShadow:"1px 1px 0 #787878",padding:"3px 7px",cursor:"pointer"}}>◀ BACK</button>
                    )}
                    <div style={{flex:1,minHeight:0}}>
                    {menuMode==="fight"?(
                      onFieldPlayer&&onFieldPlayer.moves.length>0?(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gridTemplateRows:"1fr 1fr",gap:5,height:"100%"}}>
                          {onFieldPlayer.moves.slice(0,4).map((m,i)=>{
                            const stab=onFieldPlayer.pokemon.types.includes(m.type as PokemonType);
                            return(
                              <button key={i} onClick={()=>{setScenePopup(m);setSceneTargetIds([]);setSceneMsg(`${(onFieldPlayer.nickname||onFieldPlayer.pokemon.name).toUpperCase()} used ${m.name.toUpperCase()}!`);setMenuMode("root");}}
                                style={{display:"flex",flexDirection:"column",justifyContent:"center",gap:3,padding:"4px 7px",background:"#F0ECD4",border:"2px solid #181818",cursor:"pointer",textAlign:"left",boxShadow:"2px 2px 0 #181818",minHeight:0,overflow:"hidden"}}
                                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="#C8D8F0";}}
                                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="#F0ECD4";}}>
                                <span style={{fontSize:8,color:"#181818",fontFamily:"'Press Start 2P',monospace",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",lineHeight:1.3}}>{m.name}</span>
                                <div style={{display:"flex",gap:3,alignItems:"center",flexShrink:0}}><TypeBadge type={m.type as PokemonType} small/>{stab&&<span style={{fontSize:6,color:"#807008",fontFamily:"'Press Start 2P',monospace"}}>★</span>}{(m.priority??0)>0&&<span style={{fontSize:6,color:"#18A870",fontFamily:"'Press Start 2P',monospace"}}>P+</span>}</div>
                              </button>
                            );
                          })}
                        </div>
                      ):(
                        <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <span style={{fontSize:8,fontFamily:"'Press Start 2P',monospace",color:"#888870"}}>No moves.</span>
                        </div>
                      )
                    ):(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gridTemplateRows:"1fr 1fr",gap:4,height:"100%"}}>
                        {[
                          {l:"FIGHT",c:"#D02828",fn:()=>setMenuMode("fight")},
                          {l:"BAG",c:"#C87818",fn:()=>setMenuMode("bag")},
                          {l:"POKéMON",c:"#187828",fn:()=>setMenuMode("pokemon")},
                          {l:"RUN",c:"#3050B0",fn:()=>endBattle()},
                        ].map(b=>(
                          <button key={b.l} onClick={b.fn} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 8px",background:"#F8F8E8",border:"none",cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontSize:11,color:"#181818",fontWeight:700}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="#E0E8F8";}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="#F8F8E8";}}>
                            <span style={{color:b.c}}>▶</span>{b.l}
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cards-on-demand drawer */}
          {mounted&&drawerId&&(()=>{
            const e=entries.find(x=>x.id===drawerId);
            if(!e)return null;
            return(
              <div style={{position:"absolute",inset:0,zIndex:20,background:"rgba(24,16,8,0.6)",display:"flex",justifyContent:"flex-end"}} onClick={()=>setDrawerId(null)}>
                <div onClick={ev=>ev.stopPropagation()} style={{height:"100%",overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>setDrawerId(null)} style={{alignSelf:"flex-end",fontSize:8,fontFamily:"'Press Start 2P',monospace",background:"#E8E8D0",border:"2px solid #181818",boxShadow:"2px 2px 0 #787878",padding:"4px 8px",cursor:"pointer",color:"#D82808"}}>CLOSE ✕</button>
                  <BattleCard entry={e} allEntries={entries} weather={weather} isActive={activeEntry?.id===e.id} onUpdate={upd} onRemove={(id)=>{remove(id);setDrawerId(null);}} onNextTurn={nextTurn} onDragStart={()=>{}} onDragOver={()=>{}} onDrop={()=>{}}/>
                </div>
              </div>
            );
          })()}

          {/* Move detail popup (from FIGHT) */}
          {mounted&&scenePopup&&onFieldPlayer&&(
            <MovePopup move={scenePopup} attacker={onFieldPlayer} allEntries={entries} weather={weather}
              onClose={()=>{setScenePopup(null);setSceneTargetIds([]);}} onApplyDmg={sApplyDmg} onApplyEffect={sApplyEffect}
              onIncrementAction={sIncrementAction} onSpendWP={sSpendWP} onApplySpecial={sApplySpecial} onEndTurn={nextTurn}
              onTargetsChange={setSceneTargetIds}/>
          )}
        </div>
      </div>
    </div>
  );
}

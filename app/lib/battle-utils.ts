// Shared battle utilities — used by both battle-tracker and gm-screen
import { Move, PokemonType, TYPE_CHART } from "../data/pokerole-data";
import { STATUS_CONDITIONS, WeatherData } from "../data/game-rules";

// ── Types ─────────────────────────────────────────────────────────────────────
export type AttrSet={strength:number;dexterity:number;vitality:number;special:number;insight:number};
export interface StatMod{source:string;attr:string;amount:number;}
export interface AbilityState{name:string;active:boolean;}

export interface BattleEntry{
  id:string; pokemon:any; nickname:string;
  initiative:number; currentHp:number; maxHp:number; currentWill:number; maxWill:number;
  loyalty:number; happiness:number;
  statuses:string[]; statusTurnsLeft:number;
  notes:string; isExpanded:boolean; hasTakenTurn:boolean;
  side:"player"|"enemy"|"neutral"; trainerRank:any;
  abilities:AbilityState[]; moves:Move[];
  attrs:AttrSet; statMods:StatMod[];
  weatherImmune:boolean; actionCount:number;
  reactionUsed:boolean;
  linkedTrainerId?:string; showTrainerView?:boolean;
  isProtected?:boolean;
  morphedTo?:any; originalAttrs?:AttrSet; originalMoves?:Move[];
  hasSubstitute?:boolean; substituteHp?:number;
}

// ── Status helpers ────────────────────────────────────────────────────────────
export function primaryStatus(e:{statuses?:string[];status?:string}):string{
  if(e.statuses&&e.statuses.length>0)return e.statuses[0];
  return (e as any).status||"Healthy";
}
export function addStatus(statuses:string[],s:string):string[]{
  if(!s||s==="Healthy"||statuses.includes(s))return statuses;
  return [...statuses.filter(x=>x!=="Healthy"),s];
}
export function removeStatus(statuses:string[],s:string):string[]{
  const r=statuses.filter(x=>x!==s);
  return r.length===0?["Healthy"]:r;
}

// ── Dice ──────────────────────────────────────────────────────────────────────
export function rollDice(n:number):{rolls:number[];successes:number}{
  const p=Math.max(1,n);
  const rolls=Array.from({length:p},()=>Math.floor(Math.random()*6)+1);
  return{rolls,successes:rolls.filter(r=>r>=4).length};
}

// ── Attribute / pool calcs ────────────────────────────────────────────────────
export function getEffectiveAttrs(e:BattleEntry):AttrSet{
  const sc=STATUS_CONDITIONS[primaryStatus(e)];const accPen=sc?.accuracyPenalty??0;
  const mods=e.statMods.reduce<Partial<AttrSet>>((acc,m)=>{const k=m.attr as keyof AttrSet;if(k in e.attrs)acc[k]=(acc[k]??e.attrs[k])+m.amount;return acc;},{});
  return{strength:Math.max(0,mods.strength??e.attrs.strength),dexterity:Math.max(0,(mods.dexterity??e.attrs.dexterity)-accPen),vitality:Math.max(0,mods.vitality??e.attrs.vitality),special:Math.max(0,mods.special??e.attrs.special),insight:Math.max(0,mods.insight??e.attrs.insight)};
}

export function calcAccPool(move:Move,attrs:AttrSet,weather?:WeatherData):number{
  const acc=move.accuracy.toLowerCase();let p=0;
  if(acc.includes("strength"))p+=attrs.strength;
  if(acc.includes("dexterity"))p+=attrs.dexterity;
  if(acc.includes("special"))p+=attrs.special;
  if(acc.includes("insight"))p+=attrs.insight;
  if(acc.includes("vitality"))p+=attrs.vitality;
  p+=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
  if(weather?.accuracyPenalty)p=Math.max(0,p-weather.accuracyPenalty);
  return Math.max(1,p);
}

export function calcDmgPool(move:Move,attrs:AttrSet,weather:WeatherData,stab:boolean,abilBonus:number,loyalty:number,happiness:number):number{
  const dmg=move.damagePool.toLowerCase();
  if(dmg==="-")return 0;
  let p=0;
  if(dmg.includes("samedmg")||dmg.includes("sameasbasepower")){
    const pw=move.power.toLowerCase();
    if(pw.includes("happiness")&&pw.includes("loyalty"))p=happiness+loyalty;
    else if(pw.includes("loyalty"))p=loyalty;
    else if(pw.includes("happiness"))p=happiness;
    else{const pm=move.power.match(/(\d+)/);if(pm)p+=parseInt(pm[1]);}
    if(dmg.includes("loyalty"))p+=loyalty;
    if(dmg.includes("happiness"))p+=happiness;
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
}

export function getTypeMult(mt:PokemonType,dts:PokemonType[]):{label:string;color:string;mod:number}{
  let w=false,r=false,i=false;
  dts.forEach(dt=>{const c=TYPE_CHART[dt];if(c?.weaknesses?.includes(mt))w=true;if(c?.resistances?.includes(mt))r=true;if(c?.immunities?.includes(mt))i=true;});
  if(i)return{label:"Immune",color:"#5a6080",mod:-999};
  if(w)return{label:"Super Effective ×2",color:"#ff4757",mod:2};
  if(r)return{label:"Not very effective ×0.5",color:"#00d4aa",mod:-1};
  return{label:"Normal",color:"#8b90a8",mod:0};
}

export function calcAbilityBonus(entry:BattleEntry,move:Move,weather:WeatherData):{bonus:number;reasons:string[]}{
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
  });
  return res;
}

// ── Move classification helpers ───────────────────────────────────────────────
export function moveTargetsSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  if(move.name==="Transform")return false;
  return e.startsWith("target self")||e.includes("targets self")||
         (e.includes("self.")&&(e.includes("increase")||e.includes("defense")||e.includes("evasion")))||
         move.name==="Harden"||move.name==="Substitute"||move.name==="Baton Pass"||move.name==="Imprison";
}
export function moveSelfDestructsAll(move:Move):boolean{
  return move.name==="Self-Destruct"||move.name==="Explosion"||move.effect.toLowerCase().includes("self-destructs");
}
export function isMoveAOE(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("area move")||e.includes("target all")||e.includes("all foes")||
         e.includes("all allies")||e.includes("target battlefield")||e.includes("battlefield")||
         e.includes(",all.")||moveSelfDestructsAll(move);
}
export function moveUserFaints(move:Move):boolean{
  return move.effect.toLowerCase().includes("user faints")||move.effect.toLowerCase().includes("lethal")||moveSelfDestructsAll(move);
}
export function moveHealsSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("basic heal")||(e.includes("heal")&&(e.includes("user")||e.startsWith("target self")))||
         ["Recover","Moonlight","Synthesis","Rest","Roost","Slack Off","Soft-Boiled","Milk Drink","Swallow"].includes(move.name);
}
export function moveHealsTarget(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return (e.includes("heal")&&(e.includes("ally")||e.includes("target one")))||
         ["Floral Healing","Heal Pulse","Life Dew","Wish"].includes(move.name);
}
export function moveAppliesStatus(move:Move):string|null{
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
export function moveIsTransform(move:Move):boolean{return move.name==="Transform"||move.effect.toLowerCase().includes("transform into");}
export function moveIsReflectType(move:Move):boolean{return move.name==="Reflect Type";}
export function moveIsMetronome(move:Move):boolean{return move.name==="Metronome";}
export function moveIsBatonPass(move:Move):boolean{return move.name==="Baton Pass"||move.effect.toLowerCase().includes("switcher move");}
export function moveIsImprison(move:Move):boolean{return move.name==="Imprison";}
export function movePowerSplit(move:Move):boolean{return move.name==="Power Split"||move.effect.toLowerCase().includes("average the user");}
export function movePowerSwap(move:Move):boolean{return move.name==="Power Swap";}
export function moveSetsWeather(move:Move):string|null{
  const e=move.effect.toLowerCase();const n=move.name.toLowerCase();
  if(n==="sunny day"||n==="max flare"||e.includes("activate sunny"))return"Sunny";
  if(n==="rain dance"||n==="max geyser"||e.includes("activate rain"))return"Rain";
  if(n==="sandstorm"||n==="max rockfall"||e.includes("activate sandstorm"))return"Sandstorm";
  if(n==="hail"||n==="snow"||n==="max hailstorm")return"Hail";
  return null;
}
export function moveHasRecoil(move:Move):boolean{
  return move.effect.toLowerCase().includes("recoil")||
         ["Wave Crash","Double-Edge","Head Smash","Flare Blitz","Take Down","Brave Bird"].includes(move.name);
}
export function statAppliestoSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("increase user")||e.includes("increase the user")||e.includes("raises user")||moveTargetsSelf(move);
}

// ── Pain penalty ──────────────────────────────────────────────────────────────
export function getPainPenaltyLocal(hp:number,max:number):number{
  if(max<=0)return 0;
  const pct=hp/max;
  if(pct>0.5)return 0;
  if(pct>0.25)return 1;
  if(hp>0)return 2;
  return 0;
}

export const TRAINER_SKILL_DEFS_SHARED: Record<string,{attr:string;desc:string;combat:string}>={
  brawl:     {attr:"strength",  desc:"Melee combat and wrestling.",         combat:"Roll STR + Brawl. Damage = successes − target VIT."},
  channel:   {attr:"special",   desc:"Use devices, throw Pokéballs.",       combat:"Roll SPC + Channel. Used for catching."},
  clash:     {attr:"strength",  desc:"Reaction — intercept an attack.",     combat:"Priority 6. Negate attack and deal STR dmg."},
  evasion:   {attr:"dexterity", desc:"Dodge incoming attacks.",             combat:"Priority 6. Roll DEX + Evasion vs attacker accuracy."},
  alert:     {attr:"insight",   desc:"Detect threats, avoid surprise.",     combat:"Roll INS + Alert vs foe's stealth."},
  athletic:  {attr:"strength",  desc:"Running, climbing, swimming.",        combat:"Roll STR or DEX + Athletic for physical feats."},
  nature:    {attr:"insight",   desc:"Interact with wild Pokémon.",         combat:"Roll INS + Nature to calm or influence Pokémon."},
  stealth:   {attr:"dexterity", desc:"Move silently, set ambushes.",        combat:"Roll DEX + Stealth vs target Alert."},
  etiquette: {attr:"insight",   desc:"Social protocol and persuasion.",     combat:"Roll INS + Etiquette to negotiate."},
  intimidate:{attr:"strength",  desc:"Frighten or coerce others.",          combat:"Roll STR + Intimidate. 3+ succ: target Flinches."},
  perform:   {attr:"special",   desc:"Entertain, distract, or dazzle.",     combat:"Roll SPC + Perform. Success: target −2 dice."},
  capture:   {attr:"special",   desc:"Throw Pokéballs accurately.",         combat:"Roll SPC/DEX + Capture (Channel)."},
};

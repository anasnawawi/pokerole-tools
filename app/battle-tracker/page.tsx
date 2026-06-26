"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
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
interface StatMod{source:string;attr:string;amount:number;}
interface AbilityState{name:string;active:boolean;}
interface BattleEntry{
  id:string; pokemon:PokemonEntry; nickname:string;
  initiative:number; currentHp:number; maxHp:number; currentWill:number; maxWill:number;
  loyalty:number; happiness:number;
  status:string; statusTurnsLeft:number;
  notes:string; isExpanded:boolean; hasTakenTurn:boolean;
  side:"player"|"enemy"|"neutral"; trainerRank:Rank;
  abilities:AbilityState[]; moves:Move[];
  attrs:AttrSet; statMods:StatMod[];
  weatherImmune:boolean; actionCount:number;
  reactionUsed:boolean;           // 1 reaction per round (Clash/Evasion)
  linkedTrainerId?:string; showTrainerView?:boolean;
  morphedTo?:PokemonEntry;        // Transform: copied target's pokemon
  hasSubstitute?:boolean;         // Substitute up
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function TypeBadge({type,small}:{type:PokemonType;small?:boolean}){
  return <span style={{display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 7px",borderRadius:3,fontSize:small?9:11,fontWeight:700,color:"#fff",background:TYPE_COLORS[type]||"#555"}}>{type}</span>;
}
function rollDice(n:number):{rolls:number[];successes:number}{
  const p=Math.max(1,n);
  const rolls=Array.from({length:p},()=>Math.floor(Math.random()*6)+1);
  return{rolls,successes:rolls.filter(r=>r>=4).length};
}
function HpBar({cur,max}:{cur:number;max:number}){
  const pct=max>0?Math.max(0,Math.min(1,cur/max)):0;
  return <div style={{background:"#0f1117",borderRadius:3,height:5,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:pct>0.5?"#00d4aa":pct>0.25?"#ffd32a":"#ff4757",transition:"width 0.3s"}}/></div>;
}
const adjBtn:React.CSSProperties={width:20,height:20,background:"#1a1d27",border:"1px solid #3a4060",borderRadius:3,color:"#00d4aa",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center"};

function getEffectiveAttrs(e:BattleEntry):AttrSet{
  const sc=STATUS_CONDITIONS[e.status];const accPen=sc?.accuracyPenalty??0;
  const mods=e.statMods.reduce<Partial<AttrSet>>((acc,m)=>{const k=m.attr as keyof AttrSet;if(k in e.attrs)acc[k]=(acc[k]??e.attrs[k])+m.amount;return acc;},{});
  return{strength:Math.max(0,mods.strength??e.attrs.strength),dexterity:Math.max(0,(mods.dexterity??e.attrs.dexterity)-accPen),vitality:Math.max(0,mods.vitality??e.attrs.vitality),special:Math.max(0,mods.special??e.attrs.special),insight:Math.max(0,mods.insight??e.attrs.insight)};
}

function calcAccPool(move:Move,attrs:AttrSet):number{
  const acc=move.accuracy.toLowerCase();let p=0;
  if(acc.includes("strength"))p+=attrs.strength;
  if(acc.includes("dexterity"))p+=attrs.dexterity;
  if(acc.includes("special"))p+=attrs.special;
  if(acc.includes("insight"))p+=attrs.insight;
  if(acc.includes("vitality"))p+=attrs.vitality;
  p+=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
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
}

function getTypeMult(mt:PokemonType,dts:PokemonType[]):{label:string;color:string;mod:number}{
  let w=false,r=false,i=false;
  dts.forEach(dt=>{const c=TYPE_CHART[dt];if(c?.weaknesses?.includes(mt))w=true;if(c?.resistances?.includes(mt))r=true;if(c?.immunities?.includes(mt))i=true;});
  if(i)return{label:"Immune",color:"#5a6080",mod:-999};
  if(w)return{label:"Super Effective ×2",color:"#ff4757",mod:2};
  if(r)return{label:"Not very effective ×0.5",color:"#00d4aa",mod:-1};
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
    else if(n==="Guts"&&isP&&entry.status!=="Healthy"){res.bonus+=2;res.reasons.push(`Guts +2 (${entry.status})`);}
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

function moveTargetsSelf(move:Move):boolean{
  const e=move.effect.toLowerCase();
  return e.includes("target self")||e.includes("targets self")||e.includes("user only")||
         (e.includes("user")&&(e.includes("increase")&&!e.includes("foe")))||
         move.name==="Self-Destruct"||move.name==="Explosion"||
         (e.includes("self")&&(e.includes("defense")||e.includes("special")||e.includes("evasion")));
}
function moveSelfDestructsAll(move:Move):boolean{
  return move.name==="Self-Destruct"||move.name==="Explosion"||move.effect.toLowerCase().includes("self-destructs");
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
function ClashSection({attacker,targets,allEntries,move,attrs,weather,stab,abilBonus,loyalty,happiness,onApplyDmg}:{
  attacker:BattleEntry;targets:string[];allEntries:BattleEntry[];move:Move;
  attrs:AttrSet;weather:WeatherData;stab:boolean;abilBonus:number;loyalty:number;happiness:number;
  onApplyDmg:(id:string,dmg:number)=>void;
}){
  const [atkRoll,setAtkRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [defMoves,setDefMoves]=useState<Record<string,Move>>({});
  const [defRolls,setDefRolls]=useState<Record<string,{rolls:number[];successes:number}>>({});
  const [resolved,setResolved]=useState<string>("");

  const doAtkRoll=()=>setAtkRoll(rollDice(calcAccPool(move,attrs)));
  const pickDefMove=(tid:string,m:Move)=>{
    setDefMoves(p=>({...p,[tid]:m}));
    const t=allEntries.find(e=>e.id===tid);
    if(t){const da=getEffectiveAttrs(t);setDefRolls(p=>({...p,[tid]:rollDice(calcAccPool(m,da))}));}
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
        <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Attacker: {attacker.nickname||attacker.pokemon.name} — {move.name} ({calcAccPool(move,attrs)}d)</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={doAtkRoll} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Attacker ({calcAccPool(move,attrs)}d)</button>
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

// ── Move Popup ────────────────────────────────────────────────────────────────
function MovePopup({move,attacker,allEntries,weather,onClose,onApplyDmg,onApplyEffect,onIncrementAction,onSpendWP,onApplySpecial}:{
  move:Move;attacker:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;
  onClose:()=>void;onApplyDmg:(id:string,dmg:number)=>void;
  onApplyEffect:(id:string,attr:string,amount:number,src:string)=>void;
  onIncrementAction:(id:string,isReaction?:boolean)=>void;
  onSpendWP:(id:string,amount:number)=>void;
  onApplySpecial?:(id:string,u:Partial<BattleEntry>)=>void;
}){
  const [targets,setTargets]=useState<string[]>([]);
  const [accResult,setAccResult]=useState<{rolls:number[];successes:number}|null>(null);
  const [dmgResults,setDmgResults]=useState<Record<string,{rolls:number[];successes:number}>>({});
  const [applied,setApplied]=useState<Set<string>>(new Set());
  // Defender reactions: each target can choose Clash or Evasion as their reaction
  const [defReactions,setDefReactions]=useState<Record<string,{type:"clash"|"evasion";move?:Move;roll?:{rolls:number[];successes:number};resolved?:boolean}>>({});
  const isPriority=(move.priority??0)>0||move.name==="Clash";
  const isTransform=move.name==="Transform"||move.effect.toLowerCase().includes("transform");
  const isSubstitute=move.name==="Substitute"||move.effect.toLowerCase().includes("substitute");
  const [preRollDone,setPreRollDone]=useState<{canAct:boolean;detail:string}|null>(
    attacker.status==="Flinched"?{canAct:false,detail:"Flinched — cannot act this turn."}:
    !(STATUS_CONDITIONS[attacker.status]?.requiresRollToAct)?{canAct:true,detail:""}:null
  );
  const [loyaltyRoll,setLoyaltyRoll]=useState<{rolls:number[];successes:number}|null>(null);

  const attrs=getEffectiveAttrs(attacker);
  const stab=attacker.pokemon.types.includes(move.type as PokemonType);
  const actReq=[1,2,3,4,5][Math.min(attacker.actionCount,4)];
  const abilMods=calcAbilityBonus(attacker,move,weather);
  const accPool=calcAccPool(move,attrs);
  const canAct=preRollDone?.canAct??false;

  // Disobedience: ONLY for player side, and never blocks rolls — just a warning
  const isPlayer=attacker.side==="player";
  const disobedience=isPlayer?getDisobedienceLevel(attacker.pokemon.suggestedRank,attacker.trainerRank):"none";

  // Target detection
  const selfTarget=moveTargetsSelf(move);
  const selfDestruct=moveSelfDestructsAll(move);
  const isAOE=move.effect.toLowerCase().includes("all")||selfDestruct;
  const isClash=(move.name==="Clash"||(move.priority??0)>=6)&&!selfTarget&&!selfDestruct;

  // Target options: self + others based on move type
  const others=allEntries.filter(e=>e.id!==attacker.id&&e.currentHp>0);
  const targetOptions=selfTarget
    ? [attacker,...(selfDestruct?others:[])]  // self (and all others for Self-Destruct)
    : others;

  // Pool breakdown
  const accBreakdown=(()=>{
    const acc=move.accuracy.toLowerCase();const parts:string[]=[];
    if(acc.includes("strength"))parts.push(`STR ${attrs.strength}`);
    if(acc.includes("dexterity"))parts.push(`DEX ${attrs.dexterity}`);
    if(acc.includes("special"))parts.push(`SPC ${attrs.special}`);
    if(acc.includes("insight"))parts.push(`INS ${attrs.insight}`);
    if(acc.includes("vitality"))parts.push(`VIT ${attrs.vitality}`);
    const sk=acc.includes("brawl")?"Brawl":acc.includes("athletic")?"Athletic":acc.includes("channel")?"Channel":acc.includes("perform")?"Perform":acc.includes("clash")?"Clash":"Skill";
    const sv=(acc.includes("brawl")||acc.includes("athletic")||acc.includes("channel")||acc.includes("perform")||acc.includes("clash"))?2:1;
    parts.push(`${sk} ${sv}`);
    const statusPen=STATUS_CONDITIONS[attacker.status]?.accuracyPenalty??0;
    if(statusPen>0)parts.push(`${attacker.status} −${statusPen}`);
    return parts.join(" + ");
  })();

  // Loyalty/happiness in pool
  const loyaltyInPool=move.power.toLowerCase().includes("loyalty")||move.damagePool.toLowerCase().includes("loyalty");
  const happinessInPool=move.power.toLowerCase().includes("happiness")||move.damagePool.toLowerCase().includes("happiness");
  const dmgPool=calcDmgPool(move,attrs,weather,stab,abilMods.bonus,attacker.loyalty,attacker.happiness);

  const toggleTarget=(id:string)=>{
    if(isAOE){
      // Pre-select all on first click if self-destruct
      if(selfDestruct&&targets.length===0){setTargets(targetOptions.map(e=>e.id));return;}
      setTargets(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
    } else {
      setTargets([id]);
    }
  };

  const doPreRoll=()=>{
    const s=attacker.status;
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
    if(tm.mod===2)succ=Math.ceil(succ*1.5);if(tm.mod===-1)succ=Math.max(1,succ-1);
    const finalDmg=Math.max(1,succ-def);
    onApplyDmg(tid,finalDmg);setApplied(p=>new Set([...p,tid]));
    onIncrementAction(attacker.id,isPriority);
    if(!selfDestruct)onClose();
  };

  // Stat effects from effect text — covers Growl, Smokescreen, Flash, Harden, etc.
  const statFx:{attr:string;amount:number;label:string}[]=[];
  const el=move.effect.toLowerCase();
  // Offensive debuffs
  if((el.includes("reduce")&&el.includes("strength"))||(el.includes("lower")&&el.includes("strength"))||(el.includes("strength")&&el.includes("by 1")&&!el.includes("increase")))statFx.push({attr:"strength",amount:-1,label:"Str −1"});
  if((el.includes("reduce")&&el.includes("defense")&&!el.includes("sp."))||(el.includes("defense")&&el.includes("by 1")&&!el.includes("sp.")&&!el.includes("increase")))statFx.push({attr:"vitality",amount:-1,label:"Def −1"});
  if((el.includes("reduce")&&el.includes("sp. def"))||(el.includes("sp. def")&&el.includes("by 1")))statFx.push({attr:"insight",amount:-1,label:"Sp.Def −1"});
  // Accuracy / Evasion — Smokescreen, Flash, Sweet Scent, Sand Attack
  if((el.includes("accuracy")&&(el.includes("reduce")||el.includes("lower")||el.includes("decrease")))||(el.includes("accuracy")&&el.includes("by 1")))statFx.push({attr:"dexterity",amount:-1,label:"Acc −1 (DEX)"});
  if(el.includes("evasion")&&(el.includes("reduce")||el.includes("lower")||el.includes("decrease")))statFx.push({attr:"dexterity",amount:1,label:"Evasion +1 (DEX)"});
  // Positive buffs on self
  if(el.includes("increase")&&(el.includes("defense")||el.includes("vitality"))&&!el.includes("sp."))statFx.push({attr:"vitality",amount:1,label:"Def +1"});
  if(el.includes("increase")&&el.includes("strength"))statFx.push({attr:"strength",amount:1,label:"Str +1"});
  if(el.includes("increase")&&el.includes("dexterity"))statFx.push({attr:"dexterity",amount:1,label:"Dex +1"});
  if(el.includes("increase")&&el.includes("special"))statFx.push({attr:"special",amount:1,label:"Spc +1"});
  if(el.includes("increase")&&el.includes("evasion"))statFx.push({attr:"dexterity",amount:1,label:"Evasion +1"});

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:520,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <TypeBadge type={move.type as PokemonType}/>
          <span style={{fontSize:11,fontWeight:700,color:move.category==="Physical"?"#f08030":move.category==="Special"?"#6890f0":"#78c850",background:move.category==="Physical"?"rgba(240,128,48,0.15)":move.category==="Special"?"rgba(104,144,240,0.15)":"rgba(120,200,80,0.15)",padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          {stab&&<span style={{fontSize:9,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"1px 5px",borderRadius:3,fontWeight:700}}>STAB +1</span>}
          {(move.priority??0)>0&&<span style={{fontSize:9,color:"#00d4aa",background:"rgba(0,212,170,0.12)",padding:"1px 5px",borderRadius:3,fontWeight:700}}>PRIORITY {move.priority}</span>}
          {selfTarget&&<span style={{fontSize:9,color:"#a040a0",background:"rgba(160,64,160,0.12)",padding:"1px 5px",borderRadius:3,fontWeight:700}}>TARGET: SELF</span>}
          {selfDestruct&&<span style={{fontSize:9,color:"#ff4757",background:"rgba(255,71,87,0.12)",padding:"1px 5px",borderRadius:3,fontWeight:700}}>SELF-DESTRUCT</span>}
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:16,color:"#e8eaf0",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:14,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,flex:1}}>
          <p style={{fontSize:12,color:"#8b90a8",lineHeight:1.5,margin:0}}>{move.description}</p>
          <div style={{background:"#13151f",borderRadius:5,padding:"7px 10px",fontSize:11,color:"#e8eaf0"}}><strong style={{color:"#5a6080"}}>Effect: </strong>{move.effect}</div>

          {/* Loyalty/Happiness pool info */}
          {(loyaltyInPool||happinessInPool)&&(
            <div style={{background:"rgba(255,211,42,0.08)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:5,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:"#ffd32a",fontWeight:700,marginBottom:3}}>❤ Loyalty/Happiness Move</div>
              <div style={{fontSize:11,color:"#8b90a8"}}>
                Power formula: {move.power} → {loyaltyInPool?`Loyalty (${attacker.loyalty}) `:""}{happinessInPool?`Happiness (${attacker.happiness})`:""}
              </div>
              <div style={{fontSize:11,color:"#ffd32a",fontWeight:700,marginTop:3}}>Damage pool = {dmgPool}d</div>
            </div>
          )}

          {/* Ability modifiers */}
          {(abilMods.bonus>0||abilMods.reasons.length>0)&&<div style={{background:"rgba(0,212,170,0.06)",border:"1px solid #00d4aa20",borderRadius:5,padding:"8px 10px"}}><div style={{fontSize:10,color:"#00d4aa",fontWeight:700,marginBottom:4}}>Active Ability Modifiers</div>{abilMods.reasons.map((r,i)=><div key={i} style={{fontSize:10,color:"#8b90a8"}}>✦ {r}</div>)}{abilMods.bonus>0&&<div style={{fontSize:11,color:"#00d4aa",fontWeight:700,marginTop:3}}>+{abilMods.bonus} dice to damage pool</div>}</div>}

          {/* Weather */}
          {(weather.typeBoost===move.type||weather.typeWeaken===move.type)&&<div style={{background:"rgba(255,211,42,0.08)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ffd32a"}}>{weather.emoji?.split(" ")[0]} {weather.name}: {weather.typeBoost===move.type?`+${weather.typeBoostDice}d`:`−${weather.typeWeakenDice}d`}</div>}

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
          {attacker.status!=="Healthy"&&attacker.status!=="Flinched"&&(STATUS_CONDITIONS[attacker.status]?.requiresRollToAct)&&(
            <div style={{background:"rgba(168,64,160,0.1)",border:"1px solid #a040a040",borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:700,color:STATUS_CONDITIONS[attacker.status]?.color,marginBottom:4}}>{attacker.status}</div>
              <div style={{fontSize:10,color:"#8b90a8",marginBottom:6}}>{STATUS_CONDITIONS[attacker.status]?.rollToActDesc}</div>
              {!preRollDone&&<button onClick={doPreRoll} style={{background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Pre-Action Check</button>}
              {preRollDone&&<div style={{fontSize:12,fontWeight:700,color:preRollDone.canAct?"#00d4aa":"#ff4757"}}>{preRollDone.detail}</div>}
            </div>
          )}
          {attacker.status==="Flinched"&&<div style={{background:"rgba(192,192,208,0.1)",border:"1px solid #c0c0d040",borderRadius:4,padding:"6px 10px",fontSize:11,color:"#c0c0d0"}}>Flinched — cannot act this turn (clears at end of turn)</div>}

          {/* Target selector — always shown if not pre-roll blocked */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                {selfDestruct?"Select Targets (incl. self — all take damage)":isAOE?"Select Targets (multi-select)":selfTarget?"Select Target (move targets self)":"Select Target"}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {selfDestruct&&<button onClick={()=>setTargets(targetOptions.map(e=>e.id))} style={{padding:"4px 8px",borderRadius:4,fontSize:10,cursor:"pointer",border:"1px solid #ff4757",background:"rgba(255,71,87,0.15)",color:"#ff4757",fontWeight:700}}>Select All</button>}
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

          {/* Type effectiveness */}
          {canAct&&targets.filter(tid=>tid!==attacker.id).map(tid=>{const t=allEntries.find(e=>e.id===tid);if(!t)return null;const tm=getTypeMult(move.type as PokemonType,t.pokemon.types);const def=move.category==="Physical"?t.attrs.vitality:t.attrs.insight;return<div key={tid} style={{background:tm.color+"10",border:`1px solid ${tm.color}30`,borderRadius:4,padding:"6px 10px"}}><div style={{fontSize:11,fontWeight:700,color:tm.color}}>{t.nickname||t.pokemon.name}: {tm.label}</div><div style={{fontSize:10,color:"#8b90a8",marginTop:2}}>DEF: {def} ({move.category==="Physical"?"VIT":"INS"})</div></div>;})}

          {/* Defender Reactions — Clash or Evasion (costs 1 WP per reaction) */}
          {canAct&&targets.filter(tid=>tid!==attacker.id).map(tid=>{
            const t=allEntries.find(e=>e.id===tid);if(!t||move.category==="Support")return null;
            const react=defReactions[tid];
            const hasWP=t.currentWill>=1;
            const reactionUsed=t.reactionUsed;
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
                {react?.type==="clash"&&!react.resolved&&(
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:10,color:"#f08030",marginBottom:6}}>⚡ Clash — {t.nickname||t.pokemon.name} picks counter move:</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                      {t.moves.filter(m=>m.category===move.category||m.priority!=null).map((m,i)=>(
                        <button key={i} onClick={()=>{
                          const da=getEffectiveAttrs(t);
                          const pool=calcAccPool(m,da);
                          const roll=rollDice(pool);
                          setDefReactions(p=>({...p,[tid]:{...p[tid],move:m,roll}}));
                        }} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:3,border:`1px solid ${react.move?.name===m.name?"#f08030":"#3a4060"}`,background:react.move?.name===m.name?"rgba(240,128,48,0.15)":"#13151f",cursor:"pointer",fontSize:10}}>
                          <TypeBadge type={m.type as PokemonType} small/>{m.name}
                        </button>
                      ))}
                    </div>
                    {react.move&&react.roll&&(
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:11,fontFamily:"'Exo 2'",color:"#f08030"}}>{t.nickname||t.pokemon.name} Clash: [{react.roll.rolls.join(",")}]={react.roll.successes} hits</span>
                        <button onClick={()=>{
                          // Resolve clash
                          const atkSucc=accResult?.successes??0;
                          const defSucc=react.roll!.successes;
                          if(defSucc>atkSucc){
                            // Defender wins — deal damage back to attacker
                            const da=getEffectiveAttrs(t);const dm=react.move!;
                            const pool=calcDmgPool(dm,da,weather,t.pokemon.types.includes(dm.type as PokemonType),0,t.loyalty,t.happiness);
                            const dmgR=rollDice(pool);const def=dm.category==="Physical"?attacker.attrs.vitality:attacker.attrs.insight;
                            const finalDmg=Math.max(1,dmgR.successes-def);
                            onApplyDmg(attacker.id,finalDmg);
                            onSpendWP(tid,1);
                            onIncrementAction(tid,true);// reaction
                            alert(`${t.nickname||t.pokemon.name} wins Clash! (${defSucc} vs ${atkSucc}) — ${finalDmg} damage to ${attacker.nickname||attacker.pokemon.name}`);
                          } else if(defSucc===atkSucc){
                            onSpendWP(tid,1);onIncrementAction(tid,true);
                            alert(`Clash Tie (${defSucc} vs ${atkSucc}) — no damage`);
                          } else {
                            onSpendWP(tid,1);onIncrementAction(tid,true);
                            alert(`${attacker.nickname||attacker.pokemon.name} wins Clash (${atkSucc} vs ${defSucc}) — attacker's attack proceeds`);
                          }
                          setDefReactions(p=>({...p,[tid]:{...p[tid],resolved:true}}));
                        }} style={{background:"#f08030",color:"#fff",border:"none",borderRadius:4,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Resolve Clash</button>
                      </div>
                    )}
                  </div>
                )}
                {/* Evasion reaction */}
                {react?.type==="evasion"&&!react.resolved&&(()=>{
                  const da=getEffectiveAttrs(t);
                  const evasPool=da.dexterity+(t.abilities.find(a=>a.active&&a.name==="Evasion")||{name:"",active:false}?0:0)+2;
                  return(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:10,color:"#6890f0",marginBottom:6}}>💨 Evasion — {t.nickname||t.pokemon.name} rolls DEX + Evasion vs attacker accuracy</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <button onClick={()=>{
                          const pool=Math.max(1,da.dexterity+2);
                          const roll=rollDice(pool);
                          setDefReactions(p=>({...p,[tid]:{...p[tid],roll}}));
                        }} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          🎲 Roll Evasion ({Math.max(1,(getEffectiveAttrs(t).dexterity)+2)}d)
                        </button>
                        {react.roll&&(
                          <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:react.roll.successes>=(accResult?.successes??0)?"#00d4aa":"#ff4757"}}>
                            [{react.roll.rolls.join(",")}]={react.roll.successes} {react.roll.successes>=(accResult?.successes??0)?"✓ DODGED":"✗ Hit anyway"}
                          </span>
                        )}
                        {react.roll&&<button onClick={()=>{onSpendWP(tid,1);onIncrementAction(tid,true);setDefReactions(p=>({...p,[tid]:{...p[tid],resolved:true}}));}} style={{background:"#6890f0",color:"#fff",border:"none",borderRadius:4,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Apply (−1 WP)</button>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Accuracy */}
          {canAct&&(
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>1. Accuracy — {move.accuracy} · Need {actReq}+</div>
              <div style={{fontSize:10,color:"#5a6080",marginBottom:6,fontStyle:"italic"}}>Pool: {accBreakdown} = <strong style={{color:accPool<actReq?"#ff4757":"#6890f0"}}>{accPool}d</strong></div>
              {accPool<=0&&<div style={{background:"rgba(255,71,87,0.12)",border:"1px solid #ff475740",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757",marginBottom:6}}>⚠ Dice pool is 0 — cannot roll. Action is impossible.</div>}
              {accPool>0&&accPool<actReq&&<div style={{background:"rgba(255,71,87,0.08)",border:"1px solid #ff475730",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757",marginBottom:6}}>⚠ Pool ({accPool}d) is less than required hits ({actReq}) — success is very unlikely.</div>}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setAccResult(rollDice(accPool))} disabled={accPool<=0} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:accPool<=0?"#5a6080":"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:accPool<=0?"default":"pointer"}}>🎲 Roll Accuracy ({accPool}d)</button>
                {accResult&&<span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:accResult.successes>=actReq?"#00d4aa":"#ff4757"}}>[{accResult.rolls.join(",")}]={accResult.successes} {accResult.successes>=actReq?"✓ HIT":"✗ MISS"}</span>}
              </div>
            </div>
          )}

          {/* Clash */}
          {canAct&&isClash&&targets.length>0&&(
            <ClashSection attacker={attacker} targets={targets} allEntries={allEntries} move={move} attrs={attrs} weather={weather} stab={stab} abilBonus={abilMods.bonus} loyalty={attacker.loyalty} happiness={attacker.happiness} onApplyDmg={onApplyDmg}/>
          )}

          {/* Damage (non-clash) */}
          {canAct&&accResult&&accResult.successes>=actReq&&move.category!=="Support"&&!isClash&&targets.map(tid=>{
            const isSelf=tid===attacker.id;
            const t=isSelf?attacker:allEntries.find(e=>e.id===tid);if(!t)return null;
            const tm=isSelf?{label:"Self",color:"#a040a0",mod:0}:getTypeMult(move.type as PokemonType,t.pokemon.types);
            const def=isSelf?0:(move.category==="Physical"?t.attrs.vitality:t.attrs.insight);
            const dr=dmgResults[tid];
            const finalDmg=dr?isSelf?dr.successes:Math.max(1,(tm.mod===2?Math.ceil(dr.successes*1.5):tm.mod===-1?Math.max(1,dr.successes-1):dr.successes)-def):null;
            const wasApplied=applied.has(tid);
            return<div key={tid} style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>2. Damage → {isSelf?"SELF":t.nickname||t.pokemon.name} ({dmgPool}d)</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <button onClick={()=>doDmg(tid)} disabled={!!dr} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:dr?"#5a6080":"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:dr?"default":"pointer"}}>🎲 Roll Damage ({dmgPool}d)</button>
                {dr&&<span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{dr.rolls.join(",")}]={dr.successes}</span>}
              </div>
              {dr&&tm.mod!==-999&&<div>
                <div style={{fontSize:11,color:"#8b90a8",marginBottom:6}}>{isSelf?dr.successes:`${dr.successes}${tm.mod===2?" ×2 SE":tm.mod===-1?" ×0.5 NVE":""} − ${def} DEF`} = <strong style={{color:"#ff4757"}}>{finalDmg} damage</strong></div>
                {!wasApplied&&<button onClick={()=>applyDmg(tid)} style={{width:"100%",background:isSelf?"#a040a0":"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>⚔ Apply {finalDmg} to {isSelf?"SELF":t.nickname||t.pokemon.name}</button>}
                {wasApplied&&<div style={{textAlign:"center",color:"#00d4aa",fontWeight:700}}>✓ Applied</div>}
              </div>}
            </div>;
          })}

          {/* Stat/accuracy changes — Growl, Smokescreen, Flash, Harden, etc. */}
          {canAct&&(accResult?.successes??0)>=actReq&&statFx.length>0&&(targets.length>0||selfTarget)&&(
            <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>
                {move.category==="Support"?"Effects on Success":"Stat Changes on Hit"}
              </div>
              {statFx.map((se,i)=>{
                const applyTargets=selfTarget?[attacker.id]:targets;
                return applyTargets.map(tid=>{
                  const isSelf=tid===attacker.id;
                  const t=isSelf?attacker:allEntries.find(e=>e.id===tid);
                  return<button key={`${i}-${tid}`} onClick={()=>onApplyEffect(tid,se.attr,se.amount,move.name)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",background:se.amount<0?"rgba(255,71,87,0.1)":"rgba(0,212,170,0.1)",border:`1px solid ${se.amount<0?"#ff475730":"#00d4aa30"}`,color:se.amount<0?"#ff4757":"#00d4aa",fontSize:11,fontWeight:700,width:"100%",marginBottom:3}}>
                    {se.amount>0?"▲":"▼"} {se.label} → {isSelf?"SELF":t?.nickname||t?.pokemon.name}
                  </button>;
                });
              })}
            </div>
          )}

          {/* Transform — copy target's pokemon stats/type/moves */}
          {canAct&&(accResult?.successes??0)>=actReq&&isTransform&&targets.filter(t=>t!==attacker.id).length>0&&onApplySpecial&&(
            <div style={{background:"rgba(160,64,160,0.08)",border:"1px solid #a040a040",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#a040a0",marginBottom:6}}>🔄 Transform</div>
              <div style={{fontSize:10,color:"#8b90a8",marginBottom:8}}>Copies target's type, attributes and moves. Use 🐾/👤 toggle on the card to switch between true form and copy.</div>
              {targets.filter(t=>t!==attacker.id).map(tid=>{
                const t=allEntries.find(e=>e.id===tid);if(!t)return null;
                return<button key={tid} onClick={()=>{onApplySpecial!(attacker.id,{morphedTo:t.pokemon,moves:t.moves.slice(0,4),attrs:{...t.attrs}});onIncrementAction(attacker.id,false);onClose();}} style={{width:"100%",background:"#a040a0",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer",marginTop:3}}>
                  🔄 Transform into {t.nickname||t.pokemon.name}
                </button>;
              })}
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
  const statusBonus=target&&target.status!=="Healthy"?1:0;
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
              <span style={{color:"#5a6080",marginLeft:10}}>Status: </span><strong style={{color:"#a040a0"}}>{target.status}</strong>
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
    if(e.status==="Burned")effects.push({entry:e,desc:"Burn −1 HP",hp:-1});
    if(e.status==="Poisoned")effects.push({entry:e,desc:"Poison −1 HP",hp:-1});
    if(e.status==="Badly Poisoned")effects.push({entry:e,desc:"Bad Poison −2 HP",hp:-2});
    if(weather.endOfRoundDmg&&!e.weatherImmune&&!(weather.immuneTypes??[]).some((t:string)=>e.pokemon.types.includes(t as PokemonType)))effects.push({entry:e,desc:`${weather.name} chip`,hp:-weather.endOfRoundDmg});
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
function PriorityPopup({entries,onClose}:{entries:BattleEntry[];onClose:()=>void;}){
  const pri=useMemo(()=>{const r:{entry:BattleEntry;move:Move}[]=[];entries.filter(e=>e.currentHp>0).forEach(e=>{const pm=e.moves.filter(m=>(m.priority??0)>0);if(pm.length>0)r.push({entry:e,move:pm.sort((a,b)=>(b.priority??0)-(a.priority??0))[0]});});return r.sort((a,b)=>(b.move.priority??0)-(a.move.priority??0));},[entries]);
  if(pri.length===0)return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"2px solid #00d4aa40",borderRadius:10,width:460,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:"#00d4aa",margin:0}}>⚡ Priority Phase</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button></div>
        <div style={{padding:16,overflowY:"auto"}}>
          <p style={{fontSize:11,color:"#8b90a8",marginBottom:12}}>Declare before normal turn order. Highest priority first.</p>
          {pri.map(({entry,move})=><div key={entry.id} style={{background:"#13151f",border:`1px solid ${TYPE_COLORS[move.type as PokemonType]||"#2a2f45"}30`,borderRadius:6,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}><div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#e8eaf0"}}>{entry.nickname||entry.pokemon.name}</div><div style={{display:"flex",gap:6,alignItems:"center",marginTop:3}}><TypeBadge type={move.type as PokemonType} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{move.name}</span><span style={{fontSize:10,fontWeight:700,color:"#00d4aa"}}>P{move.priority}</span></div></div><span style={{fontSize:11,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span></div>)}
          <button onClick={onClose} style={{width:"100%",background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>Continue ▶</button>
        </div>
      </div>
    </div>
  );
}

// ── Battle Card (HORIZONTAL COLUMN) ──────────────────────────────────────────
/* ── Move Edit with Search ───────────────────────────────────────────────────── */
function MoveSearchEdit({entry,onUpdate}:{entry:BattleEntry;onUpdate:(u:Partial<BattleEntry>)=>void}){
  const [q,setQ]=useState("");
  const filtered=useMemo(()=>{
    if(!q)return entry.pokemon.moves.map(pm=>MOVES.find(m=>m.name===pm.name)).filter(Boolean) as Move[];
    const ql=q.toLowerCase();
    return MOVES.filter(m=>m.name.toLowerCase().includes(ql)||m.type.toLowerCase().includes(ql)).slice(0,80);
  },[q,entry.pokemon.moves]);
  return(
    <div>
      <input type="text" placeholder="Search all 894 moves…" value={q} onChange={e=>setQ(e.target.value)}
        style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,padding:"3px 6px",color:"#e8eaf0",fontSize:10,marginBottom:5,outline:"none"}}/>
      <div style={{maxHeight:150,overflowY:"auto"}}>
        {filtered.map(m=>{const has=entry.moves.some(em=>em.name===m.name);return(
          <div key={m.name} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 0"}}>
            <input type="checkbox" checked={has} onChange={()=>onUpdate({moves:has?entry.moves.filter(em=>em.name!==m.name):[...entry.moves,m]})}/>
            <TypeBadge type={m.type as PokemonType} small/><span style={{fontSize:9,color:"#e8eaf0"}}>{m.name}</span>
            {(m.priority??0)>0&&<span style={{fontSize:7,color:"#00d4aa"}}>P{m.priority}</span>}
          </div>
        );})}
        {filtered.length===0&&q&&<div style={{fontSize:9,color:"#5a6080",fontStyle:"italic"}}>No moves match "{q}"</div>}
        {!q&&<div style={{fontSize:9,color:"#5a6080",paddingTop:4,fontStyle:"italic"}}>Pokémon's learnable moves shown. Type to search all 894.</div>}
      </div>
    </div>
  );
}

/* ── Trainer Skills Inline ───────────────────────────────────────────────────── */
function TrainerSkillsInline({trainer,entry,allEntries,onSpendWP,onIncrementAction}:{
  trainer:any;entry:BattleEntry;allEntries:BattleEntry[];
  onSpendWP:(id:string,amt:number)=>void;onIncrementAction:(id:string,isReaction?:boolean)=>void;
}){
  const [selSkill,setSelSkill]=useState<string|null>(null);
  const [roll,setRoll]=useState<{rolls:number[];successes:number}|null>(null);
  const [targets,setTargets]=useState<string[]>([]);
  const attrs=trainer?.attributes||{strength:1,dexterity:1,vitality:1,insight:1};
  const standardSkills=trainer?.skills||{};
  const customSkills:Record<string,number>=Object.fromEntries((trainer?.customSkills||[]).map((cs:any)=>[cs.name,cs.points]));
  const skills={...standardSkills,...customSkills};
  const others=allEntries.filter(e=>e.id!==entry.id&&e.currentHp>0);
  const av=(k:string)=>(attrs as any)[k]??1;
  const actReq=[1,2,3,4,5][Math.min(entry.actionCount,4)];
  const allSkillEntries=Object.entries(skills).filter(([,v])=>(v as number)>0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <div style={{fontSize:8,color:"#3d8bff",letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>
        👤 {trainer.name} — {trainer.rank}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2,marginBottom:5}}>
        {[["STR","strength"],["DEX","dexterity"],["VIT","vitality"],["INS","insight"]].map(([l,k])=>(
          <div key={k} style={{textAlign:"center",background:"#0f1117",borderRadius:2,padding:"2px 0"}}>
            <div style={{fontSize:7,color:"#5a6080"}}>{l}</div>
            <div style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:"#3d8bff"}}>{av(k)}</div>
          </div>
        ))}
      </div>
      {allSkillEntries.map(([sk,v])=>{
        const def=TRAINER_SKILL_DEFS[sk];
        const pool=def?av(def.attr)+(v as number):(v as number);
        const isSel=selSkill===sk;
        return(
          <div key={sk}>
            <button onClick={()=>{setSelSkill(isSel?null:sk);setRoll(null);setTargets([]);}} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",background:isSel?"rgba(61,139,255,0.15)":"#13151f",border:`1px solid ${isSel?"#3d8bff":"#3d8bff20"}`,borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%"}}>
              <span style={{fontSize:9,color:"#3d8bff",background:"rgba(61,139,255,0.1)",padding:"1px 5px",borderRadius:2,textTransform:"capitalize",flexShrink:0}}>{sk}</span>
              <span style={{fontSize:10,color:"#e8eaf0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{def?.desc||sk}</span>
              <span style={{fontSize:9,color:"#3d8bff",fontFamily:"'Exo 2'",fontWeight:700,flexShrink:0}}>{pool}d</span>
              <span style={{fontSize:8,color:"#5a6080",flexShrink:0}}>▶</span>
            </button>
            {isSel&&(
              <div style={{background:"#0f1117",borderRadius:"0 0 4px 4px",padding:"6px 8px",border:"1px solid #3d8bff20",borderTop:"none",marginTop:-1}}>
                {def&&<div style={{fontSize:9,color:"#8b90a8",marginBottom:5,lineHeight:1.4}}>{def.combat}</div>}
                {others.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:5}}>
                  {others.map(t=><button key={t.id} onClick={()=>setTargets(p=>p.includes(t.id)?p.filter(x=>x!==t.id):[...p,t.id])} style={{padding:"2px 6px",borderRadius:3,fontSize:9,cursor:"pointer",border:`1px solid ${targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,background:targets.includes(t.id)?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",color:targets.includes(t.id)?"#e8eaf0":"#8b90a8"}}>{t.nickname||t.pokemon.name}</button>)}
                </div>}
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <button onClick={()=>setRoll(rollDice(Math.max(1,pool)))} style={{background:"#3d8bff20",border:"1px solid #3d8bff50",borderRadius:3,color:"#3d8bff",padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🎲 Roll {sk} ({pool}d)</button>
                  {roll&&<span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:roll.successes>=actReq?"#00d4aa":"#ff4757"}}>[{roll.rolls.join(",")}]={roll.successes} {roll.successes>=actReq?"✓ Success":"✗ Fail"} (need {actReq})</span>}
                  {roll&&roll.successes>=actReq&&<button onClick={()=>{onIncrementAction(entry.id);setRoll(null);setSelSkill(null);}} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:3,padding:"3px 6px",fontSize:9,fontWeight:700,cursor:"pointer"}}>+Action</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {allSkillEntries.length===0&&<div style={{fontSize:9,color:"#5a6080",fontStyle:"italic"}}>No skills trained. Add them in Character Creator.</div>}
    </div>
  );
}

function BattleCard({entry,allEntries,weather,isActive,onUpdate,onRemove,onDragStart,onDragOver,onDrop}:{
  entry:BattleEntry;allEntries:BattleEntry[];weather:WeatherData;isActive:boolean;
  onUpdate:(id:string,u:Partial<BattleEntry>)=>void;onRemove:(id:string)=>void;
  onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:()=>void;
}){
  const [movePopup,setMovePopup]=useState<Move|null>(null);
  const [showEditMoves,setShowEditMoves]=useState(false);
  const [showCapture,setShowCapture]=useState(false);
  const [showTrainerSkills,setShowTrainerSkills]=useState(false);
  const upd=(u:Partial<BattleEntry>)=>onUpdate(entry.id,u);
  const sc=STATUS_CONDITIONS[entry.status];
  const sideColor={player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[entry.side];
  const painPenalty=getPainPenalty(entry.currentHp,entry.maxHp);
  const linkedTrainer=useMemo(()=>{if(!entry.linkedTrainerId)return null;return loadFromStorage<any[]>("trainers",[]).find((t:any)=>t.id===entry.linkedTrainerId)||null;},[entry.linkedTrainerId]);
  const attrModSummary=(attr:keyof AttrSet)=>entry.statMods.filter(m=>m.attr===attr).reduce((s,m)=>s+m.amount,0);
  const applyDmg=(tid:string,dmg:number)=>{const t=allEntries.find(e=>e.id===tid)||entry;onUpdate(t.id,{currentHp:Math.max(0,t.currentHp-dmg)});};
  const applyEffect=(tid:string,attr:string,amount:number,src:string)=>{const t=allEntries.find(e=>e.id===tid);if(!t)return;const nm=[...t.statMods];const idx=nm.findIndex(m=>m.attr===attr&&m.source===src);if(idx>=0)nm[idx].amount+=amount;else nm.push({source:src,attr,amount});onUpdate(tid,{statMods:nm});};
  const incrementAction=(id:string,isReaction?:boolean)=>{
    const t=allEntries.find(e=>e.id===id)||entry;
    if(isReaction){onUpdate(id,{reactionUsed:true});}
    else{onUpdate(id,{actionCount:Math.min(4,(allEntries.find(e=>e.id===id)||entry).actionCount+1)});}
  };
  const spendWP=(id:string,amt:number)=>{const t=allEntries.find(e=>e.id===id)||entry;onUpdate(id,{currentWill:Math.max(0,t.currentWill-amt)});};

  return(
    <>
      {movePopup&&<MovePopup move={movePopup} attacker={entry} allEntries={allEntries} weather={weather} onClose={()=>setMovePopup(null)} onApplyDmg={applyDmg} onApplyEffect={applyEffect} onIncrementAction={incrementAction} onSpendWP={spendWP} onApplySpecial={(id,u)=>onUpdate(id,u)}/>}
      {showCapture&&<CapturePopup allEntries={allEntries} defaultTargetId={entry.id} onClose={()=>setShowCapture(false)}/>}
      {showTrainerSkills&&linkedTrainer&&<TrainerSkillPopup trainerData={linkedTrainer} entry={entry} allEntries={allEntries} onClose={()=>setShowTrainerSkills(false)}/>}

      {/* HORIZONTAL CARD — fixed width column */}
      <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
        style={{width:280,flexShrink:0,background:entry.hasTakenTurn?"#13151f":"#1e2235",border:`2px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor+"50"}`,borderRadius:8,display:"flex",flexDirection:"column",opacity:entry.hasTakenTurn&&!isActive?0.65:1,boxShadow:isActive?`0 0 0 2px ${sideColor}40,0 4px 20px rgba(0,0,0,0.4)`:undefined,cursor:"default"}}>

        {/* Card header */}
        <div style={{padding:"6px 8px",background:isActive?sideColor+"18":"#0f1117",borderRadius:"6px 6px 0 0",display:"flex",alignItems:"center",gap:5}}>
          <span style={{color:"#3a4060",cursor:"grab",fontSize:11,flexShrink:0}}>⠿</span>
          <button onClick={()=>upd({hasTakenTurn:!entry.hasTakenTurn})} style={{width:16,height:16,borderRadius:"50%",border:"none",background:entry.hasTakenTurn?"#00d4aa":"#2a2f45",color:entry.hasTakenTurn?"#0f1117":"#5a6080",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✓</button>
          <div style={{width:7,height:7,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
          <input value={entry.nickname} onChange={e=>upd({nickname:e.target.value})} placeholder={entry.pokemon.name}
            style={{flex:1,background:"transparent",border:"none",color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700,fontSize:12,outline:"none",minWidth:0}}/>
          {isActive&&<span style={{fontSize:8,fontWeight:700,color:sideColor,background:sideColor+"20",padding:"1px 4px",borderRadius:2,flexShrink:0}}>ACTIVE</span>}
          <button onClick={()=>upd({isExpanded:!entry.isExpanded})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:10,flexShrink:0}}>{entry.isExpanded?"▲":"▼"}</button>
          <button onClick={()=>onRemove(entry.id)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:11,flexShrink:0}}>✕</button>
        </div>

        {/* HP + WP bars */}
        <div style={{padding:"5px 8px 3px",background:"#0f1117"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
            <span style={{fontSize:9,color:"#5a6080"}}>HP</span>
            <span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span>
          </div>
          <HpBar cur={entry.currentHp} max={entry.maxHp}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,marginBottom:2}}>
            <span style={{fontSize:9,color:"#5a6080"}}>WP</span>
            <span style={{fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,color:"#6890f0"}}>{entry.currentWill}/{entry.maxWill}</span>
          </div>
          <div style={{background:"#0f1117",borderRadius:3,height:4,overflow:"hidden"}}><div style={{width:`${entry.maxWill>0?Math.max(0,Math.min(1,entry.currentWill/entry.maxWill))*100:0}%`,height:"100%",background:"#6890f0",transition:"width 0.3s"}}/></div>
        </div>

        {/* Quick stats row */}
        <div style={{padding:"4px 8px",background:"#13151f",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <span style={{fontSize:8,color:"#5a6080"}}>INI</span>
            <input type="number" value={entry.initiative} onChange={e=>upd({initiative:+e.target.value})} style={{width:24,background:"transparent",border:"none",color:"#6890f0",fontSize:10,fontFamily:"'Exo 2'",fontWeight:700,textAlign:"center",outline:"none"}}/>
          </div>
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})} style={{background:"#0f1117",border:"none",color:sideColor,fontSize:8,borderRadius:2,padding:"1px 2px"}}>
            <option value="player">Player</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option>
          </select>
          {entry.pokemon.types.map(t=><span key={t} style={{fontSize:8,fontWeight:700,color:TYPE_COLORS[t as PokemonType],background:TYPE_COLORS[t as PokemonType]+"20",padding:"0 3px",borderRadius:2}}>{t}</span>)}
          {entry.side==="enemy"&&<button onClick={()=>setShowCapture(true)} style={{marginLeft:"auto",background:"none",border:"none",color:"#ffd32a",cursor:"pointer",fontSize:11,padding:0}}>🎯</button>}
          {linkedTrainer&&<button onClick={()=>upd({showTrainerView:!entry.showTrainerView})} style={{background:entry.showTrainerView?"rgba(61,139,255,0.25)":"rgba(61,139,255,0.1)",border:`1px solid ${entry.showTrainerView?"#3d8bff":"#3d8bff30"}`,borderRadius:3,color:"#3d8bff",cursor:"pointer",fontSize:9,padding:"1px 5px"}} title={entry.showTrainerView?"Switch to Pokémon":"Switch to Trainer"}>{entry.showTrainerView?"🐾 Pokémon":"👤 Trainer"}</button>}
        </div>

        {/* Loyalty/Happiness */}
        <div style={{padding:"4px 8px",background:"#0f1117",display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <span style={{fontSize:8,color:"#ffd32a"}}>❤ Loyalty</span>
            <div style={{display:"flex",gap:1}}>{[0,1,2,3,4].map(i=><button key={i} onClick={()=>upd({loyalty:i===entry.loyalty?0:i+1})} style={{width:10,height:10,borderRadius:"50%",border:"none",cursor:"pointer",background:i<entry.loyalty?"#ffd32a":"#2a2f45",padding:0}}/>)}</div>
            <span style={{fontSize:8,color:"#ffd32a",fontFamily:"'Exo 2'",fontWeight:700}}>{entry.loyalty}</span>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <span style={{fontSize:8,color:"#f85888"}}>♡ Happy</span>
            <div style={{display:"flex",gap:1}}>{[0,1,2,3,4].map(i=><button key={i} onClick={()=>upd({happiness:i===entry.happiness?0:i+1})} style={{width:10,height:10,borderRadius:"50%",border:"none",cursor:"pointer",background:i<entry.happiness?"#f85888":"#2a2f45",padding:0}}/>)}</div>
            <span style={{fontSize:8,color:"#f85888",fontFamily:"'Exo 2'",fontWeight:700}}>{entry.happiness}</span>
          </div>
        </div>

        {/* Status */}
        <div style={{padding:"3px 8px",background:"#0f1117",display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
          <select value={entry.status} onChange={e=>upd({status:e.target.value,statusTurnsLeft:e.target.value==="Asleep"?3:0})} style={{background:"#13151f",border:`1px solid ${sc?.color??"#2a2f45"}`,borderRadius:3,color:sc?.color??"#5a6080",fontSize:9,padding:"1px 3px",fontWeight:700}}>{Object.keys(STATUS_CONDITIONS).map(s=><option key={s} value={s}>{s}</option>)}</select>
          {painPenalty>0&&<span style={{fontSize:8,color:"#ff4757",background:"rgba(255,71,87,0.1)",padding:"0 4px",borderRadius:2}}>Pain −{painPenalty}d</span>}
          {!entry.weatherImmune&&weather.name!=="Clear"&&<span style={{fontSize:8,color:"#ffd32a"}}>{weather.emoji?.split(" ")[0]}</span>}
          {entry.status==="Asleep"&&entry.statusTurnsLeft>0&&<span style={{fontSize:8,color:"#705898"}}>⏱{entry.statusTurnsLeft}</span>}
        </div>

        {/* Action economy */}
        <div style={{padding:"3px 8px",background:"#0f1117",display:"flex",gap:3,alignItems:"center"}}>
          <span style={{fontSize:8,color:"#5a6080",flexShrink:0}}>Act:</span>
          {[0,1,2,3,4].map(i=><button key={i} onClick={()=>upd({actionCount:entry.actionCount===i+1?i:i+1})} style={{width:16,height:16,borderRadius:3,border:`1px solid ${i<entry.actionCount?"#f08030":"#3a4060"}`,background:i<entry.actionCount?"#f0803020":"transparent",cursor:"pointer",fontSize:7,color:i<entry.actionCount?"#f08030":"#5a6080",fontWeight:700}}>{i+1}</button>)}
          {entry.actionCount>0&&<span style={{fontSize:7,color:"#ff4757"}}>→{Math.min(entry.actionCount+1,5)}+</span>}
        </div>

        {/* Moves list */}
        <div style={{padding:"5px 8px",flex:1,display:"flex",flexDirection:"column",gap:3,minHeight:0}}>
          {/* TRAINER VIEW: show trainer skills like moves */}
          {entry.showTrainerView&&linkedTrainer?(
            <TrainerSkillsInline trainer={linkedTrainer} entry={entry} allEntries={allEntries} onSpendWP={spendWP} onIncrementAction={incrementAction}/>
          ):(
            <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
              <span style={{fontSize:8,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase"}}>{entry.morphedTo?"🔄 Transformed":"Moves"}{entry.hasSubstitute?" 🛡️ Sub":""}</span>
              <div style={{display:"flex",gap:4}}>
                {entry.morphedTo&&<button onClick={()=>upd({morphedTo:undefined})} style={{fontSize:7,color:"#a040a0",background:"none",border:"1px solid #a040a040",borderRadius:2,cursor:"pointer",padding:"0 4px"}}>Revert</button>}
                <button onClick={()=>setShowEditMoves(!showEditMoves)} style={{fontSize:8,color:"#00d4aa",background:"none",border:"none",cursor:"pointer"}}>{showEditMoves?"Done":"Edit"}</button>
              </div>
            </div>
            {showEditMoves?(
              <MoveSearchEdit entry={entry} onUpdate={upd}/>
            ):(
              <>
                {(entry.morphedTo||entry.pokemon).moves.slice(0,4).filter(pm=>!entry.moves.some(em=>em.name===pm.name)).map((pm,i)=>({...MOVES.find(m=>m.name===pm.name)||{name:pm.name,type:pm.type,category:"Physical" as const,power:"-",accuracy:"-",damagePool:"-",effect:"",description:""},_learnset:true})).concat(entry.moves as any[]).map((m:any,i:number)=>{
                  const stab=(entry.morphedTo||entry.pokemon).types.includes(m.type as PokemonType);
                  const abilMods=calcAbilityBonus(entry,m,weather);
                  return(
                    <button key={i} onClick={()=>setMovePopup(m)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",background:m._learnset?"#0f1117":"#13151f",border:`1px solid ${TYPE_COLORS[m.type as PokemonType]||"#2a2f45"}30`,borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%",opacity:m._learnset?0.7:1}}
                      onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type as PokemonType]||"#00d4aa"}
                      onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=`${TYPE_COLORS[m.type as PokemonType]||"#2a2f45"}30`}>
                      <TypeBadge type={m.type as PokemonType} small/>
                      <span style={{fontSize:11,color:"#e8eaf0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
                      {stab&&<span style={{fontSize:7,color:"#ffd32a",fontWeight:700,flexShrink:0}}>STAB</span>}
                      {(m.priority??0)>0&&<span style={{fontSize:7,color:"#00d4aa",fontWeight:700,flexShrink:0}}>P{m.priority}</span>}
                      {abilMods.bonus>0&&<span style={{fontSize:7,color:"#00d4aa",flexShrink:0}}>+{abilMods.bonus}</span>}
                      <span style={{fontSize:8,color:"#5a6080",flexShrink:0}}>▶</span>
                    </button>
                  );
                })}
                {entry.moves.length===0&&<div style={{fontSize:9,color:"#5a6080",fontStyle:"italic"}}>No moves — click Edit{entry.currentWill>0?" or use Struggle":""}</div>}
                {/* Struggle — available when out of moves or WP to spare */}
                {(entry.moves.length===0&&entry.currentWill>0)&&(
                  <button onClick={()=>{const s=MOVES.find(m=>m.name==="Struggle")||{name:"Struggle",type:"Normal" as PokemonType,category:"Physical" as const,power:"1",accuracy:"Strength + Brawl",damagePool:"Strength + 1",effect:"Target Foe. No WP cost. User takes recoil equal to half damage dealt.",description:"A desperate thrashing attack used when no other moves are available."} as Move;setMovePopup(s);}} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",background:"rgba(255,71,87,0.08)",border:"1px solid #ff475730",borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%"}}>
                    <span style={{fontSize:9,color:"#ff4757",fontWeight:700,flex:1}}>💢 Struggle (1 WP)</span>
                    <span style={{fontSize:8,color:"#5a6080"}}>▶</span>
                  </button>
                )}
              </>
            )}
            </>
          )}
        </div>

        {/* Expanded section: attrs, abilities, notes */}
        {entry.isExpanded&&(
          <div style={{borderTop:"1px solid #2a2f45",padding:"8px 8px",display:"flex",flexDirection:"column",gap:8}}>
            {/* Trainer card view */}
            {linkedTrainer&&(
              <div style={{background:"rgba(61,139,255,0.06)",border:"1px solid #3d8bff25",borderRadius:5,padding:"8px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#3d8bff"}}>{linkedTrainer.name} · {linkedTrainer.rank}</div>
                  <button onClick={()=>setShowTrainerSkills(true)} style={{background:"rgba(61,139,255,0.15)",border:"1px solid #3d8bff30",borderRadius:3,color:"#3d8bff",padding:"2px 6px",fontSize:9,cursor:"pointer"}}>🎲 Use Skill</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginBottom:6}}>
                  {[["STR","strength"],["DEX","dexterity"],["VIT","vitality"],["INS","insight"]].map(([l,k])=><div key={k} style={{textAlign:"center",background:"#0f1117",borderRadius:3,padding:"3px 0"}}><div style={{fontSize:7,color:"#5a6080"}}>{l}</div><div style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:"#3d8bff"}}>{(linkedTrainer.attributes||{})[k]||1}</div></div>)}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {Object.entries(linkedTrainer.skills||{}).filter(([,v])=>(v as number)>0).map(([sk,v])=>{
                    const d=TRAINER_SKILL_DEFS[sk];const av=(linkedTrainer.attributes||{} as any)[d?.attr||"insight"]||1;const pool=av+(v as number);
                    return<button key={sk} onClick={()=>setShowTrainerSkills(true)} style={{fontSize:8,background:"rgba(61,139,255,0.1)",border:"1px solid #3d8bff25",borderRadius:3,padding:"2px 5px",color:"#3d8bff",cursor:"pointer",textTransform:"capitalize"}}>{sk} {pool}d</button>;
                  })}
                </div>
              </div>
            )}

            {/* Attributes */}
            <div>
              <div style={{fontSize:8,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Attributes</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3}}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{
                  const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};
                  const base=entry.attrs[attr];const mod=attrModSummary(attr);
                  const statusPen=attr==="dexterity"?(STATUS_CONDITIONS[entry.status]?.accuracyPenalty??0):0;
                  const final=Math.max(0,base+mod-statusPen);
                  return<div key={attr} style={{textAlign:"center"}}>
                    <div style={{fontSize:7,color:"#5a6080"}}>{labels[attr]}</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:1}}>
                      <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:Math.max(0,base-1)}})} style={{...adjBtn,width:12,height:12,fontSize:9}}>−</button>
                      <span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:final<base?"#ff4757":mod>0?"#00d4aa":"#e8eaf0",minWidth:14,textAlign:"center"}}>{final}</span>
                      <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:base+1}})} style={{...adjBtn,width:12,height:12,fontSize:9}}>+</button>
                    </div>
                  </div>;
                })}
              </div>
              {entry.statMods.length>0&&<div style={{marginTop:4,display:"flex",flexWrap:"wrap",gap:2}}>
                {entry.statMods.map((m,i)=><div key={i} style={{fontSize:8,display:"flex",alignItems:"center",gap:2,background:m.amount>0?"rgba(0,212,170,0.1)":"rgba(255,71,87,0.1)",border:`1px solid ${m.amount>0?"#00d4aa30":"#ff475730"}`,borderRadius:2,padding:"0 4px"}}>
                  <span style={{color:m.amount>0?"#00d4aa":"#ff4757"}}>{m.amount>0?"▲":"▼"}{Math.abs(m.amount)} {m.attr}</span>
                  <button onClick={()=>upd({statMods:entry.statMods.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:9,padding:0}}>×</button>
                </div>)}
              </div>}
            </div>

            {/* Abilities */}
            <div>
              <div style={{fontSize:8,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Abilities</div>
              {entry.abilities.map((ab,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                <button onClick={()=>{const abs=[...entry.abilities];abs[i]={...abs[i],active:!abs[i].active};upd({abilities:abs});}} style={{width:12,height:12,borderRadius:2,border:`1px solid ${ab.active?"#00d4aa":"#3a4060"}`,background:ab.active?"#00d4aa":"transparent",cursor:"pointer",flexShrink:0}}/>
                <span style={{fontSize:10,color:ab.active?"#e8eaf0":"#5a6080"}}>{ab.name}</span>
              </div>)}
            </div>

            {/* HP/WP editors + notes */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {[{l:"HP",c:entry.currentHp,m:entry.maxHp,col:"#00d4aa",f:"currentHp" as const},{l:"WP",c:entry.currentWill,m:entry.maxWill,col:"#6890f0",f:"currentWill" as const}].map(f=><div key={f.l}>
                <div style={{fontSize:8,color:"#5a6080",marginBottom:2}}>{f.l}</div>
                <div style={{display:"flex",gap:2,alignItems:"center"}}>
                  <button onClick={()=>upd({[f.f]:Math.max(0,f.c-1)})} style={{...adjBtn,width:16,height:16,fontSize:12}}>−</button>
                  <input type="number" value={f.c} onChange={e=>upd({[f.f]:Math.max(0,Math.min(f.m,+e.target.value||0))})} style={{width:28,textAlign:"center",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:2,color:f.col,fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,padding:"0 1px"}}/>
                  <span style={{fontSize:8,color:"#5a6080"}}>/{f.m}</span>
                  <button onClick={()=>upd({[f.f]:Math.min(f.m,f.c+1)})} style={{...adjBtn,width:16,height:16,fontSize:12}}>+</button>
                </div>
              </div>)}
            </div>

            <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Notes…" style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,color:"#8b90a8",fontSize:9,padding:4,resize:"none",minHeight:28,fontFamily:"inherit",outline:"none"}}/>
            <label style={{fontSize:9,color:"#8b90a8",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
              <input type="checkbox" checked={entry.weatherImmune} onChange={e=>upd({weatherImmune:e.target.checked})}/>Weather immune
            </label>
          </div>
        )}
      </div>
    </>
  );
}

// ── Character Party Sidebar ───────────────────────────────────────────────────
function CharactersSidebar({onAddPokemon}:{onAddPokemon:(pokemon:PokemonEntry,trainerId:string,nickname:string,loyalty:number,happiness:number,moves:Move[])=>void}){
  const trainers=useMemo(()=>loadFromStorage<any[]>("trainers",[]),[]);
  const pokemonSheets=useMemo(()=>loadFromStorage<Record<string,any>>("pokemon_sheets",{}),[]);
  const [selId,setSelId]=useState<string|null>(null);
  const sel=trainers.find(t=>t.id===selId);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {trainers.length===0&&<div style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>No saved characters. Create them in the Characters page.</div>}
      {trainers.map(t=>(
        <div key={t.id} style={{borderRadius:5,border:`1px solid ${selId===t.id?"#00d4aa":"#2a2f45"}`,overflow:"hidden"}}>
          <div onClick={()=>setSelId(selId===t.id?null:t.id)} style={{padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,background:selId===t.id?"rgba(0,212,170,0.08)":"#13151f"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#e8eaf0",flex:1}}>{t.name}</span>
            <span style={{fontSize:9,color:RANK_COLORS[t.rank as Rank]}}>{t.rank}</span>
            <span style={{fontSize:10,color:"#5a6080"}}>{selId===t.id?"▲":"▼"}</span>
          </div>
          {selId===t.id&&<div style={{padding:"6px 8px",background:"#0f1117"}}>
            {(t.pokemon||[]).map((key:string)=>{
              const sheet=pokemonSheets[key];if(!sheet)return null;
              const p=POKEMON.find(x=>x.number===sheet.number);if(!p)return null;
              const activeMovs=((sheet.moves||[]) as string[]).map((mn:string)=>MOVES.find(m=>m.name===mn)).filter(Boolean) as Move[];
              return(
                <div key={key} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:"1px solid #1a1d27"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:TYPE_COLORS[p.types[0]],flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#e8eaf0",flex:1}}>{sheet.nickname||p.name}</span>
                  <button onClick={()=>onAddPokemon(p,t.id,sheet.nickname||"",sheet.loyalty||1,sheet.happiness||1,activeMovs)} style={{background:"#00d4aa20",border:"1px solid #00d4aa40",borderRadius:3,color:"#00d4aa",padding:"2px 7px",fontSize:9,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
              );
            })}
            <button onClick={()=>{
              // Add trainer as combatant
              const fakePoke:PokemonEntry={...MISSINGNO,name:t.name,number:-1,attributes:t.attributes||{strength:1,dexterity:1,vitality:1,special:1,insight:1},abilities:[],moves:[]};
              onAddPokemon(fakePoke,t.id,t.name,0,0,[]);
            }} style={{marginTop:5,background:"rgba(61,139,255,0.1)",border:"1px solid #3d8bff30",borderRadius:3,color:"#3d8bff",padding:"3px 8px",fontSize:9,cursor:"pointer"}}>+ Add Trainer to Battle</button>
          </div>}
        </div>
      ))}
    </div>
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────
function SearchBar({onAdd}:{onAdd:(p:PokemonEntry)=>void}){
  const [q,setQ]=useState("");
  const filtered=useMemo(()=>{if(!q)return [];const ql=q.toLowerCase();return POKEMON.filter(p=>p.name.toLowerCase().includes(ql)||String(p.number).includes(q)).slice(0,12);},[q]);
  return(
    <div style={{position:"relative"}}>
      <input type="text" placeholder="Add Pokémon to battle…" value={q} onChange={e=>setQ(e.target.value)}
        style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:5,padding:"6px 8px",color:"#e8eaf0",fontSize:12,outline:"none"}}
        onFocus={e=>(e.target as HTMLInputElement).style.borderColor="#00d4aa"}
        onBlur={e=>(e.target as HTMLInputElement).style.borderColor="#2a2f45"}/>
      {filtered.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e2235",border:"1px solid #3a4060",borderRadius:5,zIndex:100,maxHeight:260,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
          <div onClick={()=>{onAdd(MISSINGNO);setQ("");}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",cursor:"pointer",borderBottom:"1px solid #2a2f45"}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#242842"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
            <span style={{fontSize:10,color:"#ffd32a",fontWeight:700}}>✦ Custom (blank)</span>
          </div>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BattleTrackerPage(){
  const [entries,setEntries]=useState<BattleEntry[]>(()=>loadFromStorage("bt_entries",[]));
  const [weather,setWeather]=useState<WeatherData>(WEATHER_DATA[0]);
  const [turn,setTurn]=useState(0);
  const [round,setRound]=useState(1);
  const [showEOR,setShowEOR]=useState(false);
  const [showPriority,setShowPriority]=useState(false);
  const [dragId,setDragId]=useState<string|null>(null);
  const [sidebarTab,setSidebarTab]=useState<"search"|"characters">("search");

  useEffect(()=>{saveToStorage("bt_entries",entries);},[entries]);

  useEffect(()=>{
    const queue=loadFromStorage<number[]>("encounter_queue",[]);
    if(queue.length>0){saveToStorage("encounter_queue",[]);queue.forEach(num=>{const p=POKEMON.find(x=>x.number===num);if(p)addPokemon(p);});}
    const pending=loadFromStorage<{pokemonNumber:number;trainerId:string;nickname:string}|null>("pending_link",null);
    if(pending){saveToStorage("pending_link",null);setTimeout(()=>setEntries(prev=>{const idx=[...prev].reverse().findIndex(e=>e.pokemon.number===pending.pokemonNumber&&!e.linkedTrainerId);if(idx<0)return prev;const ri=prev.length-1-idx;const u=[...prev];u[ri]={...u[ri],linkedTrainerId:pending.trainerId,side:"player",nickname:pending.nickname||u[ri].nickname};return u;}),100);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const sorted=useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry=sorted[turn%Math.max(1,sorted.length)];

  const addPokemon=useCallback((pokemon:PokemonEntry,trainerId?:string,nickname?:string,loyalty=1,happiness=1,moves?:Move[])=>{
    const hp=pokemon.number<=0?10:pokemon.baseHp+pokemon.attributes.vitality;
    const will=pokemon.number<=0?5:pokemon.attributes.insight+3;
    const ini=Math.floor(Math.random()*6)+1+(pokemon.attributes?.dexterity??1);
    const defaultMoves=pokemon.moves.slice(0,4).map(m=>MOVES.find(mv=>mv.name===m.name)||{name:m.name,type:m.type,category:"Physical" as const,power:"-",accuracy:"-",damagePool:"-",effect:"",description:""} as Move);
    setEntries(prev=>[...prev,{
      id:`${pokemon.number}-${Date.now()}`,pokemon,nickname:nickname||"",
      initiative:ini,currentHp:hp,maxHp:hp,currentWill:will,maxWill:will,
      loyalty,happiness,
      status:"Healthy",statusTurnsLeft:0,notes:"",isExpanded:false,hasTakenTurn:false,
      side:trainerId?"player":"enemy",trainerRank:"Rookie",
      abilities:pokemon.abilities.map(a=>({name:a,active:true})),
      moves:moves||defaultMoves,
      attrs:{...pokemon.attributes},statMods:[],weatherImmune:false,actionCount:0,
      reactionUsed:false,linkedTrainerId:trainerId,
    }]);
    if(trainerId){
      saveToStorage("pending_link",{pokemonNumber:pokemon.number,trainerId,nickname:nickname||""});
    }
  },[]);

  const upd=useCallback((id:string,u:Partial<BattleEntry>)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e)),[]);
  const remove=useCallback((id:string)=>setEntries(prev=>prev.filter(e=>e.id!==id)),[]);
  const applyEOR=(id:string,hp:number)=>setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp+hp)}:e));

  const startNewRound=(newRound:number)=>{
    // Reset all entries for new round
    setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false,actionCount:0,reactionUsed:false})));
    setShowEOR(true);
    // Priority fires at start of new round — after EOR closes
    const hasPri=entries.some(e=>e.currentHp>0&&e.moves.some(m=>(m.priority??0)>0));
    if(hasPri)setTimeout(()=>setShowPriority(true),600);
  };

  const nextTurn=()=>{
    if(activeEntry){
      setEntries(prev=>prev.map(e=>{
        if(e.id!==activeEntry.id)return e;
        let ns=e.status,nt=e.statusTurnsLeft;
        if(e.status==="Flinched")ns="Healthy";
        if(e.status==="Asleep"){nt=Math.max(0,e.statusTurnsLeft-1);if(nt===0)ns="Healthy";}
        return{...e,hasTakenTurn:true,status:ns,statusTurnsLeft:nt};
        // actionCount is reset per-action now, not per turn
      }));
    }
    const next=(turn+1)%Math.max(1,sorted.length);
    if(next===0){
      const newRound=round+1;
      setRound(newRound);
      startNewRound(newRound);
    }
    setTurn(next);
  };

  // Trigger priority popup on first load if there are entries with priority moves
  useEffect(()=>{
    if(entries.length>0&&entries.some(e=>e.currentHp>0&&e.moves.some(m=>(m.priority??0)>0))){
      setShowPriority(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

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
          <button onClick={nextTurn} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:4,padding:"4px 10px",fontWeight:700,fontSize:11,cursor:"pointer"}}>Next ▶</button>
          <button onClick={rollAllIni} style={{background:"#6890f015",border:"1px solid #6890f040",borderRadius:4,color:"#6890f0",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🎲 INI</button>
          <button onClick={()=>setShowPriority(true)} style={{background:"#00d4aa10",border:"1px solid #00d4aa30",borderRadius:4,color:"#00d4aa",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>⚡</button>
          <button onClick={()=>setShowEOR(true)} style={{background:"#ffd32a10",border:"1px solid #ffd32a30",borderRadius:4,color:"#ffd32a",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🔄 EOR</button>
          <Link href="/gm-screen" style={{fontSize:11,color:"#a040a0",textDecoration:"none",background:"rgba(160,64,160,0.1)",border:"1px solid rgba(160,64,160,0.3)",borderRadius:4,padding:"3px 8px"}}>🖥️</Link>
        </div>
      </nav>

      {/* Weather banner */}
      {weather.name!=="Clear"&&<div style={{background:weather.color+"12",padding:"3px 14px",display:"flex",gap:8,alignItems:"center",fontSize:11,flexShrink:0,borderBottom:`1px solid ${weather.color}20`}}><span>{weather.emoji?.split(" ")[0]}</span><span style={{fontWeight:700,color:"#e8eaf0"}}>{weather.name}</span><span style={{color:"#8b90a8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{weather.description}</span></div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Left sidebar */}
        <div style={{width:230,background:"#13151f",borderRight:"1px solid #2a2f45",display:"flex",flexDirection:"column",flexShrink:0}}>
          {/* Sidebar tabs */}
          <div style={{display:"flex",borderBottom:"1px solid #2a2f45",flexShrink:0}}>
            {[{k:"search" as const,l:"Search"},{ k:"characters" as const,l:"Party 👤"}].map(t=>(
              <button key={t.k} onClick={()=>setSidebarTab(t.k)} style={{flex:1,padding:"7px",background:"none",border:"none",borderBottom:`2px solid ${sidebarTab===t.k?"#00d4aa":"transparent"}`,color:sidebarTab===t.k?"#00d4aa":"#5a6080",cursor:"pointer",fontSize:11,fontWeight:700}}>{t.l}</button>
            ))}
          </div>
          <div style={{padding:"8px 8px 4px",flexShrink:0}}>
            {sidebarTab==="search"&&<SearchBar onAdd={p=>addPokemon(p)}/>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"4px 8px"}}>
            {sidebarTab==="search"&&(
              <>
                {sorted.map(e=>(
                  <div key={e.id} onClick={()=>upd(e.id,{isExpanded:!e.isExpanded})} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 4px",borderRadius:4,cursor:"pointer",background:activeEntry?.id===e.id?"rgba(0,212,170,0.08)":"transparent",borderLeft:`2px solid ${activeEntry?.id===e.id?sideColor:"transparent"}`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:TYPE_COLORS[e.pokemon.types[0]],flexShrink:0}}/>
                    <span style={{fontSize:11,color:"#e8eaf0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.nickname||e.pokemon.name}</span>
                    <span style={{fontSize:10,color:e.currentHp/e.maxHp>0.5?"#00d4aa":e.currentHp/e.maxHp>0.25?"#ffd32a":"#ff4757",fontFamily:"'Exo 2'",fontWeight:700,flexShrink:0}}>{e.currentHp}/{e.maxHp}</span>
                  </div>
                ))}
                {entries.length===0&&<div style={{textAlign:"center",color:"#5a6080",padding:16,fontSize:11}}>Search to add Pokémon</div>}
              </>
            )}
            {sidebarTab==="characters"&&(
              <CharactersSidebar onAddPokemon={(p,tid,nick,loy,hap,movs)=>addPokemon(p,tid,nick,loy,hap,movs)}/>
            )}
          </div>
          <div style={{padding:"6px 8px",borderTop:"1px solid #2a2f45",flexShrink:0}}>
            <button onClick={()=>setEntries([])} style={{width:"100%",background:"rgba(255,71,87,0.1)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,color:"#ff4757",padding:"5px",fontSize:11,cursor:"pointer"}}>Clear All</button>
          </div>
        </div>

        {/* HORIZONTAL TRACKER AREA — scrolls left-right */}
        <div style={{flex:1,overflowX:"auto",overflowY:"hidden",padding:"10px 10px"}}>
          {entries.length===0?(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#5a6080",fontSize:14,flexDirection:"column",gap:12}}>
              <span style={{fontSize:32}}>⚔️</span>
              <span>Search for Pokémon in the sidebar or load a party from Characters</span>
            </div>
          ):(
            <div style={{display:"flex",gap:10,height:"100%",alignItems:"flex-start"}}>
              {sorted.map(e=>(
                <div key={e.id} style={{opacity:dragId===e.id?0.4:1,flexShrink:0}}>
                  <BattleCard entry={e} allEntries={entries} weather={weather} isActive={activeEntry?.id===e.id} onUpdate={upd} onRemove={remove}
                    onDragStart={()=>setDragId(e.id)}
                    onDragOver={(ev)=>{ev.preventDefault();}}
                    onDrop={()=>handleDrop(e.id)}/>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

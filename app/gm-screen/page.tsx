"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART, MISSINGNO,
  PokemonEntry, Move, PokemonType, Rank,
} from "../data/pokerole-data";
import {
  STATUS_CONDITIONS, StatusCondition, WEATHER_DATA, WeatherData,
  RANK_ORDER, getRankIndex, getDisobedienceLevel, getPainPenalty,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";

const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};

// ─── Types ────────────────────────────────────────────────────────────────────
interface StatMod { source: string; attr: string; amount: number; durationType: "permanent" | "rounds" | "scene"; roundsLeft?: number; }
interface AbilityState { name: string; active: boolean; disabledReason?: string; }

interface BattleEntry {
  id: string; pokemon: PokemonEntry; nickname: string;
  initiative: number; currentHp: number; maxHp: number; currentWill: number; maxWill: number;
  status: string; statusTurnsLeft: number;
  notes: string; isExpanded: boolean; hasTakenTurn: boolean;
  side: "player" | "enemy" | "neutral"; trainerRank: Rank;
  abilities: AbilityState[];
  moves: Move[];
  attrs: { strength: number; dexterity: number; vitality: number; special: number; insight: number };
  statMods: StatMod[];
  weatherImmune: boolean; actionCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
type AttrSet = { strength: number; dexterity: number; vitality: number; special: number; insight: number };

function TypeBadge({ type, small }: { type: PokemonType; small?: boolean }) {
  return <span style={{ display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 7px",borderRadius:3,fontSize:small?9:11,fontWeight:700,color:"#fff",background:TYPE_COLORS[type] }}>{type}</span>;
}

function rollDice(pool: number): { rolls: number[]; successes: number } {
  const p = Math.max(1, pool);
  const rolls = Array.from({ length: p }, () => Math.floor(Math.random() * 6) + 1);
  return { rolls, successes: rolls.filter(r => r >= 4).length };
}

function getEffectiveAttrs(entry: BattleEntry, weather: WeatherData): AttrSet {
  const sc = STATUS_CONDITIONS[entry.status];
  const base = { ...entry.attrs };
  // Status penalties
  const accPen = sc?.accuracyPenalty ?? 0;
  // Apply stat mods
  const mods = entry.statMods.reduce<Partial<AttrSet>>((acc, m) => {
    const key = m.attr as keyof AttrSet;
    if (key in base) acc[key] = (acc[key] ?? base[key]) + m.amount;
    return acc;
  }, {});
  return {
    strength: Math.max(0, (mods.strength ?? base.strength)),
    dexterity: Math.max(0, (mods.dexterity ?? base.dexterity) - accPen),
    vitality: Math.max(0, mods.vitality ?? base.vitality),
    special: Math.max(0, mods.special ?? base.special),
    insight: Math.max(0, mods.insight ?? base.insight),
  };
}

function calcAccPool(move: Move, attrs: AttrSet, actionCount: number): number {
  const acc = move.accuracy.toLowerCase();
  let pool = 0;
  if (acc.includes("strength")) pool += attrs.strength;
  if (acc.includes("dexterity")) pool += attrs.dexterity;
  if (acc.includes("special")) pool += attrs.special;
  if (acc.includes("insight")) pool += attrs.insight;
  if (acc.includes("cute")) pool += 1;
  if (acc.includes("cool")) pool += 1;
  const skillBonus = (acc.includes("brawl") || acc.includes("athletic") || acc.includes("channel") || acc.includes("perform") || acc.includes("intimidate") || acc.includes("clash")) ? 2 : 1;
  pool += skillBonus;
  return Math.max(1, pool);
}

function calcDmgPool(move: Move, attrs: AttrSet, weather: WeatherData, stab: boolean, abilityBonus: number): number {
  const dmg = move.damagePool.toLowerCase();
  if (dmg === "-") return 0;
  let pool = 0;
  if (dmg.includes("strength")) pool += attrs.strength;
  if (dmg.includes("special")) pool += attrs.special;
  const pm = move.power.match(/(\d+)/);
  if (pm) pool += parseInt(pm[1]);
  if (stab) pool += 1;
  if (weather.typeBoost === move.type && weather.typeBoostDice) pool += weather.typeBoostDice;
  if (weather.typeWeaken === move.type && weather.typeWeakenDice) pool -= weather.typeWeakenDice;
  pool += abilityBonus;
  return Math.max(1, pool);
}

function getTypeMult(moveType: PokemonType, defTypes: PokemonType[]): { label: string; color: string; dmgMod: number } {
  let weak = false, resist = false, immune = false;
  defTypes.forEach(dt => {
    const c = TYPE_CHART[dt];
    if (c.weaknesses.includes(moveType)) weak = true;
    if (c.resistances.includes(moveType)) resist = true;
    if (c.immunities.includes(moveType)) immune = true;
  });
  if (immune) return { label: "Immune — no effect", color: "#5a6080", dmgMod: -999 };
  if (weak) return { label: "Super Effective! ×2", color: "#ff4757", dmgMod: 2 };
  if (resist) return { label: "Not very effective ×0.5", color: "#00d4aa", dmgMod: -1 };
  return { label: "Normal effectiveness", color: "#8b90a8", dmgMod: 0 };
}

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const c = pct > 0.5 ? "#00d4aa" : pct > 0.25 ? "#ffd32a" : "#ff4757";
  return <div style={{ background: "#0f1117", borderRadius: 3, height: 5, overflow: "hidden" }}><div style={{ width: `${pct * 100}%`, height: "100%", background: c, transition: "width 0.3s" }} /></div>;
}

const adjBtn: React.CSSProperties = { width:20,height:20,background:"#1a1d27",border:"1px solid #3a4060",borderRadius:3,color:"#00d4aa",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center" };

// ─── Move Attack Popup ────────────────────────────────────────────────────────
function MoveAttackPopup({ move, attacker, allEntries, weather, onClose, onApplyDmg, onApplyEffect }: {
  move: Move; attacker: BattleEntry; allEntries: BattleEntry[]; weather: WeatherData;
  onClose: () => void;
  onApplyDmg: (targetId: string, dmg: number) => void;
  onApplyEffect: (targetId: string, attr: string, amount: number, source: string) => void;
}) {
  const [targets, setTargets] = useState<string[]>([]);
  const [accResult, setAccResult] = useState<{rolls:number[];successes:number}|null>(null);
  const [dmgResults, setDmgResults] = useState<Record<string,{rolls:number[];successes:number}>>({});
  const [statusRoll, setStatusRoll] = useState<{rolls:number[];successes:number}|null>(null);
  const [confRoll, setConfRoll] = useState<number|null>(null);
  const [freezeRoll, setFreezeRoll] = useState<number|null>(null);
  const [loyaltyRoll, setLoyaltyRoll] = useState<{rolls:number[];successes:number}|null>(null);

  const attrs = getEffectiveAttrs(attacker, weather);
  const stab = attacker.pokemon.types.includes(move.type as PokemonType);
  const actReq = [1,2,3,4,5][Math.min(attacker.actionCount, 4)];

  // Status pre-checks
  const sc = STATUS_CONDITIONS[attacker.status];
  const flinched = attacker.status === "Flinched";
  const needsPreRoll = sc?.requiresRollToAct && attacker.status !== "Flinched";
  const [preRollDone, setPreRollDone] = useState<{canAct:boolean;detail:string}|null>(flinched ? {canAct:false,detail:"Flinched — skip turn"} : needsPreRoll ? null : {canAct:true,detail:""});

  // Disobedience
  const disobedience = getDisobedienceLevel(attacker.pokemon.suggestedRank, attacker.trainerRank);

  const doPreRoll = () => {
    if (attacker.status === "Asleep" || attacker.status === "Frozen") {
      const r = Math.floor(Math.random()*6)+1;
      const wakes = attacker.status==="Asleep" ? r>=4 : r>=5;
      setPreRollDone({canAct:wakes, detail:`Rolled ${r}. ${wakes?"Woke up!":"Still ${attacker.status}."}`});
    } else if (attacker.status === "Paralyzed") {
      const r = Math.floor(Math.random()*6)+1;
      const acts = r>=3;
      setPreRollDone({canAct:acts, detail:`Paralysis check: ${r}. ${acts?"Can act (still –2 acc dice).":"Cannot act this turn."}`});
    } else if (attacker.status === "Confused") {
      const r = Math.floor(Math.random()*6)+1;
      const hitsItself = r<=3;
      setConfRoll(r);
      setPreRollDone({canAct:!hitsItself, detail:`Confusion: rolled ${r}. ${hitsItself?"Hits itself!":"Acts normally."}`});
    } else if (attacker.status === "Infatuated") {
      const res = rollDice(attacker.currentWill);
      const acts = res.successes >= 2;
      setPreRollDone({canAct:acts, detail:`Infatuation check: [${res.rolls}] = ${res.successes} success. ${acts?"Can act.":"Too distracted!"}`});
    }
  };

  const doLoyaltyRoll = () => {
    const pool = 2; // loyalty score approximation
    const r = rollDice(pool);
    setLoyaltyRoll(r);
  };

  const otherEntries = allEntries.filter(e => e.id !== attacker.id);
  const isMultiTarget = move.effect.toLowerCase().includes("all") || move.effect.toLowerCase().includes("area");

  const toggleTarget = (id: string) => {
    if (isMultiTarget) setTargets(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
    else setTargets([id]);
  };

  const doAccuracy = () => {
    const pool = calcAccPool(move, attrs, attacker.actionCount);
    setAccResult(rollDice(pool));
  };

  const doDmgForTarget = (targetId: string) => {
    const target = allEntries.find(e => e.id === targetId);
    if (!target || !accResult) return;
    const abilityBonus = attacker.abilities.filter(a => a.active).some(a => a.name === "Blaze" && attacker.pokemon.types.includes("Fire" as PokemonType) && attacker.currentHp <= attacker.maxHp/2) ? 2 : 0;
    const pool = calcDmgPool(move, attrs, weather, stab, abilityBonus);
    setDmgResults(prev => ({...prev, [targetId]: rollDice(pool)}));
  };

  const applyDmgToTarget = (targetId: string) => {
    const target = allEntries.find(e=>e.id===targetId);
    const dr = dmgResults[targetId];
    if (!target || !dr) return;
    const tm = getTypeMult(move.type as PokemonType, target.pokemon.types);
    if (tm.dmgMod === -999) { alert(`${target.nickname||target.pokemon.name} is immune!`); return; }
    const defense = move.category === "Physical" ? target.attrs.vitality : target.attrs.insight;
    let succ = Math.max(1, dr.successes);
    if (tm.dmgMod === 2) succ = Math.ceil(succ * 1.5);
    if (tm.dmgMod === -1) succ = Math.max(1, succ - 1);
    const pain = getPainPenalty(attacker.currentHp, attacker.maxHp);
    const finalDmg = Math.max(1, succ - defense);
    onApplyDmg(targetId, finalDmg);
    alert(`${attacker.nickname||attacker.pokemon.name} → ${target.nickname||target.pokemon.name}\n${dr.successes} dmg successes ${tm.dmgMod===2?"(×2 SE)":tm.dmgMod===-1?"(×0.5 NVE)":""} − ${defense} DEF = ${finalDmg} damage${pain>0?`\n(attacker at ${(attacker.currentHp/attacker.maxHp*100).toFixed(0)}% HP, pain penalty: −${pain} dice was applied)`:""}`);
  };

  const applyAttrEffect = (targetId: string, attr: string, amount: number) => {
    onApplyEffect(targetId, attr, amount, `${move.name} (${attacker.nickname||attacker.pokemon.name})`);
  };

  // Parse stat-change effects from move text
  const statEffects: {attr:string;amount:number}[] = [];
  const effLower = move.effect.toLowerCase();
  if (effLower.includes("strength") && effLower.includes("by 1")) statEffects.push({attr:"strength",amount:-1});
  if (effLower.includes("defense") && effLower.includes("by 1") && !effLower.includes("sp.")) statEffects.push({attr:"vitality",amount:-1});
  if (effLower.includes("sp. def") && effLower.includes("by 1")) statEffects.push({attr:"insight",amount:-1});
  if (effLower.includes("special") && effLower.includes("by 1")) statEffects.push({attr:"special",amount:-1});
  if (effLower.includes("dexterity") && effLower.includes("by 1")) statEffects.push({attr:"dexterity",amount:-1});
  if (effLower.includes("increase") && effLower.includes("strength")) statEffects.push({attr:"strength",amount:1});
  if (effLower.includes("increase") && effLower.includes("special")) statEffects.push({attr:"special",amount:1});

  const accPool = calcAccPool(move, attrs, attacker.actionCount);
  const canAct = preRollDone?.canAct ?? false;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",overflowY:"auto",padding:"20px 0"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:500,maxWidth:"95vw",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        {/* Header */}
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",gap:8}}>
          <TypeBadge type={move.type as PokemonType}/>
          <span style={{fontSize:11,fontWeight:700,color:move.category==="Physical"?"#f08030":move.category==="Special"?"#6890f0":"#78c850",background:move.category==="Physical"?"rgba(240,128,48,0.15)":move.category==="Special"?"rgba(104,144,240,0.15)":"rgba(120,200,80,0.15)",padding:"2px 7px",borderRadius:3}}>{move.category}</span>
          {stab && <span style={{fontSize:9,fontWeight:700,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"1px 5px",borderRadius:3}}>STAB +1</span>}
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:17,color:"#e8eaf0",margin:0,flex:1}}>{move.name}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>

        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,maxHeight:"75vh",overflowY:"auto"}}>
          {/* Description */}
          <p style={{fontSize:12,color:"#8b90a8",lineHeight:1.5,margin:0}}>{move.description}</p>
          <div style={{background:"#13151f",borderRadius:5,padding:"7px 10px",fontSize:11,color:"#e8eaf0"}}>
            <strong style={{color:"#5a6080"}}>Effect: </strong>{move.effect}
          </div>

          {/* Weather modifier */}
          {(weather.typeBoost===move.type || weather.typeWeaken===move.type) && (
            <div style={{background:"rgba(255,211,42,0.08)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ffd32a"}}>
              {weather.emoji} {weather.name}: {weather.typeBoost===move.type?`+${weather.typeBoostDice} dice`:`−${weather.typeWeakenDice} dice`}
            </div>
          )}

          {/* Multiple action penalty */}
          {attacker.actionCount > 0 && (
            <div style={{background:"rgba(255,71,87,0.08)",border:"1px solid rgba(255,71,87,0.3)",borderRadius:4,padding:"5px 10px",fontSize:11,color:"#ff4757"}}>
              Action #{attacker.actionCount+1}: requires {actReq} success{actReq>1?"es":""} to hit
            </div>
          )}

          {/* Disobedience */}
          {disobedience !== "none" && (
            <div style={{background:disobedience==="high"?"rgba(255,71,87,0.1)":"rgba(255,211,42,0.08)",border:`1px solid ${disobedience==="high"?"#ff4757":"#ffd32a"}40`,borderRadius:4,padding:"8px 10px",fontSize:11}}>
              <div style={{fontWeight:700,color:disobedience==="high"?"#ff4757":"#ffd32a",marginBottom:4}}>
                {disobedience==="high"?"🔴 High Disobedience — Pokémon will NOT follow commands":"⚠ Low Disobedience — Loyalty check required"}
              </div>
              {disobedience==="low" && (
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={doLoyaltyRoll} style={{background:"rgba(255,211,42,0.15)",border:"1px solid #ffd32a40",borderRadius:4,color:"#ffd32a",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Loyalty Check (3+ needed)</button>
                  {loyaltyRoll && <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:loyaltyRoll.successes>=3?"#00d4aa":"#ff4757"}}>[{loyaltyRoll.rolls.join(",")}] = {loyaltyRoll.successes} {loyaltyRoll.successes>=3?"✓ Obeys":"✗ Acts on its own"}</span>}
                </div>
              )}
            </div>
          )}

          {/* Status pre-check */}
          {(needsPreRoll || flinched) && (
            <div style={{background:"rgba(168,64,160,0.1)",border:"1px solid #a040a040",borderRadius:4,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:700,color:STATUS_CONDITIONS[attacker.status]?.color,marginBottom:4}}>
                {attacker.status}: {STATUS_CONDITIONS[attacker.status]?.shortDesc}
              </div>
              <div style={{fontSize:11,color:"#8b90a8",marginBottom:6}}>{STATUS_CONDITIONS[attacker.status]?.rollToActDesc}</div>
              {!flinched && !preRollDone && (
                <button onClick={doPreRoll} style={{background:"rgba(168,64,160,0.15)",border:"1px solid #a040a040",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Pre-Action Check</button>
              )}
              {preRollDone && <div style={{fontSize:12,fontWeight:700,color:preRollDone.canAct?"#00d4aa":"#ff4757"}}>{preRollDone.detail}</div>}
            </div>
          )}

          {/* Target selector */}
          <div>
            <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>{isMultiTarget?"Select Targets (multi)":"Select Target"}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {otherEntries.map(t => {
                const sel = targets.includes(t.id);
                return (
                  <button key={t.id} onClick={()=>toggleTarget(t.id)} style={{
                    padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",
                    border:`1px solid ${sel?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,
                    background:sel?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",
                    color:sel?"#e8eaf0":"#8b90a8",
                  }}>
                    {t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp})
                    {sel && targets.length>1 && ` ✓`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type effectiveness per target */}
          {targets.map(tid => {
            const t = allEntries.find(e=>e.id===tid);
            if (!t) return null;
            const tm = getTypeMult(move.type as PokemonType, t.pokemon.types);
            const def = move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
            const pain = getPainPenalty(t.currentHp, t.maxHp);
            return (
              <div key={tid} style={{background:tm.color+"10",border:`1px solid ${tm.color}30`,borderRadius:4,padding:"6px 10px"}}>
                <div style={{fontSize:11,fontWeight:700,color:tm.color}}>{t.nickname||t.pokemon.name}: {tm.label}</div>
                <div style={{fontSize:10,color:"#8b90a8",marginTop:2}}>
                  DEF: {def} ({move.category==="Physical"?"VIT":"INS"}) {pain>0&&`| Pain penalty: −${pain}`}
                </div>
              </div>
            );
          })}

          {/* Accuracy roll */}
          {canAct && (
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                1. Accuracy Roll — {move.accuracy} ({accPool} dice) · Need {actReq}+ to hit
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={doAccuracy} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Roll Accuracy ({accPool}d)</button>
                {accResult && <span style={{fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,color:accResult.successes>=actReq?"#00d4aa":"#ff4757"}}>[{accResult.rolls.join(",")}] = {accResult.successes} {accResult.successes>=actReq?"✓ HIT":"✗ MISS"} (need {actReq})</span>}
              </div>
            </div>
          )}

          {/* Damage per target */}
          {canAct && accResult && accResult.successes >= actReq && move.category !== "Support" && targets.map(tid => {
            const t = allEntries.find(e=>e.id===tid);
            if (!t) return null;
            const tm = getTypeMult(move.type as PokemonType, t.pokemon.types);
            const abilBonus = attacker.abilities.filter(a=>a.active).some(a=>a.name==="Blaze"&&attacker.currentHp<=attacker.maxHp/2)?2:0;
            const pool = calcDmgPool(move, attrs, weather, stab, abilBonus);
            const dr = dmgResults[tid];
            const def = move.category==="Physical"?t.attrs.vitality:t.attrs.insight;
            const finalDmg = dr ? Math.max(1, (tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes) - def) : null;
            return (
              <div key={tid} style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                  2. Damage → {t.nickname||t.pokemon.name} ({pool}d base)
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <button onClick={()=>doDmgForTarget(tid)} disabled={!!dr} style={{background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,color:dr?"#5a6080":"#f08030",padding:"5px 10px",fontSize:11,fontWeight:700,cursor:dr?"default":"pointer"}}>🎲 Roll Damage ({pool}d)</button>
                  {dr && <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700}}>[{dr.rolls.join(",")}] = {dr.successes} succ</span>}
                </div>
                {dr && tm.dmgMod !== -999 && (
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:11,color:"#8b90a8",marginBottom:6}}>
                      {dr.successes} succ {tm.dmgMod===2?"×2 (SE)":tm.dmgMod===-1?"×0.5 (NVE)":""} = {tm.dmgMod===2?Math.ceil(dr.successes*1.5):tm.dmgMod===-1?Math.max(1,dr.successes-1):dr.successes} − {def} DEF = <strong style={{color:"#ff4757"}}>{finalDmg} damage</strong>
                    </div>
                    <button onClick={()=>applyDmgToTarget(tid)} style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:"7px",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                      ⚔ Apply {finalDmg} damage to {t.nickname||t.pokemon.name}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Stat effects */}
          {canAct && accResult && accResult.successes >= actReq && statEffects.length > 0 && targets.length > 0 && (
            <div style={{background:"#13151f",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>Stat Changes (roll was successful)</div>
              {statEffects.map((se, i) => (
                <div key={i} style={{marginBottom:6}}>
                  {targets.map(tid => {
                    const t = allEntries.find(e=>e.id===tid);
                    return (
                      <button key={tid} onClick={()=>applyAttrEffect(tid, se.attr, se.amount)} style={{
                        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,cursor:"pointer",
                        background:se.amount<0?"rgba(255,71,87,0.1)":"rgba(0,212,170,0.1)",
                        border:`1px solid ${se.amount<0?"#ff475730":"#00d4aa30"}`,
                        color:se.amount<0?"#ff4757":"#00d4aa",fontSize:11,fontWeight:700,width:"100%",marginBottom:3,
                      }}>
                        {se.amount>0?"▲":"▼"} Apply {se.attr} {se.amount>0?"+":"−"}1 to {t?.nickname||t?.pokemon.name}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── End-of-Round Effects Popup ───────────────────────────────────────────────
function EndOfRoundPopup({ entries, weather, onApply, onClose }: {
  entries: BattleEntry[]; weather: WeatherData;
  onApply: (id: string, hpChange: number, reason: string) => void;
  onClose: () => void;
}) {
  const effects: {entry: BattleEntry; desc: string; hpChange: number}[] = [];
  entries.forEach(e => {
    const sc = STATUS_CONDITIONS[e.status];
    if (sc?.endOfRoundEffect) {
      const dmg = e.status==="Badly Poisoned"?2:1;
      effects.push({entry:e, desc:`${e.status}: ${sc.endOfRoundEffect}`, hpChange:-dmg});
    }
    if (e.status==="Burned") effects.push({entry:e,desc:"Burn: –1 HP (ignores defense)",hpChange:-1});
    if (weather.endOfRoundDmg && !e.weatherImmune && !(weather.immuneTypes??[]).some((t:string)=>e.pokemon.types.includes(t as PokemonType))) {
      effects.push({entry:e,desc:`${weather.name}: ${weather.endOfRoundDesc}`,hpChange:-weather.endOfRoundDmg});
    }
  });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:16,color:"#ffd32a",margin:0}}>🔄 End of Round Effects</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto"}}>
          {effects.length===0 ? (
            <div style={{color:"#5a6080",textAlign:"center",padding:20}}>No end-of-round effects this round.</div>
          ) : effects.map((ef,i) => (
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
          <button onClick={()=>{effects.forEach(ef=>onApply(ef.entry.id,ef.hpChange,ef.desc));onClose();}}
            style={{width:"100%",background:"#ff4757",color:"#fff",border:"none",borderRadius:5,padding:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:8}}>
            Apply All Effects
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Battle Card ─────────────────────────────────────────────────────────────
function BattleCard({ entry, allEntries, weather, isActive, onUpdate, onRemove }: {
  entry: BattleEntry; allEntries: BattleEntry[]; weather: WeatherData;
  isActive: boolean; onUpdate: (id:string,u:Partial<BattleEntry>)=>void; onRemove:(id:string)=>void;
}) {
  const [movePopup, setMovePopup] = useState<Move|null>(null);
  const [showEditMoves, setShowEditMoves] = useState(false);
  const upd = (u: Partial<BattleEntry>) => onUpdate(entry.id, u);
  const sc = STATUS_CONDITIONS[entry.status];
  const eff = getEffectiveAttrs(entry, weather);
  const sideColor = {player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[entry.side];
  const painPenalty = getPainPenalty(entry.currentHp, entry.maxHp);
  const disobedience = getDisobedienceLevel(entry.pokemon.suggestedRank, entry.trainerRank);

  const applyDmg = (targetId: string, dmg: number) => {
    onUpdate(targetId, { currentHp: Math.max(0, allEntries.find(e=>e.id===targetId)!.currentHp - dmg) });
  };
  const applyEffect = (targetId: string, attr: string, amount: number, source: string) => {
    const t = allEntries.find(e=>e.id===targetId);
    if (!t) return;
    const existing = t.statMods.findIndex(m=>m.attr===attr&&m.source===source);
    const newMods = [...t.statMods];
    if (existing>=0) newMods[existing].amount += amount;
    else newMods.push({source,attr,amount,durationType:"rounds"});
    onUpdate(targetId, {statMods:newMods});
  };

  // Active stat mods
  const attrModSummary = (attr: keyof typeof entry.attrs) => {
    const total = entry.statMods.filter(m=>m.attr===attr).reduce((s,m)=>s+m.amount,0);
    return total;
  };

  return (
    <>
      {movePopup && <MoveAttackPopup move={movePopup} attacker={entry} allEntries={allEntries} weather={weather}
        onClose={()=>setMovePopup(null)} onApplyDmg={applyDmg} onApplyEffect={applyEffect}/>}

      <div style={{
        background:entry.hasTakenTurn?"#13151f":"#1e2235",
        border:`1px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor+"40"}`,
        borderLeft:`3px solid ${isActive?sideColor:entry.hasTakenTurn?"#2a2f45":sideColor}`,
        borderRadius:8,opacity:entry.hasTakenTurn&&!isActive?0.65:1,
        boxShadow:isActive?`0 0 0 2px ${sideColor}30,0 4px 20px rgba(0,0,0,0.4)`:undefined,
        minWidth:320,flexShrink:0,
      }}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:isActive?sideColor+"15":"#13151f",borderRadius:"8px 8px 0 0"}}>
          <span style={{color:"#3a4060",cursor:"grab",fontSize:12}} title="Drag">⠿</span>
          <button onClick={()=>upd({hasTakenTurn:!entry.hasTakenTurn})} title="End turn"
            style={{width:18,height:18,borderRadius:"50%",border:"none",background:entry.hasTakenTurn?"#00d4aa":"#2a2f45",color:entry.hasTakenTurn?"#0f1117":"#5a6080",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✓</button>
          <div style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0}}/>
          <input value={entry.nickname} onChange={e=>upd({nickname:e.target.value})} placeholder={entry.pokemon.name}
            style={{flex:1,background:"transparent",border:"none",color:"#e8eaf0",fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,outline:"none",minWidth:0}}/>
          {isActive && <span style={{fontSize:9,fontWeight:700,color:sideColor,background:sideColor+"20",padding:"1px 5px",borderRadius:3}}>ACTIVE</span>}
          {disobedience!=="none" && <span style={{fontSize:9,color:disobedience==="high"?"#ff4757":"#ffd32a"}}>⚠{disobedience==="high"?"HIGH":"LOW"}</span>}
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <span style={{fontSize:9,color:"#5a6080"}}>INI:</span>
            <input type="number" value={entry.initiative} onChange={e=>upd({initiative:+e.target.value})}
              style={{width:30,background:"transparent",border:"none",color:"#6890f0",fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,textAlign:"center",outline:"none"}}/>
          </div>
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})}
            style={{background:"#0f1117",border:"none",color:sideColor,fontSize:9,borderRadius:2,padding:"1px 3px"}}>
            <option value="player">Player</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option>
          </select>
          <span style={{fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757"}}>{entry.currentHp}/{entry.maxHp}</span>
          <button onClick={()=>upd({isExpanded:!entry.isExpanded})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:11}}>{entry.isExpanded?"▲":"▼"}</button>
          <button onClick={()=>onRemove(entry.id)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12}}>✕</button>
        </div>

        <HpBar current={entry.currentHp} max={entry.maxHp}/>

        {entry.isExpanded && (
          <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:10}}>
            {/* Status */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <select value={entry.status} onChange={e=>upd({status:e.target.value,statusTurnsLeft:e.target.value==="Asleep"?3:0})}
                style={{background:"#0f1117",border:`1px solid ${sc?.color??"#2a2f45"}`,borderRadius:4,color:sc?.color??"#5a6080",fontSize:11,padding:"2px 6px",fontWeight:700}}>
                {Object.keys(STATUS_CONDITIONS).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              {sc && sc.name!=="Healthy" && (
                <div style={{fontSize:10,color:sc.color,flex:1,minWidth:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={sc.fullDesc}>
                  {sc.shortDesc}
                </div>
              )}
              {painPenalty > 0 && (
                <div style={{fontSize:10,color:"#ff4757",background:"rgba(255,71,87,0.1)",padding:"1px 5px",borderRadius:3}}>
                  Pain −{painPenalty} dice
                </div>
              )}
            </div>

            {/* HP + WP */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{label:"HP",cur:entry.currentHp,max:entry.maxHp,color:"#00d4aa",field:"currentHp" as const,maxF:"maxHp" as const},
                {label:"WP",cur:entry.currentWill,max:entry.maxWill,color:"#6890f0",field:"currentWill" as const,maxF:"maxWill" as const}].map(f=>(
                <div key={f.label}>
                  <div style={{fontSize:10,color:"#5a6080",marginBottom:3}}>{f.label}</div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <button onClick={()=>upd({[f.field]:Math.max(0,f.cur-1)})} style={adjBtn}>−</button>
                    <input type="number" value={f.cur} onChange={e=>upd({[f.field]:Math.max(0,Math.min(f.max,+e.target.value||0))})}
                      style={{width:34,textAlign:"center",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,color:f.color,fontSize:12,fontFamily:"'Exo 2'",fontWeight:700,padding:"1px 2px"}}/>
                    <span style={{fontSize:10,color:"#5a6080"}}>/{f.max}</span>
                    <button onClick={()=>upd({[f.field]:Math.min(f.max,f.cur+1)})} style={adjBtn}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Attributes with mods */}
            <div>
              <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Attributes</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{
                  const labels={strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};
                  const base = entry.attrs[attr];
                  const mod = attrModSummary(attr);
                  const eff2 = Math.max(0, base + mod);
                  const statusPen = attr==="dexterity"?(STATUS_CONDITIONS[entry.status]?.accuracyPenalty??0):0;
                  const final = Math.max(0, eff2 - statusPen);
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
              {/* Stat mods summary */}
              {entry.statMods.length > 0 && (
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
                const abData = ABILITIES.find(a=>a.name===ab.name);
                return (
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"5px 8px",background:ab.active?"rgba(0,212,170,0.06)":"rgba(90,96,128,0.1)",borderRadius:4,marginBottom:4,border:`1px solid ${ab.active?"#00d4aa20":"#3a4060"}`}}>
                    <button onClick={()=>{const abs=[...entry.abilities];abs[i]={...abs[i],active:!abs[i].active,disabledReason:abs[i].active?"Manually disabled":undefined};upd({abilities:abs});}}
                      style={{width:16,height:16,borderRadius:3,border:`1px solid ${ab.active?"#00d4aa":"#3a4060"}`,background:ab.active?"#00d4aa":"transparent",cursor:"pointer",flexShrink:0,marginTop:1}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:ab.active?"#e8eaf0":"#5a6080"}}>{ab.name}{!ab.active&&ab.disabledReason&&<span style={{fontSize:9,color:"#5a6080",marginLeft:4}}>({ab.disabledReason})</span>}</div>
                      {ab.active && abData && <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4,whiteSpace:"normal"}}>{abData.effect}</div>}
                    </div>
                  </div>
                );
              })}
              {entry.pokemon.number===0 && (
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
              {showEditMoves ? (
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  {MOVES.map(m=>{
                    const has=entry.moves.some(em=>em.name===m.name);
                    return (
                      <div key={m.name} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}>
                        <input type="checkbox" checked={has} onChange={()=>upd({moves:has?entry.moves.filter(em=>em.name!==m.name):[...entry.moves,m]})}/>
                        <TypeBadge type={m.type as PokemonType} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{m.name}</span>
                        <span style={{fontSize:9,color:"#5a6080",marginLeft:"auto"}}>{m.category}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {entry.moves.map((m,i)=>{
                    const stab2 = entry.pokemon.types.includes(m.type as PokemonType);
                    const wBoost = weather.typeBoost===m.type;
                    const wWeak = weather.typeWeaken===m.type;
                    const abilBonus = entry.abilities.filter(a=>a.active).some(a=>a.name==="Blaze"&&entry.currentHp<=entry.maxHp/2&&m.type==="Fire")?2:0;
                    return (
                      <button key={i} onClick={()=>setMovePopup(m)} style={{
                        display:"flex",alignItems:"center",gap:5,padding:"5px 8px",
                        background:"#13151f",border:`1px solid ${TYPE_COLORS[m.type as PokemonType]}25`,
                        borderRadius:4,cursor:"pointer",textAlign:"left",width:"100%",
                        transition:"border-color 0.1s",
                      }} onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type as PokemonType]}
                         onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=`${TYPE_COLORS[m.type as PokemonType]}25`}>
                        <TypeBadge type={m.type as PokemonType} small/>
                        <span style={{fontSize:12,color:"#e8eaf0",flex:1}}>{m.name}</span>
                        {stab2&&<span style={{fontSize:9,color:"#ffd32a",fontWeight:700}}>STAB</span>}
                        {wBoost&&<span style={{fontSize:9,color:"#f8d030"}}>{weather.emoji}</span>}
                        {wWeak&&<span style={{fontSize:9,color:"#6890f0"}}>↓</span>}
                        {abilBonus>0&&<span style={{fontSize:9,color:"#00d4aa"}}>+{abilBonus}</span>}
                        {m.power!=="-"&&<span style={{fontSize:9,color:"#5a6080"}}>P{m.power}</span>}
                        <span style={{fontSize:9,color:"#5a6080"}}>▶</span>
                      </button>
                    );
                  })}
                  {entry.moves.length===0&&<div style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>No moves. Click Edit to add.</div>}
                </div>
              )}
            </div>

            {/* Notes + weather immune */}
            <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Notes…"
              style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:10,padding:5,resize:"none",minHeight:32,fontFamily:"inherit",lineHeight:1.4,outline:"none"}}/>
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

// ─── GM Screen Panels ─────────────────────────────────────────────────────────
type PanelType = "tracker" | "notes" | "weather_ref" | "status_ref" | "type_chart" | "catch_ref" | "quick_roll";

interface Panel { id: string; type: PanelType; }

const PANEL_CATALOG: {type: PanelType; label: string; icon: string}[] = [
  {type:"tracker",icon:"⚔️",label:"Battle Tracker"},
  {type:"notes",icon:"📝",label:"GM Notes"},
  {type:"weather_ref",icon:"🌤️",label:"Weather Ref"},
  {type:"status_ref",icon:"💢",label:"Status Ref"},
  {type:"type_chart",icon:"🔣",label:"Type Chart"},
  {type:"catch_ref",icon:"🎯",label:"Catch Guide"},
  {type:"quick_roll",icon:"🎲",label:"Quick Roller"},
];

// ─── Main GM Screen ──────────────────────────────────────────────────────────
export default function GMScreen() {
  const [entries, setEntries] = useState<BattleEntry[]>(()=>loadFromStorage("bt_entries",[]));
  const [weather, setWeather] = useState<WeatherData>(WEATHER_DATA[0]);
  const [turn, setTurn] = useState(0); // index into sorted entries
  const [round, setRound] = useState(1);
  const [search, setSearch] = useState("");
  const [gmNotes, setGmNotes] = useState(()=>loadFromStorage("gm_notes",""));
  const [panels, setPanels] = useState<Panel[]>(()=>loadFromStorage("gm_panels",[{id:"1",type:"tracker"},{id:"2",type:"notes"}]));
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showEOR, setShowEOR] = useState(false);

  useEffect(()=>{saveToStorage("bt_entries",entries);},[entries]);
  useEffect(()=>{saveToStorage("gm_notes",gmNotes);},[gmNotes]);
  useEffect(()=>{saveToStorage("gm_panels",panels);},[panels]);

  const upd = useCallback((id:string,u:Partial<BattleEntry>)=>{
    setEntries(prev=>prev.map(e=>e.id===id?{...e,...u}:e));
  },[]);
  const remove = useCallback((id:string)=>{setEntries(prev=>prev.filter(e=>e.id!==id));},[]);

  const sorted = useMemo(()=>[...entries].sort((a,b)=>b.initiative-a.initiative),[entries]);
  const activeEntry = sorted[turn % Math.max(1,sorted.length)];

  const addPokemon = useCallback((pokemon:PokemonEntry)=>{
    const hp = pokemon.number===0?10:pokemon.baseHp+pokemon.attributes.vitality;
    const will = pokemon.number===0?5:pokemon.attributes.insight+3;
    const ini = Math.floor(Math.random()*6)+1+(pokemon.attributes?.dexterity??1);
    setEntries(prev=>[...prev,{
      id:`${pokemon.number}-${Date.now()}`,pokemon,nickname:pokemon.number===0?"Custom":"",
      initiative:ini,currentHp:hp,maxHp:hp,currentWill:will,maxWill:will,
      status:"Healthy",statusTurnsLeft:0,notes:"",isExpanded:true,hasTakenTurn:false,
      side:"enemy",trainerRank:"Rookie",
      abilities:pokemon.abilities.map(a=>({name:a,active:true})),
      moves:pokemon.moves.slice(0,4).map(m=>MOVES.find(mv=>mv.name===m.name)||{name:m.name,type:m.type,category:"Physical" as const,power:"-",accuracy:"-",damagePool:"-",effect:"",description:""}),
      attrs:{...pokemon.attributes},statMods:[],weatherImmune:false,actionCount:0,
    }]);
  },[]);

  const nextTurn = () => {
    // Mark current as taken turn
    if (activeEntry) upd(activeEntry.id,{hasTakenTurn:true,actionCount:0});
    const next = (turn+1)%Math.max(1,sorted.length);
    if (next === 0) {
      // New round
      setRound(r=>r+1);
      setEntries(prev=>prev.map(e=>({...e,hasTakenTurn:false})));
      setShowEOR(true);
    }
    setTurn(next);
  };

  const rollAllInitiative = () => {
    setEntries(prev=>prev.map(e=>({...e,initiative:Math.floor(Math.random()*6)+1+(e.attrs?.dexterity??1)})));
    setTurn(0);
  };

  const applyEOR = (id:string, hpChange:number, reason:string) => {
    setEntries(prev=>prev.map(e=>e.id===id?{...e,currentHp:Math.max(0,e.currentHp+hpChange)}:e));
  };

  const filteredPokemon = useMemo(()=>POKEMON.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||String(p.number).includes(search)),[search]);

  const addPanel = (type: PanelType) => {
    setPanels(prev=>[...prev,{id:Date.now().toString(),type}]);
    setShowAddPanel(false);
  };
  const removePanel = (id:string) => setPanels(prev=>prev.filter(p=>p.id!==id));

  const ALL_TYPES: PokemonType[] = ["Normal","Fire","Water","Electric","Grass","Ice","Fight","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

  const renderPanel = (panel: Panel) => {
    switch(panel.type) {
      case "tracker": return (
        <div style={{flex:"0 0 380px",display:"flex",flexDirection:"column",minHeight:0}}>
          {/* Pokédex strip */}
          <div style={{borderBottom:"1px solid #2a2f45",padding:"6px 8px",display:"flex",flexDirection:"column",gap:5}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",color:"#5a6080",fontSize:11,pointerEvents:"none"}}>🔍</span>
              <input type="text" placeholder="Add Pokémon to battle…" value={search} onChange={e=>setSearch(e.target.value)}
                style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:5,padding:"5px 7px 5px 24px",color:"#e8eaf0",fontSize:11,outline:"none"}}/>
            </div>
            <div style={{maxHeight:120,overflowY:"auto",display:"flex",flexDirection:"column",gap:1}}>
              <div onClick={()=>addPokemon(MISSINGNO)} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 6px",borderRadius:3,cursor:"pointer",border:"1px dashed #3a406060",background:"rgba(255,211,42,0.04)"}}
                onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="#ffd32a"}
                onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor="#3a406060"}>
                <span style={{fontSize:10,color:"#ffd32a",fontWeight:700}}>✦ Custom (Missingno.)</span>
              </div>
              {filteredPokemon.map(p=>(
                <div key={p.number} onClick={()=>addPokemon(p)} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 6px",borderRadius:3,cursor:"pointer"}}
                  onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#1e2235"}
                  onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
                  <span style={{fontSize:9,color:"#3a4060",width:24,fontFamily:"'Exo 2'",fontWeight:700}}>#{String(p.number).padStart(3,"0")}</span>
                  <span style={{fontSize:11,color:"#e8eaf0",flex:1}}>{p.name}</span>
                  <span style={{fontSize:8,color:RANK_COLORS[p.suggestedRank]}}>{p.suggestedRank}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Battle entries - horizontal scroll */}
          <div style={{flex:1,overflowY:"auto",padding:"8px 6px",display:"flex",flexDirection:"column",gap:8}}>
            {entries.length===0 ? (
              <div style={{textAlign:"center",color:"#5a6080",padding:30,fontSize:12}}>Add Pokémon above to start tracking</div>
            ) : sorted.map(e=>(
              <BattleCard key={e.id} entry={e} allEntries={entries} weather={weather}
                isActive={activeEntry?.id===e.id} onUpdate={upd} onRemove={remove}/>
            ))}
          </div>
        </div>
      );

      case "notes": return (
        <div style={{flex:"0 0 280px",display:"flex",flexDirection:"column",minHeight:0}}>
          <textarea value={gmNotes} onChange={e=>setGmNotes(e.target.value)} placeholder="Session notes, NPC details, secrets…"
            style={{flex:1,background:"transparent",border:"none",color:"#8b90a8",fontSize:12,padding:12,resize:"none",fontFamily:"inherit",lineHeight:1.6,outline:"none"}}/>
        </div>
      );

      case "weather_ref": return (
        <div style={{flex:"0 0 260px",overflowY:"auto",padding:"8px 10px"}}>
          {WEATHER_DATA.map(w=>(
            <div key={w.name} style={{marginBottom:10,background:"#13151f",borderRadius:6,padding:"8px 10px",border:`1px solid ${w.color}30`}}>
              <div style={{fontWeight:700,fontSize:12,color:"#e8eaf0",marginBottom:3}}>{w.emoji} {w.name}</div>
              <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{w.description}</div>
              {w.endOfRoundDmg&&<div style={{fontSize:10,color:"#ff4757",marginTop:3}}>🔄 End of round: {w.endOfRoundDesc}</div>}
            </div>
          ))}
        </div>
      );

      case "status_ref": return (
        <div style={{flex:"0 0 280px",overflowY:"auto",padding:"8px 10px"}}>
          {Object.values(STATUS_CONDITIONS).filter(s=>s.name!=="Healthy").map(sc=>(
            <div key={sc.name} style={{marginBottom:8,background:"#13151f",borderRadius:6,padding:"8px 10px",border:`1px solid ${sc.color}30`}}>
              <div style={{fontWeight:700,fontSize:12,color:sc.color,marginBottom:3}}>{sc.name}</div>
              <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{sc.fullDesc}</div>
              {sc.endOfRoundEffect&&<div style={{fontSize:10,color:"#ff4757",marginTop:2}}>🔄 {sc.endOfRoundEffect}</div>}
            </div>
          ))}
        </div>
      );

      case "type_chart": return (
        <div style={{flex:"0 0 360px",overflowY:"auto",padding:"8px 6px"}}>
          <table style={{borderCollapse:"collapse",width:"100%",fontSize:9}}>
            <thead>
              <tr>
                <th style={{padding:"4px 6px",color:"#5a6080",background:"#13151f",borderBottom:"1px solid #2a2f45",textAlign:"left"}}>Type</th>
                <th style={{padding:"4px 6px",color:"#ff4757",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Weak</th>
                <th style={{padding:"4px 6px",color:"#00d4aa",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Resists</th>
                <th style={{padding:"4px 6px",color:"#ffd32a",background:"#13151f",borderBottom:"1px solid #2a2f45"}}>Immune</th>
              </tr>
            </thead>
            <tbody>
              {ALL_TYPES.map((t,i)=>{
                const c=TYPE_CHART[t];
                return (
                  <tr key={t} style={{background:i%2===0?"transparent":"#1e223520"}}>
                    <td style={{padding:"3px 6px"}}><span style={{display:"inline-flex",padding:"1px 5px",borderRadius:2,fontSize:8,fontWeight:700,color:"#fff",background:TYPE_COLORS[t]}}>{t}</span></td>
                    <td style={{padding:"3px 6px"}}><div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{c.weaknesses.map(w=><span key={w} style={{display:"inline-flex",padding:"0px 3px",borderRadius:2,fontSize:7,fontWeight:700,color:"#fff",background:TYPE_COLORS[w]}}>{w}</span>)}</div></td>
                    <td style={{padding:"3px 6px"}}><div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{c.resistances.map(r=><span key={r} style={{display:"inline-flex",padding:"0px 3px",borderRadius:2,fontSize:7,fontWeight:700,color:"#fff",background:TYPE_COLORS[r]}}>{r}</span>)}</div></td>
                    <td style={{padding:"3px 6px"}}><div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{c.immunities.map(im=><span key={im} style={{display:"inline-flex",padding:"0px 3px",borderRadius:2,fontSize:7,fontWeight:700,color:"#fff",background:TYPE_COLORS[im]}}>{im}</span>)}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );

      case "catch_ref": return (
        <div style={{flex:"0 0 240px",overflowY:"auto",padding:"10px 12px"}}>
          <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0",marginBottom:10}}>🎯 Catching Pokémon</div>
          <div style={{fontSize:11,color:"#8b90a8",lineHeight:1.6,marginBottom:10}}>Roll <strong style={{color:"#e8eaf0"}}>DEX/STR + Throw</strong> to throw the Pokéball, then roll the Seal Potency.</div>
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Required Successes</div>
          {(["Starter","Rookie","Standard","Advanced","Expert","Ace"] as Rank[]).map((r,i)=>(
            <div key={r} style={{display:"flex",justifyContent:"space-between",padding:"3px 8px",background:i%2===0?"#13151f":"transparent",borderRadius:3,fontSize:11}}>
              <span style={{color:RANK_COLORS[r]}}>{r}</span>
              <span style={{color:"#e8eaf0",fontWeight:700}}>{[3,4,6,8,9,10][i]} successes</span>
            </div>
          ))}
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginTop:10,marginBottom:5}}>Bonus Successes</div>
          {[["At half HP","+ 1"],["At 1 HP","+ 2"],["Status Ailment","+ 1 each"]].map(([c,b])=>(
            <div key={c} style={{display:"flex",justifyContent:"space-between",padding:"3px 8px",fontSize:11}}>
              <span style={{color:"#8b90a8"}}>{c}</span>
              <span style={{color:"#00d4aa",fontWeight:700}}>{b}</span>
            </div>
          ))}
          <div style={{fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginTop:10,marginBottom:5}}>Ball Seal Potency</div>
          {[["Pokéball","4d"],["Great Ball","6d"],["Ultra Ball","8d"]].map(([b,p])=>(
            <div key={b} style={{display:"flex",justifyContent:"space-between",padding:"3px 8px",fontSize:11}}>
              <span style={{color:"#8b90a8"}}>{b}</span>
              <span style={{color:"#ffd32a",fontWeight:700}}>{p}</span>
            </div>
          ))}
        </div>
      );

      case "quick_roll": return (
        <div style={{flex:"0 0 220px",padding:"10px 12px"}}>
          <div style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:"#e8eaf0",marginBottom:10}}>🎲 Quick Roller</div>
          {[1,2,3,4,5,6,8,10,12].map(n=>{
            const [res,setRes]=useState<{rolls:number[];s:number}|null>(null);
            return (
              <div key={n} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                <button onClick={()=>{const r=rollDice(n);setRes({rolls:r.rolls,s:r.successes});}} style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:4,color:"#6890f0",padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Exo 2'"}}>
                  {n}d
                </button>
                {res&&<span style={{fontSize:10,fontFamily:"'Exo 2'",color:"#e8eaf0"}}>[{res.rolls.join(",")}] <span style={{color:"#00d4aa",fontWeight:700}}>{res.s}✓</span></span>}
              </div>
            );
          })}
        </div>
      );
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",overflow:"hidden"}}>
      {/* Nav */}
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 12px",height:48,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#a040a0",fontWeight:700}}>🖥️ GM Screen</span>

        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {/* Weather */}
          <select value={weather.name} onChange={e=>setWeather(WEATHER_DATA.find(w=>w.name===e.target.value)!)}
            style={{background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#ffd32a",fontSize:11,padding:"3px 6px"}}>
            {WEATHER_DATA.map(w=><option key={w.name} value={w.name}>{w.emoji} {w.name}</option>)}
          </select>

          {/* Turn tracker */}
          <div style={{display:"flex",alignItems:"center",gap:6,background:"#1e2235",border:"1px solid #2a2f45",borderRadius:5,padding:"3px 10px"}}>
            <span style={{fontSize:10,color:"#5a6080"}}>Round</span>
            <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:"#e8eaf0"}}>{round}</span>
            <span style={{fontSize:10,color:"#5a6080"}}>·</span>
            <span style={{fontSize:10,color:"#5a6080"}}>Turn</span>
            <span style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:activeEntry?{player:"#00d4aa",enemy:"#ff4757",neutral:"#8b90a8"}[activeEntry.side]:"#5a6080"}}>
              {activeEntry?.nickname||activeEntry?.pokemon.name||"—"}
            </span>
          </div>
          <button onClick={nextTurn} style={{background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:5,padding:"5px 12px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Exo 2'"}}>
            Next Turn ▶
          </button>
          <button onClick={rollAllInitiative} style={{background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            🎲 Roll Initiative
          </button>
          <button onClick={()=>setShowAddPanel(!showAddPanel)} style={{background:"rgba(160,64,160,0.15)",border:"1px solid rgba(160,64,160,0.4)",borderRadius:4,color:"#a040a0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            + Panel
          </button>
        </div>
      </nav>

      {/* Add panel dropdown */}
      {showAddPanel && (
        <div style={{background:"#1e2235",border:"1px solid #3a4060",borderRadius:6,padding:10,position:"absolute",top:54,right:12,zIndex:100,display:"flex",gap:6,flexWrap:"wrap",maxWidth:300,boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
          {PANEL_CATALOG.map(p=>(
            <button key={p.type} onClick={()=>addPanel(p.type)} style={{background:"#13151f",border:"1px solid #2a2f45",borderRadius:5,color:"#e8eaf0",padding:"6px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Weather banner */}
      {weather.name!=="Clear" && (
        <div style={{background:weather.color+"12",borderBottom:`1px solid ${weather.color}30`,padding:"4px 16px",display:"flex",alignItems:"center",gap:8,fontSize:11,flexShrink:0}}>
          <span>{weather.emoji.split(" ")[0]}</span>
          <span style={{fontWeight:700,color:"#e8eaf0"}}>{weather.name}</span>
          <span style={{color:"#8b90a8"}}>{weather.description}</span>
          {weather.endOfRoundDmg&&<span style={{color:"#ff4757",marginLeft:"auto"}}>🔄 End of round: chip damage</span>}
        </div>
      )}

      {/* End of Round popup */}
      {showEOR && <EndOfRoundPopup entries={entries} weather={weather} onApply={applyEOR} onClose={()=>setShowEOR(false)}/>}

      {/* Panel columns */}
      <div style={{flex:1,display:"flex",overflowX:"auto",overflowY:"hidden",gap:0}}>
        {panels.map((panel,i)=>(
          <div key={panel.id} style={{
            display:"flex",flexDirection:"column",borderRight:"1px solid #2a2f45",
            minHeight:0,flexShrink:0,
          }}>
            {/* Panel header */}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#13151f",borderBottom:"1px solid #2a2f45",flexShrink:0}}>
              <span style={{fontSize:12}}>{PANEL_CATALOG.find(p=>p.type===panel.type)?.icon}</span>
              <span style={{fontSize:12,fontWeight:600,color:"#e8eaf0",flex:1}}>{PANEL_CATALOG.find(p=>p.type===panel.type)?.label}</span>
              <button onClick={()=>removePanel(panel.id)} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12}}>✕</button>
            </div>
            {/* Panel content */}
            <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
              {renderPanel(panel)}
            </div>
          </div>
        ))}
        {panels.length===0&&(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#5a6080"}}>
            <div style={{fontSize:40}}>🖥️</div>
            <div style={{fontSize:14}}>No panels added. Click <strong style={{color:"#a040a0"}}>+ Panel</strong> to add reference panels.</div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  POKEMON, MOVES, ABILITIES, ITEMS, TYPE_COLORS, TYPE_CHART,
  STATUS_EFFECTS, WEATHER_EFFECTS, MISSINGNO,
  PokemonEntry, Move, PokemonType, Rank, WeatherEffect,
} from "../data/pokerole-data";
import { saveToStorage, loadFromStorage } from "../lib/storage";

// ─── Types ────────────────────────────────────────────────────────────────────
const RANK_COLORS: Record<Rank, string> = {
  Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",
  Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700",
};

interface TrackedMove extends Move {
  learned?: boolean;
}

interface BattleEntry {
  id: string;
  pokemon: PokemonEntry;
  nickname: string;
  initiative: number;
  currentHp: number;
  maxHp: number;
  currentWill: number;
  maxWill: number;
  status: string;
  notes: string;
  isExpanded: boolean;
  hasTakenTurn: boolean;
  side: "player" | "enemy" | "neutral";
  activeAbility: string;
  moves: TrackedMove[];
  // Live attribute mods (base + adjustments)
  attrs: { strength: number; dexterity: number; vitality: number; special: number; insight: number };
  weatherImmune: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function TypeBadge({ type, small }: { type: PokemonType; small?: boolean }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",padding:small?"1px 5px":"2px 7px",
      borderRadius:3,fontSize:small?9:11,fontWeight:700,color:"#fff",
      background:TYPE_COLORS[type],textShadow:"0 1px 2px rgba(0,0,0,0.4)",
    }}>{type}</span>
  );
}

function rollDice(pool: number): { rolls: number[]; successes: number } {
  const rolls = Array.from({ length: Math.max(0, pool) }, () => Math.floor(Math.random() * 6) + 1);
  return { rolls, successes: rolls.filter(r => r >= 4).length };
}

function getEffectiveAttrs(entry: BattleEntry): typeof entry.attrs {
  const status = STATUS_EFFECTS[entry.status];
  return {
    strength: Math.max(0, entry.attrs.strength - (status?.modifiers.strengthPenalty ?? 0)),
    dexterity: Math.max(0, entry.attrs.dexterity - (status?.modifiers.dexterityPenalty ?? 0)),
    vitality: entry.attrs.vitality,
    special: Math.max(0, entry.attrs.special - (status?.modifiers.specialPenalty ?? 0)),
    insight: entry.attrs.insight,
  };
}

type AttrSet = { strength: number; dexterity: number; vitality: number; special: number; insight: number };

function parseAccuracyPool(move: TrackedMove, attrs: AttrSet): number {
  const acc = move.accuracy.toLowerCase();
  let pool = 0;
  if (acc.includes("strength")) pool += attrs.strength;
  if (acc.includes("dexterity")) pool += attrs.dexterity;
  if (acc.includes("vitality")) pool += attrs.vitality;
  if (acc.includes("special")) pool += attrs.special;
  if (acc.includes("insight")) pool += attrs.insight;
  // skill bonus (rough estimate)
  if (acc.includes("brawl") || acc.includes("athletic") || acc.includes("channel") || acc.includes("intimidate")) pool += 2;
  // extract "+N" from move power for damage
  return Math.max(1, pool);
}

function parseDamagePool(move: TrackedMove, attrs: AttrSet, weather: WeatherEffect, stab: boolean): number {
  const dmg = move.damagePool.toLowerCase();
  let pool = 0;
  if (dmg.includes("strength")) pool += attrs.strength;
  if (dmg.includes("special")) pool += attrs.special;
  const powerMatch = move.power.match(/\d+/);
  if (powerMatch) pool += parseInt(powerMatch[0]);
  if (stab) pool += 1;
  // Weather boost
  if (weather.modifiers.typeBoost === move.type) pool += 1;
  if (weather.modifiers.typeWeaken === move.type) pool = Math.max(1, pool - 1);
  return Math.max(1, pool);
}

function getTypeMultiplier(moveType: PokemonType, defenderTypes: PokemonType[]): { label: string; color: string; defenseMod: number } {
  let isWeak = false; let isResist = false; let isImmune = false;
  defenderTypes.forEach(dt => {
    const chart = TYPE_CHART[dt];
    if (chart.weaknesses.includes(moveType)) isWeak = true;
    if (chart.resistances.includes(moveType)) isResist = true;
    if (chart.immunities.includes(moveType)) isImmune = true;
  });
  if (isImmune) return { label: "IMMUNE", color: "#5a6080", defenseMod: 999 };
  if (isWeak) return { label: "SUPER EFFECTIVE ×2", color: "#ff4757", defenseMod: -1 };
  if (isResist) return { label: "Not very effective ×0.5", color: "#00d4aa", defenseMod: 1 };
  return { label: "Normal", color: "#8b90a8", defenseMod: 0 };
}

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = pct > 0.5 ? "#00d4aa" : pct > 0.25 ? "#ffd32a" : "#ff4757";
  return (
    <div style={{ background: "#0f1117", borderRadius: 3, height: 5, overflow: "hidden", marginTop: 2 }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

// ─── Move Popup ───────────────────────────────────────────────────────────────
function MovePopup({
  move, attacker, allEntries, weather, onClose,
}: {
  move: TrackedMove;
  attacker: BattleEntry;
  allEntries: BattleEntry[];
  weather: WeatherEffect;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<BattleEntry | null>(null);
  const [accResult, setAccResult] = useState<{ rolls: number[]; successes: number } | null>(null);
  const [dmgResult, setDmgResult] = useState<{ rolls: number[]; successes: number } | null>(null);
  const attrs = getEffectiveAttrs(attacker);
  const stab = attacker.pokemon.types.includes(move.type);
  const accPool = parseAccuracyPool(move, attrs);
  const dmgPool = target ? parseDamagePool(move, attrs, weather, stab) : 0;

  const typeMatch = target ? getTypeMultiplier(move.type, target.pokemon.types) : null;

  const targets = allEntries.filter(e => e.id !== attacker.id);

  const applyDamage = () => {
    if (!target || !dmgResult || typeMatch?.label === "IMMUNE") return;
    const defense = move.category === "Physical" ? target.attrs.vitality : target.attrs.insight;
    let rawDmg = dmgResult.successes;
    if (typeMatch?.label.includes("SUPER")) rawDmg = Math.ceil(rawDmg * 1.5);
    if (typeMatch?.label.includes("very effective")) rawDmg = Math.max(0, rawDmg - 1);
    const finalDmg = Math.max(1, rawDmg - defense);
    alert(`${attacker.nickname || attacker.pokemon.name} hits ${target.nickname || target.pokemon.name} for ${finalDmg} damage!\n(${dmgResult.successes} successes − ${defense} defense${typeMatch?.label !== "Normal" ? ` + type modifier` : ""} = ${finalDmg})`);
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#1e2235",border:"1px solid #3a4060",borderRadius:10,width:460,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column" }}>
        {/* Header */}
        <div style={{ padding:"12px 16px",borderBottom:"1px solid #2a2f45",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:4 }}>
              <TypeBadge type={move.type} />
              <span style={{ fontSize:11,fontWeight:700,color:move.category==="Physical"?"#f08030":move.category==="Special"?"#6890f0":"#78c850" }}>{move.category}</span>
              {stab && <span style={{ fontSize:10,fontWeight:700,color:"#ffd32a",background:"rgba(255,211,42,0.12)",padding:"1px 5px",borderRadius:3 }}>STAB +1</span>}
            </div>
            <h3 style={{ fontFamily:"'Exo 2'",fontWeight:800,fontSize:18,color:"#e8eaf0",margin:0 }}>{move.name}</h3>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:18 }}>✕</button>
        </div>

        <div style={{ padding:16,overflowY:"auto" }}>
          {/* Effect text */}
          <p style={{ fontSize:12,color:"#8b90a8",marginBottom:12,lineHeight:1.5 }}>{move.description}</p>
          <div style={{ background:"#13151f",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#e8eaf0",lineHeight:1.6 }}>
            <strong style={{ color:"#5a6080" }}>Effect:</strong> {move.effect}
          </div>

          {/* Weather modifier */}
          {(weather.modifiers.typeBoost===move.type||weather.modifiers.typeWeaken===move.type)&&(
            <div style={{ background:"rgba(255,211,42,0.1)",border:"1px solid rgba(255,211,42,0.3)",borderRadius:4,padding:"6px 10px",marginBottom:12,fontSize:11,color:"#ffd32a" }}>
              {weather.emoji} {weather.name}: {weather.modifiers.typeBoost===move.type?"+1 die to damage pool":"−1 die to damage pool"}
            </div>
          )}

          {/* Target selector */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6 }}>Select Target</div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {targets.map(t => (
                <button key={t.id} onClick={()=>setTarget(t)} style={{
                  padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",
                  border:`1px solid ${target?.id===t.id?TYPE_COLORS[t.pokemon.types[0]]:"#3a4060"}`,
                  background:target?.id===t.id?TYPE_COLORS[t.pokemon.types[0]]+"20":"transparent",
                  color:target?.id===t.id?"#e8eaf0":"#8b90a8",
                }}>
                  {t.nickname||t.pokemon.name} ({t.currentHp}/{t.maxHp} HP)
                </button>
              ))}
            </div>
          </div>

          {/* Type effectiveness */}
          {target && typeMatch && (
            <div style={{ background:typeMatch.color+"15",border:`1px solid ${typeMatch.color}40`,borderRadius:4,padding:"6px 10px",marginBottom:12,fontSize:12,fontWeight:700,color:typeMatch.color }}>
              {typeMatch.label}
            </div>
          )}

          {/* Accuracy roll */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6 }}>
              1. Accuracy Roll — {move.accuracy} ({accPool} dice)
            </div>
            <button onClick={()=>setAccResult(rollDice(accPool))} style={{
              background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,
              color:"#6890f0",padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",marginRight:8,
            }}>🎲 Roll Accuracy ({accPool}d)</button>
            {accResult && (
              <span style={{ fontSize:12,fontFamily:"'Exo 2'",fontWeight:700 }}>
                [{accResult.rolls.join(",")}] = <span style={{ color:accResult.successes>0?"#00d4aa":"#ff4757" }}>{accResult.successes} hits</span>
              </span>
            )}
          </div>

          {/* Damage roll */}
          {move.category !== "Support" && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6 }}>
                2. Damage Roll — {move.damagePool}{stab?" +1 STAB":""}{weather.modifiers.typeBoost===move.type?" +1 Weather":""}
                {target ? ` = ${parseDamagePool(move,attrs,weather,stab)} dice` : ""}
              </div>
              <button onClick={()=>setDmgResult(rollDice(parseDamagePool(move,attrs,weather,stab)))} 
                disabled={!accResult||accResult.successes===0}
                style={{
                  background:"#f0803020",border:"1px solid #f0803060",borderRadius:4,
                  color:(!accResult||accResult.successes===0)?"#5a6080":"#f08030",
                  padding:"6px 14px",fontSize:12,fontWeight:700,cursor:(!accResult||accResult.successes===0)?"not-allowed":"pointer",marginRight:8,
                  opacity:(!accResult||accResult.successes===0)?0.5:1,
                }}>🎲 Roll Damage ({parseDamagePool(move,attrs,weather,stab)}d)</button>
              {dmgResult && (
                <span style={{ fontSize:12,fontFamily:"'Exo 2'",fontWeight:700 }}>
                  [{dmgResult.rolls.join(",")}] = <span style={{ color:"#f08030" }}>{dmgResult.successes}</span>
                </span>
              )}
            </div>
          )}

          {/* Apply damage button */}
          {target && dmgResult && typeMatch?.label !== "IMMUNE" && (
            <button onClick={applyDamage} style={{
              background:"#ff4757",color:"#fff",border:"none",borderRadius:6,
              padding:"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Exo 2'",width:"100%",
            }}>
              ⚔️ Calculate & Apply Damage to {target.nickname||target.pokemon.name}
            </button>
          )}
          {typeMatch?.label === "IMMUNE" && (
            <div style={{ background:"#5a608020",border:"1px solid #5a6080",borderRadius:4,padding:8,textAlign:"center",color:"#5a6080",fontSize:13,fontWeight:700 }}>
              No effect — target is immune to {move.type}-type moves
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Battle Card ─────────────────────────────────────────────────────────────
function BattleCard({
  entry, allEntries, weather, onUpdate, onRemove, isDragging,
}: {
  entry: BattleEntry;
  allEntries: BattleEntry[];
  weather: WeatherEffect;
  onUpdate: (id: string, u: Partial<BattleEntry>) => void;
  onRemove: (id: string) => void;
  isDragging?: boolean;
}) {
  const [movePopup, setMovePopup] = useState<TrackedMove | null>(null);
  const [showEditMoves, setShowEditMoves] = useState(false);
  const upd = (u: Partial<BattleEntry>) => onUpdate(entry.id, u);
  const status = STATUS_EFFECTS[entry.status];
  const eff = getEffectiveAttrs(entry);

  const abilityData = ABILITIES.find(a => a.name === entry.activeAbility);

  // Weather effects on this pokemon
  const weatherDmgImmune = weather.modifiers.immuneTypes?.some(t => entry.pokemon.types.includes(t));
  const weatherBoostsType = weather.modifiers.typeBoost;
  const hasSTAB = (type: PokemonType) => entry.pokemon.types.includes(type);

  const sideColors = { player: "#00d4aa", enemy: "#ff4757", neutral: "#8b90a8" };

  return (
    <>
      {movePopup && (
        <MovePopup
          move={movePopup} attacker={entry} allEntries={allEntries}
          weather={weather} onClose={() => setMovePopup(null)}
        />
      )}

      <div style={{
        background: entry.hasTakenTurn ? "#161925" : "#1e2235",
        border: `1px solid ${entry.hasTakenTurn ? "#2a2f45" : sideColors[entry.side]}40`,
        borderLeft: `3px solid ${entry.hasTakenTurn ? "#2a2f45" : sideColors[entry.side]}`,
        borderRadius: 8, marginBottom: 8, overflow: "hidden",
        opacity: entry.hasTakenTurn ? 0.7 : 1,
        cursor: isDragging ? "grabbing" : "default",
      }}>
        {/* Card header */}
        <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#13151f" }}>
          {/* Drag handle */}
          <span style={{ color:"#3a4060",cursor:"grab",fontSize:14,flexShrink:0 }} title="Drag to reorder">⠿</span>

          {/* Turn done button */}
          <button
            onClick={() => upd({ hasTakenTurn: !entry.hasTakenTurn })}
            title={entry.hasTakenTurn ? "Undo turn" : "End turn"}
            style={{
              width: 20, height: 20, borderRadius: "50%", border: "none",
              background: entry.hasTakenTurn ? "#00d4aa40" : "#2a2f45",
              color: entry.hasTakenTurn ? "#00d4aa" : "#5a6080",
              cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>✓</button>

          {/* Type dot */}
          <div style={{ width:8,height:8,borderRadius:"50%",background:TYPE_COLORS[entry.pokemon.types[0]],flexShrink:0 }} />

          {/* Name (editable) */}
          <input
            value={entry.nickname}
            onChange={e => upd({ nickname: e.target.value })}
            placeholder={entry.pokemon.name}
            style={{
              flex:1,background:"transparent",border:"none",color:"#e8eaf0",
              fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,outline:"none",minWidth:0,
            }}
          />

          <span style={{ fontSize:10,color:"#5a6080",flexShrink:0 }}>INI:{entry.initiative}</span>

          {/* Side selector */}
          <select value={entry.side} onChange={e=>upd({side:e.target.value as BattleEntry["side"]})}
            style={{ background:"#0f1117",border:"none",color:sideColors[entry.side],fontSize:10,borderRadius:3,padding:"1px 4px" }}>
            <option value="player">Player</option>
            <option value="enemy">Enemy</option>
            <option value="neutral">Neutral</option>
          </select>

          {/* HP display */}
          <span style={{
            fontSize:11,fontFamily:"'Exo 2'",fontWeight:700,flexShrink:0,
            color:entry.currentHp/entry.maxHp>0.5?"#00d4aa":entry.currentHp/entry.maxHp>0.25?"#ffd32a":"#ff4757",
          }}>{entry.currentHp}/{entry.maxHp}</span>

          {/* Expand/collapse */}
          <button onClick={()=>upd({isExpanded:!entry.isExpanded})}
            style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:12,padding:2}}>
            {entry.isExpanded?"▲":"▼"}
          </button>
          <button onClick={()=>onRemove(entry.id)}
            style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer",fontSize:13,padding:2}}>✕</button>
        </div>

        {/* HP bar */}
        <HpBar current={entry.currentHp} max={entry.maxHp} />

        {entry.isExpanded && (
          <div style={{ padding:"10px 12px",display:"flex",flexDirection:"column",gap:10 }}>
            {/* Status & weather badge */}
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",alignItems:"center" }}>
              <select value={entry.status} onChange={e=>upd({status:e.target.value})}
                style={{ background:"#0f1117",border:`1px solid ${status?.color??"#2a2f45"}`,borderRadius:4,
                  color:status?.color??"#5a6080",fontSize:11,padding:"2px 6px",fontWeight:700 }}>
                {Object.keys(STATUS_EFFECTS).map(s=>(
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {status && status.name !== "Healthy" && (
                <div style={{ fontSize:10,color:status.color,background:status.color+"15",padding:"2px 6px",borderRadius:3 }}>
                  {status.description.slice(0,60)}…
                </div>
              )}
              {!entry.weatherImmune && weather.name!=="Clear" && (
                <div style={{ fontSize:10,color:"#ffd32a",background:"rgba(255,211,42,0.1)",padding:"2px 6px",borderRadius:3 }}>
                  {weather.emoji} Affected by {weather.name}
                </div>
              )}
            </div>

            {/* HP + WP controls */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
              <div>
                <div style={{ fontSize:10,color:"#5a6080",marginBottom:3 }}>HP</div>
                <div style={{ display:"flex",gap:4,alignItems:"center" }}>
                  <button onClick={()=>upd({currentHp:Math.max(0,entry.currentHp-1)})} style={adjBtn}>−</button>
                  <input type="number" value={entry.currentHp}
                    onChange={e=>upd({currentHp:Math.max(0,Math.min(entry.maxHp,+e.target.value||0))})}
                    style={{ width:36,textAlign:"center",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,color:"#e8eaf0",fontSize:12,padding:"1px 2px" }}/>
                  <span style={{ fontSize:10,color:"#5a6080" }}>/{entry.maxHp}</span>
                  <button onClick={()=>upd({currentHp:Math.min(entry.maxHp,entry.currentHp+1)})} style={adjBtn}>+</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize:10,color:"#5a6080",marginBottom:3 }}>WP</div>
                <div style={{ display:"flex",gap:4,alignItems:"center" }}>
                  <button onClick={()=>upd({currentWill:Math.max(0,entry.currentWill-1)})} style={adjBtn}>−</button>
                  <input type="number" value={entry.currentWill}
                    onChange={e=>upd({currentWill:Math.max(0,Math.min(entry.maxWill,+e.target.value||0))})}
                    style={{ width:36,textAlign:"center",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:3,color:"#6890f0",fontSize:12,padding:"1px 2px" }}/>
                  <span style={{ fontSize:10,color:"#5a6080" }}>/{entry.maxWill}</span>
                  <button onClick={()=>upd({currentWill:Math.min(entry.maxWill,entry.currentWill+1)})} style={adjBtn}>+</button>
                </div>
              </div>
            </div>

            {/* Attributes (editable) */}
            <div>
              <div style={{ fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6 }}>Attributes</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4 }}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr=>{
                  const labels: Record<string,string> = {strength:"STR",dexterity:"DEX",vitality:"VIT",special:"SPC",insight:"INS"};
                  const effVal = eff[attr];
                  const baseVal = entry.attrs[attr];
                  const isReduced = effVal < baseVal;
                  return (
                    <div key={attr} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:9,color:"#5a6080",marginBottom:2 }}>{labels[attr]}</div>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:2 }}>
                        <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:Math.max(0,entry.attrs[attr]-1)}})} style={{ ...adjBtn,width:16,height:16,fontSize:12 }}>−</button>
                        <span style={{ fontSize:13,fontFamily:"'Exo 2'",fontWeight:700,color:isReduced?"#ff4757":"#e8eaf0",minWidth:16,textAlign:"center" }}>
                          {effVal}{isReduced&&<sup style={{fontSize:8,color:"#ff4757"}}>({baseVal})</sup>}
                        </span>
                        <button onClick={()=>upd({attrs:{...entry.attrs,[attr]:entry.attrs[attr]+1}})} style={{ ...adjBtn,width:16,height:16,fontSize:12 }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Ability */}
            <div>
              <div style={{ fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4 }}>Active Ability</div>
              <select value={entry.activeAbility} onChange={e=>upd({activeAbility:e.target.value})}
                style={{ background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#e8eaf0",fontSize:11,padding:"3px 6px",width:"100%" }}>
                <option value="">— None —</option>
                {entry.pokemon.abilities.map(a=><option key={a} value={a}>{a}</option>)}
                {entry.pokemon.number===0&&ABILITIES.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
              {abilityData && (
                <div style={{ fontSize:10,color:"#8b90a8",marginTop:4,padding:"4px 6px",background:"#13151f",borderRadius:3,lineHeight:1.4 }}>
                  {abilityData.effect}
                </div>
              )}
            </div>

            {/* Moves */}
            <div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
                <div style={{ fontSize:10,color:"#5a6080",letterSpacing:"1px",textTransform:"uppercase" }}>Moves</div>
                <button onClick={()=>setShowEditMoves(!showEditMoves)}
                  style={{ fontSize:10,color:"#00d4aa",background:"none",border:"none",cursor:"pointer" }}>
                  {showEditMoves?"Done":"+ Edit"}
                </button>
              </div>

              {showEditMoves ? (
                <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  <div style={{ fontSize:10,color:"#5a6080",marginBottom:4 }}>Select moves to add:</div>
                  {MOVES.map(m => {
                    const has = entry.moves.some(em=>em.name===m.name);
                    return (
                      <div key={m.name} style={{ display:"flex",alignItems:"center",gap:6 }}>
                        <input type="checkbox" checked={has}
                          onChange={()=>{
                            if(has) upd({moves:entry.moves.filter(em=>em.name!==m.name)});
                            else upd({moves:[...entry.moves,{...m,learned:true}]});
                          }}/>
                        <TypeBadge type={m.type} small/><span style={{fontSize:11,color:"#e8eaf0"}}>{m.name}</span>
                        <span style={{fontSize:10,color:"#5a6080",marginLeft:"auto"}}>{m.category}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                  {entry.moves.map((m,i)=>{
                    const stabBonus = hasSTAB(m.type);
                    const weatherBoost = weatherBoostsType === m.type;
                    return (
                      <button key={i} onClick={()=>setMovePopup(m)}
                        style={{
                          display:"flex",alignItems:"center",gap:6,padding:"5px 8px",
                          background:"#13151f",border:`1px solid ${TYPE_COLORS[m.type]}30`,
                          borderRadius:4,cursor:"pointer",transition:"border-color 0.1s",textAlign:"left",
                          width:"100%",
                        }}
                        onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=TYPE_COLORS[m.type]}
                        onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=`${TYPE_COLORS[m.type]}30`}>
                        <TypeBadge type={m.type} small/>
                        <span style={{fontSize:12,color:"#e8eaf0",flex:1}}>{m.name}</span>
                        {stabBonus&&<span style={{fontSize:9,color:"#ffd32a"}}>STAB</span>}
                        {weatherBoost&&<span style={{fontSize:9,color:"#f8d030"}}>{weather.emoji}</span>}
                        {m.power!=="-"&&<span style={{fontSize:10,color:"#8b90a8"}}>PWR {m.power}</span>}
                        <span style={{fontSize:9,color:"#5a6080"}}>▶</span>
                      </button>
                    );
                  })}
                  {entry.moves.length===0&&<div style={{fontSize:11,color:"#5a6080",fontStyle:"italic"}}>No moves. Click Edit to add.</div>}
                </div>
              )}
            </div>

            {/* Notes */}
            <textarea value={entry.notes} onChange={e=>upd({notes:e.target.value})}
              placeholder="Notes..."
              style={{width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#8b90a8",fontSize:11,padding:6,resize:"none",minHeight:36,fontFamily:"inherit"}}/>

            {/* Weather immune toggle */}
            <label style={{fontSize:11,color:"#8b90a8",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
              <input type="checkbox" checked={entry.weatherImmune} onChange={e=>upd({weatherImmune:e.target.checked})}/>
              Immune to weather effects
            </label>
          </div>
        )}
      </div>
    </>
  );
}

const adjBtn: React.CSSProperties = {
  width:20,height:20,background:"#242842",border:"1px solid #3a4060",borderRadius:3,
  color:"#00d4aa",cursor:"pointer",fontSize:14,display:"inline-flex",alignItems:"center",justifyContent:"center",
};

// ─── Main GM Screen ──────────────────────────────────────────────────────────
export default function GMScreen() {
  const [entries, setEntries] = useState<BattleEntry[]>(() => loadFromStorage("battle_tracker", []));
  const [weather, setWeather] = useState<WeatherEffect>(WEATHER_EFFECTS[0]);
  const [round, setRound] = useState(1);
  const [search, setSearch] = useState("");
  const [showPokedex, setShowPokedex] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [gmNotes, setGmNotes] = useState(() => loadFromStorage("gm_notes", ""));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Persist
  useEffect(() => { saveToStorage("battle_tracker", entries); }, [entries]);
  useEffect(() => { saveToStorage("gm_notes", gmNotes); }, [gmNotes]);

  const upd = useCallback((id: string, u: Partial<BattleEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...u } : e));
  }, []);

  const remove = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const addPokemon = useCallback((pokemon: PokemonEntry) => {
    const hp = pokemon.baseHp + pokemon.attributes.vitality;
    const will = pokemon.attributes.insight + 3;
    const initRoll = Math.floor(Math.random() * 6) + 1 + pokemon.attributes.dexterity;
    const newEntry: BattleEntry = {
      id: `${pokemon.number}-${Date.now()}`,
      pokemon,
      nickname: pokemon.number === 0 ? "Custom" : "",
      initiative: initRoll,
      currentHp: pokemon.number === 0 ? 10 : hp,
      maxHp: pokemon.number === 0 ? 10 : hp,
      currentWill: pokemon.number === 0 ? 5 : will,
      maxWill: pokemon.number === 0 ? 5 : will,
      status: "Healthy",
      notes: "",
      isExpanded: true,
      hasTakenTurn: false,
      side: "enemy",
      activeAbility: pokemon.abilities[0] ?? "",
      moves: pokemon.moves.slice(0, 4).map(m => {
        const moveData = MOVES.find(mv => mv.name === m.name);
        return moveData ?? { name: m.name, type: m.type, category: "Physical" as const, power: "-", accuracy: "-", damagePool: "-", effect: "", description: "" };
      }),
      attrs: { ...pokemon.attributes },
      weatherImmune: false,
    };
    setEntries(prev => [...prev, newEntry].sort((a, b) => b.initiative - a.initiative));
  }, []);

  const nextRound = () => {
    setRound(r => r + 1);
    setEntries(prev => prev.map(e => ({ ...e, hasTakenTurn: false })));
    // Apply end-of-round effects
    const weatherEffect = weather.modifiers.damagePerRound;
    if (weatherEffect) {
      setEntries(prev => prev.map(e => {
        if (e.weatherImmune) return e;
        const immune = weather.modifiers.immuneTypes?.some(t => e.pokemon.types.includes(t));
        if (immune) return e;
        return { ...e, currentHp: Math.max(0, e.currentHp - weatherEffect) };
      }));
    }
  };

  const sortByInitiative = () => {
    setEntries(prev => [...prev].sort((a, b) => b.initiative - a.initiative));
  };

  const rollAllInitiative = () => {
    setEntries(prev => prev.map(e => ({
      ...e,
      initiative: Math.floor(Math.random() * 6) + 1 + e.attrs.dexterity,
    })).sort((a, b) => b.initiative - a.initiative));
  };

  // Drag and drop
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOver(id); };
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return; }
    setEntries(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(e => e.id === dragId);
      const toIdx = arr.findIndex(e => e.id === targetId);
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    setDragId(null); setDragOver(null);
  };

  const filteredPokemon = useMemo(() => {
    if (!search) return POKEMON;
    return POKEMON.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || String(p.number).includes(search));
  }, [search]);

  const allPokemonWithMissing = [MISSINGNO, ...filteredPokemon];

  const turnsDone = entries.filter(e => e.hasTakenTurn).length;
  const total = entries.length;

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",overflow:"hidden" }}>
      {/* Nav */}
      <nav style={{ background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 16px",height:48,display:"flex",alignItems:"center",gap:12,flexShrink:0 }}>
        <Link href="/" style={{ fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none" }}>PokeRole<span style={{ color:"#00d4aa" }}> Tools</span></Link>
        <span style={{ color:"#3a4060" }}>/</span>
        <span style={{ fontSize:13,color:"#a040a0",fontWeight:700 }}>🖥️ GM Screen</span>
        <div style={{ marginLeft:"auto",display:"flex",gap:8,alignItems:"center" }}>
          {/* Weather */}
          <select value={weather.name} onChange={e=>setWeather(WEATHER_EFFECTS.find(w=>w.name===e.target.value)!)}
            style={{ background:"#0f1117",border:"1px solid #2a2f45",borderRadius:4,color:"#ffd32a",fontSize:11,padding:"3px 6px" }}>
            {WEATHER_EFFECTS.map(w=><option key={w.name} value={w.name}>{w.emoji} {w.name}</option>)}
          </select>

          {/* Round counter */}
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <span style={{ fontSize:11,color:"#5a6080" }}>Round</span>
            <span style={{ fontFamily:"'Exo 2'",fontWeight:700,fontSize:15,color:"#e8eaf0" }}>{round}</span>
            <button onClick={nextRound} style={{ background:"#00d4aa",color:"#0f1117",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>
              Next Round ▶
            </button>
          </div>

          <span style={{ fontSize:11,color:"#5a6080" }}>{turnsDone}/{total} done</span>
          <button onClick={rollAllInitiative} style={{ background:"#6890f020",border:"1px solid #6890f060",borderRadius:4,color:"#6890f0",padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>🎲 Roll All Initiative</button>
          <button onClick={()=>setShowNotes(!showNotes)} style={{ background:showNotes?"rgba(255,211,42,0.1)":"transparent",border:"1px solid #3a4060",borderRadius:4,color:showNotes?"#ffd32a":"#8b90a8",padding:"4px 10px",fontSize:11,cursor:"pointer" }}>📝 Notes</button>
        </div>
      </nav>

      <div style={{ display:"flex",flex:1,overflow:"hidden" }}>
        {/* Pokédex sidebar */}
        {showPokedex && (
          <div style={{ width:240,background:"#13151f",borderRight:"1px solid #2a2f45",display:"flex",flexDirection:"column",flexShrink:0 }}>
            <div style={{ padding:"10px 8px",borderBottom:"1px solid #2a2f45" }}>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:"#5a6080",fontSize:12,pointerEvents:"none" }}>🔍</span>
                <input type="text" placeholder="Add Pokémon…" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{ width:"100%",background:"#0f1117",border:"1px solid #2a2f45",borderRadius:5,padding:"6px 8px 6px 26px",color:"#e8eaf0",fontSize:12,outline:"none" }}/>
              </div>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:4 }}>
              {/* Missingno always first */}
              <div onClick={()=>addPokemon(MISSINGNO)} style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,cursor:"pointer",background:"rgba(255,211,42,0.05)",border:"1px dashed #3a4060",marginBottom:4,transition:"all 0.1s" }}
                onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="#ffd32a"}
                onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor="#3a4060"}>
                <span style={{ fontSize:11,color:"#ffd32a",fontWeight:700,fontFamily:"'Exo 2'" }}>✦ Custom</span>
                <span style={{ fontSize:10,color:"#5a6080",marginLeft:"auto" }}>Edit freely</span>
              </div>
              {filteredPokemon.map(p=>(
                <div key={p.number} onClick={()=>addPokemon(p)}
                  style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:4,cursor:"pointer",transition:"background 0.1s" }}
                  onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#1e2235"}
                  onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
                  <span style={{ fontSize:9,color:"#3a4060",width:26,flexShrink:0,fontFamily:"'Exo 2'",fontWeight:700 }}>#{String(p.number).padStart(3,"0")}</span>
                  <span style={{ fontSize:12,color:"#e8eaf0",flex:1 }}>{p.name}</span>
                  <div style={{ display:"flex",gap:3 }}>{p.types.map(t=><TypeBadge key={t} type={t} small/>)}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setShowPokedex(false)} style={{ background:"none",border:"none",borderTop:"1px solid #2a2f45",color:"#5a6080",cursor:"pointer",padding:8,fontSize:11 }}>
              ◀ Hide
            </button>
          </div>
        )}

        {!showPokedex && (
          <button onClick={()=>setShowPokedex(true)} style={{ width:24,background:"#13151f",border:"none",borderRight:"1px solid #2a2f45",color:"#5a6080",cursor:"pointer",fontSize:10,writingMode:"vertical-lr",flexShrink:0 }}>
            ▶
          </button>
        )}

        {/* Battle tracker */}
        <div style={{ flex:1,overflowY:"auto",padding:"12px 16px" }}>
          {/* Weather banner */}
          {weather.name !== "Clear" && (
            <div style={{ background:weather.color+"15",border:`1px solid ${weather.color}40`,borderRadius:6,padding:"8px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:10 }}>
              <span style={{ fontSize:16 }}>{weather.emoji.split(" ")[0]}</span>
              <div>
                <span style={{ fontSize:13,fontWeight:700,color:"#e8eaf0" }}>{weather.name} </span>
                <span style={{ fontSize:11,color:"#8b90a8" }}>{weather.description}</span>
              </div>
            </div>
          )}

          {entries.length === 0 ? (
            <div style={{ textAlign:"center",color:"#5a6080",padding:60 }}>
              <div style={{ fontSize:40,marginBottom:12 }}>⚔️</div>
              <div style={{ fontSize:14 }}>Add Pokémon from the sidebar to begin tracking</div>
            </div>
          ) : (
            entries.map(e => (
              <div key={e.id}
                draggable
                onDragStart={()=>handleDragStart(e.id)}
                onDragOver={ev=>handleDragOver(ev,e.id)}
                onDrop={()=>handleDrop(e.id)}
                onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                style={{
                  opacity:dragOver===e.id?0.5:1,
                  transition:"opacity 0.15s",
                  outline:dragOver===e.id?"2px dashed #00d4aa":"none",
                  borderRadius:8,
                }}>
                <BattleCard
                  entry={e} allEntries={entries} weather={weather}
                  onUpdate={upd} onRemove={remove} isDragging={dragId===e.id}
                />
              </div>
            ))
          )}
        </div>

        {/* Notes panel */}
        {showNotes && (
          <div style={{ width:280,background:"#13151f",borderLeft:"1px solid #2a2f45",display:"flex",flexDirection:"column",flexShrink:0 }}>
            <div style={{ padding:"10px 14px",borderBottom:"1px solid #2a2f45",fontFamily:"'Exo 2'",fontWeight:700,fontSize:13,color:"#ffd32a" }}>
              📝 GM Notes
            </div>
            <textarea value={gmNotes} onChange={e=>setGmNotes(e.target.value)}
              placeholder="Session notes, NPC stats, secret plans..."
              style={{ flex:1,background:"transparent",border:"none",color:"#8b90a8",fontSize:12,padding:12,resize:"none",fontFamily:"inherit",lineHeight:1.6,outline:"none" }}/>
          </div>
        )}
      </div>
    </div>
  );
}

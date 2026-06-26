"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  POKEMON, NATURES, TYPE_COLORS, PokemonType,
  RANK_BONUSES,
} from "../data/pokerole-data";
import {
  Rank, TrainerAge,
  TRAINER_RANK_POINTS, TRAINER_AGE_POINTS,
  TRAINER_ATTR_BASE, TRAINER_ATTR_MAX,
  RANK_ORDER, getRankIndex, getDisobedienceLevel,
  POKEMON_RANK_ATTR_UPGRADES,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";

const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};
const RANKS: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
const AGES: TrainerAge[] = ["Child","Teen","Adult","Senior"];

interface TrainerData {
  id: string; name: string; playerName: string; concept: string; nature: string;
  age: TrainerAge; rank: Rank; money: number;
  attributes: { strength: number; dexterity: number; vitality: number; insight: number };
  socialAttributes: { tough: number; cool: number; beauty: number; cute: number; clever: number };
  skills: { brawl: number; channel: number; clash: number; evasion: number; alert: number; athletic: number; nature: number; stealth: number; etiquette: number; intimidate: number; perform: number; capture: number };
  customSkills: { name: string; points: number }[];
  inventory: { name: string; quantity: number; description: string }[];
  achievements: string[]; notes: string; gymBadges: boolean[]; pokemon: string[];
}

interface PokemonSheetData {
  number: number;
  nickname: string;
  rank: Rank;
  loyalty: number;  // 0-5
  happiness: number; // 0-5
  attributes: { strength: number; dexterity: number; vitality: number; special: number; insight: number };
  skills: { brawl: number; channel: number; alert: number; athletic: number; nature: number; stealth: number; intimidate: number; perform: number };
  moves: string[]; // active move names (max insight+3)
  notes: string;
}

function makeBlank(): TrainerData {
  return {
    id: Date.now().toString(), name: "", playerName: "", concept: "", nature: "Hardy",
    age: "Teen", rank: "Rookie", money: 2000,
    attributes: { strength: 1, dexterity: 1, vitality: 1, insight: 1 },
    socialAttributes: { tough: 1, cool: 1, beauty: 1, cute: 1, clever: 1 },
    skills: { brawl: 0, channel: 0, clash: 0, evasion: 0, alert: 0, athletic: 0, nature: 0, stealth: 0, etiquette: 0, intimidate: 0, perform: 0, capture: 0 },
    customSkills: [], inventory: [],
    achievements: [], notes: "", gymBadges: Array(8).fill(false), pokemon: [],
  };
}

function makeBlankPokemonSheet(number: number, trainerRank: Rank): PokemonSheetData {
  const pokemon = POKEMON.find(p => p.number === number);
  return {
    number, nickname: "", rank: pokemon?.suggestedRank ?? "Starter",
    loyalty: 1, happiness: 2,
    attributes: pokemon ? { ...pokemon.attributes } : { strength: 1, dexterity: 1, vitality: 1, special: 1, insight: 1 },
    skills: { brawl: 0, channel: 0, alert: 0, athletic: 0, nature: 0, stealth: 0, intimidate: 0, perform: 0 },
    moves: pokemon?.moves.filter(m => RANK_ORDER.indexOf(m.rank) <= RANK_ORDER.indexOf(trainerRank)).slice(0, 4).map(m => m.name) ?? [],
    notes: "",
  };
}

function TypeBadge({ type }: { type: PokemonType }) {
  return <span style={{ display:"inline-flex",alignItems:"center",padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:700,color:"#fff",background:TYPE_COLORS[type] }}>{type}</span>;
}

// Point budget display
function PointBudget({ used, total, label }: { used: number; total: number; label: string }) {
  const over = used > total;
  return (
    <div style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: over ? "rgba(255,71,87,0.15)" : "rgba(0,212,170,0.08)", border: `1px solid ${over ? "#ff4757" : "#00d4aa"}30`, color: over ? "#ff4757" : "#5a6080", display: "inline-flex", gap: 4 }}>
      <span style={{ fontWeight: 700, color: over ? "#ff4757" : "#00d4aa" }}>{used}</span>
      <span>/</span><span>{total}</span>
      <span>{label}</span>
      {over && <span style={{ fontWeight: 700 }}>⚠ OVER BUDGET</span>}
    </div>
  );
}

function PipRow({ label, value, max, onChange, locked }: { label: string; value: number; max: number; onChange: (v: number) => void; locked?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <span style={{ width: 76, fontSize: 11, color: "#8b90a8", flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} onClick={() => !locked && onChange(i < value ? i : i + 1)}
            style={{ width: 14, height: 14, borderRadius: 3, cursor: locked ? "default" : "pointer", border: `1px solid ${i < value ? "#00d4aa" : "#2a2f45"}`, background: i < value ? "#00d4aa" : "transparent", transition: "all 0.1s" }} />
        ))}
      </div>
      <span style={{ fontSize: 13, fontFamily: "'Exo 2'", fontWeight: 700, color: "#e8eaf0", minWidth: 20 }}>{value}</span>
      {!locked && <>
        <button onClick={() => onChange(Math.max(TRAINER_ATTR_BASE, value - 1))} style={{ background: "none", border: "none", color: "#5a6080", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>−</button>
        <button onClick={() => value < max && onChange(value + 1)} style={{ background: "none", border: "none", color: value < max ? "#00d4aa" : "#3a4060", cursor: value < max ? "pointer" : "default", fontSize: 14, padding: "0 2px" }}>+</button>
      </>}
    </div>
  );
}

function PokemonPartySheet({ sheet, trainerRank, onChange, onRemove }: {
  sheet: PokemonSheetData;
  trainerRank: Rank;
  onChange: (s: PokemonSheetData) => void;
  onRemove: () => void;
}) {
  const pokemon = POKEMON.find(p => p.number === sheet.number);
  if (!pokemon) return null;
  const upd = (u: Partial<PokemonSheetData>) => onChange({ ...sheet, ...u });
  const disobedience = getDisobedienceLevel(sheet.rank, trainerRank);
  const disColor = { none: "#00d4aa", low: "#ffd32a", high: "#ff4757" }[disobedience];
  const disLabel = { none: "Obedient", low: "⚠ Low Disobedience (Loyalty roll needed)", high: "🔴 High Disobedience (Won't follow commands)" }[disobedience];

  // Attribute limits: base + rank upgrades
  const attrUpgrades = POKEMON_RANK_ATTR_UPGRADES[sheet.rank];
  const baseTotal = Object.values(pokemon.attributes).reduce((a, b) => a + b, 0);
  const attrMax = (base: number, limit: number) => limit; // use pokedex limits

  const maxMoves = sheet.attributes.insight + 3;

  return (
    <div style={{ background: "#1e2235", border: `2px solid ${TYPE_COLORS[pokemon.types[0]]}40`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: TYPE_COLORS[pokemon.types[0]], flexShrink: 0 }} />
        <input value={sheet.nickname} onChange={e => upd({ nickname: e.target.value })}
          placeholder={pokemon.name}
          style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 15, color: "#e8eaf0", background: "transparent", border: "none", outline: "none", flex: 1 }} />
        <span style={{ fontSize: 11, color: "#5a6080" }}>({pokemon.name})</span>
        {pokemon.types.map(t => <TypeBadge key={t} type={t} />)}
        <select value={sheet.rank} onChange={e => upd({ rank: e.target.value as Rank })}
          style={{ background: "#13151f", border: "none", color: RANK_COLORS[sheet.rank], fontSize: 11, fontWeight: 700, borderRadius: 3, padding: "2px 6px" }}>
          {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={onRemove} style={{ background: "none", border: "none", color: "#5a6080", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Disobedience banner */}
      {disobedience !== "none" && (
        <div style={{ background: disColor + "15", border: `1px solid ${disColor}40`, borderRadius: 5, padding: "6px 10px", marginBottom: 12, fontSize: 12, color: disColor, fontWeight: 600 }}>
          {disLabel}
          {disobedience === "low" && <div style={{ fontSize: 10, color: "#8b90a8", fontWeight: 400, marginTop: 2 }}>Roll Loyalty (3+ successes to obey for the round). Uses this Pokémon's Loyalty score as dice pool.</div>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Attributes */}
        <div>
          <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Attributes</div>
          {(["strength","dexterity","vitality","special","insight"] as const).map(attr => {
            const base = pokemon.attributes[attr];
            const limit = pokemon.attributeLimits?.[attr] ?? Math.min(base + 4, 8);
            return (
              <PipRow key={attr} label={attr.charAt(0).toUpperCase() + attr.slice(1)} value={sheet.attributes[attr]} max={limit}
                onChange={v => upd({ attributes: { ...sheet.attributes, [attr]: v } })} />
            );
          })}
          <div style={{ marginTop: 8, fontSize: 11, color: "#5a6080" }}>
            HP: <strong style={{ color: "#00d4aa" }}>{pokemon.baseHp + sheet.attributes.vitality}</strong> &nbsp;
            WP: <strong style={{ color: "#6890f0" }}>{sheet.attributes.insight + 3}</strong> &nbsp;
            DEF: <strong style={{ color: "#e8eaf0" }}>{sheet.attributes.vitality}</strong> &nbsp;
            SP.DEF: <strong style={{ color: "#e8eaf0" }}>{sheet.attributes.insight}</strong>
          </div>
        </div>

        {/* Loyalty, Happiness, Moves */}
        <div>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Loyalty (0–5)</div>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} onClick={() => upd({ loyalty: i })}
                    style={{ width: 14, height: 14, borderRadius: "50%", cursor: "pointer", background: i <= sheet.loyalty ? "#ffd32a" : "#2a2f45", border: `1px solid ${i <= sheet.loyalty ? "#ffd32a" : "#3a4060"}` }} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Happiness (0–5)</div>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} onClick={() => upd({ happiness: i })}
                    style={{ width: 14, height: 14, borderRadius: "50%", cursor: "pointer", background: i <= sheet.happiness ? "#f85888" : "#2a2f45", border: `1px solid ${i <= sheet.happiness ? "#f85888" : "#3a4060"}` }} />
                ))}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
              Active Moves ({sheet.moves.length}/{maxMoves})
            </div>
            {pokemon.moves.map(m => {
              const active = sheet.moves.includes(m.name);
              const rankOk = RANK_ORDER.indexOf(m.rank) <= RANK_ORDER.indexOf(sheet.rank);
              if (!rankOk) return null;
              return (
                <div key={m.name} onClick={() => {
                  if (active) upd({ moves: sheet.moves.filter(x => x !== m.name) });
                  else if (sheet.moves.length < maxMoves) upd({ moves: [...sheet.moves, m.name] });
                }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 3, cursor: "pointer", opacity: !active && sheet.moves.length >= maxMoves ? 0.4 : 1, background: active ? "#00d4aa15" : "transparent" }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, border: `1px solid ${active ? "#00d4aa" : "#3a4060"}`, background: active ? "#00d4aa" : "transparent" }} />
                  <TypeBadge type={m.type} /><span style={{ fontSize: 11, color: "#e8eaf0" }}>{m.name}</span>
                  <span style={{ fontSize: 9, color: RANK_COLORS[m.rank], marginLeft: "auto" }}>{m.rank}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <textarea value={sheet.notes} onChange={e => upd({ notes: e.target.value })} placeholder="Notes about this Pokémon..."
        style={{ width: "100%", marginTop: 10, background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#8b90a8", fontSize: 11, padding: 6, resize: "none", minHeight: 40, fontFamily: "inherit", lineHeight: 1.5, outline: "none" }} />
    </div>
  );
}

export default function CharactersPage() {
  const [trainers, setTrainers] = useState<TrainerData[]>(() => loadFromStorage("trainers", []));
  const [pokemonSheets, setPokemonSheets] = useState<Record<string, PokemonSheetData>>(() => loadFromStorage("pokemon_sheets", {}));
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<"sheet" | "pokemon">("sheet");
  const [pSearch, setPSearch] = useState("");

  useEffect(() => { saveToStorage("trainers", trainers); }, [trainers]);
  useEffect(() => { saveToStorage("pokemon_sheets", pokemonSheets); }, [pokemonSheets]);

  const sel = trainers.find(t => t.id === selId);
  const upd = useCallback((id: string, u: Partial<TrainerData>) => {
    setTrainers(prev => prev.map(t => t.id === id ? { ...t, ...u } : t));
  }, []);

  const rankInfo = sel ? TRAINER_RANK_POINTS[sel.rank] : TRAINER_RANK_POINTS.Rookie;
  const ageInfo = sel ? TRAINER_AGE_POINTS[sel.age] : TRAINER_AGE_POINTS.Teen;

  // 4 base attrs * 1 each = 4 base points spent, plus distributed
  const totalAttrPoints = rankInfo.attrPoints + ageInfo.attrPoints;
  const usedAttrPoints = sel ? Object.values(sel.attributes).reduce((a, b) => a + b, 0) - 4 : 0; // subtract 4 base (1 each)
  const attrBudgetLeft = totalAttrPoints - usedAttrPoints;

  const totalSocialPoints = rankInfo.socialPoints + ageInfo.socialPoints;
  const usedSocialPoints = sel ? Object.values(sel.socialAttributes).reduce((a, b) => a + b, 0) - 5 : 0; // 5 social attrs * 1 base
  const socialBudgetLeft = totalSocialPoints - usedSocialPoints;

  const usedSkillPoints = sel ? Object.values(sel.skills).reduce((a, b) => a + b, 0) : 0;

  const filtPokemon = POKEMON.filter(p => !pSearch || p.name.toLowerCase().includes(pSearch.toLowerCase()));

  const addPokemon = (num: number) => {
    if (!sel || sel.pokemon.length >= 6) return;
    const key = `${sel.id}_${num}_${Date.now()}`;
    setTrainers(prev => prev.map(t => t.id === sel.id ? { ...t, pokemon: [...t.pokemon, key] } : t));
    setPokemonSheets(prev => ({ ...prev, [key]: makeBlankPokemonSheet(num, sel.rank) }));
  };

  const removePokemon = (key: string) => {
    if (!sel) return;
    setTrainers(prev => prev.map(t => t.id === sel.id ? { ...t, pokemon: t.pokemon.filter(k => k !== key) } : t));
    setPokemonSheets(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const updatePokemonSheet = (key: string, sheet: PokemonSheetData) => {
    setPokemonSheets(prev => ({ ...prev, [key]: sheet }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f1117", color: "#e8eaf0", overflow: "hidden" }}>
      <nav style={{ background: "#13151f", borderBottom: "1px solid #2a2f45", padding: "0 16px", height: 48, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <Link href="/" style={{ fontFamily: "'Exo 2'", fontWeight: 800, fontSize: 15, color: "#e8eaf0", textDecoration: "none" }}>PokeRole<span style={{ color: "#00d4aa" }}> Tools</span></Link>
        <span style={{ color: "#3a4060" }}>/</span>
        <span style={{ fontSize: 13, color: "#3d8bff", fontWeight: 700 }}>👤 Characters</span>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#5a6080" }}>All changes auto-saved</div>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 220, background: "#13151f", borderRight: "1px solid #2a2f45", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "10px 8px", borderBottom: "1px solid #2a2f45" }}>
            <button onClick={() => { const t = makeBlank(); setTrainers(p => [...p, t]); setSelId(t.id); }}
              style={{ width: "100%", background: "#3d8bff", color: "#fff", border: "none", borderRadius: 5, padding: 7, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ New Trainer</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
            {trainers.length === 0 && <div style={{ textAlign: "center", color: "#5a6080", padding: 20, fontSize: 12 }}>No trainers yet</div>}
            {trainers.map(t => (
              <div key={t.id} onClick={() => setSelId(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 5, cursor: "pointer", background: selId === t.id ? "#242842" : "transparent", borderLeft: `2px solid ${selId === t.id ? "#3d8bff" : "transparent"}` }}
                onMouseEnter={e => { if (selId !== t.id) (e.currentTarget as HTMLDivElement).style.background = "#1e2235"; }}
                onMouseLeave={e => { if (selId !== t.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e8eaf0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name || "Unnamed"}</div>
                  <div style={{ fontSize: 10, color: RANK_COLORS[t.rank] }}>{t.rank} · {t.age}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setTrainers(p => p.filter(x => x.id !== t.id)); if (selId === t.id) setSelId(null); }}
                  style={{ background: "none", border: "none", color: "#5a6080", cursor: "pointer", fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {!sel ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#5a6080" }}>
            <div style={{ fontSize: 40 }}>👤</div><div>Select or create a trainer</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[["sheet", "📋 Trainer Sheet"], ["pokemon", "🎮 Pokémon Party"]] .map(([v, l]) => (
                <button key={v} onClick={() => setTab(v as "sheet" | "pokemon")}
                  style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: tab === v ? "rgba(61,139,255,0.15)" : "transparent", color: tab === v ? "#3d8bff" : "#8b90a8" }}>{l}</button>
              ))}
            </div>

            {tab === "sheet" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Identity */}
                <div style={{ gridColumn: "1/-1", background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 8, padding: 16 }}>
                  <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 15, color: "#3d8bff", marginBottom: 14 }}>Trainer Identity</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                    {[["Trainer Name", "name"], ["Player Name", "playerName"], ["Concept", "concept"]].map(([l, k]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
                        <input value={(sel as any)[k]} onChange={e => upd(sel.id, { [k]: e.target.value })}
                          style={{ width: "100%", background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, padding: "6px 8px", color: "#e8eaf0", fontSize: 13, outline: "none" }} />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>Age</div>
                      <select value={sel.age} onChange={e => upd(sel.id, { age: e.target.value as TrainerAge })}
                        style={{ width: "100%", background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, padding: "6px 8px", color: "#e8eaf0", fontSize: 13 }}>
                        {AGES.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>Rank</div>
                      <select value={sel.rank} onChange={e => upd(sel.id, { rank: e.target.value as Rank })}
                        style={{ width: "100%", background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, padding: "6px 8px", color: RANK_COLORS[sel.rank], fontSize: 13 }}>
                        {RANKS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>Nature</div>
                      <select value={sel.nature} onChange={e => upd(sel.id, { nature: e.target.value })}
                        style={{ width: "100%", background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, padding: "6px 8px", color: "#e8eaf0", fontSize: 13 }}>
                        {NATURES.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#5a6080", marginBottom: 4 }}>Max HP = 4+VIT</div><div style={{ fontSize: 22, fontFamily: "'Exo 2'", fontWeight: 800, color: "#00d4aa" }}>{4 + sel.attributes.vitality}</div></div>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#5a6080", marginBottom: 4 }}>Will = INS+3</div><div style={{ fontSize: 22, fontFamily: "'Exo 2'", fontWeight: 800, color: "#6890f0" }}>{sel.attributes.insight + 3}</div></div>
                    <div><div style={{ fontSize: 10, color: "#5a6080", marginBottom: 4 }}>Money ₽</div>
                      <input type="number" value={sel.money} onChange={e => upd(sel.id, { money: +e.target.value })}
                        style={{ width: 80, textAlign: "center", background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#ffd32a", fontSize: 16, fontFamily: "'Exo 2'", fontWeight: 700, padding: "2px 6px" }} /></div>
                    <div><div style={{ fontSize: 10, color: "#5a6080", marginBottom: 4 }}>Gym Badges</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {sel.gymBadges.map((b, i) => (
                          <button key={i} onClick={() => { const bg = [...sel.gymBadges]; bg[i] = !b; upd(sel.id, { gymBadges: bg }); }}
                            style={{ width: 24, height: 24, borderRadius: 3, border: `1px solid ${b ? "#ffd32a" : "#3a4060"}`, background: b ? "rgba(255,211,42,0.2)" : "transparent", color: b ? "#ffd32a" : "#5a6080", fontSize: 12, cursor: "pointer" }}>🏅</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attributes */}
                <div style={{ background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 14, color: "#e8eaf0", margin: 0 }}>Attributes</h3>
                    <PointBudget used={usedAttrPoints} total={totalAttrPoints} label="pts distributed" />
                  </div>
                  <div style={{ fontSize: 10, color: "#5a6080", marginBottom: 8 }}>
                    {sel.age} + {sel.rank}: +{ageInfo.attrPoints} + {rankInfo.attrPoints} = {totalAttrPoints} distributable points (base 1 per attribute)
                  </div>
                  {(["strength", "dexterity", "vitality", "insight"] as const).map(attr => (
                    <PipRow key={attr} label={attr.charAt(0).toUpperCase() + attr.slice(1)} value={sel.attributes[attr]} max={TRAINER_ATTR_MAX}
                      onChange={v => {
                        const cost = v - sel.attributes[attr];
                        if (cost > 0 && attrBudgetLeft <= 0) return;
                        upd(sel.id, { attributes: { ...sel.attributes, [attr]: v } });
                      }} />
                  ))}
                  <div style={{ borderTop: "1px solid #2a2f45", paddingTop: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase" }}>Social Attributes</div>
                      <PointBudget used={usedSocialPoints} total={totalSocialPoints} label="pts" />
                    </div>
                    {(["tough", "cool", "beauty", "cute", "clever"] as const).map(attr => (
                      <PipRow key={attr} label={attr.charAt(0).toUpperCase() + attr.slice(1)} value={sel.socialAttributes[attr]} max={TRAINER_ATTR_MAX}
                        onChange={v => {
                          const cost = v - sel.socialAttributes[attr];
                          if (cost > 0 && socialBudgetLeft <= 0) return;
                          upd(sel.id, { socialAttributes: { ...sel.socialAttributes, [attr]: v } });
                        }} />
                    ))}
                  </div>
                </div>

                {/* Skills */}
                <div style={{ background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 14, color: "#e8eaf0", margin: 0 }}>Skills</h3>
                    <PointBudget used={usedSkillPoints} total={rankInfo.skillPoints} label={`pts (limit ${rankInfo.skillLimit}/skill)`} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {(Object.keys(sel.skills) as (keyof typeof sel.skills)[]).map(skill => (
                      <PipRow key={skill} label={skill.charAt(0).toUpperCase() + skill.slice(1)+(skill==="capture"?" (🎯)":"")} value={sel.skills[skill]} max={rankInfo.skillLimit}
                        onChange={v => {
                          const cost = v - sel.skills[skill];
                          if (cost > 0 && usedSkillPoints >= rankInfo.skillPoints) return;
                          upd(sel.id, { skills: { ...sel.skills, [skill]: v } });
                        }} />
                    ))}
                  </div>
                  {/* Custom Skills */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Custom Skills</div>
                    {(sel.customSkills||[]).map((cs, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                        <input value={cs.name} onChange={e => { const arr=[...(sel.customSkills||[])];arr[i]={...arr[i],name:e.target.value};upd(sel.id,{customSkills:arr}); }}
                          placeholder="Skill name" style={{ flex: 1, background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#e8eaf0", fontSize: 12, padding: "4px 8px" }} />
                        <input type="number" min={0} max={rankInfo.skillLimit} value={cs.points} onChange={e => { const arr=[...(sel.customSkills||[])];arr[i]={...arr[i],points:Math.min(rankInfo.skillLimit,Math.max(0,+e.target.value||0))};upd(sel.id,{customSkills:arr}); }}
                          style={{ width: 40, background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#00d4aa", fontSize: 12, padding: "4px 6px", textAlign: "center" }} />
                        <button onClick={() => upd(sel.id,{customSkills:(sel.customSkills||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => upd(sel.id,{customSkills:[...(sel.customSkills||[]),{name:"",points:0}]})}
                      style={{ fontSize: 11, color: "#00d4aa", background: "none", border: "1px dashed #00d4aa40", borderRadius: 4, padding: "4px 10px", cursor: "pointer", width: "100%" }}>+ Add Custom Skill</button>
                  </div>
                </div>

                {/* Inventory */}
                <div style={{ background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 8, padding: 16 }}>
                  <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 14, color: "#e8eaf0", marginBottom: 10 }}>🎒 Inventory</h3>
                  {(sel.inventory||[]).map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <input value={item.name} onChange={e => { const arr=[...(sel.inventory||[])];arr[i]={...arr[i],name:e.target.value};upd(sel.id,{inventory:arr}); }}
                        placeholder="Item name" style={{ flex: 2, background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#e8eaf0", fontSize: 12, padding: "4px 8px" }} />
                      <input type="number" min={1} value={item.quantity} onChange={e => { const arr=[...(sel.inventory||[])];arr[i]={...arr[i],quantity:Math.max(1,+e.target.value||1)};upd(sel.id,{inventory:arr}); }}
                        style={{ width: 48, background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#ffd32a", fontSize: 12, padding: "4px 6px", textAlign: "center" }} />
                      <button onClick={() => upd(sel.id,{inventory:(sel.inventory||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#5a6080",cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => upd(sel.id,{inventory:[...(sel.inventory||[]),{name:"",quantity:1,description:""}]})}
                    style={{ fontSize: 11, color: "#ffd32a", background: "none", border: "1px dashed #ffd32a40", borderRadius: 4, padding: "4px 10px", cursor: "pointer", width: "100%" }}>+ Add Item</button>
                </div>

                {/* Achievements & Notes */}
                <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 8, padding: 16 }}>
                    <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 14, color: "#e8eaf0", marginBottom: 10 }}>Achievements</h3>
                    {sel.achievements.map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                        <input value={a} onChange={e => { const arr = [...sel.achievements]; arr[i] = e.target.value; upd(sel.id, { achievements: arr }); }}
                          style={{ flex: 1, background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#e8eaf0", fontSize: 12, padding: "4px 8px" }} />
                        <button onClick={() => upd(sel.id, { achievements: sel.achievements.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#5a6080", cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => upd(sel.id, { achievements: [...sel.achievements, ""] })}
                      style={{ fontSize: 11, color: "#00d4aa", background: "none", border: "1px dashed #00d4aa40", borderRadius: 4, padding: "4px 10px", cursor: "pointer", width: "100%" }}>+ Add</button>
                  </div>
                  <div style={{ background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 8, padding: 16 }}>
                    <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 14, color: "#e8eaf0", marginBottom: 10 }}>Notes</h3>
                    <textarea value={sel.notes} onChange={e => upd(sel.id, { notes: e.target.value })}
                      style={{ width: "100%", background: "#13151f", border: "1px solid #2a2f45", borderRadius: 4, color: "#8b90a8", fontSize: 12, padding: 8, resize: "none", height: 110, fontFamily: "inherit", lineHeight: 1.5, outline: "none" }} />
                  </div>
                </div>
              </div>
            )}

            {tab === "pokemon" && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h2 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 18, color: "#3d8bff", margin: 0 }}>Pokémon Party ({sel.pokemon.length}/6)</h2>
                    <Link href="/gm-screen" style={{ display: "inline-block", background: "#00d4aa", color: "#0f1117", borderRadius: 4, padding: "6px 14px", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
                      ⚔️ Open Battle Tracker
                    </Link>
                  </div>
                  {sel.pokemon.length === 0 && <div style={{ fontSize: 12, color: "#5a6080", fontStyle: "italic", marginBottom: 16 }}>No Pokémon yet — add from the browser →</div>}
                  {sel.pokemon.map(key => {
                    const sheet = pokemonSheets[key];
                    if (!sheet) return null;
                    return (
                      <PokemonPartySheet key={key} sheet={sheet} trainerRank={sel.rank}
                        onChange={s => updatePokemonSheet(key, s)}
                        onRemove={() => removePokemon(key)} />
                    );
                  })}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#5a6080", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Add Pokémon</div>
                  <input type="text" placeholder="Search Pokémon by name or #…" value={pSearch} onChange={e => setPSearch(e.target.value)}
                    style={{ width: "100%", background: "#1e2235", border: "1px solid #2a2f45", borderRadius: 5, padding: "6px 10px", color: "#e8eaf0", fontSize: 12, marginBottom: 8, outline: "none" }} />
                  {!pSearch && <div style={{fontSize:11,color:"#5a6080",textAlign:"center",padding:8}}>Type to search {POKEMON.length} Pokémon</div>}
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    {pSearch && filtPokemon.slice(0, 50).map(p => (
                      <div key={p.number} onClick={() => addPokemon(p.number)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, cursor: sel.pokemon.length >= 6 ? "not-allowed" : "pointer", opacity: sel.pokemon.length >= 6 ? 0.4 : 1 }}
                        onMouseEnter={e => { if (sel.pokemon.length < 6) (e.currentTarget as HTMLDivElement).style.background = "#1e2235"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                        <span style={{ fontSize: 9, color: "#3a4060", width: 26, fontFamily: "'Exo 2'", fontWeight: 700 }}>#{String(p.number).padStart(3, "0")}</span>
                        <span style={{ fontSize: 12, color: "#e8eaf0", flex: 1 }}>{p.name}</span>
                        {p.types.map(t => <TypeBadge key={t} type={t} />)}
                        <span style={{ fontSize: 9, color: RANK_COLORS[p.suggestedRank] }}>{p.suggestedRank}</span>
                      </div>
                    ))}
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

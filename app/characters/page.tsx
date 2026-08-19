"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  POKEMON, NATURES, TYPE_COLORS, PokemonType,
  RANK_BONUSES, ITEMS,
} from "../data/pokerole-data";
import {
  Rank, TrainerAge,
  TRAINER_RANK_POINTS, TRAINER_AGE_POINTS,
  TRAINER_ATTR_BASE, TRAINER_ATTR_MAX,
  RANK_ORDER, getRankIndex, getDisobedienceLevel,
  POKEMON_RANK_ATTR_UPGRADES,
} from "../data/game-rules";
import { saveToStorage, loadFromStorage } from "../lib/storage";
import {
  TrainerData, PokemonSheetData, makeBlankTrainer as makeBlank,
  setActiveTrainer, getActiveTrainer, TRAINER_SPRITES,
} from "../lib/trainer";
import { MOVES_DATA } from "../data/moves-data";
import { POKEMON_EGG_GROUPS } from "../data/egg-groups-data";
import PokedexFrame from "../components/PokedexFrame";

const RANK_COLORS: Record<Rank,string> = {Starter:"#78c850",Rookie:"#6890f0",Standard:"#f8d030",Advanced:"#f08030",Expert:"#a040a0",Ace:"#e04040",Master:"#705898",Champion:"#ffd700"};
const RANKS: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];
const AGES: TrainerAge[] = ["Child","Teen","Adult","Senior"];

const NATURE_FLAVORS: Record<string, { liked: string; disliked: string }> = {
  Lonely:{liked:"Spicy",disliked:"Sour"}, Brave:{liked:"Spicy",disliked:"Sweet"},
  Adamant:{liked:"Spicy",disliked:"Dry"}, Naughty:{liked:"Spicy",disliked:"Bitter"},
  Bold:{liked:"Sour",disliked:"Spicy"}, Relaxed:{liked:"Sour",disliked:"Sweet"},
  Impish:{liked:"Sour",disliked:"Dry"}, Lax:{liked:"Sour",disliked:"Bitter"},
  Timid:{liked:"Sweet",disliked:"Spicy"}, Hasty:{liked:"Sweet",disliked:"Sour"},
  Jolly:{liked:"Sweet",disliked:"Dry"}, Naive:{liked:"Sweet",disliked:"Bitter"},
  Modest:{liked:"Dry",disliked:"Spicy"}, Mild:{liked:"Dry",disliked:"Sour"},
  Quiet:{liked:"Dry",disliked:"Sweet"}, Rash:{liked:"Dry",disliked:"Bitter"},
  Calm:{liked:"Bitter",disliked:"Spicy"}, Gentle:{liked:"Bitter",disliked:"Sour"},
  Sassy:{liked:"Bitter",disliked:"Sweet"}, Careful:{liked:"Bitter",disliked:"Dry"},
};

interface FeedItem { name: string; emoji: string; flavor: string | null; baseDelta: number; isMedicine?: boolean; }
const FEED_ITEMS: FeedItem[] = [
  { name:"Moomoo Milk",    emoji:"🥛", flavor:null,      baseDelta:1 },
  { name:"Aprijuice",      emoji:"🧃", flavor:null,      baseDelta:1 },
  { name:"Poffin (liked)", emoji:"🧁", flavor:"liked",   baseDelta:2 },
  { name:"Poffin",         emoji:"🧁", flavor:null,      baseDelta:1 },
  { name:"Pomeg Berry",    emoji:"🍒", flavor:"Bitter",  baseDelta:1 },
  { name:"Kelpsy Berry",   emoji:"🫐", flavor:"Dry",     baseDelta:1 },
  { name:"Qualot Berry",   emoji:"🍇", flavor:"Sweet",   baseDelta:1 },
  { name:"Hondew Berry",   emoji:"🍈", flavor:"Dry",     baseDelta:1 },
  { name:"Grepa Berry",    emoji:"🍑", flavor:"Sour",    baseDelta:1 },
  { name:"Tamato Berry",   emoji:"🍅", flavor:"Spicy",   baseDelta:1 },
  { name:"Razz Berry",     emoji:"🍓", flavor:"Spicy",   baseDelta:1 },
  { name:"Bluk Berry",     emoji:"🫐", flavor:"Sour",    baseDelta:1 },
  { name:"Nanab Berry",    emoji:"🍌", flavor:"Sweet",   baseDelta:1 },
  { name:"Wepear Berry",   emoji:"🍐", flavor:"Bitter",  baseDelta:1 },
  { name:"Energy Powder",  emoji:"💊", flavor:"Bitter",  baseDelta:-1, isMedicine:true },
  { name:"Heal Powder",    emoji:"💊", flavor:"Bitter",  baseDelta:-1, isMedicine:true },
  { name:"Energy Root",    emoji:"💊", flavor:"Bitter",  baseDelta:-1, isMedicine:true },
  { name:"Revival Herb",   emoji:"🌿", flavor:"Bitter",  baseDelta:-2, isMedicine:true },
];

const HAPPINESS_EVO_POKEMON = new Set([
  "Pichu","Cleffa","Igglybuff","Togepi","Golbat","Chansey","Eevee",
  "Munchlax","Azurill","Buneary","Riolu","Woobat","Swadloon","Chingling","Budew","Happiny",
]);

/* Bag rows are free text with no ids, so a trainer can end up with two
   "Potion" rows. Wherever the bag is offered as a list of *choices*, those
   rows are one choice: picking either does the same thing, and rendering
   both collided on the item name as a React key. Collapsed case-insensitively
   with quantities summed, which is also what "how many do I have" means. */
type InventoryRow = TrainerData["inventory"][number];
function mergeInventory(inv: InventoryRow[]): InventoryRow[] {
  const out: InventoryRow[] = [];
  const seen = new Map<string, number>();
  for (const row of inv) {
    const k = row.name.trim().toLowerCase();
    const at = seen.get(k);
    if (at === undefined) { seen.set(k, out.length); out.push({ ...row }); }
    else out[at] = { ...out[at], quantity: out[at].quantity + row.quantity };
  }
  return out;
}

function getFeedDelta(item: FeedItem, nature: string): number {
  if (item.baseDelta < 0) return item.baseDelta;
  if (item.flavor === "liked") return item.baseDelta; // already nature-tuned
  const fl = NATURE_FLAVORS[nature];
  if (!fl || !item.flavor) return item.baseDelta;
  if (item.flavor === fl.liked) return item.baseDelta + 1;
  if (item.flavor === fl.disliked) return 0;
  return item.baseDelta;
}

function makeBlankPokemonSheet(number: number, trainerRank: Rank): PokemonSheetData {
  const pokemon = POKEMON.find(p => p.number === number);
  return {
    number, nickname: "", rank: pokemon?.suggestedRank ?? "Starter",
    loyalty: 1, happiness: 1,
    attributes: pokemon ? { ...pokemon.attributes } : { strength: 1, dexterity: 1, vitality: 1, special: 1, insight: 1 },
    trainingAttributes: { strength: 0, dexterity: 0, vitality: 0, special: 0, insight: 0 },
    skills: { brawl: 0, channel: 0, clash: 0, evasion: 0, alert: 0, athletic: 0, nature: 0, stealth: 0, intimidate: 0, perform: 0 },
    moves: pokemon?.moves.filter(m => RANK_ORDER.indexOf(m.rank) <= RANK_ORDER.indexOf(trainerRank)).slice(0, 4).map(m => m.name) ?? [],
    partnerMoves: [],
    isPartner: false,
    nature: "Hardy",
    origin: "wild" as const,
    heldItem: "",
    cruelty: false,
    inPokeball: false,
    happinessPending: 0,
    notes: "",
  };
}

function applyHappinessGain(sheet: PokemonSheetData, delta: number, source?: "training"): Partial<PokemonSheetData> {
  const isCrueltyTraining = !!sheet.cruelty && source === "training" && delta > 0;
  const hasSootherBell = (sheet.heldItem ?? "") === "Soothe Bell";
  const bell = (!isCrueltyTraining && hasSootherBell && delta > 0) ? 1 : 0;
  const effective = isCrueltyTraining ? -delta : (delta + bell);
  const rawNew = (sheet.happiness ?? 0) + effective;
  const newHappiness = Math.max(0, Math.min(5, rawNew));
  let pending = sheet.happinessPending ?? 0;
  let newLoyalty = sheet.loyalty ?? 0;
  if (effective > 0 && rawNew > 5) {
    pending += rawNew - 5;
    if (pending >= 2) { newLoyalty = Math.min(5, newLoyalty + Math.floor(pending / 2)); pending = pending % 2; }
  }
  if (isCrueltyTraining) { newLoyalty = Math.max(0, newLoyalty - 1); pending = sheet.happinessPending ?? 0; }
  return { happiness: newHappiness, loyalty: newLoyalty, happinessPending: pending };
}

function TypeBadge({ type }: { type: PokemonType }) {
  return <span style={{ display:"inline-flex",alignItems:"center",padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:700,color:"#fff",background:TYPE_COLORS[type] }}>{type}</span>;
}

// Point budget display
function PointBudget({ used, total, label }: { used: number; total: number; label: string }) {
  const over = used > total;
  return (
    <div style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: over ? "rgba(255,71,87,0.15)" : "rgba(0,212,170,0.08)", border: `1px solid ${over ? "#C02820" : "#2850A0"}30`, color: over ? "#C02820" : "#585858", display: "inline-flex", gap: 4 }}>
      <span style={{ fontWeight: 700, color: over ? "#C02820" : "#2850A0" }}>{used}</span>
      <span>/</span><span>{total}</span>
      <span>{label}</span>
      {over && <span style={{ fontWeight: 700 }}>⚠ OVER BUDGET</span>}
    </div>
  );
}

function PipRow({ label, value, max, onChange, locked, base, dot, training, onTrainingChange, hint }: {
  label: string; value: number; max: number; onChange: (v: number) => void;
  locked?: boolean; base?: number; dot?: boolean;
  training?: number; onTrainingChange?: (v: number) => void;
  /** What this attribute/skill actually does. Sits on the label, not the row,
   *  so hovering the pips doesn't look like the pips are being described. */
  hint?: string;
}) {
  const total = value + (training ?? 0);
  const totalMax = max;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <span title={hint} style={{ width: 76, fontSize: 11, color: "#383838", flexShrink: 0,
        cursor: hint ? "help" : undefined,
        textDecoration: hint ? "underline dotted rgba(56,56,56,0.4)" : undefined, textUnderlineOffset: 2 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: totalMax }).map((_, i) => {
          const filled = i < total;
          const isTraining = i >= value;
          const upgrade = filled && !isTraining && base !== undefined && i >= base;
          const color = filled ? (isTraining ? "#A07000" : upgrade ? "#f08030" : "#2850A0") : "transparent";
          const border = filled ? color : "#2850A0";
          const clickable = !locked && (isTraining ? !!onTrainingChange : true);
          return (
            <div key={i} onClick={() => {
              if (locked) return;
              if (i >= value && onTrainingChange) {
                const ti = i - value;
                onTrainingChange(ti < (training ?? 0) ? ti : ti + 1);
              } else if (i < value) {
                onChange(i < value ? i : i + 1);
              }
            }}
              style={{ width: 14, height: 14, borderRadius: dot ? "50%" : 3, cursor: clickable ? "pointer" : "default", border: `1px solid ${border}`, background: color, transition: "all 0.1s" }} />
          );
        })}
      </div>
      <span style={{ fontSize: 13, fontFamily: "'Exo 2'", fontWeight: 700, color: "#202020", minWidth: 20 }}>{total}</span>
      {!locked && <>
        <button onClick={() => onChange(Math.max(TRAINER_ATTR_BASE, value - 1))} style={{ background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>−</button>
        <button onClick={() => value < max && onChange(value + 1)} style={{ background: "none", border: "none", color: value < max ? "#2850A0" : "#7888A8", cursor: value < max ? "pointer" : "default", fontSize: 14, padding: "0 2px" }}>+</button>
      </>}
      {onTrainingChange && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 4, borderLeft: "1px solid #A0700030", paddingLeft: 6 }}>
          <button onClick={() => onTrainingChange(Math.max(0, (training ?? 0) - 1))} style={{ background: "none", border: "none", color: "#A0700080", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>−</button>
          <span style={{ fontSize: 10, color: "#A07000", minWidth: 14, textAlign: "center" }}>+{training ?? 0}</span>
          <button onClick={() => onTrainingChange((training ?? 0) + 1)} style={{ background: "none", border: "none", color: "#A07000", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>+</button>
        </div>
      )}
    </div>
  );
}

/* What each trainer stat is for, in one line. PokeRole explains these in the
   rulebook; nothing in the app did, so a new player had no way to tell what
   Insight or Clever were meant to cover while spending points on them. */
const TRAINER_ATTR_HINTS: Record<string, string> = {
  strength:  "Melee force — lifting, grappling, and physical damage.",
  dexterity: "Speed and precision — initiative, dodging, and accuracy.",
  vitality:  "Toughness — your Max HP is 4 + Vitality.",
  insight:   "Awareness and willpower — your Will is Insight + 3.",
};
const TRAINER_SOCIAL_HINTS: Record<string, string> = {
  tough:  "Projecting grit and resilience in social situations.",
  cool:   "Composure and style — staying unfazed and impressive.",
  beauty: "Elegance and presentation.",
  cute:   "Charm and endearment.",
  clever: "Wit and quick thinking in conversation.",
};
const TRAINER_SKILL_HINTS: Record<string, string> = {
  brawl:      "Fighting hand-to-hand yourself.",
  channel:    "Directing your Pokémon's special and ranged moves.",
  clash:      "Meeting an incoming attack head-on as a reaction.",
  evasion:    "Dodging an incoming attack as a reaction.",
  alert:      "Noticing things — perception and avoiding surprise.",
  athletic:   "Running, climbing, jumping and physical feats.",
  nature:     "Wilderness lore, tracking and handling wild Pokémon.",
  stealth:    "Moving unseen and unheard.",
  etiquette:  "Formal manners and navigating polite society.",
  intimidate: "Leaning on someone through force of presence.",
  perform:    "Contests, performances and entertaining a crowd.",
  capture:    "Throwing Poké Balls — used when you attempt a catch.",
};

const TRAINING_ROLLS: Record<string, { trainerAttr: "strength"|"dexterity"|"vitality"|"insight"; trainerSkill: "brawl"|"channel"|"athletic"|"nature"; label: string }> = {
  strength: { trainerAttr: "strength", trainerSkill: "brawl",    label: "STR" },
  dexterity:{ trainerAttr: "dexterity",trainerSkill: "athletic", label: "DEX" },
  vitality: { trainerAttr: "vitality", trainerSkill: "nature",   label: "VIT" },
  special:  { trainerAttr: "insight",  trainerSkill: "channel",  label: "SPC" },
  insight:  { trainerAttr: "insight",  trainerSkill: "nature",   label: "INS" },
};

function PokemonPartySheet({ sheet, trainerRank, onChange, onRemove, onSendToBox, onDesignatePartner, onRevokePartner, partyHasPartner, trainerInventory, onTransferItemToTrainer, onTransferItemFromTrainer, trainerAttrs, trainerSkills }: {
  sheet: PokemonSheetData;
  trainerRank: Rank;
  onChange: (s: PokemonSheetData) => void;
  onRemove: () => void;
  onSendToBox: () => void;
  onDesignatePartner: () => void;
  onRevokePartner: () => void;
  partyHasPartner: boolean;
  trainerInventory: { name: string; quantity: number; description: string }[];
  onTransferItemToTrainer: (itemName: string) => void;
  onTransferItemFromTrainer: (itemName: string) => void;
  trainerAttrs: { strength: number; dexterity: number; vitality: number; insight: number };
  trainerSkills: { brawl: number; channel: number; clash: number; evasion: number; alert: number; athletic: number; nature: number; stealth: number; etiquette: number; intimidate: number; perform: number; capture: number };
}) {
  const pokemon = POKEMON.find(p => p.number === sheet.number);
  if (!pokemon) return null;
  const upd = (u: Partial<PokemonSheetData>) => onChange({ ...sheet, ...u });
  const disobedience = getDisobedienceLevel(sheet.rank, trainerRank);
  const disColor = { none: "#2850A0", low: "#A07000", high: "#C02820" }[disobedience];
  const disLabel = { none: "Obedient", low: "⚠ Low Disobedience (Loyalty roll needed)", high: "🔴 High Disobedience (Won't follow commands)" }[disobedience];

  const upgradePool = POKEMON_RANK_ATTR_UPGRADES[sheet.rank];
  const ATTRS = ["strength","dexterity","vitality","special","insight"] as const;
  const attrLimits = ATTRS.reduce((acc, attr) => {
    const base = pokemon.attributes[attr];
    const speciesCap = pokemon.attributeLimits?.[attr] ?? Math.min(base + 4, 8);
    acc[attr] = sheet.isPartner ? Math.max(speciesCap, 10) : speciesCap;
    return acc;
  }, {} as Record<typeof ATTRS[number], number>);
  const usedUpgrades = ATTRS.reduce((sum, attr) => sum + Math.max(0, sheet.attributes[attr] - pokemon.attributes[attr]), 0);
  const upgradesLeft = upgradePool - usedUpgrades;

  const ta = sheet.trainingAttributes ?? { strength: 0, dexterity: 0, vitality: 0, special: 0, insight: 0 };

  // Partner eligibility: max loyalty, happiness, and all attributes (pool + training) at species cap
  const attrMaxed = ATTRS.every(attr => {
    const speciesCap = pokemon.attributeLimits?.[attr] ?? Math.min(pokemon.attributes[attr] + 4, 8);
    return (sheet.attributes[attr] + (ta[attr] ?? 0)) >= speciesCap;
  });
  const partnerEligible = sheet.loyalty >= 5 && sheet.happiness >= 5 && attrMaxed && !sheet.isPartner;

  const [trainingMode, setTrainingMode] = useState(false);
  const [trainingRoll, setTrainingRoll] = useState<{ attr: string; pool: number; rolls: number[] } | null>(null);

  const maxMoves = (sheet.attributes.insight + ta.insight) + 3;
  const [editMoves, setEditMoves] = useState(false);
  const [showFeedPanel, setShowFeedPanel] = useState(false);
  const nature = sheet.nature ?? "Hardy";
  const origin = sheet.origin ?? "wild";
  const hasSootherBell = (sheet.heldItem ?? "") === "Soothe Bell";
  // Food items that exist in trainer's inventory and match FEED_ITEMS
  const feedableItems = FEED_ITEMS.filter(fi =>
    trainerInventory.some(ti => ti.name.toLowerCase() === fi.name.toLowerCase() && ti.quantity > 0)
  );

  // Collect all moves learnable by Pokémon in the same egg group(s)
  const eggGroupMovePool = useMemo(() => {
    const ownGroups = POKEMON_EGG_GROUPS[pokemon.name] ?? [];
    if (ownGroups.length === 0 || ownGroups[0] === "Undiscovered") return new Set<string>();
    const pool = new Set<string>();
    for (const [name, groups] of Object.entries(POKEMON_EGG_GROUPS)) {
      if (groups.some(g => ownGroups.includes(g))) {
        const entry = POKEMON.find(p => p.name === name);
        // `pool` is a Set<string> matched later against MOVES_DATA names, so
        // store the name rather than the learnset entry object.
        if (entry) entry.moves.forEach(m => pool.add(m.name));
      }
    }
    return pool;
  }, [pokemon.name]);

  const eggGroupMovesInRank = useMemo(() => {
    if (eggGroupMovePool.size === 0) return [];
    return MOVES_DATA
      .filter(m => eggGroupMovePool.has(m.name) && RANK_ORDER.indexOf(m.rank as Rank) <= RANK_ORDER.indexOf(sheet.rank))
      .sort((a, b) => RANK_ORDER.indexOf(a.rank as Rank) - RANK_ORDER.indexOf(b.rank as Rank) || a.name.localeCompare(b.name));
  }, [eggGroupMovePool, sheet.rank]);

  return (
    <div style={{ background: "#FBF8E4", border: `2px solid ${TYPE_COLORS[pokemon.types[0]]}40`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: TYPE_COLORS[pokemon.types[0]], flexShrink: 0 }} />
        <input value={sheet.nickname} onChange={e => upd({ nickname: e.target.value })}
          placeholder={pokemon.name}
          style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 15, color: "#202020", background: "transparent", border: "none", outline: "none", flex: 1 }} />
        <span style={{ fontSize: 11, color: "#585858" }}>({pokemon.name})</span>
        {pokemon.types.map(t => <TypeBadge key={t} type={t} />)}
        <select value={sheet.rank} onChange={e => upd({ rank: e.target.value as Rank })}
          style={{ background: "#F8F4D0", border: "none", color: RANK_COLORS[sheet.rank], fontSize: 11, fontWeight: 700, borderRadius: 3, padding: "2px 6px" }}>
          {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={onSendToBox} title="Send to PC Box" style={{ background: "none", border: "none", color: "#6890f0", cursor: "pointer", fontSize: 11, padding: "0 4px" }}>📦</button>
        <button onClick={onRemove} style={{ background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Origin + Nature row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, color: "#585858", textTransform: "uppercase", letterSpacing: "0.5px" }}>Origin</span>
          <select value={origin} onChange={e => {
            const o = e.target.value as "wild" | "egg" | "trade";
            const defaults = { wild: { happiness: 1, loyalty: 1 }, egg: { happiness: 3, loyalty: 3 }, trade: { happiness: 0, loyalty: 0 } };
            if (window.confirm(`Reset happiness and loyalty to ${o} defaults?`)) upd({ origin: o, ...defaults[o] });
          }} style={{ background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 3, color: "#383838", fontSize: 10, padding: "2px 5px" }}>
            <option value="wild">Wild (Caught)</option>
            <option value="egg">Hatched (Egg)</option>
            <option value="trade">Trade</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, color: "#585858", textTransform: "uppercase", letterSpacing: "0.5px" }}>Nature</span>
          <select value={nature} onChange={e => upd({ nature: e.target.value })} style={{ background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 3, color: "#383838", fontSize: 10, padding: "2px 5px" }}>
            {NATURES.map(n => <option key={n} value={n}>{n}{NATURE_FLAVORS[n] ? ` (${NATURE_FLAVORS[n].liked})` : ""}</option>)}
          </select>
        </div>
        {hasSootherBell && <span style={{ fontSize: 10, color: "#A07000" }}>🔔 Soothe Bell</span>}
        {(sheet.inPokeball ?? false) && <span style={{ fontSize: 10, color: "#383838" }}>⚪ In Poké Ball</span>}
        {/* Held Item */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
          <span style={{ fontSize: 9, color: "#585858", textTransform: "uppercase", letterSpacing: "0.5px" }}>Held</span>
          {sheet.heldItem ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: "#A07000", background: "#A0700012", border: "1px solid #A0700030", borderRadius: 3, padding: "1px 6px" }}>{sheet.heldItem}</span>
              <button onClick={() => { onTransferItemToTrainer(sheet.heldItem); upd({ heldItem: "" }); }}
                style={{ background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 11, lineHeight: 1 }} title="Return to trainer bag">↩</button>
            </div>
          ) : (
            <select value="" onChange={e => {
              if (e.target.value) { onTransferItemFromTrainer(e.target.value); upd({ heldItem: e.target.value }); }
            }} style={{ background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 3, color: "#585858", fontSize: 10, padding: "2px 5px" }}>
              <option value="">— none —</option>
              {mergeInventory(trainerInventory).filter(i => i.quantity > 0).map(i => (
                <option key={i.name} value={i.name}>{i.name} ×{i.quantity}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Disobedience banner */}
      {disobedience !== "none" && (
        <div style={{ background: disColor + "15", border: `1px solid ${disColor}40`, borderRadius: 5, padding: "6px 10px", marginBottom: 12, fontSize: 12, color: disColor, fontWeight: 600 }}>
          {disLabel}
          {disobedience === "low" && <div style={{ fontSize: 10, color: "#383838", fontWeight: 400, marginTop: 2 }}>Roll Loyalty (3+ successes to obey for the round). Uses this Pokémon's Loyalty score as dice pool.</div>}
        </div>
      )}

      {/* Partner Pokemon banner */}
      {sheet.isPartner && (
        <div style={{ background: "linear-gradient(90deg,#A0700018,#f0803018)", border: "1px solid #A0700050", borderRadius: 5, padding: "6px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⭐</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#A07000" }}>Partner Pokémon</span>
          <span style={{ fontSize: 11, color: "#383838" }}>Attribute caps +2 · Can learn Egg Group moves</span>
          <button onClick={onRevokePartner} style={{ marginLeft: "auto", background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 11 }}>Revoke</button>
        </div>
      )}
      {partnerEligible && (
        <div style={{ background: "#A0700010", border: "1px dashed #A0700060", borderRadius: 5, padding: "6px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⭐</span>
          <span style={{ fontSize: 11, color: "#A07000" }}>
            {partyHasPartner ? "This Pokémon is ready — designating it will replace the current Partner." : "This Pokémon has reached its full potential and is ready to become a Partner!"}
          </span>
          <button onClick={onDesignatePartner} style={{ marginLeft: "auto", background: "#A07000", border: "none", borderRadius: 4, color: "#35785F", fontSize: 11, fontWeight: 700, padding: "3px 10px", cursor: "pointer" }}>
            {partyHasPartner ? "Switch Partner" : "Designate as Partner"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Attributes */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase" }}>Attributes</div>
              <button onClick={() => setTrainingMode(m => !m)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${trainingMode ? "#A07000" : "#7888A8"}`, background: trainingMode ? "#A0700018" : "transparent", color: trainingMode ? "#A07000" : "#585858", cursor: "pointer", fontWeight: 700, letterSpacing: "0.5px" }}>
                Training {trainingMode ? "ON" : "OFF"}
              </button>
            </div>
            <PointBudget used={usedUpgrades} total={upgradePool} label="upgrades" />
          </div>
          {ATTRS.map(attr => {
            const base = pokemon.attributes[attr];
            const limit = attrLimits[attr];
            return (
              <PipRow key={attr} label={attr.charAt(0).toUpperCase() + attr.slice(1)} value={sheet.attributes[attr]} max={limit}
                base={base} dot
                training={ta[attr]}
                onTrainingChange={trainingMode ? v => {
                  const clamped = Math.min(v, limit - sheet.attributes[attr]);
                  const gain = clamped - (ta[attr] ?? 0);
                  upd({ trainingAttributes: { ...ta, [attr]: clamped }, ...(gain > 0 ? applyHappinessGain(sheet, 1, "training") : {}) });
                } : undefined}
                onChange={v => {
                  if (v < base) return;
                  const cost = v - sheet.attributes[attr];
                  if (cost > 0 && upgradesLeft <= 0) return;
                  upd({ attributes: { ...sheet.attributes, [attr]: v } });
                }} />
            );
          })}
          <div style={{ marginTop: 8, fontSize: 11, color: "#585858" }}>
            HP: <strong style={{ color: "#2850A0" }}>{pokemon.baseHp + sheet.attributes.vitality + ta.vitality}</strong> &nbsp;
            WP: <strong style={{ color: "#6890f0" }}>{sheet.attributes.insight + ta.insight + 3}</strong> &nbsp;
            DEF: <strong style={{ color: "#202020" }}>{sheet.attributes.vitality + ta.vitality}</strong> &nbsp;
            SP.DEF: <strong style={{ color: "#202020" }}>{sheet.attributes.insight + ta.insight}</strong>
          </div>
          {/* Training Roll Calculator */}
          {trainingMode && (
            <div style={{ marginTop: 10, background: "#F8F4D0", border: "1px solid #A0700030", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: "#A07000", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>Training Rolls (roll 4+ to succeed)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(["strength","dexterity","vitality","special","insight"] as const).map(attr => {
                  const cfg = TRAINING_ROLLS[attr];
                  const tAttr = trainerAttrs[cfg.trainerAttr] ?? 0;
                  const tSkill = trainerSkills[cfg.trainerSkill] ?? 0;
                  const pool = tAttr + tSkill;
                  const trainingPts = ta[attr] ?? 0;
                  const speciesCap = pokemon.attributeLimits?.[attr] ?? Math.min(pokemon.attributes[attr] + 4, 8);
                  const attrCap = sheet.isPartner ? Math.max(10, speciesCap) : speciesCap;
                  const cap = attrCap - sheet.attributes[attr];
                  return (
                    <div key={attr} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#A07000", width: 28 }}>{cfg.label}</span>
                      <span style={{ fontSize: 10, color: "#383838" }}>
                        {cfg.trainerAttr}({tAttr}) + {cfg.trainerSkill}({tSkill})
                      </span>
                      <button
                        disabled={pool <= 0}
                        onClick={() => {
                          const rolls = Array.from({ length: pool }, () => Math.ceil(Math.random() * 6));
                          setTrainingRoll({ attr, pool, rolls });
                        }}
                        style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: pool > 0 ? "#A07000" : "#7888A8", background: pool > 0 ? "rgba(255,211,42,0.1)" : "transparent", border: `1px solid ${pool > 0 ? "#A0700050" : "#2850A0"}`, borderRadius: 4, padding: "2px 10px", fontFamily: "'Exo 2'", cursor: pool > 0 ? "pointer" : "default" }}>
                        {pool}d6
                      </button>
                      <span style={{ fontSize: 10, color: "#585858" }}>{trainingPts}/{cap} pts</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: "#585858", lineHeight: 1.5 }}>
                Each success = 1 training point &middot; 2 pts &rarr; +1 to attribute &middot; +1 Happiness per session
              </div>
            </div>
          )}
          {/* Training Roll Popup */}
          {trainingRoll && (() => {
            const cfg = TRAINING_ROLLS[trainingRoll.attr];
            const successes = trainingRoll.rolls.filter(r => r >= 4).length;
            const trainingPts = ta[trainingRoll.attr as keyof typeof ta] ?? 0;
            const speciesCapP = pokemon.attributeLimits?.[trainingRoll.attr as keyof typeof pokemon.attributeLimits] ?? Math.min(pokemon.attributes[trainingRoll.attr as keyof typeof pokemon.attributes] + 4, 8);
            const cap = (sheet.isPartner ? Math.max(10, speciesCapP) : speciesCapP) - sheet.attributes[trainingRoll.attr as keyof typeof sheet.attributes];
            const canApply = successes > 0 && trainingPts < cap;
            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTrainingRoll(null)}>
                <div style={{ background: "#FBF8E4", border: "1px solid #A0700040", borderRadius: 10, width: 360, overflow: "hidden" }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #2850A0", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#A07000", fontFamily: "'Exo 2'" }}>{cfg.label} Training Roll</div>
                      <div style={{ fontSize: 10, color: "#585858", marginTop: 2 }}>{cfg.trainerAttr}({trainerAttrs[cfg.trainerAttr]}) + {cfg.trainerSkill}({trainerSkills[cfg.trainerSkill]}) = {trainingRoll.pool}d6</div>
                    </div>
                    <button onClick={() => setTrainingRoll(null)} style={{ background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 18 }}>✕</button>
                  </div>
                  <div style={{ padding: 16 }}>
                    {/* Dice display */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
                      {trainingRoll.rolls.map((r, i) => {
                        const hit = r >= 4;
                        return (
                          <div key={i} style={{ width: 44, height: 44, borderRadius: 8, border: `2px solid ${hit ? "#2850A0" : "#7888A8"}`, background: hit ? "rgba(0,212,170,0.12)" : "#F8F4D0", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: hit ? "#2850A0" : "#585858", fontFamily: "'Exo 2'" }}>{r}</span>
                            <span style={{ fontSize: 7, color: hit ? "#2850A0" : "#7888A8", letterSpacing: "0.5px" }}>{hit ? "HIT" : "MISS"}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Result summary */}
                    <div style={{ textAlign: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: successes > 0 ? "#2850A0" : "#C02820", fontFamily: "'Exo 2'" }}>{successes}</span>
                      <span style={{ fontSize: 13, color: "#383838", marginLeft: 6 }}>success{successes !== 1 ? "es" : ""} out of {trainingRoll.pool} dice</span>
                      <div style={{ fontSize: 10, color: "#585858", marginTop: 4 }}>Training pts: {trainingPts} + {successes} → {Math.min(trainingPts + successes, cap)} / {cap}</div>
                    </div>
                    {/* Buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => {
                        const rolls = Array.from({ length: trainingRoll.pool }, () => Math.ceil(Math.random() * 6));
                        setTrainingRoll({ ...trainingRoll, rolls });
                      }} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid #7888A8", background: "#F8F4D0", color: "#383838", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        🎲 Reroll
                      </button>
                      <button
                        disabled={!canApply}
                        onClick={() => {
                          if (!canApply) return;
                          const newPts = Math.min(trainingPts + successes, cap);
                          upd({ trainingAttributes: { ...ta, [trainingRoll.attr]: newPts }, ...applyHappinessGain(sheet, 1, "training") });
                          setTrainingRoll(null);
                        }}
                        style={{ flex: 2, padding: "8px 0", borderRadius: 6, border: "none", background: canApply ? "rgba(0,212,170,0.2)" : "#2850A0", color: canApply ? "#2850A0" : "#585858", cursor: canApply ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}>
                        {successes === 0 ? "No successes" : trainingPts >= cap ? "Already at cap" : `✅ Apply +${successes} pts`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Loyalty, Happiness, Moves */}
        <div>
          <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>
            {/* Loyalty */}
            <div>
              <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Loyalty (0–5)</div>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} onClick={() => upd({ loyalty: i })}
                    style={{ width: 14, height: 14, borderRadius: "50%", cursor: "pointer", background: i <= sheet.loyalty ? "#A07000" : "#2850A0", border: `1px solid ${i <= sheet.loyalty ? "#A07000" : "#7888A8"}` }} />
                ))}
              </div>
              <button onClick={() => upd({ cruelty: !(sheet.cruelty ?? false) })}
                style={{ marginTop: 4, fontSize: 9, padding: "2px 6px", borderRadius: 3, border: `1px solid ${sheet.cruelty ? "#C02820" : "#7888A8"}`, background: sheet.cruelty ? "#C0282015" : "transparent", color: sheet.cruelty ? "#C02820" : "#585858", cursor: "pointer", fontWeight: 700, width: "100%" }}>
                {sheet.cruelty ? "⚠ Cruelty ON" : "Cruelty"}
              </button>
            </div>
            {/* Happiness */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Happiness (0–5)</div>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} onClick={() => upd({ happiness: i })}
                    style={{ width: 14, height: 14, borderRadius: "50%", cursor: "pointer", background: i <= sheet.happiness ? "#f85888" : "#2850A0", border: `1px solid ${i <= sheet.happiness ? "#f85888" : "#7888A8"}` }} />
                ))}
              </div>
              {/* Action buttons */}
              <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                <button onClick={() => { setShowFeedPanel(p => !p); }}
                  style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${showFeedPanel ? "#f08030" : "#7888A8"}`, background: showFeedPanel ? "#f0803015" : "transparent", color: showFeedPanel ? "#f08030" : "#585858", cursor: "pointer", fontWeight: 700 }}>🍎 Feed</button>
                {(() => {
                  const hasGroomingKit = trainerInventory.some(i => i.name.toLowerCase() === "grooming kit" && i.quantity > 0);
                  return (
                    <button onClick={() => { if (hasGroomingKit) upd(applyHappinessGain(sheet, 1)); }}
                      title={hasGroomingKit ? "Groom (+1 Happiness)" : "Requires Grooming Kit in trainer's bag"}
                      style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${hasGroomingKit ? "#7888A8" : "#2850A0"}`, background: "transparent", color: hasGroomingKit ? "#585858" : "#7888A8", cursor: hasGroomingKit ? "pointer" : "not-allowed", fontWeight: 700, opacity: hasGroomingKit ? 1 : 0.5 }}>
                      ✨ Groom +1
                    </button>
                  );
                })()}
                <button onClick={() => upd(applyHappinessGain(sheet, -1))}
                  style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: "1px solid #7888A8", background: "transparent", color: "#585858", cursor: "pointer", fontWeight: 700 }}>💢 Mistreat</button>
                <button onClick={() => {
                  const next = !(sheet.inPokeball ?? false);
                  upd({ inPokeball: next, ...applyHappinessGain(sheet, next ? -1 : 1) });
                }} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${sheet.inPokeball ? "#6890f0" : "#7888A8"}`, background: sheet.inPokeball ? "#6890f015" : "transparent", color: sheet.inPokeball ? "#6890f0" : "#585858", cursor: "pointer" }}>
                  {sheet.inPokeball ? "⚪ Poké Ball" : "🚶 Walking"}
                </button>
              </div>
              {/* Feed panel */}
              {showFeedPanel && (
                <div style={{ marginTop: 6, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 5, padding: 6, maxHeight: 180, overflowY: "auto" }}>
                  <div style={{ fontSize: 9, color: "#585858", marginBottom: 4 }}>
                    {NATURE_FLAVORS[nature] ? `${nature}: likes ${NATURE_FLAVORS[nature].liked} · dislikes ${NATURE_FLAVORS[nature].disliked}` : `${nature}: neutral taste`}
                    {hasSootherBell && <span style={{ color: "#A07000", marginLeft: 6 }}>🔔 +1 to all gains</span>}
                  </div>
                  {feedableItems.length === 0 && (
                    <div style={{ fontSize: 10, color: "#585858", fontStyle: "italic", textAlign: "center", padding: 8 }}>
                      No food items in trainer&apos;s bag.<br/>Add items to the trainer&apos;s inventory first.
                    </div>
                  )}
                  {feedableItems.map(item => {
                    const delta = getFeedDelta(item, nature);
                    const sign = delta > 0 ? `+${delta}` : `${delta}`;
                    const color = item.isMedicine ? "#C02820" : delta > item.baseDelta ? "#2850A0" : delta === 0 ? "#585858" : "#f85888";
                    // Merged, so two "Potion" rows report the three the bag
                    // actually holds rather than whichever row came first.
                    const trainerQty = mergeInventory(trainerInventory)
                      .find(ti => ti.name.toLowerCase() === item.name.toLowerCase())?.quantity ?? 0;
                    return (
                      <div key={item.name} onClick={() => {
                        upd(applyHappinessGain(sheet, delta));
                        onTransferItemFromTrainer(item.name); // consume 1 from trainer bag
                        setShowFeedPanel(false);
                      }}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 5px", borderRadius: 3, cursor: "pointer", opacity: delta === 0 ? 0.4 : 1 }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "#FBF8E4"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                        <span style={{ fontSize: 13 }}>{item.emoji}</span>
                        <span style={{ fontSize: 10, color: "#202020", flex: 1 }}>{item.name}</span>
                        <span style={{ fontSize: 9, color: "#585858" }}>×{trainerQty}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color }}>{sign} 😊</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Evolution hint */}
          {HAPPINESS_EVO_POKEMON.has(pokemon.name) && sheet.happiness >= 4 && !sheet.isPartner && (
            <div style={{ fontSize: 10, color: "#2850A0", background: "#2850A010", border: "1px solid #2850A030", borderRadius: 4, padding: "3px 8px", marginBottom: 8 }}>
              ✨ {pokemon.name} is happy enough to evolve!
            </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase" }}>
                Active Moves ({sheet.moves.length}/{maxMoves})
              </div>
              <button onClick={() => setEditMoves(m => !m)} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${editMoves ? "#2850A0" : "#7888A8"}`, background: editMoves ? "#2850A018" : "transparent", color: editMoves ? "#2850A0" : "#585858", cursor: "pointer", fontWeight: 700 }}>
                {editMoves ? "Done" : "Edit Moves"}
              </button>
            </div>

            {/* Active move slots */}
            {!editMoves && (
              <div>
                {Array.from({ length: maxMoves }).map((_, i) => {
                  const name = sheet.moves[i];
                  const move = name ? (MOVES_DATA.find(m => m.name === name) ?? pokemon.moves.find(m => m.name === name)) : null;
                  if (name && move) {
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 3, background: "#2850A008" }}>
                        <TypeBadge type={move.type} />
                        <span style={{ fontSize: 11, color: "#202020", flex: 1 }}>
                          {name}
                          {(name === "Return") && <span style={{ fontSize: 9, color: "#f85888", marginLeft: 4 }}>(Power {sheet.happiness * 10 + 10})</span>}
                          {(name === "Frustration") && <span style={{ fontSize: 9, color: "#585880", marginLeft: 4 }}>(Power {(5 - sheet.happiness) * 10 + 10})</span>}
                        </span>
                        <span style={{ fontSize: 9, color: RANK_COLORS[move.rank as Rank] ?? "#585858", marginLeft: "auto" }}>{move.rank}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "3px 6px", borderRadius: 3, border: "1px dashed #2850A0", marginBottom: 2, minHeight: 22 }}>
                      <span style={{ fontSize: 10, color: "#4A5468", fontStyle: "italic" }}>— empty slot —</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Edit mode: full learnset picker */}
            {editMoves && (
              <div>
                <div style={{ fontSize: 9, color: "#585858", marginBottom: 4 }}>Click to add/remove from active moves</div>
                {pokemon.moves.filter(m => RANK_ORDER.indexOf(m.rank) <= RANK_ORDER.indexOf(sheet.rank)).map(m => {
                  const active = sheet.moves.includes(m.name);
                  return (
                    <div key={m.name} onClick={() => {
                      if (active) upd({ moves: sheet.moves.filter(x => x !== m.name) });
                      else if (sheet.moves.length < maxMoves) upd({ moves: [...sheet.moves, m.name] });
                    }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 3, cursor: "pointer", opacity: !active && sheet.moves.length >= maxMoves ? 0.35 : 1, background: active ? "#2850A015" : "transparent" }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${active ? "#2850A0" : "#7888A8"}`, background: active ? "#2850A0" : "transparent", flexShrink: 0 }} />
                      <TypeBadge type={m.type} />
                      <span style={{ fontSize: 11, color: "#202020" }}>{m.name}</span>
                      <span style={{ fontSize: 9, color: RANK_COLORS[m.rank], marginLeft: "auto" }}>{m.rank}</span>
                    </div>
                  );
                })}

                {/* Partner egg group moves in edit mode */}
                {sheet.isPartner && (
                  <div style={{ marginTop: 8, borderTop: "1px solid #2850A060", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#A07000", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
                      ⭐ Egg Group Moves
                      {eggGroupMovePool.size > 0 && <span style={{ fontSize: 9, color: "#585858", textTransform: "none", marginLeft: 6, letterSpacing: 0 }}>({(POKEMON_EGG_GROUPS[pokemon.name] ?? []).join(", ")} group{(POKEMON_EGG_GROUPS[pokemon.name]?.length ?? 0) > 1 ? "s" : ""})</span>}
                    </div>
                    <div style={{ maxHeight: 160, overflowY: "auto" }}>
                      {eggGroupMovesInRank.map(m => {
                        const learned = (sheet.partnerMoves || []).includes(m.name);
                        const active = sheet.moves.includes(m.name);
                        return (
                          <div key={m.name} onClick={() => {
                            if (learned) {
                              upd({ partnerMoves: (sheet.partnerMoves || []).filter(x => x !== m.name), moves: sheet.moves.filter(x => x !== m.name) });
                            } else {
                              upd({ partnerMoves: [...(sheet.partnerMoves || []), m.name], moves: active ? sheet.moves : sheet.moves.length < maxMoves ? [...sheet.moves, m.name] : sheet.moves });
                            }
                          }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 3, cursor: "pointer", opacity: !learned && sheet.moves.length >= maxMoves ? 0.4 : 1, background: learned ? "#A070000d" : "transparent" }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${learned ? "#A07000" : "#7888A8"}`, background: learned ? "#A07000" : "transparent", flexShrink: 0 }} />
                            <TypeBadge type={m.type} />
                            <span style={{ fontSize: 11, color: "#202020", flex: 1 }}>{m.name}</span>
                            <span style={{ fontSize: 9, color: RANK_COLORS[m.rank as Rank] ?? "#585858" }}>{m.rank}</span>
                          </div>
                        );
                      })}
                      {eggGroupMovesInRank.length === 0 && <div style={{ fontSize: 10, color: "#585858", fontStyle: "italic", padding: "4px 6px" }}>No egg group moves available at this rank.</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Pokémon Skills */}
      {(() => {
        const skillInfo = TRAINER_RANK_POINTS[sheet.rank];
        const usedPts = Object.values(sheet.skills).reduce((a, b) => a + b, 0);
        const POKEMON_SKILLS: { key: keyof typeof sheet.skills; label: string; desc: string }[] = [
          { key: "brawl",      label: "Brawl",      desc: "Physical contact moves" },
          { key: "channel",    label: "Channel",    desc: "Special & ranged moves" },
          { key: "clash",      label: "Clash",      desc: "Clash reaction (counter-attack)" },
          { key: "evasion",    label: "Evasion",    desc: "Evasion reaction (dodge)" },
          { key: "alert",      label: "Alert",      desc: "Perception & surprise" },
          { key: "athletic",   label: "Athletic",   desc: "Speed, jumping, physical feats" },
          { key: "nature",     label: "Nature",     desc: "Wilderness, tracking" },
          { key: "stealth",    label: "Stealth",    desc: "Hiding, silent movement" },
          { key: "intimidate", label: "Intimidate", desc: "Intimidation" },
          { key: "perform",    label: "Perform",    desc: "Contests & performance" },
        ];
        return (
          <div style={{ marginTop: 12, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 6, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#383838", letterSpacing: "1px", textTransform: "uppercase" }}>Skills</span>
              <span style={{ fontSize: 9, color: usedPts > skillInfo.skillPoints ? "#C02820" : "#585858" }}>{usedPts}/{skillInfo.skillPoints} pts · max {skillInfo.skillLimit}/skill</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px" }}>
              {POKEMON_SKILLS.map(({ key, label, desc }) => {
                const val = sheet.skills[key] ?? 0;
                return (
                  /* The tooltip belongs on the name, not the whole row — on the
                     row it fired over the pip boxes you actually click, which
                     reads as the boxes having descriptions. */
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span title={desc} style={{ fontSize: 10, color: "#383838", width: 68, flexShrink: 0, cursor: "help",
                      textDecoration: "underline dotted rgba(56,56,56,0.4)", textUnderlineOffset: 2 }}>{label}</span>
                    <div style={{ display: "flex", gap: 2 }}>
                      {Array.from({ length: skillInfo.skillLimit }).map((_, i) => (
                        <button key={i} onClick={() => {
                          const newVal = val === i + 1 ? i : i + 1;
                          const cost = newVal - val;
                          if (cost > 0 && usedPts >= skillInfo.skillPoints) return;
                          upd({ skills: { ...sheet.skills, [key]: newVal } });
                        }} style={{ width: 12, height: 12, borderRadius: 2, border: `1px solid ${i < val ? "#6890f0" : "#2850A0"}`, background: i < val ? "#6890f0" : "transparent", cursor: "pointer", padding: 0 }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: "#585858", marginLeft: 2 }}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <textarea value={sheet.notes} onChange={e => upd({ notes: e.target.value })} placeholder="Notes about this Pokémon..."
        style={{ width: "100%", marginTop: 10, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#383838", fontSize: 11, padding: 6, resize: "none", minHeight: 40, fontFamily: "inherit", lineHeight: 1.5, outline: "none" }} />
    </div>
  );
}

function revertPartnerSheet(sheet: PokemonSheetData): PokemonSheetData {
  const pokemon = POKEMON.find(p => p.number === sheet.number);
  if (!pokemon) return { ...sheet, isPartner: false, partnerMoves: [] };
  const ATTRS = ["strength","dexterity","vitality","special","insight"] as const;
  const newAttrs = { ...sheet.attributes };
  const newTraining = { ...(sheet.trainingAttributes ?? { strength:0, dexterity:0, vitality:0, special:0, insight:0 }) };
  for (const attr of ATTRS) {
    const base = pokemon.attributes[attr];
    const cap = pokemon.attributeLimits?.[attr] ?? Math.min(base + 4, 8);
    newAttrs[attr] = Math.min(sheet.attributes[attr], cap);
    newTraining[attr] = Math.min(newTraining[attr], Math.max(0, cap - newAttrs[attr]));
  }
  const partnerMoveSet = new Set(sheet.partnerMoves ?? []);
  return {
    ...sheet,
    isPartner: false,
    attributes: newAttrs,
    trainingAttributes: newTraining,
    partnerMoves: [],
    moves: sheet.moves.filter(m => !partnerMoveSet.has(m)),
  };
}

/* ── Setup guidance ──────────────────────────────────────────────────────────
   PokeRole gives a trainer three separate point budgets and a name, and none
   of that is discoverable from a wall of twelve panels — you only learn a
   budget was left unspent when the GM asks. The checklist states what the
   rules still want, and each row jumps to the panel that satisfies it, so
   building a character is a list you work down rather than a page you hunt. */
type SectionKey = "identity" | "attributes" | "skills" | "inventory" | "equipment" | "extras";
type Todo = { id: string; label: string; hint: string; tab: TabKey; section: SectionKey };
type TabKey = "sheet" | "pokemon" | "pcbox";

function SetupChecklist({ todos, onJump }: { todos: Todo[]; onJump: (t: Todo) => void }) {
  if (todos.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#E4F4E8",
        border: "1px solid #2E8B57", borderRadius: 8, padding: "9px 13px", marginBottom: 14 }}>
        <span style={{ fontSize: 15 }}>✓</span>
        <span style={{ fontSize: 12, color: "#1C6640", fontWeight: 600 }}>
          Sheet complete — every point spent, and a Pokémon on the team.
        </span>
      </div>
    );
  }
  return (
    <div style={{ background: "#FFF6DC", border: "1px solid #C08018", borderRadius: 8,
      padding: "10px 13px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>📝</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#8A5A00" }}>
          Still to set up — {todos.length} thing{todos.length === 1 ? "" : "s"} left
        </span>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {todos.map(t => (
          <button key={t.id} onClick={() => onJump(t)} title={t.hint}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              background: "#FFFFFF", border: "1px solid #C08018", borderRadius: 20,
              padding: "5px 11px", fontSize: 12, color: "#5A3C00", textAlign: "left" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E8A020", flexShrink: 0 }} />
            {t.label}
            <span style={{ color: "#A07000", fontSize: 13, lineHeight: 1 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* A label's worth of rules text, on demand. Native title= rather than a
   custom popover: it works on keyboard focus and long-press, and this page
   already has enough moving parts without another layer that can be left
   open. */
function Hint({ text }: { text: string }) {
  return (
    <span title={text} tabIndex={0} role="note" aria-label={text}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%", flexShrink: 0, cursor: "help",
        border: "1px solid #2850A0", color: "#2850A0", fontSize: 9, fontWeight: 700,
        lineHeight: 1, marginLeft: 5 }}>i</span>
  );
}

/* Collapsible section. The sheet is long enough that everything-open forces
   the scrolling the page was criticised for; the panels that matter while
   building a character stay open, the reference-y ones fold away. */
function Panel({ title, hint, badge, open, onToggle, children, sectionRef }: {
  title: string; hint?: string; badge?: React.ReactNode;
  open: boolean; onToggle: () => void; children: React.ReactNode;
  sectionRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={sectionRef} style={{ background: "#FBF8E4", border: "1px solid #2850A0",
      borderRadius: 8, overflow: "hidden", scrollMarginTop: 8 }}>
      <button onClick={onToggle} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer",
          background: open ? "#EFE7C4" : "transparent", border: "none",
          borderBottom: open ? "1px solid #2850A0" : "none", padding: "10px 14px", textAlign: "left" }}>
        <span aria-hidden style={{ fontSize: 10, color: "#2850A0", width: 10, flexShrink: 0 }}>
          {open ? "▼" : "▶"}
        </span>
        <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 14, color: "#202020", margin: 0 }}>
          {title}
        </h3>
        {hint && <Hint text={hint} />}
        <span style={{ flex: 1 }} />
        {badge}
      </button>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}

/* Tabs drawn as tabs: the active one shares the panel's fill and sits on top
   of its keyline, so it reads as the front of a stack rather than three
   buttons that happen to be tinted differently. */
function TabBar({ tab, onPick, counts, narrow }: {
  tab: TabKey; onPick: (t: TabKey) => void;
  counts: { party: number; box: number }; narrow: boolean;
}) {
  const tabs: { k: TabKey; label: string; icon: string; badge?: string }[] = [
    { k: "sheet",  label: narrow ? "Sheet"  : "Trainer Sheet", icon: "📋" },
    { k: "pokemon", label: narrow ? "Party" : "Pokémon Party", icon: "🎮", badge: `${counts.party}/6` },
    { k: "pcbox",  label: narrow ? "Box"    : "PC Box",        icon: "📦", badge: String(counts.box) },
  ];
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #2850A0", marginBottom: 14 }}>
      {tabs.map(t => {
        const on = tab === t.k;
        return (
          <button key={t.k} onClick={() => onPick(t.k)} aria-selected={on} role="tab"
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              padding: narrow ? "7px 10px" : "8px 16px",
              border: "2px solid #2850A0", borderBottom: "none",
              borderRadius: "7px 7px 0 0", marginBottom: -2,
              background: on ? "#FBF8E4" : "#D9E4F2",
              color: on ? "#2850A0" : "#4A5878",
              fontSize: narrow ? 12 : 13, fontWeight: on ? 700 : 600,
              boxShadow: on ? "0 -2px 0 #2850A0 inset" : "none" }}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
            {t.badge && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 9,
                background: on ? "#2850A0" : "#B8C6DC", color: on ? "#FFFFFF" : "#33415C" }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* useSearchParams needs a Suspense boundary in the App Router, so the export
   is a thin wrapper and the real page — everything below — reads the query
   string one level in. */
export default function CharactersPage() {
  return (
    <Suspense fallback={null}>
      <CharactersPageInner />
    </Suspense>
  );
}

function CharactersPageInner() {
  const searchParams = useSearchParams();
  const [trainers, setTrainers] = useState<TrainerData[]>(() => loadFromStorage("trainers", []));
  const [pokemonSheets, setPokemonSheets] = useState<Record<string, PokemonSheetData>>(() => loadFromStorage("pokemon_sheets", {}));
  /* Open on whoever the Pokédex device is currently playing as. Landing on an
     empty panel when a trainer is already saved is a step nobody wants, and
     the active trainer is the one they were just looking at. */
  const [selId, setSelId] = useState<string | null>(
    () => getActiveTrainer(loadFromStorage<TrainerData[]>("trainers", []))?.id ?? null
  );
  /* The landing device's POKéMON row links straight to ?tab=pokemon rather
     than always opening on the trainer sheet — a click meant "show me my
     party" shouldn't need a second click once it lands here. */
  const [tab, setTab] = useState<TabKey>(() => {
    const q = searchParams.get("tab");
    return q === "pokemon" || q === "pcbox" ? q : "sheet";
  });
  const [pSearch, setPSearch] = useState("");
  const [pSort, setPSort] = useState<"dex" | "name" | "rank">("dex");
  const [useItemIdx, setUseItemIdx] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  /* Open by default only what you actually fill in while building a
     character; the reference-heavy panels start folded so the sheet fits on
     a screen instead of demanding a scroll to survey. */
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    identity: true, attributes: true, skills: true,
    inventory: false, equipment: false, extras: false,
  });
  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLDivElement | null>>>({});

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggleSection = useCallback((k: SectionKey) => {
    setOpenSections(s => ({ ...s, [k]: !s[k] }));
  }, []);

  useEffect(() => { saveToStorage("trainers", trainers); }, [trainers]);
  useEffect(() => { saveToStorage("pokemon_sheets", pokemonSheets); }, [pokemonSheets]);
  /* The landing Pokédex plays as one trainer. Opening a trainer here is the
     natural way to say which one, so the device follows the sheet you're
     actually working on. */
  useEffect(() => { if (selId) setActiveTrainer(selId); }, [selId]);

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

  const usedSkillPoints = sel
    ? Object.values(sel.skills).reduce((a, b) => a + b, 0) + (sel.customSkills || []).reduce((a, cs) => a + cs.points, 0)
    : 0;

  /* What the rules still want from this sheet. Ordered the way you'd build a
     character: who they are, then what they're made of, then what they carry. */
  const todos: Todo[] = useMemo(() => {
    if (!sel) return [];
    const out: Todo[] = [];
    const plural = (n: number) => (n === 1 ? "" : "s");
    if (!sel.name.trim()) out.push({
      id: "name", label: "Name your trainer", tab: "sheet", section: "identity",
      hint: "Every sheet needs a trainer name — it's what the Pokédex device and the battle tracker call you.",
    });
    if (attrBudgetLeft > 0) out.push({
      id: "attr", label: `${attrBudgetLeft} attribute point${plural(attrBudgetLeft)} left`,
      tab: "sheet", section: "attributes",
      hint: `Your age and rank grant ${totalAttrPoints} points across Strength, Dexterity, Vitality and Insight.`,
    });
    if (socialBudgetLeft > 0) out.push({
      id: "social", label: `${socialBudgetLeft} social point${plural(socialBudgetLeft)} left`,
      tab: "sheet", section: "attributes",
      hint: `Tough, Cool, Beauty, Cute and Clever share ${totalSocialPoints} points — they drive social rolls and contests.`,
    });
    const skillLeft = rankInfo.skillPoints - usedSkillPoints;
    if (skillLeft > 0) out.push({
      id: "skill", label: `${skillLeft} skill point${plural(skillLeft)} left`,
      tab: "sheet", section: "skills",
      hint: `Rank ${sel.rank} gives ${rankInfo.skillPoints} skill points, at most ${rankInfo.skillLimit} in any one skill.`,
    });
    if (sel.pokemon.length === 0) out.push({
      id: "mon", label: "Catch your first Pokémon", tab: "pokemon", section: "identity",
      hint: "Add a Pokémon to your party — it shows up on the Pokédex home screen and can drop straight into a battle.",
    });
    return out;
  }, [sel, attrBudgetLeft, totalAttrPoints, socialBudgetLeft, totalSocialPoints,
      rankInfo.skillPoints, rankInfo.skillLimit, usedSkillPoints]);

  /* Jumping opens the panel that satisfies the item and scrolls it into view.
     The timeout lets the tab switch commit first — the target panel may not be
     mounted yet when the click handler runs. */
  const jumpTo = useCallback((t: Todo) => {
    setTab(t.tab);
    setOpenSections(s => ({ ...s, [t.section]: true }));
    setTimeout(() => {
      sectionRefs.current[t.section]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const filtPokemon = useMemo(() => {
    const filtered = pSearch
      ? POKEMON.filter(p => p.name.toLowerCase().includes(pSearch.toLowerCase()) || String(p.number).includes(pSearch.replace("#","")))
      : [...POKEMON];
    if (pSort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (pSort === "rank") filtered.sort((a, b) => getRankIndex(a.suggestedRank) - getRankIndex(b.suggestedRank) || a.number - b.number);
    // "dex" is default national dex order
    return filtered;
  }, [pSearch, pSort]);

  /* Catching puts a Pokémon either in the party or straight into the PC, the
     way the games do. Without the box route a full party is a dead end: the
     browser greys out and there's nothing you can do but delete someone. */
  const addPokemon = (num: number, to: "party" | "box" = "party") => {
    if (!sel) return;
    if (to === "party" && sel.pokemon.length >= 6) return;
    const key = `${sel.id}_${num}_${Date.now()}`;
    setTrainers(prev => prev.map(t => t.id !== sel.id ? t : to === "party"
      ? { ...t, pokemon: [...t.pokemon, key] }
      : { ...t, pcBox: [...(t.pcBox ?? []), key] }));
    setPokemonSheets(prev => ({ ...prev, [key]: makeBlankPokemonSheet(num, sel.rank) }));
  };

  const removePokemon = (key: string) => {
    if (!sel) return;
    setTrainers(prev => prev.map(t => t.id === sel.id ? { ...t, pokemon: t.pokemon.filter(k => k !== key) } : t));
    setPokemonSheets(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const updatePokemonSheet = (key: string, sheet: PokemonSheetData) => {
    // Auto-revoke partner status if loyalty AND happiness both hit 0
    const updated = (sheet.isPartner && sheet.loyalty === 0 && sheet.happiness === 0)
      ? revertPartnerSheet(sheet)
      : sheet;
    setPokemonSheets(prev => ({ ...prev, [key]: updated }));
  };

  const designatePartner = useCallback((newKey: string) => {
    if (!sel) return;
    const currentPartnerKey = sel.pokemon.find(k => pokemonSheets[k]?.isPartner);
    if (currentPartnerKey && currentPartnerKey !== newKey) {
      const oldName = pokemonSheets[currentPartnerKey]?.nickname || POKEMON.find(p => p.number === pokemonSheets[currentPartnerKey]?.number)?.name || "current Partner";
      const newName = pokemonSheets[newKey]?.nickname || POKEMON.find(p => p.number === pokemonSheets[newKey]?.number)?.name || "this Pokémon";
      const ok = window.confirm(
        `Switch Partner Pokémon?\n\n${newName} will become the new Partner.\n\n${oldName} will lose Partner status — its attributes will revert to its natural caps and any Egg Group moves it learned will be removed.`
      );
      if (!ok) return;
      setPokemonSheets(prev => ({
        ...prev,
        [currentPartnerKey]: revertPartnerSheet(prev[currentPartnerKey]),
        [newKey]: { ...prev[newKey], isPartner: true },
      }));
    } else {
      setPokemonSheets(prev => ({ ...prev, [newKey]: { ...prev[newKey], isPartner: true } }));
    }
  }, [sel, pokemonSheets]);

  const revokePartner = useCallback((key: string) => {
    const name = pokemonSheets[key]?.nickname || POKEMON.find(p => p.number === pokemonSheets[key]?.number)?.name || "this Pokémon";
    const ok = window.confirm(
      `Remove Partner status from ${name}?\n\nIts attributes will revert to its natural caps and any Egg Group moves it learned will be removed.`
    );
    if (!ok) return;
    setPokemonSheets(prev => ({ ...prev, [key]: revertPartnerSheet(prev[key]) }));
  }, [pokemonSheets]);

  const createTrainer = useCallback(() => {
    const t = makeBlank();
    setTrainers(p => [...p, t]);
    setSelId(t.id);
  }, []);

  return (
    <PokedexFrame active="characters" actions={
      <span style={{ fontSize: 10, color: "#FFFFFF", whiteSpace: "nowrap" }}>Auto-saved</span>
    }>
      {/* Portrait stacks: a 220px column of mostly-empty list is the worst use
          of a phone's width, so there the roster becomes a one-line picker
          above the sheet and gives its width back to the content. */}
      <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", flex: 1, minHeight: 0,
        overflow: "hidden", background: "#35785F", color: "#202020" }}>

        {narrow ? (
          <div style={{ flexShrink: 0, background: "#F8F4D0", borderBottom: "1px solid #2850A0",
            padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
            <select value={selId ?? ""} onChange={e => setSelId(e.target.value || null)}
              aria-label="Choose trainer"
              style={{ flex: 1, minWidth: 0, background: "#FFFFFF", border: "1px solid #2850A0",
                borderRadius: 5, padding: "7px 8px", fontSize: 13, color: "#202020" }}>
              <option value="">
                {trainers.length ? "— choose a trainer —" : "— no trainers yet —"}
              </option>
              {trainers.map(t => (
                <option key={t.id} value={t.id}>{(t.name || "Unnamed")} · {t.rank}</option>
              ))}
            </select>
            {sel && (
              <button onClick={() => { setTrainers(p => p.filter(x => x.id !== sel.id)); setSelId(null); }}
                title={`Delete ${sel.name || "this trainer"}`} aria-label="Delete trainer"
                style={{ flexShrink: 0, background: "#FFFFFF", border: "1px solid #C02820", borderRadius: 5,
                  color: "#C02820", cursor: "pointer", fontSize: 13, padding: "6px 10px" }}>✕</button>
            )}
            <button onClick={createTrainer} title="New trainer"
              style={{ flexShrink: 0, background: "#2850A0", color: "#fff", border: "none", borderRadius: 5,
                padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer",
                whiteSpace: "nowrap" }}>+ New</button>
          </div>
        ) : (
          <div style={{ width: 220, background: "#F8F4D0", borderRight: "1px solid #2850A0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "10px 8px", borderBottom: "1px solid #2850A0" }}>
              <button onClick={createTrainer}
                style={{ width: "100%", background: "#2850A0", color: "#fff", border: "none", borderRadius: 5, padding: 7, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ New Trainer</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
              {trainers.length === 0 && <div style={{ textAlign: "center", color: "#585858", padding: 20, fontSize: 12 }}>No trainers yet</div>}
              {trainers.map(t => (
                <div key={t.id} onClick={() => setSelId(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 5, cursor: "pointer", background: selId === t.id ? "#D8D8D8" : "transparent", borderLeft: `2px solid ${selId === t.id ? "#2850A0" : "transparent"}` }}
                  onMouseEnter={e => { if (selId !== t.id) (e.currentTarget as HTMLDivElement).style.background = "#FBF8E4"; }}
                  onMouseLeave={e => { if (selId !== t.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#202020", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name || "Unnamed"}</div>
                    <div style={{ fontSize: 10, color: RANK_COLORS[t.rank] }}>{t.rank} · {t.age}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setTrainers(p => p.filter(x => x.id !== t.id)); if (selId === t.id) setSelId(null); }}
                    style={{ background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!sel ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, overflowY: "auto" }}>
            {trainers.length > 0 ? (
              <div style={{ textAlign: "center", color: "#EAF6EE", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 40 }}>👤</div>
                <div>{narrow ? "Choose a trainer above to open their sheet"
                             : "Select a trainer from the list to open their sheet"}</div>
              </div>
            ) : (
              <div style={{ maxWidth: 520 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 }}>No trainers yet</div>
                <div style={{ fontSize: 13, color: "#EAF6EE", lineHeight: 1.6, marginBottom: 20 }}>
                  Create a trainer to keep their whole character in one place. Everything saves automatically
                  and their party can be dropped straight into the Battle Tracker.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
                  {[
                    ["📋", "Trainer Sheet", "Rank, age, nature, attributes, skills and derived combat stats"],
                    ["🎮", "Pokémon Party", "Up to six Pokémon with HP, moves, loyalty, happiness and Partner status"],
                    ["📦", "PC Box", "Everyone else you've caught, ready to swap into the party"],
                  ].map(([icon, title, desc]) => (
                    <div key={title} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 6, padding: "10px 12px", textAlign: "left" }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#202020" }}>{title}</div>
                        <div style={{ fontSize: 11, color: "#585858", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={createTrainer}
                  style={{ background: "#2850A0", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  + Create your first trainer
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: narrow ? 12 : 24 }}>
            <TabBar tab={tab} onPick={setTab} narrow={narrow}
              counts={{ party: sel.pokemon.length, box: (sel.pcBox ?? []).length }} />

            <SetupChecklist todos={todos} onJump={jumpTo} />

            {tab === "sheet" && (
              <div style={{ display: "grid", gap: narrow ? 12 : 16,
                gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
                {/* Identity */}
                <div style={{ gridColumn: "1/-1" }}>
                <Panel title="Trainer Identity" open={openSections.identity}
                  onToggle={() => toggleSection("identity")}
                  sectionRef={el => { sectionRefs.current.identity = el; }}
                  hint="Who this character is. Rank and age set how many attribute, social and skill points you get to spend."
                  badge={<span style={{ fontSize: 11, color: sel.name.trim() ? "#585858" : "#C02820", fontWeight: 600 }}>
                    {sel.name.trim() || "Unnamed"}
                  </span>}>
                  <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                    {[["Trainer Name", "name"], ["Player Name", "playerName"], ["Concept", "concept"]].map(([l, k]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
                        <input value={(sel as any)[k]} onChange={e => upd(sel.id, { [k]: e.target.value })}
                          style={{ width: "100%", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, padding: "6px 8px", color: "#202020", fontSize: 13, outline: "none" }} />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>Age</div>
                      <select value={sel.age} onChange={e => upd(sel.id, { age: e.target.value as TrainerAge })}
                        style={{ width: "100%", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, padding: "6px 8px", color: "#202020", fontSize: 13 }}>
                        {AGES.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>Rank</div>
                      <select value={sel.rank} onChange={e => upd(sel.id, { rank: e.target.value as Rank })}
                        style={{ width: "100%", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, padding: "6px 8px", color: RANK_COLORS[sel.rank], fontSize: 13 }}>
                        {RANKS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 3 }}>Nature</div>
                      <select value={sel.nature} onChange={e => upd(sel.id, { nature: e.target.value })}
                        style={{ width: "100%", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, padding: "6px 8px", color: "#202020", fontSize: 13 }}>
                        {NATURES.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Wraps rather than overflowing: eight badge buttons plus
                      three stat blocks is wider than a phone, and an unwrapped
                      row pushed the whole sheet sideways. */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Battle Sprite</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button onClick={() => upd(sel.id, { spriteId: "" })} title="No sprite"
                        style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0, border: `2px solid ${!sel.spriteId ? "#2850A0" : "#7888A8"}`, background: !sel.spriteId ? "rgba(40,80,160,0.12)" : "#F8F4D0", cursor: "pointer", fontSize: 16, color: "#7888A8" }}>—</button>
                      {TRAINER_SPRITES.map(s => (
                        <button key={s.id} onClick={() => upd(sel.id, { spriteId: s.id })} title={s.label}
                          style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0, border: `2px solid ${sel.spriteId === s.id ? "#2850A0" : "#7888A8"}`, background: sel.spriteId === s.id ? "rgba(40,80,160,0.12)" : "#F8F4D0", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/sprites/trainers/${s.id}.png`} alt={s.label} width={38} height={38} style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                        </button>
                      ))}
                      {sel.spriteId && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                          <span style={{ fontSize: 9, color: "#585858" }}>Back:</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/sprites/trainers/back/${sel.spriteId}.png`} alt="" height={40} style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: narrow ? 14 : 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#585858", marginBottom: 4 }}>Max HP = 4+VIT</div><div style={{ fontSize: 22, fontFamily: "'Exo 2'", fontWeight: 800, color: "#2850A0" }}>{4 + sel.attributes.vitality}</div></div>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#585858", marginBottom: 4 }}>Will = INS+3</div><div style={{ fontSize: 22, fontFamily: "'Exo 2'", fontWeight: 800, color: "#6890f0" }}>{sel.attributes.insight + 3}</div></div>
                    <div><div style={{ fontSize: 10, color: "#585858", marginBottom: 4 }}>Money ₽</div>
                      <input type="number" value={sel.money} onChange={e => upd(sel.id, { money: +e.target.value })}
                        style={{ width: 80, textAlign: "center", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#A07000", fontSize: 16, fontFamily: "'Exo 2'", fontWeight: 700, padding: "2px 6px" }} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: "#585858", marginBottom: 4 }}>Gym Badges</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {sel.gymBadges.map((b, i) => (
                          <button key={i} onClick={() => { const bg = [...sel.gymBadges]; bg[i] = !b; upd(sel.id, { gymBadges: bg }); }}
                            title={`Badge ${i + 1}${b ? " — earned" : ""}`}
                            style={{ width: 24, height: 24, borderRadius: 3, flexShrink: 0, border: `1px solid ${b ? "#A07000" : "#7888A8"}`, background: b ? "rgba(255,211,42,0.2)" : "transparent", color: b ? "#A07000" : "#585858", fontSize: 12, cursor: "pointer", opacity: b ? 1 : 0.45 }}>🏅</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>
                </div>

                {/* Attributes */}
                <Panel title="Attributes" open={openSections.attributes}
                  onToggle={() => toggleSection("attributes")}
                  sectionRef={el => { sectionRefs.current.attributes = el; }}
                  hint="Strength, Dexterity, Vitality and Insight drive combat and most rolls. Every attribute starts at 1; your age and rank grant the rest."
                  badge={<PointBudget used={usedAttrPoints} total={totalAttrPoints} label="pts" />}>
                  <div style={{ fontSize: 10, color: "#585858", marginBottom: 8 }}>
                    {sel.age} + {sel.rank}: +{ageInfo.attrPoints} + {rankInfo.attrPoints} = {totalAttrPoints} distributable points (base 1 per attribute)
                  </div>
                  {(["strength", "dexterity", "vitality", "insight"] as const).map(attr => (
                    <PipRow key={attr} hint={TRAINER_ATTR_HINTS[attr]} label={attr.charAt(0).toUpperCase() + attr.slice(1)} value={sel.attributes[attr]} max={TRAINER_ATTR_MAX}
                      onChange={v => {
                        const cost = v - sel.attributes[attr];
                        if (cost > 0 && attrBudgetLeft <= 0) return;
                        upd(sel.id, { attributes: { ...sel.attributes, [attr]: v } });
                      }} />
                  ))}
                  <div style={{ borderTop: "1px solid #2850A0", paddingTop: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase" }}>Social Attributes</div>
                      <PointBudget used={usedSocialPoints} total={totalSocialPoints} label="pts" />
                    </div>
                    {(["tough", "cool", "beauty", "cute", "clever"] as const).map(attr => (
                      <PipRow key={attr} hint={TRAINER_SOCIAL_HINTS[attr]} label={attr.charAt(0).toUpperCase() + attr.slice(1)} value={sel.socialAttributes[attr]} max={TRAINER_ATTR_MAX}
                        onChange={v => {
                          const cost = v - sel.socialAttributes[attr];
                          if (cost > 0 && socialBudgetLeft <= 0) return;
                          upd(sel.id, { socialAttributes: { ...sel.socialAttributes, [attr]: v } });
                        }} />
                    ))}
                  </div>
                </Panel>

                {/* Skills */}
                <Panel title="Skills" open={openSections.skills}
                  onToggle={() => toggleSection("skills")}
                  sectionRef={el => { sectionRefs.current.skills = el; }}
                  hint={`Rank ${sel.rank} gives ${rankInfo.skillPoints} skill points, and no single skill may go above ${rankInfo.skillLimit}.`}
                  badge={<PointBudget used={usedSkillPoints} total={rankInfo.skillPoints} label={`pts · max ${rankInfo.skillLimit}`} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {(Object.keys(sel.skills) as (keyof typeof sel.skills)[]).map(skill => (
                      <PipRow key={skill} hint={TRAINER_SKILL_HINTS[skill]} label={skill.charAt(0).toUpperCase() + skill.slice(1)+(skill==="capture"?" (🎯)":"")} value={sel.skills[skill]} max={rankInfo.skillLimit}
                        onChange={v => {
                          const cost = v - sel.skills[skill];
                          if (cost > 0 && usedSkillPoints >= rankInfo.skillPoints) return;
                          upd(sel.id, { skills: { ...sel.skills, [skill]: v } });
                        }} />
                    ))}
                  </div>
                  {/* Custom Skills */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Custom Skills</div>
                    {(sel.customSkills||[]).map((cs, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                        <input value={cs.name} onChange={e => { const arr=[...(sel.customSkills||[])];arr[i]={...arr[i],name:e.target.value};upd(sel.id,{customSkills:arr}); }}
                          placeholder="Skill name" style={{ flex: 1, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#202020", fontSize: 12, padding: "4px 8px" }} />
                        <input type="number" min={0} max={rankInfo.skillLimit} value={cs.points} onChange={e => { const arr=[...(sel.customSkills||[])];const budget=rankInfo.skillPoints-usedSkillPoints+cs.points;arr[i]={...arr[i],points:Math.min(rankInfo.skillLimit,Math.min(budget,Math.max(0,+e.target.value||0)))};upd(sel.id,{customSkills:arr}); }}
                          style={{ width: 40, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#2850A0", fontSize: 12, padding: "4px 6px", textAlign: "center" }} />
                        <button onClick={() => upd(sel.id,{customSkills:(sel.customSkills||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#585858",cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => upd(sel.id,{customSkills:[...(sel.customSkills||[]),{name:"",points:0}]})}
                      style={{ fontSize: 11, color: "#2850A0", background: "none", border: "1px dashed #2850A040", borderRadius: 4, padding: "4px 10px", cursor: "pointer", width: "100%" }}>+ Add Custom Skill</button>
                  </div>
                </Panel>

                {/* Inventory */}
                <Panel title="🎒 Inventory" open={openSections.inventory}
                  onToggle={() => toggleSection("inventory")}
                  sectionRef={el => { sectionRefs.current.inventory = el; }}
                  hint="Everything the trainer carries. Items can be used on a party Pokémon or handed over as a held item."
                  badge={<span style={{ fontSize: 11, color: "#585858" }}>
                    {(sel.inventory ?? []).length} item{(sel.inventory ?? []).length === 1 ? "" : "s"}
                  </span>}>
                  {/* Use Item Modal */}
                  {useItemIdx !== null && sel.inventory[useItemIdx] && (() => {
                    const invItem = sel.inventory[useItemIdx];
                    const itemData = ITEMS.find(x => x.name.toLowerCase() === invItem.name.toLowerCase());
                    const pocket = itemData?.pocket ?? "";
                    const category = itemData?.category ?? "";
                    const isMedicine = pocket === "Medicine";
                    const isHeldItem = pocket === "HeldItems";
                    const partyKeys = sel.pokemon ?? [];

                    const consumeOne = (afterFn?: () => void) => {
                      const arr = [...sel.inventory];
                      const ci = arr.findIndex(x => x.name.toLowerCase() === invItem.name.toLowerCase());
                      if (ci >= 0) {
                        const nq = arr[ci].quantity - 1;
                        if (nq <= 0) arr.splice(ci, 1); else arr[ci] = { ...arr[ci], quantity: nq };
                      }
                      upd(sel.id, { inventory: arr });
                      afterFn?.();
                      setUseItemIdx(null);
                    };

                    const giveHeld = (key: string, pSheet: PokemonSheetData) => {
                      const currentHeld = pSheet.heldItem || "";
                      let inv = [...sel.inventory];
                      if (currentHeld) {
                        const ri = inv.findIndex(x => x.name.toLowerCase() === currentHeld.toLowerCase());
                        if (ri >= 0) inv[ri] = { ...inv[ri], quantity: inv[ri].quantity + 1 };
                        else inv.push({ name: currentHeld, quantity: 1, description: "" });
                      }
                      const ci = inv.findIndex(x => x.name.toLowerCase() === invItem.name.toLowerCase());
                      if (ci >= 0) { const nq = inv[ci].quantity - 1; if (nq <= 0) inv.splice(ci, 1); else inv[ci] = { ...inv[ci], quantity: nq }; }
                      upd(sel.id, { inventory: inv });
                      setPokemonSheets(prev => ({ ...prev, [key]: { ...pSheet, heldItem: invItem.name } }));
                      setUseItemIdx(null);
                    };

                    return (
                      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => setUseItemIdx(null)}>
                        <div style={{ background: "#FBF8E4", border: "1px solid #7888A8", borderRadius: 10, width: 380, maxHeight: "80vh", overflow: "auto" }}
                          onClick={e => e.stopPropagation()}>
                          {/* Header */}
                          <div style={{ padding: "12px 16px", borderBottom: "1px solid #2850A0", display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#202020", fontFamily: "'Exo 2'" }}>{invItem.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                {pocket && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(104,144,240,0.15)", color: "#6890f0" }}>{pocket}</span>}
                                {category && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "#383838" }}>{category}</span>}
                                {itemData?.oneUse && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(240,128,48,0.15)", color: "#f08030" }}>One-use</span>}
                              </div>
                            </div>
                            <span style={{ fontSize: 13, color: "#A07000", fontFamily: "'Exo 2'", fontWeight: 700 }}>×{invItem.quantity}</span>
                            <button onClick={() => setUseItemIdx(null)} style={{ background: "none", border: "none", color: "#585858", cursor: "pointer", fontSize: 18 }}>✕</button>
                          </div>
                          {/* Description */}
                          {itemData?.description && (
                            <div style={{ padding: "10px 16px", fontSize: 12, color: "#383838", lineHeight: 1.6, borderBottom: "1px solid #2850A0", background: "#F8F4D0" }}>
                              {itemData.description}
                            </div>
                          )}
                          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                            {/* MEDICINE: use on a specific Pokémon */}
                            {isMedicine && (
                              <div>
                                <div style={{ fontSize: 9, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Use on Pokémon</div>
                                {partyKeys.length === 0
                                  ? <div style={{ fontSize: 11, color: "#585858", fontStyle: "italic" }}>No Pokémon in party.</div>
                                  : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      {partyKeys.map(key => {
                                        const pSheet = pokemonSheets[key];
                                        if (!pSheet) return null;
                                        const pEntry = POKEMON.find(p => p.number === pSheet.number);
                                        const pName = pSheet.nickname || pEntry?.name || "Pokémon";
                                        return (
                                          <button key={key} onClick={() => consumeOne()}
                                            style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(0,212,170,0.25)", background: "rgba(0,212,170,0.07)", color: "#202020", cursor: "pointer", fontSize: 12 }}>
                                            <span style={{ fontSize: 20 }}>💊</span>
                                            <div>
                                              <div style={{ fontWeight: 700 }}>{pName}</div>
                                              <div style={{ fontSize: 10, color: "#585858" }}>{pEntry?.name !== pSheet.nickname ? pEntry?.name : ""} · {pSheet.rank}</div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                }
                              </div>
                            )}

                            {/* TRAINER ITEMS: just consume */}
                            {!isMedicine && !isHeldItem && (
                              <button onClick={() => consumeOne()}
                                style={{ textAlign: "left", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(0,212,170,0.3)", background: "rgba(0,212,170,0.08)", color: "#2850A0", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                ✅ Use <span style={{ fontSize: 10, color: "#585858", fontWeight: 400 }}>— consume 1 from bag</span>
                              </button>
                            )}

                            {/* GIVE AS HELD ITEM — shown for all pockets */}
                            <div>
                              <div style={{ fontSize: 9, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
                                {isHeldItem ? "Give to Pokémon" : "Give as Held Item"}
                              </div>
                              {partyKeys.length === 0
                                ? <div style={{ fontSize: 11, color: "#585858", fontStyle: "italic" }}>No Pokémon in party.</div>
                                : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {partyKeys.map(key => {
                                      const pSheet = pokemonSheets[key];
                                      if (!pSheet) return null;
                                      const pEntry = POKEMON.find(p => p.number === pSheet.number);
                                      const pName = pSheet.nickname || pEntry?.name || "Pokémon";
                                      const currentHeld = pSheet.heldItem || "";
                                      return (
                                        <button key={key} onClick={() => giveHeld(key, pSheet)}
                                          style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,211,42,0.2)", background: "rgba(255,211,42,0.05)", color: "#202020", cursor: "pointer", fontSize: 12 }}>
                                          <span style={{ fontSize: 20 }}>💎</span>
                                          <div>
                                            <div style={{ fontWeight: 700 }}>{pName}</div>
                                            {currentHeld
                                              ? <div style={{ fontSize: 10, color: "#f08030" }}>replaces: {currentHeld}</div>
                                              : <div style={{ fontSize: 10, color: "#585858" }}>no held item</div>}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {(sel.inventory||[]).map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <input value={item.name} onChange={e => { const arr=[...(sel.inventory||[])];arr[i]={...arr[i],name:e.target.value};upd(sel.id,{inventory:arr}); }}
                        placeholder="Item name" style={{ flex: 2, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#202020", fontSize: 12, padding: "4px 8px" }} />
                      <input type="number" min={1} value={item.quantity} onChange={e => { const arr=[...(sel.inventory||[])];arr[i]={...arr[i],quantity:Math.max(1,+e.target.value||1)};upd(sel.id,{inventory:arr}); }}
                        style={{ width: 48, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#A07000", fontSize: 12, padding: "4px 6px", textAlign: "center" }} />
                      <button onClick={() => setUseItemIdx(i)}
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontWeight: 700, border: "1px solid #7888A8", background: "#F8F4D0", color: "#383838", whiteSpace: "nowrap" }}>
                        Use
                      </button>
                      <button onClick={() => upd(sel.id,{inventory:(sel.inventory||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:"#585858",cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => upd(sel.id,{inventory:[...(sel.inventory||[]),{name:"",quantity:1,description:""}]})}
                    style={{ fontSize: 11, color: "#A07000", background: "none", border: "1px dashed #A0700040", borderRadius: 4, padding: "4px 10px", cursor: "pointer", width: "100%" }}>+ Add Item</button>
                </Panel>

                {/* Equipment Slots */}
                {(() => {
                  const BATTLE_ITEMS = ["Key Stone", "Z-Power Ring", "Dynamax Band", "Tera Orb"];
                  const invNames = mergeInventory(sel.inventory || []).map(i => i.name);
                  const equippableItems = invNames.filter(n => {
                    const d = ITEMS.find(x => x.name === n);
                    return d && d.pocket === "TrainerItems" && d.category !== "BattleItem";
                  });
                  const battleItems = invNames.filter(n => BATTLE_ITEMS.includes(n));
                  return (
                    <Panel title="⚙️ Equipment" open={openSections.equipment}
                      onToggle={() => toggleSection("equipment")}
                      sectionRef={el => { sectionRefs.current.equipment = el; }}
                      hint="Gear the trainer keeps on them. Both lists are drawn from your inventory, so add the item there first."
                      badge={<span style={{ fontSize: 11, color: "#585858" }}>
                        {[sel.equippedItem, sel.battleItem].filter(Boolean).length}/2 slots
                      </span>}>
                      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 12 }}>
                        {/* Equipped Item */}
                        <div>
                          <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Equipped Item</div>
                          <div style={{ fontSize: 9, color: "#4A5468", marginBottom: 6 }}>Bike, fishing rod, etc. — always active</div>
                          <select value={sel.equippedItem || ""} onChange={e => upd(sel.id, { equippedItem: e.target.value })}
                            style={{ width: "100%", background: "#F8F4D0", border: "1px solid #7888A8", borderRadius: 4, color: sel.equippedItem ? "#202020" : "#585858", fontSize: 12, padding: "5px 8px" }}>
                            <option value="">— none —</option>
                            {equippableItems.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        {/* Battle Item */}
                        <div>
                          <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Battle Item</div>
                          <div style={{ fontSize: 9, color: "#4A5468", marginBottom: 6 }}>Key Stone / Z-Power Ring / Dynamax Band / Tera Orb — one use per battle</div>
                          <select value={sel.battleItem || ""} onChange={e => upd(sel.id, { battleItem: e.target.value })}
                            style={{ width: "100%", background: "#F8F4D0", border: `1px solid ${sel.battleItem ? "#A0700050" : "#7888A8"}`, borderRadius: 4, color: sel.battleItem ? "#A07000" : "#585858", fontSize: 12, padding: "5px 8px" }}>
                            <option value="">— none —</option>
                            {battleItems.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          {sel.battleItem && (
                            <div style={{ fontSize: 9, color: "#383838", marginTop: 4 }}>
                              {sel.battleItem === "Key Stone" && "⚡ Enables Mega Evolution"}
                              {sel.battleItem === "Z-Power Ring" && "⭐ Enables Z-Moves"}
                              {sel.battleItem === "Dynamax Band" && "💫 Enables Dynamax / Gigamax"}
                              {sel.battleItem === "Tera Orb" && "💎 Enables Terastallization"}
                            </div>
                          )}
                        </div>
                      </div>
                    </Panel>
                  );
                })()}

                {/* Achievements & Notes */}
                <div style={{ gridColumn: "1/-1" }}>
                <Panel title="🏆 Achievements & Notes" open={openSections.extras}
                  onToggle={() => toggleSection("extras")}
                  sectionRef={el => { sectionRefs.current.extras = el; }}
                  hint="Free-form record of what this trainer has done and anything else worth keeping with the sheet."
                  badge={<span style={{ fontSize: 11, color: "#585858" }}>
                    {sel.achievements.length} logged
                  </span>}>
                <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <div>
                    <h4 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 13, color: "#202020", marginBottom: 10 }}>Achievements</h4>
                    {sel.achievements.map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                        <input value={a} onChange={e => { const arr = [...sel.achievements]; arr[i] = e.target.value; upd(sel.id, { achievements: arr }); }}
                          style={{ flex: 1, background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#202020", fontSize: 12, padding: "4px 8px" }} />
                        <button onClick={() => upd(sel.id, { achievements: sel.achievements.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#585858", cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => upd(sel.id, { achievements: [...sel.achievements, ""] })}
                      style={{ fontSize: 11, color: "#2850A0", background: "none", border: "1px dashed #2850A040", borderRadius: 4, padding: "4px 10px", cursor: "pointer", width: "100%" }}>+ Add</button>
                  </div>
                  <div>
                    <h4 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 13, color: "#202020", marginBottom: 10 }}>Notes</h4>
                    <textarea value={sel.notes} onChange={e => upd(sel.id, { notes: e.target.value })}
                      style={{ width: "100%", background: "#F8F4D0", border: "1px solid #2850A0", borderRadius: 4, color: "#383838", fontSize: 12, padding: 8, resize: "none", height: 110, fontFamily: "inherit", lineHeight: 1.5, outline: "none" }} />
                  </div>
                </div>
                </Panel>
                </div>
              </div>
            )}

            {tab === "pcbox" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h2 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 18, color: "#6890f0", margin: 0 }}>📦 PC Box ({(sel.pcBox ?? []).length} Pokémon)</h2>
                  <div style={{ fontSize: 11, color: "#585858" }}>Pokémon stored here lose 1 happiness each time they are deposited.</div>
                </div>
                {(sel.pcBox ?? []).length === 0 && (
                  <div style={{ fontSize: 12, color: "#585858", fontStyle: "italic", padding: 20, textAlign: "center", border: "1px dashed #2850A0", borderRadius: 8 }}>
                    PC Box is empty. Move Pokémon here from the Party tab.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {(sel.pcBox ?? []).map(key => {
                    const sheet = pokemonSheets[key];
                    if (!sheet) return null;
                    const p = POKEMON.find(x => x.number === sheet.number);
                    if (!p) return null;
                    return (
                      <div key={key} style={{ background: "#FBF8E4", border: "1px solid #2850A0", borderRadius: 8, padding: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6890f0", flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#202020", flex: 1 }}>{sheet.nickname || p.name}</span>
                          <span style={{ fontSize: 10, color: RANK_COLORS[sheet.rank] }}>{sheet.rank}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, fontSize: 10, color: "#585858" }}>
                          <span>😊 {sheet.happiness}/5</span>
                          <span>💛 {sheet.loyalty}/5</span>
                          {sheet.heldItem && <span style={{ color: "#A07000" }}>🎒 {sheet.heldItem}</span>}
                        </div>
                        <button onClick={() => {
                          if (sel.pokemon.length >= 6) { alert("Party is full! Remove a Pokémon first."); return; }
                          upd(sel.id, {
                            pokemon: [...sel.pokemon, key],
                            pcBox: (sel.pcBox ?? []).filter(k => k !== key),
                          });
                        }} style={{ width: "100%", background: "#2850A020", border: "1px solid #2850A040", borderRadius: 4, color: "#2850A0", fontSize: 11, fontWeight: 700, padding: "5px 0", cursor: "pointer" }}>
                          → Move to Party
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "pokemon" && (() => { const partyFull = sel.pokemon.length >= 6; return (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h2 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 18, color: "#2850A0", margin: 0 }}>Pokémon Party ({sel.pokemon.length}/6)</h2>
                    <Link href="/gm-screen" style={{ display: "inline-block", background: "#2850A0", color: "#35785F", borderRadius: 4, padding: "6px 14px", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
                      ⚔️ Open Battle Tracker
                    </Link>
                  </div>
                  {sel.pokemon.length === 0 && <div style={{ fontSize: 12, color: "#585858", fontStyle: "italic", marginBottom: 16 }}>No Pokémon yet — add from the browser →</div>}
                  {sel.pokemon.map(key => {
                    const sheet = pokemonSheets[key];
                    if (!sheet) return null;
                    const partyHasPartner = sel.pokemon.some(k => k !== key && pokemonSheets[k]?.isPartner);
                    return (
                      <PokemonPartySheet key={key} sheet={sheet} trainerRank={sel.rank}
                        onChange={s => updatePokemonSheet(key, s)}
                        onRemove={() => removePokemon(key)}
                        onSendToBox={() => {
                          // Deposit to PC: -1 happiness, move key from party to pcBox
                          const updated = { ...sheet, happiness: Math.max(0, sheet.happiness - 1) };
                          setPokemonSheets(prev => ({ ...prev, [key]: updated }));
                          upd(sel.id, {
                            pokemon: sel.pokemon.filter(k => k !== key),
                            pcBox: [...(sel.pcBox ?? []), key],
                          });
                        }}
                        partyHasPartner={partyHasPartner}
                        onDesignatePartner={() => designatePartner(key)}
                        onRevokePartner={() => revokePartner(key)}
                        trainerInventory={sel.inventory ?? []}
                        onTransferItemToTrainer={itemName => {
                          // Return held item back to trainer's bag (add +1)
                          const inv = [...(sel.inventory ?? [])];
                          const idx = inv.findIndex(i => i.name.toLowerCase() === itemName.toLowerCase());
                          if (idx >= 0) inv[idx] = { ...inv[idx], quantity: inv[idx].quantity + 1 };
                          else inv.push({ name: itemName, quantity: 1, description: "" });
                          upd(sel.id, { inventory: inv });
                        }}
                        onTransferItemFromTrainer={itemName => {
                          // When giving held item: decrement qty by 1 from trainer bag
                          const inv = (sel.inventory ?? []).map(i =>
                            i.name.toLowerCase() === itemName.toLowerCase()
                              ? { ...i, quantity: Math.max(0, i.quantity - 1) }
                              : i
                          ).filter(i => i.quantity > 0);
                          upd(sel.id, { inventory: inv });
                        }}
                        trainerAttrs={sel.attributes}
                        trainerSkills={sel.skills} />
                    );
                  })}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#585858", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Add Pokémon ({sel.pokemon.length}/6 in party)</div>
                  <input type="text" placeholder="Search by name or #…" value={pSearch} onChange={e => setPSearch(e.target.value)}
                    style={{ width: "100%", background: "#FBF8E4", border: "1px solid #2850A0", borderRadius: 5, padding: "6px 10px", color: "#202020", fontSize: 12, marginBottom: 6, outline: "none" }} />
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {(["dex","name","rank"] as const).map(s => (
                      <button key={s} onClick={() => setPSort(s)}
                        style={{ flex: 1, fontSize: 10, fontWeight: 700, padding: "3px 0", borderRadius: 4, border: "none", cursor: "pointer", background: pSort === s ? "rgba(61,139,255,0.2)" : "transparent", color: pSort === s ? "#2850A0" : "#585858" }}>
                        {s === "dex" ? "# Dex" : s === "name" ? "A–Z" : "Rank"}
                      </button>
                    ))}
                  </div>
                  {partyFull && (
                    <div style={{ fontSize: 10, color: "#A07000", background: "#A0700014", border: "1px solid #A0700033", borderRadius: 4, padding: "5px 7px", marginBottom: 6, lineHeight: 1.5 }}>
                      Party is full (6). New catches go to the PC Box.
                    </div>
                  )}
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {/* Explicit buttons rather than a clickable row: where a
                        Pokémon goes is a real choice, and a row that silently
                        did one of them gave no clue it was even clickable. */}
                    {filtPokemon.map((p, i) => (
                      <div key={i}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#FBF8E4"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                        <span style={{ fontSize: 9, color: "#4A5468", width: 26, fontFamily: "'Exo 2'", fontWeight: 700 }}>#{String(p.number).padStart(3, "0")}</span>
                        <span style={{ fontSize: 12, color: "#202020", flex: 1, minWidth: 0 }}>{p.name}</span>
                        {p.types.map(t => <TypeBadge key={t} type={t} />)}
                        <span style={{ fontSize: 9, color: RANK_COLORS[p.suggestedRank], width: 52, textAlign: "right" }}>{p.suggestedRank}</span>
                        <button onClick={() => addPokemon(p.number, "party")} disabled={partyFull}
                          title={partyFull ? "Party is full — send it to the PC Box instead" : `Add ${p.name} to your party`}
                          style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                            cursor: partyFull ? "not-allowed" : "pointer", opacity: partyFull ? 0.4 : 1,
                            border: "1px solid #2850A040", background: "#2850A020", color: "#2850A0" }}>
                          + Party
                        </button>
                        <button onClick={() => addPokemon(p.number, "box")}
                          title={`Send ${p.name} to the PC Box`}
                          style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                            cursor: "pointer", border: "1px solid #6890f040", background: "#6890f018", color: "#4A6ABF" }}>
                          + Box
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ); })()}
          </div>
        )}
      </div>
    </PokedexFrame>
  );
}

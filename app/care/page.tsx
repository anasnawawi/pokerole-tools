"use client";
/* TamaPoke — the real-time care screen. See app/lib/care.ts for the decay
   engine this page is a thin UI over, app/lib/training.ts for the shared
   Training dice mechanic, and the "TamaPoke Roadmap" artifact for the full
   design writeup (prior art, formulas, what got cut for v1).

   Scope trimmed from that roadmap for this first pass: every party
   Pokémon gets care-tracked here (not poketama's 3-active/rest-frozen
   split) — simpler to ship, and nothing about the data shape stops that
   cap from being added later without a migration.

   Layout: the display is the scene and nothing else — one party Pokémon at
   a time, full-bleed. The care controls are handed to PokedexFrame's
   `footer` slot instead of living inside that display, so they read as
   physical buttons on the shell below the screen. The footer and the scene
   both switch between four modes together: normal care (Feed/Groom/Walk/
   Train + wandering sprite), Training in progress (a timer + a training
   animation), a Walk encounter (FIGHT/DEFEND/EVADE/RUN + a simplified
   battle scene), and Inconsolable (locked out entirely).

   Every action here is tied to something real, per spec: Feed consumes an
   actual food item from the trainer's Bag, Groom needs a Grooming Kit and
   is cooldown-limited (the kit itself isn't consumed), Walk can trigger a
   wild encounter using the same rank-vs-rank logic the Encounter page
   uses, and Training reuses the Characters page's own dice-pool mechanic
   (see lib/training.ts) rather than inventing a second set of numbers. */
import { useEffect, useRef, useState } from "react";
import { POKEMON, TYPE_COLORS, PokemonType, PokemonEntry } from "../data/pokerole-data";
import { RANK_ORDER } from "../data/game-rules";
import {
  PokemonSheetData, TrainerData, SHEETS_KEY, TRAINERS_KEY,
  loadTrainers, loadPokemonSheets, getActiveTrainer,
} from "../lib/trainer";
import { saveToStorage } from "../lib/storage";
import { notifySession } from "../lib/session";
import { GenderIcon } from "../components/GenderIcon";
import PokedexFrame, { C } from "../components/PokedexFrame";
import * as Care from "../lib/care";
import {
  TrainAttr, TRAINING_ROLLS, trainingPool, attributeCap, trainingDurationMs,
  trainingCareCost, rollD6, countSuccesses, applyHappinessGain,
} from "../lib/training";

const pixel = "'Press Start 2P',monospace";

/* React's purity lint flags Math.random()/Date.now() called directly inside
   a component/handler closure, even a click-only one, since it can't prove
   the call never runs during render. The established fix elsewhere in this
   file (and battle-tracker's randomNature()) is the same: wrap the impure
   call in a plain top-level function, so the flagged call site itself sits
   outside any component body. */
function rand(): number { return Math.random(); }
function nowMs(): number { return Date.now(); }

/* Re-ticks every open Care page on an interval, not just once on mount, so
   a Pokémon left on-screen and ignored actually decays in real time (see
   care.ts's LIVE_TICK_MAX_MS) instead of only catching up the next time
   someone opens this page. Two minutes is frequent enough that the bars
   visibly move during a session without hammering localStorage. */
const LIVE_RETICK_MS = 2 * 60 * 1000;

/** One mood glyph, cheaply derived from the gauges — always visible in the
 *  scene's corner, distinct from the transient speech bubble below. Night
 *  reads as "asleep" rather than "sad" even if a gauge is low, since a
 *  sleeping Pokémon isn't actively unhappy about it. */
function moodFor(care: Care.CareState): string {
  if (care.inconsolable) return "💔";
  if (Care.isNightTime()) return "😴";
  const { hunger, cleanliness, affection } = care.gauges;
  if (Math.min(hunger, cleanliness, affection) <= Care.CRITICAL_THRESHOLD) return "😟";
  if ((hunger + cleanliness + affection) / 3 < 60) return "😐";
  return "😊";
}

/** Which need to nag about, worst first — null once nothing's critical. */
function nagMessage(care: Care.CareState): string | null {
  const { hunger, cleanliness, affection } = care.gauges;
  const worst = Math.min(hunger, cleanliness, affection);
  if (worst > Care.CRITICAL_THRESHOLD) return null;
  if (hunger === worst) return "🍽️ Hungry...";
  if (cleanliness === worst) return "🛁 Feeling grubby...";
  return "💭 Miss you...";
}

/** Movement personality, one per nature archetype — grouped from the real
 *  keyword flavor text in data/natures-data.ts rather than invented from
 *  scratch. `energy` scales speed/frequency/bob size (higher = faster
 *  walks, shorter pauses, bigger bounce); `radius` is how far from center
 *  it's willing to wander (a Timid nature sticks close; a Hasty one covers
 *  the whole room); `hop` swaps the glide-between-spots easing for a
 *  bouncier overshoot, for the archetypes whose keywords read as literally
 *  bouncing around rather than moving with purpose. */
type Archetype = { energy: number; radius: number; hop: boolean };
const ARCHETYPES: Record<string, Archetype> = {
  energetic: { energy: 1.5, radius: 34, hop: true },   // Hasty, Impish, Jolly, Naive, Rash, Sassy
  bold:      { energy: 1.15, radius: 30, hop: false }, // Adamant, Bold, Brave, Naughty
  steady:    { energy: 1, radius: 24, hop: false },    // Hardy, Modest, Serious
  calm:      { energy: 0.75, radius: 22, hop: false }, // Calm, Docile, Gentle, Mild
  lazy:      { energy: 0.55, radius: 14, hop: false }, // Lax, Relaxed
  shy:       { energy: 0.8, radius: 12, hop: false },  // Bashful, Careful, Lonely, Quiet, Timid
  erratic:   { energy: 1.25, radius: 34, hop: true },  // Quirky
};
const NATURE_ARCHETYPE: Record<string, keyof typeof ARCHETYPES> = {
  Hasty: "energetic", Impish: "energetic", Jolly: "energetic", Naive: "energetic", Rash: "energetic", Sassy: "energetic",
  Adamant: "bold", Bold: "bold", Brave: "bold", Naughty: "bold",
  Hardy: "steady", Modest: "steady", Serious: "steady",
  Calm: "calm", Docile: "calm", Gentle: "calm", Mild: "calm",
  Lax: "lazy", Relaxed: "lazy",
  Bashful: "shy", Careful: "shy", Lonely: "shy", Quiet: "shy", Timid: "shy",
  Quirky: "erratic",
};

/** Blends a Pokémon's nature (its baseline temperament) with its current
 *  Happiness (0–5, how that temperament is showing up *today*) into the
 *  concrete numbers Scene animates with. Happiness swings energy roughly
 *  ±40% around the nature's baseline — a Jolly nature at 0 happiness still
 *  reads as livelier than a Relaxed one at full happiness, but visibly
 *  subdued next to its own best day. */
function movementFor(nature: string, happiness: number) {
  const archetype = ARCHETYPES[NATURE_ARCHETYPE[nature] ?? "steady"] ?? ARCHETYPES.steady;
  const happinessMul = 0.6 + (happiness / 5) * 0.8; // 0 → 0.6x, 5 → 1.4x
  const energy = archetype.energy * happinessMul;
  return {
    radius: archetype.radius,
    hop: archetype.hop,
    walkMs: Math.round(2400 / energy),
    pauseMs: Math.round(2600 / energy),
    bobDuration: (2.6 / energy).toFixed(2) + "s",
    bobAmp: Math.round(4 * energy) + "px",
  };
}

const SCENE_BG = "linear-gradient(180deg,#BEE4F0 0%,#BEE4F0 62%,#A8D488 62%,#8FC46E 100%)";

/** The animated room, filling the whole display — a static sprite would sit
 *  there forever, so this is the whole point of the ask: something that
 *  visibly wanders its box, reacts to being cared for, and reads as
 *  neglected before the numbers ever have to be read. Kept to CSS
 *  transitions/keyframes (see globals.css's "care-*" block) rather than a
 *  canvas loop — there's only one real sprite frame per species (a static
 *  64×64 PNG, no walk-cycle sheet) so the "animation" is staging that one
 *  frame, not flipping between frames.
 *
 *  `bubbleText` is an imperative escape hatch: the footer's buttons live
 *  outside this component (see the page-level layout), so a ref-exposed
 *  trigger is how they make the scene react.
 *
 *  `nature` and `happiness` drive movementFor above — this is where a
 *  Jolly Pokémon at full happiness reads as a completely different animal
 *  on screen than a Timid one running low, without either of them having
 *  more than one real sprite frame to work with. */
function Scene({ number, nature, happiness, care, onBubble }: {
  number: number; nature: string; happiness: number; care: Care.CareState;
  onBubble: (fn: (text: string, ms?: number) => void) => void;
}) {
  const move = movementFor(nature, happiness);
  const [pos, setPos] = useState(() => 50 + (Math.random() - 0.5) * move.radius);
  const posRef = useRef(pos);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [walking, setWalking] = useState(false);
  const [walkMs, setWalkMs] = useState(move.walkMs);
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nagRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBubble = (text: string, ms = 1900) => {
    if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    setBubble({ text, id: Date.now() });
    bubbleTimeoutRef.current = setTimeout(() => setBubble(null), ms);
  };

  // Hand the footer's buttons a way to pop a reaction bubble on this scene.
  useEffect(() => { onBubble(showBubble); });

  // Wander loop: pick a new spot, glide there, pause and idle-bob, repeat.
  // Random per-mount delay/duration so a party of these doesn't march in
  // lockstep. Frozen entirely once inconsolable — see the early return.
  // move.* (nature × happiness) sets the pace and how far it roams;
  // re-runs when either changes so a happiness swing is felt immediately
  // instead of waiting for the current lap to finish.
  useEffect(() => {
    // No setWalking(false) call needed here: the sprite's style ignores
    // `walking` entirely once inconsolable (see the render below), so
    // just not starting the loop is enough.
    if (care.inconsolable) return;
    let cancelled = false;
    const min = Math.max(12, 50 - move.radius);
    const max = Math.min(85, 50 + move.radius);
    const jitter = () => 0.7 + Math.random() * 0.6; // ±30% so a fixed pace doesn't feel metronomic
    const step = () => {
      const next = min + Math.random() * (max - min);
      setFacing(next < posRef.current ? -1 : 1);
      posRef.current = next;
      setWalkMs(Math.round(move.walkMs * jitter()));
      setWalking(true);
      setPos(next);
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setWalking(false);
        timerRef.current = setTimeout(() => { if (!cancelled) step(); }, Math.round(move.pauseMs * jitter()));
      }, Math.round(move.walkMs * jitter()));
    };
    timerRef.current = setTimeout(() => { if (!cancelled) step(); }, Math.random() * 3000);
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
  }, [care.inconsolable, move.radius, move.walkMs, move.pauseMs]);

  // Periodic nag bubble while genuinely neglected (not while inconsolable —
  // the lockout footer already says everything there).
  useEffect(() => {
    if (care.inconsolable) return;
    nagRef.current = setInterval(() => {
      const msg = nagMessage(care);
      if (msg) showBubble(msg, 2400);
    }, 7000);
    return () => { if (nagRef.current) clearInterval(nagRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [care.gauges.hunger, care.gauges.cleanliness, care.gauges.affection, care.inconsolable]);

  useEffect(() => () => { if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current); }, []);

  const mood = moodFor(care);
  const sleepy = !care.inconsolable && Care.isNightTime();

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, background: SCENE_BG }}>
      <span className="care-mood" style={{ position: "absolute", top: 10, right: 12, fontSize: "clamp(18px,4cqh,28px)",
        animation: mood === "😟" ? "careMoodPulse 1s ease-in-out infinite" : undefined, zIndex: 2 }}>
        {mood}
      </span>
      {bubble && (
        <div key={bubble.id} className="care-bubble" style={{
          position: "absolute", left: `${pos}%`, bottom: "62%", transform: "translateX(-50%)",
          background: "#F8F8E8", border: "2px solid #181818", borderRadius: 8, padding: "5px 10px",
          fontSize: 12, whiteSpace: "nowrap", boxShadow: "2px 2px 0 rgba(0,0,0,0.25)",
          animation: "careBubblePop 1.9s ease-out forwards", zIndex: 3 }}>
          {bubble.text}
        </div>
      )}
      <div style={{
        position: "absolute", bottom: "16%", left: `${pos}%`, width: "clamp(56px,16cqh,120px)", height: "clamp(56px,16cqh,120px)",
        transform: "translateX(-50%)",
        transition: walking ? `left ${walkMs}ms ${move.hop ? "cubic-bezier(.34,1.56,.64,1)" : "ease-in-out"}` : undefined,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
        <img
          className="care-sprite"
          src={`/sprites/pokemon/${number}.png`} alt=""
          width={120} height={120}
          style={{
            imageRendering: "pixelated", width: "100%", height: "100%", objectFit: "contain",
            filter: care.inconsolable ? "grayscale(0.85) brightness(0.8)" : "drop-shadow(2px 5px 3px rgba(0,0,0,0.25))",
            transform: `scaleX(${facing})`,
            "--bob-amp": move.bobAmp,
            animation: care.inconsolable ? undefined
              : walking ? undefined
              : sleepy ? `careSleepyBob ${move.bobDuration} ease-in-out infinite` : `careBob ${move.bobDuration} ease-in-out infinite`,
          } as React.CSSProperties}
          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
        />
      </div>
      {care.inconsolable && (
        <div style={{ position: "absolute", left: `${pos}%`, bottom: "58%", transform: "translateX(-50%)", fontSize: 16 }}>💔</div>
      )}
    </div>
  );
}

/** Per-stat flavor for the Training overlay — the "visual assets... with
 *  animations to show the pokémon in training" the spec asks for. There's
 *  no real training-montage art to draw on (same one-sprite-frame
 *  constraint as Scene above), so each stat gets an icon that bounces
 *  beside the sprite instead — a barbell hopping for Strength reads as
 *  "working out" well enough without needing bespoke frames. */
const TRAIN_ICON: Record<TrainAttr, string> = {
  strength: "🏋️", dexterity: "⚡", vitality: "🛡️", special: "✨", insight: "🧠",
};

function TrainingScene({ number, attr, progress, msLeft }: {
  number: number; attr: TrainAttr; progress: number; msLeft: number;
}) {
  const minsLeft = Math.max(0, Math.ceil(msLeft / 60000));
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, background: SCENE_BG }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
        <img className="care-sprite" src={`/sprites/pokemon/${number}.png`} alt="" width={110} height={110}
          style={{ imageRendering: "pixelated", width: "clamp(56px,16cqh,110px)", height: "auto", objectFit: "contain",
            animation: "careBob 1.6s ease-in-out infinite", "--bob-amp": "3px" } as React.CSSProperties} />
        <span className="care-trainicon" style={{ fontSize: "clamp(28px,8cqh,52px)", animation: "careTrainBounce 0.9s ease-in-out infinite" }}>
          {TRAIN_ICON[attr]}
        </span>
      </div>
      <div style={{ position: "absolute", left: "8%", right: "8%", bottom: "10%" }}>
        <div style={{ fontFamily: pixel, fontSize: 10, color: "#181818", textShadow: "1px 1px 0 rgba(255,255,255,0.6)", marginBottom: 6, textAlign: "center" }}>
          Training {TRAINING_ROLLS[attr].label}… {minsLeft}m left
        </div>
        <div style={{ height: 10, borderRadius: 5, background: "rgba(0,0,0,0.18)", border: "2px solid #181818", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "#5BD07A", transition: "width 1s linear" }} />
        </div>
      </div>
    </div>
  );
}

function HpBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = pct <= 25 ? "#F2544F" : pct < 50 ? "#F5D33F" : "#5BD07A";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.2)", overflow: "hidden", flexShrink: 0 }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: color, transition: "width 0.3s" }} />
      </span>
      <span style={{ fontSize: 8, color: "#383838", fontWeight: 700 }}>{Math.max(0, Math.round(value))}/{Math.round(max)}</span>
    </div>
  );
}

type EncounterPhase = "active" | "won" | "lost" | "ran";
type Popup = { id: number; text: string; side: "player" | "wild" | "center"; kind: "dmg" | "info" | "msg" };
interface EncounterState {
  wild: PokemonEntry;
  wildHp: number; wildMaxHp: number;
  playerHp: number; playerMaxHp: number;
  phase: EncounterPhase;
  log: string;
  popups: Popup[];
  /** The wild's pre-decided move for the round about to happen — telegraphed
   *  to the player (see EncounterScene's intent tag) before they act. */
  wildIntent: Intent;
}

/** Just the Pokémon left and right — no trainer sprite, per spec, once a
 *  Walk encounter is really just a fight between two Pokémon. HP bars, a
 *  narrated "what just happened" popup for every action (not just the
 *  floating hit numbers), and hit-shake feedback — "basically a simplified
 *  and slightly animated battle," per spec, not a second Battle Tracker. */
function EncounterScene({ playerNumber, enc, hitSide, onDismiss }: {
  playerNumber: number; enc: EncounterState;
  hitSide: "player" | "wild" | null; onDismiss: () => void;
}) {
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, background: SCENE_BG }}>
      <div style={{ position: "absolute", top: 10, left: 12, background: "rgba(255,255,255,0.88)", border: `2px solid ${C.outline}`, borderRadius: 6, padding: "4px 8px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>Your Pokémon</div>
        <HpBar value={enc.playerHp} max={enc.playerMaxHp} />
      </div>
      <div style={{ position: "absolute", top: 10, right: 12, background: "rgba(255,255,255,0.88)", border: `2px solid ${C.outline}`, borderRadius: 6, padding: "4px 8px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>Wild {enc.wild.name}</div>
        <HpBar value={enc.wildHp} max={enc.wildMaxHp} />
      </div>
      {/* The telegraph — what the wild is about to do, so Fight/Defend/
          Evade/Run is a real read-and-react choice instead of a guess. */}
      {enc.phase === "active" && (
        <div style={{ position: "absolute", top: 44, right: 12, display: "flex", alignItems: "center", gap: 4,
          background: "rgba(24,24,24,0.78)", borderRadius: 5, padding: "3px 7px" }}>
          <span style={{ fontSize: 11 }}>{INTENT_LABEL[enc.wildIntent].icon}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: "#F8F8E8" }}>{INTENT_LABEL[enc.wildIntent].text}</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
      <img src={`/sprites/pokemon/${playerNumber}.png`} alt="" width={92} height={92}
        className={hitSide === "player" ? "care-hit" : undefined}
        style={{ position: "absolute", left: "20%", bottom: "16%", width: "clamp(52px,15cqh,96px)", height: "auto",
          imageRendering: "pixelated", animation: hitSide === "player" ? "careHitShake 0.4s ease-in-out" : undefined }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
      <img src={`/sprites/pokemon/${enc.wild.number}.png`} alt="" width={100} height={100}
        className={hitSide === "wild" ? "care-hit" : undefined}
        style={{ position: "absolute", right: "12%", bottom: "16%", width: "clamp(58px,17cqh,106px)", height: "auto",
          imageRendering: "pixelated", transform: "scaleX(-1)", animation: hitSide === "wild" ? "careHitShake 0.4s ease-in-out" : undefined }} />
      {enc.popups.filter(p => p.kind !== "msg").map(p => (
        <div key={p.id} className="care-dmgpop" style={{
          position: "absolute", left: p.side === "player" ? "30%" : "72%", bottom: "42%",
          fontFamily: pixel, fontSize: p.kind === "dmg" ? 13 : 9, fontWeight: 700,
          color: p.kind === "dmg" ? "#D82808" : "#181818", textShadow: "1px 1px 0 #fff",
          animation: "careDamagePop 1.1s ease-out forwards", zIndex: 4 }}>
          {p.text}
        </div>
      ))}
      {/* The narrated line — what the floating numbers alone don't say
          ("used Fight", "dodged", "couldn't get away"). One at a time, top
          of the scene, out of the way of the sprites/hit numbers below. */}
      {enc.popups.filter(p => p.kind === "msg").map(p => (
        <div key={p.id} className="care-bubble" style={{
          position: "absolute", top: 54, left: "50%", transform: "translateX(-50%)",
          background: "#F8F8E8", border: `2px solid ${C.outline}`, borderRadius: 8, padding: "5px 12px",
          fontSize: 11, fontWeight: 600, color: "#181818", whiteSpace: "nowrap", maxWidth: "88%",
          overflow: "hidden", textOverflow: "ellipsis", boxShadow: "2px 2px 0 rgba(0,0,0,0.25)",
          animation: "careBubblePop 2.3s ease-out forwards", zIndex: 5 }}>
          {p.text}
        </div>
      ))}
      {enc.phase !== "active" && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#F8F8E8", border: `3px solid ${C.outline}`, borderRadius: 10, padding: "16px 20px", textAlign: "center", maxWidth: 280 }}>
            <div style={{ fontFamily: pixel, fontSize: 13, marginBottom: 8 }}>
              {enc.phase === "won" ? "🏆 Victory!" : enc.phase === "lost" ? "😵 Retreated, hurt..." : "💨 Got away safely!"}
            </div>
            <div style={{ fontSize: 11, color: "#585858", lineHeight: 1.6, marginBottom: 12 }}>{enc.log}</div>
            <button onClick={onDismiss} style={{ fontSize: 11, fontWeight: 700, padding: "6px 18px", borderRadius: 6,
              border: `2px solid ${C.outline}`, background: C.cyan, cursor: "pointer" }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

const careButtonStyle: React.CSSProperties = {
  flex: 1, fontSize: 11, fontWeight: 700, padding: "9px 4px", borderRadius: 7,
  border: `2px solid ${C.outline}`, background: C.bezel, color: C.navy, cursor: "pointer",
  boxShadow: "0 2px 0 rgba(0,0,0,0.3)",
};
const careButtonDisabledStyle: React.CSSProperties = { ...careButtonStyle, opacity: 0.5, cursor: "not-allowed", boxShadow: "none" };

function FooterGauge({ label, value }: { label: string; value: number }) {
  const critical = value <= Care.CRITICAL_THRESHOLD;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
      <span style={{ fontFamily: pixel, fontSize: 7, color: C.cream, flexShrink: 0, width: 34 }}>{label}</span>
      <span style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(0,0,0,0.28)", overflow: "hidden", border: `1px solid ${C.outline}` }}>
        <span style={{ display: "block", height: "100%", width: `${value}%`,
          background: critical ? "#F2544F" : value < 50 ? "#F5D33F" : "#5BD07A", transition: "width 0.3s" }} />
      </span>
    </div>
  );
}

/** Wild opponent for a Walk encounter — "average or lower rank" per spec,
 *  read as "no higher-ranked than this Pokémon's own rank," the same
 *  suggestedRank-vs-RANK_ORDER comparison the standalone Encounter page
 *  uses, not a fork of that logic. */
function pickWildOpponent(sheet: PokemonSheetData): PokemonEntry | null {
  const maxIdx = RANK_ORDER.indexOf(sheet.rank);
  const pool = POKEMON.filter(p => RANK_ORDER.indexOf(p.suggestedRank) <= maxIdx && p.number !== sheet.number);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
function playerMaxHp(sheet: PokemonSheetData, species: PokemonEntry): number {
  return species.baseHp + sheet.attributes.vitality + sheet.trainingAttributes.vitality;
}
function playerPower(sheet: PokemonSheetData): number {
  return sheet.attributes.strength + sheet.trainingAttributes.strength + sheet.attributes.special + sheet.trainingAttributes.special;
}
function playerSpeed(sheet: PokemonSheetData): number {
  return sheet.attributes.dexterity + sheet.trainingAttributes.dexterity;
}
function wildMaxHp(species: PokemonEntry): number { return species.baseHp + species.attributes.vitality; }
function wildPower(species: PokemonEntry): number { return species.attributes.strength + species.attributes.special; }
function wildSpeed(species: PokemonEntry): number { return species.attributes.dexterity; }
function rollDamage(power: number): number { return Math.max(1, Math.round(2 + power / 3 + Math.random() * 3)); }
const ENCOUNTER_CHANCE = 0.4;

/** The wild side's action for the round ahead — chosen and shown to the
 *  player BEFORE they pick their own move (see the intent tag in
 *  EncounterScene), so Defend/Evade become a real read-and-react choice
 *  instead of a flat damage-reduction tax paid every round regardless of
 *  what's actually coming. Skews toward Defend/Evade once the wild is
 *  hurting — a cornered Pokémon gets cagier, not just weaker. */
type Intent = "attack" | "defend" | "evade";
function pickWildIntent(wildHpFraction: number): Intent {
  const cautious = wildHpFraction < 0.35;
  const r = Math.random();
  if (cautious) return r < 0.30 ? "attack" : r < 0.65 ? "defend" : "evade";
  return r < 0.55 ? "attack" : r < 0.78 ? "defend" : "evade";
}
const INTENT_LABEL: Record<Intent, { text: string; icon: string }> = {
  attack: { text: "About to Attack!", icon: "⚔️" },
  defend: { text: "About to Defend", icon: "🛡️" },
  evade:  { text: "About to Evade",  icon: "💨" },
};

export default function CarePage() {
  const [trainer, setTrainer] = useState<TrainerData | null>(null);
  const [sheets, setSheets] = useState<Record<string, PokemonSheetData>>({});
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [encounter, setEncounter] = useState<EncounterState | null>(null);
  const [hitSide, setHitSide] = useState<"player" | "wild" | null>(null);
  const [encBusy, setEncBusy] = useState(false);
  const [showTrainPicker, setShowTrainPicker] = useState(false);
  const [trainResult, setTrainResult] = useState<{ attr: TrainAttr; rolls: number[]; successes: number; gained: number } | null>(null);
  const [nowTick, setNowTick] = useState(() => nowMs());
  const bubbleFnRef = useRef<((text: string, ms?: number) => void) | null>(null);

  // Bring every party Pokémon's care state up to date the moment this page
  // opens — this is the "welcome back" catch-up, applied silently rather
  // than as its own interstitial screen for v1 (see the roadmap doc). This
  // genuinely has to be an effect rather than a useSyncExternalStore read
  // (see lib/session.ts for that pattern elsewhere in the app): the catch-up
  // both reads AND writes storage as a side effect, not just a snapshot.
  // The whole body is deferred a tick (setTimeout 0) past the initial
  // commit: notifySession() synchronously pokes PartyBar's external-store
  // subscription, and firing that during CarePage's own mount commit is
  // exactly the "setState while rendering a different component" collision
  // React's dev warning flags — pushing it to a fresh macrotask sidesteps
  // that without changing what actually happens.
  useEffect(() => {
    const id = setTimeout(() => {
      const trainers = loadTrainers();
      const active = getActiveTrainer(trainers);
      const loadedSheets = loadPokemonSheets();
      if (active) {
        let changed = false;
        const next = { ...loadedSheets };
        for (const key of active.pokemon) {
          const sheet = next[key];
          if (!sheet) continue;
          const wasInconsolable = sheet.care?.inconsolable ?? false;
          const ticked = Care.tick(sheet.care ?? Care.blankCare());
          next[key] = wasInconsolable
            ? { ...sheet, care: ticked }
            : ticked.inconsolable
              ? { ...sheet, care: ticked, happiness: 0, loyalty: 0 }
              : { ...sheet, care: ticked };
          changed = true;
        }
        if (changed) { saveToStorage(SHEETS_KEY, next); setTimeout(notifySession, 0); }
        setSheets(next);
      } else {
        setSheets(loadedSheets);
      }
      setTrainer(active);
      setMounted(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // Keep ticking while the page stays open — see LIVE_RETICK_MS above.
  useEffect(() => {
    if (!trainer) return;
    const id = setInterval(() => {
      setSheets(prev => {
        let changed = false;
        const next = { ...prev };
        for (const key of trainer.pokemon) {
          const sheet = next[key];
          if (!sheet || !sheet.care) continue;
          const wasInconsolable = sheet.care.inconsolable;
          const ticked = Care.tick(sheet.care);
          if (ticked === sheet.care) continue;
          changed = true;
          next[key] = (!wasInconsolable && ticked.inconsolable)
            ? { ...sheet, care: ticked, happiness: 0, loyalty: 0 }
            : { ...sheet, care: ticked };
        }
        if (changed) { saveToStorage(SHEETS_KEY, next); setTimeout(notifySession, 0); }
        return changed ? next : prev;
      });
    }, LIVE_RETICK_MS);
    return () => clearInterval(id);
  }, [trainer]);

  const updateSheet = (key: string, updated: PokemonSheetData) => {
    setSheets(prev => {
      const next = { ...prev, [key]: updated };
      saveToStorage(SHEETS_KEY, next);
      return next;
    });
    notifySession();
  };

  const updateTrainer = (updated: TrainerData) => {
    setTrainer(updated);
    const all = loadTrainers();
    const idx = all.findIndex(t => t.id === updated.id);
    if (idx >= 0) { const next = [...all]; next[idx] = updated; saveToStorage(TRAINERS_KEY, next); }
    notifySession();
  };

  const party = (trainer?.pokemon ?? []).map(key => ({ key, sheet: sheets[key] })).filter(p => !!p.sheet);
  const safeIndex = party.length ? Math.min(current, party.length - 1) : 0;
  const active = party[safeIndex];
  const species = active ? POKEMON.find(p => p.number === active.sheet.number) : undefined;
  const care = active ? (active.sheet.care ?? Care.blankCare()) : null;
  const name = active ? (active.sheet.nickname.trim() || species?.name || `#${active.sheet.number}`) : "";
  const training = care?.training;

  // ── Training: precisely-timed resolution + a live countdown ────────────
  useEffect(() => {
    if (!active || !training) return;
    const key = active.key;
    const dueIn = training.startedAt + training.durationMs - nowMs();
    const resolve = () => {
      setSheets(prev => {
        const sheet = prev[key];
        const t = sheet?.care?.training;
        if (!t) return prev;
        const attr = t.attr as TrainAttr;
        const rolls = rollD6(t.pool);
        const successes = countSuccesses(rolls);
        const cap = attributeCap(sheet, attr);
        const currentPts = sheet.trainingAttributes[attr] ?? 0;
        const newPts = Math.min(currentPts + successes, cap);
        const gained = newPts - currentPts;
        const happyUpdate = gained > 0 ? applyHappinessGain(sheet, 1, "training") : {};
        const updated: PokemonSheetData = {
          ...sheet, ...happyUpdate,
          trainingAttributes: { ...sheet.trainingAttributes, [attr]: newPts },
          care: { ...sheet.care!, training: undefined },
        };
        const next = { ...prev, [key]: updated };
        saveToStorage(SHEETS_KEY, next);
        setTimeout(notifySession, 0);
        setTrainResult({ attr, rolls, successes, gained });
        return next;
      });
    };
    if (dueIn <= 0) { resolve(); return; }
    const id = setTimeout(resolve, dueIn + 50);
    return () => clearTimeout(id);
    // Deliberately keyed on the session's own primitives, not the `active`/
    // `training` objects themselves — those are fresh references every
    // render (derived from `sheets`), which would re-schedule this timer
    // on every tick instead of once per actual session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, training?.startedAt, training?.durationMs, training?.pool]);

  // Live-ish countdown text while a Training session is running.
  useEffect(() => {
    if (!training) return;
    const id = setInterval(() => setNowTick(nowMs()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training?.startedAt]);

  // ── Feed / Groom: gated on the trainer's actual Bag ─────────────────────
  const availableFood = (trainer?.inventory ?? []).filter(i => i.quantity > 0 && Care.FOOD_ITEMS[i.name] !== undefined);
  const hasGroomKit = (trainer?.inventory ?? []).some(i => i.quantity > 0 && i.name === Care.GROOM_ITEM);
  const groomReady = care ? Care.canGroom(care, nowTick) : false;

  const doFeed = () => {
    if (!active || !care || !trainer) return;
    if (availableFood.length === 0) { bubbleFnRef.current?.("🎒 No food in the Bag!"); return; }
    const item = [...availableFood].sort((a, b) => Care.FOOD_ITEMS[b.name] - Care.FOOD_ITEMS[a.name])[0];
    const amount = Care.FOOD_ITEMS[item.name];
    const inv = trainer.inventory.map(i => i.name === item.name ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0);
    updateTrainer({ ...trainer, inventory: inv });
    updateSheet(active.key, { ...active.sheet, care: Care.feed(care, amount) });
    bubbleFnRef.current?.(`😋 Ate ${item.name}!`);
  };
  const doGroom = () => {
    if (!active || !care) return;
    if (!hasGroomKit) { bubbleFnRef.current?.("🎒 Need a Grooming Kit!"); return; }
    if (!groomReady) { bubbleFnRef.current?.("🛁 Already groomed recently."); return; }
    updateSheet(active.key, { ...active.sheet, care: Care.groom(care) });
    bubbleFnRef.current?.("✨ Squeaky clean!");
  };

  // ── Walk → maybe a wild encounter ───────────────────────────────────────
  const doWalk = () => {
    if (!active || !care || !species) return;
    if (rand() < ENCOUNTER_CHANCE) {
      const wild = pickWildOpponent(active.sheet);
      if (wild) {
        const pMax = playerMaxHp(active.sheet, species);
        const wMax = wildMaxHp(wild);
        setEncounter({ wild, wildHp: wMax, wildMaxHp: wMax, playerHp: pMax, playerMaxHp: pMax, phase: "active", log: "",
          wildIntent: pickWildIntent(1),
          popups: [{ id: nowMs(), text: `A wild ${wild.name} appeared!`, side: "center", kind: "msg" }] });
        return;
      }
    }
    updateSheet(active.key, { ...active.sheet, care: Care.walk(care) });
    bubbleFnRef.current?.("🎐 Nice walk!");
  };

  const resolveEncounterOutcome = (phase: EncounterPhase, wild: PokemonEntry) => {
    if (!active || !care) return;
    const sheet = active.sheet;
    let happinessDelta = 0;
    let walkedCare = care;
    let moneyGain = 0;
    let logParts: string[] = [];
    if (phase === "won") {
      happinessDelta = 1;
      moneyGain = (RANK_ORDER.indexOf(wild.suggestedRank) + 1) * 40 + Math.floor(rand() * 30);
      logParts = [`Beat the wild ${wild.name}!`, "+1 Happiness", `+₽${moneyGain}`];
      walkedCare = Care.walk(care, 30, 15);
    } else if (phase === "lost") {
      happinessDelta = -1;
      logParts = [`${wild.name} was too strong — retreated hurt.`, "-1 Happiness"];
      walkedCare = Care.walk(care, 10, 15);
    } else {
      logParts = [`Slipped away from the wild ${wild.name}.`, "No change"];
      walkedCare = Care.walk(care, 15, 12);
    }
    const happyUpdate = happinessDelta !== 0 ? applyHappinessGain(sheet, happinessDelta) : {};
    updateSheet(active.key, { ...sheet, ...happyUpdate, care: walkedCare });
    if (moneyGain > 0 && trainer) updateTrainer({ ...trainer, money: trainer.money + moneyGain });
    setEncounter(prev => prev ? { ...prev, log: logParts.join(" · ") } : prev);
  };

  /** Resolves one round against the wild's already-telegraphed `wildIntent`
   *  (see pickWildIntent) rather than the wild just always attacking — so
   *  Defend/Evade are a real read-and-react call: right against a
   *  telegraphed Attack, a wasted round against a telegraphed Defend/
   *  Evade (which never attacks back regardless of the player's pick).
   *  Fight always swings back, for chip damage even into a defending or
   *  evading wild — halved or riskier, but never wasted the way guessing
   *  wrong with Defend/Evade is. */
  const doEncounterAction = (action: "fight" | "defend" | "evade" | "run") => {
    if (!encounter || encounter.phase !== "active" || encBusy || !active) return;
    const sheet = active.sheet;
    const wild = encounter.wild;
    const wildIntent = encounter.wildIntent;
    setEncBusy(true);
    let wildHp = encounter.wildHp;
    let playerHp = encounter.playerHp;
    let phase: EncounterPhase = "active";
    const popups: Popup[] = [];
    const speedEdge = playerSpeed(sheet) - wildSpeed(wild);
    let flashSide: "player" | "wild" | null = null;
    const parts: string[] = [];
    const halved = (dmg: number) => Math.max(1, Math.round(dmg * 0.5));

    if (action === "run") {
      const chance = Math.max(0.2, Math.min(0.9, 0.4 + speedEdge * 0.05));
      if (rand() < chance) {
        phase = "ran";
        parts.push(`${name} got away safely!`);
      } else if (wildIntent === "attack") {
        const dmg = rollDamage(wildPower(wild));
        playerHp = Math.max(0, playerHp - dmg);
        popups.push({ id: nowMs(), text: `-${dmg}`, side: "player", kind: "dmg" });
        flashSide = "player";
        parts.push(`Couldn't get away — Wild ${wild.name} hit for ${dmg}!`);
        if (playerHp <= 0) phase = "lost";
      } else {
        parts.push(`Couldn't get away — but Wild ${wild.name} wasn't attacking, so no harm done.`);
      }
    } else {
      // Player's own attack, if any — Fight always swings, its effect
      // shaped by what the wild was actually doing this round.
      if (action === "fight") {
        if (wildIntent === "evade") {
          const dodgeChance = Math.max(0.15, Math.min(0.85, 0.3 - speedEdge * 0.05));
          if (rand() < dodgeChance) {
            popups.push({ id: nowMs() + 1, text: "Missed!", side: "wild", kind: "info" });
            parts.push(`${name} used Fight — Wild ${wild.name} evaded it!`);
          } else {
            const dmg = rollDamage(playerPower(sheet));
            wildHp = Math.max(0, wildHp - dmg);
            popups.push({ id: nowMs() + 1, text: `-${dmg}`, side: "wild", kind: "dmg" });
            flashSide = "wild";
            parts.push(`${name} used Fight for ${dmg} — caught it mid-dodge!`);
          }
        } else if (wildIntent === "defend") {
          const dmg = halved(rollDamage(playerPower(sheet)));
          wildHp = Math.max(0, wildHp - dmg);
          popups.push({ id: nowMs() + 1, text: `-${dmg}`, side: "wild", kind: "dmg" });
          flashSide = "wild";
          parts.push(`${name} used Fight for ${dmg} — Wild ${wild.name} blocked most of it!`);
        } else {
          const dmg = rollDamage(playerPower(sheet));
          wildHp = Math.max(0, wildHp - dmg);
          popups.push({ id: nowMs() + 1, text: `-${dmg}`, side: "wild", kind: "dmg" });
          flashSide = "wild";
          parts.push(`${name} used Fight for ${dmg}!`);
        }
        if (wildHp <= 0) parts.push(`Wild ${wild.name} went down!`);
      }

      if (wildHp <= 0) {
        phase = "won";
      } else if (wildIntent !== "attack") {
        // Telegraphed Defend/Evade never attacks back this round, no
        // matter what the player picked — Fight was the only pick that
        // actually did something with that information.
        parts.push(action === "fight" ? `Wild ${wild.name} held back.` : `Wild ${wild.name} wasn't attacking — safe, but wasted.`);
      } else if (action === "evade") {
        const dodgeChance = Math.max(0.15, Math.min(0.85, 0.3 + speedEdge * 0.05));
        if (rand() < dodgeChance) {
          popups.push({ id: nowMs() + 2, text: "Dodged!", side: "player", kind: "info" });
          parts.push(`${name} evaded — Wild ${wild.name}'s attack missed completely!`);
        } else {
          const dmg = rollDamage(wildPower(wild));
          playerHp = Math.max(0, playerHp - dmg);
          popups.push({ id: nowMs() + 3, text: `-${dmg}`, side: "player", kind: "dmg" });
          flashSide = flashSide ?? "player";
          parts.push(`${name} tried to evade but Wild ${wild.name} still hit for ${dmg}!`);
          if (playerHp <= 0) phase = "lost";
        }
      } else if (action === "defend") {
        const dmg = halved(rollDamage(wildPower(wild)));
        playerHp = Math.max(0, playerHp - dmg);
        popups.push({ id: nowMs() + 3, text: `-${dmg}`, side: "player", kind: "dmg" });
        flashSide = flashSide ?? "player";
        parts.push(`${name} braced for it — Wild ${wild.name}'s attack only did ${dmg}!`);
        if (playerHp <= 0) phase = "lost";
      } else { // action === "fight"
        const dmg = rollDamage(wildPower(wild));
        playerHp = Math.max(0, playerHp - dmg);
        popups.push({ id: nowMs() + 3, text: `-${dmg}`, side: "player", kind: "dmg" });
        flashSide = flashSide ?? "player";
        parts.push(`Wild ${wild.name} struck back for ${dmg}!`);
        if (playerHp <= 0) phase = "lost";
      }
    }

    popups.push({ id: nowMs() + 9000, text: parts.join(" "), side: "center", kind: "msg" });
    // Telegraph the NEXT round's move now, biased by how hurt the wild is
    // after this one — a cornered Pokémon gets cagier.
    const nextIntent = phase === "active" ? pickWildIntent(wildHp / encounter.wildMaxHp) : wildIntent;

    setEncounter(prev => prev ? { ...prev, wildHp, playerHp, popups, phase, wildIntent: nextIntent } : prev);
    setHitSide(flashSide);
    setTimeout(() => { setHitSide(null); setEncBusy(false); }, 1200);
    // The narrated "msg" popup reads for longer (careBubblePop's own 2.3s
    // animation) than the quick floating damage numbers — clear everything
    // together only once that's had time to finish, not at the shorter
    // hit-shake/button-lock timing above.
    setTimeout(() => setEncounter(prev => prev ? { ...prev, popups: [] } : prev), 2300);

    if (phase !== "active") resolveEncounterOutcome(phase, wild);
  };

  const startTraining = (attr: TrainAttr) => {
    if (!active || !care || !trainer) return;
    const pool = trainingPool(trainer, attr);
    const cap = attributeCap(active.sheet, attr);
    if (pool <= 0 || cap <= 0) return;
    const durationMs = trainingDurationMs(pool);
    const cost = trainingCareCost(durationMs);
    const spentCare = Care.spend(care, cost);
    const session: Care.TrainingSession = { attr, startedAt: nowMs(), durationMs, pool };
    updateSheet(active.key, { ...active.sheet, care: { ...spentCare, training: session } });
    setShowTrainPicker(false);
  };

  const empty = !mounted ? "loading" : !trainer ? "no-trainer" : party.length === 0 ? "no-party" : null;
  const inTrainingMode = !!training && !care?.inconsolable;
  const inEncounterMode = !!encounter;

  return (
    <PokedexFrame active="care" footer={!empty && active && care ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 4px 2px" }}>
        {care.inconsolable ? (
          <div style={{ background: "rgba(0,0,0,0.22)", border: `2px solid ${C.outline}`, borderRadius: 7,
            padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💔</span>
            <span style={{ fontSize: 11, color: C.cream, lineHeight: 1.5 }}>
              {name} is Inconsolable — heal them for real in the <strong>Battle Tracker</strong> to bring them back.
            </span>
          </div>
        ) : inEncounterMode ? (
          <>
            <div style={{ fontSize: 10, color: C.cream, textAlign: "center", opacity: 0.85 }}>
              {encounter!.phase === "active" ? "A wild Pokémon appeared!" : "Encounter over — tap OK on screen."}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button disabled={encounter!.phase !== "active" || encBusy} onClick={() => doEncounterAction("fight")}
                style={encounter!.phase !== "active" || encBusy ? careButtonDisabledStyle : careButtonStyle}>⚔️ Fight</button>
              <button disabled={encounter!.phase !== "active" || encBusy} onClick={() => doEncounterAction("defend")}
                style={encounter!.phase !== "active" || encBusy ? careButtonDisabledStyle : careButtonStyle}>🛡️ Defend</button>
              <button disabled={encounter!.phase !== "active" || encBusy} onClick={() => doEncounterAction("evade")}
                style={encounter!.phase !== "active" || encBusy ? careButtonDisabledStyle : careButtonStyle}>💨 Evade</button>
              <button disabled={encounter!.phase !== "active" || encBusy} onClick={() => doEncounterAction("run")}
                style={encounter!.phase !== "active" || encBusy ? careButtonDisabledStyle : careButtonStyle}>🏃 Run</button>
            </div>
          </>
        ) : inTrainingMode ? (
          <div style={{ fontSize: 11, color: C.cream, textAlign: "center", padding: "6px 4px" }}>
            {TRAIN_ICON[training!.attr as TrainAttr]} {name} is training {TRAINING_ROLLS[training!.attr as TrainAttr].label} — check back later.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <FooterGauge label="HUNGER" value={care.gauges.hunger} />
              <FooterGauge label="CLEAN" value={care.gauges.cleanliness} />
              <FooterGauge label="BOND" value={care.gauges.affection} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={doFeed} disabled={availableFood.length === 0}
                title={availableFood.length === 0 ? "No food in the Bag" : undefined}
                style={availableFood.length === 0 ? careButtonDisabledStyle : careButtonStyle}>🍎 Feed</button>
              <button onClick={doGroom} disabled={!hasGroomKit || !groomReady}
                title={!hasGroomKit ? "Need a Grooming Kit in the Bag" : !groomReady ? "Groomed recently — check back later" : undefined}
                style={!hasGroomKit || !groomReady ? careButtonDisabledStyle : careButtonStyle}>✨ Groom</button>
              <button onClick={doWalk} style={careButtonStyle}>🚶 Walk</button>
              <button onClick={() => setShowTrainPicker(true)} style={careButtonStyle}>🏋️ Train</button>
            </div>
            <div style={{ fontSize: 9, color: C.cream, opacity: 0.85, display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
              <span>Happiness {active.sheet.happiness}/5</span>
              <span>Loyalty {active.sheet.loyalty}/5</span>
            </div>
          </>
        )}
      </div>
    ) : undefined}>
      {empty === "loading" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: pixel, fontSize: 10, color: "#585858" }}>Loading…</span>
        </div>
      )}
      {empty === "no-trainer" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, textAlign: "center", maxWidth: 380 }}>
            Register a trainer on the Pokédex home screen first.
          </p>
        </div>
      )}
      {empty === "no-party" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, textAlign: "center", maxWidth: 380 }}>
            No Pokémon in your party yet — catch one first, then come back here to look after them.
          </p>
        </div>
      )}
      {!empty && active && care && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", containerType: "size" }}>
          {/* Tab strip — who's room is showing, and a one-glance read on
              everyone else's mood without leaving this Pokémon's scene.
              Locked mid-encounter so a battle can't be orphaned by
              switching away from it. */}
          <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#1c2440", flexShrink: 0, overflowX: "auto" }}>
            {party.map((p, i) => {
              const pCare = p.sheet.care ?? Care.blankCare();
              const on = i === safeIndex;
              const locked = inEncounterMode && encounter!.phase === "active";
              return (
                <button key={p.key} onClick={() => !locked && setCurrent(i)} disabled={locked} title={p.sheet.nickname || undefined}
                  style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 6, padding: 2, cursor: locked ? "not-allowed" : "pointer",
                    opacity: locked && !on ? 0.4 : 1,
                    background: on ? C.cyan : "rgba(255,255,255,0.12)", border: `2px solid ${on ? C.outline : "transparent"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
                  <img src={`/sprites/pokemon/${p.sheet.number}.png`} alt="" width={26} height={26}
                    style={{ imageRendering: "pixelated", objectFit: "contain", filter: pCare.inconsolable ? "grayscale(1)" : undefined }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                  {pCare.inconsolable && <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 10 }}>💔</span>}
                  {pCare.training && <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 10 }}>⏳</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(0,0,0,0.06)", flexShrink: 0 }}>
            <span style={{ fontFamily: pixel, fontSize: 10, color: "#181818" }}>{name}</span>
            <GenderIcon gender={active.sheet.gender} size={11} />
            <span style={{ flex: 1 }} />
            {(species?.types ?? []).map(t => (
              <span key={t} style={{ fontSize: 8, fontFamily: pixel, padding: "2px 4px", border: "1px solid #181818",
                borderRadius: 3, background: TYPE_COLORS[t as PokemonType] ?? "#787878" }}>{t}</span>
            ))}
          </div>

          {inEncounterMode ? (
            <EncounterScene playerNumber={active.sheet.number} enc={encounter!} hitSide={hitSide}
              onDismiss={() => setEncounter(null)} />
          ) : inTrainingMode ? (
            <TrainingScene number={active.sheet.number} attr={training!.attr as TrainAttr}
              progress={Math.min(1, (nowTick - training!.startedAt) / training!.durationMs)}
              msLeft={training!.startedAt + training!.durationMs - nowTick} />
          ) : (
            <Scene number={active.sheet.number} nature={active.sheet.nature} happiness={active.sheet.happiness}
              care={care} onBubble={fn => { bubbleFnRef.current = fn; }} />
          )}
        </div>
      )}

      {/* Training stat picker */}
      {showTrainPicker && active && trainer && (
        <div role="dialog" aria-modal onClick={() => setShowTrainPicker(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#F8F8E8", border: `3px solid ${C.outline}`, borderRadius: 10, width: 340, maxWidth: "100%", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: C.navy, color: "#fff", fontFamily: pixel, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Train {name}
              <button onClick={() => setShowTrainPicker(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {(Object.keys(TRAINING_ROLLS) as TrainAttr[]).map(attr => {
                const cfg = TRAINING_ROLLS[attr];
                const pool = trainingPool(trainer, attr);
                const cap = attributeCap(active.sheet, attr);
                const durationMin = Math.round(trainingDurationMs(Math.max(1, pool)) / 60000);
                const disabled = pool <= 0 || cap <= 0;
                return (
                  <button key={attr} disabled={disabled} onClick={() => startTraining(attr)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6,
                      border: `2px solid ${disabled ? "#A8A890" : C.outline}`, background: disabled ? "#E8E4D0" : "#FFFFFF",
                      cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", opacity: disabled ? 0.6 : 1 }}>
                    <span style={{ fontSize: 18 }}>{TRAIN_ICON[attr]}</span>
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{cfg.label} — {cfg.trainerAttr}+{cfg.trainerSkill}</div>
                      <div style={{ fontSize: 9, color: "#585858" }}>
                        {cap <= 0 ? "Already at cap" : pool <= 0 ? "No dice for this stat yet" : `${pool}d6 · ~${durationMin}m · ${cap} pts room`}
                      </div>
                    </span>
                  </button>
                );
              })}
              <div style={{ fontSize: 9, color: "#8b8b70", lineHeight: 1.5, marginTop: 2 }}>
                Bigger dice pool = faster session. Training costs Hunger and Clean, same as real exertion.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Training result popup */}
      {trainResult && (
        <div role="dialog" aria-modal onClick={() => setTrainResult(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#F8F8E8", border: `3px solid ${C.outline}`, borderRadius: 10, width: 320, maxWidth: "100%", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: C.navy, color: "#fff", fontFamily: pixel, fontSize: 11 }}>
              {TRAIN_ICON[trainResult.attr]} {TRAINING_ROLLS[trainResult.attr].label} Training Complete
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 12 }}>
                {trainResult.rolls.map((r, i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: 6, border: `2px solid ${r >= 4 ? C.outline : "#A8A890"}`,
                    background: r >= 4 ? "rgba(91,208,122,0.25)" : "#E8E4D0", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: r >= 4 ? "#207040" : "#787878" }}>{r}</div>
                ))}
              </div>
              <div style={{ textAlign: "center", fontSize: 12 }}>
                {trainResult.successes} success{trainResult.successes !== 1 ? "es" : ""} · +{trainResult.gained} training pts
                {trainResult.gained > 0 && <span> · +1 Happiness</span>}
              </div>
              <button onClick={() => setTrainResult(null)} style={{ marginTop: 12, width: "100%", padding: "8px 0", borderRadius: 6,
                border: `2px solid ${C.outline}`, background: C.cyan, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Nice!</button>
            </div>
          </div>
        </div>
      )}
    </PokedexFrame>
  );
}

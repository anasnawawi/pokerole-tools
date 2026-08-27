"use client";
/* TamaPoke — the real-time care screen. See app/lib/care.ts for the decay
   engine this page is a thin UI over, and the "TamaPoke Roadmap" artifact
   for the full design writeup (prior art, formulas, what got cut for v1).

   Scope trimmed from that roadmap for this first pass: every party
   Pokémon gets care-tracked here (not poketama's 3-active/rest-frozen
   split) — simpler to ship, and nothing about the data shape stops that
   cap from being added later without a migration.

   Layout: the display is the scene and nothing else — one party Pokémon at
   a time, full-bleed, wandering its room. The care controls (gauges,
   Feed/Groom/Walk) are handed to PokedexFrame's `footer` slot instead of
   living inside that display, so they read as physical buttons on the
   shell below the screen, not as UI stacked on top of the thing you're
   watching. A tab strip along the top of the scene switches whose room
   you're looking at. */
import { useEffect, useRef, useState } from "react";
import { POKEMON, TYPE_COLORS, PokemonType } from "../data/pokerole-data";
import {
  PokemonSheetData, TrainerData, SHEETS_KEY,
  loadTrainers, loadPokemonSheets, getActiveTrainer,
} from "../lib/trainer";
import { saveToStorage } from "../lib/storage";
import { notifySession } from "../lib/session";
import { GenderIcon } from "../components/GenderIcon";
import PokedexFrame, { C } from "../components/PokedexFrame";
import * as Care from "../lib/care";

const pixel = "'Press Start 2P',monospace";

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

/** The animated room, filling the whole display — a static sprite would sit
 *  there forever, so this is the whole point of the ask: something that
 *  visibly wanders its box, reacts to being cared for, and reads as
 *  neglected before the numbers ever have to be read. Kept to CSS
 *  transitions/keyframes (see globals.css's "care-*" block) rather than a
 *  canvas loop — there's only one real sprite frame per species (a static
 *  64×64 PNG, no walk-cycle sheet) so the "animation" is staging that one
 *  frame, not flipping between frames.
 *
 *  `bubbleText` is an imperative escape hatch: the footer's Feed/Groom/Walk
 *  buttons live outside this component (see the page-level layout), so a
 *  ref-exposed trigger is how they make the scene react instead of the
 *  gauge card owning both the buttons and the stage the way the first
 *  draft did.
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
    <div style={{ position: "relative", flex: 1, minHeight: 0,
      background: "linear-gradient(180deg,#BEE4F0 0%,#BEE4F0 62%,#A8D488 62%,#8FC46E 100%)" }}>
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

const careButtonStyle: React.CSSProperties = {
  flex: 1, fontSize: 12, fontWeight: 700, padding: "9px 6px", borderRadius: 7,
  border: `2px solid ${C.outline}`, background: C.bezel, color: C.navy, cursor: "pointer",
  boxShadow: "0 2px 0 rgba(0,0,0,0.3)",
};

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

export default function CarePage() {
  const [trainer, setTrainer] = useState<TrainerData | null>(null);
  const [sheets, setSheets] = useState<Record<string, PokemonSheetData>>({});
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState(0);
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

  const party = (trainer?.pokemon ?? []).map(key => ({ key, sheet: sheets[key] })).filter(p => !!p.sheet);
  const safeIndex = party.length ? Math.min(current, party.length - 1) : 0;
  const active = party[safeIndex];
  const species = active ? POKEMON.find(p => p.number === active.sheet.number) : undefined;
  const care = active ? (active.sheet.care ?? Care.blankCare()) : null;
  const name = active ? (active.sheet.nickname.trim() || species?.name || `#${active.sheet.number}`) : "";

  const doFeed = () => { if (active && care) { updateSheet(active.key, { ...active.sheet, care: Care.feed(care) }); bubbleFnRef.current?.("😋 Yum!"); } };
  const doGroom = () => { if (active && care) { updateSheet(active.key, { ...active.sheet, care: Care.groom(care) }); bubbleFnRef.current?.("✨ Squeaky clean!"); } };
  const doWalk = () => { if (active && care) { updateSheet(active.key, { ...active.sheet, care: Care.walk(care) }); bubbleFnRef.current?.("🎐 Nice walk!"); } };

  const empty = !mounted ? "loading" : !trainer ? "no-trainer" : party.length === 0 ? "no-party" : null;

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
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <FooterGauge label="HUNGER" value={care.gauges.hunger} />
              <FooterGauge label="CLEAN" value={care.gauges.cleanliness} />
              <FooterGauge label="BOND" value={care.gauges.affection} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doFeed} style={careButtonStyle}>🍎 Feed</button>
              <button onClick={doGroom} style={careButtonStyle}>✨ Groom</button>
              <button onClick={doWalk} style={careButtonStyle}>🚶 Walk</button>
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
              everyone else's mood without leaving this Pokémon's scene. */}
          <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#1c2440", flexShrink: 0, overflowX: "auto" }}>
            {party.map((p, i) => {
              const pCare = p.sheet.care ?? Care.blankCare();
              const on = i === safeIndex;
              return (
                <button key={p.key} onClick={() => setCurrent(i)} title={p.sheet.nickname || undefined}
                  style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 6, padding: 2, cursor: "pointer",
                    background: on ? C.cyan : "rgba(255,255,255,0.12)", border: `2px solid ${on ? C.outline : "transparent"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
                  <img src={`/sprites/pokemon/${p.sheet.number}.png`} alt="" width={26} height={26}
                    style={{ imageRendering: "pixelated", objectFit: "contain", filter: pCare.inconsolable ? "grayscale(1)" : undefined }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                  {pCare.inconsolable && <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 10 }}>💔</span>}
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
          <Scene number={active.sheet.number} nature={active.sheet.nature} happiness={active.sheet.happiness}
            care={care} onBubble={fn => { bubbleFnRef.current = fn; }} />
        </div>
      )}
    </PokedexFrame>
  );
}

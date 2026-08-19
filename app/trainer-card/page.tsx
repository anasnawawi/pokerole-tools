"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PokedexFrame from "../components/PokedexFrame";
import { POKEMON, TYPE_COLORS, PokemonType } from "../data/pokerole-data";
import { TRAINER_ATTR_MAX, TRAINER_RANK_POINTS } from "../data/game-rules";
import { TrainerData, PokemonSheetData } from "../lib/trainer";
import { BattleLite, partyOf, useSession } from "../lib/session";

/* ── The card as the games draw it ───────────────────────────────────────────
   FRLG upgrades the trainer card's colour as you earn stars, so the card
   itself reports progress before you read a single number. Stars there come
   from Hall of Fame / link battles / berry crush, none of which exist here;
   badges are this game's equivalent milestone, so the tiers key off those. */
const CARD_TIERS = [
  { min: 0, name: "NORMAL", face: "#4890D8", edge: "#1C4C88", wash: "#7CB8E8" },
  { min: 2, name: "BRONZE", face: "#48A890", edge: "#1C6858", wash: "#78D0B8" },
  { min: 4, name: "COPPER", face: "#C09048", edge: "#7A5820", wash: "#E0B878" },
  { min: 6, name: "SILVER", face: "#9098A8", edge: "#585E70", wash: "#C0C8D8" },
  { min: 8, name: "GOLD",   face: "#D8B028", edge: "#8A6C08", wash: "#F0D868" },
];
const tierFor = (badges: number) => CARD_TIERS.filter(t => badges >= t.min).pop()!;

const PIXEL = "'Press Start 2P',monospace";
const INK = "#181818";

/* PokeRole rates every attribute and skill in filled dice, so the sheets show
   pips rather than a bare number — the shape of a build is readable at a
   glance that way, which is the whole point of a card. */
function Pips({ value, max, color = "#2850A0" }: { value: number; max: number; color?: string }) {
  const total = Math.max(max, value);
  return (
    <span style={{display:"inline-flex",gap:2,alignItems:"center",flexShrink:0}}>
      {Array.from({length:total},(_,i)=>(
        <span key={i} style={{width:8,height:8,borderRadius:1,
          border:`1px solid ${INK}`,
          background:i<value?color:"rgba(255,255,255,0.85)"}}/>
      ))}
    </span>
  );
}

function StatRow({ label, value, max, color, dim }: {
  label: string; value: number; max: number; color?: string; dim?: boolean;
}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"2px 0",opacity:dim?0.45:1}}>
      <span style={{flex:1,minWidth:0,fontSize:11,textTransform:"capitalize",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
      <Pips value={value} max={max} color={color}/>
      <span style={{width:16,textAlign:"right",fontSize:11,fontWeight:700,
        fontVariantNumeric:"tabular-nums"}}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{background:"#FBF8E4",border:`2px solid #2850A0`,borderRadius:6,padding:"9px 11px"}}>
      <div style={{fontFamily:PIXEL,fontSize:8,color:"#2850A0",marginBottom:7}}>{title}</div>
      {children}
    </div>
  );
}

/* ── Trainer card ────────────────────────────────────────────────────────── */

function TrainerCard({ trainer, owned }: { trainer: TrainerData; owned: number }) {
  const [flipped, setFlipped] = useState(false);
  const badges = trainer.gymBadges.filter(Boolean).length;
  const tier = tierFor(badges);
  // The games print a five-digit trainer ID. Ours are creation timestamps, so
  // take the last five digits — stable for a given trainer, and no new state.
  const idNo = String(trainer.id).slice(-5).padStart(5, "0");
  const name = trainer.name.trim() || "TRAINER";

  const face: React.CSSProperties = {
    background:`linear-gradient(160deg, ${tier.wash} 0%, ${tier.face} 55%, ${tier.edge} 100%)`,
    border:`3px solid ${INK}`, borderRadius:8,
    boxShadow:`4px 4px 0 rgba(24,24,24,0.45)`, padding:14, color:"#FFFFFF",
    textShadow:"1px 1px 0 rgba(0,0,0,0.55)",
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={face}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontFamily:PIXEL,fontSize:10}}>TRAINER CARD</span>
          <span style={{flex:1}}/>
          <span style={{fontFamily:PIXEL,fontSize:8,opacity:0.9}}>IDNo.{idNo}</span>
        </div>

        {!flipped ? (
          <div style={{display:"flex",gap:10}}>
            {trainer.spriteId&&(
              <div style={{flexShrink:0,width:56,height:56,borderRadius:6,border:`2px solid ${INK}`,background:"rgba(255,255,255,0.22)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/sprites/trainers/${trainer.spriteId}.png`} alt="" width={48} height={48} style={{imageRendering:"pixelated",objectFit:"contain"}}/>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:7,flex:1,minWidth:0}}>
              <CardLine label="NAME" value={name.toUpperCase()}/>
              <CardLine label="MONEY" value={`₽${trainer.money.toLocaleString()}`}/>
              <CardLine label="POKéDEX" value={String(owned)}/>
              <CardLine label="RANK" value={trainer.rank}/>
              <CardLine label="AGE" value={trainer.age}/>

              <div style={{marginTop:4}}>
                <div style={{fontFamily:PIXEL,fontSize:7,marginBottom:5,opacity:0.9}}>BADGES</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {trainer.gymBadges.map((got,i)=>(
                    <span key={i} title={`Badge ${i+1}${got?" — earned":""}`}
                      style={{width:22,height:22,borderRadius:"50%",flexShrink:0,
                        border:`2px solid ${INK}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:11,textShadow:"none",
                        background:got?"#F8D030":"rgba(255,255,255,0.22)"}}>
                      {got?"◆":""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            <CardLine label="CONCEPT" value={trainer.concept.trim() || "—"}/>
            <CardLine label="NATURE" value={trainer.nature || "—"}/>
            <CardLine label="PLAYER" value={trainer.playerName.trim() || "—"}/>
            <CardLine label="CARD" value={`${tier.name} · ${badges}/8 badges`}/>
            <div style={{fontSize:11,lineHeight:1.6,marginTop:2,opacity:0.95}}>
              {trainer.achievements.length
                ? `${trainer.achievements.length} achievement${trainer.achievements.length===1?"":"s"} recorded.`
                : "No achievements recorded yet."}
            </div>
          </div>
        )}
      </div>

      <button onClick={()=>setFlipped(f=>!f)}
        style={{alignSelf:"flex-start",fontFamily:PIXEL,fontSize:8,cursor:"pointer",
          background:"#F0ECD4",border:`2px solid ${INK}`,boxShadow:`2px 2px 0 #787878`,
          padding:"5px 9px",color:INK}}>
        {flipped ? "◀ FRONT" : "BACK ▶"}
      </button>
    </div>
  );
}

function CardLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{display:"flex",alignItems:"baseline",gap:8}}>
      <span style={{fontFamily:PIXEL,fontSize:7,opacity:0.9,width:64,flexShrink:0}}>{label}</span>
      <span style={{flex:1,minWidth:0,fontSize:13,fontWeight:700,
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</span>
    </div>
  );
}

/* The trainer's own sheet, in the same three-section shape the Pokémon cards
   use so both halves of the page read alike. Kept off the card face itself —
   FRLG's card is an identity document, and twelve skills would not fit on one
   without shrinking the type past legibility. */
function TrainerStats({ trainer }: { trainer: TrainerData }) {
  const skillLimit = TRAINER_RANK_POINTS[trainer.rank].skillLimit;
  const skills = Object.entries(trainer.skills) as [string, number][];
  const spent = skills.filter(([, v]) => v > 0);

  return (
    <div style={{display:"grid",gap:10,gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))"}}>
      <Section title="ATTRIBUTES">
        {(Object.entries(trainer.attributes) as [string, number][]).map(([k,v])=>(
          <StatRow key={k} label={k} value={v} max={TRAINER_ATTR_MAX}/>
        ))}
      </Section>

      <Section title="SOCIAL">
        {(Object.entries(trainer.socialAttributes) as [string, number][]).map(([k,v])=>(
          <StatRow key={k} label={k} value={v} max={TRAINER_ATTR_MAX} color="#A040A0"/>
        ))}
      </Section>

      {/* Every skill, not just the trained ones. Hiding zeros made the card
          look like the sheet had only five skills and gave no way to see the
          rest without opening the editor — and "I have nothing in Stealth" is
          itself worth reading off a character sheet. Untrained rows are dimmed
          so the trained ones still carry the eye. */}
      <Section title={`SKILLS · LIMIT ${skillLimit}`}>
        {skills.map(([k,v])=>(
          <StatRow key={k} label={k} value={v}
            max={skillLimit} color="#00A080" dim={v===0}/>
        ))}
        {trainer.customSkills.filter(s=>s.name.trim()).map(s=>(
          <StatRow key={s.name} label={s.name} value={s.points} max={skillLimit}
            color="#C08018" dim={s.points===0}/>
        ))}
        {spent.length === 0 && trainer.customSkills.length === 0 && (
          <div style={{fontSize:10,color:"#585858",fontStyle:"italic",marginTop:6}}>
            No skill points spent yet.
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── Pokémon card ────────────────────────────────────────────────────────── */

function PokemonCard({ sheetKey, sheet, battle }: {
  sheetKey: string; sheet: PokemonSheetData; battle: BattleLite[];
}) {
  const species = useMemo(() => POKEMON.find(p => p.number === sheet.number), [sheet.number]);
  const attr = (k: keyof PokemonSheetData["attributes"]) =>
    sheet.attributes[k] + sheet.trainingAttributes[k];

  // Same formulas the battle tracker uses, so the card can't contradict the
  // fight already in progress; live HP wins when this mon is on the field.
  const live = battle.find(b => b.linkedPokemonSheetKey === sheetKey);
  const maxHp = live?.maxHp ?? ((species?.baseHp ?? 0) + attr("vitality"));
  const curHp = live?.currentHp ?? maxHp;
  const maxWill = live?.maxWill ?? attr("insight") + 3;
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, curHp / maxHp)) : 1;
  const hpColor = pct > 0.5 ? "#18C840" : pct > 0.25 ? "#E8B018" : "#D82808";
  const name = sheet.nickname.trim() || species?.name || `#${sheet.number}`;
  const limits = species?.attributeLimits;

  return (
    <div style={{background:"#F8F8E8",border:`3px solid ${INK}`,borderRadius:8,
      boxShadow:"3px 3px 0 #787878",overflow:"hidden",display:"flex",flexDirection:"column"}}>

      {/* Header — sprite, name, types, rank */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
        background:"linear-gradient(180deg,#3868C0 0%,#284C9C 100%)",
        borderBottom:`3px solid ${INK}`,color:"#F8F8F8",textShadow:"1px 1px 0 #182848"}}>
        <span style={{width:44,height:44,flexShrink:0,borderRadius:"50%",
          background:"rgba(255,255,255,0.18)",border:"2px solid rgba(255,255,255,0.5)",
          display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local pixel
              art at a fixed tiny size; next/image would resample and blur it. */}
          <img src={`/sprites/pokemon/${sheet.number}.png`} alt="" width={38} height={38}
            draggable={false}
            style={{imageRendering:"pixelated",objectFit:"contain"}}
            onError={e=>{(e.currentTarget as HTMLImageElement).style.visibility="hidden";}}/>
        </span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{fontFamily:PIXEL,fontSize:11,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
            {sheet.isPartner&&<span title="Partner Pokémon" style={{fontSize:11}}>⭐</span>}
          </div>
          <div style={{fontSize:11,opacity:0.9,marginTop:2}}>
            {species && species.name !== name ? species.name : ""}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <span style={{fontFamily:PIXEL,fontSize:8}}>{sheet.rank}</span>
          <span style={{display:"flex",gap:3}}>
            {(species?.types ?? []).map(t=>(
              <span key={t} style={{fontSize:8,fontFamily:PIXEL,padding:"2px 4px",
                border:`1px solid ${INK}`,color:"#F8F8F8",textShadow:"none",
                background:TYPE_COLORS[t as PokemonType] ?? "#787878"}}>{t}</span>
            ))}
          </span>
        </div>
      </div>

      <div style={{padding:12,display:"grid",gap:10,
        gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))"}}>

        {/* Vitals */}
        <Section title="VITALS">
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
            <span style={{fontFamily:PIXEL,fontSize:8,color:"#C8A000"}}>HP</span>
            <span style={{flex:1,height:9,border:`1px solid ${INK}`,background:"#404030",overflow:"hidden"}}>
              <span style={{display:"block",height:"100%",width:`${pct*100}%`,background:hpColor}}/>
            </span>
            <span style={{fontSize:11,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
              {curHp}/{maxHp}
            </span>
          </div>
          <div style={{display:"flex",gap:14,fontSize:11,flexWrap:"wrap"}}>
            <span>WILL <strong style={{color:"#2850A0"}}>{maxWill}</strong></span>
            <span>DEF <strong>{attr("vitality")}</strong></span>
            <span>SP.DEF <strong>{attr("insight")}</strong></span>
          </div>
          <div style={{display:"flex",gap:14,fontSize:11,marginTop:6,flexWrap:"wrap"}}>
            <span>😊 {sheet.happiness}/5</span>
            <span>💛 {sheet.loyalty}/5</span>
            {sheet.heldItem && <span style={{color:"#A07000"}}>🎒 {sheet.heldItem}</span>}
          </div>
          <div style={{fontSize:11,marginTop:6,color:"#585858"}}>
            {sheet.nature} · {sheet.origin === "wild" ? "Caught wild" : sheet.origin === "egg" ? "Hatched" : "Traded"}
          </div>
        </Section>

        {/* Attributes — capped at the species' own limits, as the sheet does */}
        <Section title="ATTRIBUTES">
          {(["strength","dexterity","vitality","special","insight"] as const).map(k=>(
            <StatRow key={k} label={k} value={attr(k)}
              max={limits?.[k] ?? 5}/>
          ))}
        </Section>

        {/* Social — Contest stats, same five as a trainer's own */}
        <Section title="SOCIAL">
          {(Object.entries(sheet.socialAttributes ?? { tough:1, cool:1, beauty:1, cute:1, clever:1 }) as [string, number][]).map(([k,v])=>(
            <StatRow key={k} label={k} value={v} max={5} color="#A040A0"/>
          ))}
        </Section>

        {/* Skills */}
        <Section title="SKILLS">
          {(Object.keys(sheet.skills) as (keyof PokemonSheetData["skills"])[])
            .map(k => <StatRow key={k} label={k} value={sheet.skills[k]} max={5}
              color="#00A080" dim={sheet.skills[k]===0}/>)}
          {Object.values(sheet.skills).every(v => v === 0) && (
            <div style={{fontSize:10,color:"#585858",fontStyle:"italic",marginTop:6}}>No skill points spent yet.</div>
          )}
        </Section>

        {/* Moves */}
        <Section title="MOVES">
          {sheet.moves.length === 0 && sheet.partnerMoves.length === 0 ? (
            <div style={{fontSize:11,color:"#585858",fontStyle:"italic"}}>No moves learned yet.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {sheet.moves.map(m => (
                <div key={m} style={{fontSize:11}}>▸ {m}</div>
              ))}
              {sheet.partnerMoves.map(m => (
                <div key={m} style={{fontSize:11,color:"#A07000"}}>★ {m}</div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function TrainerCardPage() {
  const router = useRouter();
  const session = useSession();
  const trainer = session?.trainer ?? null;
  const party = partyOf(session);
  const battle = session?.battle ?? [];
  // "POKéDEX" on the card counts everything this trainer owns, party and box
  // alike — the box is still caught, and the games count it.
  const owned = (trainer?.pokemon.length ?? 0) + (trainer?.pcBox?.length ?? 0);

  return (
    <PokedexFrame active="trainer-card">
      <div style={{flex:1,minHeight:0,overflowY:"auto",background:"#35785F",padding:16,
        color:INK,display:"flex",flexDirection:"column",gap:16}}>

        {session === null ? (
          <div style={{fontFamily:PIXEL,fontSize:10,color:"#FFFFFF"}}>Reading save…</div>
        ) : !trainer ? (
          <div style={{maxWidth:460,background:"#F8F8E8",border:`3px solid ${INK}`,
            boxShadow:"3px 3px 0 #787878",padding:18,display:"flex",
            flexDirection:"column",gap:12,alignItems:"flex-start"}}>
            <div style={{fontFamily:PIXEL,fontSize:10,color:"#2850A0"}}>NO TRAINER CARD</div>
            <p style={{fontSize:12,lineHeight:1.6,margin:0}}>
              A card is issued once you register a trainer. Set one up on the
              Pokédex home screen and it will appear here.
            </p>
            <button onClick={()=>router.push("/")}
              style={{fontFamily:PIXEL,fontSize:8,cursor:"pointer",background:"#2850A0",
                color:"#F8F8E8",border:`2px solid ${INK}`,boxShadow:"2px 2px 0 #787878",
                padding:"7px 11px"}}>
              GO TO POKéDEX HOME
            </button>
          </div>
        ) : (
          <>
            <div style={{maxWidth:420}}>
              <TrainerCard trainer={trainer} owned={owned}/>
            </div>

            <TrainerStats trainer={trainer}/>

            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <span style={{fontFamily:PIXEL,fontSize:9,color:"#FFFFFF",
                textShadow:"1px 1px 0 #1C4030"}}>
                PARTY {party.length}/6
              </span>
              <span style={{flex:1,height:2,background:"rgba(255,255,255,0.3)"}}/>
              <button onClick={()=>router.push("/characters")}
                style={{fontFamily:PIXEL,fontSize:7,cursor:"pointer",background:"#F0ECD4",
                  border:`2px solid ${INK}`,boxShadow:"2px 2px 0 #4A6858",padding:"5px 8px",
                  color:INK}}>
                EDIT SHEETS
              </button>
            </div>

            {party.length === 0 ? (
              <div style={{background:"#F8F8E8",border:`3px solid ${INK}`,
                boxShadow:"3px 3px 0 #787878",padding:16,fontSize:12,maxWidth:460}}>
                No Pokémon in your party yet — add one on the Characters page and
                its card will show up here.
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {party.map(({key,sheet}) => (
                  <PokemonCard key={key} sheetKey={key} sheet={sheet} battle={battle}/>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PokedexFrame>
  );
}

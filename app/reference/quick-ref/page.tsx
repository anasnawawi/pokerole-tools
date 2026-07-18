"use client";
import Link from "next/link";
import { STATUS_CONDITIONS, WEATHER_DATA, CATCH_REQUIRED_SUCCESSES } from "../../data/game-rules";

export default function QuickRefPage() {
  return (
    <div style={{minHeight:"100vh",background:"#0f1117",color:"#e8eaf0",overflow:"auto"}}>
      <nav style={{background:"#13151f",borderBottom:"1px solid #2a2f45",padding:"0 16px",height:48,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <Link href="/" style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:15,color:"#e8eaf0",textDecoration:"none"}}>PokeRole<span style={{color:"#00d4aa"}}> Tools</span></Link>
        <span style={{color:"#3a4060"}}>/</span>
        <span style={{fontSize:13,color:"#3d8bff",fontWeight:700}}>📚 Quick Reference</span>
      </nav>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 24px 60px"}}>
        <h1 style={{fontFamily:"'Exo 2'",fontWeight:800,fontSize:26,color:"#e8eaf0",marginBottom:20}}>PokeRole 3.0 — Quick Reference</h1>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>

          <Sec title="🎲 How to Roll" c="#3d8bff">
            <R l="Dice Pool">Attribute + Skill ± Modifiers. Each die showing 4, 5, or 6 = 1 success.</R>
            <R l="Difficulty">1=Trivial · 2=Challenging · 3=Hard · 4=Very Hard · 5+=Near Impossible</R>
            <R l="Critical Success">3+ successes over required → bonus effect or +1 damage</R>
            <R l="Critical Failure">0 successes AND half or more dice show 1s → bad consequence</R>
            <R l="Will Points (WP)">Spend 1 WP: +1 die to any roll, or reroll 1 die. Max 3 WP/roll.</R>
          </Sec>

          <Sec title="⚡ Multiple Actions" c="#f8d030">
            <R l="Per Round">Up to 5 actions per round. Each action raises the required successes by 1.</R>
            {["1 success","2 successes","3 successes","4 successes","5 successes"].map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                <span style={{color:"#8b90a8"}}>Action {i+1}</span>
                <span style={{color:"#e8eaf0",fontWeight:700}}>Need {s} to hit</span>
              </div>
            ))}
          </Sec>

          <Sec title="💥 Damage" c="#ff4757">
            <R l="Physical">STR + Move Power − foe's Vitality (defense). Min 1 damage.</R>
            <R l="Special">SPC + Move Power − foe's Insight (sp.def). Min 1 damage.</R>
            <R l="STAB">Move type = Pokémon type → +1 die to damage pool</R>
            <R l="Super Effective">+2 dice to damage pool (requires at least 1 damage success)</R>
            <R l="Critical Hit">3+ over required accuracy → +2 dice to damage pool</R>
            <R l="Set Damage">Fixed damage, ignores defenses — no roll</R>
          </Sec>

          <Sec title="🩹 Pain Penalization" c="#f08030">
            <R l="What it does">Low HP = dice penalty to all rolls.</R>
            {[["Above 50% HP","No penalty"],["26–50% HP","–1 die"],["1–25% HP","–2 dice"],["0 HP","Fainted"]].map(([c,e])=>(
              <div key={c} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                <span style={{color:"#8b90a8"}}>{c}</span>
                <span style={{color:c.includes("Fainted")||c.includes("1–25")?"#ff4757":c.includes("26–50")?"#ffd32a":"#00d4aa",fontWeight:700}}>{e}</span>
              </div>
            ))}
          </Sec>

          <Sec title="💢 Status Conditions" c="#a040a0">
            {Object.values(STATUS_CONDITIONS).filter(s=>s.name!=="Healthy").map(sc=>(
              <div key={sc.name} style={{borderLeft:`2px solid ${sc.color}`,paddingLeft:7,marginBottom:7}}>
                <div style={{fontSize:11,fontWeight:700,color:sc.color}}>{sc.name}</div>
                <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{sc.shortDesc}</div>
              </div>
            ))}
          </Sec>

          <Sec title="🎯 Catching Pokémon" c="#00d4aa">
            <R l="Steps">1. Assess rank → 2. Weaken → 3. Throw ball (DEX/STR + Throw) → 4. Roll Seal</R>
            <R l="Bonuses">Half HP: +1 · 1 HP: +2 · Status Ailment: +1 each · Fainted: –ALL bonuses</R>
            <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:"1px",marginTop:6,marginBottom:3}}>Required Successes</div>
            {Object.entries(CATCH_REQUIRED_SUCCESSES).slice(0,6).map(([r,s])=>(
              <div key={r} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                <span style={{color:"#8b90a8"}}>{r}</span><span style={{color:"#ffd32a",fontWeight:700}}>{s}</span>
              </div>
            ))}
            <div style={{fontSize:10,color:"#5a6080",textTransform:"uppercase",letterSpacing:"1px",marginTop:6,marginBottom:3}}>Ball Seal Potency</div>
            {[["Pokéball","4d"],["Great Ball","6d"],["Ultra Ball","8d"]].map(([b,p])=>(
              <div key={b} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"1px 0"}}>
                <span style={{color:"#8b90a8"}}>{b}</span><span style={{color:"#00d4aa",fontWeight:700}}>{p}</span>
              </div>
            ))}
          </Sec>

          <Sec title="⚠ Disobedience" c="#ffd32a">
            <R l="Same Rank or Lower">No disobedience. Full obedience.</R>
            <R l="One Rank Above">Low Disobedience — Roll Loyalty at round start. 3+ successes = obeys for the round. Fail = acts on instinct/Nature.</R>
            <R l="Two+ Ranks Above">High Disobedience — Acts entirely on its own. Cannot be commanded.</R>
            <R l="Training Penalty">Low: half Training Points. High: 0 Training Points.</R>
          </Sec>

          <Sec title="🌤️ Weather Summary" c="#e0c068">
            {WEATHER_DATA.filter(w=>w.name!=="Clear").map(w=>(
              <div key={w.name} style={{marginBottom:7}}>
                <div style={{fontSize:11,fontWeight:700,color:"#e8eaf0"}}>{w.emoji.split(" ")[0]} {w.name}</div>
                <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{w.description}</div>
              </div>
            ))}
          </Sec>

          <Sec title="🏃 Initiative & Turns" c="#6890f0">
            <R l="Roll Initiative">DEX + Alert (or DEX alone). Higher = goes first.</R>
            <R l="Your Turn">1 Action normally. Take up to 5 with increasing difficulty.</R>
            <R l="Switching">Costs 1 Action to switch Pokémon.</R>
            <R l="End of Round">Apply burn/poison/weather. Flinch clears. Status ticks down.</R>
          </Sec>

          <Sec title="❤️ HP, WP & Healing" c="#00d4aa">
            <R l="Trainer HP">Base 4 + Vitality</R>
            <R l="Pokémon HP">Base HP (from Pokédex) + Vitality</R>
            <R l="Will Points">Insight + 3</R>
            <R l="Natural Healing">1 HP per 8 hours of rest</R>
          </Sec>

        </div>
      </div>
    </div>
  );
}

function Sec({title,c,children}:{title:string;c:string;children:React.ReactNode}) {
  return (
    <div style={{background:"#1e2235",border:`1px solid ${c}25`,borderRadius:8,padding:14,borderTop:`3px solid ${c}`}}>
      <h3 style={{fontFamily:"'Exo 2'",fontWeight:700,fontSize:14,color:c,marginBottom:10}}>{title}</h3>
      {children}
    </div>
  );
}
function R({l,children}:{l:string;children:React.ReactNode}) {
  return (
    <div style={{marginBottom:7}}>
      <div style={{fontSize:11,fontWeight:700,color:"#e8eaf0"}}>{l}</div>
      <div style={{fontSize:10,color:"#8b90a8",lineHeight:1.4}}>{children}</div>
    </div>
  );
}

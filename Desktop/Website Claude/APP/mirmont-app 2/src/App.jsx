import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";

// ─── FIREBASE ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAkFRsCzFOHQswErbDuK1duQSlrnCOMKuE",
  authDomain: "mirmont-customer-portal.firebaseapp.com",
  databaseURL: "https://mirmont-customer-portal-default-rtdb.firebaseio.com",
  projectId: "mirmont-customer-portal",
  storageBucket: "mirmont-customer-portal.firebasestorage.app",
  messagingSenderId: "279070555968",
  appId: "1:279070555968:web:a7b4ac75794bbc313c44a5"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const DEFAULT_CODES = {
  'MRM-2024-001': 'Smith Family',
  'MRM-2024-002': 'Johnson Project',
  'MRM-2024-003': 'Davis Renovation',
  'MRM-DEMO':     'Demo Client',
};

const SESSION_KEY = 'mirmont_session_v2';

// ─── BRAND TOKENS ────────────────────────────────────────────────
const C = {
  navyDark: "#091535", navy: "#0d1e4a", navyMid: "#132660",
  gold: "#c9a05a", goldLight: "#dbb97a", goldDark: "#a07a35",
  white: "#f8f5ef", offWhite: "#ede8df", textLight: "#c8c0b0",
  green: "#4a9a3a", red: "#e07070",
};

// ─── PHASE DATA ──────────────────────────────────────────────────
const PHASES = [
  { label:"01", name:"Paint & Wall Finishes", icon:"🎨",
    description:"Colors, sheens, and surface treatments for every room.",
    tasks:[
      {text:"Interior wall paint — living areas",note:"Select sheen finish",options:["Flat","Eggshell","Satin","Semi-Gloss","Gloss"]},
      {text:"Interior wall paint — bedrooms",note:"Select sheen finish",options:["Flat","Eggshell","Satin","Semi-Gloss","Gloss"]},
      {text:"Interior wall paint — bathrooms",note:"Moisture-resistant sheen",options:["Eggshell","Satin","Semi-Gloss"]},
      {text:"Interior wall paint — kitchen",note:"Select sheen finish",options:["Eggshell","Satin","Semi-Gloss"]},
      {text:"Ceiling paint color & finish",note:"Select ceiling finish",options:["Flat White (Standard)","Custom Color — Flat","Custom Color — Eggshell"]},
      {text:"Trim, baseboard & door casing paint",note:"Select trim sheen",options:["Satin","Semi-Gloss","High Gloss"]},
      {text:"Accent or feature wall",note:"Select treatment type",options:["Paint — Solid","Wallpaper","Shiplap / Board & Batten","Stone or Tile","None"]},
      {text:"Wall texture type",note:"Select texture style",options:["Smooth / Level 5","Skip Trowel","Orange Peel","Knockdown","Match Existing"]},
      {text:"Wainscoting or shiplap",note:"Select style if applying",options:["Wainscoting","Shiplap","Board & Batten","None"]},
      {text:"Exterior paint colors (if in scope)",note:"Select scope",options:["Full Exterior","Body Only","Trim Only","Front Door Only","Not in Scope"]},
    ]},
  { label:"02", name:"Flooring", icon:"🪵",
    description:"Materials, patterns, and transitions for every surface.",
    tasks:[
      {text:"Living area flooring",note:"Select flooring type",options:["Hardwood","LVP / Luxury Vinyl","Tile","Carpet","Polished Concrete"]},
      {text:"Bedroom flooring",note:"Select flooring type",options:["Hardwood","LVP / Luxury Vinyl","Carpet","Tile","Same as Living Area"]},
      {text:"Kitchen flooring",note:"Select flooring type",options:["Tile","LVP / Luxury Vinyl","Hardwood","Same as Living Area"]},
      {text:"Primary bathroom floor tile finish",note:"Select tile surface",options:["Matte","Polished","Honed","Textured / Anti-Slip"]},
      {text:"Secondary/guest bathroom floor tile",note:"Select tile surface",options:["Matte","Polished","Honed","Textured / Anti-Slip","Same as Primary"]},
      {text:"Laundry room / mudroom flooring",note:"Select flooring type",options:["Tile","LVP / Luxury Vinyl","Epoxy","Same as Adjacent Area"]},
      {text:"Stair treads and risers",note:"Select stair material",options:["Hardwood — Stained","Hardwood — Painted","Carpet Runner","LVP","Not Applicable"]},
      {text:"Transition strips & thresholds",note:"Select transition material",options:["Aluminum","Wood — Stained","Wood — Painted","Match Floor Material"]},
      {text:"Floor grout type for tile areas",note:"Select grout type",options:["Sanded","Unsanded","Epoxy","Pre-Mixed"]},
      {text:"Underlayment type",note:"Select underlayment",options:["Standard Foam","Cork","Acoustic / Sound-Reducing","Cement Board (tile)","Not Required"]},
    ]},
  { label:"03", name:"Bathroom Selections", icon:"🛁",
    description:"Tile, fixtures, vanities, hardware, and enclosures.",
    tasks:[
      {text:"Shower wall tile layout — primary bath",note:"Select tile pattern",options:["Straight Stack","Vertical Stack","Brick / Offset","Herringbone","Chevron"]},
      {text:"Shower wall tile layout — secondary bath",note:"Select tile pattern",options:["Straight Stack","Vertical Stack","Brick / Offset","Herringbone","Same as Primary"]},
      {text:"Shower floor tile or pan",note:"Select shower floor type",options:["Mosaic Tile","Pebble Stone","Solid Surface Pan","Large Format Tile","Matching Wall Tile"]},
      {text:"Shower grout type — walls",note:"Select grout type",options:["Standard Sanded","Standard Unsanded","Epoxy (stain-resistant)"]},
      {text:"Toilet style — primary bath",note:"Select toilet type",options:["Two-Piece Standard","One-Piece","Wall-Hung","Smart / Bidet Seat"]},
      {text:"Vanity cabinet door style",note:"Select door style",options:["Shaker","Flat Panel","Raised Panel","Open Shelving","Floating / Wall-Mount"]},
      {text:"Vanity countertop material",note:"Select countertop",options:["Quartz","Marble","Cultured Marble","Solid Surface","Porcelain Slab"]},
      {text:"Bathroom faucet finish",note:"Select finish",options:["Brushed Nickel","Matte Black","Polished Chrome","Brushed Gold / Brass","Oil-Rubbed Bronze"]},
      {text:"Shower head type",note:"Select shower head style",options:["Standard Fixed","Rain Head (ceiling)","Rain Head + Hand Wand","Multi-Function System","Body Sprays Included"]},
      {text:"Shower door / enclosure type",note:"Select enclosure style",options:["Frameless Glass — Pivot","Frameless Glass — Sliding","Semi-Frameless Sliding","Framed Sliding","Shower Curtain & Rod"]},
    ]},
  { label:"04", name:"Kitchen Selections", icon:"🍳",
    description:"Cabinets, countertops, backsplash, sink, and appliances.",
    tasks:[
      {text:"Cabinet door style",note:"Select door style",options:["Shaker","Flat Panel / Slab","Raised Panel","Beadboard","Inset"]},
      {text:"Cabinet finish — uppers",note:"Select finish type",options:["Painted — White / Off-White","Painted — Gray","Painted — Navy / Dark","Stained Wood — Light","Stained Wood — Dark"]},
      {text:"Cabinet finish — lowers",note:"Select finish type",options:["Same as Uppers","Painted — Contrasting","Stained Wood — Light","Stained Wood — Dark","Two-Tone Custom"]},
      {text:"Cabinet hardware — style",note:"Select hardware type",options:["Bar Pulls","Cup Pulls","Knobs Only","Mixed Knobs & Pulls","Push-to-Open"]},
      {text:"Countertop material",note:"Select countertop",options:["Quartz","Granite","Quartzite","Marble","Butcher Block","Porcelain Slab"]},
      {text:"Kitchen backsplash material",note:"Select backsplash type",options:["Ceramic / Porcelain Tile","Glass Tile","Natural Stone","Slab — Matching Countertop","Zellige / Handmade Tile"]},
      {text:"Backsplash tile layout pattern",note:"Select layout pattern",options:["Straight / Grid","Brick / Offset","Vertical Stack","Herringbone","Chevron"]},
      {text:"Kitchen sink style",note:"Select sink type",options:["Undermount — Stainless","Undermount — Composite","Farmhouse / Apron-Front","Drop-In","Double Basin","Single Basin"]},
      {text:"Kitchen faucet style",note:"Select faucet style",options:["Pull-Down Sprayer","Pull-Out Sprayer","Single Handle Fixed","Bridge Faucet","Touch / Touchless"]},
      {text:"Appliance package finish",note:"Select appliance finish",options:["Stainless Steel","Black Stainless","Matte Black","Panel-Ready","White"]},
    ]},
  { label:"05", name:"Doors, Windows & Hardware", icon:"🚪",
    description:"Interior doors, hardware finishes, smart locks, window casing.",
    tasks:[
      {text:"Interior door style",note:"Select door panel style",options:["6-Panel","5-Panel Shaker","Flat / Flush","French / Glass Panel","Barn Door"]},
      {text:"Interior door core type",note:"Select door construction",options:["Hollow Core","Solid Core","Fire-Rated (where required)"]},
      {text:"Interior door hardware style",note:"Select handle style",options:["Lever — Round","Lever — Straight","Knob — Round","Knob — Crystal","Pocket Door Pull"]},
      {text:"Interior door hardware finish",note:"Must match throughout",options:["Brushed Nickel","Matte Black","Polished Chrome","Brushed Gold / Brass","Oil-Rubbed Bronze","Satin Brass"]},
      {text:"Closet door style",note:"Select closet door type",options:["Bifold","Sliding Bypass","Barn Door","Standard Swing","Open / No Door"]},
      {text:"Front door hardware finish",note:"Select entry hardware",options:["Brushed Nickel","Matte Black","Polished Chrome","Brushed Gold / Brass","Oil-Rubbed Bronze"]},
      {text:"Front door smart lock",note:"Select smart lock preference",options:["Yes — Keypad","Yes — App + Keypad","Yes — Fingerprint","Standard Key Lock Only"]},
      {text:"Window trim / casing profile",note:"Select casing style",options:["Colonial / Traditional","Craftsman / Flat with Sill","Modern / Minimal Reveal","Match Existing","New Profile — TBD"]},
    ]},
  { label:"06", name:"Lighting & Electrical", icon:"💡",
    description:"Fixtures, dimmers, smart switches, and outlet placements.",
    tasks:[
      {text:"Dining / kitchen chandelier style",note:"Select fixture style",options:["Modern / Linear","Traditional / Crystal","Industrial / Metal","Farmhouse / Rustic","Drum Shade","No Chandelier"]},
      {text:"Living area ceiling fixture",note:"Select fixture type",options:["Ceiling Fan with Light","Flush Mount","Semi-Flush Mount","Pendant","Recessed Only"]},
      {text:"Bedroom ceiling fixture",note:"Select fixture type",options:["Ceiling Fan with Light","Flush Mount","Semi-Flush Mount","Pendant","Recessed Only"]},
      {text:"Exterior light fixture finish",note:"Select exterior finish",options:["Matte Black","Brushed Nickel","Bronze","Brass / Gold","White"]},
      {text:"Dimmer switches",note:"Select dimmer preference",options:["Yes — All Dimmable Circuits","Yes — Select Rooms Only","No — Standard Switches"]},
      {text:"Smart switches / smart home wiring",note:"Select smart switch preference",options:["Yes — Full Smart Home","Yes — Select Rooms Only","No — Standard Switches"]},
      {text:"USB / USB-C outlet placement",note:"Select USB outlet preference",options:["Kitchen Island","Master Bedroom","Home Office","Multiple Locations","Not Adding"]},
      {text:"Recessed can light trim finish",note:"Select recessed trim color",options:["White (standard)","Brushed Nickel","Matte Black","Matching Ceiling Color"]},
    ]},
  { label:"07", name:"Final Review & Sign-Off", icon:"✅",
    description:"Confirm orders, schedule appointments, hand off to your contractor.",
    tasks:[
      {text:"All paint colors confirmed with contractor",note:"Final approval before painting",options:["Confirmed","Pending Review","Changes Needed"]},
      {text:"All tile and flooring orders placed",note:"Lead time confirmed",options:["Ordered — Lead Time Confirmed","Order Pending","Not Yet Selected"]},
      {text:"All plumbing fixtures ordered — bathrooms",note:"Confirm order status",options:["Ordered","Pending","Not Yet Selected"]},
      {text:"All plumbing fixtures ordered — kitchen",note:"Confirm order status",options:["Ordered","Pending","Not Yet Selected"]},
      {text:"All cabinetry ordered",note:"Delivery date confirmed",options:["Ordered — Delivery Scheduled","Order Pending","Not Yet Selected"]},
      {text:"Countertop template appointment scheduled",note:"Templating status",options:["Scheduled","Awaiting Cabinet Install","Not Yet Scheduled"]},
      {text:"Lighting and electrical fixtures ordered",note:"Confirm order status",options:["Ordered","Pending","Not Yet Selected"]},
      {text:"Final selections walk-through completed",note:"Last chance to adjust before orders lock",options:["Completed","Scheduled","Not Yet Scheduled"]},
    ]},
];

// ─── HELPERS ─────────────────────────────────────────────────────
function tk(pi,ti){ return `${pi}_${ti}`; }
function safeCode(code){ return code.toUpperCase().replace(/[.#$[\]/]/g,'_'); }

function totalStats(checked){
  let total=0,done=0;
  PHASES.forEach((p,pi)=>{ total+=p.tasks.length; done+=p.tasks.filter((_,ti)=>!!checked[tk(pi,ti)]).length; });
  return {total,done,pct:total?Math.round((done/total)*100):0};
}
function phaseStats(pi,checked){
  const tasks=PHASES[pi].tasks;
  const done=tasks.filter((_,ti)=>!!checked[tk(pi,ti)]).length;
  return {done,total:tasks.length,pct:tasks.length?Math.round((done/tasks.length)*100):0};
}

// ─── MINI COMPONENTS ─────────────────────────────────────────────
function GoldRule({style={}}){
  return <div style={{width:48,height:2,background:C.gold,...style}}/>;
}

function ProgressRing({pct,size=56}){
  const r=(size-6)/2, circ=2*Math.PI*r, dash=(pct/100)*circ;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(201,160,90,0.15)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={pct===100?C.green:C.gold} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{transition:"stroke-dasharray 0.5s ease"}}/>
    </svg>
  );
}

function SyncDot({status}){
  const bg = status==="synced"?C.green:status==="syncing"?"#c9a05a":C.red;
  const label = status==="synced"?"Saved":status==="syncing"?"Saving...":"Sync error";
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:bg,
        animation:status==="syncing"?"pulse 1s infinite":"none",
        flexShrink:0}}/>
      <span style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:C.textLight}}>{label}</span>
    </div>
  );
}

// ─── LOGIN SCREEN ────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [name,setName]       = useState("");
  const [code,setCode]       = useState("");
  const [error,setError]     = useState("");
  const [loading,setLoading] = useState(false);
  const [validCodes,setValidCodes] = useState(DEFAULT_CODES);

  useEffect(()=>{
    // Load admin_projects from Firebase to get full code list
    const r = ref(db,'admin_projects');
    onValue(r, snap=>{
      const extra = snap.val()||{};
      setValidCodes({...DEFAULT_CODES,...extra});
    });
  },[]);

  function handleLogin(e){
    e.preventDefault();
    const trimName = name.trim();
    const trimCode = code.trim().toUpperCase();
    if(!trimName){ setError("Please enter your name."); return; }
    if(!trimCode){ setError("Please enter your project code."); return; }
    const match = Object.keys(validCodes).find(k=>k.toUpperCase()===trimCode);
    if(!match){ setError("Project code not found. Please check with your Mirmont team."); return; }
    setError(""); setLoading(true);
    const finalName = trimName || validCodes[match];
    // Save session
    try{ localStorage.setItem(SESSION_KEY, JSON.stringify({code:match,name:finalName})); }catch(_){}
    setTimeout(()=>{ onLogin(match,finalName); },400);
  }

  return (
    <div style={{
      minHeight:"100vh", background:C.navyDark,
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:"2rem", position:"relative", overflow:"hidden",
      fontFamily:"'Montserrat', sans-serif",
    }}>
      {/* bg grid */}
      <div style={{position:"absolute",inset:0,
        backgroundImage:"repeating-linear-gradient(45deg,rgba(201,160,90,0.025) 0,rgba(201,160,90,0.025) 1px,transparent 0,transparent 50%)",
        backgroundSize:"24px 24px"}}/>
      <div style={{position:"absolute",top:"50%",left:"50%",
        transform:"translate(-50%,-50%)",width:700,height:700,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(201,160,90,0.06) 0%,transparent 65%)",
        pointerEvents:"none"}}/>

      <div style={{
        position:"relative",zIndex:2,
        background:C.navy,
        border:"1px solid rgba(201,160,90,0.15)",
        padding:"3.5rem 3rem",
        maxWidth:460, width:"100%",
        textAlign:"center",
        animation:"fadeUp 0.7s ease both",
      }}>
        {/* gold top line */}
        <div style={{position:"absolute",top:-1,left:0,right:0,height:2,
          background:"linear-gradient(to right,transparent,#c9a05a,transparent)"}}/>

        <p style={{fontSize:10,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gold,marginBottom:12,fontWeight:600}}>
          Client Portal
        </p>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2rem",fontWeight:600,
          color:C.white,lineHeight:1.2,marginBottom:8}}>
          Your Renovation<br/><em style={{fontStyle:"italic",color:C.goldLight}}>Selections</em>
        </h1>
        <p style={{fontSize:12,color:C.textLight,lineHeight:1.8,marginBottom:"2rem"}}>
          Enter the client name and project code<br/>provided by your Mirmont Construction team.
        </p>
        <div style={{width:40,height:1,background:"rgba(201,160,90,0.3)",margin:"0 auto 2rem"}}/>

        <form onSubmit={handleLogin} style={{textAlign:"left"}}>
          {/* Name */}
          <div style={{marginBottom:"1.2rem"}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,letterSpacing:"0.22em",
              textTransform:"uppercase",color:C.gold,marginBottom:8}}>Your Name</label>
            <input value={name} onChange={e=>{setName(e.target.value);setError("");}}
              placeholder="e.g. John & Sarah"
              style={{width:"100%",background:C.navyDark,border:"1px solid rgba(201,160,90,0.2)",
                color:C.white,fontFamily:"'Montserrat',sans-serif",fontSize:14,
                padding:"0.85rem 1.1rem",outline:"none",letterSpacing:"0.05em",
                borderColor:error&&!name.trim()?"rgba(224,112,112,0.5)":"rgba(201,160,90,0.2)"}}/>
          </div>
          {/* Code */}
          <div style={{marginBottom:"1.2rem"}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,letterSpacing:"0.22em",
              textTransform:"uppercase",color:C.gold,marginBottom:8}}>Project Code</label>
            <input value={code} onChange={e=>{setCode(e.target.value);setError("");}}
              placeholder="e.g. MRM-2024-001"
              autoCapitalize="characters" spellCheck={false}
              style={{width:"100%",background:C.navyDark,border:"1px solid rgba(201,160,90,0.2)",
                color:C.white,fontFamily:"'Montserrat',sans-serif",fontSize:14,
                padding:"0.85rem 1.1rem",outline:"none",letterSpacing:"0.12em",
                borderColor:error?"rgba(224,112,112,0.5)":"rgba(201,160,90,0.2)"}}/>
          </div>

          {error && (
            <div style={{marginBottom:"1rem",fontSize:11,color:C.red,
              padding:"0.7rem 1rem",border:"1px solid rgba(224,112,112,0.25)",
              background:"rgba(224,112,112,0.06)"}}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width:"100%",background:loading?"rgba(201,160,90,0.6)":C.gold,
            color:C.navyDark,border:"none",fontFamily:"'Montserrat',sans-serif",
            fontSize:11,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",
            padding:"1rem",cursor:loading?"not-allowed":"pointer",
            transition:"background 0.3s",
          }}>
            {loading?"Loading…":"Enter Portal"}
          </button>
        </form>

        <p style={{marginTop:"2rem",fontSize:10,color:"rgba(200,192,176,0.35)",lineHeight:1.7}}>
          Need your project code?{" "}
          <a href="mailto:info@mirmont.biz" style={{color:"rgba(201,160,90,0.5)",textDecoration:"none"}}>
            Contact us
          </a>
        </p>
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input:focus { border-color: rgba(201,160,90,0.6) !important; }
      `}</style>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]           = useState(null); // {code, name}
  const [checked,setChecked]           = useState({});
  const [selections,setSelections]     = useState({});
  const [syncStatus,setSyncStatus]     = useState("synced");
  const [view,setView]                 = useState("journey");
  const [activePhaseIdx,setActivePhaseIdx] = useState(0);
  const fbRef = useRef(null);
  const syncTimer = useRef(null);

  // ── Restore session on mount ──
  useEffect(()=>{
    try{
      const saved = localStorage.getItem(SESSION_KEY);
      if(saved){ const s=JSON.parse(saved); if(s.code&&s.name) handleLogin(s.code,s.name); }
    }catch(_){}
  },[]);

  // ── Firebase sync ──
  function handleLogin(code,name){
    setSession({code,name});
    const sc = safeCode(code);
    const projectRef = ref(db,`projects/${sc}`);
    fbRef.current = projectRef;

    onValue(projectRef, snap=>{
      const data = snap.val()||{};
      setChecked(data.checked||{});
      setSelections(data.selections||{});
      setSyncStatus("synced");
    });
  }

  function fbWrite(path,value){
    if(!fbRef.current) return;
    setSyncStatus("syncing");
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(()=>{
      set(ref(db,`projects/${safeCode(session.code)}/${path}`),value)
        .then(()=>setSyncStatus("synced"))
        .catch(()=>setSyncStatus("error"));
    },600);
  }

  function handleLogout(){
    try{ localStorage.removeItem(SESSION_KEY); }catch(_){}
    setSession(null);
    setChecked({});
    setSelections({});
    setView("journey");
    fbRef.current=null;
  }

  function toggleTask(pi,ti){
    const k=tk(pi,ti);
    const next=!checked[k];
    setChecked(prev=>({...prev,[k]:next}));
    fbWrite(`checked/${k}`,next);
  }

  function setOption(pi,ti,opt){
    const k=tk(pi,ti);
    setSelections(prev=>({...prev,[k]:opt}));
    setChecked(prev=>({...prev,[k]:true}));
    fbWrite(`selections/${k}`,opt);
    fbWrite(`checked/${k}`,true);
  }

  function openPhaseView(pi){
    setActivePhaseIdx(pi);
    setView("phase");
  }

  const stats = totalStats(checked);

  // ── NOT LOGGED IN ──
  if(!session) return <LoginScreen onLogin={handleLogin}/>;

  // ── JOURNEY VIEW ──────────────────────────────────────────────
  if(view==="journey"||view==="summary"){
    const isSummary = view==="summary";
    return (
      <div style={{minHeight:"100vh",background:C.navyDark,fontFamily:"'Montserrat',sans-serif",color:C.white}}>

        {/* HERO */}
        <div style={{background:C.navy,borderBottom:"1px solid rgba(201,160,90,0.15)",
          padding:"40px 20px 36px",textAlign:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,
            backgroundImage:"repeating-linear-gradient(45deg,rgba(201,160,90,0.03) 0,rgba(201,160,90,0.03) 1px,transparent 0,transparent 50%)",
            backgroundSize:"24px 24px"}}/>
          <div style={{position:"relative",zIndex:2}}>
            <p style={{fontSize:10,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gold,margin:"0 0 8px",fontWeight:600}}>
              Mirmont Construction
            </p>
            <h1 style={{fontFamily:"'Cormorant Garamond',serif",
              fontSize:"clamp(2rem,7vw,3.5rem)",fontWeight:600,lineHeight:1.1,
              color:C.white,margin:"0 0 12px"}}>
              {isSummary?"Selections":"Your Renovation"}<br/>
              <em style={{fontStyle:"italic",color:C.goldLight}}>{isSummary?"Summary":"Journey Guide"}</em>
            </h1>
            <GoldRule style={{margin:"0 auto 14px"}}/>

            {/* Welcome badge */}
            <div style={{display:"inline-flex",alignItems:"center",gap:8,
              background:"rgba(201,160,90,0.08)",border:"1px solid rgba(201,160,90,0.2)",
              padding:"6px 16px",marginBottom:16}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.gold}}/>
              <span style={{fontSize:10,letterSpacing:"0.15em",textTransform:"uppercase",color:C.gold,fontWeight:600}}>
                {session.name}
              </span>
            </div>

            {/* Progress */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,
              background:"rgba(201,160,90,0.06)",border:"1px solid rgba(201,160,90,0.15)",
              padding:"14px 24px",maxWidth:320,margin:"0 auto"}}>
              <ProgressRing pct={stats.pct} size={48}/>
              <div style={{textAlign:"left"}}>
                <p style={{fontSize:9,letterSpacing:"0.28em",textTransform:"uppercase",color:C.gold,margin:"0 0 3px",fontWeight:600}}>Overall Progress</p>
                <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:700,color:C.white,margin:0,lineHeight:1}}>
                  {stats.done} <span style={{color:C.gold}}>/ {stats.total}</span>
                </p>
                <p style={{fontSize:10,color:C.textLight,margin:"2px 0 0"}}>{stats.pct}% complete</p>
              </div>
            </div>
          </div>
        </div>

        {/* NAV */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          background:C.navyMid,borderBottom:"1px solid rgba(201,160,90,0.1)",
          padding:"0 16px"}}>
          <div style={{display:"flex"}}>
            {["journey","summary"].map(t=>(
              <button key={t} onClick={()=>setView(t)} style={{
                background:"none",border:"none",
                borderBottom:view===t?`2px solid ${C.gold}`:"2px solid transparent",
                color:view===t?C.gold:C.textLight,
                fontFamily:"'Montserrat',sans-serif",fontSize:10,fontWeight:600,
                letterSpacing:"0.2em",textTransform:"uppercase",
                padding:"14px 18px",cursor:"pointer",transition:"all 0.2s",
              }}>{t==="journey"?"Journey":"Summary"}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <SyncDot status={syncStatus}/>
            <button onClick={handleLogout} style={{
              background:"none",border:"1px solid rgba(201,160,90,0.2)",
              color:"rgba(201,160,90,0.5)",fontFamily:"'Montserrat',sans-serif",
              fontSize:9,fontWeight:600,letterSpacing:"0.18em",textTransform:"uppercase",
              padding:"6px 12px",cursor:"pointer",transition:"all 0.2s",
            }}>Sign Out</button>
          </div>
        </div>

        {/* ── JOURNEY GRID ── */}
        {!isSummary && (
          <div style={{padding:"28px 16px 48px",maxWidth:900,margin:"0 auto"}}>
            <p style={{fontSize:10,letterSpacing:"0.28em",textTransform:"uppercase",
              color:"rgba(201,160,90,0.45)",marginBottom:20,textAlign:"center"}}>
              Tap a phase to begin your selections
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:10}}>
              {PHASES.map((phase,pi)=>{
                const ps=phaseStats(pi,checked);
                const isComplete=ps.done===ps.total;
                const inProgress=ps.done>0&&!isComplete;
                return (
                  <button key={pi} onClick={()=>openPhaseView(pi)} style={{
                    background:C.navy,
                    border:`1px solid ${isComplete?"rgba(74,154,58,0.4)":inProgress?"rgba(201,160,90,0.3)":"rgba(201,160,90,0.1)"}`,
                    cursor:"pointer",padding:"18px",textAlign:"left",
                    position:"relative",overflow:"hidden",transition:"border-color 0.25s",
                  }}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:2,
                      background:isComplete?C.green:inProgress?C.gold:"rgba(201,160,90,0.15)"}}/>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                      <div>
                        <p style={{fontSize:9,letterSpacing:"0.3em",textTransform:"uppercase",
                          color:"rgba(201,160,90,0.5)",margin:"0 0 3px"}}>Phase {phase.label}</p>
                        <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,fontWeight:600,
                          color:C.white,margin:0,lineHeight:1.2}}>{phase.name}</h3>
                      </div>
                      <div style={{position:"relative"}}>
                        <ProgressRing pct={ps.pct} size={42}/>
                        <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                          justifyContent:"center",fontSize:16}}>{phase.icon}</span>
                      </div>
                    </div>
                    <p style={{fontSize:11,color:C.textLight,lineHeight:1.7,margin:"0 0 12px"}}>{phase.description}</p>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,
                        color:isComplete?C.green:inProgress?C.gold:"rgba(201,160,90,0.4)"}}>
                        {isComplete?"Complete ✓":inProgress?`${ps.done} of ${ps.total} done`:`${ps.total} selections`}
                      </span>
                      <span style={{color:C.gold,fontSize:15}}>›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SUMMARY ── */}
        {isSummary && (
          <div style={{maxWidth:720,margin:"0 auto",padding:"24px 16px 48px"}}>
            {PHASES.map((phase,pi)=>{
              const ps=phaseStats(pi,checked);
              const isComplete=ps.done===ps.total;
              const hasSel=phase.tasks.some((_,ti)=>selections[tk(pi,ti)]);
              return (
                <div key={pi} style={{marginBottom:12}}>
                  <button onClick={()=>openPhaseView(pi)} style={{
                    width:"100%",background:C.navy,
                    border:`1px solid ${isComplete?"rgba(74,154,58,0.3)":"rgba(201,160,90,0.15)"}`,
                    display:"flex",alignItems:"center",gap:14,
                    padding:"13px 18px",cursor:"pointer",textAlign:"left",
                  }}>
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:700,minWidth:32,
                      color:isComplete?C.green:ps.done>0?C.gold:"rgba(201,160,90,0.2)"}}>
                      {phase.label}
                    </span>
                    <div style={{flex:1}}>
                      <p style={{fontSize:11,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",
                        color:C.offWhite,margin:"0 0 2px"}}>{phase.icon} {phase.name}</p>
                      <p style={{fontSize:10,margin:0,letterSpacing:"0.08em",
                        color:isComplete?C.green:ps.done>0?C.gold:"rgba(201,160,90,0.35)"}}>
                        {isComplete?"Complete ✓":ps.done>0?`${ps.done} of ${ps.total} complete`:`${ps.total} tasks — not started`}
                      </p>
                    </div>
                    <span style={{fontSize:10,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase"}}>Edit ›</span>
                  </button>
                  {hasSel&&(
                    <div style={{background:"rgba(13,30,74,0.5)",border:"1px solid rgba(201,160,90,0.08)",
                      borderTop:"none",padding:"10px 18px 10px 50px"}}>
                      {phase.tasks.map((task,ti)=>{
                        const sel=selections[tk(pi,ti)];
                        if(!sel) return null;
                        return (
                          <div key={ti} style={{display:"flex",gap:10,marginBottom:5,alignItems:"baseline"}}>
                            <p style={{fontSize:12,color:C.textLight,margin:0,flex:1,lineHeight:1.5}}>{task.text}</p>
                            <span style={{display:"inline-block",padding:"2px 9px",
                              border:`1px solid ${C.gold}`,color:C.gold,
                              fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:600,
                              whiteSpace:"nowrap"}}>{sel}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pending */}
            {(()=>{
              const pending=[];
              PHASES.forEach((phase,pi)=>phase.tasks.forEach((task,ti)=>{
                if(!checked[tk(pi,ti)]) pending.push({phase:phase.name,task:task.text,pi});
              }));
              if(!pending.length) return (
                <div style={{textAlign:"center",padding:"28px 20px",
                  background:"rgba(74,154,58,0.08)",border:"1px solid rgba(74,154,58,0.25)",marginTop:8}}>
                  <p style={{fontSize:26,margin:"0 0 6px"}}>🎉</p>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:C.green,margin:"0 0 6px",fontWeight:600}}>
                    All Selections Complete
                  </p>
                  <p style={{fontSize:12,color:C.textLight,margin:0}}>
                    Your renovation journey is fully mapped. Your Mirmont team has been notified.
                  </p>
                </div>
              );
              return (
                <div style={{marginTop:8,background:C.navy,border:"1px solid rgba(201,160,90,0.15)",padding:"16px 18px"}}>
                  <p style={{fontSize:10,letterSpacing:"0.3em",textTransform:"uppercase",color:C.gold,margin:"0 0 12px",fontWeight:600}}>
                    Pending Decisions ({pending.length})
                  </p>
                  {pending.slice(0,8).map((p,i)=>(
                    <div key={i} onClick={()=>openPhaseView(p.pi)} style={{
                      display:"flex",gap:10,padding:"7px 0",cursor:"pointer",
                      borderBottom:i<Math.min(pending.length,8)-1?"1px solid rgba(201,160,90,0.07)":"none",
                    }}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:"rgba(201,160,90,0.4)",
                        flexShrink:0,marginTop:6}}/>
                      <div>
                        <p style={{fontSize:12,color:C.offWhite,margin:"0 0 1px",lineHeight:1.4}}>{p.task}</p>
                        <p style={{fontSize:10,color:"rgba(201,160,90,0.4)",margin:0,letterSpacing:"0.08em"}}>{p.phase}</p>
                      </div>
                    </div>
                  ))}
                  {pending.length>8&&(
                    <p style={{fontSize:10,color:"rgba(201,160,90,0.4)",margin:"8px 0 0",letterSpacing:"0.1em",textTransform:"uppercase"}}>
                      + {pending.length-8} more pending
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  // ── PHASE DETAIL VIEW ─────────────────────────────────────────
  if(view==="phase"){
    const phase=PHASES[activePhaseIdx];
    const ps=phaseStats(activePhaseIdx,checked);
    return (
      <div style={{minHeight:"100vh",background:C.navyDark,fontFamily:"'Montserrat',sans-serif",color:C.white}}>

        {/* STICKY HEADER */}
        <div style={{background:C.navy,borderBottom:"1px solid rgba(201,160,90,0.15)",
          padding:"16px 16px 12px",position:"sticky",top:0,zIndex:50}}>
          <div style={{maxWidth:720,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <button onClick={()=>setView("journey")} style={{
                background:"none",border:"1px solid rgba(201,160,90,0.2)",
                color:C.gold,cursor:"pointer",padding:"6px 12px",
                fontSize:10,fontFamily:"'Montserrat',sans-serif",
                letterSpacing:"0.12em",textTransform:"uppercase",flexShrink:0,
              }}>← Back</button>
              <div style={{flex:1}}>
                <p style={{fontSize:9,letterSpacing:"0.3em",textTransform:"uppercase",
                  color:"rgba(201,160,90,0.5)",margin:"0 0 2px"}}>Phase {phase.label} of 07</p>
                <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,
                  color:C.white,margin:0}}>{phase.icon} {phase.name}</h2>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <ProgressRing pct={ps.pct} size={40}/>
                <p style={{fontSize:9,color:ps.pct===100?C.green:C.gold,margin:"1px 0 0",letterSpacing:"0.1em"}}>
                  {ps.done}/{ps.total}
                </p>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{flex:1,height:2,background:"rgba(201,160,90,0.15)",borderRadius:1,marginRight:12}}>
                <div style={{height:"100%",width:`${ps.pct}%`,borderRadius:1,
                  background:ps.pct===100?C.green:`linear-gradient(to right,${C.goldDark},${C.goldLight})`,
                  transition:"width 0.4s ease"}}/>
              </div>
              <SyncDot status={syncStatus}/>
            </div>
          </div>
        </div>

        {/* TASKS */}
        <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 100px"}}>
          {phase.tasks.map((task,ti)=>{
            const k=tk(activePhaseIdx,ti);
            const isChecked=!!checked[k];
            const selected=selections[k];
            return (
              <div key={ti} style={{
                background:C.navy,
                border:`1px solid ${isChecked?"rgba(74,154,58,0.22)":"rgba(201,160,90,0.1)"}`,
                marginBottom:8,overflow:"hidden",transition:"border-color 0.2s",
              }}>
                <div onClick={()=>toggleTask(activePhaseIdx,ti)} style={{
                  display:"flex",alignItems:"flex-start",gap:14,
                  padding:"15px 18px",cursor:"pointer",
                }}>
                  <div style={{
                    width:20,height:20,flexShrink:0,marginTop:2,
                    border:`1px solid ${isChecked?C.green:"rgba(201,160,90,0.35)"}`,
                    background:isChecked?C.green:"transparent",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    transition:"all 0.2s",fontSize:11,color:C.navyDark,fontWeight:700,
                  }}>{isChecked?"✓":""}</div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:14,color:isChecked?"rgba(200,192,176,0.35)":C.offWhite,
                      margin:"0 0 2px",lineHeight:1.5,
                      textDecoration:isChecked?"line-through":"none",transition:"all 0.2s"}}>{task.text}</p>
                    <p style={{fontSize:11,color:"rgba(201,160,90,0.45)",fontStyle:"italic",margin:0}}>{task.note}</p>
                    {selected&&(
                      <span style={{display:"inline-block",marginTop:6,padding:"2px 10px",
                        border:`1px solid ${C.gold}`,color:C.gold,
                        fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:600}}>
                        {selected}
                      </span>
                    )}
                  </div>
                </div>
                {task.options&&(
                  <div style={{padding:"0 18px 14px 52px",display:"flex",flexWrap:"wrap",gap:6}}>
                    {task.options.map(opt=>{
                      const isSel=selected===opt;
                      return (
                        <button key={opt}
                          onClick={e=>{e.stopPropagation();setOption(activePhaseIdx,ti,opt);}}
                          style={{
                            background:isSel?"rgba(201,160,90,0.1)":"transparent",
                            border:isSel?`2px solid ${C.gold}`:`1px solid rgba(201,160,90,0.2)`,
                            color:isSel?C.gold:"rgba(200,192,176,0.5)",
                            fontFamily:"'Montserrat',sans-serif",fontSize:10,
                            fontWeight:isSel?700:500,letterSpacing:"0.1em",textTransform:"uppercase",
                            padding:isSel?"5px 12px":"5px 13px",cursor:"pointer",
                            transition:"all 0.15s",whiteSpace:"nowrap",
                          }}>
                          {isSel?"✓  ":""}{opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* BOTTOM NAV */}
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.navyMid,
          borderTop:"1px solid rgba(201,160,90,0.15)",padding:"12px 16px",
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,zIndex:50}}>
          <button onClick={()=>setActivePhaseIdx(i=>Math.max(0,i-1))}
            disabled={activePhaseIdx===0} style={{
              background:"none",border:"1px solid rgba(201,160,90,0.2)",
              color:activePhaseIdx===0?"rgba(201,160,90,0.25)":C.gold,
              fontFamily:"'Montserrat',sans-serif",fontSize:10,fontWeight:600,
              letterSpacing:"0.15em",textTransform:"uppercase",
              padding:"10px 16px",cursor:activePhaseIdx===0?"default":"pointer",flex:1,
            }}>← Prev</button>

          <span style={{fontSize:9,letterSpacing:"0.2em",color:"rgba(201,160,90,0.5)",textTransform:"uppercase",textAlign:"center"}}>
            {activePhaseIdx+1} / {PHASES.length}
          </span>

          {activePhaseIdx<PHASES.length-1?(
            <button onClick={()=>setActivePhaseIdx(i=>i+1)} style={{
              background:C.gold,border:"none",color:C.navyDark,
              fontFamily:"'Montserrat',sans-serif",fontSize:10,fontWeight:700,
              letterSpacing:"0.15em",textTransform:"uppercase",
              padding:"10px 16px",cursor:"pointer",flex:1,
            }}>Next Phase →</button>
          ):(
            <button onClick={()=>setView("summary")} style={{
              background:C.green,border:"none",color:C.white,
              fontFamily:"'Montserrat',sans-serif",fontSize:10,fontWeight:700,
              letterSpacing:"0.15em",textTransform:"uppercase",
              padding:"10px 16px",cursor:"pointer",flex:1,
            }}>View Summary →</button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

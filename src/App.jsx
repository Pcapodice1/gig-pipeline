import { useState, useEffect, useRef } from "react";

// In a normal browser there's no Claude artifact storage — back window.storage with localStorage.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (k) => { const v = localStorage.getItem(k); return v == null ? null : { value: v }; },
    set: async (k, val) => { localStorage.setItem(k, val); return { value: val }; },
    delete: async (k) => { localStorage.removeItem(k); return { deleted: true }; },
  };
}

// ---------- Fit-scoring "brain" ----------
const TYPE_WEIGHTS = {
  "Winery / Tasting Room": 85,
  "Art Gallery": 88,
  "Museum": 84,
  "Boutique Hotel": 80,
  "Fine Dining": 78,
  "Country Club": 76,
  "Botanical Garden": 82,
  "Library / Concert Series": 80,
  "Church / Concert Series": 81,
  "Retirement Community": 72,
  "Wedding / Event Planner": 86,
  "Funeral Home": 70,
  "Corporate Event": 74,
  "Coffee House": 55,
  "Brewery / Taproom": 50,
  "Bar / Pub": 35,
};

const TYPES = Object.keys(TYPE_WEIGHTS);

function computeFit(lead) {
  let score = TYPE_WEIGHTS[lead.type] ?? 60;
  const reasons = [];
  reasons.push(`${lead.type} is a ${score >= 80 ? "strong" : score >= 65 ? "solid" : "modest"} fit for solo classical`);

  if (lead.hostsLive) { score += 8; reasons.push("already hosts live acoustic music"); }
  if (lead.budget === "high") { score += 6; reasons.push("upscale — budget for paid talent"); }
  else if (lead.budget === "low") { score -= 6; reasons.push("tighter budget signals"); }

  const d = Number(lead.distanceMi);
  if (!isNaN(d)) {
    if (d <= 15) { score += 5; reasons.push(`close by (${d} mi)`); }
    else if (d > 40) { score -= 6; reasons.push(`a haul (${d} mi)`); }
  }
  if (lead.loud) { score -= 12; reasons.push("noisy room — classical can get lost"); }

  score = Math.max(5, Math.min(100, Math.round(score)));
  return { score, why: reasons.slice(0, 2).join(" · ") };
}

// ---------- Seed leads (real venues near La Grange, IL) ----------
const SEED = [
  { id: 1, name: "Mayslake Peabody Estate", type: "Museum", distanceMi: 2.4, budget: "mid", hostsLive: true, loud: false, contact: "630-206-9566", notes: "Historic Tudor estate in Oak Brook with a performing-arts theater and gallery — hosts concerts, weddings & receptions.", status: "New" },
  { id: 2, name: "Eddie V's Prime Seafood", type: "Fine Dining", distanceMi: 3.3, budget: "high", hostsLive: true, loud: false, contact: "630-371-0002", notes: "Upscale Oak Brook seafood/steak that already books live jazz nightly — a natural fit for solo classical.", status: "New" },
  { id: 3, name: "The Morton Arboretum", type: "Botanical Garden", distanceMi: 5.0, budget: "mid", hostsLive: true, loud: false, contact: "630-968-0074", notes: "1,700-acre botanical garden in Lisle; runs seasonal music programming and private events.", status: "New" },
  { id: 4, name: "Hinsdale Golf Club", type: "Country Club", distanceMi: 1.2, budget: "high", hostsLive: false, loud: false, contact: "630-986-5330", notes: "Clarendon Hills club hosting weddings and private events — minutes from La Grange.", status: "New" },
  { id: 5, name: "Ruth Lake Country Club", type: "Country Club", distanceMi: 2.2, budget: "high", hostsLive: false, loud: false, contact: "630-986-2060", notes: "Private Hinsdale club; weddings, galas and holiday parties.", status: "New" },
  { id: 6, name: "Acquisitions of Fine Art", type: "Art Gallery", distanceMi: 2.4, budget: "mid", hostsLive: false, loud: false, contact: "630-908-7227", notes: "Downtown Hinsdale gallery with opening receptions and photoshoot meetups.", status: "New" },
  { id: 7, name: "Hinsdale Prime Steak", type: "Fine Dining", distanceMi: 2.5, budget: "high", hostsLive: false, loud: false, contact: "630-819-6179", notes: "High-end Hinsdale steakhouse with a quiet, romantic dining room.", status: "New" },
  { id: 8, name: "Cellar Door", type: "Winery / Tasting Room", distanceMi: 1.8, budget: "mid", hostsLive: false, loud: false, contact: "630-241-2030", notes: "Cozy Downers Grove wine bar & bottle shop; intimate evenings, outdoor seating.", status: "New" },
  { id: 9, name: "Cooper's Hawk Winery & Restaurant", type: "Winery / Tasting Room", distanceMi: 3.8, budget: "mid", hostsLive: false, loud: false, contact: "331-215-9463", notes: "Winery + restaurant in Downers Grove with private event spaces.", status: "New" },
  { id: 10, name: "Pella Signature", type: "Fine Dining", distanceMi: 4.4, budget: "high", hostsLive: true, loud: false, contact: "630-686-8621", notes: "Burr Ridge Mediterranean wine bar that hosts weddings and live music in its Wine Room.", status: "New" },
  { id: 11, name: "Cordia Senior Residence", type: "Retirement Community", distanceMi: 1.5, budget: "mid", hostsLive: true, loud: false, contact: "630-887-7000", notes: "Senior residence right in Westmont with active, creative resident programming.", status: "New" },
  { id: 12, name: "Hyatt Lodge Oak Brook", type: "Boutique Hotel", distanceMi: 3.2, budget: "high", hostsLive: true, loud: false, contact: "630-568-1234", notes: "Grand resort-style hotel in Oak Brook with a lounge and seasonal pop-up events.", status: "New" },
  { id: 13, name: "The Drake Oak Brook, Autograph Collection", type: "Boutique Hotel", distanceMi: 4.2, budget: "high", hostsLive: false, loud: false, contact: "630-571-0000", notes: "Autograph Collection hotel; lobby lounge and event spaces.", status: "New" },
  { id: 14, name: "Lynfred Winery", type: "Winery / Tasting Room", distanceMi: 14, budget: "mid", hostsLive: true, loud: false, contact: "630-529-9463", notes: "Roselle tasting room with warm wood tones and regular live music — a longer drive, but a strong fit.", status: "New" },

  // --- Wedding & event planners / venues (decision-makers who book talent) ---
  { id: 15, name: "Effortless Events", type: "Wedding / Event Planner", distanceMi: 12, budget: "mid", hostsLive: false, loud: false, contact: "630-416-5056", notes: "Full-service Naperville wedding & event planning team — a referral source that books musicians for ceremonies and receptions.", status: "New" },
  { id: 16, name: "Plan Bea Events", type: "Wedding / Event Planner", distanceMi: 11, budget: "mid", hostsLive: false, loud: false, contact: "630-440-5580", notes: "Bolingbrook wedding planner & day-of coordinator handling ceremonies, cocktail hours and receptions.", status: "New" },
  { id: 17, name: "Danada House", type: "Wedding / Event Planner", distanceMi: 10, budget: "high", hostsLive: false, loud: false, contact: "630-668-5392", notes: "Historic Wheaton mansion & gardens with a glass atrium — a popular wedding & reception venue.", status: "New" },
  { id: 18, name: "The Crawford", type: "Wedding / Event Planner", distanceMi: 11, budget: "high", hostsLive: false, loud: false, contact: "630-242-8411", notes: "Modernized Naperville wedding & event venue with multiple rooms for ceremonies and cocktail hours.", status: "New" },

  // --- Wineries / tasting rooms ---
  { id: 19, name: "Barrel & Heritage", type: "Winery / Tasting Room", distanceMi: 12, budget: "mid", hostsLive: true, loud: false, contact: "630-420-9463", notes: "Cellar wine bar in downtown Naperville with cozy seating and live music in the rotation.", status: "New" },
  { id: 20, name: "ko-ze wine room", type: "Winery / Tasting Room", distanceMi: 8, budget: "mid", hostsLive: false, loud: false, contact: "630-474-0211", notes: "Charming Glen Ellyn wine room with a private back room for showers, birthdays and engagement parties.", status: "New" },
  { id: 21, name: "Tasting deVine", type: "Winery / Tasting Room", distanceMi: 11, budget: "mid", hostsLive: false, loud: false, contact: "630-752-9463", notes: "Downtown Wheaton winery & tasting room with a cozy vibe, wine club and member events.", status: "New" },
  { id: 22, name: "SixtyFour - Reserve Room", type: "Winery / Tasting Room", distanceMi: 12, budget: "high", hostsLive: false, loud: false, contact: "331-472-4767", notes: "Private wine-bar event room in downtown Naperville for showers, rehearsal dinners and business dinners.", status: "New" },
  { id: 23, name: "Geneva Winery & Tasting Room", type: "Winery / Tasting Room", distanceMi: 24, budget: "mid", hostsLive: true, loud: false, contact: "630-402-0739", notes: "Downtown Geneva winery with an outdoor courtyard and regular weekend live acoustic music — a longer drive.", status: "New" },

  // --- Art galleries ---
  { id: 24, name: "Naperville Art League", type: "Art Gallery", distanceMi: 12, budget: "mid", hostsLive: false, loud: false, contact: "630-355-2530", notes: "Naperville gallery & art center with member shows and opening receptions, plus the summer Riverwalk exhibition.", status: "New" },
  { id: 25, name: "DuPage Art League", type: "Art Gallery", distanceMi: 11, budget: "mid", hostsLive: false, loud: false, contact: "630-653-7090", notes: "Longtime downtown Wheaton gallery & school with a welcoming members' gallery and rotating shows.", status: "New" },
  { id: 26, name: "indie art park", type: "Art Gallery", distanceMi: 12, budget: "mid", hostsLive: false, loud: false, contact: "773-717-2432", notes: "Warrenville gallery featuring local artists with a rentable room for events.", status: "New" },

  // --- Boutique hotels ---
  { id: 27, name: "Hotel Arista", type: "Boutique Hotel", distanceMi: 11, budget: "high", hostsLive: false, loud: false, contact: "630-579-4100", notes: "Sleek boutique hotel in Naperville's CityGate with a lounge, spa and wedding/event spaces.", status: "New" },
  { id: 28, name: "Hotel Indigo Naperville Riverwalk", type: "Boutique Hotel", distanceMi: 12, budget: "high", hostsLive: false, loud: false, contact: "630-778-9676", notes: "Boutique riverfront hotel downtown with a warm lobby lounge/bar and event spaces.", status: "New" },

  // --- Fine dining / ambiance ---
  { id: 29, name: "Adelle's Modern Kitchen + Bar", type: "Fine Dining", distanceMi: 11, budget: "high", hostsLive: false, loud: false, contact: "630-784-8015", notes: "Warm, upscale Wheaton kitchen & wine bar with a private banquet room that hosts weddings and dinners.", status: "New" },
  { id: 30, name: "Entourage Naperville", type: "Fine Dining", distanceMi: 13, budget: "high", hostsLive: false, loud: false, contact: "630-999-8980", notes: "Stylish upscale-comfort restaurant on Rt 59 with ambient lighting — good for date nights and business dinners.", status: "New" },
  { id: 31, name: "Davanti Enoteca", type: "Fine Dining", distanceMi: 12, budget: "mid", hostsLive: false, loud: false, contact: "630-328-0280", notes: "Italian enoteca in downtown Naperville with a relaxed, lingering-friendly wine-bar atmosphere.", status: "New" },
  { id: 32, name: "Atwater's Restaurant", type: "Fine Dining", distanceMi: 24, budget: "high", hostsLive: false, loud: false, contact: "630-208-8920", notes: "Intimate fine-dining room in Geneva with garden/river views — a quiet, elegant setting (a haul west).", status: "New" },
  { id: 33, name: "Eddie Merlot's", type: "Fine Dining", distanceMi: 12, budget: "high", hostsLive: false, loud: false, contact: "630-393-1900", notes: "Upscale Warrenville steakhouse with a warm, special-occasion atmosphere and private dining.", status: "New" },

  // --- Retirement communities ---
  { id: 34, name: "Monarch Landing", type: "Retirement Community", distanceMi: 11, budget: "mid", hostsLive: true, loud: false, contact: "630-557-8684", notes: "Large independent-living community in Naperville with active resident programming and live entertainment.", status: "New" },
  { id: 35, name: "Wyndemere", type: "Retirement Community", distanceMi: 11, budget: "high", hostsLive: true, loud: false, contact: "630-882-2468", notes: "Upscale Wheaton senior community with a refined dining room and regular resident events.", status: "New" },
  { id: 36, name: "Brookdale Glen Ellyn", type: "Retirement Community", distanceMi: 8, budget: "mid", hostsLive: true, loud: false, contact: "630-446-1600", notes: "Glen Ellyn senior community with a resident choir, library and a steady entertainment calendar.", status: "New" },

  // --- Funeral homes ---
  { id: 37, name: "Friedrich-Jones Funeral Home", type: "Funeral Home", distanceMi: 12, budget: "mid", hostsLive: false, loud: false, contact: "630-355-0213", notes: "Established Naperville funeral home that builds personalized celebrations of life and memorial services.", status: "New" },
  { id: 38, name: "Hultgren Funeral Home", type: "Funeral Home", distanceMi: 11, budget: "mid", hostsLive: false, loud: false, contact: "630-668-0027", notes: "Wheaton funeral home known for thoughtful celebrations of life and memorial services.", status: "New" },

  // --- Museums ---
  { id: 39, name: "Cleve Carney Museum of Art", type: "Museum", distanceMi: 8, budget: "mid", hostsLive: false, loud: false, contact: "630-942-2321", notes: "Art museum at College of DuPage (Glen Ellyn) with strong programming and free public exhibitions.", status: "New" },
  { id: 40, name: "DuPage County Historical Museum", type: "Museum", distanceMi: 11, budget: "mid", hostsLive: false, loud: false, contact: "630-510-4941", notes: "Wheaton history museum in a historic former library that also hosts private events.", status: "New" },

  // --- Botanical garden / estate ---
  { id: 41, name: "Cantigny Park", type: "Botanical Garden", distanceMi: 11, budget: "high", hostsLive: true, loud: false, contact: "630-668-5161", notes: "McCormick estate in Wheaton — gardens, mansion and museums with seasonal music programming and weddings.", status: "New" },

  // --- Churches with concert/music traditions ---
  { id: 42, name: "Grace United Methodist Church", type: "Church / Concert Series", distanceMi: 12, budget: "mid", hostsLive: true, loud: false, contact: "630-355-1748", notes: "Naperville church with a notable pipe organ and a track record of hosting concert events.", status: "New" },
  { id: 43, name: "College Church", type: "Church / Concert Series", distanceMi: 11, budget: "mid", hostsLive: true, loud: false, contact: "630-668-0878", notes: "Wheaton College–area church with choir, pipe organ and a strong music tradition.", status: "New" },

  // --- Libraries with concert series ---
  { id: 44, name: "Wheaton Public Library", type: "Library / Concert Series", distanceMi: 11, budget: "low", hostsLive: false, loud: false, contact: "630-668-1374", notes: "Busy Wheaton library that runs author events and community programming (modest, grant-style budgets).", status: "New" },
  { id: 45, name: "Naperville Public Library (Nichols)", type: "Library / Concert Series", distanceMi: 12, budget: "mid", hostsLive: false, loud: false, contact: "630-961-4100", notes: "Downtown Naperville library with active all-ages programming and event spaces.", status: "New" },
];

const STATUSES = ["New", "Contacted", "Booked", "Passed"];
const STATUS_NEXT = { New: "Contacted", Contacted: "Booked", Booked: "Passed", Passed: "New" };
const STATUS_COLOR = { New: "var(--ink-soft)", Contacted: "var(--amber)", Booked: "var(--sage)", Passed: "var(--wine)" };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400&family=Inter:wght@400;500;600&display=swap');
:root{
  --rosewood:#2A1C17; --rosewood2:#3A271F; --spruce:#F4E9D2; --spruce2:#EADBBE;
  --brass:#C29A4E; --brass-deep:#9A7836; --ink:#2A211B; --ink-soft:#7A6753;
  --sage:#6E7E5B; --amber:#C2832F; --wine:#8A4036; --line:rgba(42,33,27,.12);
}
*{box-sizing:border-box}
.gp-root{min-height:100vh;background:
  radial-gradient(120% 80% at 50% -10%, #443025 0%, var(--rosewood) 55%, #1F140F 100%);
  font-family:Inter,system-ui,sans-serif;color:var(--spruce);padding:28px 18px 60px}
.gp-wrap{max-width:780px;margin:0 auto}
.gp-eyebrow{font-family:Inter;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--brass);font-weight:600}
.gp-name{font-family:Fraunces;font-weight:600;font-size:clamp(30px,7vw,46px);line-height:1.02;margin:4px 0 2px;color:var(--spruce);
  border:none;background:transparent;cursor:text;padding:2px 0;border-bottom:1px dashed transparent;transition:border-color .2s}
.gp-name:hover{border-bottom-color:rgba(194,154,78,.5)}
.gp-name:focus{outline:none;border-bottom-color:var(--brass)}
.gp-sub{color:rgba(244,233,210,.6);font-size:14px}
.gp-stats{display:flex;gap:0;margin:20px 0 8px;border:1px solid rgba(194,154,78,.28);border-radius:12px;overflow:hidden;background:rgba(58,39,31,.4)}
.gp-stat{flex:1;padding:12px 10px;text-align:center;border-right:1px solid rgba(194,154,78,.18)}
.gp-stat:last-child{border-right:none}
.gp-stat b{font-family:Fraunces;font-size:24px;color:var(--brass);display:block;line-height:1}
.gp-stat span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(244,233,210,.55)}
.gp-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 14px}
.gp-tab{font-size:13px;padding:6px 14px;border-radius:999px;border:1px solid rgba(194,154,78,.3);background:transparent;color:rgba(244,233,210,.7);cursor:pointer;font-family:Inter}
.gp-tab.active{background:var(--brass);color:var(--rosewood);border-color:var(--brass);font-weight:600}
.gp-add-btn{margin-left:auto;font-size:13px;padding:6px 14px;border-radius:999px;border:1px solid var(--brass);background:transparent;color:var(--brass);cursor:pointer;font-weight:600}
.gp-profile-btn{margin-left:auto;font-size:13px;padding:6px 14px;border-radius:999px;border:1px solid rgba(194,154,78,.55);background:transparent;color:rgba(244,233,210,.85);cursor:pointer;font-weight:600}
.gp-form-hint{font-size:12px;color:rgba(244,233,210,.6);margin:-4px 0 14px;line-height:1.4}
.gp-form textarea{padding:8px 10px;border-radius:8px;border:1px solid rgba(194,154,78,.3);background:rgba(244,233,210,.06);color:var(--spruce);font-family:Inter;font-size:13px;min-height:58px;resize:vertical;line-height:1.45}
.gp-card{background:linear-gradient(180deg,var(--spruce) 0%,var(--spruce2) 100%);color:var(--ink);border-radius:14px;padding:18px;margin-bottom:14px;
  box-shadow:0 8px 24px rgba(0,0,0,.28);display:flex;gap:16px;align-items:flex-start;animation:rise .4s ease both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.gp-card.dim{opacity:.62}
.gp-rosette{flex:0 0 76px;width:76px;height:76px;position:relative}
.gp-rosette .num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Fraunces;font-weight:600;font-size:22px;color:var(--brass-deep)}
.gp-body{flex:1;min-width:0}
.gp-vname{font-family:Fraunces;font-size:20px;font-weight:600;line-height:1.1;margin:0}
.gp-type{font-size:12px;letter-spacing:.04em;color:var(--ink-soft);text-transform:uppercase;margin:3px 0 8px}
.gp-why{font-size:13px;color:var(--ink);background:rgba(194,154,78,.16);border-left:3px solid var(--brass);padding:6px 10px;border-radius:6px;margin-bottom:10px}
.gp-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink-soft);margin-bottom:6px}
.gp-notes{font-size:13px;color:var(--ink);opacity:.85;margin:0 0 12px}
.gp-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.gp-pitch-btn{font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;border:none;background:var(--rosewood);color:var(--spruce);cursor:pointer}
.gp-pitch-btn:hover{background:var(--rosewood2)}
.gp-status-btn{font-size:12px;font-weight:600;padding:7px 12px;border-radius:8px;border:1.5px solid;background:transparent;cursor:pointer}
.gp-find-btn{font-size:12px;font-weight:600;padding:7px 12px;border-radius:8px;border:1.5px solid var(--brass-deep);background:transparent;color:var(--brass-deep);cursor:pointer}
.gp-find-btn:hover{background:rgba(194,154,78,.12)}
.gp-find-btn:disabled{opacity:.65;cursor:default}
.gp-spin-dark{display:inline-block;width:13px;height:13px;border:2px solid rgba(154,120,54,.3);border-top-color:var(--brass-deep);border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px;margin-right:6px}
.gp-contact{display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;margin:0 0 12px;font-size:13px;padding:8px 11px;background:rgba(110,126,91,.08);border:1px solid rgba(110,126,91,.22);border-radius:9px}
.gp-email{color:var(--brass-deep);font-weight:600;text-decoration:none;border-bottom:1px solid rgba(154,120,54,.45)}
.gp-noemail{color:var(--ink-soft);font-style:italic}
.gp-contact-name{color:var(--ink)}
.gp-conf{font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:999px;font-weight:700}
.gp-conf-high{background:rgba(110,126,91,.22);color:#4f5d40}
.gp-conf-medium{background:rgba(194,131,47,.2);color:#8a5d1f}
.gp-conf-low{background:rgba(138,64,54,.18);color:var(--wine)}
.gp-src{color:var(--ink-soft);font-size:12px;text-decoration:underline}
.gp-mini-link{display:inline-block;text-decoration:none;line-height:normal}
.gp-drawer{margin-top:14px;border-top:1px dashed var(--line);padding-top:14px}
.gp-ta{width:100%;min-height:150px;border:1px solid var(--line);border-radius:10px;padding:12px;font-family:Inter;font-size:14px;line-height:1.5;color:var(--ink);background:#fffdf7;resize:vertical}
.gp-subj-label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:5px}
.gp-subj{width:100%;border:1px solid var(--line);border-radius:9px;padding:10px 12px;margin-bottom:10px;font-family:Fraunces,serif;font-size:15px;font-weight:600;color:var(--ink);background:#fffdf7}
.gp-subj:focus{outline:none;border-color:var(--brass)}
.gp-drawer-actions{display:flex;gap:8px;margin-top:8px}
.gp-mini{font-size:12px;font-weight:600;padding:6px 12px;border-radius:7px;border:1px solid var(--brass-deep);background:transparent;color:var(--brass-deep);cursor:pointer}
.gp-spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(244,233,210,.4);border-top-color:var(--spruce);border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes sp{to{transform:rotate(360deg)}}
.gp-form{background:rgba(58,39,31,.55);border:1px solid rgba(194,154,78,.3);border-radius:14px;padding:18px;margin-bottom:18px}
.gp-form h3{font-family:Fraunces;margin:0 0 12px;color:var(--brass)}
.gp-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.gp-field{flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px}
.gp-field label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(244,233,210,.6)}
.gp-field input,.gp-field select{padding:8px 10px;border-radius:8px;border:1px solid rgba(194,154,78,.3);background:rgba(244,233,210,.06);color:var(--spruce);font-family:Inter;font-size:13px}
.gp-check{display:flex;align-items:center;gap:6px;font-size:13px;color:rgba(244,233,210,.85)}
.gp-foot{text-align:center;margin-top:24px;font-size:12px;color:rgba(244,233,210,.45)}
.gp-foot button{background:none;border:none;color:rgba(194,154,78,.7);cursor:pointer;text-decoration:underline;font-size:12px}
.gp-more{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin:6px 0 4px}
.gp-more-count{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:rgba(244,233,210,.5)}
.gp-more-btn{font-size:13px;font-weight:600;padding:8px 18px;border-radius:999px;border:1px solid var(--brass);background:transparent;color:var(--brass);cursor:pointer}
.gp-more-btn:hover{background:rgba(194,154,78,.12)}
.gp-more-all{background:none;border:none;color:rgba(244,233,210,.55);cursor:pointer;text-decoration:underline;font-size:12px}
`;

function Rosette({ score }) {
  const r = 30, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return (
    <div className="gp-rosette" aria-label={`Fit score ${score} of 100`}>
      <svg viewBox="0 0 76 76" width="76" height="76">
        <circle cx="38" cy="38" r="34" fill="none" stroke="rgba(154,120,54,.18)" strokeWidth="2" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(154,120,54,.22)" strokeWidth="8" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="#C29A4E" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 38 38)"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }} />
        <circle cx="38" cy="38" r="17" fill="none" stroke="rgba(154,120,54,.3)" strokeWidth="1" />
      </svg>
      <div className="num">{score}</div>
    </div>
  );
}

const DEFAULT_PROFILE = {
  tagline: "Seasoned classical guitarist bringing high-level musicianship to concerts, events, and intimate rooms",
  style: "Classical guitar at its core — precise, expressive, and nuanced — with fluency across many styles and the adaptability to move between genres when the moment calls for it",
  experience: "Playing since age 12, with decades on university stages, Chicago-area concert series, libraries, and senior living communities. Currently performs with Ten Strings; has played with the Avanti Guitar Trio — praised for its \"pristine technique and sensitive interpretation\" — and The Ondas Ensemble",
  formats: "Solo classical programs and ensemble work; equally at home with formal concert sets and refined background music for ceremonies, receptions, and small rooms",
  setup: "Performs on a Kenny Hill classical guitar known for its craftsmanship and tonal clarity; a refined, self-contained, low-footprint solo setup",
  edge: "High-level musicianship made accessible and human — rooted in connecting with the audience and honoring the guitar's tradition while keeping it alive and relevant in any setting",
  website: "jasonderoche.com",
  sample: "",
  base: "La Grange, IL",
  availability: "",
  rate: "",
};

// Robust copy: clipboard API when allowed, legacy execCommand fallback for sandboxed iframes.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* blocked in iframe — fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

// Normalize a stored pitch: legacy string -> {subject, body}; object passes through.
function asPitch(p) {
  if (!p) return { subject: "", body: "" };
  if (typeof p === "string") return { subject: "", body: p };
  return { subject: p.subject || "", body: p.body || "" };
}

// Pull a JSON object out of a model reply that may include prose or code fences.
function extractJSON(text) {
  if (!text) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let t = text.trim();
  let r = tryParse(t);
  if (r) return r;
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  r = tryParse(t);
  if (r) return r;
  const first = t.indexOf("{"), last = t.lastIndexOf("}");
  if (first !== -1 && last > first) return tryParse(t.slice(first, last + 1));
  return null;
}

export default function App() {
  const [name, setName] = useState("Jason Deroche");
  const [leads, setLeads] = useState(SEED);
  const [filter, setFilter] = useState("Active");
  const [openId, setOpenId] = useState(null);
  const [pitches, setPitches] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [findingId, setFindingId] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [form, setForm] = useState({ name: "", type: TYPES[0], distanceMi: "", budget: "mid", hostsLive: false, loud: false, contact: "", notes: "" });

  // hydrate
  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get("gigpipeline:v5");
        if (s && s.value) {
          const data = JSON.parse(s.value);
          if (data.name) setName(data.name);
          if (Array.isArray(data.leads)) setLeads(data.leads);
          if (data.pitches) setPitches(data.pitches);
          if (data.profile) setProfile((pr) => ({ ...pr, ...data.profile }));
        }
      } catch (e) { /* first run, no saved state */ }
      setHydrated(true);
    })();
  }, []);

  // persist
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try { await window.storage.set("gigpipeline:v5", JSON.stringify({ name, leads, pitches, profile })); }
      catch (e) { /* storage unavailable */ }
    })();
  }, [name, leads, pitches, profile, hydrated]);

  const scored = leads.map((l) => ({ ...l, ...computeFit(l) }));
  const rank = { New: 0, Contacted: 1, Booked: 2, Passed: 3 };
  const visible = scored
    .filter((l) => filter === "Active" ? (l.status === "New" || l.status === "Contacted") : filter === "All" ? true : l.status === filter)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (b.score - a.score));
  const shown = visible.slice(0, visibleCount);

  const stats = {
    total: leads.length,
    contacted: leads.filter((l) => l.status === "Contacted").length,
    booked: leads.filter((l) => l.status === "Booked").length,
  };

  function cycleStatus(id) {
    setLeads((ls) => ls.map((l) => l.id === id ? { ...l, status: STATUS_NEXT[l.status] } : l));
  }

  async function draftPitch(lead) {
    setOpenId(lead.id);
    setLoadingId(lead.id);
    const profileLines = [
      profile.tagline && `- Tagline: ${profile.tagline}`,
      profile.style && `- Style & repertoire: ${profile.style}`,
      profile.experience && `- Experience: ${profile.experience}`,
      profile.formats && `- Formats offered: ${profile.formats}`,
      profile.setup && `- Setup & logistics: ${profile.setup}`,
      profile.edge && `- What sets him apart: ${profile.edge}`,
      profile.base && `- Based in: ${profile.base}`,
      profile.availability && `- Availability: ${profile.availability}`,
      profile.rate && `- Rate guidance: ${profile.rate}`,
      profile.website && `- Website (he can share, don't paste the raw URL): ${profile.website}`,
      profile.sample && `- Sample to offer (audio/video): ${profile.sample}`,
    ].filter(Boolean).join("\n");

    // Rotate structure, credibility anchor, and CTA so no two sends share a skeleton.
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const opening = pick([
      "HOOK-FIRST — open with a vivid, specific image or observation about their space, atmosphere, or the events they host.",
      "VALUE-FIRST — open with the concrete value live solo classical guitar adds to an event like theirs, then introduce himself in a line.",
      "DIRECT-OFFER — open with a warm, direct offer to provide live music for a specific occasion they host, then back it up.",
    ]);
    const anchor = pick([
      "his current ensemble work with Ten Strings",
      "his years performing across Chicago-area concert series",
      "his performances in libraries and senior living communities",
      "his work with the Avanti Guitar Trio — if you use the praise \"pristine technique and sensitive interpretation,\" attribute it to how the trio was received, NEVER as a self-description",
      "his performances on university stages",
      "the warm, clear tone of his Kenny Hill classical guitar",
    ]);
    const cta = pick([
      "Reply \"sample\" and I'll send a 2-minute video.",
      "Want me to send a 60-second clip so you can hear the fit?",
      "Happy to send a short video this week — just say the word.",
      "I can pencil in a tentative date while you decide — want me to?",
    ]);

    const prompt = `You are helping ${name}, a classical guitarist seeking paid private and event gigs, write a short cold outreach email to a specific venue or booker.

ABOUT ${name} — real, usable facts. Pull only what fits THIS venue; never dump the list:
${profileLines || "(no extra profile details provided yet)"}

TARGET:
- Name: ${lead.name}
- Type: ${lead.type}
- Notes: ${lead.notes || "n/a"}

NON-NEGOTIABLE RULES:
1. CLOSER: End on exactly ONE low-effort, concrete call to action. Use this, adapted to read naturally: "${cta}". Decisive, not pushy. Ban apology energy — no "no pressure," no "just wanted to introduce myself," no "just hoping to start a conversation."
2. LOGISTICS: Include exactly ONE concrete logistics line that proves he's easy to say yes to — real specifics, not atmosphere. Model: "I bring my own gear, need only a stool and a quiet corner, and set up in about 15 minutes." Tune it to this venue.
3. CREDIBILITY: Use exactly ONE specific, checkable credibility anchor — ${anchor}. One only; do not stack credentials, and never sound self-congratulatory.
4. OPENING: Structure the opening as ${opening} Vary real sentence structure, not just the venue noun.
5. SUBJECT LINE: Write one, ~6 words, specific and concrete. No "Inquiry," no "Hello," no clickbait.

STYLE: warm, concise, professional; body about 110-150 words; specific to a ${lead.type.toLowerCase()}; genuine and human, never templated; never open with "I hope this email finds you well." If a website or sample exists, offer to send/share it rather than pasting a raw URL. Sign the body as ${name}.

Return ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{"subject": "the subject line", "body": "the full email body with line breaks as \\n"}`;
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      let result;
      try {
        const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        result = { subject: (parsed.subject || "").trim(), body: (parsed.body || raw).trim() };
      } catch (parseErr) {
        result = { subject: "", body: raw || "Couldn't draft a pitch this time — try again." };
      }
      setPitches((p) => ({ ...p, [lead.id]: result }));
    } catch (e) {
      setPitches((p) => ({ ...p, [lead.id]: { subject: "", body: "Something went wrong reaching the writer. Check the connection and try again." } }));
    } finally {
      setLoadingId(null);
    }
  }

  async function findContact(lead) {
    setFindingId(lead.id);
    const prompt = `You are a research assistant finding the correct booking/events contact for a specific business, so a performer can reach a decision-maker instead of a general phone line.

Business: ${lead.name}
Type: ${lead.type}
Context: ${lead.notes || "n/a"} (located in the La Grange / DuPage County, Illinois area)
Known phone: ${lead.contact || "n/a"}

Search the web for THIS exact business and find the best email to reach about booking live music, private events, weddings, or programming. Prefer a direct events / booking / catering email or a named contact (events manager, catering director, activities or life-enrichment director for senior communities, gallery director, etc.) over a generic info@ — but a verified info@ or a contact-form page beats nothing. Match the exact business and location; avoid same-named businesses elsewhere. Do not invent an email — if you can't verify one, return it empty.

Keep any text before the JSON to one short sentence. Then respond with ONLY this JSON object (no markdown):
{"email":"","name":"","title":"","source":"","confidence":"high|medium|low","note":"short note, e.g. 'use contact form' or which page this came from"}
Use empty strings where unknown. Confidence = how sure you are this is the right business and a usable contact.`;
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const f = extractJSON(text) || {};
      setLeads((ls) => ls.map((l) => l.id === lead.id ? {
        ...l,
        bookingEmail: (f.email || "").trim(),
        bookingName: (f.name || "").trim(),
        bookingTitle: (f.title || "").trim(),
        bookingSource: (f.source || "").trim(),
        bookingConfidence: (f.confidence || "").trim().toLowerCase(),
        bookingNote: (f.note || "").trim(),
        bookingSearched: true,
      } : l));
    } catch (e) {
      setLeads((ls) => ls.map((l) => l.id === lead.id ? { ...l, bookingSearched: true, bookingNote: "Search failed — check the connection and retry." } : l));
    } finally {
      setFindingId(null);
    }
  }

  function openEmail(lead, pp) {
    const url = `mailto:${lead.bookingEmail}?subject=${encodeURIComponent(pp.subject || "")}&body=${encodeURIComponent(pp.body || "")}`;
    try {
      const w = window.open(url, "_blank");
      if (w) return;
    } catch (e) { /* popup blocked — fall through to copy */ }
    // Fallback: copy a paste-ready block (incl. the To: line) so he can drop it into any mail client.
    copyToClipboard(`To: ${lead.bookingEmail}\nSubject: ${pp.subject || ""}\n\n${pp.body || ""}`).then((ok) => {
      if (ok) { setCopiedId(lead.id); setTimeout(() => setCopiedId((c) => (c === lead.id ? null : c)), 1800); }
    });
  }

  function addLead() {
    if (!form.name.trim()) return;
    const id = Math.max(0, ...leads.map((l) => l.id)) + 1;
    setLeads((ls) => [...ls, { ...form, id, status: "New" }]);
    setForm({ name: "", type: TYPES[0], distanceMi: "", budget: "mid", hostsLive: false, loud: false, contact: "", notes: "" });
    setShowForm(false);
    setFilter("Active");
  }

  async function resetAll() {
    setLeads(SEED); setPitches({}); setName("Jason Deroche"); setProfile(DEFAULT_PROFILE);
    try { await window.storage.delete("gigpipeline:v5"); } catch (e) {}
  }

  return (
    <div className="gp-root">
      <style>{CSS}</style>
      <div className="gp-wrap">
        <div className="gp-eyebrow">Gig Pipeline</div>
        <input className="gp-name" value={name} onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()} aria-label="Your name (click to edit)" />
        <div className="gp-sub">Classical guitar · paid gigs near La Grange, IL · tap your name above to edit</div>

        <div className="gp-stats">
          <div className="gp-stat"><b>{stats.total}</b><span>Leads</span></div>
          <div className="gp-stat"><b>{stats.contacted}</b><span>Contacted</span></div>
          <div className="gp-stat"><b>{stats.booked}</b><span>Booked</span></div>
        </div>

        <div className="gp-tabs">
          {["Active", "All", "Booked", "Passed"].map((t) => (
            <button key={t} className={`gp-tab ${filter === t ? "active" : ""}`} onClick={() => { setFilter(t); setVisibleCount(10); }}>{t}</button>
          ))}
          <button className="gp-profile-btn" onClick={() => { setShowProfile((s) => !s); setShowForm(false); }}>{showProfile ? "Close" : "✎ Profile"}</button>
          <button className="gp-add-btn" onClick={() => { setShowForm((s) => !s); setShowProfile(false); }}>{showForm ? "Close" : "+ Add lead"}</button>
        </div>

        {showProfile && (
          <div className="gp-form">
            <h3>Performer profile</h3>
            <p className="gp-form-hint">This shapes every pitch. Fill in what's true — leave anything blank and the writer will skip it. Changes save automatically.</p>
            <div className="gp-row">
              <div className="gp-field" style={{ flex: "1 1 100%" }}><label>Tagline / one-liner</label><input value={profile.tagline} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} placeholder="Solo classical & Spanish guitar for elegant events" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field" style={{ flex: "1 1 100%" }}><label>Style & repertoire</label><textarea value={profile.style} onChange={(e) => setProfile({ ...profile, style: e.target.value })} placeholder="Classical, Spanish/flamenco, Latin, tasteful arrangements…" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field" style={{ flex: "1 1 100%" }}><label>Experience & background</label><textarea value={profile.experience} onChange={(e) => setProfile({ ...profile, experience: e.target.value })} placeholder="Years performing, notable venues or events…" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field"><label>Formats offered</label><textarea value={profile.formats} onChange={(e) => setProfile({ ...profile, formats: e.target.value })} placeholder="Ceremony, cocktail hour, dinner ambiance…" /></div>
              <div className="gp-field"><label>Setup & logistics</label><textarea value={profile.setup} onChange={(e) => setProfile({ ...profile, setup: e.target.value })} placeholder="Self-contained, low-footprint, PA available…" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field" style={{ flex: "1 1 100%" }}><label>What sets him apart</label><textarea value={profile.edge} onChange={(e) => setProfile({ ...profile, edge: e.target.value })} placeholder="Reads the room, curates the mood…" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field"><label>Website</label><input value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="yoursite.com" /></div>
              <div className="gp-field"><label>Sample link (audio / video)</label><input value={profile.sample} onChange={(e) => setProfile({ ...profile, sample: e.target.value })} placeholder="YouTube, SoundCloud…" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field"><label>Home base</label><input value={profile.base} onChange={(e) => setProfile({ ...profile, base: e.target.value })} placeholder="La Grange, IL" /></div>
              <div className="gp-field"><label>Availability</label><input value={profile.availability} onChange={(e) => setProfile({ ...profile, availability: e.target.value })} placeholder="Weekends, evenings…" /></div>
              <div className="gp-field"><label>Rate guidance (optional)</label><input value={profile.rate} onChange={(e) => setProfile({ ...profile, rate: e.target.value })} placeholder="Kept private unless asked" /></div>
            </div>
            <button className="gp-pitch-btn" onClick={() => setShowProfile(false)}>Done — save profile</button>
          </div>
        )}

        {showForm && (
          <div className="gp-form">
            <h3>New lead</h3>
            <div className="gp-row">
              <div className="gp-field"><label>Venue / contact name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lakeside Winery" /></div>
              <div className="gp-field"><label>Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            </div>
            <div className="gp-row">
              <div className="gp-field"><label>Distance (mi)</label><input value={form.distanceMi} onChange={(e) => setForm({ ...form, distanceMi: e.target.value })} placeholder="15" /></div>
              <div className="gp-field"><label>Budget signal</label><select value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}><option value="high">High / upscale</option><option value="mid">Mid</option><option value="low">Low</option></select></div>
              <div className="gp-field"><label>Contact</label><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="email or phone" /></div>
            </div>
            <div className="gp-row">
              <div className="gp-field" style={{ flex: "2 1 100%" }}><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What kind of events do they host?" /></div>
            </div>
            <div className="gp-row">
              <label className="gp-check"><input type="checkbox" checked={form.hostsLive} onChange={(e) => setForm({ ...form, hostsLive: e.target.checked })} /> Already hosts live music</label>
              <label className="gp-check"><input type="checkbox" checked={form.loud} onChange={(e) => setForm({ ...form, loud: e.target.checked })} /> Loud / noisy room</label>
            </div>
            <button className="gp-pitch-btn" onClick={addLead}>Add to pipeline</button>
          </div>
        )}

        {visible.length === 0 && <div className="gp-sub" style={{ padding: "20px 0" }}>No leads here yet. Add one, or switch tabs.</div>}

        {shown.map((l) => (
          <div key={l.id} className={`gp-card ${l.status === "Passed" ? "dim" : ""}`}>
            <Rosette score={l.score} />
            <div className="gp-body">
              <p className="gp-vname">{l.name}</p>
              <div className="gp-type">{l.type}</div>
              <div className="gp-why">{l.why}</div>
              <div className="gp-meta">
                {l.distanceMi !== "" && <span>📍 {l.distanceMi} mi</span>}
                {l.budget && <span>💰 {l.budget} budget</span>}
                {l.contact && <span>☎️ {l.contact}</span>}
              </div>
              {l.notes && <p className="gp-notes">{l.notes}</p>}
              {(l.bookingSearched || l.bookingEmail) && (
                <div className="gp-contact">
                  {l.bookingEmail
                    ? <a className="gp-email" href={`mailto:${l.bookingEmail}`}>✉️ {l.bookingEmail}</a>
                    : <span className="gp-noemail">No verified email found{l.bookingNote ? ` · ${l.bookingNote}` : ""}</span>}
                  {(l.bookingName || l.bookingTitle) && <span className="gp-contact-name">{[l.bookingName, l.bookingTitle].filter(Boolean).join(" · ")}</span>}
                  {l.bookingEmail && l.bookingConfidence && <span className={`gp-conf gp-conf-${l.bookingConfidence}`}>{l.bookingConfidence} confidence</span>}
                  {l.bookingSource && (/^https?:\/\//.test(l.bookingSource)
                    ? <a className="gp-src" href={l.bookingSource} target="_blank" rel="noreferrer">source</a>
                    : <span className="gp-src">{l.bookingSource}</span>)}
                </div>
              )}
              <div className="gp-actions">
                <button className="gp-pitch-btn" onClick={() => openId === l.id && pitches[l.id] ? setOpenId(null) : draftPitch(l)}>
                  {loadingId === l.id ? <><span className="gp-spin" />Drafting…</> : pitches[l.id] ? (openId === l.id ? "Hide pitch" : "Show pitch") : "✍️ Draft pitch"}
                </button>
                <button className="gp-find-btn" onClick={() => findContact(l)} disabled={findingId === l.id}>
                  {findingId === l.id ? <><span className="gp-spin-dark" />Searching…</> : l.bookingSearched ? "🔎 Re-find email" : "🔎 Find email"}
                </button>
                <button className="gp-status-btn" style={{ color: STATUS_COLOR[l.status], borderColor: STATUS_COLOR[l.status] }} onClick={() => cycleStatus(l.id)}>
                  {l.status} ↻
                </button>
              </div>
              {openId === l.id && pitches[l.id] && (() => {
                const pp = asPitch(pitches[l.id]);
                return (
                <div className="gp-drawer">
                  <label className="gp-subj-label">Subject line</label>
                  <input className="gp-subj" value={pp.subject} placeholder="(no subject)"
                    onChange={(e) => setPitches((p) => ({ ...p, [l.id]: { ...asPitch(p[l.id]), subject: e.target.value } }))} />
                  <textarea className="gp-ta" value={pp.body}
                    onChange={(e) => setPitches((p) => ({ ...p, [l.id]: { ...asPitch(p[l.id]), body: e.target.value } }))} />
                  <div className="gp-drawer-actions">
                    <button className="gp-mini" onClick={async () => {
                      const ok = await copyToClipboard((pp.subject ? `Subject: ${pp.subject}\n\n` : "") + pp.body);
                      if (ok) { setCopiedId(l.id); setTimeout(() => setCopiedId((c) => (c === l.id ? null : c)), 1600); }
                    }}>{copiedId === l.id ? "Copied ✓" : "Copy email"}</button>
                    {l.bookingEmail && (
                      <button className="gp-mini" onClick={() => openEmail(l, pp)}>✉️ Open in email</button>
                    )}
                    <button className="gp-mini" onClick={() => draftPitch(l)}>Redraft</button>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        ))}

        {visible.length > 0 && (
          <div className="gp-more">
            <span className="gp-more-count">Showing {shown.length} of {visible.length}</span>
            {visibleCount < visible.length && (
              <>
                <button className="gp-more-btn" onClick={() => setVisibleCount((c) => c + 10)}>
                  Show {Math.min(10, visible.length - visibleCount)} more
                </button>
                <button className="gp-more-all" onClick={() => setVisibleCount(visible.length)}>show all</button>
              </>
            )}
            {visibleCount >= visible.length && visible.length > 10 && (
              <button className="gp-more-all" onClick={() => setVisibleCount(10)}>collapse to top 10</button>
            )}
          </div>
        )}

        <div className="gp-foot">
          Prototype · real venues near La Grange, IL · verify contacts before sending · pitches written live · <button onClick={resetAll}>reset leads</button>
        </div>
      </div>
    </div>
  );
}

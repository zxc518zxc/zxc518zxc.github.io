// gen.js — 阿肥放置天堂 玩家資料站產生器
// 用法:node gen.js(讀 ../go端專案/gamedata.json → 生成各頁 + data.js + 圖示同步)
//
// 🔴 兩條鐵律
//  ① **絕不輸出掉落機率 %**(營運機密;2026-09-07 麥哥再次確認維持不公開)。
//     伺服器下發給前端的 gamedata 也會 delete mobDrops,所以玩家挖不到——這裡跟著守住才有意義。
//  ② **未開放的內容不可出現**(見下方 FEAT):遊戲裡 13 項內容開關全收起,
//     資料站若照 gamedata 全列,玩家會看到進不去的頻道與拿不到的道具,分批放內容的節奏就破功了。
const fs = require("fs");
const path = require("path");

const GD = JSON.parse(fs.readFileSync(path.join(__dirname, "../go端專案/gamedata.json"), "utf8"));
const OUT = __dirname;

// ---- 🎚 內容開關(必須與遊戲裡的 `feature` 指令狀態一致)----
// 遊戲裡下 `feature xxx on` 開放某內容後,**把這裡也改成 true 再重跑 gen.js**,資料站就會自動補上。
// 對照:go端專案/.ai/systems/內容開關.md 的狀態表。
const FEAT = {
  tianfa: false, // 天罰之地 / 傲慢之塔(19 個頻道 + 奇美拉之皮/傳送符等道具)
  castle:  false, // 城堡爭奪戰
  doll:    false, // 娃娃卡片
  bm:      false, // 黑市商人
  push:    false, // 推筒子
  dice:    false, // 園區
  slot:    false, // 肥特
  glory:   false, // 榮光進化(精通)
  potion:  false, // 嗑藥大師(精通)
  codex:   false, // 圖鑑
};
// 🐉 世界王等級上限(對應遊戲的 CMD `wbmax`;0=不限)。超過此等級的王不列出。
const WB_MAX_LV = 52;

// ---- 🖼 圖示 ----
// 🔴 2026-09-07 麥哥拍板改**純文字表格,不放圖片**。理由:
//   ① 手機開得快(原本 767 個圖檔 / 10MB,玩家多半用手機查)
//   ② 圖檔是用**道具中文名**去對的,對不到就是一個空格——純文字沒這問題
//   ③ 表格比卡片密,同一畫面看得到更多資料(資料站的重點是「查得到」不是「好看」)
// 想改回來:把 SHOW_ICONS 改 true 即可(同步與 <img> 都會回來)。
const SHOW_ICONS = false;
if (SHOW_ICONS) {
  for (const sub of ["items", "monsters", "skills"]) {
    const src = path.join(__dirname, "../go端專案/public/assets/icons", sub);
    const dst = path.join(OUT, "assets/icons", sub);
    fs.mkdirSync(dst, { recursive: true });
    if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true });
  }
}
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

// ---- 未開放內容的判定 ----
const hiddenZone = z =>
  (!FEAT.tianfa && (z === "twilight_mt" || z.startsWith("pride_"))) ||
  (!FEAT.castle && z.startsWith("siege_")) ||
  z.startsWith("pk_") || z === "lobby";
const HIDDEN_ITEM_RE = [];
if (!FEAT.tianfa) HIDDEN_ITEM_RE.push(/傲慢之塔|天罰|奇美拉之皮/);
if (!FEAT.doll)   HIDDEN_ITEM_RE.push(/娃娃/);
if (!FEAT.castle) HIDDEN_ITEM_RE.push(/攻城|城堡/);
const hiddenItem = (id, v) => {
  const s = (v.n || "") + " " + (v.d || "");
  return HIDDEN_ITEM_RE.some(re => re.test(s));
};

// ---- 頻道(獵場)----
const ZONE_CAT = { wild: "野外", dungeon: "地監", special: "特殊", village: "村莊" };
const zoneName = {}, zoneCat = {};
for (const [cat, arr] of Object.entries(GD.mapCategories || {}))
  for (const z of arr || []) { zoneName[z.v] = z.t; zoneCat[z.v] = ZONE_CAT[cat] || cat; }

// 頻道 → 怪(mob key);同時建反查 怪名 → 出沒頻道名
const zoneMobs = {}, mobZones = {};
for (const [z, keys] of Object.entries(GD.maps || {})) {
  if (hiddenZone(z) || zoneCat[z] === "村莊" || !Array.isArray(keys)) continue;
  const nm = zoneName[z];
  if (!nm) continue; // 不在分類表 = 內部/未啟用頻道,不列
  zoneMobs[z] = keys;
  for (const k of keys) {
    const mn = GD.mobs?.[k]?.n;
    if (!mn) continue;
    (mobZones[mn] ||= new Set()).add(nm);
  }
}


// ---- 資料萃取 ----
const TYPE_NAME = { wpn: "武器", arm: "防具", acc: "飾品", pot: "藥水", misc: "道具", material: "材料", skillbk: "技能書", etc: "其他" };
const ELE_NAME = { fire: "火", water: "水", wind: "風", earth: "地", none: "無", "": "無" };

const items = Object.entries(GD.items || {}).filter(([id, v]) => !hiddenItem(id, v)).map(([id, v]) => ({
  id, n: v.n || id, t: TYPE_NAME[v.type] || v.type || "其他",
  d: v.d || "", legend: v.gachaWeight === 1,
  dmg: v.dmgS ? `${v.dmgS}/${v.dmgL || v.dmgS}` : "", ac: v.ac || 0, safe: v.safe ?? "",
})).sort((a, b) => a.n.localeCompare(b.n, "zh-Hant"));
const itemOk = new Set(items.map(i => i.id));

// 掉落:只列「誰掉什麼」,**不輸出機率**(鐵律①)
const dropsByMobName = {};
for (const [mobN, rows] of Object.entries(GD.mobDrops || {})) {
  const set = new Set();
  for (const r of rows || []) if (r && r[0] && itemOk.has(r[0])) set.add(r[0]);
  dropsByMobName[mobN] = [...set];
}
const itemName = id => (GD.items?.[id]?.n) || id;

// 🐉 世界王(受 WB_MAX_LV 管制,與遊戲的 wbmax 一致)
const wbSet = new Set();
const worldbosses = Object.entries(GD.worldBosses || {}).map(([id, v]) => {
  // ⚠ 兩種形狀:單體王有 v.mob;**多體王房**(如 wb_fourcolor 歐林你這個背叛者=四色王×4)
  //    沒有 v.mob、改用 v.members[] 與 v.name —— 只處理單體會生出一筆 "undefined Lv0"。
  const mem = Array.isArray(v.members) ? v.members : null;
  const keys = mem ? mem.map(x => x.mob) : [v.mob];
  const ms = keys.map(k => GD.mobs?.[k]).filter(Boolean);
  if (!ms.length) return null;
  const names = ms.map(m => m.n);
  const drops = [...new Set(names.flatMap(n => dropsByMobName[n] || []))];
  return {
    id, mob: keys[0],
    n: v.name || ms[0].n,
    members: mem ? names : [],
    lv: Math.max(...ms.map(m => m.lv || 0)),
    hp: mem ? mem.reduce((t, x) => t + (x.hp || 0), 0) : (v.hp || ms[0].hp || 0),
    minLv: v.minLv || 0, respawnMin: Math.round((v.respawnMs || 0) / 60000),
    drops: drops.map(id2 => ({ id: id2, n: itemName(id2), legend: GD.items?.[id2]?.gachaWeight === 1 })),
  };
}).filter(Boolean).filter(w => {
  if (WB_MAX_LV > 0 && w.lv > WB_MAX_LV) return false; // 超過上限=遊戲裡看不到
  wbSet.add(w.n);
  return true;
}).sort((a, b) => a.lv - b.lv);

const mobs = Object.entries(GD.mobs || {}).map(([key, v]) => ({
  key, n: v.n || key, lv: v.lv || 0, hp: v.hp || 0, exp: v.exp || 0,
  e: ELE_NAME[v.e] || "無", race: v.race || "", boss: !!v.boss,
  zones: [...(mobZones[v.n] || [])],
  drops: (dropsByMobName[v.n] || []).map(id => ({ id, n: itemName(id), legend: GD.items?.[id]?.gachaWeight === 1 })),
})).sort((a, b) => a.lv - b.lv || a.n.localeCompare(b.n, "zh-Hant"));
// 同名怪合併;過濾:內部假怪(無掉落無經驗)、玩家去不了的地方(無出沒頻道且非世界王)
const mobSeen = new Map();
for (const m of mobs) if (!mobSeen.has(m.n)) mobSeen.set(m.n, m);
const mobList = [...mobSeen.values()]
  .filter(m => m.drops.length > 0 || m.exp > 0)
  .filter(m => m.zones.length > 0 || wbSet.has(m.n));

// 🗺 獵場列表
const zones = Object.entries(zoneMobs).map(([z, keys]) => {
  const ms = [...new Set(keys.map(k => GD.mobs?.[k]?.n).filter(Boolean))];
  const lvs = ms.map(n => (mobSeen.get(n) || {}).lv || 0).filter(x => x > 0);
  return { id: z, n: zoneName[z], cat: zoneCat[z] || "野外", mobs: ms,
    lvMin: lvs.length ? Math.min(...lvs) : 0, lvMax: lvs.length ? Math.max(...lvs) : 0 };
}).filter(z => z.mobs.length > 0).sort((a, b) => a.lvMin - b.lvMin || a.n.localeCompare(b.n, "zh-Hant"));

// 🏘 NPC 一覽
const NPC_TYPE = { shop: "商店", craft: "製作", skill: "技能", warehouse: "倉庫", exchange: "兌換",
  teleport: "傳送", quest: "任務", bank: "銀行", rename: "改名", pray: "祈福", blackmarket: "黑市" };
const HIDE_NPC = new Set([!FEAT.bm && "blackmarket", !FEAT.pray && "pray", "rename"].filter(Boolean));
const towns = Object.entries(GD.towns || {}).map(([id, t]) => ({
  id, n: t.n || id,
  npcs: (t.npcs || []).filter(n => !HIDE_NPC.has(n.type)).map(n => ({
    n: n.n || "", title: n.title || "", t: NPC_TYPE[n.type] || n.type || "", d: n.d || "" })),
})).filter(t => t.npcs.length > 0);

// 🛡 套裝
const sets = Object.values(GD.sets || {}).map(s => ({
  n: s.n || "", ac: s.ac || 0,
  items: (s.items || []).filter(id => itemOk.has(id)).map(id => itemName(id)),
})).filter(s => s.items.length > 0).sort((a, b) => a.n.localeCompare(b.n, "zh-Hant"));

const skills = Object.entries(GD.skills || {}).map(([id, v]) => ({
  id, n: v.n || id, t: v.type || "", tier: v.tier || 0, mp: v.mp || 0,
  k: v.reqK || 0, m: v.reqM || 0, e: v.reqE || 0,
})).sort((a, b) => (a.tier - b.tier) || a.n.localeCompare(b.n, "zh-Hant"));

fs.writeFileSync(path.join(OUT, "data.js"), "const WIKI=" + JSON.stringify(
  { items, mobs: mobList, skills, zones, worldbosses, towns, sets }) + ";");

// ---- 共用外框 ----
const CSS = `
*{box-sizing:border-box}body{background:#1a140c;color:#e8dcc8;font-family:"Microsoft JhengHei",sans-serif;margin:0;padding:0}
header{background:#241b0f;border-bottom:2px solid #f5c451;padding:14px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{color:#f5c451;font-size:20px;margin:0}
nav a{color:#cbbb9b;text-decoration:none;margin-right:14px;font-size:15px}nav a:hover,nav a.on{color:#f5c451}
main{max-width:1000px;margin:0 auto;padding:16px}
input,select{background:#2a2014;border:1px solid #5a4a26;color:#e8dcc8;padding:9px 12px;border-radius:8px;font-size:15px}
input{width:100%}
.bar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.chip{padding:6px 14px;border-radius:16px;border:1px solid #5a4a26;background:#2a2014;color:#cbbb9b;cursor:pointer;font-size:14px}
.chip.on{background:#f5c451;color:#241b0f;font-weight:bold}
.card{background:#241b0f;border:1px solid #3a2f1c;border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;gap:12px}
.card img{width:48px;height:48px;object-fit:contain;flex-shrink:0}
.card .ttl{color:#f5c451;font-size:16px;font-weight:bold}
.card .sub{color:#b6a684;font-size:13px;margin-top:2px}
.legend{color:#ffd700}
.dropchip{display:inline-flex;align-items:center;gap:4px;background:#2a2014;border:1px solid #3a2f1c;border-radius:8px;padding:3px 8px;margin:3px 4px 0 0;font-size:13px;color:#cbbb9b}
.dropchip img{width:20px;height:20px}
.stat{color:#8f8067;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:8px 10px;border-bottom:1px solid #3a2f1c;text-align:left}
th{color:#f5c451;position:sticky;top:0;background:#1a140c}
footer{text-align:center;color:#6b5f4c;font-size:12px;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.tile{background:#241b0f;border:1px solid #5a4a26;border-radius:14px;padding:22px;text-align:center;text-decoration:none;display:block}
.tile:hover{border-color:#f5c451}
.tile .em{font-size:34px}.tile .tt{color:#f5c451;font-size:18px;font-weight:bold;margin:8px 0 4px}.tile .dd{color:#b6a684;font-size:13px}
.stats{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:10px 0 16px}
.stat-chip{background:#241b0f;border:1px solid #5a4a26;border-radius:10px;padding:7px 14px;font-size:14px;color:#b6a684}
.stat-chip b{color:#f5c451;font-size:16px;margin-right:4px}
table{border-collapse:collapse;width:100%;font-size:14px;background:#241b0f;border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid #3a2f1c;text-align:left;vertical-align:top}
th{color:#f5c451;position:sticky;top:0;background:#2a2014;white-space:nowrap;font-size:13px}
tr:hover td{background:#2a2014}
td.nm{color:#e8dcc8;font-weight:bold;white-space:nowrap}
td.num{text-align:right;white-space:nowrap;color:#b6a684}
.tag{display:inline-block;background:#2a2014;border:1px solid #3a2f1c;border-radius:6px;padding:1px 7px;margin:2px 3px 0 0;font-size:12px;color:#cbbb9b;white-space:nowrap}
.tag.lg{color:#ffd700;border-color:#6b5a20}
.tag.zn{color:#7bd14a;border-color:#2f4a24}
.wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.hint{color:#8f8067;font-size:12px;margin:-6px 0 12px}
`;
const page = (title, active, body, extra = "") => `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - 阿肥放置天堂 資料站</title><style>${CSS}</style></head><body>
<header><h1>🏰 阿肥放置天堂</h1><nav>
<a href="index.html" class="${active === "index" ? "on" : ""}">首頁</a>
<a href="monsters.html" class="${active === "mob" ? "on" : ""}">怪物掉落圖鑑</a>
<a href="items.html" class="${active === "item" ? "on" : ""}">道具圖鑑</a>
<a href="skills.html" class="${active === "skill" ? "on" : ""}">技能介紹</a>
<a href="zones.html" class="${active === "zone" ? "on" : ""}">獵場列表</a>
<a href="worldboss.html" class="${active === "wb" ? "on" : ""}">世界王</a>
<a href="npc.html" class="${active === "npc" ? "on" : ""}">NPC 一覽</a>
<a href="sets.html" class="${active === "set" ? "on" : ""}">套裝效果</a>
</nav></header><main>${body}</main>
<footer>資料自動同步自遊戲檔 · 產生於 ${new Date().toISOString().slice(0, 10)}</footer>
${extra}</body></html>`;


// ================= 頁面(2026-09-07 起:純文字表格,無圖片) =================
const chips = arr => `<div class="stats">${arr.map(([n, t]) => `<div class="stat-chip"><b>${n}</b>${t}</div>`).join("")}</div>`;
const ESC = `const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");`;

// ---- 首頁 ----
fs.writeFileSync(path.join(OUT, "index.html"), page("首頁", "index", `
<div style="text-align:center;padding:10px 0 4px"><div style="font-size:15px;color:#b6a684">掛機練功・打寶強化・世界王討伐</div></div>
${chips([[mobList.length, "怪物"], [items.length, "道具"], [skills.length, "技能"], [zones.length, "獵場"], [worldbosses.length, "世界王"], [towns.reduce((s, t) => s + t.npcs.length, 0), "NPC"], [sets.length, "套裝"]])}
<div class="grid">
<a class="tile" href="monsters.html"><div class="em">👹</div><div class="tt">怪物掉落圖鑑</div><div class="dd">打什麼掉什麼・可用道具名反查</div></a>
<a class="tile" href="items.html"><div class="em">⚔️</div><div class="tt">道具圖鑑</div><div class="dd">武器防具飾品的數值與說明</div></a>
<a class="tile" href="skills.html"><div class="em">✨</div><div class="tt">技能介紹</div><div class="dd">各職業的學習等級與 MP</div></a>
<a class="tile" href="zones.html"><div class="em">🗺️</div><div class="tt">獵場列表</div><div class="dd">幾等該去哪練・怪在哪出沒</div></a>
<a class="tile" href="worldboss.html"><div class="em">🐉</div><div class="tt">世界王</div><div class="dd">入場等級・重生間隔・掉落</div></a>
<a class="tile" href="npc.html"><div class="em">🏘️</div><div class="tt">NPC 一覽</div><div class="dd">誰在哪個村莊・提供什麼服務</div></a>
<a class="tile" href="sets.html"><div class="em">🛡️</div><div class="tt">套裝效果</div><div class="dd">湊齊有什麼加成</div></a>
</div>`));

// ---- 怪物掉落 ----
fs.writeFileSync(path.join(OUT, "monsters.html"), page("怪物掉落圖鑑", "mob", `
${chips([[mobList.length, "怪物"], [mobList.filter(m => m.drops.length).length, "有掉落"], [worldbosses.length, "世界王"]])}
<div class="bar"><input id="q" placeholder="🔍 搜怪物名,或輸入「道具名」找會掉它的怪"></div>
<div class="hint">例:搜「銀長劍」→ 列出所有會掉它的怪物。</div>
<div class="chips" id="lvchips"></div>
<div class="wrap"><table><thead><tr><th>怪物</th><th>Lv</th><th>HP</th><th>經驗</th><th>屬性</th><th>出沒地點</th><th>掉落</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const LV=[["all","全部"],["1-20","1~20"],["21-40","21~40"],["41-60","41~60"],["61+","61+"]];let lv="all";
$("lvchips").innerHTML=LV.map(([k,t])=>'<span class="chip'+(k==="all"?" on":"")+'" data-k="'+k+'">'+t+'</span>').join("");
document.querySelectorAll("#lvchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#lvchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");lv=c.dataset.k;render();});
function inLv(m){if(lv==="all")return true;if(lv==="61+")return m.lv>=61;const p=lv.split("-");return m.lv>=+p[0]&&m.lv<=+p[1];}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.mobs.filter(m=>inLv(m)&&(!q||m.n.toLowerCase().includes(q)||m.drops.some(d=>d.n.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(m=>"<tr><td class='nm'>"+esc(m.n)+"</td><td class='num'>"+m.lv+"</td><td class='num'>"+m.hp.toLocaleString()+"</td><td class='num'>"+m.exp.toLocaleString()+"</td><td class='num'>"+m.e+"</td>"+
"<td>"+(m.zones.length?m.zones.map(z=>"<span class='tag zn'>"+esc(z)+"</span>").join(""):"<span class='tag'>世界王房</span>")+"</td>"+
"<td>"+(m.drops.length?m.drops.map(d=>"<span class='tag"+(d.legend?" lg":"")+"'>"+(d.legend?"★":"")+esc(d.n)+"</span>").join(""):"<span style='color:#6b5f4c'>—</span>")+"</td></tr>").join("")||"<tr><td colspan=7 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 道具 ----
fs.writeFileSync(path.join(OUT, "items.html"), page("道具圖鑑", "item", `
${chips(["武器", "防具", "飾品", "藥水", "道具", "材料", "技能書"].map(t => [items.filter(i => i.t === t).length, t]))}
<div class="bar"><input id="q" placeholder="🔍 搜道具名稱"></div>
<div class="chips" id="tchips"></div>
<div class="wrap"><table><thead><tr><th>道具</th><th>類型</th><th>傷害</th><th>防禦</th><th>安定</th><th>說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const TS=["全部","武器","防具","飾品","藥水","道具","材料","技能書","其他"];let tf="全部";
$("tchips").innerHTML=TS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#tchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#tchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");tf=c.dataset.t;render();});
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.items.filter(i=>(tf==="全部"||i.t===tf)&&(!q||i.n.toLowerCase().includes(q)||(i.d||"").toLowerCase().includes(q)));
$("tb").innerHTML=list.map(i=>"<tr><td class='nm'"+(i.legend?" style='color:#ffd700'":"")+">"+(i.legend?"★":"")+esc(i.n)+"</td><td class='num'>"+i.t+"</td><td class='num'>"+(i.dmg||"—")+"</td><td class='num'>"+(i.ac||"—")+"</td><td class='num'>"+((i.safe!==""&&(i.t==="武器"||i.t==="防具"))?"+"+i.safe:"—")+"</td><td style='color:#b6a684;font-size:13px'>"+esc(i.d||"")+"</td></tr>").join("")||"<tr><td colspan=6 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 技能 ----
fs.writeFileSync(path.join(OUT, "skills.html"), page("技能介紹", "skill", `
${chips([[skills.length, "技能"], [skills.filter(s => s.k > 0).length, "騎士可學"], [skills.filter(s => s.m > 0).length, "法師可學"], [skills.filter(s => s.e > 0).length, "妖精可學"]])}
<div class="bar"><input id="q" placeholder="🔍 搜技能名稱"><select id="cls"><option value="all">全職業</option><option value="k">騎士</option><option value="m">法師</option><option value="e">妖精</option></select></div>
<div class="wrap"><table><thead><tr><th>技能</th><th>類型</th><th>MP</th><th>騎士</th><th>法師</th><th>妖精</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const req=v=>v?("Lv"+v):"—";
function render(){const q=$("q").value.trim().toLowerCase();const c=$("cls").value;
const list=WIKI.skills.filter(s=>(!q||s.n.toLowerCase().includes(q))&&(c==="all"||s[c]>0));
$("tb").innerHTML=list.map(s=>"<tr><td class='nm'>"+esc(s.n)+"</td><td class='num'>"+esc(s.t)+"</td><td class='num'>"+s.mp+"</td><td class='num'>"+req(s.k)+"</td><td class='num'>"+req(s.m)+"</td><td class='num'>"+req(s.e)+"</td></tr>").join("")||"<tr><td colspan=6 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;$("cls").onchange=render;render();
</script>`));

// ---- 獵場 ----
fs.writeFileSync(path.join(OUT, "zones.html"), page("獵場列表", "zone", `
${chips([[zones.length, "獵場"], [zones.filter(z => z.cat === "野外").length, "野外"], [zones.filter(z => z.cat === "地監").length, "地監"]])}
<div class="bar"><input id="q" placeholder="🔍 搜獵場名,或輸入「怪物名」找牠出沒的獵場"></div>
<div class="chips" id="cchips"></div>
<div class="wrap"><table><thead><tr><th>獵場</th><th>類型</th><th>怪物等級</th><th>出沒怪物</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const CS=["全部","野外","地監","特殊"];let cf="全部";
$("cchips").innerHTML=CS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#cchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#cchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");cf=c.dataset.t;render();});
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.zones.filter(z=>(cf==="全部"||z.cat===cf)&&(!q||z.n.toLowerCase().includes(q)||z.mobs.some(m=>m.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(z=>"<tr><td class='nm'>"+esc(z.n)+"</td><td class='num'>"+z.cat+"</td><td class='num'>"+(z.lvMin?"Lv"+z.lvMin+"~"+z.lvMax:"—")+"</td><td>"+z.mobs.map(m=>"<span class='tag'>"+esc(m)+"</span>").join("")+"</td></tr>").join("")||"<tr><td colspan=4 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 世界王 ----
fs.writeFileSync(path.join(OUT, "worldboss.html"), page("世界王", "wb", `
${chips([[worldbosses.length, "世界王"]])}
<div class="hint">王房會定時重生,參戰有機會取得專屬掉落。以下為目前開放的世界王。</div>
<div class="bar"><input id="q" placeholder="🔍 搜世界王名 或 掉落道具名"></div>
<div class="wrap"><table><thead><tr><th>世界王</th><th>Lv</th><th>HP</th><th>入場等級</th><th>重生</th><th>掉落</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.worldbosses.filter(w=>!q||w.n.toLowerCase().includes(q)||w.drops.some(d=>d.n.toLowerCase().includes(q)));
$("tb").innerHTML=list.map(w=>"<tr><td class='nm'>"+esc(w.n)+(w.members.length?"<div style='font-weight:normal;color:#8f8067;font-size:12px'>同房 "+w.members.length+" 隻:"+esc(w.members.join("、"))+"</div>":"")+"</td>"+
"<td class='num'>"+w.lv+"</td><td class='num'>"+w.hp.toLocaleString()+"</td><td class='num'>"+(w.minLv?"Lv"+w.minLv:"—")+"</td><td class='num'>"+(w.respawnMin?w.respawnMin+" 分":"—")+"</td>"+
"<td>"+(w.drops.length?w.drops.map(d=>"<span class='tag"+(d.legend?" lg":"")+"'>"+(d.legend?"★":"")+esc(d.n)+"</span>").join(""):"<span style='color:#6b5f4c'>—</span>")+"</td></tr>").join("")||"<tr><td colspan=6 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- NPC ----
fs.writeFileSync(path.join(OUT, "npc.html"), page("NPC 一覽", "npc", `
${chips([[towns.length, "村莊"], [towns.reduce((s, t) => s + t.npcs.length, 0), "NPC"]])}
<div class="bar"><input id="q" placeholder="🔍 搜 NPC 名、村莊名 或 服務(例:製作)"></div>
<div class="wrap"><table><thead><tr><th>村莊</th><th>NPC</th><th>身分</th><th>說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
function render(){const q=$("q").value.trim().toLowerCase();
const rows=[];
for(const t of WIKI.towns){const ns=t.npcs.filter(n=>!q||n.n.toLowerCase().includes(q)||t.n.toLowerCase().includes(q)||(n.t||"").toLowerCase().includes(q)||(n.title||"").toLowerCase().includes(q));
ns.forEach((n,i)=>rows.push("<tr><td class='nm'>"+(i===0?esc(t.n):"")+"</td><td class='nm'>"+esc(n.n)+"</td><td class='num'>"+esc(n.title||n.t)+"</td><td style='color:#b6a684;font-size:13px'>"+esc(n.d||"")+"</td></tr>"));}
$("tb").innerHTML=rows.join("")||"<tr><td colspan=4 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 套裝 ----
fs.writeFileSync(path.join(OUT, "sets.html"), page("套裝效果", "set", `
${chips([[sets.length, "套裝"]])}
<div class="hint">湊齊整套裝備即可獲得額外加成。</div>
<div class="bar"><input id="q" placeholder="🔍 搜套裝名 或 裝備名"></div>
<div class="wrap"><table><thead><tr><th>套裝</th><th>湊齊加成</th><th>組成裝備</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.sets.filter(s=>!q||s.n.toLowerCase().includes(q)||s.items.some(i=>i.toLowerCase().includes(q)));
$("tb").innerHTML=list.map(s=>"<tr><td class='nm'>"+esc(s.n)+"</td><td class='num'>"+(s.ac?"防禦 +"+s.ac:"—")+"</td><td>"+s.items.map(i=>"<span class='tag'>"+esc(i)+"</span>").join("")+"</td></tr>").join("")||"<tr><td colspan=3 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

console.log("OK(純文字表格): 怪 " + mobList.length + " / 道具 " + items.length + " / 技能 " + skills.length +
  " / 獵場 " + zones.length + " / 世界王 " + worldbosses.length + " / 村莊 " + towns.length + " / 套裝 " + sets.length);

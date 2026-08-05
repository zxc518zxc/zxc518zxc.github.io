// gen.js — 阿肥放置天堂 玩家資料站產生器
// 用法:node gen.js(讀 ../go端專案/gamedata.json → 生成 index/monsters/items/skills 四頁+data.js+圖示)
// 原則:掉落只列「誰掉什麼」,絕不輸出機率%(營運機密);改了 gamedata 重跑即同步。
const fs = require("fs");
const path = require("path");

const GD = JSON.parse(fs.readFileSync(path.join(__dirname, "../go端專案/gamedata.json"), "utf8"));
const OUT = __dirname;

// ---- 圖示同步(整包覆蓋,不足 10MB) ----
for (const sub of ["items", "monsters", "skills"]) {
  const src = path.join(__dirname, "../go端專案/public/assets/icons", sub);
  const dst = path.join(OUT, "assets/icons", sub);
  fs.mkdirSync(dst, { recursive: true });
  if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true });
}
fs.writeFileSync(path.join(OUT, ".nojekyll"), ""); // 讓 GitHub Pages 原樣伺服

// ---- 資料萃取 ----
const TYPE_NAME = { wpn: "武器", arm: "防具", acc: "飾品", pot: "藥水", misc: "道具", material: "材料", skillbk: "技能書", etc: "其他" };
const ELE_NAME = { fire: "火", water: "水", wind: "風", earth: "地", none: "無", "": "無" };

const items = Object.entries(GD.items || {}).map(([id, v]) => ({
  id, n: v.n || id, t: TYPE_NAME[v.type] || v.type || "其他",
  d: v.d || "", legend: v.gachaWeight === 1,
  dmg: v.dmgS ? `${v.dmgS}/${v.dmgL || v.dmgS}` : "", ac: v.ac || 0, safe: v.safe ?? "",
})).sort((a, b) => a.n.localeCompare(b.n, "zh-Hant"));

const dropsByMobName = {};
for (const [mobN, rows] of Object.entries(GD.mobDrops || {})) {
  const set = new Set();
  for (const r of rows || []) if (r && r[0]) set.add(r[0]);
  dropsByMobName[mobN] = [...set];
}
const itemName = id => (GD.items?.[id]?.n) || id;

const mobs = Object.entries(GD.mobs || {}).map(([key, v]) => ({
  key, n: v.n || key, lv: v.lv || 0, hp: v.hp || 0, exp: v.exp || 0,
  e: ELE_NAME[v.e] || "無", race: v.race || "",
  drops: (dropsByMobName[v.n] || []).map(id => ({ id, n: itemName(id), legend: GD.items?.[id]?.gachaWeight === 1 })),
})).sort((a, b) => a.lv - b.lv || a.n.localeCompare(b.n, "zh-Hant"));
// 同名怪(不同出沒點)合併顯示一筆;過濾內部假怪(攻城塔/PK 人偶等:無掉落且無經驗)
const mobSeen = new Map();
for (const m of mobs) if (!mobSeen.has(m.n)) mobSeen.set(m.n, m);
const mobList = [...mobSeen.values()].filter(m => m.drops.length > 0 || m.exp > 0);

const skills = Object.entries(GD.skills || {}).map(([id, v]) => ({
  id, n: v.n || id, t: v.type || "", tier: v.tier || 0, mp: v.mp || 0,
  k: v.reqK || 0, m: v.reqM || 0, e: v.reqE || 0,
})).sort((a, b) => (a.tier - b.tier) || a.n.localeCompare(b.n, "zh-Hant"));

fs.writeFileSync(path.join(OUT, "data.js"),
  "const WIKI={items:" + JSON.stringify(items) + ",mobs:" + JSON.stringify(mobList) + ",skills:" + JSON.stringify(skills) + "};");

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
`;
const page = (title, active, body, extra = "") => `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - 阿肥放置天堂 資料站</title><style>${CSS}</style></head><body>
<header><h1>🏰 阿肥放置天堂</h1><nav>
<a href="index.html" class="${active === "index" ? "on" : ""}">首頁</a>
<a href="monsters.html" class="${active === "mob" ? "on" : ""}">怪物掉落圖鑑</a>
<a href="items.html" class="${active === "item" ? "on" : ""}">道具圖鑑</a>
<a href="skills.html" class="${active === "skill" ? "on" : ""}">技能介紹</a>
</nav></header><main>${body}</main>
<footer>資料自動同步自遊戲檔 · 產生於 ${new Date().toISOString().slice(0, 10)}</footer>
${extra}</body></html>`;

// ---- index ----
fs.writeFileSync(path.join(OUT, "index.html"), page("首頁", "index", `
<div style="text-align:center;padding:18px 0"><div style="font-size:15px;color:#b6a684">掛機練功・打寶強化・世界王討伐</div></div>
<div class="grid">
<a class="tile" href="monsters.html"><div class="em">👹</div><div class="tt">怪物掉落圖鑑</div><div class="dd">${mobList.length} 隻怪物・正查反查掉落</div></a>
<a class="tile" href="items.html"><div class="em">⚔️</div><div class="tt">道具圖鑑</div><div class="dd">${items.length} 件道具裝備</div></a>
<a class="tile" href="skills.html"><div class="em">✨</div><div class="tt">技能介紹</div><div class="dd">${skills.length} 個技能・三職業需求</div></a>
</div>`));

// ---- monsters ----
fs.writeFileSync(path.join(OUT, "monsters.html"), page("怪物掉落圖鑑", "mob", `
<div class="bar"><input id="q" placeholder="🔍 搜怪物名 或 道具名(例:銀長劍 → 列出誰會掉)"></div>
<div class="chips" id="lvchips"></div>
<div id="list"></div>`, `<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
const LV=[["all","全部"],["1-20","1~20"],["21-40","21~40"],["41-60","41~60"],["61+","61+"]];
let lv="all";
$("lvchips").innerHTML=LV.map(([k,t])=>'<span class="chip'+(k==="all"?" on":"")+'" data-k="'+k+'">'+t+'</span>').join("");
document.querySelectorAll("#lvchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#lvchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");lv=c.dataset.k;render();});
function inLv(m){if(lv==="all")return true;if(lv==="61+")return m.lv>=61;const[a,b]=lv.split("-").map(Number);return m.lv>=a&&m.lv<=b;}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.mobs.filter(m=>inLv(m)&&(!q||m.n.toLowerCase().includes(q)||m.drops.some(d=>d.n.toLowerCase().includes(q))));
$("list").innerHTML=list.map(m=>'<div class="card"><img src="assets/icons/monsters/'+encodeURIComponent(m.n)+'.png" onerror="this.style.visibility=\\'hidden\\'">'+
'<div><div class="ttl">'+m.n+' <span class="stat">Lv'+m.lv+"・"+m.e+"屬性・HP "+m.hp+"・經驗 "+m.exp+'</span></div>'+
'<div>'+(m.drops.length?m.drops.map(d=>'<span class="dropchip'+(d.legend?" legend":"")+'"><img src="assets/icons/items/'+encodeURIComponent(d.n)+'.png" onerror="this.style.display=\\'none\\'">'+(d.legend?"★":"")+d.n+"</span>").join(""):'<span class="stat">(無特殊掉落)</span>')+"</div></div></div>").join("")||'<div class="stat">查無符合</div>';}
$("q").oninput=render;render();
</script>`));

// ---- items ----
fs.writeFileSync(path.join(OUT, "items.html"), page("道具圖鑑", "item", `
<div class="bar"><input id="q" placeholder="🔍 搜道具名稱"></div>
<div class="chips" id="tchips"></div>
<div id="list"></div>`, `<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
const TS=["全部","武器","防具","飾品","藥水","道具","材料","技能書","其他"];let tf="全部";
$("tchips").innerHTML=TS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#tchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#tchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");tf=c.dataset.t;render();});
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.items.filter(i=>(tf==="全部"||i.t===tf)&&(!q||i.n.toLowerCase().includes(q))).slice(0,300);
$("list").innerHTML=list.map(i=>'<div class="card"><img src="assets/icons/items/'+encodeURIComponent(i.n)+'.png" onerror="this.style.visibility=\\'hidden\\'">'+
'<div><div class="ttl'+(i.legend?" legend":"")+'">'+(i.legend?"★":"")+i.n+' <span class="stat">'+i.t+(i.dmg?"・傷害 "+i.dmg:"")+(i.ac?"・防禦 "+i.ac:"")+(i.safe!==""&&(i.t==="武器"||i.t==="防具")?"・安定 +"+i.safe:"")+'</span></div>'+
(i.d?'<div class="sub">'+i.d+"</div>":"")+"</div></div>").join("")||'<div class="stat">查無符合</div>';}
$("q").oninput=render;render();
</script>`));

// ---- skills ----
fs.writeFileSync(path.join(OUT, "skills.html"), page("技能介紹", "skill", `
<div class="bar"><input id="q" placeholder="🔍 搜技能名稱"><select id="cls"><option value="all">全職業</option><option value="k">騎士</option><option value="m">法師</option><option value="e">妖精</option></select></div>
<div style="overflow-x:auto"><table><thead><tr><th></th><th>技能</th><th>類型</th><th>MP</th><th>騎士</th><th>法師</th><th>妖精</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
const req=v=>v?("Lv"+v):"—";
function render(){const q=$("q").value.trim().toLowerCase();const c=$("cls").value;
const list=WIKI.skills.filter(s=>(!q||s.n.toLowerCase().includes(q))&&(c==="all"||s[c]>0));
$("tb").innerHTML=list.map(s=>"<tr><td><img src='assets/icons/skills/"+encodeURIComponent(s.n)+".png' style='width:28px;height:28px' onerror=\\"this.style.visibility='hidden'\\"></td><td style='color:#f5c451'>"+s.n+"</td><td class='stat'>"+s.t+"</td><td>"+s.mp+"</td><td>"+req(s.k)+"</td><td>"+req(s.m)+"</td><td>"+req(s.e)+"</td></tr>").join("")||"<tr><td colspan=7 class='stat'>查無符合</td></tr>";}
$("q").oninput=render;$("cls").onchange=render;render();
</script>`));

console.log(`OK: mobs ${mobList.length} / items ${items.length} / skills ${skills.length}`);

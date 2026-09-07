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



// ---- 🏷 道具效果標籤(2026-09-07)----
// 麥哥反映「力量手套應該有力量+2,很多道具沒說明」——那些數值 gamedata 都有,
// 先前只讀了 d/dmg/ac/safe,其餘欄位全被忽略。這裡把它們渲染成看得懂的中文。
// ⚠ 只翻譯**確認過語意**的欄位;沒把握的寧可不顯示,也不要寫錯給玩家看。
const SLOT_N = { helm: "頭盔", armor: "盔甲", tshirt: "內衣", cloak: "斗篷", boots: "靴子",
  gloves: "手套", shield: "盾牌", ring: "戒指", amulet: "項鍊", belt: "腰帶", pet: "寵物裝備" };
const REQ_N = { all: "全職業", knight: "騎士", mage: "法師", elf: "妖精", dark: "黑暗妖精" };
const reqStr = r => !r || r === "all" ? "全職業" : r.split(",").map(x => REQ_N[x.trim()] || x).join("／");
// 武器特殊效果(對照 engine 內的 eff 分支;只列玩家打得到、意義明確的)
// ✅ 已確認**程式碼裡真的有實作**的武器效果(逐一 grep engine/ 驗過)
const EFF_N = {
  doublehit: "雙擊:機率追加一次攻擊", // afk/darkelf.go:53
  clawmark: "爪痕:機率造成武器最大傷害", // afk/darkelf.go:33
  mp_drain: "吸取魔力",                  // engine/combat.go:247
  moonburst: "月光爆裂",                 // afk/bosstick.go:210 / sim.go:1270
  phantom_arrow: "幻影箭",               // afk/sim.go:873 / derived.go:669
  firearrow: "火焰箭",                   // afk/bosstick.go:238 / sim.go:1315
};
// 🔴 **未實作,刻意不顯示**(2026-09-07 麥哥發現、逐一 grep 確認零引用):
//   cleave 橫掃 / crush 重擊 / pierce 貫穿 / magicstrike 魔法打擊 / rapidfire 連射
//   欄位 pierceChance、dragonStrike 同樣零引用。共 27 把武器掛著這些沒作用的標記。
//   ⚠ 這些字有些**也寫在道具說明(d)裡**(例:屠龍劍「龍的一擊」),那段遊戲內也看得到 ——
//     那是遊戲端要處理的,不是資料站能解決的。
const num = (v, s) => (v ? [s.replace("N", (v > 0 ? "+" : "") + v)] : []);
function itemFx(v) {
  const t = [];
  t.push(...num(v.str, "力量 N"), ...num(v.dex, "敏捷 N"), ...num(v.con, "體質 N"),
    ...num(v.int, "智力 N"), ...num(v.wis, "精神 N"), ...num(v.cha, "魅力 N"));
  t.push(...num(v.mhp, "最大HP N"), ...num(v.mmp, "最大MP N"),
    ...num(v.hpR, "HP恢復 N"), ...num(v.mpR, "MP恢復 N"));
  t.push(...num(v.hit, "命中 N"), ...num(v.dmgBonus, "傷害 N"), ...num(v.mdmg, "魔法傷害 N"), ...num(v.mr, "魔防 N"));
  t.push(...num(v.resFire, "火抗 N"), ...num(v.resWater, "水抗 N"),
    ...num(v.resWind, "風抗 N"), ...num(v.resEarth, "地抗 N"));
  if (v.block) t.push("格擋 " + v.block + "%");
  if (v.magicDrNonEle) t.push("無屬性魔法傷害 -" + v.magicDrNonEle + "%");
  if (v.immStone) t.push("免疫石化");
  if (v.immPoison) t.push("免疫中毒");
  if (v.weightCap) t.push("負重上限 +" + v.weightCap);
  if (v.extraMpPerEn) t.push("每強化 +1:額外MP +" + v.extraMpPerEn);      // derived.go: ExtraMp += wEn * ExtraMpPerEn
  if (v.meleeHitPerEn) t.push("每強化 +1:近距離命中 +" + v.meleeHitPerEn); // derived.go: MeleeHit += wEn * MeleeHitPerEn
  if (v.mrPerEn) t.push("每強化 +1:魔防 +" + v.mrPerEn);
  if (v.rangedHit) t.push("遠距離命中 +" + v.rangedHit);
  // pierceChance / rapidfire:未實作,不顯示(見上方說明)
  if (v.mpROverSafe) t.push("超過安定值後 MP恢復 +" + v.mpROverSafe);
  if (v.petHit) t.push("寵物命中 +" + v.petHit);
  if (v.petDmg) t.push("寵物傷害 +" + v.petDmg);
  if (v.alwaysHit) t.push("必定命中");
  if (v.allowEnh0) t.push("安定值 0 仍可強化");
  if (v.isArrow) t.push("箭矢");
  if (v.eff && EFF_N[v.eff]) t.push(EFF_N[v.eff] + (v.effPct ? "(" + v.effPct + "%)" : ""));
  if (v.sk || (v.grantSkills && v.grantSkills.length)) t.push("裝備時授予額外技能");
  if (v.spd && v.spd !== 1) t.push(v.spd < 1 ? "攻擊速度快" : "攻擊速度慢");
  if (v.w2h || v.twohanded || v.greatsword) t.push("雙手武器");
  if (v.isBow) t.push("弓");
  if (v.ranged) t.push("遠距離");
  if (v.noEnh) t.push("無法強化");
  if (v.enhCap) t.push("強化上限 +" + v.enhCap);
  if (v.noSell) t.push("無法賣店");
  if (v.tradable === false) t.push("無法交易");
  return t;
}


// ---- ✨ 技能效果標籤(2026-09-07;麥哥要求比照原作者做詳細版)----
// gamedata 的 skills 有 49 種欄位,先前只讀了 n/type/tier/mp/reqK/reqM/reqE。
// ⚠ 只翻譯**確認過語意**的欄位(reqWpn 的四種值對照 afk/skills2b.go:85 的 switch)。
const SK_TYPE = { atk: "攻擊", heal: "治癒", buff: "增益", manual: "工具", passive: "被動", convert: "轉換" };
const SK_ELE = { fire: "火", water: "水", wind: "風", earth: "地", none: "無" };
const SK_WPN = { bow: "需裝備弓", nonbow: "需裝備近戰武器(不可用弓)", w2h: "需裝備雙手武器", greatsword: "需裝備巨劍" };
const SK_MEFF = { teleport: "瞬間移動到其他地圖", sense: "偵測周遭環境", charm: "魅惑一隻怪物,使其暫時為你而戰" };
// 增益技能的效果鍵 → 中文(對照 index.html 的 DOLL_FX_N,同一套鍵)
const SK_EFF_N = { str: "力量", dex: "敏捷", con: "體質", int: "智力", wis: "精神", cha: "魅力",
  ac: "防禦 AC", mr: "魔防 MR", er: "迴避 ER", dr: "傷害減免",
  meleeDmg: "近距離傷害", meleeHit: "近距離命中", rangedDmg: "遠距離傷害", rangedHit: "遠距離命中",
  extraDmg: "額外傷害", extraHit: "額外命中", mgd: "魔法傷害", mpR: "MP恢復", hpRegen: "HP回復",
  mhp: "最大HP", mmp: "最大MP", extraMp: "額外魔法點數",
  resFire: "火抗", resWater: "水抗", resWind: "風抗", resEarth: "地抗" };
const PCT_KEYS = new Set(["er", "critM", "critR"]);
function skillBuff(d) {
  if (!d || typeof d !== "object") return [];
  return Object.entries(d).map(([kk, v]) => {
    const nm = SK_EFF_N[kk] || kk;
    // ⚠ ac 在引擎裡是**越低越好**(derived.go: e.Ac -= v),所以 +N 的 ac 對玩家而言是「防禦提升 N」
    if (kk === "ac") return "防禦 AC 提升 " + v;
    return nm + " " + (v > 0 ? "+" : "") + v + (PCT_KEYS.has(kk) ? "%" : "");
  });
}
const SK_STATUS = { poison: "中毒", blind: "黑暗", broken: "防禦破壞", slow: "緩速", stone: "石化",
  weaken: "衰弱", disease: "疾病", vacuum: "真空", sleep: "沉睡", mrhalf: "魔防減半",
  magicseal: "魔法封印", armorbreak: "破甲" };
// 骰子 [n, 面數] → nDf(最小 n、最大 n×f)
const dice = d => Array.isArray(d) && d.length === 2 ? `${d[0]}D${d[1]}(${d[0]}~${d[0] * d[1]})` : "";
function skillFx(v) {
  const t = [];
  if (v.dmgDice) t.push((v.dmgType === "magic" ? "魔法傷害 " : "傷害 ") + dice(v.dmgDice));
  if (v.ele && v.ele !== "none") t.push("屬性:" + (SK_ELE[v.ele] || v.ele));
  if (v.target === "all") t.push("範圍:場上全部敵人");
  if (v.hits) t.push("連續攻擊 " + v.hits + " 次");
  if (v.healDice || v.healBase) t.push("治癒 " + (v.healBase ? "基礎 " + v.healBase + " " : "") + dice(v.healDice));
  if (v.dur) t.push("持續 " + v.dur + " 秒");
  if (v.hpCost) t.push("消耗 HP " + v.hpCost);
  if (v.mpGain) t.push("回復 MP " + v.mpGain);
  if (v.lifesteal) t.push("吸血:造成的傷害轉為自身 HP");
  if (v.instakill) t.push("即死:對「" + (v.instakill.tag === "undead" ? "不死系" : v.instakill.tag) + "」怪物判定,命中即秒殺(BOSS 免疫)");
  if (v.stun) t.push("命中後使目標暈眩");
  if (v.freeze) t.push("冰凍");
  if (v.haste) t.push("加速");
  if (v.drain) t.push("吸取");
  if (v.summon) t.push("召喚夥伴協助作戰");
  if (v.status && SK_STATUS[v.status.kind]) t.push("附加狀態:" + SK_STATUS[v.status.kind] + (v.status.dur ? "(" + v.status.dur + " 秒)" : ""));
  if (v.reqWpn && SK_WPN[v.reqWpn]) t.push(SK_WPN[v.reqWpn]);
  if (v.reqShield) t.push("需裝備盾牌");
  if (v.reqEle) t.push("需妖精屬性:" + (SK_ELE[v.reqEle] || v.reqEle));
  if (v.reqEleAny) t.push("需已選擇任一妖精屬性");
  if (v.ranged) t.push("遠距離");
  if (v.mEff && SK_MEFF[v.mEff]) t.push(SK_MEFF[v.mEff]);
  t.push(...skillBuff(v.d)); // 增益技能的實際數值
  if (v.autoCd) t.push("自動施放冷卻 " + v.autoCd + " 秒");
  return t;
}

let AREA = { zones: [], items: [] };
// 🏪 商店真正販售的清單(wikidump 從 ShopLists/ShopDefaultList 匯出)。
// 🔴 gamedata 的 p 是**基準價**,不等於「商店有賣」——613 件裡商店只賣 107 件,
//    其餘的 p 只用來算賣店回收價(p×0.3)。先前一律標「商店價」會害玩家跑去商店找不到。
let SHOP_SELL = new Set();
try {
  const dump = JSON.parse(fs.readFileSync(path.join(OUT, "mastery.json"), "utf8"));
  AREA = dump.areaDrops || AREA;
  SHOP_SELL = new Set(dump.shopSell || []);
} catch (e) { }

// ⚒💪🔮 強化機率 / 變身型態 / 碧恩詞條 —— 全部由 cmd/wikidump 從 Go 程式**實跑**匯出,
//    不是人工抄的。改了 enhance.go / stage3.go / derived.go 就要重跑 wikidump 再重生。
let WD = {};
try { WD = JSON.parse(fs.readFileSync(path.join(OUT, "mastery.json"), "utf8")); } catch (e) { }

// ---- 資料萃取 ----
const TYPE_NAME = { wpn: "武器", arm: "防具", acc: "飾品", pot: "藥水", misc: "道具", material: "材料", skillbk: "技能書", etc: "其他" };
const ELE_NAME = { fire: "火", water: "水", wind: "風", earth: "地", none: "無", "": "無" };

const items = Object.entries(GD.items || {}).filter(([id, v]) => !hiddenItem(id, v)).map(([id, v]) => ({
  id, n: v.n || id, t: TYPE_NAME[v.type] || v.type || "其他",
  d: v.d || "", legend: v.gachaWeight === 1,
  dmg: v.dmgS ? `${v.dmgS}/${v.dmgL || v.dmgS}` : "", ac: v.ac || 0, safe: v.safe ?? "",
  slot: SLOT_N[v.slot] || "", req: reqStr(v.req), wcat: v.wcat || "",
  p: v.p || 0, sell: Math.floor((v.p || 0) * 3 / 10), buy: SHOP_SELL.has(id),
  fx: itemFx(v),
  src: [],
})).sort((a, b) => a.n.localeCompare(b.n, "zh-Hant"));
const itemOk = new Set(items.map(i => i.id));
// 🔎 道具 → 會掉它的怪(反查)。材料類沒有數值也沒說明,玩家真正想知道的是「哪裡拿」。
//    ⚠ 只放**名字**,不放機率(鐵律①)。
const srcByItem = {};

// 掉落:只列「誰掉什麼」,**不輸出機率**(鐵律①)
const dropsByMobName = {};
for (const [mobN, rows] of Object.entries(GD.mobDrops || {})) {
  const set = new Set();
  for (const r of rows || []) if (r && r[0] && itemOk.has(r[0])) set.add(r[0]);
  dropsByMobName[mobN] = [...set];
}
const itemName = id => (GD.items?.[id]?.n) || id;
for (const [mobN, ids] of Object.entries(dropsByMobName)) {
  for (const id of ids) (srcByItem[id] ||= new Set()).add(mobN);
}

// 🗺 地區採集(afk/sim.go 的 areaBonusMaps/areaBonusItems,經 wikidump 匯出):
//    在這些頻道打**任何**怪都可能掉這幾種素材 —— 元素石那類材料查不到「哪隻怪掉」就是因為它走這條。
const areaZoneNames = AREA.zones.map(z => zoneName[z]).filter(Boolean);
for (const i of items) {
  i.src = [...(srcByItem[i.id] || [])].slice(0, 8);
  if (AREA.items.includes(i.id) && areaZoneNames.length) i.area = areaZoneNames;
}

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
// 標出「地區採集」頻道(在這裡打任何怪都可能掉那幾種素材)
for (const z of zones) if (AREA.zones.includes(z.id)) z.area = AREA.items.map(itemName);

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
  id, n: v.n || id, t: SK_TYPE[v.type] || v.type || "", tier: v.tier || 0, mp: v.mp || 0,
  k: v.reqK || 0, m: v.reqM || 0, e: v.reqE || 0, dk: v.reqD || 0,
  d: (typeof v.d === "string" ? v.d : "") || v.msg || "", fx: skillFx(v),
})).sort((a, b) => (a.tier - b.tier) || a.n.localeCompare(b.n, "zh-Hant"));

const dataJs = "const WIKI=" + JSON.stringify({ items, mobs: mobList, skills, zones, worldbosses, towns, sets }) + ";";
fs.writeFileSync(path.join(OUT, "data.js"), dataJs);
// 🔴 快取破壞(2026-09-07 踩到):GitHub Pages 會把 data.js 快取住 ——
//    改版後玩家拿到**新的 HTML 但舊的 data.js**,新欄位全部讀不到值、整排顯示「—」,
//    看起來就像「資料沒補上」(麥哥就是這樣回報的)。加內容雜湊當版本號,
//    內容一變網址就變,瀏覽器一定重抓。同遊戲本體 goline-adapter.js 的 ?v= 做法。
const DATA_V = require("crypto").createHash("sha1").update(dataJs).digest("hex").slice(0, 8);

// ---- 共用外框 ----
const CSS = `
*{box-sizing:border-box}body{background:#1a140c;color:#e8dcc8;font-family:"Microsoft JhengHei",sans-serif;margin:0;padding:0}
header{background:#241b0f;border-bottom:2px solid #f5c451;padding:14px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{color:#f5c451;font-size:20px;margin:0}
nav a{color:#cbbb9b;text-decoration:none;margin-right:14px;font-size:15px;white-space:nowrap;display:inline-block;line-height:1.9}nav a:hover,nav a.on{color:#f5c451}
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
.mcard{background:#241b0f;border:1px solid #3a2f1c;border-radius:12px;padding:14px 16px;margin-bottom:14px}
.mcard .ttl{color:#f5c451;font-size:17px;font-weight:bold;margin-bottom:2px}
.mcard .sub{color:#b6a684;font-size:14px;line-height:1.75}
.mcard table{margin-top:6px}
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
<a href="mastery.html" class="${active === "mastery" ? "on" : ""}">精通升級數據</a>
<a href="sets.html" class="${active === "set" ? "on" : ""}">套裝效果</a>
<a href="enhance.html" class="${active === "enh" ? "on" : ""}">強化機率</a>
<a href="affix.html" class="${active === "affix" ? "on" : ""}">詞條大全</a>
<a href="poly.html" class="${active === "poly" ? "on" : ""}">變身型態</a>
<a href="guide.html" class="${active === "guide" ? "on" : ""}">新手指南</a>
<a href="changelog.html" class="${active === "log" ? "on" : ""}">版本更新</a>
</nav></header><main>${body}</main>
<footer>資料自動同步自遊戲檔 · 產生於 ${new Date().toISOString().slice(0, 10)}</footer>
${extra.split("data.js").join("data.js?v=" + DATA_V)}</body></html>`;


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
<a class="tile" href="guide.html"><div class="em">🌱</div><div class="tt">新手指南</div><div class="dd">第一次玩看這裡</div></a>
<a class="tile" href="mastery.html"><div class="em">🎓</div><div class="tt">精通升級數據</div><div class="dd">升到滿級要什麼材料</div></a>
<a class="tile" href="sets.html"><div class="em">🛡️</div><div class="tt">套裝效果</div><div class="dd">湊齊有什麼加成</div></a>
<a class="tile" href="enhance.html"><div class="em">⚒️</div><div class="tt">強化機率</div><div class="dd">成功・維持・破壞的實際數字</div></a>
<a class="tile" href="affix.html"><div class="em">🌑</div><div class="tt">詞條大全</div><div class="dd">碧恩祝福・遠古・屬性・暗黑詞條</div></a>
<a class="tile" href="poly.html"><div class="em">💪</div><div class="tt">變身型態</div><div class="dd">46 種變身的加成一次看完</div></a>
<a class="tile" href="changelog.html"><div class="em">📢</div><div class="tt">版本更新</div><div class="dd">最近改了什麼</div></a>
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
<div class="wrap"><table><thead><tr><th>道具</th><th>類型</th><th>部位/類別</th><th>職業</th><th>傷害</th><th>防禦</th><th>安定</th><th>價格</th><th>效果與說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const TS=["全部","武器","防具","飾品","藥水","道具","材料","技能書","其他"];let tf="全部";
$("tchips").innerHTML=TS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#tchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#tchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");tf=c.dataset.t;render();});
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.items.filter(i=>(tf==="全部"||i.t===tf)&&(!q||i.n.toLowerCase().includes(q)||(i.d||"").toLowerCase().includes(q)||(i.fx||[]).some(x=>x.toLowerCase().includes(q))||(i.src||[]).some(x=>x.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(i=>{
const fx=(i.fx||[]).map(x=>"<span class='tag'>"+esc(x)+"</span>").join("");
const desc=i.d?"<div style='color:#b6a684;font-size:13px;margin-top:3px'>"+i.d+"</div>":"";
const src=(i.src&&i.src.length)?"<div style='margin-top:3px;font-size:12px;color:#7bd14a'>📍 掉落:"+i.src.map(x=>esc(x)).join("、")+(i.src.length>=8?" …等":"")+"</div>":"";
const area=(i.area&&i.area.length)?"<div style='margin-top:3px;font-size:12px;color:#7bd14a'>⛏ 採集地區:"+i.area.map(x=>esc(x)).join("、")+"(在這些地方打任何怪都可能掉)</div>":"";
return "<tr><td class='nm'"+(i.legend?" style='color:#ffd700'":"")+">"+(i.legend?"★":"")+esc(i.n)+"</td>"+
"<td class='num'>"+i.t+"</td><td class='num'>"+esc(i.slot||i.wcat||"—")+"</td><td class='num'>"+esc(i.req||"—")+"</td>"+
"<td class='num'>"+(i.dmg||"—")+"</td><td class='num'>"+(i.ac||"—")+"</td>"+
"<td class='num'>"+((i.safe!==""&&(i.t==="武器"||i.t==="防具"))?"+"+i.safe:"—")+"</td>"+
"<td class='num'>"+(i.p?((i.buy?"<div style='color:#7bd14a'>商店賣 "+i.p.toLocaleString()+"</div>":"")+"<div style='color:#b6a684'>賣店回收 "+i.sell.toLocaleString()+"</div>"):"—")+"</td>"+
"<td>"+(fx||desc||src||area?fx+desc+src+area:"<span style='color:#6b5f4c'>—</span>")+"</td></tr>";}).join("")||"<tr><td colspan=9 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 技能 ----
fs.writeFileSync(path.join(OUT, "skills.html"), page("技能介紹", "skill", `
${chips([[skills.length, "技能"], ...["攻擊", "治癒", "增益", "被動", "工具", "轉換"].map(t => [skills.filter(s => s.t === t).length, t])])}
<div class="bar"><input id="q" placeholder="🔍 搜技能名稱、效果(例:即死、吸血、暈眩)"><select id="cls"><option value="all">全職業</option><option value="k">騎士</option><option value="m">法師</option><option value="e">妖精</option><option value="dk">黑暗妖精</option></select></div>
<div class="chips" id="tchips"></div>
<div class="wrap"><table><thead><tr><th>技能</th><th>類型</th><th>階級</th><th>MP</th><th>學習需求</th><th>效果與說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const TS=["全部","攻擊","治癒","增益","被動","工具","轉換"];let tf="全部";
$("tchips").innerHTML=TS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#tchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#tchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");tf=c.dataset.t;render();});
// 學習需求:只列學得到的職業,四個都沒有=不用學(自動取得)
function reqStr(s){const p=[];if(s.k)p.push("騎士 Lv"+s.k);if(s.m)p.push("法師 Lv"+s.m);if(s.e)p.push("妖精 Lv"+s.e);if(s.dk)p.push("黑暗妖精 Lv"+s.dk);return p.length?p.join("<br>"):"—";}
function render(){const q=$("q").value.trim().toLowerCase();const c=$("cls").value;
const list=WIKI.skills.filter(s=>(tf==="全部"||s.t===tf)&&(c==="all"||s[c]>0)&&
  (!q||s.n.toLowerCase().includes(q)||(s.d||"").toLowerCase().includes(q)||(s.fx||[]).some(x=>x.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(s=>{
const fx=(s.fx||[]).map(x=>"<span class='tag'>"+esc(x)+"</span>").join("");
const desc=s.d?"<div style='color:#b6a684;font-size:13px;margin-top:3px'>"+esc(s.d)+"</div>":"";
return "<tr><td class='nm'>"+esc(s.n)+"</td><td class='num'>"+esc(s.t)+"</td><td class='num'>"+(s.tier||"—")+"</td><td class='num'>"+(s.mp||"—")+"</td>"+
"<td class='num' style='font-size:12px'>"+reqStr(s)+"</td>"+
"<td>"+(fx||desc?fx+desc:"<span style='color:#6b5f4c'>—</span>")+"</td></tr>";}).join("")||"<tr><td colspan=6 style='color:#8f8067'>查無符合</td></tr>";}
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
$("tb").innerHTML=list.map(z=>"<tr><td class='nm'>"+esc(z.n)+(z.area?"<div style='font-weight:normal;color:#7bd14a;font-size:12px'>⛏ 採集:"+z.area.map(x=>esc(x)).join("、")+"</div>":"")+"</td><td class='num'>"+z.cat+"</td><td class='num'>"+(z.lvMin?"Lv"+z.lvMin+"~"+z.lvMax:"—")+"</td><td>"+z.mobs.map(m=>"<span class='tag'>"+esc(m)+"</span>").join("")+"</td></tr>").join("")||"<tr><td colspan=4 style='color:#8f8067'>查無符合</td></tr>";}
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


// ================= 🎓 精通升級數據 =================
// 資料來自 Go 的精通表(engine/afk/mastery.go + stage3.go),
// 由 `cd engine && go run ./cmd/wikidump > ../玩家資料站/mastery.json` 匯出。
// 🔴 **調過精通數值就要重跑那支再重生資料站**,否則玩家看到舊數字。
let MASTERY = [];
try { MASTERY = JSON.parse(fs.readFileSync(path.join(OUT, "mastery.json"), "utf8")).mastery || []; }
catch (e) { console.warn("⚠ 找不到 mastery.json → 跳過「精通升級數據」頁。請先跑:cd engine && go run ./cmd/wikidump > ../玩家資料站/mastery.json"); }

if (MASTERY.length) {
  const ABIL_N = { hit: "命中", dmg: "傷害", balance: "平衡(命中+傷害)" };
  // **粗體 → <b>**(Go 那邊的說明用 Markdown 寫,HTML 不會自己渲染)
  const md = s => String(s || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const matStr = m => {
    const nm = m.item === "(綁定武器)" ? "綁定武器" : itemName(m.item);
    return (m.en >= 0 ? "+" + m.en + " " : "") + nm + " ×" + m.n;
  };
  const cell = arr => (arr && arr.length) ? arr.map(matStr).join("<br>") : "—";
  const lvCols = cap => Array.from({ length: cap }, (_, i) => i + 1);

  const secs = MASTERY.map(ms => {
    const rows = ms.levels.map(l => {
      const need = [];
      if (l.exp) need.push("擊殺經驗 " + l.exp.toLocaleString());
      if (l.needs && l.needs.length) need.push(l.needs.map(matStr).join("<br>"));
      const extra = [];
      if (l.gold) extra.push("金幣 " + (l.gold / 10000).toLocaleString() + " 萬");
      if (l.zone) extra.push(zoneName[l.zone] || l.zone);
      return `<tr><td class="nm">Lv${l.from} → Lv${l.to}</td>
        <td>${need.join("<br>") || "—"}</td>
        <td>${cell(l.mats)}${l.gold ? (l.mats && l.mats.length ? "<br>" : "") + "金幣 " + (l.gold / 10000).toLocaleString() + " 萬" : ""}</td>
        <td>${l.zone ? (zoneName[l.zone] || l.zone) : ""}${l.note ? (l.zone ? "<br>" : "") + `<span style="color:#8f8067;font-size:12px">${md(l.note)}</span>` : ""}${!l.zone && !l.note ? "—" : ""}</td></tr>`;
    }).join("");

    // 固定效果 × 等級(力量/敏捷加成、礦道藥水%、魔力奪取吸取量、召喚獸加成)
    const eff = (ms.effects && ms.effects.length) ? `
      <div style="color:#f5c451;font-size:14px;margin:12px 0 4px">能力效果<span style="color:#8f8067;font-size:12px;font-weight:normal">(光環生效才有效)</span></div>
      <div class="wrap"><table><thead><tr><th>效果</th>${lvCols(ms.cap).map(i => `<th>Lv${i}</th>`).join("")}</tr></thead><tbody>
      ${ms.effects.map(e => `<tr><td class="nm">${e.name}</td>${lvCols(ms.cap).map(i => `<td class="num">+${e.values[i] ?? 0}${e.unit || ""}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>` : "";

    // 三選一能力(武器大師/妖精三系)
    const ab = ms.abilities ? `
      <div style="color:#f5c451;font-size:14px;margin:12px 0 4px">三選一能力${ms.abilNote ? ` <span style="color:#8f8067;font-size:12px;font-weight:normal">${md(ms.abilNote)}</span>` : ""}</div>
      <div class="wrap"><table><thead><tr><th>能力</th>${lvCols(5).map(i => `<th>Lv${i}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(ms.abilities).map(([k, v]) => `<tr><td class="nm">${ABIL_N[k] || k}</td>${lvCols(5).map(i => `<td class="num">+${v[i] ?? 0}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>` : "";

    const aura = ms.auraCost ? `
      <div style="color:#f5c451;font-size:14px;margin:12px 0 4px">光環</div>
      <div class="wrap"><table><thead><tr><th>費用</th><th>規則</th></tr></thead><tbody>
      <tr><td class="nm">${ms.auraCost}</td><td style="font-size:13px">${md(ms.auraNote || "")}</td></tr>
      </tbody></table></div>` : "";

    return `<div class="mcard" data-cls="${ms.cls || "全職業"}" data-n="${ms.name}">
      <div class="ttl">${ms.name} <span class="tag">${ms.cls || "全職業"}</span> <span class="tag">上限 Lv${ms.cap}</span></div>
      <div class="sub" style="margin:4px 0 8px">${md(ms.desc)}</div>
      <div style="color:#f5c451;font-size:14px;margin:10px 0 4px">升級表</div>
      <div class="wrap"><table><thead><tr><th>升級</th><th>所需累積</th><th>突破消耗</th><th>指定狩獵區／備註</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${eff}${ab}${aura}</div>`;
  }).join("");

  fs.writeFileSync(path.join(OUT, "mastery.html"), page("精通升級數據", "mastery", `
${chips([[MASTERY.length, "種精通"]])}
<div class="hint">各精通升到滿級需要什麼、練起來加多少。<b>光環要另外花金幣啟用</b>,而且大多在突破後歸零、需重新啟用。</div>
<div class="bar"><input id="q" placeholder="🔍 搜精通名 或 職業(例:妖精)"></div>
<div id="list">${secs}</div>`,
  `<script>
const $=id=>document.getElementById(id);
const cards=[...document.querySelectorAll(".mcard")];
$("q").oninput=()=>{const q=$("q").value.trim().toLowerCase();
cards.forEach(c=>{const hit=!q||c.dataset.n.toLowerCase().includes(q)||c.dataset.cls.toLowerCase().includes(q);c.style.display=hit?"":"none";});};
</script>`));
}

// ================= 📢 版本更新 =================
let CHANGES = [];
try { CHANGES = JSON.parse(fs.readFileSync(path.join(OUT, "changelog.json"), "utf8")); } catch (e) { }
{
  const TCOL = { "新增": "#7bd14a", "調整": "#5b9bff", "修復": "#f5c451" };
  // **粗體** → <b>(內容用 Markdown 寫,HTML 不會自己渲染)
  const md = t => String(t || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const cnt = its => ["新增", "調整", "修復"].map(t => [its.filter(i => i.t === t).length, t]).filter(([n]) => n > 0);
  const body = CHANGES.map(d => `<div class="mcard">
    <div class="ttl">${d.date}${d.title ? " ・ " + d.title : ""}</div>
    ${d.note ? `<div class="sub" style="margin:2px 0 8px">${md(d.note)}</div>` : ""}
    <div class="stats" style="margin:6px 0 10px;justify-content:flex-start">${cnt(d.items).map(([n, t]) => `<div class="stat-chip" style="padding:5px 12px;font-size:13px"><b style="color:${TCOL[t]}">${n}</b>${t}</div>`).join("")}</div>
    ${d.items.map(i => `<div style="padding:9px 0;border-bottom:1px solid #2a2014">
      <span class="tag" style="color:${TCOL[i.t] || "#cbbb9b"}">${i.t}</span> <b style="color:#e8dcc8">${i.n}</b>
      ${i.d ? `<div class="sub" style="margin-top:4px">${md(i.d)}</div>` : ""}</div>`).join("")}
  </div>`).join("") || '<div class="hint">尚無更新紀錄。</div>';
  fs.writeFileSync(path.join(OUT, "changelog.html"), page("版本更新", "log", `
<div class="hint">遊戲的新增、調整與修復紀錄(由新到舊)。</div>
${body}`));
}

// ================= 🔮 碧恩詞條(祝福/詛咒・遠古・屬性)=================
// 🔴 效果數值由 cmd/wikidump **實跑 applyBless/applyAnc/attrAffixes** 匯出;
//    機率對齊 engine/afk/bian.go 的 BianBless 三分支 + engine/affixroll.go。
//    社群那份人工抄的把「武器的傷害值」誤植成「防具的抗性值」,這裡不再人工維護。
let BIAN_SEC = "";
if (WD.bianOdds && WD.bianOdds.length) {
  const pc = v => (Math.round(v * 100) / 100) + "%";
  const grp = g => WD.bianOdds.filter(o => o.group === g);
  const oddRows = g => grp(g).map(o => `<tr><td class="nm">${o.name}</td><td class="num" style="color:#6ee7b7">${pc(o.pct)}</td></tr>`).join("");
  const effTbl = rows => `<div class="wrap"><table><thead><tr><th>詞條</th><th>武器</th><th>防具</th><th>飾品</th></tr></thead><tbody>
    ${[...new Set(rows.map(r => r.name))].map(n => {
      const g = sl => { const r = rows.find(x => x.name === n && x.slot === sl); return (r && r.eff && r.eff.length) ? r.eff.join("<br>") : "—"; };
      return `<tr><td class="nm">${n}</td><td>${g("武器")}</td><td>${g("防具")}</td><td>${g("飾品")}</td></tr>`;
    }).join("")}
  </tbody></table></div>`;

  const attr = WD.attrAffix || [];
  const TN = { 1: "第一階", 3: "第二階", 5: "第三階" };
  const attrRows = attr.map(a => `<tr><td class="nm">${a.name}</td><td class="num">${TN[a.tier]}</td>
    <td class="num" style="color:#6ee7b7">+${a.fix}</td>
    <td class="num" style="color:#fbbf24">剋「${a.beats}」再 +${a.counter}</td>
    <td class="num">${a.ele}抗 +${a.res}</td><td class="num">+${a.mr}</td></tr>`).join("");

  BIAN_SEC = `<div class="mcard"><div class="ttl">① 碧恩是誰、怎麼用</div><div class="sub">
把<b>武器或裝備</b>拿去<b>象牙塔</b>找 NPC <b>碧恩</b>,消耗對應的「賦予祝福卷軸」(武器/防具/飾品三種,別拿錯),
就會<b>隨機</b>從下面三系抽一個結果掛上去。<br><br>
🔴 <b>最重要的一件事:重複刷會洗掉</b>。<br>
　・抽到<b>和身上同一個</b>詞條 → 該詞條<b>直接消失</b>。<br>
　・抽到<b>同系但不同</b>的詞條 → <b>取代</b>舊的那個。<br>
　・三系<b>互不影響</b>,可以同時存在(例如同一把武器可以既是「祝福的」又是「永恆」又帶「爆炎」)。<br><br>
・被<b>詛咒</b>的裝備<b>脫不下來</b>,而且<b>不能再施加祝福</b>,要先用「解除詛咒卷軸」。<br>
・<b>鎖定中</b>的裝備、<b>寵物裝備</b>不能改詞條。<br>
・當作材料的<b>卷軸本身不能帶詞條</b>,否則系統不認。
</div></div>

<div class="mcard"><div class="ttl">② 抽中什麼的機率</div>
<div class="sub">三系各占 <b>1/3</b>,再從系內細分。以下加總剛好 100%。</div>
<div style="display:flex;gap:18px;flex-wrap:wrap">
  <div style="flex:1;min-width:240px"><div style="color:#f5c451;font-size:14px;margin:10px 0 4px">祝福系(合計 33.33%)</div>
    <div class="wrap"><table><thead><tr><th>結果</th><th>機率</th></tr></thead><tbody>${oddRows("祝福系")}</tbody></table></div></div>
  <div style="flex:1;min-width:240px"><div style="color:#f5c451;font-size:14px;margin:10px 0 4px">遠古系(合計 33.33%)</div>
    <div class="wrap"><table><thead><tr><th>結果</th><th>機率</th></tr></thead><tbody>${oddRows("遠古系")}</tbody></table></div></div>
  <div style="flex:1;min-width:240px"><div style="color:#f5c451;font-size:14px;margin:10px 0 4px">屬性系(合計 33.33%)</div>
    <div class="wrap"><table><thead><tr><th>結果</th><th>機率</th></tr></thead><tbody>${oddRows("屬性系")}</tbody></table></div></div>
</div></div>

<div class="mcard"><div class="ttl">③ 祝福的 / 詛咒的 效果</div>
<div class="sub">同一個位置只會有其中一個。<b>防禦 AC 在遊戲內是數字越低越強</b>,這裡已經換算成白話。</div>
${effTbl(WD.bless || [])}</div>

<div class="mcard"><div class="ttl">④ 遠古系四變體</div>
<div class="sub">四種變體強化的方向完全不同,<b>沒有絕對最好的</b>,看你要傷害、命中還是防禦。</div>
${effTbl(WD.anc || [])}</div>

<div class="mcard"><div class="ttl">⑤ 屬性詞條(含對剋加成)</div>
<div class="sub">🔴 <b>屬性武器真正的價值在「對剋」</b>:打到被自己剋制的屬性怪時,除了基本固定傷害,<b>還會再加一筆</b>。<br>
對剋關係:<b>火剋地、水剋火、風剋水、地剋風</b>。防具與飾品則是提供該屬性的抗性與魔防。</div>
<div class="wrap"><table><thead><tr><th>詞條</th><th>階</th><th>武器固定傷害</th><th>武器對剋加成</th><th>防具/飾品抗性</th><th>防具/飾品魔防</th></tr></thead>
<tbody>${attrRows}</tbody></table></div>
<div class="sub" style="margin-top:6px">例:帶「火靈」的武器打<b>地屬性</b>的怪 → 固定傷害 +5,再加對剋 +12,合計每下 <b>+17</b>。打其他屬性只有 +5。</div></div>`;
}

// ================= 🌑 暗黑詞條 =================
let AFFIX = [];
try { AFFIX = JSON.parse(fs.readFileSync(path.join(OUT, "mastery.json"), "utf8")).affixes || []; } catch (e) { }
if (AFFIX.length) {
  const TIER = [["灰", "普通", "#cbbb9b"], ["藍", "稀有", "#5b9bff"], ["暗金", "傳說", "#f5c451"]];
  const pct = v => (Math.round(v * 10000) / 100) + "%";
  const band = b => b.lo === b.hi ? ("+" + b.lo) : ("+" + b.lo + " ~ +" + b.hi);
  const secs = AFFIX.map(a => {
    const nm = itemName(a.item);
    // 「抽到 1 條且為暗金」= 1 條的機率 × 暗金的機率
    const oneGold = a.countProb[1] * a.colorProb[2];
    const twoGold = a.countProb[2] * a.colorProb[2] * a.colorProb[2];
    return `<div class="mcard">
      <div class="ttl">${nm}</div>
      <div class="sub" style="margin:4px 0 10px">共 <b>${a.pool.length}</b> 種詞條。掉落時先決定「帶幾條」,再決定每一條的品階,最後在該品階的區間內隨機取值。</div>

      <div style="color:#f5c451;font-size:14px;margin:10px 0 4px">① 帶幾條詞條</div>
      <div class="wrap"><table><thead><tr><th>詞條數量</th><th>機率</th><th>說明</th></tr></thead><tbody>
        <tr><td class="nm">0 條</td><td class="num">${pct(a.countProb[0])}</td><td>白板(沒有任何暗黑詞條)</td></tr>
        <tr><td class="nm">1 條</td><td class="num">${pct(a.countProb[1])}</td><td>單詞條</td></tr>
        <tr><td class="nm">2 條</td><td class="num" style="color:#7bd14a">${pct(a.countProb[2])}</td><td>雙詞條(兩條必為<b>不同</b>詞條)</td></tr>
      </tbody></table></div>
      <div class="hint">也就是說,撿到<b>帶詞條</b>的機率 ${pct(a.countProb[1] + a.countProb[2])},其中雙詞條只有 ${pct(a.countProb[2])}。</div>

      <div style="color:#f5c451;font-size:14px;margin:14px 0 4px">② 每一條的品階(顏色越亮越強)</div>
      <div class="wrap"><table><thead><tr><th>品階</th><th>機率</th><th>強度</th></tr></thead><tbody>
        ${TIER.map((t, i) => `<tr><td class="nm" style="color:${t[2]}">${t[0]}　${t[1]}</td><td class="num">${pct(a.colorProb[i])}</td><td>${["數值最低", "中等", "該詞條最高值"][i]}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="hint">一件裝備上的每一條詞條<b>各自獨立</b>決定品階(同一件可能一條灰、一條暗金)。<br>
      例:抽到「1 條且為暗金」約 <b>${pct(oneGold)}</b>;「雙詞條且兩條都暗金」約 <b>${pct(twoGold)}</b> —— 極其稀有。</div>

      <div style="color:#f5c451;font-size:14px;margin:14px 0 4px">③ 詞條池總表</div>
      <div class="wrap"><table><thead><tr><th>詞條</th>${TIER.map(t => `<th style="color:${t[2]}">${t[0]}</th>`).join("")}</tr></thead><tbody>
        ${a.pool.map(d => `<tr><td class="nm">${d.name}</td>${d.bands.map((b, i) => `<td class="num" style="color:${TIER[i][2]}">${band(b)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
    </div>`;
  }).join("");

  fs.writeFileSync(path.join(OUT, "affix.html"), page("詞條大全", "affix", `
<div class="hint">這頁包含兩套完全不同的詞條系統:<b>碧恩詞條</b>(自己拿卷軸去刷的)與<b>暗黑詞條</b>(掉落時就決定好的)。</div>
${BIAN_SEC}
<div class="hint" style="margin-top:18px">──────── 以下是<b>暗黑詞條</b> ────────</div>
<div class="hint">效仿暗黑破壞神的隨機詞條:部分裝備掉落時會<b>額外隨機附帶</b>能力。每件掉落各自獨立擲,同一款裝備每一件都可能不同。</div>
${secs}
<div class="mcard"><div class="ttl">注意事項</div><div class="sub">
・詞條在<b>掉落當下一次擲定</b>,之後<b>不可洗、不可改</b>。<br>
・帶詞條的裝備<b>每件獨立佔一格</b>,不會和其他同名裝備疊在同一格。<br>
・詞條效果直接計入你的能力(近傷/命中/HP/MP/防禦等),與強化、屬性、祝福、遠古等其他詞綴<b>可同時存在、分開計算</b>。
</div></div>`));
}

// ================= ⚒ 強化機率 =================
// 🔴 數字全部由 cmd/wikidump 從 engine/afk/enhance.go **實跑匯出**。
// 【呈現方式】gamedata 實測:武器只有安定 6(114 件)與安定 0(7 件,禁強化);
//   防具只有安定 4(109)、安定 6(24)、安定 0(13,禁強化)。強化上限 enhMax=12。
//   ⇒ 不必讓玩家自己換算「超過安定值第幾次」,直接印實際強化值,而且列數剛好對齊。
//   ⇒ 破壞率「一般卷與祝福卷完全相同」⇒ 兩張表併成一張,少一半視覺量。
if (WD.enh && WD.enh.length) {
  const CAP = 12;
  const pc = v => { const r = Math.round(v * 100) / 100; return (r === 0 ? "0" : String(r)) + "%"; };
  const T = (slot, kind) => (WD.enh.find(t => t.slot === slot && t.kind === kind) || { steps: [] });
  // 一格:成功率(大)+ 維持(小字)。維持 0 就不寫,免得洗版。
  const cellOf = st => `<b style="color:#6ee7b7">${pc(st.succ)}</b>` +
    (st.stay > 0 ? `<div style="font-size:12px;color:#8a7f6a">維持 ${pc(st.stay)}</div>` : "");
  const lv = (safe, off) => (safe + off >= CAP) ? "—" : `+${safe + off} → +${safe + off + 1}`;

  const wn = T("武器", "一般卷軸").steps, wb = T("武器", "祝福卷軸").steps;
  const wpnRows = wn.map((st, i) => lv(6, i) === "—" ? "" : `<tr><td class="nm">${lv(6, i)}</td>
    <td>${cellOf(st)}</td><td>${cellOf(wb[i] || st)}</td>
    <td style="color:#fca5a5">${pc(st.destroy)}</td></tr>`).join("");

  const an = T("防具", "一般卷軸").steps, ab = T("防具", "祝福卷軸").steps;
  const armRows = an.map((st, i) => `<tr><td class="nm">${lv(4, i)}</td><td class="nm">${lv(6, i)}</td>
    <td>${cellOf(st)}</td><td>${cellOf(ab[i] || st)}</td>
    <td style="color:#fca5a5">${pc(st.destroy)}</td></tr>`).join("");

  const acc = T("飾品", "一般卷軸").steps;
  const accRows = acc.map(st => `<tr><td class="nm">+${st.off} → +${st.off + 1}</td>
    <td><b style="color:#6ee7b7">${pc(st.succ)}</b></td>
    <td style="color:#fca5a5">${pc(st.destroy)}</td></tr>`).join("");

  const jump = (WD.blessJump || []).map(j =>
    `<tr><td class="nm">+${j.from} ～ +${j.to}</td><td class="num" style="color:#6ee7b7">${j.text.replace("+1 ～ +1", "+1")}</td></tr>`).join("");

  fs.writeFileSync(path.join(OUT, "enhance.html"), page("強化機率", "enh", `
<div class="hint">下面是<b>實際程式使用的數字</b>,直接從伺服器匯出。
<b>沒列到的強化值 = 100% 成功</b>(安定值以內不會失敗、不會消失),表格從開始要賭的那一階列起。</div>

<div class="mcard"><div class="ttl">武器</div>
<div class="sub">遊戲裡的武器<b>安定值一律是 6</b>,所以 +6 以內免費,<b>+6 之後才開始賭</b>。</div>
<div class="wrap"><table><thead><tr><th>強化</th><th>一般卷軸</th><th>祝福卷軸</th><th>破壞</th></tr></thead>
<tbody>${wpnRows}</tbody></table></div>
<div class="sub" style="margin-top:8px">👉 <b>+9 是一道牆</b>:+9 之前每次都有三分之一機會,+9 往上成功率剩不到 1%。
但從 +9 開始出現「<b>維持</b>」——失敗時有三成機率只是原地不動,<b>裝備不會消失</b>。</div></div>

<div class="mcard"><div class="ttl">防具</div>
<div class="sub">防具的安定值有 <b>4</b> 和 <b>6</b> 兩種(道具圖鑑每件都有標)。兩者用<b>同一組機率</b>,
只是起跑點不同 —— 所以<b>安定值 6 的防具,等於難度整整少了兩階</b>。</div>
<div class="wrap"><table><thead><tr><th>安定值 4 的防具</th><th>安定值 6 的防具</th><th>一般卷軸</th><th>祝福卷軸</th><th>破壞</th></tr></thead>
<tbody>${armRows}</tbody></table></div>
<div class="sub" style="margin-top:8px">👉 防具<b>前五階沒有「維持」</b>,失敗就是破壞。「—」表示已經到強化上限 +12。</div></div>

<div class="mcard"><div class="ttl">飾品(戒指・項鍊・腰帶)</div>
<div class="sub">飾品<b>沒有安定值</b>,從 +0 就要賭,而且<b>失敗一律破壞,沒有「維持」</b>。</div>
<div class="wrap"><table><thead><tr><th>強化</th><th>成功</th><th>破壞</th></tr></thead><tbody>${accRows}</tbody></table></div>
<div class="sub" style="margin-top:8px">+3 以上一律 20%。</div></div>

<div class="mcard"><div class="ttl">祝福卷軸值不值得?值得</div>
<div class="sub">祝福卷軸的<b>破壞率跟一般卷一模一樣</b>(上面每張表的「破壞」欄兩種卷共用),
但<b>成功率高很多</b>,而且<b>成功時會一次跳好幾級</b>。<br>
例:武器 <b>+9→+10</b>,一般卷 <b style="color:#6ee7b7">0.9%</b>、祝福卷 <b style="color:#6ee7b7">3.33%</b> —— 差 <b>3.7 倍</b>,爆的機率卻完全一樣。</div>
<div style="color:#f5c451;font-size:14px;margin:12px 0 4px">祝福卷成功時一次 +幾(武器・防具)</div>
<div class="wrap"><table><thead><tr><th>強化前</th><th>一次 +幾</th></tr></thead><tbody>${jump}</tbody></table></div>
<div class="sub" style="margin-top:6px">飾品用祝福卷成功時 <b>+1 ～ +3</b>。</div></div>

<div class="mcard"><div class="ttl">還有這些要知道</div><div class="sub">
・<b>安定值 0 的武器與防具禁止強化</b>,系統會直接擋下。<br>
・<b>鎖定(🔓)中的裝備無法強化</b>,要先解鎖。<br>
・<b>一鍵安全強化</b>只把裝備推到安定值為止,完全不進賭局,<b>不會破壞</b>。<br>
・持有<b>必成卷軸</b>時,只有在「已經超過安定值」的那一下才會消耗,安全區內不會浪費。<br>
・少數活動裝備有<b>自己的固定成功率</b>,不走上面的表(也吃不到祝福卷跳級)。
</div></div>`));
}


// ================= 💪 變身型態 =================
// 🔴 由 cmd/wikidump 從 engine/afk/stage3.go 的 polyTiers 匯出(46 種,含 polyAbilityTextGo 的文字)。
if (WD.poly && WD.poly.length) {
  // AC 在引擎是「越低越好」,polyAbilityTextGo 直接輸出 AC-1,玩家會誤讀成防禦下降 → 翻成白話。
  // AC 在引擎是「越低越好」,polyAbilityTextGo 直接輸出 AC-1,玩家會誤讀成防禦下降 → 翻成白話。
  // ⚠ 刻意不用正則(這份檔案是腳本生成的,反斜線會被吃掉一層)。
  const POLY_T = [["AC-", "防禦 AC 提升 "], ["AC+", "防禦 AC 下降 "], ["MR+", "魔防 MR+"], ["ER+", "閃避 ER+"]];
  const polyEff = t => String(t || "—").split("、").map(x => {
    for (const [k, v] of POLY_T) if (x.indexOf(k) === 0) return v + x.slice(k.length);
    return x;
  }).join("、");
  const secs = WD.poly.map(t => {
    const lv = t.max >= 9999 ? `Lv ${t.min} 以上` : `Lv ${t.min} ～ ${t.max}`;
    return `<div class="mcard"><div class="ttl">${lv}<span class="sub" style="margin-left:8px">共 ${t.forms.length} 種</span></div>
    <div class="wrap"><table><thead><tr><th>型態</th><th>加成</th></tr></thead><tbody>
    ${t.forms.map(f => `<tr><td class="nm">${f.name}</td><td>${polyEff(f.eff)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }).join("");

  fs.writeFileSync(path.join(OUT, "poly.html"), page("變身型態", "poly", `
<div class="hint">使用<b>變形卷軸</b>會依你<b>當下的等級</b>,從該等級的名單中<b>隨機</b>變成一種。
背包裡帶著<b>變形控制戒指</b>(不用裝備,放背包就生效)就可以<b>指定</b>要變哪一種。</div>

<div class="mcard"><div class="ttl">重點</div><div class="sub">
・<b>只能變成「你目前等級」那一段的型態</b>。等級跨過門檻後,能變的名單就整個換掉。<br>
・<b>沒有變形控制戒指 = 隨機</b>,有戒指才能點名。<br>
・變身效果<b>疊在你原本的能力上</b>,不會取代裝備加成。<br>
・「攻速」是<b>百分比</b>加成,其餘都是平加。
</div></div>
${secs}`));
}

// ================= 🌱 新手指南(手寫文案;不隨 gamedata 變動) =================
// ⚠ 這頁**不是自動生成**,遊戲規則改了要回來手動更新。
//    刻意只寫「不太會變」的東西(職業特性、流程、名詞解釋),避開會頻繁調整的數值。
fs.writeFileSync(path.join(OUT, "guide.html"), page("新手指南", "guide", `
<div class="hint">第一次玩?這頁從頭帶你一遍。看不懂的名詞下面都有解釋。</div>

<div class="mcard"><div class="ttl">📱 先把遊戲加到手機桌面(強烈建議)</div>
<div class="sub">加到桌面之後會像 App 一樣<b>全螢幕、沒有網址列</b>,而且<b>只有這樣才能開啟遊戲內的推播通知</b>。</div>

<div style="color:#f5c451;font-size:14px;margin:12px 0 4px">iPhone / iPad</div>
<div class="sub">
① 一定要用<b>內建的 Safari</b> 開遊戲網站(用 Chrome、LINE 內建瀏覽器都<b>不行</b>)<br>
② 點畫面<b>下方中間的「分享」</b>按鈕(向上箭頭那個)<br>
③ 往下滑,點<b>「顯示更多」</b><br>
④ 找到<b>「加入主畫面」</b>,點右上角<b>「加入」</b><br>
⑤ 回到桌面就會看到 App 圖示,以後從那裡進遊戲
</div>

<div style="color:#f5c451;font-size:14px;margin:12px 0 4px">Android</div>
<div class="sub">
① 用瀏覽器開遊戲網站<br>
② 點右上角<b>「⋮」</b>選單<br>
③ 選<b>「安裝應用程式」</b>或<b>「加入主畫面」</b>(不同手機字不一樣)<br>
④ 之後從桌面圖示啟動,就是全螢幕、沒有網址列
</div>

<div style="color:#f5c451;font-size:14px;margin:12px 0 4px">🔔 推播通知</div>
<div class="sub">
加到桌面之後,<b>從桌面圖示進遊戲</b>才能在遊戲內開啟推播。目前提供兩種:<br>
・<b>伺服器重啟</b> —— 維護或更新重開時通知你<br>
・<b>離線掛機中斷</b> —— 掛機被打斷時通知你<br>
直接在瀏覽器裡開的話,系統不會給推播權限。
</div></div>

<div class="mcard"><div class="ttl">① 這是什麼遊戲</div>
<div class="sub">天堂懷舊風的<b>放置型</b>遊戲。選好獵場掛著,角色會自動打怪、自動撿裝備、自動升級 ——
<b>關掉網頁也會繼續打</b>。你要做的是:決定去哪練、把裝備養起來、有空來收成果。</div></div>

<div class="mcard"><div class="ttl">② 選職業</div>
<div class="wrap"><table><thead><tr><th>職業</th><th>特色</th><th>適合誰</th></tr></thead><tbody>
<tr><td class="nm">騎士</td><td>血厚、近戰、耐打。裝備需求最直覺,練起來最穩。</td><td><b>第一次玩就選這個</b></td></tr>
<tr><td class="nm">法師</td><td>魔法攻擊、範圍傷害,可以召喚寵物幫忙打。</td><td>喜歡一次清一片</td></tr>
<tr><td class="nm">妖精</td><td>可遠可近:拿弓走遠程,拿刀走近戰。變化最多。</td><td>喜歡研究搭配</td></tr>
<tr><td class="nm">黑暗妖精</td><td>妖精的暗黑版,走爆發與特殊機制。</td><td>玩過一輪再嘗試</td></tr>
</tbody></table></div>
<div class="hint">💡 一個帳號可以開多個角色,不用怕選錯。</div></div>

<div class="mcard"><div class="ttl">③ 開場十分鐘該做什麼</div>
<div class="sub">
<b>1.</b> 建好角色後直接進「狩獵場 → 野外 → 新兵修練場」開始掛。<br>
<b>2.</b> 打一陣子後開背包,把撿到的<b>武器和防具穿起來</b>(數值比較高的就換)。<br>
<b>3.</b> 等級上去後回獵場列表,換到<b>建議等級接近你等級</b>的地方 —— 打太弱的怪經驗少,打太強的打不動。<br>
<b>4.</b> 用不到的裝備可以賣掉換金幣,或放到交易所賣給其他玩家。
</div>
<div class="hint">💡 <a href="zones.html" style="color:#f5c451">獵場列表</a>可以查每個獵場的怪物等級。</div></div>

<div class="mcard"><div class="ttl">④ 強化裝備(最重要的成長)</div>
<div class="sub">
撿到的<b>對武器施法的卷軸</b>／<b>對盔甲施法的卷軸</b>可以用來強化裝備,每成功一次 +1。<br><br>
🔴 <b>「安定值」是關鍵</b>:每件裝備都有一個安定值。<b>強化到安定值以內一定成功</b>,
超過之後就有機率<b>失敗並毀掉裝備</b>。武器多半是 6、防具多半是 4。<br><br>
所以新手的安全做法是:<b>先強化到安定值就停</b>,想衝更高再拿不心疼的裝備試。
</div>
<div class="hint">💡 <a href="items.html" style="color:#f5c451">道具圖鑑</a>每件裝備都有標安定值。祝福過的卷軸成功率更好。</div></div>

<div class="mcard"><div class="ttl">⑤ 名詞解釋</div>
<div class="wrap"><table><thead><tr><th>名詞</th><th>意思</th></tr></thead><tbody>
<tr><td class="nm">安定值</td><td>強化到這個數字以內不會失敗,超過才有風險。</td></tr>
<tr><td class="nm">精通</td><td>長期養成系統。投入材料升級,開啟「光環」後才會生效,光環要花金幣維持。</td></tr>
<tr><td class="nm">光環</td><td>精通的效果開關。花金幣買時數,<b>突破後會歸零要重開</b>。</td></tr>
<tr><td class="nm">世界王</td><td>定時重生的大王,大家一起打,參戰有機會拿到專屬掉落。</td></tr>
<tr><td class="nm">血盟</td><td>玩家公會。全盟共享經驗與金幣加成,但要靠成員捐獻維持。</td></tr>
<tr><td class="nm">交易所</td><td>玩家之間買賣裝備的地方。上架要付售價 1% 的手續費。</td></tr>
<tr><td class="nm">★ 傳說</td><td>本站標示 ★ 的是傳說級道具,極為稀有。</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">⑥ 常見問題</div>
<div class="sub">
<b>Q:關掉網頁角色還會打嗎?</b><br>會。這是放置遊戲,離線也持續累積。<br><br>
<b>Q:練到一半該換獵場嗎?</b><br>會的。怪物給的經驗跟等級差有關,建議等級接近你的獵場效率最好。<br><br>
<b>Q:裝備強化失敗會怎樣?</b><br>超過安定值失敗會<b>毀掉那件裝備</b>。所以貴重裝備別硬衝。<br><br>
<b>Q:精通要不要練?</b><br>那是中後期的長期投資,前期先把等級跟裝備顧好。<br><br>
<b>Q:為什麼我的精通加成沒生效?</b><br>光環沒開,或是突破後歸零了。要花金幣重新啟用。<br><br>
<b>Q:怎麼知道某個道具哪裡打?</b><br>到<a href="monsters.html" style="color:#f5c451">怪物掉落圖鑑</a>直接搜道具名,會列出所有掉它的怪和出沒地點。
</div></div>

<div class="mcard"><div class="ttl">⑦ 接下來看哪裡</div>
<div class="sub">
<a href="zones.html" style="color:#f5c451">獵場列表</a> — 幾等該去哪練<br>
<a href="monsters.html" style="color:#f5c451">怪物掉落圖鑑</a> — 想要的道具哪裡打<br>
<a href="items.html" style="color:#f5c451">道具圖鑑</a> — 裝備數值與安定值<br>
<a href="mastery.html" style="color:#f5c451">精通升級數據</a> — 中後期的養成目標<br>
<a href="npc.html" style="color:#f5c451">NPC 一覽</a> — 誰在哪個村莊、能做什麼
</div></div>
`));

console.log("OK(純文字表格): 怪 " + mobList.length + " / 道具 " + items.length + " / 技能 " + skills.length +
  " / 獵場 " + zones.length + " / 世界王 " + worldbosses.length + " / 村莊 " + towns.length + " / 套裝 " + sets.length +
  " / 精通 " + MASTERY.length + " / 更新日誌 " + CHANGES.reduce((s, d) => s + d.items.length, 0) + " 項");

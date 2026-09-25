// gen.js — 阿肥放置天地 玩家資料站產生器
// 用法:node gen.js(讀 ../go端專案/gamedata.json → 生成各頁 + data.js + 圖示同步)
//
// 🔴 兩條鐵律
//  ① **絕不輸出掉落機率 %**(營運機密;2026-09-07 麥哥再次確認維持不公開)。
//     伺服器下發給前端的 gamedata 也會 delete mobDrops,所以玩家挖不到——這裡跟著守住才有意義。
//  ② **未開放的內容不可出現**(見下方 FEAT):遊戲裡 13 項內容開關全收起,
//     資料站若照 gamedata 全列,玩家會看到進不去的頻道與拿不到的道具,分批放內容的節奏就破功了。
const fs = require("fs");
const path = require("path");

// 🔗 對外連結(首頁最下方的「開始遊戲 & 加入社群」用)。
//    ⚠ 換 Discord 邀請碼、換 LINE 社群、改 LINE ID 就改這裡,不要去改 index.html
//      (index.html 是本檔產生的,手改會被下次 gen.js 蓋掉)。
//    ⚠ LINE 社群網址不要帶 ?utm_source=... 那串(LINE「複製連結」自動加的追蹤參數,
//      沒有作用只是變長;拿掉後實測行為完全相同)。
const LINKS = {
    game: "https://afei.gg/",
    gameLabel: "afei.gg",
    discord: "https://discord.gg/cP7fh2jRXA",
    lineGroup: "https://line.me/ti/g2/qRBgqtR_BIo7qZ9fd5ZDPV3wLehoG9gkTUtk0w",
    lineId: "@068ivpaq",
};

const GD = JSON.parse(fs.readFileSync(path.join(__dirname, "../go端專案/gamedata.json"), "utf8"));
const OUT = __dirname;

// ---- 🎁 兌換配方(2026-09-19:玩家找不到「解除詛咒的卷軸」的出處)----
// 資料來源:`exchange.json`,由 `cd engine && go run ./cmd/exchangedump -json ../玩家資料站/exchange.json` 匯出
//   (真相源=Go 的 afk.ExchangeRecipes + afk.RingwizRecipes + gamedata 的 towns/items)。
// 為什麼要這個檔:兌換配方寫在 Go 的靜態表裡,gamedata 只有一句 NPC 說明,
//   克里斯特那句「以施法卷軸與金幣交換『賦予祝福卷軸』」完全沒提到解除詛咒卷軸
//   ⇒ 那張卷軸全遊戲只有這一條產線,官網卻查不到,玩家只能亂猜。
// 🔴 **改了兌換配方就重跑那支工具**,不要手改 exchange.json,也**不要為了這件事去跑 wikidump**
//    (wikidump 會連強化機率一起重寫,那是刻意維持舊值的)。
let EXCHANGE = [];
try { EXCHANGE = JSON.parse(fs.readFileSync(path.join(__dirname, "exchange.json"), "utf8")); } catch (e) { }
// 配方 → 一行白話(「金幣 1,000,000 + 對武器施法的卷軸 ×100」)
const recipeCost = r => [
  r.gold ? "金幣 " + r.gold.toLocaleString() : "",
  ...(r.req || []).map(q => q.n + (q.cnt > 1 ? " ×" + q.cnt : "")),
].filter(Boolean).join(" + ");
// NPC id → 該 NPC 的兌換清單(給 NPC 頁);產物 id → 在哪裡換得到(給道具頁)
const exByNpc = {}, exByOut = {};
for (const n of EXCHANGE) {
  exByNpc[n.id] = (n.recipes || []).map(r => (r.name ? r.name + "：" : "") + recipeCost(r) + " → " + r.out);
  for (const r of n.recipes || []) (exByOut[r.outId] ||= []).push(`${n.town}「${n.n}」兌換：${recipeCost(r)}`);
}

// ---- 🎚 內容開關(必須與遊戲裡的 `feature` 指令狀態一致)----
// 遊戲裡下 `feature xxx on` 開放某內容後,**把這裡也改成 true 再重跑 gen.js**,資料站就會自動補上。
// 對照:go端專案/.ai/systems/內容開關.md 的狀態表。
const FEAT = {
  tianfa: false, // 天罰之地 / 傲慢之塔(19 個頻道 + 奇美拉之皮/傳送符等道具)
  castle:  false, // 城堡爭奪戰
  doll:    true,  // 娃娃卡片(2026-09-26 12:30 隨中秋活動開放;遊戲 `feature doll on`)
  bm:      false, // 黑市商人
  push:    false, // 推筒子
  dice:    false, // 園區
  slot:    false, // 肥特
  glory:   false, // 榮光進化(精通)
  potion:  false, // 嗑藥大師(精通)
  codex:   true, // 📖 圖鑑登錄(2026-09-14 改版;麥哥:官網只寫 Lv1~39 規則與效果,Lv40+/世界王/加成表不上;feature codex 開放後改 true 生成 codex.html)
  mcard:   false, // 商城:精通洗鍊卡 / 精通轉換卡
  trial50: false, // 📜 50 級試煉(燃柳村 迪嘉勒廷)——麥哥 2026-09-16 拍板收起,遊戲內 NPC 也一起收
                  //    ⚠ 必須與遊戲的 `feature trial50` 同步:那邊開放了,這裡才改 true 重發布
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
// 🐉 封閉頻道:遊戲裡由 engine/afk/zonegate.go 的 BlockedZones 擋死(連封包硬送都會被回
//    「此頻道已關閉」)。三龍窟的怪是 Lv93~95、血 12~15 萬,而角色等級上限只有 55 ⇒
//    玩家永遠碰不到。列在資料站上只會讓人問「三龍窟怎麼進」(2026-09-09 麥哥拍板關掉)。
//    ⚠ 日後遊戲裡開放(刪 zonegate.go 的 BlockedZones)時,這裡也要同步拿掉。
const BLOCKED_ZONES = new Set(["antaras_lair", "fafurion_lair", "valakas_lair"]);
const hiddenZone = z =>
  BLOCKED_ZONES.has(z) ||
  (!FEAT.tianfa && (z === "twilight_mt" || z.startsWith("pride_"))) ||
  (!FEAT.castle && z.startsWith("siege_")) ||
  z.startsWith("pk_") || z === "lobby";
const HIDDEN_ITEM_RE = [];
if (!FEAT.tianfa) HIDDEN_ITEM_RE.push(/傲慢之塔|天罰|奇美拉之皮/);
if (!FEAT.doll)   HIDDEN_ITEM_RE.push(/娃娃/);
if (!FEAT.castle) HIDDEN_ITEM_RE.push(/攻城|城堡/);
// 用 id 精準擋(比對名稱會誤傷:「精通」兩字還有別的道具在用)
const HIDDEN_ITEM_ID = new Set();
if (!FEAT.mcard) { HIDDEN_ITEM_ID.add("mastery_reset_card"); HIDDEN_ITEM_ID.add("mastery_swap_card"); }
// 🪪 更名卡:2026-09-14 中午維修才上線;道具已在 gamedata 裡,上線前不擋會提早出現在資料站。上線當天改成 true。
const RENAME_CARD_LIVE = true; // 2026-09-11 開服隨 exe 一起上線 → 資料站放出
if (!RENAME_CARD_LIVE) HIDDEN_ITEM_ID.add("rename_card");
// 🧪 經驗藥水(potion_exp,2026-09-14 麥哥要的:一瓶 +50 萬經驗):道具已在 gamedata,發放方式與要不要上官網麥哥未拍板 → 先擋。拍板後改 true。
const EXP_POTION_LIVE = false;
if (!EXP_POTION_LIVE) HIDDEN_ITEM_ID.add("potion_exp");
// 🔒 武官系列 8 件 + 神官系列 7 件(2026-09-21 中午上線):麥哥拍板「官網不發、不開放取得」
//    —— gachaWeight:0、無掉落、無商店,玩家拿不到。不擋的話資料站會列出來,只會被問「在哪拿」。
//    ⚠ 之後麥哥決定要放出時,把 OFFICIAL_PRIEST_LIVE 改成 true 即可(不要逐一刪 id)。
//    用 id 精準擋,不用名稱比對——「神官」兩字之後可能出現在別的道具說明裡。
const OFFICIAL_PRIEST_LIVE = false;
if (!OFFICIAL_PRIEST_LIVE) for (const id of [
  "wpn_officialblade", "wpn_official2h", "amr_official", "clk_official", "shd_official",
  "glv_official", "bot_official", "hlm_official",
  "wpn_priestwand", "amr_priest", "hlm_priest", "clk_priest", "glv_priest", "bot_priest", "shd_priest",
]) HIDDEN_ITEM_ID.add(id);
const hiddenItem = (id, v) => {
  if (HIDDEN_ITEM_ID.has(id)) return true;
  const s = (v.n || "") + " " + (v.d || "");
  return HIDDEN_ITEM_RE.some(re => re.test(s));
};

// ---- 頻道(獵場)----
const ZONE_CAT = { wild: "野外", dungeon: "地監", special: "特殊", village: "村莊" };
const zoneName = {}, zoneCat = {}, zoneAc = {};
for (const [cat, arr] of Object.entries(GD.mapCategories || {}))
  for (const z of arr || []) { zoneName[z.v] = z.t; zoneCat[z.v] = ZONE_CAT[cat] || cat; zoneAc[z.v] = z.acReq || 0; }
// 🛡 AC 門檻(acReq,負向好;缺省/0=沒門檻)。**這是公開的**——與掉落機率不同,
//    它是玩家「該不該來這區」的判斷依據,而且遊戲裡刻意不給任何提示(靜默懲罰,
//    見 go端專案/.ai/systems/狩獵區AC門檻.md),不寫在資料站上玩家永遠不知道自己為什麼被打那麼痛。

// 🔴 世界王本尊怪 —— **一定要從獵場怪物池濾掉**。
//
// gamedata 的 `maps` 裡確實列著這些王(資料庫有),但伺服器啟動時
// `cmd/goline/main.go` 會呼叫 `afk.RemoveBossMobs(wbSet)` 把牠們從所有頻道池移除
// (對齊 server.js:6869-6879)——**王只從世界王入口進,永遠不會在一般獵場出生**。
//
// ⚠ 這個坑踩過兩次(見 .ai/歷程.md 2026-09-04):
//   ① 過濾不在 `afk.SpawnMonster` 裡,而在**呼叫端之前**,只看引擎層會得到錯的結論。
//   ② 判「玩家會不會遇到某隻怪」**不能只看 gamedata.maps**,必須把 RemoveBossMobs 算進去。
// 實測:螞蟻洞窟2樓跑 5 萬次出怪,0 隻巨蟻女皇。
const WB_MOB_KEYS = new Set();
for (const v of Object.values(GD.worldBosses || {})) {
  if (v.mob) WB_MOB_KEYS.add(v.mob);
  for (const mb of (v.members || [])) if (mb.mob) WB_MOB_KEYS.add(mb.mob);
}
const WB_MOB_NAMES = new Set([...WB_MOB_KEYS].map(k => GD.mobs?.[k]?.n).filter(Boolean));

// 頻道 → 怪(mob key);同時建反查 怪名 → 出沒頻道名
// ⚠ 兩邊都要套 WB_MOB_KEYS 過濾,否則獵場會列出不會出的王、王也會被誤標出沒地點。
const zoneMobs = {}, mobZones = {};
for (const [z, keys] of Object.entries(GD.maps || {})) {
  if (hiddenZone(z) || zoneCat[z] === "村莊" || !Array.isArray(keys)) continue;
  const nm = zoneName[z];
  if (!nm) continue; // 不在分類表 = 內部/未啟用頻道,不列
  const real = keys.filter(k => !WB_MOB_KEYS.has(k)); // ← RemoveBossMobs 的同一套過濾
  if (real.length === 0) continue;                    // 整區只有王 → 遊戲裡該頻道直接下架
  zoneMobs[z] = real;
  for (const k of real) {
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
    // ⚠ ac 在引擎裡是**越低越好**(derived.go: e.Ac -= v),所以 +N 的 ac 對玩家而言是「防禦提升 N」;
    //    狂暴術的 ac:-10 = AC 數字 +10 = 更容易被怪打中(2026-09-15 修正,原本印成「提升 -10」)
    // 🛡 2026-09-17 上線:迴避 ER 已實裝(combat.go 的怪命中判定會扣 ER)。原本這裡寫「僅能力頁數字,
    //    戰鬥判定不採用」已過時。🔒 麥哥拍板:**只寫效果,不公開換算式與除數**。
    if (kk === "er") return "迴避 ER +" + v + "(降低怪物命中你的機率)";
    if (kk === "ac") return v >= 0 ? "防禦 AC 提升 " + v : "防禦 AC 降低 " + (-v) + "(更容易被怪物命中)";
    return nm + " " + (v > 0 ? "+" : "") + v + (PCT_KEYS.has(kk) ? "%" : "");
  });
}
// ---- 📐 數值範例(2026-09-15 麥哥:官網技能要寫到玩家/客服看得懂的具體數字)----
// INT 對照表**逐字抄自** engine/tables_generated.go(lookupStep:INT ≤ 門檻 → 值;超過最後一格 → 尾值)。改表要同步。
const INT_EXTRA_MP = [[11, 2], [15, 3], [19, 4], [23, 5], [27, 6], [31, 7], [35, 8], [39, 9], [43, 10], [47, 11], [51, 12], [55, 13], [59, 14], [63, 15], [67, 16], [71, 17]], INT_EXTRA_MP_TAIL = 18;
const INT_MAGIC_DMG = [[14, 0], [19, 1], [24, 2], [29, 4], [34, 5], [39, 7], [44, 8], [49, 12], [54, 13], [59, 14], [64, 15], [69, 16], [74, 17]], INT_MAGIC_DMG_TAIL = 18;
const lookupStep = (v, tbl, tail) => { for (const [k, x] of tbl) if (v <= k) return x; return tail; };
const extraMp = i => lookupStep(i, INT_EXTRA_MP, INT_EXTRA_MP_TAIL);
const magicDmg = i => lookupStep(i, INT_MAGIC_DMG, INT_MAGIC_DMG_TAIL);
const SAMPLE_INT = [25, 40, 60];
// 治癒:afk/skills.go magicHealAmountGo —— 技能有 ih 就**只用 ih**(healDice/healBase/valDice 是死欄位,九支治癒全有 ih):
//   回復 = floor(ih[0] + ih[1] × 額外魔法點數(INT)),不擲骰、每次固定,法師妖精一樣。
const healAt = (ih, i) => Math.max(1, Math.floor(ih[0] + ih[1] * extraMp(i)));
const healText = ih => "回復量 = " + ih[0] + " + " + ih[1] + " × 額外魔法點數(只看 INT,每次固定):" + SAMPLE_INT.map(i => "INT " + i + " → " + healAt(ih, i)).join("、");
// 魔法攻擊:afk/skills2b.go magicSkillDmgGo —— 骰 × (1 + 3×魔法傷害/16) × (1 + 階級/3) + 額外魔法點數 → 怪物 MR 減傷 → 法師 ×1.5。
//   這裡算「平均、裸裝、不含爆擊、未扣 MR」給玩家當量級參考;階級 0 的治盔技能引擎當 1。
const magicAvg = (dice, tier, i, mage) => { const avg = dice[0] * (dice[1] + 1) / 2, coef = (1 + 3 * magicDmg(i) / 16) * (1 + (tier || 1) / 3); return Math.floor((avg * coef + extraMp(i)) * (mage ? 1.5 : 1)); };
const magicText = v => "平均傷害(裸裝、未扣怪物 MR、不含爆擊):" + SAMPLE_INT.map(i => "INT " + i + " → 法師約 " + magicAvg(v.dmgDice, v.tier, i, true) + " / 妖精約 " + magicAvg(v.dmgDice, v.tier, i, false)).join("、");
// 狀態技對怪物的實際效果(afk/skills2b.go applyMobStatusGo + combat.go MobAttack;⚠ gamedata 的 pbase 引擎不讀,命中一律走「異常魔法命中」)
const SK_STATUS_FX = {
  poison: s => "中毒:每 " + (s.tick || 3) + " 秒扣 " + dice(s.dmg) + " 固定傷害(命中時擲一次、之後每跳同值),持續 " + s.dur + " 秒",
  blind: s => "失明:怪物命中 −" + (s.hit || 4) + ",持續 " + s.dur + " 秒",
  broken: s => "壞物:怪物傷害 −2,持續 " + s.dur + " 秒",
  slow: s => "緩速:怪物攻擊間隔 +1 秒,持續 " + s.dur + " 秒",
  stone: s => "石化:怪物完全不能行動 " + s.dur + " 秒",
  weaken: s => "弱化:怪物命中 −2、傷害 −4,持續 " + s.dur + " 秒",
  disease: s => "疾病:怪物命中 −4、更容易被你打中(有效 AC +8),持續 " + s.dur + " 秒",
  vacuum: s => "魔法封印:怪物 " + s.dur + " 秒內不能施法",
  sleep: s => "沉睡:怪物不能行動 " + s.dur + " 秒,被攻擊即醒",
  mrhalf: s => "魔防減半:怪物 MR 減半,只對你的下一發魔法攻擊有效(" + s.dur + " 秒內)",
  magicseal: s => "封印:怪物 " + s.dur + " 秒內不能施法",
  armorbreak: s => "破甲:怪物受到的所有傷害 ×1.58,持續 " + s.dur + " 秒",
};
// 逐技能白話細節(gamedata 沒寫、寫在引擎裡的效果;2026-09-15 對碼,依據見 go端專案/.ai/歷程.md 同日條)。
// ⚠ 只寫程式裡真的有的;「程式沒效果」的技能(解毒術/聖潔之光/魔法相消術/無所遁形術/隱身術/大地屏障/負重強化/返生術/神聖疾走/迴避提升)
//    2026-09-15 麥哥拍板:標「未實裝」(SK_BADGE)+ 遊戲端設定頁不能勾/不能選(engine/afk/skills.go unimplementedSkills)。
// 🏷 技能名旁的醒目備註(麥哥 2026-09-15:不會吸血/不會冰凍要備註在技能後面;未實裝的一律標「未實裝」,
//    遊戲端同日起未實裝技能在設定頁不能勾/不能選,見 engine/afk/skills.go unimplementedSkills —— 兩張名單要一致)
const SK_BADGE = {
  sk_cold_shiver: "不會吸血", sk_vampire: "不會吸血", sk_ice_lance: "不會冰凍",
  sk_antidote: "未實裝", sk_holy_light: "未實裝", sk_cancel: "未實裝", sk_reveal: "未實裝", sk_invisible: "未實裝",
  sk_elf_earthshield: "未實裝", sk_load_up: "未實裝", sk_resurrection: "未實裝",
  // 🛡 2026-09-17:神聖疾走 sk_holy_dash / 迴避提升 sk_dark_erup 隨「迴避 ER 實裝」上線 ⇒ 已從未實裝名單移除。
  //    ⚠ 遊戲端 engine/afk/skills.go 的 unimplementedSkills 同日移除,**兩張名單必須一致**。
};
const SK_NOTE = {
  sk_antidote: "未實裝:目前不會解毒也不會回血。2026-09-16 維護後起,設定頁無法選為治癒魔法。",
  sk_holy_light: "未實裝:目前沒有任何效果。2026-09-16 維護後起,設定頁無法選為治癒魔法。",
  sk_cancel: "未實裝:目前不會解除任何狀態。2026-09-16 維護後起,設定頁無法選為治癒魔法。",
  sk_reveal: "未實裝:目前沒有任何效果,設定頁不會出現、不會施放。",
  sk_invisible: "未實裝:目前沒有任何效果,設定頁不會出現、不會施放。",
  sk_elf_earthshield: "未實裝:目前沒有任何效果,設定頁不會出現、不會施放。",
  sk_load_up: "未實裝:目前沒有任何效果。",
  sk_resurrection: "未實裝:目前沒有任何效果。",
  // 🛡 2026-09-17「迴避 ER 實裝」上線 ⇒ 神聖疾走 / 迴避提升的「未實裝」說明已移除,
  //    效果文字改由 fx 的 er 分支輸出「迴避 ER +N(降低怪物命中你的機率)」。🔒 不公開換算式。
  sk_sunlight: "狩獵場出怪間隔由 4 秒縮短為 2 秒(擁擠地圖的出怪延遲也減 2 秒),等於打怪節奏快一倍。只影響狩獵場。",
  sk_magic_shield: "完整吸收下一次怪物的物理攻擊或一發怪物傷害型魔法(整發歸零),吸收後屏障消失、3 秒內不能再放。不吸收石化/麻痺/中毒這類狀態技。世界王房的「結界」按鈕用的是魔法屏障卷軸,效果相同。",
  sk_haste_spell: "與強力加速術效果完全相同,只差 MP 與持續時間。",
  sk_greater_haste: "與加速術效果完全相同,只差 MP 與持續時間。",
  sk_holy_barrier: "怪物對你的物理傷害與魔法傷害都 ×0.7(扣完傷害減免後再打七折),不減中毒的每跳傷害。世界王房按「聖結界」= 5 秒冷卻、扣 30 MP、全房已按攻擊的成員一起套 32 秒。PK 時開場帶著,對手的所有傷害也 ×0.7。",
  sk_soul_up: "最大 HP 與最大 MP 各 ×1.2。",
  sk_reduction_armor: "傷害減免 DR + 等級÷10(無條件捨去:Lv30 = +3、Lv55 = +5),每次被怪物物理或魔法命中都固定少扣這麼多。",
  sk_elf_worldtree: "被動。在妖精森林周邊與眠龍洞穴 1~3 樓,每殺一隻怪,粗糙的米索莉塊 / 精靈玉 / 元素石的掉落機率各由 20% 提高到 30%。",
  sk_elf_singleres: "自己所選妖精屬性的抗性 +50:該屬性的怪物魔法傷害減半(抗性 100 = 免疫)。未選屬性則無效果。",
  sk_elf_attrfire: "近戰且屬性為火時,每次普攻或物理技命中有 33% 機率整段傷害 ×1.5。遠程武器不觸發。",
  sk_elf_flamesoul: "近戰時武器骰不再隨機,一律取最大值再 ×1.2(只乘武器骰,不含力量加成)。遠程不吃。",
  sk_berserk: "AC 變差 10 點 = 怪物更容易命中你,換近戰傷害 +5。",
  sk_dark_stealth: "怪物對你的下一次物理攻擊 100% 迴避,迴避後效果消失、5 秒內不能再放。對魔法無效。",
  sk_dark_poisonres: "自己中毒時每跳傷害減半。目前只有傲慢之塔的變種楊果里恩、梅杜莎、奇美拉、扭曲的潔尼斯女王會對玩家上毒。",
  sk_dark_burn: "每次普攻命中 30% 機率傷害 ×1.5,只作用普攻;可與雙重破壞疊乘。",
  sk_dark_walkhaste: "⚠ 名字叫「行走加速」,實際加的是「攻擊速度」(攻擊間隔 ×0.85)。很多人以為它跟綠水(自我加速藥水)、加速術是同一種加速、開了會互相取消——不會:它們是兩套獨立的效果,同時開會相乘(0.85 × 0.67 ≈ 0.57,大約等於攻擊次數 1.76 倍),黑暗妖精兩個一起開才是最快的。",
  sk_dark_dodge: "效果中每次怪物物理攻擊命中你時 20% 機率迴避,不消耗效果、無冷卻。對魔法無效。",
  sk_dark_crit: "施放後 HP 與 MP 都變 1;傷害 = (武器骰最大值 + 近戰傷害 + 額外傷害 − 怪物 DR) × 爆傷 × (施放前 MP ÷ 最大 MP × 5),必中必爆。30 秒冷卻,HP 或 MP 只剩 1 時不會施放;PK 不會施放。",
  sk_dark_double: "手持鋼爪或雙刀時每次普攻命中 20% 機率傷害 ×2,其他武器無效。",
  sk_dark_fang: "每次物理命中(普攻/物理技)固定 +5 傷害。",
  sk_dark_refine: "被動。可在背包提煉黑魔石:每次扣 1 顆 + 5 MP,成功變高一級、失敗化為粉末。1→2 級成功率 = 3.5% + 等級×1% + (WIS−8)×1.25%(WIS 最多算到 35、上限 80%);2→3 級為其一半、3→4 級為 1/4、4→5 級為 1/8。對照(1→2 / 2→3 / 3→4 / 4→5):Lv30・WIS 20 → 48.5% / 24% / 12% / 6%;Lv45・WIS 30 → 76% / 38% / 19% / 9.5%;Lv55・WIS 35 → 80% / 40% / 20% / 10%。要提煉出一顆五級黑魔石,平均要消耗的一級黑魔石:Lv30・WIS 20 約 1,160 顆、Lv45・WIS 30 約 190 顆、Lv55・WIS 35 約 156 顆(一級石 1,000 金一顆,滿等約 16 萬金幣、約 340 次提煉)。背包點石頭有「自動提煉」鈕,每 2 秒自動提煉一次同級石(換分頁或斷線會停);MP 不夠會卡住,建議在大廳做。",
  sk_undead_bane: "成功率 = 32% + (自己等級 − 怪物等級) + 魔法命中 × 2.5 − 怪物 MR ÷ 2,限 1%~95%;成功即秒殺(正常給經驗與掉落),失敗也扣 MP。例:Lv30、INT 25 打骷髏鬥士(Lv29、MR 25)約 25%,打骷髏(Lv10、MR 10)約 52%。世界王免疫。",
  sk_elf_release: "對元素系怪物(四大精靈王、火蜥蜴、雪人、冰人等)判「異常魔法命中」,成功即秒殺,失敗也扣 MP。世界王免疫。",
  sk_ice_lance: "只有傷害,沒有冰凍效果。",
  sk_cold_shiver: "純魔法攻擊,不會吸血。",
  sk_vampire: "純魔法攻擊,不會吸血。",
  sk_disintegrate: "PK 時傷害 ×0.6(再吃 PK 的法術減半),打怪不受影響。",
  sk_mana_drain: "場上有活怪時每 2 秒判一次「異常魔法命中」,成功回復 1 ~ INT÷2 點 MP(INT 25 → 1~12),失敗白扣 50 HP;法師「魔力奪取精通」光環可再加。自動觸發條件同心靈轉換。",
  sk_elf_mind: "自動觸發條件:HP 高於你設定的「轉換 HP%」且 MP 低於「轉換 MP%」(自動設定面板),扣完 HP 至少剩 1。",
  sk_elf_soul: "自動觸發條件:HP 高於你設定的「轉換 HP%」且 MP 低於「轉換 MP%」(自動設定面板),扣完 HP 至少剩 1。",
  sk_zombie: "召喚「人形殭屍」1 小時(到期自動再召、再扣 MP);同時只能有 1 隻召喚物、與寵物互斥、需魅力 ≥ 6。每 2 秒攻擊一輪、每輪打 CHA÷6 下;每下傷害 = 1D12 + CHA÷5 × (1 + 等級÷20)。命中很吃怪物 AC。",
  sk_summon: "依施放當下等級召喚(1 小時內不換):Lv32 前哈柏哥布林(1D15)、Lv32+ 甘地妖魔(2D8)、Lv40+ 食人妖精(2D11)、Lv52+ 魔狼(2D14,每 1 秒攻擊)。每 2 秒攻擊一輪、每輪 CHA÷6 下(Lv52+ 為 CHA÷8)。同時只能 1 隻召喚物、與寵物互斥、需魅力 ≥ 6;法師召喚精通光環可加傷害。",
  sk_elf_summon: "召喚你所選屬性的精靈 1 小時,遠程、每 2 秒攻擊 1 次;傷害 = 1D40 + (STR+INT)÷2 × 等級÷1.5 ÷ 10,再吃怪物 MR 減傷,剋制屬性 +6。同時只能 1 隻召喚物、與寵物互斥、需魅力 ≥ 6。例:Lv40、STR 20、INT 25 對 MR 10 的怪每 2 秒約 76。",
  sk_elf_summon2: "上級精靈:2D40 + (STR+INT)÷2 × 等級÷1.5 ÷ 5,命中 +5;例:Lv50 同上屬性對 MR 10 的怪每 2 秒約 181。與「召喚屬性精靈」同時勾選只放這支。",
  sk_elf_lifebless: "在世界王房施放時全房參戰者都回復同樣數字;狩獵場為回復自己。",
};
const SK_STATUS = { poison: "中毒", blind: "黑暗", broken: "防禦破壞", slow: "緩速", stone: "石化",
  weaken: "衰弱", disease: "疾病", vacuum: "真空", sleep: "沉睡", mrhalf: "魔防減半",
  magicseal: "魔法封印", armorbreak: "破甲" };
// 骰子 [n, 面數] → nDf(最小 n、最大 n×f)
const dice = d => Array.isArray(d) && d.length === 2 ? `${d[0]}D${d[1]}(${d[0]}~${d[0] * d[1]})` : "";
function skillFx(v) {
  const t = [];
  // 2026-09-15 對碼後改寫:lifesteal / freeze / healDice / pbase / autoBuff 都是引擎不讀的死欄位,不再照字面翻;
  //   治癒改用 ih 算實際回復、魔法攻擊給平均傷害範例、狀態技寫實際效果、stun 寫死 6 秒。
  if (v.dmgDice && v.dmgType === "magic") { t.push("魔法傷害骰 " + dice(v.dmgDice)); t.push(magicText(v)); }
  else if (v.dmgDice) t.push("傷害 " + dice(v.dmgDice));
  if (v.ele && v.ele !== "none") t.push("屬性:" + (SK_ELE[v.ele] || v.ele) + "(對被剋制的怪物固定 +6 傷害;火剋地、地剋風、風剋水、水剋火)");
  if (v.target === "all") t.push("範圍:場上全部敵人(最多 3 隻,每隻各自擲骰、各吃全額,MP 只扣一次)");
  if (v.hits) t.push("連續 " + v.hits + " 次完整普攻(每一矢各自判命中與爆擊;一次施放只消耗 1 支箭)");
  if (v.ih && v.hot) t.push("持續回復:施放後每 " + v.hot.interval / 10 + " 秒回一次、共 " + v.hot.ticks + " 次;每次" + healText(v.ih));
  else if (v.ih) t.push(healText(v.ih));
  if (v.dur) t.push("持續 " + v.dur + " 秒");
  if (v.hpCost && v.mpGain) t.push("每次 −" + v.hpCost + " HP → +" + v.mpGain + " MP,冷卻 " + v.autoCd + " 秒(每秒約 −" + Math.round(v.hpCost / v.autoCd) + " HP / +" + Math.round(v.mpGain / v.autoCd) + " MP)");
  else if (v.hpCost) t.push("消耗 HP " + v.hpCost + (v.autoCd ? ",冷卻 " + v.autoCd + " 秒" : ""));
  if (v.instakill) t.push("即死:對「" + (v.instakill.tag === "undead" ? "不死系" : v.instakill.tag === "element" ? "元素系" : v.instakill.tag) + "」怪物判定,成功即秒殺(世界王免疫)");
  if (v.stun) t.push("先打 1 次普攻,怪物存活時再判「異常魔法命中」,成功使目標暈眩 6 秒(世界王免疫)");
  if (v.haste) t.push("攻擊速度提升:攻擊間隔 ×0.67、技能冷卻同步縮短;與加速藥水不疊加、與勇敢藥水可疊加");
  // 🌑 行走加速(sk_dark_walkhaste):名字只寫「行走」,但引擎裡它是**攻擊速度**乘數(derived.go sbWalkHaste ×0.85),
  //    而且與 haste(綠水/加速術)是兩個獨立旗標 ⇒ **可以疊乘**。玩家一直誤以為兩者衝突,所以效果欄要寫清楚。
  if (v.darkWalkHaste) t.push("攻擊速度提升:攻擊間隔 ×0.85、技能冷卻同步縮短;與加速藥水(綠水)、加速術「可以同時生效並且相乘」,不會互相取消(合計約 ×0.57)");
  if (v.status && SK_STATUS_FX[v.status.kind]) t.push(SK_STATUS_FX[v.status.kind](v.status) + ";命中率看「異常魔法命中」(見頁首說明),世界王免疫");
  else if (v.status && SK_STATUS[v.status.kind]) t.push("附加狀態:" + SK_STATUS[v.status.kind] + (v.status.dur ? "(" + v.status.dur + " 秒)" : ""));
  if (v.reqWpn && SK_WPN[v.reqWpn]) t.push(SK_WPN[v.reqWpn]);
  if (v.reqShield) t.push("需裝備盾牌");
  if (v.reqEle) t.push("需妖精屬性:" + (SK_ELE[v.reqEle] || v.reqEle));
  if (v.reqEleAny) t.push("需已選擇任一妖精屬性");
  if (v.ranged) t.push("遠距離");
  if (v.mEff && SK_MEFF[v.mEff]) t.push(SK_MEFF[v.mEff]);
  t.push(...skillBuff(v.d)); // 增益技能的實際數值
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
// 🔍 偷窺卡 2026-09-11 起重新在各村雜貨商販售(30 萬)。mastery.json 是舊匯出、還沒有它,
//    而 wikidump **不能重跑**(會讓強化機率暗改曝光)⇒ 在這裡手動補一筆。日後能重跑 wikidump 時這行可刪。
SHOP_SELL.add("peek_card");
SHOP_SELL.add("item_moon_key");     // 🎑 中秋鑰匙 2026-09-26 起各村雜貨商販售(200 萬;Go ExtraShopDefault,活動開關 moon 開著才上架)。同上理由手動補。
SHOP_SELL.add("mat_blackstone2");   // 🌑 二級黑魔石 2026-09-23 起沉默洞穴販售(2,500;回收 300 靠 sellP)。同上:mastery.json 是舊匯出,手動補。
// 🌑 沉默洞穴史克瓦提整家店都不在舊匯出裡(2026-09-23 抓到:一級黑魔石 + 四種鋼爪 + 四種雙刀在道具頁全標「商店沒賣」)。
//    同上理由手動補;go端專案/engine/afk/blackstone2_shop_test.go 有守門:貨架上每一樣都必須在這裡或 mastery.json。
SHOP_SELL.add("mat_blackstone1");
SHOP_SELL.add("wpn_claw_bronze");
SHOP_SELL.add("wpn_claw_steel");
SHOP_SELL.add("wpn_claw_shadow");
SHOP_SELL.add("wpn_claw_damascus");
SHOP_SELL.add("wpn_dual_bronze");
SHOP_SELL.add("wpn_dual_steel");
SHOP_SELL.add("wpn_dual_shadow");
SHOP_SELL.add("wpn_dual_damascus");

// ⚒💪🔮 強化機率 / 變身型態 / 碧恩詞條 —— 全部由 cmd/wikidump 從 Go 程式**實跑**匯出,
//    不是人工抄的。改了 enhance.go / stage3.go / derived.go 就要重跑 wikidump 再重生。
let WD = {};
try { WD = JSON.parse(fs.readFileSync(path.join(OUT, "mastery.json"), "utf8")); } catch (e) { }

// ---- 資料萃取 ----
const TYPE_NAME = { wpn: "武器", arm: "防具", acc: "飾品", pot: "藥水", misc: "道具", material: "材料", skillbk: "技能書", etc: "其他" };
const ELE_NAME = { fire: "火", water: "水", wind: "風", earth: "地", none: "無", "": "無" };

// ⏳ 官網限定的臨時附註(只加在官網的道具說明尾端,**不進 gamedata**)。
//    為什麼要這個機制:gamedata 的道具說明是遊戲內與官網共用的同一份,
//    若把「X 月 X 日實裝」寫進 gamedata,上線之後遊戲內與官網都會留著一句過時的話,
//    要清掉還得再改 gamedata + 再重啟一次伺服器。放在這裡只影響官網,
//    上線後把那一行刪掉、重跑 gen 就乾淨了(官網 push 不需要重啟遊戲)。
// 🔴 上線後**一定要回來刪**——留著就是對玩家說謊。
const TEMP_NOTE = {
  // ✅ 2026-09-23 12:27 BOSS結晶掉率修正已上線 ⇒ 那句臨時附註已移除(留著就是對玩家說謊)。
  //    機制保留給下次用:寫法 `道具id: "附註文字"`,只出現在官網、不會進 gamedata(遊戲內說明是同一份)。
};

const items = Object.entries(GD.items || {}).filter(([id, v]) => !hiddenItem(id, v)).map(([id, v]) => ({
  id, n: v.n || id, t: TYPE_NAME[v.type] || v.type || "其他",
  d: (v.d || "") + (TEMP_NOTE[id] ? "\n" + TEMP_NOTE[id] : ""), legend: v.gachaWeight === 1,   // ⏳ TEMP_NOTE:官網限定附註(見上)
  dmg: v.dmgS ? `${v.dmgS}/${v.dmgL || v.dmgS}` : "", ac: v.ac || 0, safe: v.safe ?? "",
  slot: SLOT_N[v.slot] || "", req: reqStr(v.req), wcat: v.wcat || "",
  p: v.p || 0, sell: v.sellP ? v.sellP : Math.floor((v.p || 0) * 3 / 10), buy: SHOP_SELL.has(id),   // 💰 sellP=回收價覆寫(2026-09-23 二級黑魔石;與 Go sellPriceOf / adapter itemSell 三份同步,Go 守門會掃這行)
  fx: itemFx(v),
  src: [],
  ex: exByOut[id] || [], // 🎁 兌換取得(見上方 EXCHANGE);怪不掉、商店沒賣的道具只有這條線索
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
  // 🔴 世界王本尊怪永遠不會在一般獵場出生(RemoveBossMobs),出沒地點一律標「世界王房」
  wbOnly: WB_MOB_NAMES.has(v.n || key),
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
  return { id: z, n: zoneName[z], cat: zoneCat[z] || "野外", mobs: ms, ac: zoneAc[z] || 0,
    lvMin: lvs.length ? Math.min(...lvs) : 0, lvMax: lvs.length ? Math.max(...lvs) : 0 };
}).filter(z => z.mobs.length > 0).sort((a, b) => a.lvMin - b.lvMin || a.n.localeCompare(b.n, "zh-Hant"));
// 標出「地區採集」頻道(在這裡打任何怪都可能掉那幾種素材)
for (const z of zones) if (AREA.zones.includes(z.id)) z.area = AREA.items.map(itemName);

// 🏘 NPC 一覽
const NPC_TYPE = { shop: "商店", craft: "製作", skill: "技能", warehouse: "倉庫", exchange: "兌換",
  teleport: "傳送", quest: "任務", bank: "銀行", rename: "改名", pray: "祈福", blackmarket: "黑市",
  // 這幾種原本沒對照,會直接印出英文 type(ally/pledge/legend/bless/refine)
  ally: "協力", pledge: "血盟", legend: "傳說", bless: "詞條", refine: "提煉" };

// 🔒 收起中的內容 → 對應的村莊 NPC 也不列。
// 對過 cmd/goline 全部 featOn 呼叫點(2026-09-07):14 項開關裡**只有這三項有村莊 NPC**,
// 其餘(push/dice/slot/castle/doll/tianfa/codex/glory/potion/taxpool/mcard)都是遊戲介面內的
// 分頁或商城品項,gamedata.towns 裡沒有對應 NPC,所以這份名單就是完整的。
// ⚠ 不要擋的:潘朵拉(title 雖然寫「黑市」但刻意保留開放)、依斯巴(遺忘之島入口,
//    靠搭船資格控管不是開關)、阿吸勒(冰涼商人,活動內容,沒綁開關)。
const HIDE_NPC = new Set([
  !FEAT.bm && "blackmarket",   // 黑市商人 厲飛雨
  !FEAT.pray && "pray",        // 祈福女神 阿克婭
  "rename",                    // 孟婆 轉世重生(開關 rename,目前恆收)
].filter(Boolean));
const towns = Object.entries(GD.towns || {}).map(([id, t]) => ({
  id, n: t.n || id,
  npcs: (t.npcs || []).filter(n => !HIDE_NPC.has(n.type)).map(n => ({
    n: n.n || "", title: n.title || "", t: NPC_TYPE[n.type] || n.type || "", d: n.d || "",
    ex: exByNpc[n.id] || [] })), // 🎁 兌換 NPC 的完整配方(gamedata 那句說明常常不完整)
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
  x: SK_NOTE[id] || "", // 📐 逐技能白話細節(引擎裡的效果;2026-09-15)
  b: SK_BADGE[id] || "", // 🏷 技能名旁備註(不會吸血/不會冰凍/未實裝)
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
/* ── 頁首與導覽列 ──
   14 個功能鍵,所以做成膠囊按鈕 + 圖示;捲動時固定在頂端(查資料時不用捲回去換頁)。
   窄螢幕自動縮小,不做橫向捲動(會藏住後面的鍵)。 */
header{background:linear-gradient(180deg,#2c2114 0%,#20180d 100%);
  border-bottom:1px solid #3f331d;box-shadow:0 3px 14px rgba(0,0,0,.45);
  padding:12px 18px 0;position:sticky;top:0;z-index:50}
.brand{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
header h1{color:#f5c451;font-size:20px;margin:0;letter-spacing:.5px;
  text-shadow:0 0 18px rgba(245,196,81,.35)}
.brand .sub{color:#8a7d63;font-size:12px;letter-spacing:2px}
nav{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:11px}
nav a{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;
  color:#c9b995;text-decoration:none;font-size:14px;white-space:nowrap;line-height:1.2;
  border:1px solid transparent;background:rgba(255,255,255,.03);
  transition:background .18s,color .18s,border-color .18s,transform .18s,box-shadow .18s}
nav a .i{font-size:15px;line-height:1}
nav a:hover{background:rgba(245,196,81,.11);color:#f5c451;
  border-color:rgba(245,196,81,.38);transform:translateY(-1px)}
nav a.on{background:linear-gradient(180deg,#f5c451 0%,#dfa72c 100%);color:#241b0f;
  font-weight:700;border-color:#f5c451;box-shadow:0 2px 10px rgba(245,196,81,.32)}
nav a.on .i{filter:saturate(.85)}
/* 🗂 導覽分組下拉(2026-09-18):用 <details> 做,零 JS;手機桌機同一套行為 */
nav details.ng{position:relative}
nav details.ng>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;
  padding:7px 12px;border-radius:9px;color:#cbbb9b;font-size:14px;border:1px solid transparent}
nav details.ng>summary::-webkit-details-marker{display:none}
nav details.ng>summary::after{content:'▾';margin-left:2px;font-size:11px;opacity:.7}
nav details.ng>summary:hover{background:rgba(245,196,81,.11);color:#f5c451}
nav details.ng.here>summary{background:linear-gradient(180deg,#f5c451 0%,#dfa72c 100%);color:#241b0f;font-weight:bold}
nav details.ng .ngm{position:absolute;z-index:20;top:100%;left:0;margin-top:4px;min-width:190px;
  background:#241b0f;border:1px solid #5a4a26;border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:2px;
  box-shadow:0 8px 20px rgba(0,0,0,.45)}
nav details.ng .ngm a{white-space:nowrap}
@media(max-width:700px){nav details.ng .ngm{position:static;box-shadow:none;min-width:0}}
/* ❓ 首頁引導區 */
.ask{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:2px 0 18px}
.ask a{background:#2a2014;border:1px solid #5a4a26;border-radius:999px;padding:7px 14px;
  color:#f5d9a0;text-decoration:none;font-size:14px}
.ask a:hover{border-color:#f5c451;color:#f5c451}
.asktt{text-align:center;color:#b6a684;font-size:14px;margin:14px 0 8px}
@media(max-width:640px){
  header{padding:10px 12px 0}
  header h1{font-size:17px}
  .brand .sub{display:none}
  nav{gap:5px;padding-bottom:9px}
  nav a{padding:6px 9px;font-size:13px;gap:4px}
  nav a .i{font-size:14px}
}
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
/* 社群入口(首頁最下方):遊戲本體 + Discord + LINE。用 .link 區隔於資料頁磁磚 */
.sechd{text-align:center;color:#f5c451;font-size:17px;font-weight:bold;margin:34px 0 4px}
.sechd+.sub{text-align:center;color:#8a7d63;font-size:13px;margin-bottom:14px}
.links{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.link{background:#241b0f;border:1px solid #5a4a26;border-radius:14px;padding:18px 16px;
  text-decoration:none;display:flex;align-items:center;gap:13px}
.link:hover{border-color:#f5c451}
.link .em{font-size:29px;flex:none;line-height:1}
.link .tt{color:#f5c451;font-size:16px;font-weight:bold}
.link .dd{color:#b6a684;font-size:12.5px;margin-top:2px;word-break:break-all}
.link.play{background:linear-gradient(180deg,#33260f,#241b0f);border-color:#f5c451}
.link.play .tt{font-size:17px}
.lineid{color:#e8dcc8;font-family:Consolas,monospace;background:#1a1409;
  border:1px solid #3a2f1c;border-radius:6px;padding:1px 7px;font-size:13px}
.stats{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:10px 0 16px}
.stat-chip{background:#241b0f;border:1px solid #5a4a26;border-radius:10px;padding:7px 14px;font-size:14px;color:#b6a684}
.stat-chip b{color:#f5c451;font-size:16px;margin-right:4px}
table{border-collapse:collapse;width:100%;font-size:14px;background:#241b0f;border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid #3a2f1c;text-align:left;vertical-align:top}
th{color:#f5c451;position:sticky;top:0;background:#2a2014;white-space:nowrap;font-size:13px}
tr:hover td{background:#2a2014}
td.nm{color:#e8dcc8;font-weight:bold;white-space:nowrap}
td.vil{color:#e8dcc8;font-weight:bold;white-space:nowrap}
td.vil .mo{display:none}   /* 手機卡片式才顯示,見 @media(max-width:640px) */
td.vil .de{display:inline}
td.num{text-align:right;white-space:nowrap;color:#b6a684}
.tag{display:inline-block;background:#2a2014;border:1px solid #3a2f1c;border-radius:6px;padding:1px 7px;margin:2px 3px 0 0;font-size:12px;color:#cbbb9b;white-space:nowrap}
.tag.lg{color:#ffd700;border-color:#6b5a20}
.tag.zn{color:#7bd14a;border-color:#2f4a24}
.tag.wb{color:#f5a97f;border-color:#6b3f28;background:rgba(245,169,127,.08)}
.wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}

/* ── 📱 手機:大表格改成「一筆一張卡」──
   原本靠 .wrap 橫向捲動,技術上沒有溢出(body 仍是 375),但表格寬 512px,
   玩家要左右滑才看得完整列,而且不會發現可以滑 ⇒ 改成堆疊卡片,欄位名用
   data-l 屬性帶進來(td::before),完全不需要橫滑。
   ⚠ 只套在有 #tb 的主資料表;.mcard 內的小表格欄位少,維持原樣照常橫捲。 */
@media(max-width:640px){
  #tb-wrap{overflow-x:visible}
  #tb-wrap table{display:block;background:transparent;border-radius:0;font-size:14px}
  #tb-wrap thead{display:none}
  #tb-wrap tbody{display:block}
  #tb-wrap tr{display:block;background:#241b0f;border:1px solid #3a2f1c;border-radius:10px;
    padding:10px 12px;margin-bottom:10px}
  /* ⚠ td 必須是 block(不能用 flex/grid):像「出沒怪」那種一格塞十幾個 <span class=tag>,
     flex 會把它們排成不換行的一列而被切掉。block + 絕對定位的標籤才能自然換行。 */
  #tb-wrap td{display:block;border:0;padding:3px 0 3px 76px;position:relative;
    text-align:left;min-height:20px}
  #tb-wrap td::before{content:attr(data-l);position:absolute;left:0;top:5px;width:70px;
    color:#8a7d63;font-size:12px;line-height:1.3}
  #tb-wrap td.nm{padding:0 0 7px;margin-bottom:5px;font-size:16px;
    border-bottom:1px solid #33291a;white-space:normal}
  #tb-wrap td.nm::before{display:none}
  #tb-wrap td.num{text-align:left;white-space:normal}
  #tb-wrap td.e{display:none}          /* 值是「—」的欄位在手機上不佔位 */
  /* NPC:桌機版村莊名只印在該村第一列(表格分組),手機每張卡都要有 → 兩份切換 */
  #tb-wrap td.vil .de{display:none}
  #tb-wrap td.vil .mo{display:inline}
  /* 少數技能效果是一整句話(例:「即死:對不死系怪物判定…」),.tag 的 nowrap 會撐出去 */
  #tb-wrap .tag{white-space:normal}
  /* 📐 技能頁:逐技能白話細節 + 頁首「數字怎麼算」摺疊區(2026-09-15) */
  .sknote{color:#d9c48f;font-size:12.5px;margin-top:4px;line-height:1.5}
  details.how{background:#1f1810;border:1px solid #3a2f1c;border-radius:8px;padding:8px 12px;margin:0 0 12px;font-size:13px;line-height:1.6}
  details.how summary{cursor:pointer;color:#ffd700;font-weight:600}
  details.how ul{margin:8px 0 0;padding-left:18px}
  details.how li{margin:4px 0}
  #tb-wrap td[colspan]{display:block}
  #tb-wrap td[colspan]::before{display:none}
}
.hint{color:#8f8067;font-size:12px;margin:-6px 0 12px}
.mcard{background:#241b0f;border:1px solid #3a2f1c;border-radius:12px;padding:14px 16px;margin-bottom:14px}
.mcard .ttl{color:#f5c451;font-size:17px;font-weight:bold;margin-bottom:2px}
.mcard .sub{color:#b6a684;font-size:14px;line-height:1.75}
.mcard table{margin-top:6px}
/* 🎉 活動卡(2026-09-20 麥哥:活動之間區隔不夠明顯,每項要有自己的框)。
   ⚠ 刻意另開 .evcard 疊在 .mcard 上,**不要改 .mcard 本身** —— 那是全站共用的,
   一改所有頁面的卡片都會跟著變。左側金色粗邊是分隔最有效的一招(掃一眼就知道換一項了)。 */
.evcard{border:1px solid #5a4a26;border-left:4px solid #f5c451;margin-bottom:28px;box-shadow:0 3px 12px rgba(0,0,0,.5)}
.evcard .evhd{background:#32260f;margin:-14px -16px 12px;padding:12px 16px;border-radius:10px 10px 0 0;border-bottom:1px solid #5a4a26}
.evcard .evhd .ttl{font-size:19px}
.evcard.evover{border-left-color:#6b5f4c}
.evcard.evover .evhd{background:#262017}
/* 📝 官方文案範本(可一鍵複製)。⚠ pre 一定要 white-space:pre-wrap + 繼承字體,
   不然中文會變等寬醜字、長行也會撐出橫捲軸。 */
.evtpl{background:#1b150b;border:1px solid #3a2f1c;border-radius:8px;padding:12px 14px;margin:0;
  color:#e8dcc8;font-size:13.5px;line-height:1.85;white-space:pre-wrap;word-break:break-word;
  font-family:inherit;overflow-wrap:anywhere}
.evcopy{position:absolute;top:8px;right:8px;background:#3a2f1c;color:#f5c451;border:1px solid #5a4a26;
  border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit}
.evcopy:hover{background:#4a3c24}
`;
// 🗂 導覽分組(2026-09-18 麥哥:「資訊有點多有點雜,幫他們歸類、設置引導」)。
// 分法刻意照「玩家當下想做什麼」,不是照資料類型——玩家不會想「這是道具資料還是怪物資料」,
// 只會想「我幾等該去哪練」「這把武器哪裡掉」。
// 每組:[組名, 圖示, [[網址, active鍵, 圖示, 名稱, 首頁磁磚的一句話], ...]]
const NAV_GROUPS = [
  ["新手上路", "🌱", [
    ["guide.html", "guide", "🌱", "新手指南", "第一次玩看這裡"],
    ["systems.html", "sys", "📜", "系統說明", "交易所・倉庫・月卡・血魔恢復・血盟・組隊・擁擠・離線掛機・經驗・潘朵拉"],
    ["event.html", "event", "🎉", "活動介紹", "目前進行中的活動"],
    ["rules.html", "rules", "⚖️", "遊戲規章", "什麼行為會被停權・封鎖名單"],
  ]],
  ["練功打怪", "⚔️", [
    ["zones.html", "zone", "🗺️", "獵場列表", "幾等該去哪練・怪在哪出沒"],
    ["monsters.html", "mob", "👹", "怪物掉落圖鑑", "打什麼掉什麼・可用道具名反查"],
    ["worldboss.html", "wb", "🐉", "世界王", "入場等級・重生間隔・掉落"],
    ["trials.html", "trial", "📜", "職業試煉", "各職業的專屬任務與獎勵"],
  ]],
  ["裝備養成", "🎒", [
    ["items.html", "item", "⚔️", "道具圖鑑", "武器防具飾品的數值與說明"],
    ["enhance.html", "enh", "⚒️", "強化機率", "成功・維持・破壞的實際數字"],
    ["affix.html", "affix", "🌑", "詞條大全", "碧恩祝福・遠古・屬性・暗黑詞條"],
    ["sets.html", "set", "🛡️", "套裝效果", "湊齊有什麼加成"],
  ]],
  ["角色變強", "✨", [
    ["stats.html", "stat", "📊", "能力值加成表", "力量敏捷體質智力精神魅力各加多少"],
    ["skills.html", "skill", "✨", "技能介紹", "學習等級、MP、實際效果與傷害/回復數字"],
    ["mastery.html", "mastery", "🎓", "精通升級數據", "升到滿級要什麼材料"],
    ["poly.html", "poly", "💪", "變身型態", "46 種變身的加成一次看完"],
    ["pets.html", "pets", "🐕", "寵物與召喚", "魅力能帶幾隻・召喚術・迷魅"],
  ]],
  ["查資料", "🏘️", [
    ["npc.html", "npc", "🏘️", "NPC 一覽", "誰在哪個村莊・提供什麼服務"],
    ["changelog.html", "log", "📢", "版本更新", "最近改了什麼"],
  ]],
];
// 📖 圖鑑登錄:內容開關開了才進導覽(放在「練功打怪」的世界王之後)
if (FEAT.codex) NAV_GROUPS[1][2].splice(3, 0, ["codex.html", "codex", "📖", "怪物圖鑑登錄", "殺幾隻點亮・登錄要多少・給什麼加成"]);

// ❓ 首頁引導:用玩家會問的話當入口(不用先猜分類)。[問題, 連結]
const ASK = [
  ["我幾等該去哪練?", "zones.html"],
  ["這把武器哪裡掉?", "monsters.html"],
  ["強化會不會破?", "enhance.html"],
  ["第一次玩怎麼開始?", "guide.html"],
  ["月卡・倉庫・交易所怎麼用?", "systems.html"],
  ["血魔多久回一次?", "systems.html"],
  ["加一點力量會加多少傷害?", "stats.html"],
  ["最近改了什麼?", "changelog.html"],
];

const page = (title, active, body, extra = "") => `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - 阿肥放置天地 資料站</title><style>${CSS}</style></head><body>
<header>
<div class="brand"><h1>🏰 阿肥放置天地</h1><span class="sub">玩家資料站</span></div>
<nav><a href="index.html" class="${active === "index" ? "on" : ""}"><span class="i">🏠</span>首頁</a>
${NAV_GROUPS.map(([gname, gicon, links]) => {
  const here = links.some(([, key]) => key === active);   // 目前這頁在這組 → 該組預設展開並highlight
  return `<details class="ng${here ? " here" : ""}"${here ? " open" : ""}><summary><span class="i">${gicon}</span>${gname}</summary><div class="ngm">` +
    links.map(([href, key, icon, label]) => `<a href="${href}" class="${active === key ? "on" : ""}"><span class="i">${icon}</span>${label}</a>`).join("") + `</div></details>`;
}).join("")}
</nav></header><main>${body}</main>
<script>
/* 📱 手機卡片式:值是「—」的欄位加 .e 由 CSS 隱藏,免得每張卡都一堆空白列。
   各頁 render 是各自的 innerHTML 賦值,所以用 MutationObserver 統一處理一次就好。 */
(function(){var tb=document.getElementById('tb');if(!tb)return;
 function mark(){var a=tb.querySelectorAll('td');for(var i=0;i<a.length;i++){
   var t=(a[i].textContent||'').trim();
   if(t==='—'||t==='')a[i].classList.add('e');else a[i].classList.remove('e');}}
 new MutationObserver(mark).observe(tb,{childList:true});mark();})();
/* 🗂 導覽下拉的互斥與收合(2026-09-20 麥哥回報「點了之後不會自動縮回去,要點第二次」)。
   根因:導覽用原生 <details>,它的行為就是**各開各的** ⇒ 點了「新手上路」再點「練功打怪」,
   前一個不會關,實際上可以三組同時開著(麥哥的截圖就是三組全開)。
   修法:任何一次點擊,把「不是剛點到的那一組」全部收起;點選單以外的地方=全部收起。
   ⚠ 只在 click 時動作,**不碰載入時的預設展開**(目前頁所在那組刻意帶 open,是導覽提示)。 */
(function(){
 document.addEventListener('click',function(e){
  var cur=(e.target&&e.target.closest)?e.target.closest('nav details.ng'):null;
  var open=document.querySelectorAll('nav details.ng[open]');
  for(var i=0;i<open.length;i++){if(open[i]!==cur)open[i].open=false;}
 });
})();
</script>
<footer>資料自動同步自遊戲檔 · 產生於 ${new Date().toISOString().slice(0, 10)}<br>本站資料僅供參考,阿肥放置天地官方保留最終解釋權。<br>一切贊助皆為玩家自願,款項全數用於伺服器維護與研究開發。</footer>
${extra.split("data.js").join("data.js?v=" + DATA_V)}</body></html>`;


// ================= 頁面(2026-09-07 起:純文字表格,無圖片) =================
const chips = arr => `<div class="stats">${arr.map(([n, t]) => `<div class="stat-chip"><b>${n}</b>${t}</div>`).join("")}</div>`;
const ESC = `const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");`;

// ---- ⚖️ 遊戲規章(2026-09-18 麥哥:「腳本、交易所詐騙永久封號,再加一個封鎖名單區」)----
// ⚠ 條文是**對玩家的承諾**,改之前先跟麥哥確認;停權名單的資料在 banlist.json(營運手動維護,不自動匯出)。
const BAN = JSON.parse(fs.readFileSync(path.join(__dirname, "banlist.json"), "utf8"));
const RULES = [
  ["🚫 嚴重違規:一經查證,永久停權,不退還任何儲值與道具", [
    ["使用腳本、外掛、修改程式或封包自動遊戲", "包含自動打怪、自動點擊、自動交易等任何非官方提供的自動化工具。"],
    ["交易所詐騙", "以假交易、誘騙匯款、謊稱代購代刷等方式,取得他人金幣、道具或現金。"],
    ["利用程式漏洞(BUG)獲利", "發現漏洞請通報客服並停止使用;繼續利用或散布方法者一律停權,不當得利全數回收。"],
    ["盜用他人帳號", "包含騙取帳號密碼、未經同意登入他人帳號。"],
  ]],
  ["⚠️ 其他規範", [
    ["帳號共用、借帳號給他人", "官方不禁止,但因此造成的損失(道具遺失、被盜、被停權)一律自行承擔,客服不受理回復。"],
    ["現金交易遊戲內物品", "官方不經手、不承認、不受理任何糾紛;若伴隨詐騙行為,依上方嚴重違規處理。"],
    ["聊天室辱罵、洗版、散布不實消息", "視情節禁言;情節重大或屢勸不聽者停權。"],
    ["多開", "本服不禁止多開,只要不使用腳本或外掛。"],
  ]],
];
const BAN_NOTE = "以下為因使用腳本/外掛、交易所詐騙或盜用他人帳號而遭停權的帳號。名單由營運人工核實後公布;帳號與角色名<b>部分遮蔽</b>,完整資料僅保留於官方紀錄。";
// ---- 💬 社群規章(2026-09-20 麥哥:收費後開始有帶風向與玩家互相攻擊,需要一份可執行的規章)----
// ⚠ 設計原則,改之前先讀懂再動:
//  ① **管行為、不管立場**。刻意**不寫**「不得批評官方/不得唱衰」——那擋不住(話只會轉到臉書、
//     Dcard),而且中立玩家會解讀成心虛,尤其剛開始收費這個時間點。
//  ② **社群處置與遊戲帳號分開**。在群組嘴官方頂多禁言退群,**不封遊戲帳號**;
//     一旦混在一起,「言論管制」的指控就成立了。遊戲內違規走另一本(上面的遊戲規章)。
//  ③ **明寫歡迎批評,但要求具體**。這樣「帶風向」會自動轉成「可查證的申訴」——
//     提不出時間帳號截圖的,其他玩家自己看得出來;官方不逐一回覆時也有依據,不顯得逃避。
//  ④ **只寫真的會執行的**。寫十條做兩條,比寫五條做五條傷害大很多(會被抓選擇性執法)。
const COMMUNITY_RULES = [
  ["📌 適用範圍", [
    ["這份規章管的是「社群裡怎麼講話」", "適用於官方 LINE 社群與官方公告下的討論。遊戲裡的違規(腳本、詐騙、盜帳號等)請看上面的遊戲規章,兩者分開處理。"],
    ["社群處置不會影響你的遊戲帳號", "在社群違規最多就是禁言或請你離開社群,<b>不會因此停權你的遊戲帳號</b>。反過來說,遊戲內違規也不會只因為你在社群發言就免責。"],
  ]],
  ["🚫 禁止事項", [
    ["人身攻擊、辱罵、針對特定人的持續騷擾", "包含對其他玩家、客服與工作人員。對事可以很兇,對人不行。"],
    ["洩漏他人個人資料", "真實姓名、照片、住家或工作地點、就讀學校、電話、社群帳號等,未經當事人同意一律不得公開,包含「肉搜」與轉貼。"],
    ["未經查證的公開指控", "懷疑某人開外掛、懷疑官方作弊或偏袒,<b>請走申訴管道並附上證據</b>,不要在社群公審。誤指他人作弊本身就是對那個人的傷害。"],
    ["洗版、洗頻、重複張貼", "同一件事講過就好;連續洗版會先禁言。"],
    ["張貼其他私服的廣告或招募", "包含拉人進其他伺服器的群組、貼邀請連結。"],
    ["冒充官方、客服或工作人員", "官方公告只會出現在官網與官方帳號。冒充者一律移出社群,涉及詐騙另依遊戲規章處理。"],
  ]],
  ["✅ 歡迎你這樣說", [
    ["歡迎反映問題、表達不滿、提出建議", "我們不會因為你批評伺服器就處理你。這幾個月的改版,有很多就是玩家回報後才發現的。"],
    ["但請講得具體一點", "什麼時間、哪個角色、發生什麼事,<b>有截圖更好</b>。具體的我們會查會回;無法查證的指控,我們不會逐一回覆,也請大家理解。"],
    ["覺得處理不公平,可以申訴", "透過 LINE 官方帳號私訊,把經過說清楚。申訴不會因為「你之前罵過官方」而被拒絕。"],
  ]],
  // ⚖ 2026-09-20 麥哥拍板改成兩級:「第一次警告,第二次直接移出社群」。
  //    原本四級(提醒→禁言24h→禁言7d→移出)執行成本太高,客服盯不了那麼細;
  //    **寫得到做不到比寫少更傷**(會被抓選擇性執法)。
  ["⚖️ 處置方式", [
    ["第一次警告,第二次移出社群", "我們會先私訊警告一次並說明是哪一條。<b>同一個人再犯,直接移出社群</b>。"],
    ["三種情況不經警告,直接移出", "<b>洩漏他人個資、冒充官方或客服、張貼其他私服廣告</b>——這三項傷害立即而且無法回復,不會先警告。"],
    ["處置後可以申訴", "認為判斷有誤,私訊官方帳號說明,我們會重看一次。"],
  ]],
  // ⚠ 2026-09-20 麥哥:PK / 搶怪 / 搶王那兩條拿掉——**本服是放置遊戲,用不到**。
  //    (辱罵本來就由上面「禁止事項」第 1 條管著,拿掉不會留下漏洞。)
  ["🤝 玩家之間的糾紛,官方管到哪裡", [
    ["✅ 會處理:交易所詐騙", "交易所的每一筆都有系統紀錄,查得到就辦,依遊戲規章永久停權。"],
    ["❌ 不處理:私下約定與口頭承諾", "包含私下換裝、代練、借道具、現金交易。系統查不到,官方無從判斷誰對誰錯,<b>請自行承擔風險</b>。"],
  ]],
];

const rulesBody = [
  '<div class="asktt">違規處理以官方判定為準;有疑問請透過 LINE 官方帳號申訴。</div>',
  RULES.map(([head, items]) =>
    '<div class="sechd">' + head + '</div><div class="mcard">' +
    items.map(([t, d]) =>
      '<div style="margin:10px 0"><div style="color:#f5c451;font-weight:bold">' + t + '</div>' +
      '<div style="color:#cbbb9b;font-size:13px;margin-top:3px">' + d + '</div></div>').join("") +
    '</div>').join(""),
  // 💬 社群規章(2026-09-20):排在遊戲規章之後、停權名單之前。
  // 用同一套 sechd + mcard 版型,玩家一眼看得出是同一份文件的第二部分。
  '<div class="sechd" style="margin-top:22px">💬 社群規章</div>',
  '<div class="asktt">以下適用於<b>官方 LINE 社群與官方公告下的討論</b>。遊戲裡的違規請看上面的遊戲規章,兩者分開處理。</div>',
  COMMUNITY_RULES.map(([head, items]) =>
    '<div class="sechd">' + head + '</div><div class="mcard">' +
    items.map(([t, d]) =>
      '<div style="margin:10px 0"><div style="color:#f5c451;font-weight:bold">' + t + '</div>' +
      '<div style="color:#cbbb9b;font-size:13px;margin-top:3px">' + d + '</div></div>').join("") +
    '</div>').join(""),
  '<div class="sechd">🔒 停權名單</div>',
  '<div class="sub">最後更新:' + BAN.updated + '</div>',
  '<div class="mcard"><div style="color:#cbbb9b;font-size:13px;margin-bottom:10px">' + BAN_NOTE + '</div>' +
  (BAN.list.length
    ? '<table><thead><tr><th>帳號</th><th>角色</th><th>原因</th><th>日期</th></tr></thead><tbody>' +
      BAN.list.map(b => '<tr><td>' + b.acct + '</td><td>' + b.name + '</td><td>' + b.reason + '</td><td class="num">' + b.date + '</td></tr>').join("") +
      '</tbody></table>'
    : '<div style="color:#8a7d63;padding:6px 0">目前沒有公布中的停權紀錄。</div>') + '</div>',
  '<div class="sechd">📮 申訴管道</div>',
  '<div class="mcard"><div style="color:#cbbb9b;font-size:13px">認為處置有誤,請透過 LINE 官方帳號 <span class="lineid">' +
  LINKS.lineId + '</span> 私訊客服,附上帳號與說明;官方會複查紀錄後回覆。</div></div>',
].join("\n");
fs.writeFileSync(path.join(OUT, "rules.html"), page("遊戲規章", "rules", rulesBody));


// ---- 首頁 ----
fs.writeFileSync(path.join(OUT, "index.html"), page("首頁", "index", `
<div style="text-align:center;padding:10px 0 4px"><div style="font-size:15px;color:#b6a684">掛機練功・打寶強化・世界王討伐</div></div>
${chips([[mobList.length, "怪物"], [items.length, "道具"], [skills.length, "技能"], [zones.length, "獵場"], [worldbosses.length, "世界王"], [towns.reduce((s, t) => s + t.npcs.length, 0), "NPC"], [sets.length, "套裝"]])}
<div class="asktt">❓ 想知道什麼,直接點:</div>
<div class="ask">${ASK.map(([q, href]) => `<a href="${href}">${q}</a>`).join("")}</div>
${NAV_GROUPS.map(([gname, gicon, links]) => `<div class="sechd">${gicon} ${gname}</div><div class="grid">` +
  links.map(([href, , icon, label, desc]) => `<a class="tile" href="${href}"><div class="em">${icon}</div><div class="tt">${label}</div><div class="dd">${desc}</div></a>`).join("") +
  `</div>`).join("")}

<div class="sechd">💬 開始遊戲 & 加入社群</div>
<div class="sub">有問題到社群問,或加官方帳號私訊客服</div>
<div class="links">
<a class="link play" href="${LINKS.game}" target="_blank" rel="noopener"><div class="em">🎮</div><div><div class="tt">進入遊戲</div><div class="dd">${LINKS.gameLabel}</div></div></a>
<a class="link" href="${LINKS.discord}" target="_blank" rel="noopener"><div class="em">💬</div><div><div class="tt">Discord</div><div class="dd">公告・討論・找隊友</div></div></a>
<a class="link" href="${LINKS.lineGroup}" target="_blank" rel="noopener"><div class="em">👥</div><div><div class="tt">LINE 社群</div><div class="dd">玩家交流・活動通知</div></div></a>
<a class="link" href="https://line.me/R/ti/p/${encodeURIComponent(LINKS.lineId)}" target="_blank" rel="noopener"><div class="em">📮</div><div><div class="tt">LINE 官方帳號</div><div class="dd">客服私訊 <span class="lineid">${LINKS.lineId}</span></div></div></a>
</div>
<div class="card" style="display:block;margin-top:16px;font-size:12px;color:#8f8067;line-height:1.8"><b style="color:#b6a684;font-size:13px">免責聲明</b><br>
一、本遊戲為個人研究與技術學習專案。<br>
二、玩家的一切贊助皆屬自願行為,無任何強制;贊助所得全數用於伺服器租用、維護與研究開發。<br>
三、請玩家自行評估經濟能力,理性贊助,勿超出自身負擔。<br>
四、如遇爭議、異常狀況或違規行為(含外掛、漏洞利用、多開刷榜等),官方保留處置與最終解釋權。</div>`));


// ---- 🐕 寵物與召喚(2026-09-14 麥哥:玩家一直問客服「魅力能帶幾隻/召喚誰」→ 上官網)----
// ⚠ 這頁的數字**不在 gamedata**,是引擎常數,對碼自 engine/afk:魅力池 floor(cha/6)(skills.go:387 totalCollarCount 守門)、
//    四犬 petNames + collarForMobGo(stage3.go)、狗升級代價 petGoldCostTbl/petItemCostTbl(mastery.go)+petAutoUpMaxLv 30(stage3.go)、召喚術階級 summonTierByLevelGo(stage3.go:795)、迷魅 charmedTickGo(stage3.go)。
//    改了引擎這幾處要同步改這頁(全專案只有這裡是手抄;2026-09-14 對碼)。
fs.writeFileSync(path.join(OUT, "pets.html"), page("寵物與召喚", "pets", `
<div class="hint">玩家最常問客服的三個問題:魅力能帶幾隻?召喚術召出誰?迷魅是什麼?這頁一次講完。</div>

<div class="mcard"><div class="ttl">💗 魅力決定「能帶幾隻」</div>
<div class="sub">寵物(狗)和召喚物<b>共用一個名額池</b>:名額 = <b>魅力 ÷ 6</b>(小數捨去)。每張項圈佔 1 格、活著的召喚物佔 1 格。名額滿了就不能再誘捕、也不能再召喚。</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th>魅力</th><th>名額</th></tr></thead><tbody>
<tr><td>6 ~ 11</td><td>1</td></tr><tr><td>12 ~ 17</td><td>2</td></tr><tr><td>18 ~ 23</td><td>3</td></tr><tr><td>24 ~ 29</td><td>4</td></tr><tr><td>30 ~ 35</td><td>5</td></tr><tr><td>36 ~ 41</td><td>6</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px">・魅力<b>不影響</b>寵物的命中與傷害,那些看狗自己的等級(1~50)。<br>・喝「萬能藥」可永久 +1 魅力,最多 20 瓶。<br>・<b>寵物優先</b>:有召喚物時吹哨子叫狗,召喚物會被收掉。</div></div>

<div class="mcard"><div class="ttl">🐕 四種狗怎麼得到</div>
<div class="sub">用「肉」啟動<b>誘捕 300 秒</b>(名額滿不能啟動),期間殺到對應的怪 <b>100% 掉項圈</b>,拿到項圈就能吹哨子叫牠出來。項圈不可交易、不可存倉庫。</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th>狗</th><th>誘捕時要殺的怪</th></tr></thead><tbody>
<tr><td>杜賓狗</td><td>杜賓狗</td></tr><tr><td>狼</td><td>狼</td></tr><tr><td>哈士奇</td><td>哈士奇</td></tr><tr><td>牧羊犬</td><td>牧羊犬</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">📈 狗的升級要花什麼</div>
<div class="sub">狗的等級 1 ~ 50,<b>命中與傷害只看狗自己的等級與天賦</b>。經驗來自狗<b>每命中一下 +1</b>(沒帶出門、沒出手就不會長)。<b>30 級以前經驗滿了自動升</b>,不用花錢也不用按;<b>30 級起要自己按升級鈕</b>,每升一級收下面的代價。每次升級都會隨機抽一次天賦。</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th>等級</th><th>每升一級</th><th>這段合計</th><th>方式</th></tr></thead><tbody>
<tr><td>1 → 30</td><td>免費</td><td>0</td><td>經驗滿自動升</td></tr>
<tr><td>30 → 40</td><td>100 萬金幣</td><td>1,000 萬金幣</td><td>手動</td></tr>
<tr><td>40 → 45</td><td>1 瓶 萬能藥(CHA)</td><td>5 瓶</td><td>手動</td></tr>
<tr><td>45 → 50</td><td>2 瓶 萬能藥(CHA)</td><td>10 瓶</td><td>手動</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px">・<b>一隻練滿 50 級</b>:1,000 萬金幣 + 15 瓶萬能藥(CHA)。四隻全滿:4,000 萬金幣 + 60 瓶。<br>・萬能藥(CHA) 由 3 瓶白色萬能藥合成,而且自己喝(+1 魅力)、法師召喚精通也都用它,要自己取捨。<br>・升級只吃背包裡<b>沒上鎖</b>、沒強化沒祝福的萬能藥(CHA);金幣和藥先全部檢查夠不夠才扣,不會扣一半。<br>・累計經驗:30 級約 3.1 萬次命中、50 級約 29.6 萬次,四隻一起帶大約 43 小時。<br>・「重練」免費,等級、經驗、天賦全部歸零,已花的金幣和藥<b>不退</b>。</div></div>

<div class="mcard"><div class="ttl">🔮 法師「召喚術」召出誰</div>
<div class="sub"><b>召出幾隻看魅力</b>:法師召喚術一次召出 <b>魅力 ÷ 6 隻</b>(小數捨去,最少 1 隻);<b>52 級以上改 ÷ 8、60 級以上改 ÷ 10</b>(高階召喚物比較強,所以隻數變少)。整群召喚物只佔魅力名額 <b>1 格</b>,而且要有 1 格空名額才召得出來(名額 = 魅力 ÷ 6,狗先佔位)。</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th>魅力</th><th>51 級以下召出</th><th>52 ~ 59 級召出</th><th>60 級以上召出</th></tr></thead><tbody>
<tr><td>6 ~ 11</td><td>1 隻</td><td>1 隻</td><td>1 隻</td></tr><tr><td>12 ~ 17</td><td>2 隻</td><td>1 隻(16 起 2 隻)</td><td>1 隻</td></tr><tr><td>18 ~ 23</td><td>3 隻</td><td>2 隻</td><td>1 隻(20 起 2 隻)</td></tr><tr><td>24 ~ 29</td><td>4 隻</td><td>3 隻</td><td>2 隻</td></tr><tr><td>30 ~ 35</td><td>5 隻</td><td>3 隻(32 起 4 隻)</td><td>3 隻</td></tr><tr><td>36 ~ 41</td><td>6 隻</td><td>4 隻(40 起 5 隻)</td><td>3 隻(40 起 4 隻)</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px"><b>召出誰</b>看<b>角色等級</b>,不看魅力:</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th>角色等級</th><th>召喚</th></tr></thead><tbody>
<tr><td>未滿 32</td><td>哈柏哥布林</td></tr><tr><td>32</td><td>甘地妖魔</td></tr><tr><td>40</td><td>食人妖精</td></tr><tr><td>52</td><td>魔狼</td></tr><tr><td>60</td><td>地獄奴隸</td></tr><tr><td>64</td><td>地獄束縛犬</td></tr><tr><td>72</td><td>黑豹</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px">目前等級上限 55,60 級以上的召喚物要等上限開放。</div></div>

<div class="mcard"><div class="ttl">🧚 妖精「召喚屬性精靈」</div>
<div class="sub">召喚屬性精靈(敏 40)與召喚強力屬性精靈(敏 50)也是<b>一次一隻</b>,精靈的屬性跟著妖精自己選的屬性走。兩支互斥:勾強力會自動取消普通並換成上級精靈。</div></div>

<div class="mcard"><div class="ttl">📈 召喚獸的強度看什麼</div>
<div class="sub"><b>法師召喚獸(近戰)</b>:主屬性是<b>魅力</b>,同時加命中和傷害;<b>角色等級</b>再放大傷害;召喚物的<b>階級</b>決定底子(骰子大小)。力量、敏捷、智力對它<b>沒有</b>影響。</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th></th><th>法師召喚獸</th><th>妖精屬性精靈</th></tr></thead><tbody>
<tr><td>吃的屬性</td><td>魅力</td><td>(力量＋智力)÷2</td></tr>
<tr><td>命中</td><td>角色等級(打王 ×1.5)＋召喚物命中修正＋魅力－怪物等級＋怪物 AC</td><td>角色等級 ×1.5＋精靈命中修正＋(力＋智)÷2－怪物等級＋怪物 AC</td></tr>
<tr><td>傷害</td><td>該階骰子＋魅力換算的固定值(隨角色等級放大)－怪物減傷</td><td>骰子(普通 1~40、上級 2~40)＋(力＋智)÷2 換算的固定值(隨角色等級放大);走怪物<b>屬性抗性</b>,不吃 AC</td></tr>
<tr><td>魅力的作用</td><td>加命中、加傷害、決定隻數</td><td>只決定召不召得出來(佔 1 格名額),不影響強度</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px">兩種都<b>不吃武器</b>、不吃玩家的攻擊力數值。想讓召喚獸變強:升等級、加魅力(法師)或力智(妖精)、練「召喚精通」、戴「召喚控制戒指」、祈福女神的召喚系加持。</div></div>

<div class="mcard"><div class="ttl">💫 法師「迷魅術」</div>
<div class="sub">把場上一隻怪變成自己的迷魅獸幫忙打(<b>王不行</b>),一次只能有一隻,<b>不佔</b>魅力名額。魅力會加進迷魅獸的命中與傷害。角色死亡時迷魅獸解散。</div></div>
`));

// ---- 怪物掉落 ----
fs.writeFileSync(path.join(OUT, "monsters.html"), page("怪物掉落圖鑑", "mob", `
${chips([[mobList.length, "怪物"], [mobList.filter(m => m.drops.length).length, "有掉落"], [worldbosses.length, "世界王"]])}
<div class="bar"><input id="q" placeholder="🔍 搜怪物名,或輸入「道具名」找會掉它的怪"></div>
<div class="hint">例:搜「銀長劍」→ 列出所有會掉它的怪物。</div>
<div class="chips" id="lvchips"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>怪物</th><th>Lv</th><th>HP</th><th>經驗</th><th>屬性</th><th>出沒地點</th><th>掉落</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const LV=[["all","全部"],["1-20","1~20"],["21-40","21~40"],["41-60","41~60"],["61+","61+"]];let lv="all";
$("lvchips").innerHTML=LV.map(([k,t])=>'<span class="chip'+(k==="all"?" on":"")+'" data-k="'+k+'">'+t+'</span>').join("");
document.querySelectorAll("#lvchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#lvchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");lv=c.dataset.k;render();});
function inLv(m){if(lv==="all")return true;if(lv==="61+")return m.lv>=61;const p=lv.split("-");return m.lv>=+p[0]&&m.lv<=+p[1];}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.mobs.filter(m=>inLv(m)&&(!q||m.n.toLowerCase().includes(q)||m.drops.some(d=>d.n.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(m=>"<tr><td class='nm'>"+esc(m.n)+"</td><td class='num' data-l='等級'>Lv "+m.lv+"</td><td class='num' data-l='HP'>"+m.hp.toLocaleString()+"</td><td class='num' data-l='經驗'>"+m.exp.toLocaleString()+"</td><td class='num' data-l='屬性'>"+m.e+"</td>"+
"<td data-l='出沒地點'>"+(m.wbOnly?"<span class='tag wb'>🐉 世界王房限定</span>":(m.zones.length?m.zones.map(z=>"<span class='tag zn'>"+esc(z)+"</span>").join(""):"<span class='tag'>—</span>"))+"</td>"+
"<td data-l='掉落'>"+(m.drops.length?m.drops.map(d=>"<span class='tag"+(d.legend?" lg":"")+"'>"+(d.legend?"★":"")+esc(d.n)+"</span>").join(""):"<span style='color:#6b5f4c'>—</span>")+"</td></tr>").join("")||"<tr><td colspan=7 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 道具 ----
fs.writeFileSync(path.join(OUT, "items.html"), page("道具圖鑑", "item", `
${chips(["武器", "防具", "飾品", "藥水", "道具", "材料", "技能書"].map(t => [items.filter(i => i.t === t).length, t]))}
<div class="bar"><input id="q" placeholder="🔍 搜道具名稱"></div>
<div class="chips" id="tchips"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>道具</th><th>類型</th><th>部位/類別</th><th>職業</th><th>傷害</th><th>防禦</th><th>安定</th><th>價格</th><th>效果與說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const TS=["全部","武器","防具","飾品","藥水","道具","材料","技能書","其他"];let tf="全部";
$("tchips").innerHTML=TS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#tchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#tchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");tf=c.dataset.t;render();});
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.items.filter(i=>(tf==="全部"||i.t===tf)&&(!q||i.n.toLowerCase().includes(q)||(i.d||"").toLowerCase().includes(q)||(i.fx||[]).some(x=>x.toLowerCase().includes(q))||(i.src||[]).some(x=>x.toLowerCase().includes(q))||(i.ex||[]).some(x=>x.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(i=>{
const fx=(i.fx||[]).map(x=>"<span class='tag'>"+esc(x)+"</span>").join("");
const desc=i.d?"<div style='color:#b6a684;font-size:13px;margin-top:3px'>"+i.d+"</div>":"";
const src=(i.src&&i.src.length)?"<div style='margin-top:3px;font-size:12px;color:#7bd14a'>📍 掉落:"+i.src.map(x=>esc(x)).join("、")+(i.src.length>=8?" …等":"")+"</div>":"";
const area=(i.area&&i.area.length)?"<div style='margin-top:3px;font-size:12px;color:#7bd14a'>⛏ 採集地區:"+i.area.map(x=>esc(x)).join("、")+"(在這些地方打任何怪都可能掉)</div>":"";
const ex=(i.ex&&i.ex.length)?"<div style='margin-top:3px;font-size:12px;color:#f5c451'>🎁 "+i.ex.map(x=>esc(x)).join("<br>🎁 ")+"</div>":"";
return "<tr><td class='nm'"+(i.legend?" style='color:#ffd700'":"")+">"+(i.legend?"★":"")+esc(i.n)+"</td>"+
"<td class='num' data-l='類型'>"+i.t+"</td><td class='num' data-l='部位'>"+esc(i.slot||i.wcat||"—")+"</td><td class='num' data-l='職業'>"+esc(i.req||"—")+"</td>"+
"<td class='num' data-l='傷害'>"+(i.dmg||"—")+"</td><td class='num' data-l='防禦'>"+(i.ac||"—")+"</td>"+
"<td class='num' data-l='安定'>"+((i.safe!==""&&(i.t==="武器"||i.t==="防具"))?"+"+i.safe:"—")+"</td>"+
"<td class='num' data-l='價格'>"+(i.p?((i.buy?"<div style='color:#7bd14a'>商店賣 "+i.p.toLocaleString()+"</div>":"")+"<div style='color:#b6a684'>賣店回收 "+i.sell.toLocaleString()+"</div>"):"—")+"</td>"+
"<td data-l='效果'>"+(fx||desc||src||area||ex?fx+desc+src+area+ex:"<span style='color:#6b5f4c'>—</span>")+"</td></tr>";}).join("")||"<tr><td colspan=9 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 技能 ----
fs.writeFileSync(path.join(OUT, "skills.html"), page("技能介紹", "skill", `
${chips([[skills.length, "技能"], ...["攻擊", "治癒", "增益", "被動", "工具", "轉換"].map(t => [skills.filter(s => s.t === t).length, t])])}
<details class="how"><summary>📐 數字怎麼算(魔法傷害 / 治癒 / 狀態命中 / MP / 增益)— 客服與玩家共用</summary>
<ul>
<li><b>魔法攻擊傷害</b>:骰 ×(1 + 3×魔法傷害÷16)×(1 + 技能階級÷3)+ 額外魔法點數 → 扣怪物魔防 → <b>法師再 ×1.5</b>(妖精沒有)。魔法傷害與額外魔法點數都只看 INT(裸裝 INT 25 → 4 / 6,INT 40 → 8 / 10,INT 60 → 15 / 15)。INT 35 起有魔法爆擊(INT 60 為 7%,爆擊骰值 ×1.5)。</li>
<li><b>怪物魔防 MR</b>:MR ≤ 100 時打 (100 − MR÷2)%,例 MR 10 → 95%、MR 60 → 70%、MR 100 → 50%;MR 超過 100 每 10 點再少 1%。是打折不是免疫。</li>
<li><b>治癒</b>:回復量 = 技能基礎值 + 係數 × 額外魔法點數,只看 INT、每次固定不擲骰,法師與妖精一樣。自動治癒在 HP 低於你設定的「治癒 HP%」時施放,冷卻 2 秒(加速時 1.34 秒)。</li>
<li><b>狀態技與即死的命中(異常魔法命中)</b>:命中值 = 自己等級 + 魔法命中 −(怪物等級 − 10)− 怪物 MR÷10,限 0~20;擲 20 面骰 ≤ 命中值即命中(20 必中、1 必失)。換算:命中值 10 → 50%、≥19 → 95%、0 → 5%。魔法命中裸裝只看 INT(INT 25 → 2、INT 40 → 8、INT 60 → 18)。<b>世界王免疫所有狀態與即死</b>;施放就扣 MP,沒中也扣。</li>
<li><b>MP 消耗</b>:實扣 = 技能 MP ×(1 − INT 減免%),INT 25 減 16%、INT 40 減 26%、INT 45 以上減 30%,最低 1。</li>
<li><b>增益技能</b>:在自動設定勾選後,到期會自動再放一次(MP 夠才放),同一效果不疊加。世界王房也會自動續放;PK 是開場帶著身上的效果進場,場中不續放。</li>
<li><b>世界王房手動按鈕</b>:喝水 1 秒冷卻;攻擊技 / 治癒 / 轉換 2 秒冷卻(治癒與轉換共用);結界 = 用 1 張魔法屏障卷軸;聖結界 5 秒冷卻、全房已按攻擊的成員一起套。石化或麻痺中六種全部不能按。</li>
</ul></details>
<div class="bar"><input id="q" placeholder="🔍 搜技能名稱、效果(例:即死、暈眩、召喚、×0.7)"><select id="cls"><option value="all">全職業</option><option value="k">騎士</option><option value="m">法師</option><option value="e">妖精</option><option value="dk">黑暗妖精</option></select></div>
<div class="chips" id="tchips"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>技能</th><th>類型</th><th>階級</th><th>MP</th><th>學習需求</th><th>效果與說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
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
  (!q||s.n.toLowerCase().includes(q)||(s.d||"").toLowerCase().includes(q)||(s.x||"").toLowerCase().includes(q)||(s.fx||[]).some(x=>x.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(s=>{
const fx=(s.fx||[]).map(x=>"<span class='tag'>"+esc(x)+"</span>").join("");
const note=s.x?"<div class='sknote'>📐 "+esc(s.x)+"</div>":"";
const desc=(s.d?"<div style='color:#b6a684;font-size:13px;margin-top:3px'>"+esc(s.d)+"</div>":"")+note;
const badge=s.b?" <span class='tag' style='color:#fbbf24;border-color:#7a5a12;white-space:nowrap'>⚠ "+esc(s.b)+"</span>":"";
return "<tr><td class='nm'>"+esc(s.n)+badge+"</td><td class='num' data-l='類型'>"+esc(s.t)+"</td><td class='num' data-l='階級'>"+(s.tier||"—")+"</td><td class='num' data-l='MP'>"+(s.mp||"—")+"</td>"+
"<td class='num' data-l='學習條件' style='font-size:12px'>"+reqStr(s)+"</td>"+
"<td data-l='效果'>"+(fx||desc?fx+desc:"<span style='color:#6b5f4c'>—</span>")+"</td></tr>";}).join("")||"<tr><td colspan=6 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;$("cls").onchange=render;render();
</script>`));

// ---- 獵場 ----
// ---- 🎉 活動介紹(限時活動)----
// ⚠ 這頁是**手寫內容**,不是從 gamedata 產的 —— 活動規則本來就不在遊戲資料裡。
//    要改活動/新增下一檔,就改下面這個 EVENTS 陣列再重跑 gen.js;
//    活動結束把該筆的 over 改成 true(會自動變灰並標「已結束」)。
// 🎑 中秋禮盒的內容物與機率**直接從 gamedata 算**(麥哥 2026-09-25:「禮盒機率都公開在官網」;數字一律從程式出、不准手抄)。
//    公開的是「抽中機率」(權重 ÷ 總權重);**禮盒的貴重品冷卻表不公開**(與 9/24 全服產出冷卻同屬隱形機制)、碎片掉率也不公開(gen.js 鐵律)。
const MOON_ROWS = (() => {
  const b = ((GD.items || {}).pack_moon_box || {}).pack;
  if (!b || !b.pick) return [];
  const tot = b.pick.reduce((s, r) => s + (+r.w || 0), 0) || 1;
  return b.pick.filter(r => (+r.w || 0) > 0)
    .map(r => ({ n: (GD.items[r.id] || {}).n || r.id, q: r.n || 1, pct: (+r.w) / tot * 100, mq: !!r.mq }))
    .sort((a, b) => b.pct - a.pct)
    .map(r => [`${r.mq ? "✨ " : ""}${r.n} ×${r.q}`, `${r.pct.toFixed(2)}%`]);
})();
const MOON_EX = ((GD.items || {}).pack_moon_box || {}).moonEx || { need: 50, dailyCap: 5 };
const MOON_BADGE = ((GD.items || {}).badge_moon || {}).moonEx || { need: 30, gold: 888888, dailyCap: 2 }; // 🎖 中秋勳章列(9/25 晚加)
const MOON_KEY_P = ((GD.items || {}).item_moon_key || {}).p || 2000000;

const EVENTS = [
  {
    // 🎑 中秋活動(2026-09-25 麥哥拍板;9/26 12:30 ~ 10/3 12:00)。規則與數字對應 go端專案 gamedata:
    //    items.mat_moon_shard(eventDrop)/pack_moon_box(moonEx + pack)/item_moon_key(p)/doll_contract_1~3;內容開關 moon/doll/dollgold/dollfree。
    title: "🎑 中秋月光祭",
    rewardHead: "🎁 中秋禮盒內容物（每盒開出其中一項）",
    when: "2026/09/26(五) 12:30 至 2026/10/03(五) 12:00",
    over: false,
    intro: `中秋節到了！活動期間打怪有機會撿到「<b>月光碎片</b>」，集滿 <b>${MOON_EX.need} 個</b>就能到<b>說話之島</b>找「<b>月宮玉兔</b>」換一個「<b>中秋禮盒</b>」。禮盒要用「<b>中秋鑰匙</b>」（各村雜貨商販售，${(MOON_KEY_P / 10000).toLocaleString()} 萬金幣）才打得開，開出來的東西包含<b>卷軸、藍鑽、祝福卷軸、BOSS結晶、高階技能書</b>，以及這次新登場的「<b>娃娃契約書</b>」——用了就能直接解鎖一隻娃娃！<br>碎片多的話，月宮玉兔還能換「<b>🎖 中秋勳章</b>」（${MOON_BADGE.need} 碎片 + ${MOON_BADGE.gold.toLocaleString()} 金幣，每帳號每天 ${MOON_BADGE.dailyCap} 枚）：戴上 10 小時內 <b>HP +50、MP +50、狩獵經驗 +10%、近戰／遠距／魔法命中各 +2、召喚獸命中 +1</b>。`,
    rewards: MOON_ROWS,
    steps: [
      `到 <b>Lv40 以上</b>的狩獵區打怪，有機率獲得「月光碎片」（碎片不能賣店、不能存倉庫、不能上交易所）。`,
      `集滿 <b>${MOON_EX.need} 個</b>月光碎片 → 到<b>說話之島</b>找「<b>月宮玉兔</b>」兌換「中秋禮盒」（<b>每個帳號每天最多 ${MOON_EX.dailyCap} 次</b>，清晨 05:00 重置）。`,
      `到任一村莊的<b>雜貨商</b>購買「中秋鑰匙」（${(MOON_KEY_P / 10000).toLocaleString()} 萬金幣 / 把）。`,
      `在背包點「中秋禮盒」→「使用」，一把鑰匙開一盒；數量多的時候可以用「<b>使用 ×10</b>」「<b>使用 ×100</b>」一次開一批，結果會彙總顯示。`,
      `開到「<b>娃娃契約書</b>」（白／綠／藍）就到<b>背包 → 🪆 娃娃</b>分頁點「使用」，隨機解鎖該階的一隻娃娃；抽到已擁有的會轉成該階碎片 ×1（和抽卡相同）。`,
      `碎片多出來的話，月宮玉兔還有第二樣：<b>月光碎片 ×${MOON_BADGE.need} + ${MOON_BADGE.gold.toLocaleString()} 金幣 → 🎖 中秋勳章</b>（<b>每個帳號每天最多 ${MOON_BADGE.dailyCap} 枚</b>，和禮盒的次數分開算）。勳章戴在「徽章②」，配戴後 <b>10 小時</b>內：<b>HP +50、MP +50、狩獵經驗 +10%、近戰／遠距／魔法命中各 +2、召喚獸命中 +1</b>；放在背包不計時、卸下會暫停、時間到自動消失。<b>可以和徽章①的其他勳章同時配戴</b>，效果相加。`,
    ],
    rules: [
      `<b>機率表</b>就是上面那張：每一盒開出其中<b>一項</b>，數字是「該項被抽中的機率」，全部加起來 100%。標 ✨ 的是稀有品，開出來會<b>全服跑馬燈</b>恭喜。`,
      `月光碎片、中秋鑰匙、中秋禮盒、娃娃契約書都是<b>活動道具</b>：不能賣店、不能存倉庫、不能上交易所。<b>活動結束（10/3 12:00）後，這些道具會由系統全數回收</b>，請在活動期間用完。已經開出來的獎品與已解鎖的娃娃<b>不會被回收</b>。`,
      `兌換次數以<b>帳號</b>計（同帳號不同角色共用每天 ${MOON_EX.dailyCap} 次）。`,
      `活動期間 <b>🪆 娃娃卡片</b>正式開放；活動期間娃娃的取得方式為<b>禮盒開出的娃娃契約書</b>，其他取得方式將於活動結束後另行公告。`,
      `<b>🎖 中秋勳章</b>也是活動道具（不能賣店、不能存倉庫、不能上交易所、不能強化、不能賦予）；<b>配戴的那一刻才開始倒數 10 小時</b>，放在背包不計時，卸下會暫停、再戴上從剩餘時間繼續，時間到自動消失。同一時間只能配戴一枚中秋勳章（徽章②），但可以和徽章①的其他勳章同時配戴、效果相加。活動結束時<b>尚未配戴的中秋勳章一併回收</b>，戴在身上的會倒數到結束為止。`,
      `<b>BOSS結晶</b>自本次維護起可以上交易所。`,
      `如遇異常或爭議，以遊戲內紀錄為準；官方保留活動修改與最終判定之權利。`,
    ],
  },
  {
    // 🎬 第二波錄影推廣(2026-09-21 麥哥開的)。獎勵改成「錄影推廣禮包II」(含 10 小時時效勳章)。
    // ⚠ 這檔比上一檔多一條硬規定:**貼文文案必須使用官方範本**(下面 tpl 那段),影片可自錄或用官方範本影片。
    title: "🎬 錄影推廣大作戰 II",
    rewardHead: "項目",
    when: "2026/09/21(一) 至 2026/09/26(六)　每日可領一次",
    over: false,
    intro: "第二波開跑!把你的遊戲畫面錄下來發到社群,天天都能領獎勵。這次的禮包裡多了一張限時的 🎖 錄影推廣勳章,配戴 10 小時內經驗與金幣都會變多。",
    rewards: [
      ["每日回報成功", "🎁 錄影推廣禮包II ×1"],
      ["禮包內容", "💎 藍鑽 ×50、🎖 錄影推廣勳章 ×1、💰 金幣 200,000"],
      ["🎖 勳章效果(配戴 10 小時)", "狩獵經驗 +10%、擊殺金幣 +10%、傷害減免 +2"],
    ],
    steps: [
      "準備影片:<b>自己錄的遊戲畫面</b>(15 秒以上,建議 15 到 30 秒),<b>或</b>直接使用<b>官方影片範本</b>(在<b>官方 Discord</b> 與 <b>LINE 社群的記事本</b>都拿得到)。",
      "貼文文案<b>必須使用下面的官方範本</b>,整段複製,並把第一行的日期改成<b>當天日期</b>。",
      "發布到 <b>抖音 / Instagram / Threads(脆)</b> 其中一個平台,<b>必須是公開貼文或 Reels</b>;<b>或臉書天堂私服社團,必須是公開貼文</b>。",
      "把<b>貼文連結</b>私訊官方 LINE @068ivpaq,附上你的<b>遊戲帳號</b>與<b>角色名稱</b>。",
    ],
    tpl: {
      head: "📝 官方文案範本(必須使用)",
      note: "整段複製貼上,只要把<b>第一行的日期</b>換成你發文的當天日期。自行改寫或日期不對,該次不計入。",
      lines: [
        "阿肥放置天地 (當天日期 9/XX)",
        "「你以為你在上班,其實你的角色正在替你打天下。」",
        "",
        "睜開眼,等級又升了。",
        "打開遊戲,昨天打不過的王已經倒了,裝備還掉了一地。",
        "",
        "不用肝、不用一直盯著螢幕,挑個獵場,剩下的交給它。",
        "",
        "變身、打王、血盟、交易、決鬥……",
        "這次不是回到天堂,",
        "是讓你重新體驗「那個年代」的熱血。",
        "",
        "《阿肥放置天地》",
        "你的角色,永遠比你早一步開始變強。",
        "",
        "▼ 遊戲入口",
        "https://afei.gg/",
        "",
        "▼ 客服 ID: @068ivpaq",
      ],
    },
    rules: [
      "<b>每個 LINE 帳號每天只能回報一次、領取一次</b>(以每日 00:00 到 23:59 計算)。",
      "<b>三個要素缺一不可</b>:①官方文案範本 ②影片(自錄或官方範本影片) ③文案上的<b>當天日期</b>。少一項或文案被改寫,該次不計入。",
      "貼文需<b>保留至少 1 天</b>,提前刪除或改為私人將取消該次資格。",
      "獎勵於審核通過後發放,寄到遊戲內<b>交易所 →「領取」</b>頁,離線也收得到。",
      "🎖 勳章是<b>時效裝備</b>:<b>配戴的那一刻</b>才開始倒數 10 小時(放在背包不會計時);<b>卸下會暫停計時</b>、剩餘時間記在那面勳章上,再戴上就繼續倒數;戴著時時間到<b>自動消失</b>,而且<b>無法強化、無法交易</b>。",
      "🎖 <b>同時只能配戴一面</b>(勳章固定放在「徽章①」格);再戴第二面會把原本那面換下來、原本那面<b>暫停計時</b>回到背包,不會兩面一起生效。",
      "🔴 <b>回收公告:錄影推廣勳章將於 9/27(六)中午伺服器重啟後全面銷毀回收</b> —— 不論戴在身上或放在背包都會一併收回,<b>屆時不另行補償</b>。請把握時間在 9/27 中午前用掉,不要囤著。",,
      "影片內容不得含有不雅、攻擊他人或與本遊戲無關的內容;查證造假者取消資格。",
      "官方保留活動修改與最終判定之權利。",
    ],
  },
  {
    title: "🎥 徵求推廣範本影片 · 3 個名額",
    rewardHead: "項目",
    when: "即日起 至 2026/09/19(六)",
    over: true, // 2026-09-16 麥哥:名額已滿,收起(卡片自動變灰並標「已結束」)
    intro: "我們想找 3 支好看的遊戲影片,當成推廣活動的公版範本,給全社群的玩家拿去用。被選上的人,每位 💎 200 藍鑽。",
    rewards: [
      ["入選(共 3 名)", "💎 藍鑽 ×200"],
    ],
    steps: [
      "錄製<b>遊戲內打怪畫面</b>,長度 <b>15 到 30 秒</b>。",
      "影片畫面中要出現 <b>官網 afei.gg</b> 與 <b>官方 LINE @068ivpaq</b>(打字幕或貼在畫面角落都可以)。",
      "建議用<b>手機直式 9:16</b>,這樣大家轉發到抖音、IG、脆才不會有黑邊。",
      "私訊官方 LINE @068ivpaq,附上<b>影片原始檔</b>(不要傳壓縮過的連結)與你的<b>遊戲帳號、角色名稱</b>。",
    ],
    rules: [
      "<b>截止時間:2026/09/19(六)</b>。",
      "入選 3 名,每位 💎 200 藍鑽,發放至遊戲內<b>交易所 →「領取」</b>頁。",
      "<b>投稿即表示同意</b>官方與其他玩家,可自由使用、修改、散布你的影片作為推廣素材,不另外支付費用。",
      "影片中<b>不得出現他人的個人資訊</b>或與本遊戲無關的內容。",
      "由官方擇優選出,評選重點:<b>畫面清晰、節奏明快、看得懂在玩什麼</b>。",
      "官方保留活動修改與最終判定之權利。",
    ],
  },
  {
    title: "🎬 錄影推廣大作戰",
    rewardHead: "項目",
    when: "2026/09/16(三) 至 2026/09/19(六)　每日可領一次",
    over: true, // 2026-09-21 第一波已結束(由「錄影推廣大作戰 II」接手),卡片自動變灰並標「已結束」
    intro: "把你的遊戲畫面錄下來發到社群,天天都能領獎勵。掛機、打王、開箱、炫裝備,拍什麼都可以。",
    rewards: [
      ["每日回報成功", "🎁 錄影推廣禮包 ×1"],
      ["禮包內容", "💎 藍鑽 ×50、對武器施法的卷軸 ×5、對盔甲施法的卷軸 ×5、💰 金幣 200,000"],
    ],
    steps: [
      "錄製<b>遊戲畫面 15 秒以上</b>(建議 15 到 30 秒),內容不限。",
      "發布到 <b>抖音 / Instagram / Threads(脆)</b> 其中一個平台,<b>必須是公開貼文或 Reels</b>;<b>或臉書天堂私服社團,必須是公開貼文</b>。",
      "貼文文案必須包含:<b>當天日期</b>(例如 2026/09/16)、<b>遊戲連結 afei.gg 或 官方 LINE @068ivpaq</b>、標籤 <b>#放置天地 #阿肥放置</b>。",
      "把<b>貼文連結</b>私訊官方 LINE @068ivpaq,附上你的<b>遊戲帳號</b>與<b>角色名稱</b>。",
    ],
    rules: [
      "<b>每個 LINE 帳號每天只能回報一次、領取一次</b>(以每日 00:00 到 23:59 計算)。",
      "貼文需<b>保留至少 1 天</b>,提前刪除或改為私人將取消該次資格。",
      "獎勵於審核通過後發放,寄到遊戲內<b>交易所 →「領取」</b>頁,離線也收得到。",
      "影片內容不得含有不雅、攻擊他人或與本遊戲無關的內容;查證造假者取消資格。",
      "官方保留活動修改與最終判定之權利。",
    ],
  },
  {
    title: "🏁 開服衝等大賽",
    when: "2026/09/11(五)20:00 ～ 2026/09/18(五)20:00",
    over: true, // 2026-09-18 20:00 活動已截止,名次以正式結算快照為準
    intro: "新服開張,誰先衝上去誰就是這一週的名字。以活動結束當下的等級排名為最終名次。",
    rewards: [
      ["🥇 全職業 等級第一名", "💎 5000 藍鑽"],
      ["🛡️ 騎士 等級第一名", "💎 2000 藍鑽"],
      ["🏹 妖精 等級第一名", "💎 2000 藍鑽"],
      ["🔮 法師 等級第一名", "💎 2000 藍鑽"],
      ["🌑 黑暗妖精 等級第一名", "💎 2000 藍鑽"],
    ],
    // 🏆 得獎名單(2026-09-18 20:00 結算快照;獎勵同日已發放)。
    // ⚠ 只放<b>角色名</b>,帳號絕不上官網(玩家個資不進 git)。
    result: {
      head: "🏆 得獎名單（2026/09/18 20:00 結算）",
      note: "名次以結算當下的等級為準（同等級比經驗），與遊戲內「排行榜」同一套排法。獎勵已發放至遊戲內<b>交易所 →&nbsp;領取</b>頁。恭喜以上五位,也謝謝這一週一起衝的每一位冒險者 🎉",
      cols: ["獎項", "角色", "職業", "等級", "獎勵"],
      rows: [
        ["🥇 全職業 第一名", "潘朵拉之吻", "妖精", "Lv54", "💎 5000"],
        ["🏹 妖精 第一名", "煙雨蘭軒", "妖精", "Lv54", "💎 2000"],
        ["🔮 法師 第一名", "Gandalf", "法師", "Lv54", "💎 2000"],
        ["🛡️ 騎士 第一名", "發財", "騎士", "Lv53", "💎 2000"],
        ["🌑 黑暗妖精 第一名", "大牛比較懶", "黑妖", "Lv53", "💎 2000"],
      ],
      foot: "※ 妖精組第一名<b>潘朵拉之吻</b>同時是全職業第一名,依「獎項不重複領取」規則只領 5000 藍鑽,妖精組的 2000 藍鑽<b>順延給第二名煙雨蘭軒</b>。",
    },
    rules: [
      "名次以<b>活動結束當下</b>的等級為準;同等級時經驗值高的排前面 —— 與遊戲內「排行榜」完全相同的排法,你隨時都能自己查。",
      "<b>獎項不重複領取</b>:全職業第一名只領 5000 藍鑽那一份,<b>不再領自己職業的 2000</b>;該職業的第一名獎<b>順延給同職業第二名</b>。也就是說,五個獎項會由五位不同的玩家獲得。",
      "獎勵於活動結束後統一發放,寄到<b>交易所 →「領取」</b>頁,離線也收得到。",
      "離線掛機獲得的經驗同樣計入,不需要一直守在電腦前。",
      "獎勵發放對象為該角色所屬的<b>帳號</b>。",
    ],
  },
];

// ⚠ 舊規則:有 result(得獎名單)的活動不淡化(那張卡要截圖發社群)。
// 🔴 2026-09-21 麥哥指示取消這個例外 —— 名單公布期已過,結束的活動就該一眼看出是結束的,
//    否則玩家會以為衝等大賽還在跑。現在**只看 over**:結束就淡化,得獎名單照樣看得到。
// 🔴 2026-09-20 修:開頭這個 `>` **原本漏了** —— `<div class="mcard"` 後面直接接換行與下一個 <div>,
//    瀏覽器會把後面那個標籤當成屬性吃掉 ⇒ 卡片的 div 根本沒正確開啟,
//    背景/邊框/內距**一次都沒生效過**。這正是麥哥說「活動之間區隔不夠明顯」的根因,不是樣式不夠重。
const evCard = e => `<div class="mcard evcard${e.over ? " evover" : ""}"` + (e.over ? ` style="opacity:.55"` : "") + `>
  <div class="evhd">
    <div class="ttl">${e.title}${e.over ? "（已結束）" : ""}</div>
    <div class="sub" style="color:#f5a97f;font-weight:bold;margin-top:4px">🗓️ ${e.when}</div>
  </div>
  <div class="sub">${e.intro}</div>
  ${e.result ? `<div class="sub" style="margin-top:14px;color:#f5c451;font-weight:bold;font-size:16px">${e.result.head}</div>
  <div class="wrap"><table><thead><tr>${e.result.cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${e.result.rows.map(r => `<tr><td class="nm">${r[0]}</td><td class="nm" style="color:#f5c451">${r[1]}</td><td class="num" data-l="職業">${r[2]}</td><td class="num" data-l="等級">${r[3]}</td><td class="num" data-l="獎勵" style="color:#7bd1ff;font-weight:bold">${r[4]}</td></tr>`).join("")}</tbody></table></div>
  <div class="sub" style="margin-top:6px;font-size:13px">${e.result.foot}</div>
  <div class="sub" style="margin-top:6px;font-size:13px">${e.result.note}</div>` : ""}
  <div class="sub" style="margin-top:12px;color:#f5c451;font-weight:bold">🎁 獎勵</div>
  <div class="wrap"><table><thead><tr><th>${e.rewardHead || "名次"}</th><th>獎勵</th></tr></thead><tbody>${e.rewards.map(([k, v]) => `<tr><td class="nm">${k}</td><td class="num" data-l="獎勵" style="color:#7bd1ff;font-weight:bold">${v}</td></tr>`).join("")}</tbody></table></div>
  ${e.steps ? `<div class="sub" style="margin-top:12px;color:#f5c451;font-weight:bold">📌 參加方式</div>
  <ol style="color:#b6a684;font-size:14px;line-height:1.9;margin:4px 0 0;padding-left:20px">${e.steps.map(s => `<li>${s}</li>`).join("")}</ol>` : ""}
  ${e.tpl ? `<div class="sub" style="margin-top:12px;color:#f5c451;font-weight:bold">${e.tpl.head}</div>
  <div class="sub" style="font-size:13px">${e.tpl.note}</div>
  <div style="position:relative;margin-top:6px">
    <button class="evcopy" onclick="var p=this.parentNode.querySelector('pre');navigator.clipboard.writeText(p.innerText);this.textContent='✅ 已複製';var b=this;setTimeout(function(){b.textContent='📋 複製文案'},1800)">📋 複製文案</button>
    <pre class="evtpl">${e.tpl.lines.map(l => String(l).replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("\n")}</pre>
  </div>` : ""}
  <div class="sub" style="margin-top:12px;color:#f5c451;font-weight:bold">📋 規則</div>
  <ul style="color:#b6a684;font-size:14px;line-height:1.9;margin:4px 0 0;padding-left:20px">${e.rules.map(r => `<li>${r}</li>`).join("")}</ul>
</div>`;

fs.writeFileSync(path.join(OUT, "event.html"), page("活動介紹", "event", `
${chips([[EVENTS.filter(e => !e.over).length, "進行中活動"]])}
<div class="hint">活動規則以本頁公告為準。獎勵一律寄到遊戲內「交易所 →&nbsp;領取」,離線也收得到。如遇爭議或違規(含外掛、漏洞、多開刷榜等),官方保留取消資格、調整獎勵與最終解釋權。</div>
${EVENTS.map(evCard).join("")}`));

fs.writeFileSync(path.join(OUT, "zones.html"), page("獵場列表", "zone", `
${chips([[zones.length, "獵場"], [zones.filter(z => z.cat === "野外").length, "野外"], [zones.filter(z => z.cat === "地監").length, "地監"], [zones.filter(z => z.ac).length, "有 AC 門檻"]])}
<div class="hint">🛡 <b>AC 門檻</b>:部分獵場對防禦有要求。你的<b>防禦 AC 沒達標</b>時,被怪<b>物理攻擊</b>會多吃傷害——<b>每差 1 點多吃 20%</b>(差 5 點=傷害兩倍)。遊戲裡不會有任何提示,所以先在這裡看清楚再去。<br>※ 只影響怪物的物理攻擊;魔法、中毒、世界王房、玩家對戰都不受影響。AC 是<b>數字越低越強</b>(−60 比 −50 強)。</div>
<div class="bar"><input id="q" placeholder="🔍 搜獵場名,或輸入「怪物名」找牠出沒的獵場"></div>
<div class="chips" id="cchips"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>獵場</th><th>類型</th><th>怪物等級</th><th>🛡 AC 門檻</th><th>出沒怪物</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
const CS=["全部","野外","地監","特殊"];let cf="全部";
$("cchips").innerHTML=CS.map(t=>'<span class="chip'+(t==="全部"?" on":"")+'" data-t="'+t+'">'+t+'</span>').join("");
document.querySelectorAll("#cchips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#cchips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");cf=c.dataset.t;render();});
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.zones.filter(z=>(cf==="全部"||z.cat===cf)&&(!q||z.n.toLowerCase().includes(q)||z.mobs.some(m=>m.toLowerCase().includes(q))));
$("tb").innerHTML=list.map(z=>"<tr><td class='nm'>"+esc(z.n)+(z.area?"<div style='font-weight:normal;color:#7bd14a;font-size:12px'>⛏ 採集:"+z.area.map(x=>esc(x)).join("、")+"</div>":"")+"</td><td class='num' data-l='類型'>"+z.cat+"</td><td class='num' data-l='怪物等級'>"+(z.lvMin?"Lv"+z.lvMin+"~"+z.lvMax:"—")+"</td><td class='num' data-l='AC門檻'>"+(z.ac?"<b style='color:#f5a97f'>"+z.ac+" 以下</b>":"<span style='color:#6b5f4c'>無</span>")+"</td><td data-l='出沒怪'>"+z.mobs.map(m=>"<span class='tag'>"+esc(m)+"</span>").join("")+"</td></tr>").join("")||"<tr><td colspan=5 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 世界王 ----
fs.writeFileSync(path.join(OUT, "worldboss.html"), page("世界王", "wb", `
${chips([[worldbosses.length, "世界王"]])}
<div class="hint">王房會定時重生,參戰有機會取得專屬掉落。以下為目前開放的世界王。<br>🎰 <b>抽獎券</b>:對王造成超過 100 點傷害、或有幫隊友補到血的參戰者,王死後有 <b>20%</b> 機率獲得一次「抽抽樂」(不是每次必得)。</div>
<div class="bar"><input id="q" placeholder="🔍 搜世界王名 或 掉落道具名"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>世界王</th><th>Lv</th><th>HP</th><th>入場等級</th><th>重生</th><th>掉落</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.worldbosses.filter(w=>!q||w.n.toLowerCase().includes(q)||w.drops.some(d=>d.n.toLowerCase().includes(q)));
$("tb").innerHTML=list.map(w=>"<tr><td class='nm'>"+esc(w.n)+(w.members.length?"<div style='font-weight:normal;color:#8f8067;font-size:12px'>同房 "+w.members.length+" 隻:"+esc(w.members.join("、"))+"</div>":"")+"</td>"+
"<td class='num' data-l='等級'>Lv "+w.lv+"</td><td class='num' data-l='HP'>"+w.hp.toLocaleString()+"</td><td class='num' data-l='入場等級'>"+(w.minLv?"Lv"+w.minLv:"—")+"</td><td class='num' data-l='重生'>"+(w.respawnMin?w.respawnMin+" 分":"—")+"</td>"+
"<td data-l='掉落'>"+(w.drops.length?w.drops.map(d=>"<span class='tag"+(d.legend?" lg":"")+"'>"+(d.legend?"★":"")+esc(d.n)+"</span>").join(""):"<span style='color:#6b5f4c'>—</span>")+"</td></tr>").join("")||"<tr><td colspan=6 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- NPC ----
fs.writeFileSync(path.join(OUT, "npc.html"), page("NPC 一覽", "npc", `
${chips([[towns.length, "村莊"], [towns.reduce((s, t) => s + t.npcs.length, 0), "NPC"]])}
<div class="bar"><input id="q" placeholder="🔍 搜 NPC 名、村莊名 或 服務(例:製作)"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>村莊</th><th>NPC</th><th>身分</th><th>說明</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
function render(){const q=$("q").value.trim().toLowerCase();
const rows=[];
for(const t of WIKI.towns){const ns=t.npcs.filter(n=>!q||n.n.toLowerCase().includes(q)||t.n.toLowerCase().includes(q)||(n.t||"").toLowerCase().includes(q)||(n.title||"").toLowerCase().includes(q)||(n.d||"").toLowerCase().includes(q)||(n.ex||[]).some(x=>x.toLowerCase().includes(q)));
ns.forEach((n,i)=>{
const ex=(n.ex&&n.ex.length)?"<div style='margin-top:5px;color:#f5c451'>🎁 可以換到:</div><ul style='margin:2px 0 0 16px;padding:0;color:#e8dcc0'>"+n.ex.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":"";
rows.push("<tr><td class='vil' data-l='村莊'><span class='de'>"+(i===0?esc(t.n):"")+"</span><span class='mo'>"+esc(t.n)+"</span></td><td class='nm'>"+esc(n.n)+"</td><td class='num' data-l='身分'>"+esc(n.title||n.t)+"</td><td data-l='說明' style='color:#b6a684;font-size:13px'>"+esc(n.d||"")+ex+"</td></tr>");});}
$("tb").innerHTML=rows.join("")||"<tr><td colspan=4 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));

// ---- 📜 職業試煉(2026-09-16 麥哥交代上官網)----
// 資料來源:`trials.json`,由 `cd engine && go run ./cmd/trialdump -json ../玩家資料站/trials.json` 匯出
//   (真相源=Go 的 afk.TrialRecipes + gamedata 的 towns/items/mobDrops)。
// 🔴 **改了試煉或掉落就重跑那支工具**,不要手改 trials.json,也**不要為了這件事去跑 wikidump**
//    (wikidump 會連強化機率一起重寫,那是刻意維持舊值的)。
// 🎚 FEAT.trial50=false ⇒ 迪嘉勒廷那組不列,改在頁面明白告訴玩家「尚未開放」(與遊戲 `feature trial50` 同步)。
{
  let TRIALS = [];
  try { TRIALS = JSON.parse(fs.readFileSync(path.join(OUT, "trials.json"), "utf8")); } catch (e) { }
  const CLSN = { knight: "騎士", elf: "妖精", mage: "法師", dark: "黑暗妖精" };
  const T50 = "npc_digallatin";
  const shown = TRIALS.filter(t => FEAT.trial50 || t.Id !== T50);
  const rows = [];
  for (const t of shown) {
    for (const ex of (t.ex || [])) {
      const cls = (ex.cls || []).map(c => CLSN[c] || c).join("/");
      const lv = ex.minLv ? `Lv ${ex.minLv}` : "不限";
      const rew = (ex.rewards || []).join(" 或 ");
      // 材料:有來源就寫「怪(Lv)・獵場」;沒來源=目前拿不到 ⇒ 老實標,不要讓玩家白找
      // ⚠ 一個材料可能有多個來源(掉率差到 10 倍以上),全部列出來、掉率高的在前,別害玩家打錯怪
      const mats = (ex.mats || []).map(m => {
        const head = `${m.n}${m.cnt > 1 ? " ×" + m.cnt : ""}`;
        const srcs = (m.srcs || []).map(s => ({
          line: `${s.mob}（Lv${s.mobLv}）${s.rate}%${s.rows > 1 ? "・一次最多掉 " + s.rows + " 個" : ""}`,
          zones: (s.zones || []).join("、"),
        }));
        return { head, srcs, none: srcs.length === 0 };
      });
      rows.push({ town: t.Town, npc: t.Npc, cls, lv, rew, mats });
    }
  }
  fs.writeFileSync(path.join(OUT, "trials.html"), page("職業試煉", "trial", `
${chips([[shown.length, "試煉 NPC"], [rows.length, "可換獎勵"]])}
<div class="hint">找對應村莊的 NPC 對話，交出材料就能換裝備。<b style="color:#f5c451">材料再湊齊一次就能再換一次</b>，沒有次數限制。</div>
${FEAT.trial50 ? "" : `<div class="hint" style="border-color:#8a3b2e;background:#241a16">📜 <b style="color:#ff8a70">50 級試煉（燃柳村・迪嘉勒廷）目前尚未開放</b>，遊戲中暫時看不到這位 NPC，開放時間另行公告。</div>`}
<div class="bar"><input id="q" placeholder="🔍 搜職業、村莊、NPC、獎勵 或 材料"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>職業</th><th>村莊 / NPC</th><th>等級</th><th>獎勵</th><th>需要的材料（哪裡打）</th></tr></thead><tbody id="tb"></tbody></table></div>`,
    `<script>const ROWS=${JSON.stringify(rows)};</script><script>
const $=id=>document.getElementById(id);
${ESC}
function matHtml(m){
  if(m.none) return "<div style='margin-bottom:8px'><b>"+esc(m.head)+"</b><br><span style='color:#ff8a70;font-size:12px'>目前尚無取得管道</span></div>";
  return "<div style='margin-bottom:8px'><b>"+esc(m.head)+"</b>"+m.srcs.map(s=>
    "<br><span style='color:#b6a684;font-size:12px'>"+esc(s.line)+"</span><br><span style='color:#8f8067;font-size:12px'>"+esc(s.zones)+"</span>").join("")+"</div>";
}
function render(){const q=$("q").value.trim().toLowerCase();
const list=ROWS.filter(r=>!q||[r.cls,r.town,r.npc,r.rew].join(" ").toLowerCase().includes(q)||r.mats.some(m=>m.head.toLowerCase().includes(q)));
$("tb").innerHTML=list.map(r=>"<tr><td class='nm'>"+esc(r.cls)+"</td><td data-l='NPC'>"+esc(r.town)+"<br><span style='color:#b6a684;font-size:12px'>"+esc(r.npc)+"</span></td><td class='num' data-l='等級'>"+esc(r.lv)+"</td><td data-l='獎勵' style='color:#f5c451'>"+esc(r.rew)+"</td><td data-l='材料'>"+r.mats.map(matHtml).join("")+"</td></tr>").join("")||"<tr><td colspan=5 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));
}

// ---- 套裝 ----
fs.writeFileSync(path.join(OUT, "sets.html"), page("套裝效果", "set", `
${chips([[sets.length, "套裝"]])}
<div class="hint">湊齊整套裝備即可獲得額外加成。</div>
<div class="bar"><input id="q" placeholder="🔍 搜套裝名 或 裝備名"></div>
<div class="wrap" id="tb-wrap"><table><thead><tr><th>套裝</th><th>湊齊加成</th><th>組成裝備</th></tr></thead><tbody id="tb"></tbody></table></div>`,
`<script src="data.js"></script><script>
const $=id=>document.getElementById(id);
${ESC}
function render(){const q=$("q").value.trim().toLowerCase();
const list=WIKI.sets.filter(s=>!q||s.n.toLowerCase().includes(q)||s.items.some(i=>i.toLowerCase().includes(q)));
$("tb").innerHTML=list.map(s=>"<tr><td class='nm'>"+esc(s.n)+"</td><td class='num' data-l='效果'>"+(s.ac?"防禦 +"+s.ac:"—")+"</td><td data-l='組成'>"+s.items.map(i=>"<span class='tag'>"+esc(i)+"</span>").join("")+"</td></tr>").join("")||"<tr><td colspan=3 style='color:#8f8067'>查無符合</td></tr>";}
$("q").oninput=render;render();
</script>`));


// ---- 📖 怪物圖鑑登錄(2026-09-14 改版;FEAT.codex 開放後才生成)----
// 資料來源:gamedata.codexBonus(伺服器不下發給玩家,這裡直接讀本機檔)+ mobs 等級;規則常數手抄自 engine/afk/codex.go
//   (50/200 次、等級×2 萬;麥哥拍板官網只寫 Lv1~39:Lv40+ 與世界王的擊殺數/藍鑽費/效果一律不列)。改引擎要同步。
if (FEAT.codex && GD.codexBonus) {
  const STAT = { hp: "最大 HP", mp: "最大 MP", hpr: "回血", mpr: "回魔", mh: "近戰命中", rh: "遠程命中", magicHit: "魔法命中", mgd: "魔法傷害",
    pveDmg: "PvE 傷害", pveDr: "PvE 減傷", pvpDmg: "PvP 傷害", pvpDr: "PvP 減傷", exp: "經驗獲得" };
  const rows = Object.entries(GD.codexBonus)
    .map(([k, d]) => ({ k, d, m: GD.mobs[k] }))
    .filter(r => r.m && r.m.lv <= 49 && mobZones[r.m.n] && STAT[r.d.stat]) // mobZones=玩家進得去的獵場才有的怪(同怪物頁過濾);麥哥 9/14 晚:Lv40~49 也上
    .sort((a, b) => (a.m.lv - b.m.lv) || a.m.n.localeCompare(b.m.n));
  const need = lv => lv < 20 ? 50 : lv < 40 ? 200 : 500;
  const cost = lv => `${(lv * 20000).toLocaleString()} 金幣${lv >= 40 ? " + 10 藍鑽" : ""}`;
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const bonusTxt = d => `${STAT[d.stat]} +${d.v}${d.stat === "exp" ? "%" : ""}`;
  fs.writeFileSync(path.join(OUT, "codex.html"), page("怪物圖鑑登錄", "codex", `
<div class="hint">「能力 → 圖鑑」(<b>角色 41 級</b>起開放):同一隻怪殺到門檻會<b>點亮</b>,再付費<b>登錄</b>,就拿到那一格的<b>永久加成</b>。圖鑑是<b>整個帳號共用</b>的:擊殺數三隻角色一起算,登錄後每隻角色都吃得到加成。</div>

<div class="mcard"><div class="ttl">📖 規則</div>
<div class="wrap"><table><thead><tr><th>怪物等級</th><th>點亮要殺幾次(帳號累計)</th><th>登錄費</th></tr></thead><tbody>
<tr><td>Lv1 ~ 19</td><td>50 次</td><td>怪物等級 × 2 萬金幣</td></tr>
<tr><td>Lv20 ~ 39</td><td>200 次</td><td>怪物等級 × 2 萬金幣</td></tr>
<tr><td>Lv40 ~ 49</td><td>500 次</td><td>怪物等級 × 2 萬金幣 <b>+ 10 藍鑽</b></td></tr>
<tr><td>Lv50 以上・世界王</td><td colspan="2">尚未開放</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px">・只有 <b>41 級以上</b>的角色打怪才會計入擊殺數(40 級以下不計)。<br>・沒點亮的格子會顯示目前殺了幾次(例:12 / 50)。<br>・登錄是一次性的,登錄後那格永久亮起、效果立即生效。<br>・圖鑑開放之前的擊殺不算,從開放那一刻開始計;尚未開放的等級帶也不會累積。<br>・世界王只有「拿到王房結算獎勵」的那一次才算殺過。</div></div>

<div class="mcard"><div class="ttl">🗂 Lv1 ~ 49 各怪登錄效果(共 ${rows.length} 格)</div>
<div class="wrap"><table><thead><tr><th>等級</th><th>怪物</th><th>點亮</th><th>登錄費</th><th>登錄效果</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${r.m.lv}</td><td>${esc(r.m.n)}</td><td>${need(r.m.lv)} 次</td><td>${cost(r.m.lv)}</td><td>${bonusTxt(r.d)}</td></tr>`).join("\n")}
</tbody></table></div>
<div class="sub" style="margin-top:8px">Lv1 ~ 49 全部登錄合計:最大 HP +200、最大 MP +100、回血 +15、回魔 +10、近戰／遠程／魔法命中各 +5、PvE 傷害 +5、PvE 減傷 +3(依實際登錄的怪為準)。</div></div>
`));
}

// ---- 📜 系統說明(2026-09-15 麥哥:官網資訊變多,把「規則」集中一頁)----
// ⚠ 數字手抄自程式:交易所 cmd/goline/market.go 常數(45 級/100~20 億/每人 5 件/浮現 30~120 秒/成交稅 10%/上架費 1%)
//    + longtail.go 12h 退貨 + afk/bluediamond.go 指定費 25;倉庫 warehouse.go 50 格;月卡 月卡.md(40 級);
//    世界王抽抽樂 gamedata gachaCfg.wbGachaRate(官網公告 20%,麥哥 9/15 拍板)。改引擎要同步。
fs.writeFileSync(path.join(OUT, "systems.html"), page("系統說明", "sys", `
<div class="hint">遊戲內各系統的規則整理,數字都對過伺服器程式。想知道某個系統「怎麼算」看這頁;想看數值表看各自的頁面。</div>

<div class="mcard"><div class="ttl">🏪 交易所:一般上架</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>開放等級</td><td>角色 <b>45 級</b>才能上架、購買、下架、出價;「領取」頁全等級都能用</td></tr>
<tr><td>價格</td><td>金幣 100 ~ 20 億;藍鑽計價 1 ~ 20 萬顆</td></tr>
<tr><td>同時上架</td><td>每人最多 <b>5 件</b></td></tr>
<tr><td>上架手續費</td><td>售價的 <b>1%</b>,上架時就扣,<b>賣不掉、下架都不退</b>(藍鑽計價最少 1 顆)</td></tr>
<tr><td>成交</td><td>賣家拿到售價的 <b>90%</b>(10% 為交易稅);款項與商品都寄到「領取」頁</td></tr>
<tr><td>浮現時間</td><td>上架後隨機 <b>30 ~ 120 秒</b>才會出現在清單(含賣家自己),防止蹲守秒殺</td></tr>
<tr><td>賣不掉</td><td>上架滿 <b>12 小時</b>自動下架,商品退回賣家的領取頁</td></tr>
<tr><td>其他</td><td>不能買自己的商品;鎖定中的道具不能上架;清單順序隨機、每個人看到的一樣</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">💎 交易所:指定交易</div>
<div class="sub">上架時填「指定給誰」(角色名),這件商品<b>只有你和被指定的人看得到</b>,而且會排在對方清單的<b>第一位</b>。</div>
<div class="wrap" style="margin-top:8px"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>費用</td><td>賣家上架付 <b>25 藍鑽</b>;買家購買時也付 <b>25 藍鑽</b>(商品本身的價格另計)</td></tr>
<tr><td>成交</td><td>雙方的 25 藍鑽都消耗,不退</td></tr>
<tr><td>下架 / 12 小時沒賣掉</td><td>賣家的 25 藍鑽<b>退回領取頁</b>;1% 上架手續費照舊不退</td></tr>
<tr><td>限制</td><td>不能指定自己;可以和藍鑽計價疊加;競標單不能指定</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">🔨 交易所:競標</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>計價</td><td>只能用金幣;設起標價,直購價選填(必須高於起標價)</td></tr>
<tr><td>時長</td><td>3 / 6 / 8 / 12 小時,時間到自動結標</td></tr>
<tr><td>出價</td><td>每次至少比目前價高 <b>5%</b>,但最多只需加 <b>10 萬</b>;出價時押金先扣,被超越就<b>自動退回領取頁</b></td></tr>
<tr><td>尾盤保護</td><td>剩不到 5 分鐘時有人出價,結標時間延長到剩 5 分鐘,防最後一秒偷標</td></tr>
<tr><td>手續費</td><td>上架 1%(以起標價計,流拍不退);成交同一般上架,賣家拿 90%</td></tr>
<tr><td>流拍</td><td>沒人出價 → 商品退回賣家領取頁</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">📬 領取頁</div>
<div class="sub">在「交易所 → 領取」。賣出的款項、買到的商品、退回的商品與押金、客服補發、活動獎勵,全部寄到這裡;<b>全等級可領、離線也收得到</b>。同一帳號的角色共用同一個領取頁。</div></div>

<div class="mcard"><div class="ttl">🏦 倉庫</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>在哪</td><td>說話之島 NPC「倉庫保管員」</td></tr>
<tr><td>共用</td><td><b>整個帳號共用</b>一個倉庫,三隻角色互相搬東西就靠它</td></tr>
<tr><td>容量</td><td><b>50 格</b>道具 + 金幣 + 藍鑽(金幣藍鑽不佔格)</td></tr>
<tr><td>合併</td><td>同一款道具(同強化、同祝福、同詞條)存進去會<b>合併成一格</b>;之前分開存的,下次開倉庫會自動整理(9/15 起)</td></tr>
<tr><td>不能存</td><td>鎖定中的道具;藍鑽請用上方「倉庫藍鑽」存入</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">🌙 月卡</div>
<div class="sub">・1 ~ 39 級免費完整體驗;<b>滿 40 級起</b>,月卡效期外打怪<b>沒有經驗與金幣</b>(圖鑑擊殺也不計),其餘功能照常。<br>・一張月卡 <b>30 天</b>,可以先用先囤,效期<b>疊加</b>。<br>・月卡<b>綁帳號、不綁角色</b> —— 同一個帳號的三隻角色都在效期內,不必分別買。<br>・⚠ <b>但同一時間只能有一隻角色上線,所以離線掛機也只有一隻。</b>換另一隻角色登入時,前一隻的掛機會<b>先結算</b>(跳出離線收益)再換人,<b>不會三隻一起掛</b>。<br>・月卡透過贊助向客服取得,寄到領取頁,背包點「使用」開通;聊天輸入「月卡」可查剩餘天數。</div></div>

<div class="mcard"><div class="ttl">🐉 世界王:抽獎券</div>
<div class="sub">世界王死亡結算時,<b>對王造成超過 100 點傷害</b>、或<b>有幫隊友補到血</b>的參戰者,有 <b>20%</b> 機率獲得一次「抽抽樂」(不是每次必得;之前是每次必得,現已調整)。掉落物則另外依貢獻分配,與抽獎券無關。入場等級、重生時間與掉落見<a href="worldboss.html" style="color:#f5c451">世界王</a>頁。</div></div>

<div class="mcard"><div class="ttl">🏆 分身挑戰賽</div>
<div class="sub">玩法與對局規則見<a href="guide.html" style="color:#f5c451">新手指南</a>的「分身挑戰賽」一列。</div></div>

<div class="mcard"><div class="ttl">💗 血魔自然恢復</div>
<div class="sub">血和魔會自己回,<b>在村莊回得快、在獵場回得慢</b>。兩種是不同的規則。</div>
<div class="wrap"><table><thead><tr><th>在哪裡</th><th>多久回一次</th><th>回多少</th></tr></thead><tbody>
<tr><td><b>村莊/大廳</b>(回家)</td><td><b>每 3 秒</b></td><td>最大 HP 與最大 MP 的 <b>10%</b>(兩者同時回)⇒ <b>30 秒回滿</b></td></tr>
<tr><td><b>獵場</b></td><td><b>每 16 秒</b></td><td><b>固定數值</b>:HP = 體質的自然回復量 + 裝備的 HP 恢復;MP = 精神的自然回復量 + 裝備的 MP 恢復</td></tr>
</tbody></table></div>
<div class="sub" style="margin-top:8px">
・<b>在獵場打怪中也會回</b>,不需要停手。<br>
・獵場回的是<b>固定數值、不是百分比</b> ⇒ <b>血量池越大,感覺回得越慢</b>(這是正常的,不是壞掉)。<br>
・剛回到村莊要<b>先等 3 秒</b>才開始回;離開村莊進獵場後,下次回村會重新從 3 秒起算。<br>
・體質 <b>11 以下沒有 HP 自然回復</b>,體質 60 以上封頂;各能力實際的回復量看<a href="stats.html" style="color:#f5c451">能力值</a>頁的「HP 自然回復量」與「MP 自然回復量」。<br>
・想在獵場撐久一點,主要靠<b>自動喝水</b>與<b>治癒術</b>,自然恢復只是輔助。
</div></div>

<div class="mcard"><div class="ttl">🛡 獵場 AC 門檻</div>
<div class="sub">部分獵場對防禦有要求(<a href="zones.html" style="color:#f5c451">獵場列表</a>有標)。AC 是<b>越低越好</b>;你的 AC <b>沒達標</b>時,怪物<b>物理攻擊</b>對你的傷害會放大:<b>每差 1 點多受 20%</b>(差 5 點就是 2 倍)。每一下都看你當下的 AC,進場穿裝再脫掉沒用。魔法傷害、中毒、世界王房、PK 不受影響。遊戲內不會另外提示,打起來血掉太快就先看 AC。</div></div>

<div class="mcard"><div class="ttl">👥 擁擠(同一個獵場人太多)</div>
<div class="sub">同一個獵場裡一起打怪的人太多時,<b>怪物重生會變慢</b> —— 人越多、要等越久。這不是卡頓,也不是你的網路有問題。<br>
✅ <b>只影響「怪物重生的速度」</b>:經驗、金幣、掉落機率<b>完全不受影響</b>,打到的東西一樣多、機率一樣。<br>
💡 <b>解法很簡單:換去人比較少的獵場。</b>狩獵場列表每個獵場旁邊會顯示<b>(當前 N 人)</b>,挑冷一點的那個,重生速度就恢復正常。<br>
⚠ 換獵場會清掉<b>王房的入場資格</b>(傲慢之塔 10F／20F、需付費的世界王房)—— 要打王請先打完再換場。</div></div>
<div class="mcard"><div class="ttl">⚔ 血盟</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>建盟</td><td>20 萬金幣,沒有等級限制;盟名 1~12 字不可重複</td></tr>
<tr><td>加入</td><td>申請制,盟主審核;人數上限依血盟等級 Lv1~5 = 5 / 7 / 10 / 12 / 15 人(含盟主),完成擴充任務每個 +1,最多 18 人</td></tr>
<tr><td>血盟等級</td><td>靠「金幣投資」升:每 1 萬金幣 = 血盟經驗 +1;Lv2 需 500、Lv3 2,500、Lv4 5,000、Lv5 10,000(滿級)。Lv5 之後投資改累積「積分」,用來開擴充任務</td></tr>
<tr><td>三種捐獻</td><td><b>金幣</b>:升血盟等級,貢獻榜永久累計(0 會顯示紅字「未貢獻」)<br><b>搜索狀</b>:進血盟庫存(上限 300 張),是<b>祝福光環的燃料</b><br><b>擴充任務道具</b>:繳交任務需求,完成後人數上限 +1</td></tr>
<tr><td>祝福光環</td><td>只有盟主能開關。開著時每小時從血盟庫存扣搜索狀、跑 1 小時自動續扣,庫存不夠就自動關。四種舊祝福(精準目標／灼熱靈氣／勇敢靈氣／援護盟友)各 1 張/小時,同時能開的數量 Lv1~5 = 0 / 1 / 2 / 3 / 4 個</td></tr>
<tr><td>大威天龍</td><td>不佔上面的名額,Lv1 就能開;每小時消耗 Lv1~3 = 1 張、Lv4 = 2 張、Lv5 = 3 張。<b>只有它開著時</b>全盟才有加成:狩獵經驗 Lv1~5 = +5% / +7% / +10% / +12% / +15%;金幣 Lv3~4 +5%、Lv5 +10%</td></tr>
<tr><td>擴充任務</td><td>盟主、Lv5 才能開,消耗積分(已完成數+1)×1 萬;抽出需求由全盟繳交(例:衝擊之暈 500、召喚術／萬能藥各 50、+9 純白武器各 10、三重矢 100),完成 +1 人,最多 3 次</td></tr>
<tr><td>其他</td><td>貢獻榜全盟看得到;被踢或退盟會清掉貢獻紀錄;盟主不能退盟,只能解散或轉讓</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">👥 組隊</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>人數</td><td>一隊 <b>3 人</b>;申請後隊長審核,或隊長開「自動加入」;隊長不能退出,只能解散。伺服器重啟後隊伍會清空,要重組</td></tr>
<tr><td>隊伍能力</td><td>每人<b>自選一項、只有自己吃</b>:<b>10 萬金幣 / 1 小時</b>,到期時隊伍滿編且金幣夠就自動續扣。換能力=重扣重跑;手動停止=立即失效、剩餘時間不退</td></tr>
<tr><td>能力清單</td><td>狩獵經驗 +5%|額外傷害 +5|額外命中 +5|受到傷害減免 +5%|魔法傷害 +2|寵物／召喚獸命中與傷害 +5|屬性之火發動率 +10%|烈焰之魂武器值 +0.5|MP 恢復 +10</td></tr>
<tr><td>生效條件</td><td>四個<b>同時</b>成立才有效:隊伍滿 3 人、三人都在戰鬥中、三人在同一個獵場、資料正常。不成立時效果暫停但<b>時間照燒</b>,恢復後自動回來;判定約有 4 秒延遲</td></tr>
<tr><td>其他</td><td>PK 不吃隊伍能力;可與祈福女神的同名效果疊加</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">💤 離線掛機</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>怎麼開始</td><td>在<b>獵場戰鬥中</b>關掉遊戲或斷線,角色會自動轉成離線掛機繼續打;在村莊或沒在打怪時離線就只是離線,不會掛</td></tr>
<tr><td>持續多久</td><td>最長 <b>12 小時</b>,到點自動停手</td></tr>
<tr><td>一次幾隻</td><td><b>一個帳號只能掛一隻</b>。月卡是綁帳號的(三隻角色都能用),但同一時間只能上線一隻角色 ⇒ 換角色登入會把前一隻的掛機<b>先結算</b>再接手,<b>沒辦法三隻一起掛</b></td></tr>
<tr><td>會中斷的情況</td><td>角色<b>死亡</b>(有開推播會通知)、滿 12 小時、<b>伺服器維護重啟</b>(重啟後要重新上線一次才會繼續掛)、被封鎖。藥水喝完又沒金幣自動補貨就不再回血,可能會死</td></tr>
<tr><td>掛機時做什麼</td><td>和在線時完全一樣:自動買藥水／箭矢、自動治癒、自動轉換、自動賣出(不賣強化過、有詞條、上鎖的東西)</td></tr>
<tr><td>回來的時候</td><td>重新登入會接回掛機中的角色,並彈出<b>離線收益結算</b>(經驗、金幣、掉落、掛了多久);打到的東西都在背包裡</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">📈 經驗與伺服器等級</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>等級上限</td><td><b>55 級</b>;滿級後經驗不再累積,頂欄顯示 MAX</td></tr>
<tr><td>伺服器等級</td><td>目前 <b>52</b>(9/20 起;營運視全服進度調整)。角色<b>低於</b>伺服器等級時打怪經驗有追趕加成:<b>每差 1 級 +100%</b>,差 10 級以上封頂 <b>+1000%</b>。例:伺服器 52,角色 42 → +1000%(差 10 級封頂)。高於伺服器等級沒有加成也沒有懲罰</td></tr>
<tr><td>升級門檻</td><td>Lv45 起每級需求跳升:729,360 → 1,508,416 → 3,495,263 → 9,912,189,Lv49 起每級固定 36,065,092</td></tr>
<tr><td>升級獎勵</td><td>升級當下 HP／MP 補滿;<b>Lv50 起每升一級多 1 點自由屬性點</b></td></tr>
<tr><td>大廳回復</td><td>回到大廳(安全區)<b>每 3 秒回最大值 10%</b> 的血魔,約 30 秒回滿(9/15 起;原本每 6 秒)</td></tr>
<tr><td>獵場自然回復</td><td>每 <b>16 秒</b>回一次,戰鬥中也會回;回血量看體質(CON 10 以下不回,CON 60 封頂 35),回魔量看精神,再加裝備的回復值</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">🎰 潘朵拉抽獎</div>
<div class="wrap"><table><thead><tr><th>項目</th><th>規則</th></tr></thead><tbody>
<tr><td>門檻</td><td>角色 <b>41 級</b>起</td></tr>
<tr><td>費用</td><td><b>單抽 30 萬金幣、十連 300 萬金幣</b>,只收金幣</td></tr>
<tr><td>保底</td><td>付費<b>單抽</b>累計 10 次 → 下一抽免費(帳號共用,換角色也算)。免費抽不扣錢、不計入保底、不送贈品。<b>十連不累計保底</b></td></tr>
<tr><td>贈品</td><td>付費單抽送血盟搜索狀 ×1,十連送 ×10</td></tr>
<tr><td>稀有度</td><td>★傳說(金)／稀有(紫)／精良(藍)／優良(綠)／普通(灰);抽到<b>稀有以上會全服跑馬燈</b>。獎池裡有只出於抽獎、打怪不會掉的道具(例如紫色稀有裝)</td></tr>
<tr><td>其他</td><td>抽獎動畫約 3 秒,跑完才能再抽;「獎勵查看」可看獎池內容。各檔實際機率不公開</td></tr>
</tbody></table></div></div>

<div class="mcard"><div class="ttl">⏰ 整點加倍活動</div>
<div class="sub">活動開啟期間,<b>每到整點</b>系統從野外與地監裡<b>隨機抽一個獵場</b>,該獵場這一小時<b>掉寶率與金幣 ×2</b>(經驗不加倍;與全服倍率疊乘)。換獵場時會發全服跑馬燈與全服通知,獵場卡片上會標金色「加倍中」。可能連續抽中同一個獵場。活動關閉時,當下那一輪仍會跑到整點才結束。</div></div>
`));

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
  // 🔒 精通洗鍊卡收起中(FEAT.mcard=false)→ 說明裡不要提它,否則玩家會跑來問哪裡買。
  //    Go 的 AbilNote 是寫死字串,在呈現層把那一段拿掉即可。
  const abilNote = t => FEAT.mcard ? t : String(t || "").replace("(或用「精通洗鍊卡」重選)", "");
  const matStr = m => {
    const nm = m.item === "(綁定武器)" ? "綁定武器" : itemName(m.item);
    return (m.en >= 0 ? "+" + m.en + " " : "") + nm + " ×" + m.n;
  };
  const cell = arr => (arr && arr.length) ? arr.map(matStr).join("<br>") : "—";
  const lvCols = cap => Array.from({ length: cap }, (_, i) => i + 1);

  // 🚩 精通狀態註記(麥哥 2026-09-16:玩家一直問黑妖藥水恢復沒效果 → 名稱後直接標出來)。
  //    ⚠ 寫在這裡而非 mastery.json —— 後者是 wikidump 產物,重跑合併會被蓋掉。
  //    修好上線後把該筆刪掉即可。
  // 精通名稱後面的紅字註記(通常是「未實裝」之類的暫時提示)。修好上線後就把該筆刪掉。
  // 2026-09-17:darkpot(暗夜秘藥)的「(未實裝9/17修正)」已隨當日維護上線修好 ⇒ 移除。
  const MASTERY_NOTE = {};

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
      <div style="color:#f5c451;font-size:14px;margin:12px 0 4px">三選一能力${ms.abilNote ? ` <span style="color:#8f8067;font-size:12px;font-weight:normal">${md(abilNote(ms.abilNote))}</span>` : ""}</div>
      <div class="wrap"><table><thead><tr><th>能力</th>${lvCols(5).map(i => `<th>Lv${i}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(ms.abilities).map(([k, v]) => `<tr><td class="nm">${ABIL_N[k] || k}</td>${lvCols(5).map(i => `<td class="num">+${v[i] ?? 0}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>` : "";

    const aura = ms.auraCost ? `
      <div style="color:#f5c451;font-size:14px;margin:12px 0 4px">光環</div>
      <div class="wrap"><table><thead><tr><th>費用</th><th>規則</th></tr></thead><tbody>
      <tr><td class="nm">${ms.auraCost}</td><td style="font-size:13px">${md(ms.auraNote || "")}</td></tr>
      </tbody></table></div>` : "";

    return `<div class="mcard" data-cls="${ms.cls || "全職業"}" data-n="${ms.name}">
      <div class="ttl">${ms.name}${MASTERY_NOTE[ms.key] ? `<span style="color:#ff8a8a;font-size:14px;font-weight:bold">${MASTERY_NOTE[ms.key]}</span>` : ""} <span class="tag">${ms.cls || "全職業"}</span> <span class="tag">上限 Lv${ms.cap}</span></div>
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
// 📊 能力值加成表:由 `engine/cmd/statdump -json` 匯出,**不准手改**(數字一律從程式出)。
let STATS = [];
try { STATS = JSON.parse(fs.readFileSync(path.join(OUT, "stats.json"), "utf8")); } catch (e) { }
// 🔴 **未來日期的區塊不發布**(2026-09-16 加):我們的流程是「改動先寫好 changelog、等第二台部署完才發布」,
//    但 gen.js 可能為了別的事先跑一次(例如今晚只想上試煉頁)⇒ 沒這道閘就會把明天才生效的改動提早公告,
//    玩家看到公告卻找不到功能。到了當天日期自然就會被印出來,不用手動搬。
{
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD(本地時區)
  const future = CHANGES.filter(d => d.date > today);
  if (future.length) console.log(`⏳ 跳過未來日期的更新日誌 ${future.length} 區塊:${future.map(d => d.date).join(", ")}(到當天才會發布)`);
  CHANGES = CHANGES.filter(d => d.date <= today);
}
{
  const TCOL = { "新增": "#7bd14a", "調整": "#5b9bff", "修復": "#f5c451", "活動": "#f5a97f" };
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

// ================= 📊 能力值加成表 =================
// 玩家問最多的一題:「加一點力量會多幾點傷害」「跟天堂 PC 版一不一樣」。
// 數字全部來自 `engine/cmd/statdump -json`(直接呼叫遊戲實際在跑的函式)⇒ 不可能抄錯,
// 改了平衡只要重跑那支再跑 gen.js 就同步。**不要手改 stats.json**。
if (STATS.length) {
  // 每個能力一張表:[鍵, 名稱, 圖示, 一句話, [[欄名, 欄位, 說明], ...]]
  const SD = [
    ["str", "力量", "💪", "近距離戰鬥。騎士與黑暗妖精主要靠它。", [
      ["近距離傷害", "strDmg", "平砍與近戰技能的傷害加值"],
      ["近距離命中", "strHit", "打得到近戰目標的能力"],
      ["近距離爆擊率", "strCrit", "%"],
    ]],
    ["dex", "敏捷", "🏹", "遠距離戰鬥與閃避。妖精與黑暗妖精主要靠它。", [
      ["遠距離傷害", "dexDmg", "弓箭與遠程技能的傷害加值"],
      ["遠距離命中", "dexHit", "射得中目標的能力"],
      ["防禦 AC", "dexAc", "數字<b>越低越強</b>。這張表<b>不分職業、不分等級</b>:敏捷<b>每到 3 的倍數</b>(9、12、15、18、21…)才再 −1,中間的點數<b>不會變</b>。例:12 → −4,15 → −5,<b>16、17 還是 −5</b>,要到 18 才 −6。直接看下表的數字最準。<br>另外<b>每升幾級 AC 也會 −1</b>,看職業不看敏捷:騎士<b>每 6 級</b>、妖精<b>每 7 級</b>、法師與黑暗妖精<b>每 8 級</b>(無條件捨去)。不需要先把敏捷堆到 18。"],
      ["迴避 ER", "dexEr", "= 敏捷 ÷ 2(無條件捨去)"],
      ["遠距離爆擊率", "dexCrit", "%"],
    ]],
    ["con", "體質", "❤", "血量與回血。每升 1 級長多少 HP 由它決定,職業係數不同。", [
      ["騎士 每級 HP", "conHpKnight", "(體質−8)×1.5"],
      ["妖精/法師 每級 HP", "conHpOther", "(體質−8)×0.8"],
      ["黑暗妖精 每級 HP", "conHpDark", "(體質−8)×0.5"],
      ["HP 自然回復量", "conRegen", "體質 11 以下沒有回復;獵場每 16 秒回這個量(見系統說明)"],
    ]],
    ["int", "智力", "🧠", "魔法攻擊。法師主要靠它。", [
      ["魔法傷害", "intDmg", "攻擊魔法的傷害加值"],
      ["魔法命中", "intHit", "魔法打得中目標的能力"],
      ["額外魔法點數", "intExtraMp", "上限 MP 加值"],
      ["消耗魔力減少", "intMpReduce", "%"],
      ["魔法爆擊率", "intCrit", "%"],
    ]],
    ["wis", "精神", "🔮", "魔法防禦與魔力。被魔法打到痛不痛看它。", [
      ["魔法防禦 MR", "wisMr", "=(精神−10)×4,精神 10 以下沒有"],
      ["MP 自然回復量", "wisMpRegen", "獵場每 16 秒回這個量 + 裝備的 MP 恢復(見系統說明)"],
      ["藍水回復加成", "wisBluePotion", "喝藍水多回這麼多 MP"],
      ["每級 MP 成長", "wisMpGrowth", "=(精神−9)×0.5"],
    ]],
    ["cha", "魅力", "✨", "能帶幾隻夥伴。項圈(寵物)與召喚獸共用同一個池。", [
      ["可帶夥伴數", "chaPets", "= 魅力 ÷ 6(無條件捨去)"],
    ]],
  ];
  const MINV = 8, MAXV = STATS[STATS.length - 1].v;
  fs.writeFileSync(path.join(OUT, "stats.html"), page("能力值加成表", "stat", `
${chips([[6, "項能力"], [60, "自然值上限"], [75, "加成封頂"]])}
<div class="hint">六大能力各自加什麼、加多少,<b>這裡的數字就是遊戲裡實際在算的那一份</b>(直接從程式匯出,不是人工抄的)。<br>
❓ <b>跟天堂 PC 版一樣嗎?</b> <b>骨架一樣</b> —— 力量管近戰、敏捷管遠程與閃避、體質管血、智力管魔法、精神管魔防與魔力、魅力管夥伴數。
但<b>數值階梯是本服自己這一套</b>,為了平衡有調整過,<b>請以本頁與遊戲內「能力」頁的數字為準</b>。<br>
📌 <b>兩個上限要知道</b>:①<b>自然值最高 60</b>(升級配點與萬能藥加起來算,超過就加不上去);
②<b>加成表到 75 封頂</b>,靠裝備把能力堆過 75 之後,上面這些加成<b>不會再增加</b>
(例外:<b>迴避 ER</b> 與 <b>魔防 MR</b> 是公式算的,會一直往上加)。</div>
<div class="chips" id="schips"></div>
<div class="sub" id="sdesc" style="margin:6px 2px 10px"></div>
<div class="wrap" id="tb-wrap"><table><thead id="th"></thead><tbody id="tb"></tbody></table></div>
<div class="hint" style="margin-top:12px">※ 表格列到 ${MAXV} —— <b>${MAXV} 就是加成的上限</b>,靠裝備把能力堆得更高,上面這些數字<b>不會再增加</b>(例外:迴避 ER 與 魔防 MR 是公式算的,會繼續往上)。<br>
※ 這頁的數字由工具從遊戲程式直接匯出,遊戲改平衡時會跟著更新。</div>`,
`<script>
const SD=${JSON.stringify(SD)};const ST=${JSON.stringify(STATS)};const MINV=${MINV};
const $=id=>document.getElementById(id);
let cur="str";
$("schips").innerHTML=SD.map(d=>'<span class="chip'+(d[0]===cur?" on":"")+'" data-k="'+d[0]+'">'+d[2]+" "+d[1]+"</span>").join("");
document.querySelectorAll("#schips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#schips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");cur=c.dataset.k;render();});
function render(){const d=SD.find(x=>x[0]===cur);const cols=d[4];
$("sdesc").innerHTML="<b style='color:#f5c451'>"+d[2]+" "+d[1]+"</b>　"+d[3];
$("th").innerHTML="<tr><th>"+d[1]+"</th>"+cols.map(c=>"<th style='text-align:right'>"+c[0]+(c[2]?"<div style='font-weight:normal;color:#8f8067;font-size:11px'>"+c[2]+"</div>":"")+"</th>").join("")+"</tr>";
const rows=ST.filter(r=>r.v>=MINV);
$("tb").innerHTML=rows.map(r=>{
  return "<tr><td class='nm'>"+r.v+"</td>"+cols.map(c=>"<td class='num' data-l='"+c[0]+"'>"+r[c[1]]+"</td>").join("")+"</tr>";
}).join("");}
render();
</script>`));
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
// 🎭 變身表來源(2026-09-21 起):優先讀 poly.json(cmd/polydump 匯出,含 Lv55 段與開啟條件),
//    沒有才退回 mastery.json 裡的舊 poly。理由:wikidump 不能重跑(會曝光強化機率),變身表要更新只能另開工具。
//    重生指令:cd go端專案/engine && go run ./cmd/polydump -gd ../gamedata.json -json ../../玩家資料站/poly.json
try { const pj = JSON.parse(fs.readFileSync(path.join(OUT, "poly.json"), "utf8")); if (Array.isArray(pj) && pj.length) WD.poly = pj; } catch (e) { }
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
    // 🔒 有 unlock 的段(Lv55):卡片標「需先開啟」,並把開啟條件寫在表格上方(麥哥 2026-09-21 拍板條件可公開)
    const unlockNote = t.unlock ? `<div class="sub" style="margin:6px 0 2px;color:#f5a97f"><b>🔒 這一段的變身要先「開啟」才能使用</b>（持變形控制戒指開選單 → 按該變身旁的「開啟」）。<br>每一種的開啟條件相同：<b>${t.unlock}</b>。開啟後綁定該角色、永久有效；材料差一樣就不會扣。</div>` : "";
    return `<div class="mcard"><div class="ttl">${lv}<span class="sub" style="margin-left:8px">共 ${t.forms.length} 種</span>${t.unlock ? '<span class="tag" style="margin-left:8px;color:#f5a97f;border-color:#7a4a12">需先開啟</span>' : ""}</div>${unlockNote}
    <div class="wrap"><table><thead><tr><th>型態</th><th>加成</th></tr></thead><tbody>
    ${t.forms.map(f => `<tr><td class="nm">${f.name}</td><td>${polyEff(f.eff)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }).join("");

  fs.writeFileSync(path.join(OUT, "poly.html"), page("變身型態", "poly", `
<div class="hint">使用<b>變形卷軸</b>會依你<b>當下的等級</b>,從該等級的名單中<b>隨機</b>變成一種。
背包裡帶著<b>變形控制戒指</b>(不用裝備,放背包就生效)就可以<b>指定</b>要變哪一種。</div>

<div class="mcard"><div class="ttl">重點</div><div class="sub">
・<b>沒有戒指吃卷軸 = 隨機變成「你目前等級」那一段的其中一種</b>。<br>
・<b>有戒指開選單可以點名</b>,而且選單會同時列出<b>目前等級段</b>與<b>上一段</b>,兩段都能選(2026-09-22 起)。<br>
・<b>Lv55 段要先「開啟」才能用</b>(條件見下方);一種都沒開啟時,吃卷軸會退回 52 級段隨機。<br>
・「召喚獸命中」只影響法師召喚獸的命中判定,玩家本身的命中不受影響。<br>
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
<tr><td class="nm">分身挑戰賽</td><td>41 級起,「聊天 → 排行榜 → 分身挑戰賽」挑戰積分相近玩家的<b>分身</b>(對方離線照打、本人零損失),每天 5 場;週一 09:00 開季、週日 21:00 結算,前三名得一週稱號。戰鬥照你的「設定 → PK設定」自動打,時限 180 秒。<b>對局規則</b>(9/15 起):喝水冷卻 3 秒;60 秒起治療效果每 20 秒 −15%(最低 25%);時間到<b>比剩餘血量 %</b>,差距 5% 以內才算平手。<b>積分</b>(9/17 起):贏 +20/+15/+10、輸 −10/−15/−20(對手積分比你高給得多、比你低給得少);<b>平手也會依分差微調 +3/0/−3</b>,不再一律 0 分。<b>⚠ 玩家對戰不套用精通加成</b>:排位賽與決鬥中,礦道「黑奴的救贖」與「暗夜秘藥」的藥水恢復加成<b>不生效</b>,喝水回復量是原本的數值(這是設計如此,不是異常)。</td></tr>
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

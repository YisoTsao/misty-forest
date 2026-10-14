// 視覺驗證截圖（規格 8）：啟動 Electron 正式版，依序切換攝影機書籤並輸出圖片。
// 用法：node scripts/screenshot.mjs [階段名稱，預設 phase0] [--anim] [--mist] [--interact] [書籤 id...]
//   --anim：另外輸出角色每個必要動畫的定格圖（動畫來源驗證，規格 4.6）
//   --mist：每個書籤另外輸出迷霧外觀（<id>_mist.png，uMist = 1；規格 4.8 晴朗 / 迷霧兩種外觀）
//   --interact：輸出寶箱互動提示與開箱後畫面（任務 1C）
//   --menu：輸出主選單、暫停選單與設定畫面（Phase 1 驗收：可回到主選單；任務 2C、2E）
//   --map：小地圖（村莊、農田）、世界地圖（探索一部分時的霧罩、全部探索、放大）（任務 7B）
//   --waterway：螢苔祕林的琳娜 / 奇奇任務：路燈點亮前後、乾涸的水渠與木輪、水流通後的閘門與木槽、苔冠空地的樹根退開前後、夜晚的路燈（任務 8C）
//   --footprints：河邊的腳印（任務 7L）：腳印、野果叢、小窩、角兔幼崽
//   --garden：花園第一顆種子（任務 7K）：桃樂、田邊的鬆土、花圃三個成長階段
//   --shop：米菈的雜貨補給（任務 7H）：購買、出售分頁；琳娜的草藥桌（任務 7J）
//   --letters：郵袋裡的三封信（任務 7G）：郵差尼可、村子裡的乾布籃
//   --journal：任務日誌（任務 7F）：進行中 / 可接取 / 已完成三個分頁
//   --puffking：霧團噗啾王（任務 7E）：開場、衝撞 / 霧球 / 膨脹震地的預兆、星光鏡讓牠暈眩、倒下縮小、村外的小噗啾
//   --lighthouse：燈塔的最後一盞光（任務 7D）：燈罩碎片、迷霧核心（淨化前後）、熄滅 / 點亮的燈塔（白天、夜晚的光柱）、點亮瞬間的金光
//   --guardian：苔冠下的守衛（任務 8D-2）：林間水道的樹根、沉睡 / 甦醒（白天、夜晚）的根源石、戰後的苔咚、芽之共鳴的光、回報後退開的樹根
//   --boss：苔咚頭目戰：開場鑽出地面、HUD、根刺 / 震地 / 睡眠孢子的預兆與出招、縮入菌傘、震地後的破綻、入口的樹根、注滿的水槽與迷霧退去、倒下縮小（任務 8D）
//   --monsters：每種怪物在自己的生成區域的近照與總覽（任務 7C）；--enemies=a,b 只拍這幾種（任務 8B）
//   --magic：魔法：白天與夜晚各拍星光衝擊與星屑飛彈的蓄力 / 發動 / 命中、流星雨的預警 / 落下 / 光爆（任務 6E），以及魔法擊敗的淨化（任務 6D）
//   --melee：近戰：每一招命中瞬間的定格與總覽、三種武器實際打中迷霧生物的拖尾與衝擊（任務 6C）
//   --daynight：日夜：三個書籤 × 06 / 12 / 18 / 21 / 00 時、夜晚迷霧、夜晚草原（螢火蟲、月亮）、日出與夕陽（任務 6B）
//   --bounds：地圖邊界：邊界前、遠看迷霧牆、角落、俯瞰、濃霧時（任務 6A）
//   --ambient：環境生命感：羊群、炊煙、風車（兩張比對扇葉角度）、曬衣繩、路標與告示板（任務 5D）
//   --gamepad：手把模式的互動提示（Y）、暫停選單的手把選取外框、設定畫面的手把配置（任務 5C）
//   --tavern：酒館門口的提示、室內、和老闆娘對話（任務 5B）
//   --build：湖心小島的建造選單、可放置 / 不可放置的預覽、蓋好的家園（任務 4A）、拆除工具與營火旁（任務 4B）
//   --companion：打開序章寶箱後星光夥伴出現與打招呼、按 H 詢問提示（任務 3F）
//   --combat：森林裡的迷霧生物、攻擊前搖、玩家攻擊與傷害數字、星光衝擊、受傷與倒下（任務 3E）
//   --lake：湖泊全景、斷橋、在橋頭修理、修好的木橋（任務 3D）
//   --npc：村莊 NPC 全身、與長老對話（一般段落與選項）（任務 3B）、任務追蹤（任務 3C）
//   --region：森林空地在濃霧與迷霧清除後的跟隨視角、區域名稱（任務 3A）
//   --harvest：輸出可採集的花叢、草藥特寫、砍樹前 / 揮砍中 / 樹樁與取得通知（任務 2A）與背包（任務 2B）
// 注意：截圖只用來檢查畫面正確性，不可用於推斷效能。
/* global window, document -- page.evaluate / waitForFunction 的回呼在 Renderer 內執行 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { appEnv } from '../e2e/lib.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const withAnim = flags.has('--anim');
const withMist = flags.has('--mist');
const withInteract = flags.has('--interact');
const withMenu = flags.has('--menu');
const withHarvest = flags.has('--harvest');
const withRegion = flags.has('--region');
const withNpc = flags.has('--npc');
const withLake = flags.has('--lake');
const withCombat = flags.has('--combat');
const withCompanion = flags.has('--companion');
const withBuild = flags.has('--build');
const withTavern = flags.has('--tavern');
const withGamepad = flags.has('--gamepad');
const withAmbient = flags.has('--ambient');
const withBounds = flags.has('--bounds');
const withDaynight = flags.has('--daynight');
const withMelee = flags.has('--melee');
const withMagic = flags.has('--magic');
const withMap = flags.has('--map');
const withMonsters = flags.has('--monsters');
const withWaterway = flags.has('--waterway');
const withBoss = flags.has('--boss');
const withGuardian = flags.has('--guardian');
const withLighthouse = flags.has('--lighthouse');
const withPuffKing = flags.has('--puffking');
const withJournal = flags.has('--journal');
const withLetters = flags.has('--letters');
const withShop = flags.has('--shop');
const withGarden = flags.has('--garden');
const withFootprints = flags.has('--footprints');
const onlyEnemies = process.argv.find((a) => a.startsWith('--enemies='))?.slice('--enemies='.length).split(',') ?? null;
const [stage = 'phase0', ...only] = args.filter((a) => !a.startsWith('--'));
const outDir = path.join('docs', 'screenshots', stage);
mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
  args: ['.'],
  env: appEnv({ MISTWOOD_START_QUERY: 'debug=1&play=1', MISTWOOD_SAVE_DIR: mkdtempSync(path.join(tmpdir(), 'mistwood-shot-')) }),
});

let exitCode = 0;
try {
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[renderer] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[renderer] ${err.message}`));

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 60_000 });

  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`saved ${file}`);
  };

  const setMist = async (value) => {
    await page.evaluate((v) => window.__mistwoodDebug.setMist(v, true), value);
    await page.waitForTimeout(300);
  };

  // 晴朗版一律以迷霧 0 拍攝（不受各區域迷霧階段影響），迷霧版以 1 拍攝，方便並排比對
  await setMist(0);
  // 預設的跟隨相機視角
  await page.waitForTimeout(800);
  await shot('follow');
  if (withMist) {
    await setMist(1);
    await shot('follow_mist');
    await setMist(0);
  }

  const bookmarks = only.length > 0 ? only : await page.evaluate(() => window.__mistwoodDebug.bookmarks());
  for (const id of bookmarks) {
    await page.evaluate((b) => window.__mistwoodDebug.setBookmark(b), id);
    // 等待阻尼相機穩定與數幀渲染
    await page.waitForTimeout(1200);
    await shot(id);
    if (withMist) {
      await setMist(1);
      await shot(`${id}_mist`);
      await setMist(0);
    }
  }

  if (withInteract) {
    // 回到跟隨相機，站到寶箱前方面向寶箱
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setCameraMode('follow');
      d.teleport(-3.0, 12.9);
      d.camera({ yaw: 1.3, pitch: 0.35, distance: 4.2 });
    });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() !== null, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot('interact_prompt');
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid="message-dialog"]', { timeout: 5000 });
    await page.waitForTimeout(400);
    await shot('interact_open');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    await shot('interact_after');
  }

  if (withHarvest) {
    const placements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
    const find = (id) => placements.find((p) => p.id === id);
    // 花叢與草藥特寫：角色站在東側，攝影機從南方看，物件在角色左邊
    for (const [name, id] of [
      ['harvest_flower', 'meadow_flower_002'],
      ['harvest_herb', 'meadow_herb_001'],
    ]) {
      const [x, , z] = find(id).position;
      await page.evaluate(
        ([px, pz]) => {
          const d = window.__mistwoodDebug;
          d.resetWorld();
          d.setCameraMode('follow');
          d.teleport(px + 1.4, pz + 0.3);
          d.camera({ yaw: 0, pitch: 0.42, distance: 3.6 });
        },
        [x, z],
      );
      await page.waitForTimeout(1200);
      await shot(name);
    }
    const tree = find('meadow_tree_001');
    const [tx, , tz] = tree.position;
    await page.evaluate(
      ([px, pz]) => {
        const d = window.__mistwoodDebug;
        d.teleport(px, pz + 1.5);
        d.camera({ yaw: 1.1, pitch: 0.3, distance: 6 });
      },
      [tx, tz],
    );
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, tree.id, { timeout: 5000 });
    await page.waitForTimeout(400);
    await shot('harvest_tree_prompt');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(420);
    await shot('harvest_tree_chop');
    await page.waitForTimeout(700);
    await shot('harvest_tree_stump');
    // 背包（任務 2B）：再採幾樣東西，開啟後選取草藥
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      for (const id of ['meadow_flower_001', 'meadow_flower_002', 'meadow_herb_001', 'meadow_rock_001']) {
        d.send({ type: 'HarvestObject', placementId: id });
      }
    });
    await page.waitForTimeout(2800);
    await page.keyboard.press('KeyI');
    await page.waitForSelector('[data-testid="inventory"]', { timeout: 5000 });
    await page.locator('[data-testid="inventory-slot"][data-item="herb"]').hover();
    await page.waitForTimeout(300);
    await shot('inventory');
    await page.keyboard.press('KeyI');
  }

  if (withTavern) {
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
      d.setCameraMode('follow');
      d.teleport(-6.4, -30);
      d.face(-2.5, -30);
      d.camera({ yaw: -Math.PI / 2 + 0.55, pitch: 0.3, distance: 5.5 });
    });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'village_tavern_03', null, { timeout: 5000 });
    await page.waitForTimeout(600);
    await shot('tavern_door');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.location() === 'tavern', null, { timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot('tavern_inside');
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.teleport(996.8, 998.3, 0.02);
      d.face(996.8, 996.4);
      d.camera({ yaw: 0.9, pitch: 0.25, distance: 4.5 });
    });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:molly', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid="dialogue"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await shot('tavern_molly');
    await page.keyboard.press('Escape');
  }

  if (withMonsters) {
    const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
      d.setPeaceful(true);
    });
    const seen = new Set();
    for (const sp of spawners) {
      if (seen.has(sp.enemy) || (onlyEnemies && !onlyEnemies.includes(sp.enemy))) continue;
      seen.add(sp.enemy);
      const [cx, cz] = sp.center;
      // 站在生成區域南側，等這一種怪物生成，再走到牠旁邊拍
      await page.evaluate(([x, z]) => {
        const d = window.__mistwoodDebug;
        d.setCameraMode('follow');
        d.teleport(x, z);
      }, [cx, cz + sp.radius + 6]);
      await page
        .waitForFunction((kind) => window.__mistwoodDebug.enemies().some((e) => e.kind === kind), sp.enemy, { timeout: 25_000 })
        .catch(() => {});
      const e = await page.evaluate((kind) => window.__mistwoodDebug.enemies().find((n) => n.kind === kind), sp.enemy);
      if (!e) {
        console.error(`沒有生成：${sp.enemy}`);
        continue;
      }
      // 玩家退到一旁，以自由視角從怪物正面（面向玩家的方向）略高處拍
      await page.evaluate(([x, z, h]) => {
        const d = window.__mistwoodDebug;
        d.teleport(x + 5, z + 5);
        const y = h + 0.6;
        d.viewAt([x + 1.6, y + 1.2, z + 4.2], [x, y * 0.55, z]);
      }, [e.x, e.z, sp.enemy === 'mob_mushroom_king' ? 3 : 1.6]);
      await page.waitForTimeout(400);
      // 面向攝影機（模型面向 yaw）：把位置與 y 換算成地面高度後重新取景
      const t = await page.evaluate((id) => window.__mistwoodDebug.enemies().find((n) => n.id === id), e.id);
      if (t) {
        // 挑一個攝影機到怪物之間沒有樹、岩石或建築的角度（自由視角不會避讓）
        const allPlacements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
        const solid = allPlacements.filter((p) => !/grass|flower|bush|mushroom|lily|pebble|dirt_row|corn|wheat|pumpkin|melon|carrot|leafy/.test(p.prefabId) && Math.hypot(p.position[0] - t.x, p.position[2] - t.z) < 14);
        const h = sp.enemy === 'mob_mushroom_king' ? 3 : 1.6;
        const dist = h * 2.4 + 1.5;
        let best = 0;
        let bestClear = -1;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const cx = t.x + Math.sin(a) * dist;
          const cz = t.z + Math.cos(a) * dist;
          let clear = Infinity;
          for (const p of solid) {
            const [px, , pz] = p.position;
            const dx = cx - t.x;
            const dz = cz - t.z;
            const u = Math.max(0, Math.min(1, ((px - t.x) * dx + (pz - t.z) * dz) / (dx * dx + dz * dz)));
            clear = Math.min(clear, Math.hypot(px - (t.x + dx * u), pz - (t.z + dz * u)));
          }
          if (clear > bestClear) {
            bestClear = clear;
            best = a;
          }
        }
        await page.evaluate(([x, z, hh, ground, a, d]) => {
          const y = ground + hh * 0.55;
          window.__mistwoodDebug.viewAt([x + Math.sin(a) * d, y + 1.1, z + Math.cos(a) * d], [x, y, z]);
        }, [t.x, t.z, h, t.y ?? 0, best, dist]);
      }
      await page.waitForTimeout(1400);
      await shot(`monster_${sp.enemy}`);
    }
    // 追擊：角角龍朝玩家跑來（檢查模型面向）
    const dinoSp = spawners.find((sp) => sp.enemy === 'mob_horn_dino');
    if (dinoSp) {
      const dino = await page.evaluate(() => window.__mistwoodDebug.enemies().find((n) => n.kind === 'mob_horn_dino'));
      if (dino) {
        await page.evaluate(([x, z]) => {
          const d = window.__mistwoodDebug;
          d.setPeaceful(false);
          d.setCameraMode('follow');
          d.teleport(x - 6, z);
          d.face(x, z);
          d.camera({ yaw: -Math.PI / 2 + 0.9, pitch: 0.25, distance: 7 });
        }, [dino.x, dino.z]);
        await page.waitForTimeout(1100);
        await shot('monster_chase');
      }
    }
    await page.evaluate(() => window.__mistwoodDebug.setPeaceful(false));
  }

  if (withMap) {
    const go = async (name, x, z, fx, fz, wait = 1500) => {
      await page.evaluate(
        ([px, pz, tx, tz]) => {
          const d = window.__mistwoodDebug;
          d.setCameraMode('follow');
          d.teleport(px, pz);
          d.face(tx, tz);
          d.camera({ yaw: Math.atan2(px - tx, pz - tz), pitch: 0.32, distance: 7 });
        },
        [x, z, fx, fz],
      );
      await page.waitForTimeout(wait);
      if (name) await shot(name);
    };
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
    });
    // 走過幾個地方（村莊、湖、農田），世界地圖上只有這些地方揭開
    await go(null, 0, 10, 0, 0, 900);
    await go(null, 30, -12, 34, 8, 900);
    await go('map_minimap_village', -8, -22, -11, -34);
    await go('map_minimap_farm', -78, -24, -86, -28);
    await page.evaluate(() => window.__mistwoodDebug.setMapOpen(true));
    await page.waitForTimeout(800);
    await shot('map_world_partial');
    await page.evaluate(() => window.__mistwoodDebug.setMapOpen(false));
    await page.evaluate(() => window.__mistwoodDebug.revealMap());
    await page.evaluate(() => window.__mistwoodDebug.setMapOpen(true));
    await page.waitForTimeout(800);
    await shot('map_world_full');
    const canvas = page.locator('[data-testid="world-map-canvas"]');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
      await page.waitForTimeout(500);
      await shot('map_world_zoom');
    }
    await page.evaluate(() => window.__mistwoodDebug.setMapOpen(false));
  }

  if (withAmbient) {
    const view = async (name, px, pz, fx, fz, cam, wait = 1200) => {
      await page.evaluate(
        ([x, z, tx, tz, c]) => {
          const d = window.__mistwoodDebug;
          d.setCameraMode('follow');
          d.teleport(x, z);
          d.face(tx, tz);
          d.camera(c);
        },
        [px, pz, fx, fz, cam],
      );
      await page.waitForTimeout(wait);
      await shot(name);
    };
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
    });
    await view('ambient_sheep', -31, -12.5, -31, -21, { yaw: 0.25, pitch: 0.3, distance: 6 }, 2500);
    await view('ambient_village_smoke', -12, -11, -14, -30, { yaw: 0.1, pitch: 0.06, distance: 7 }, 2500);
    await view('ambient_windmill_a', -24 + 0.93 * 13, -45 + 0.36 * 13, -24, -45, { yaw: 1.2, pitch: 0.12, distance: 6 });
    await page.waitForTimeout(900);
    await shot('ambient_windmill_b');
    await view('ambient_clothesline', -21.5, -20.5, -22.6, -24.2, { yaw: 0.3, pitch: 0.18, distance: 4.5 });
    await view('ambient_signpost', 0.9, -6.6, 0.9, -8.5, { yaw: 0.5, pitch: 0.25, distance: 4.5 });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'meadow_signpost_01', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="message-dialog"]').waitFor({ timeout: 3000 });
    await page.waitForTimeout(300);
    await shot('ambient_signpost_read');
    await page.keyboard.press('Escape');
    await view('ambient_notice_board', -9.6 + Math.sin(0.45) * 1.8, -26.4 + Math.cos(0.45) * 1.8, -9.6, -26.4, { yaw: 0.45, pitch: 0.2, distance: 4.5 });
  }

  if (withMelee) {
    // 近戰（任務 6C）：每一招在命中瞬間的定格（武器在手上、動作不變形），拼成一張總覽；再拍實際打中迷霧生物的拖尾與衝擊
    const weaponsData = JSON.parse(readFileSync('src/data/weapons.json', 'utf8'));
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(0, true);
      d.setBookmark('character');
    });
    await page.waitForTimeout(1200);
    const frames = [];
    for (const w of weaponsData) {
      await page.evaluate((id) => window.__mistwoodDebug.equip(id), w.id);
      await page.waitForTimeout(400);
      for (const m of [...w.light, w.heavy]) {
        // 命中瞬間在動畫中的位置：hitDelay × 播放速度（片段長度約 1 秒，取 0.25–0.7 之間）
        const fraction = Math.min(0.7, Math.max(0.25, m.hitDelay * m.speed));
        await page.evaluate(([clip, f]) => window.__mistwoodDebug.previewClip(clip, f), [m.clip, fraction]);
        await page.waitForTimeout(250);
        const name = `melee_${m.id}`;
        await shot(name);
        frames.push({ name, label: `${w.id} · ${m.id}` });
      }
    }
    await page.evaluate(() => window.__mistwoodDebug.previewAnimation(null));
    // 總覽：在遊戲視窗上疊一層圖片格子再截圖（不需要額外的影像處理套件）
    const images = frames.map((f) => ({ label: f.label, src: `data:image/png;base64,${readFileSync(path.join(outDir, `${f.name}.png`)).toString('base64')}` }));
    await page.evaluate((list) => {
      const grid = document.createElement('div');
      grid.id = 'contact-sheet';
      grid.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#222;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px';
      for (const item of list) {
        const cell = document.createElement('div');
        cell.style.cssText = 'position:relative;overflow:hidden;background:#000';
        const img = document.createElement('img');
        img.src = item.src;
        // 只取畫面中央（角色）的部分
        img.style.cssText = 'position:absolute;max-width:none;width:250%;left:-75%;top:-40%';
        const label = document.createElement('span');
        label.textContent = item.label;
        label.style.cssText = 'position:absolute;left:6px;bottom:4px;color:#fff;font:bold 14px sans-serif;text-shadow:0 0 4px #000';
        cell.append(img, label);
        grid.append(cell);
      }
      document.body.append(grid);
    }, images);
    await page.waitForTimeout(500);
    await shot('melee_contact_sheet');
    await page.evaluate(() => document.getElementById('contact-sheet')?.remove());

    // 實戰：森林的迷霧生物，三種武器各打一套連段，拍拖尾與命中衝擊
    const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
    const [sx, sz] = spawners[0].center;
    await page.evaluate(([x, z]) => {
      const d = window.__mistwoodDebug;
      d.setPeaceful(true);
      d.setCameraMode('follow');
      d.teleport(x - 4, z + 4);
    }, [sx, sz]);
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().length >= 2, null, { timeout: 30000 });
    for (const [weapon, shots] of [
      ['sword', [0.2, 0.25]],
      ['knife', [0.15, 0.2]],
      ['fist', [0.2, 0.28]],
    ]) {
      await page.evaluate((w) => {
        const d = window.__mistwoodDebug;
        d.equip(w);
        const near = d.enemies()[0];
        d.teleport(near.x - 1.4, near.z + 1.4);
        d.face(near.x, near.z);
        d.camera({ yaw: -2.2, pitch: 0.25, distance: 5 });
      }, weapon);
      await page.waitForTimeout(700);
      for (let i = 0; i < shots.length; i++) {
        await page.evaluate(() => window.__mistwoodDebug.tap('Mouse0'));
        await page.waitForTimeout(shots[i] * 1000);
        await shot(`melee_live_${weapon}_${i + 1}`);
        await page.waitForTimeout(450);
      }
      await page.evaluate(() => window.__mistwoodDebug.tap('Mouse2'));
      await page.waitForTimeout(380);
      await shot(`melee_live_${weapon}_heavy`);
      await page.waitForTimeout(900);
    }
  }

  if (withMagic) {
    // 魔法（任務 6D）：森林的迷霧生物前，白天與夜晚各拍星光衝擊與星屑飛彈的蓄力 / 發動 / 命中，以及魔法擊敗的淨化
    const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
    const [sx, sz] = spawners[0].center;
    const stage = async () => {
      await page.evaluate(([x, z]) => {
        const d = window.__mistwoodDebug;
        d.setPeaceful(true);
        d.setCameraMode('follow');
        d.setMp(100);
        d.teleport(x - 3, z + 5);
      }, [sx, sz]);
      await page.waitForFunction(() => window.__mistwoodDebug.enemies().length >= 2, null, { timeout: 30000 });
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        const d = window.__mistwoodDebug;
        const e = d.enemies()[0];
        d.face(e.x, e.z);
        const p = d.playerState();
        // 攝影機在角色斜後方偏高，看得到腳下的魔法陣與前方的迷霧生物
        d.camera({ yaw: p.facingYaw + Math.PI + 0.6, pitch: 0.45, distance: 7 });
      });
      await page.waitForTimeout(600);
    };
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(0, true);
    });
    for (const [label, hour] of [
      ['day', 12],
      ['night', 22],
    ]) {
      await page.evaluate((h) => window.__mistwoodDebug.setClock(h), hour);
      await stage();
      await page.evaluate(() => window.__mistwoodDebug.tap('KeyQ'));
      await page.waitForTimeout(220);
      await shot(`magic_${label}_burst_charge`);
      await page.waitForTimeout(220);
      await shot(`magic_${label}_burst_release`);
      await page.waitForTimeout(400);
      await shot(`magic_${label}_burst_after`);
      await page.waitForTimeout(900);
      await stage();
      await page.evaluate(() => window.__mistwoodDebug.tap('KeyF'));
      await page.waitForTimeout(260);
      await shot(`magic_${label}_bolt_release`);
      await page.waitForTimeout(160);
      await shot(`magic_${label}_bolt_flight`);
      await page.waitForTimeout(350);
      await shot(`magic_${label}_bolt_hit`);
      await page.waitForTimeout(1500);
    }
    // 流星雨（任務 6E）：開闊的草原上（攝影機不會被樹擋住），落點魔法陣預警 → 流星斜落 → 最後一顆光爆
    for (const [label, hour] of [
      ['night', 22],
      ['day', 12],
    ]) {
      await page.evaluate((h) => {
        const d = window.__mistwoodDebug;
        d.setClock(h);
        d.resetSpellCooldowns();
        d.setMp(100);
        d.setCameraMode('follow');
        d.teleport(3, 6);
      }, hour);
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        const d = window.__mistwoodDebug;
        d.face(3, -10);
        // 攝影機在角色右後方高處，看得到前方 7 m 的落點
        d.camera({ yaw: 0.45, pitch: 0.42, distance: 12 });
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__mistwoodDebug.tap('KeyC'));
      await page.waitForTimeout(500);
      await shot(`magic_${label}_meteor_target`);
      await page.waitForTimeout(650);
      await shot(`magic_${label}_meteor_falling`);
      await page.waitForTimeout(450);
      await shot(`magic_${label}_meteor_impacts`);
      await page.waitForTimeout(600);
      await shot(`magic_${label}_meteor_final`);
      await page.waitForTimeout(1500);
    }
    await page.evaluate(() => window.__mistwoodDebug.setClock(22));
    // 淨化：把一隻迷霧生物打到剩一點血，再以星光衝擊擊敗
    await stage();
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      const e = d.enemies()[0];
      for (let i = 0; i < 3; i++) d.send({ type: 'AttackEnemy', enemyId: e.id, attack: 'spell_star_bolt' });
    });
    await page.evaluate(() => window.__mistwoodDebug.tap('KeyQ'));
    await page.waitForTimeout(900);
    await shot('magic_night_purify');
    await page.evaluate(() => window.__mistwoodDebug.setClock(12));
  }

  if (withDaynight) {
    // 日夜（任務 6B）：三個書籤 × 06 / 12 / 18 / 21 / 00 時，另拍夜晚迷霧與跟隨視角的夜晚草原（螢火蟲）
    const hours = [6, 12, 18, 21, 0];
    const setClock = (h) => page.evaluate((v) => window.__mistwoodDebug.setClock(v), h);
    await page.evaluate(() => window.__mistwoodDebug.setMist(0, true));
    for (const id of ['meadow', 'village', 'lake']) {
      await page.evaluate((b) => window.__mistwoodDebug.setBookmark(b), id);
      for (const h of hours) {
        await setClock(h);
        await page.waitForTimeout(900);
        await shot(`daynight_${id}_${String(h).padStart(2, '0')}`);
      }
    }
    await setClock(21);
    await page.evaluate(() => window.__mistwoodDebug.setMist(1, true));
    await page.evaluate(() => window.__mistwoodDebug.setBookmark('meadow'));
    await page.waitForTimeout(900);
    await shot('daynight_meadow_21_mist');
    await page.evaluate(() => window.__mistwoodDebug.setMist(0, true));
    // 跟隨視角：夜晚的出生草原（螢火蟲、月亮、星空）與黃昏的夕陽
    const follow = async (name, h, cam) => {
      await setClock(h);
      await page.evaluate(
        (c) => {
          const d = window.__mistwoodDebug;
          d.setCameraMode('follow');
          d.teleport(2, 26);
          d.face(2, 0);
          d.camera(c);
        },
        cam,
      );
      await page.waitForTimeout(1500);
      await shot(name);
    };
    await follow('daynight_follow_22', 22, { yaw: 0.2, pitch: -0.05, distance: 6 });
    await follow('daynight_follow_moon_01', 1, { yaw: Math.PI * 0.85, pitch: -0.45, distance: 7 });
    // 攝影機在角色後方 (sin yaw, cos yaw)：看向西方（夕陽）時 yaw = π/2、看向東方（日出）時 yaw = −π/2
    await follow('daynight_follow_sunset_18', 18, { yaw: Math.PI / 2, pitch: -0.12, distance: 7 });
    await follow('daynight_follow_sunrise_06', 6, { yaw: -Math.PI / 2, pitch: -0.1, distance: 7 });
    await setClock(12);
  }

  if (withBounds) {
    // 地圖邊界（任務 6A）：角色站在邊界前、從遠處看迷霧牆、角落、濃霧時、高處俯瞰整圈
    const view = async (name, px, pz, fx, fz, cam, wait = 1500) => {
      await page.evaluate(
        ([x, z, tx, tz, c]) => {
          const d = window.__mistwoodDebug;
          d.setCameraMode('follow');
          d.teleport(x, z);
          d.face(tx, tz);
          d.camera(c);
        },
        [px, pz, fx, fz, cam],
      );
      await page.waitForTimeout(wait);
      await shot(name);
    };
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(0, true);
    });
    // 攝影機在角色後方 (sin yaw, cos yaw)：往東看時 yaw = −π/2
    await view('bounds_edge_east', 72.4, 3, 90, 3, { yaw: -Math.PI / 2, pitch: 0.25, distance: 6 });
    await view('bounds_far_east', 50, 3, 90, 3, { yaw: -Math.PI / 2, pitch: 0.18, distance: 7 });
    await view('bounds_edge_south', -6, 72.4, -6, 90, { yaw: Math.PI, pitch: 0.3, distance: 6 });
    await view('bounds_corner_ne', 68, -68, 90, -90, { yaw: -Math.PI / 4, pitch: 0.3, distance: 7 });
    // 俯瞰：觀景點書籤在南邊界外的高處，看得到整道南側迷霧牆
    await page.evaluate(() => window.__mistwoodDebug.setBookmark('overlook'));
    await page.waitForTimeout(1500);
    await shot('bounds_overview');
    await page.evaluate(() => window.__mistwoodDebug.setMist(1, true));
    await view('bounds_edge_east_mist', 72.4, 3, 90, 3, { yaw: -Math.PI / 2, pitch: 0.25, distance: 6 });
    await page.evaluate(() => window.__mistwoodDebug.setMist(0, true));
  }

  if (withGamepad) {
    const chest = JSON.parse(readFileSync('src/data/placements.json', 'utf8')).find((p) => p.id === 'meadow_chest_001');
    const pad = (p) => page.evaluate((v) => window.__mistwoodDebug.setPad(v), p);
    const press = async (b) => {
      const buttons = [];
      buttons[b] = 1;
      await pad({ buttons });
      await page.waitForTimeout(120);
      await pad({});
      await page.waitForTimeout(150);
    };
    await page.evaluate(([x, z]) => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
      d.setCameraMode('follow');
      d.teleport(x + 0.5, z + 1.4);
      d.face(x, z);
      d.camera({ yaw: 0.5, pitch: 0.3, distance: 5 });
    }, [chest.position[0], chest.position[2]]);
    await pad({ axes: [0, 0, 0.001, 0] });
    await press(13); // 任一手把輸入：提示改為手把按鈕
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, chest.id, { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot('gamepad_prompt');
    await press(9);
    await press(13);
    await page.waitForTimeout(300);
    await shot('gamepad_pause_focus');
    await page.locator('[data-testid="pause-settings"]').click();
    await page.locator('[data-testid="settings-gamepad"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot('gamepad_settings');
    await press(1);
    await press(1);
    await pad(null);
  }

  if (withBuild) {
    // 先修好橋、帶齊材料，站到小島上
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(0);
      d.setCameraMode('follow');
      d.send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 60 }, { itemId: 'stone', count: 30 }, { itemId: 'starlight_shard', count: 6 }, { itemId: 'flower', count: 10 }, { itemId: 'herb', count: 6 }] });
      d.teleport(34.5, 8);
      d.face(38, 8);
      d.camera({ yaw: -2.2, pitch: 0.42, distance: 7 });
    });
    await page.waitForTimeout(1200);
    await page.keyboard.press('KeyB');
    await page.waitForSelector('[data-testid="build-menu"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot('build_menu');
    // 依序蓋：小木屋、營火、長椅、星光燈、花圃
    const plan = [
      ['cottage', 38.5, 5.5, 0],
      ['campfire', 37.5, 10, 0],
      ['bench', 35.5, 10.5, 1.57],
      ['lantern', 40.5, 9.5, 0],
      ['flower_bed', 35.5, 6, 0],
      ['flag', 41, 6.5, 0],
    ];
    await page.locator('[data-testid="build-option-campfire"]').click();
    await page.waitForTimeout(400);
    await shot('build_ghost_ok');
    await page.evaluate(() => window.__mistwoodDebug.face(34, 8)); // 轉向湖面：預覽變紅
    await page.waitForTimeout(400);
    await shot('build_ghost_bad');
    await page.evaluate((list) => {
      const d = window.__mistwoodDebug;
      for (const [b, x, z, yaw] of list) d.send({ type: 'PlaceBuilding', buildable: b, x, z, yaw });
    }, plan);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.teleport(36, 13.5);
      d.face(38, 8);
      d.camera({ yaw: 0.35, pitch: 0.38, distance: 7.5 });
    });
    await page.waitForTimeout(1500);
    await shot('build_home');
    // 營火旁（體力恢復加快的提示）與拆除工具
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.teleport(36.3, 10.8);
      d.face(37.5, 10);
      d.camera({ yaw: -0.6, pitch: 0.42, distance: 6 });
    });
    await page.waitForTimeout(900);
    await page.keyboard.press('KeyB');
    await page.waitForSelector('[data-testid="build-menu"]', { timeout: 5000 });
    await page.locator('[data-testid="build-option-remove"]').click();
    await page.evaluate(() => window.__mistwoodDebug.face(35.5, 10.5));
    await page.waitForTimeout(500);
    await shot('build_remove');
    await page.keyboard.press('Escape');
  }

  if (withCompanion) {
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(0);
      d.setCameraMode('follow');
      d.teleport(-3.0, 12.9);
      d.camera({ yaw: 1.9, pitch: 0.3, distance: 4.6 });
    });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() !== null, null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid="message-dialog"]', { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1600);
    await shot('companion_greet');
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(500);
    await shot('companion_hint');
  }

  if (withCombat) {
    const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
    const [sx, sz] = spawners[0].center;
    // 和平模式下先讓生成點補滿，再靠近拍攝
    await page.evaluate(([x, z]) => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
      d.setPeaceful(true);
      d.setCameraMode('follow');
      d.teleport(x - 7, z + 7);
      d.camera({ yaw: -0.8, pitch: 0.3, distance: 6 });
    }, [sx, sz]);
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().length >= 3, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot('combat_wisps');
    // 解除和平模式：迷霧生物靠過來，拍攻擊前搖
    await page.evaluate(() => window.__mistwoodDebug.setPeaceful(false));
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().some((e) => e.state === 'attack'), null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await shot('combat_telegraph');
    // 面向最近的迷霧生物攻擊，拍傷害數字
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      const p = d.playerState();
      const near = d.enemies().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near) d.face(near.x, near.z);
    });
    await page.mouse.click(800, 450);
    await page.mouse.click(800, 450);
    await page.waitForTimeout(450);
    await shot('combat_attack');
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(550);
    await shot('combat_skill');
    await page.evaluate(() => window.__mistwoodDebug.setPeaceful(true));
  }

  if (withLake) {
    // 湖的西北岸俯瞰湖面與小島
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
      d.setCameraMode('follow');
      d.teleport(17, 0);
      d.camera({ yaw: -2.3, pitch: 0.42, distance: 8 });
    });
    await page.waitForTimeout(2500);
    await shot('lake_overview');
    // 斷橋的橋頭：接取修橋任務、帶齊材料
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 14 }, { itemId: 'stone', count: 4 }] });
      d.send({ type: 'AcceptQuest', quest: 'wood_for_bridge' });
      d.send({ type: 'TurnInQuest', quest: 'wood_for_bridge' });
      d.send({ type: 'AcceptQuest', quest: 'repair_bridge' });
      d.teleport(20.6, 8, 0.5); // 站在橋面上（橋面高 0.45）
      d.camera({ yaw: -1.2, pitch: 0.38, distance: 7 });
    });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'lake_bridge', null, { timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('lake_bridge_broken');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1800);
    await shot('lake_bridge_repaired');
    // 走到橋中央回頭看
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.teleport(26, 8, 0.5);
      d.camera({ yaw: 2.2, pitch: 0.25, distance: 6 });
    });
    await page.waitForTimeout(1200);
    await shot('lake_bridge_walk');
  }

  if (withWaterway) {
    const view = async (bookmark, name, wait = 1500) => {
      await page.evaluate((b) => window.__mistwoodDebug.setBookmark(b), bookmark);
      await page.waitForTimeout(wait);
      await shot(name);
    };
    const send = (cmds) => page.evaluate((list) => list.forEach((c) => window.__mistwoodDebug.send(c)), cmds);
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setMist(null);
      d.setQuestCompleted('wood_for_bridge');
      d.setQuestCompleted('repair_bridge');
      d.travelToMap('glowmoss');
    });
    await page.waitForTimeout(2500);
    const lanterns = ['glowmoss_lantern_01', 'glowmoss_lantern_02', 'glowmoss_lantern_03'];
    await send([{ type: 'AcceptQuest', quest: 'quest_forest_001' }]);
    await view('glowmoss_lanterns', 'waterway_lanterns_unlit');
    await send([
      ...lanterns.map((placementId) => ({ type: 'ActivateObject', placementId })),
      { type: 'DebugGiveItems', items: [{ itemId: 'glow_moss', count: 5 }, { itemId: 'moondew_herb', count: 3 }, { itemId: 'stone', count: 4 }] },
      { type: 'TurnInQuest', quest: 'quest_forest_001' },
      { type: 'AcceptQuest', quest: 'quest_forest_002' },
    ]);
    await view('glowmoss_lanterns', 'waterway_lanterns_lit');
    await view('glowmoss_wheel', 'waterway_wheel_dry');
    await view('glowmoss_channel', 'waterway_gate_closed');
    await view('glowmoss_crown_gate', 'waterway_crown_sealed');
    await send([
      { type: 'ActivateObject', placementId: 'glowmoss_channel_roots' },
      { type: 'ActivateObject', placementId: 'glowmoss_water_gate_01' },
      { type: 'ActivateObject', placementId: 'glowmoss_water_gate_02' },
      { type: 'RepairObject', placementId: 'glowmoss_channel_breach' },
    ]);
    // 水從泉眼一路流下來需要幾秒
    await view('glowmoss_channel', 'waterway_gate_open', 9000);
    await view('glowmoss_wheel', 'waterway_wheel_flowing', 3000);
    await send([{ type: 'TurnObject', placementId: 'glowmoss_water_wheel' }]);
    await view('glowmoss_wheel', 'waterway_wheel_turned', 3500);
    await send([
      { type: 'TurnObject', placementId: 'glowmoss_water_wheel' },
      { type: 'TurnInQuest', quest: 'quest_forest_002' },
    ]);
    await view('glowmoss_crown_gate', 'waterway_crown_open');
    await page.evaluate(() => window.__mistwoodDebug.setClock(21));
    await view('glowmoss_lanterns', 'waterway_lanterns_night', 2000);
    await view('glowmoss_wheel', 'waterway_wheel_night', 1500);
  }

  if (withBoss) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    const look = (cam) => d((c) => window.__mistwoodDebug.camera(c), cam);
    const heal = () => d(() => window.__mistwoodDebug.send({ type: 'Rest' }));
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(10);
      g.setQuestCompleted('wood_for_bridge');
      g.setQuestCompleted('repair_bridge');
      g.setQuestCompleted('quest_forest_002');
      // 任務 8D-2：接了「苔冠下的守衛」才開戰
      g.send({ type: 'AcceptQuest', quest: 'quest_forest_003' });
      for (const from of ['move', 'interact', 'harvest', 'inventory']) g.send({ type: 'AdvanceTutorial', from });
      g.setCameraMode('follow');
      g.travelToMap('glowmoss');
    });
    await page.waitForTimeout(2500);
    // 從入口走進空地：開戰，苔咚從菌樹下鑽出來（攝影機在玩家西側、看向東）
    await d(() => {
      const g = window.__mistwoodDebug;
      g.setPeaceful(true);
      g.teleport(2083, 47);
      g.face(2100, 46);
    });
    await look({ yaw: -1.35, pitch: 0.22, distance: 9 });
    await page.waitForTimeout(1300);
    await shot('boss_intro');
    await page.waitForTimeout(2600);
    await shot('boss_hud');
    // 入口的樹根：從空地裡往西看（自由攝影機，拍完回到跟隨）
    await d(() => window.__mistwoodDebug.viewAt([2090, 5.5, 53], [2073, 2, 45]));
    await page.waitForTimeout(900);
    await shot('boss_gate');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
    const force = async (move, wait) => {
      await heal();
      await d((m) => {
        const g = window.__mistwoodDebug;
        g.setPeaceful(false);
        g.forceBossMove(m);
      }, move);
      await page.waitForTimeout(wait);
    };
    await look({ yaw: -1.2, pitch: 0.42, distance: 12 });
    await force('spikes', 750);
    await shot('boss_spikes_warn');
    await page.waitForTimeout(500);
    await shot('boss_spikes');
    await d(() => window.__mistwoodDebug.setPeaceful(true));
    await page.waitForTimeout(2500);
    // 震地：玩家退開，看得到落點圈
    await d(() => window.__mistwoodDebug.teleport(2084, 56));
    await look({ yaw: -0.9, pitch: 0.4, distance: 13 });
    await page.waitForTimeout(600);
    await force('slam', 550);
    await shot('boss_slam_warn');
    await page.waitForTimeout(500);
    await shot('boss_slam_air');
    await page.waitForTimeout(500);
    await shot('boss_recover');
    await d(() => window.__mistwoodDebug.setPeaceful(true));
    await page.waitForTimeout(2500);
    await d(() => {
      const g = window.__mistwoodDebug;
      const b = g.boss();
      if (b) g.teleport(b.x - 4.5, b.z + 0.5);
    });
    await look({ yaw: -2.2, pitch: 0.3, distance: 10 });
    await page.waitForTimeout(400);
    await force('spores', 900);
    await shot('boss_spores');
    await d(() => window.__mistwoodDebug.setPeaceful(true));
    await page.waitForTimeout(2000);
    // 連續被打：縮入菌傘
    await d(() => {
      const g = window.__mistwoodDebug;
      const b = g.boss();
      for (let i = 0; i < 6 && b; i++) g.hitEnemy(b.enemyId, 'spell_star_bolt');
    });
    await page.waitForTimeout(500);
    await shot('boss_guard');
    await page.waitForTimeout(2500);
    // 三個水槽注滿：迷霧退去
    await d(() => {
      const g = window.__mistwoodDebug;
      for (const id of ['glowmoss_crown_trough_01', 'glowmoss_crown_trough_02', 'glowmoss_crown_trough_03']) g.send({ type: 'ActivateObject', placementId: id });
      g.teleport(2096, 30);
      g.face(2099, 28);
    });
    await look({ yaw: 0.3, pitch: 0.35, distance: 6 });
    await page.waitForTimeout(1500);
    await shot('boss_trough_full');
    await d(() => {
      const g = window.__mistwoodDebug;
      const b = g.boss();
      if (!b) return;
      g.teleport(b.x - 7, b.z + 3);
      g.viewAt([b.x - 9, 4.5, b.z + 7], [b.x, 2.6, b.z]);
    });
    await page.waitForTimeout(2000);
    await shot('boss_cleared');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
    await d(() => {
      const g = window.__mistwoodDebug;
      const b = g.boss();
      for (let i = 0; i < 80 && g.boss(); i++) g.hitEnemy(b.enemyId, 'spell_starlight_burst');
    });
    await page.waitForTimeout(1200);
    await shot('boss_defeated');
  }

  if (withLighthouse) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    const placementsData = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
    const at = (id) => placementsData.find((p) => p.id === id).position;
    const lamp = at('highland_lighthouse_lamp');
    const core = at('highland_mist_core');
    const shard = at('highland_lantern_shard_03');
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(10);
      for (const q of ['wood_for_bridge', 'repair_bridge', 'clear_forest']) g.setQuestCompleted(q);
      g.send({ type: 'AcceptQuest', quest: 'quest_dawn_003' });
      for (const from of ['move', 'interact', 'harvest', 'inventory']) g.send({ type: 'AdvanceTutorial', from });
      g.setPeaceful(true);
      g.setCameraMode('follow');
    });
    const frame = async (name, player, eye, target, wait = 1500) => {
      await d(([p, e, t]) => {
        const g = window.__mistwoodDebug;
        g.teleport(p[0], p[1]);
        g.viewAt(e, t);
      }, [player, eye, target]);
      await page.waitForTimeout(wait);
      await shot(name);
    };
    await frame('lighthouse_shard', [shard[0] + 3, shard[2] + 2], [shard[0] + 2.2, shard[1] + 1.6, shard[2] + 2.2], [shard[0], shard[1] + 0.2, shard[2]]);
    await frame('lighthouse_core', [core[0] - 5, core[2] + 2], [core[0] - 5.5, core[1] + 2.4, core[2] + 3.5], [core[0], core[1] + 1, core[2]]);
    await frame('lighthouse_dark', [lamp[0] + 8, lamp[2] + 14], [lamp[0] + 14, lamp[1] - 8, lamp[2] + 26], [lamp[0], lamp[1] - 4, lamp[2]]);
    await d(([lx, lz]) => {
      const g = window.__mistwoodDebug;
      g.send({ type: 'DebugGiveItems', items: [{ itemId: 'lantern_shard', count: 3 }] });
      // 三隻噗啾的進度直接以除錯指令打倒燈塔旁的噗啾
      g.teleport(lx + 4, lz + 9);
    }, [lamp[0], lamp[2]]);
    for (let n = 0; n < 3; n++) {
      await page.waitForFunction(() => window.__mistwoodDebug.enemies().some((e) => e.kind === 'mist_wisp'), null, { timeout: 15_000 });
      await d(() => {
        const g = window.__mistwoodDebug;
        const wisp = g.enemies().find((e) => e.kind === 'mist_wisp');
        for (let i = 0; i < 10 && g.enemies().some((e) => e.id === wisp.id); i++) {
          g.setMp(100);
          g.send({ type: 'AttackEnemy', enemyId: wisp.id, attack: 'spell_starlight_burst' });
        }
      });
      await page.waitForTimeout(400);
    }
    await d(() => window.__mistwoodDebug.send({ type: 'ActivateObject', placementId: 'highland_mist_core' }));
    await frame('lighthouse_core_clear', [core[0] - 5, core[2] + 2], [core[0] - 5.5, core[1] + 2.4, core[2] + 3.5], [core[0], core[1] + 1, core[2]], 2000);
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
    await d(([lx, lz]) => {
      const g = window.__mistwoodDebug;
      g.teleport(lx + 1.5, lz + 3.6);
      g.face(lx, lz);
      g.camera({ yaw: 0.4, pitch: -0.35, distance: 9 });
      g.send({ type: 'RepairObject', placementId: 'highland_lighthouse_lamp' });
    }, [lamp[0], lamp[2]]);
    await page.waitForTimeout(500);
    await shot('lighthouse_reawaken');
    await frame('lighthouse_lit', [lamp[0] + 8, lamp[2] + 14], [lamp[0] + 14, lamp[1] - 8, lamp[2] + 26], [lamp[0], lamp[1] - 4, lamp[2]], 3000);
    await d(() => window.__mistwoodDebug.setClock(21));
    await frame('lighthouse_night', [lamp[0] + 8, lamp[2] + 14], [lamp[0] + 30, lamp[1] - 10, lamp[2] + 52], [lamp[0], lamp[1] - 2, lamp[2]], 3000);
    // 從村子望向北邊的燈塔（夜晚）
    await frame('lighthouse_from_village', [-10, -40], [-8, 12, -30], [lamp[0], lamp[1], lamp[2]], 2500);
    await d(() => {
      const g = window.__mistwoodDebug;
      g.setClock(10);
      g.setCameraMode('follow');
    });
  }

  if (withFootprints) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(10);
      g.setQuestCompleted('quest_dawn_003');
    });
    await d(() => {
      const g = window.__mistwoodDebug;
      g.teleport(99.5, 21);
      g.viewAt([93, 2.4, 26.5], [96, 0, 24]);
    });
    await page.waitForTimeout(1500);
    await shot('footprints_trail');
    await d(() => {
      const g = window.__mistwoodDebug;
      g.teleport(91.5, 53.5);
      g.viewAt([86.4, 2.2, 54], [89, 0, 56.5]);
    });
    await page.waitForTimeout(1300);
    await shot('footprints_nest');
    await d(() => {
      const g = window.__mistwoodDebug;
      g.setQuestCompleted('quest_dawn_006');
      g.teleport(91, 59.5);
      g.viewAt([90.6, 0.9, 59.3], [89.2, 0.3, 57.6]);
    });
    await page.waitForTimeout(1500);
    await shot('footprints_bunny');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
  }

  if (withGarden) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    const tao = JSON.parse(readFileSync('src/data/npcs.json', 'utf8')).find((n) => n.id === 'tao').position;
    const soil = JSON.parse(readFileSync('src/data/placements.json', 'utf8')).find((p) => p.id === 'farm_soil_mound_01').position;
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(9);
      for (const q of ['wood_for_bridge', 'repair_bridge']) g.setQuestCompleted(q);
    });
    await d(([x, z]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x - 2.2, z - 1.5);
      g.viewAt([x - 3.4, 2.1, z + 1.8], [x, 0.9, z]);
    }, tao);
    await page.waitForTimeout(1500);
    await shot('garden_tao');
    await d(([x, y, z]) => window.__mistwoodDebug.viewAt([x + 2, y + 1.6, z + 2], [x, y + 0.2, z]), soil);
    await page.waitForTimeout(1200);
    await shot('garden_soil');
    await d(() => {
      const g = window.__mistwoodDebug;
      g.send({ type: 'AcceptQuest', quest: 'quest_dawn_005' });
      g.send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 4 }, { itemId: 'loose_soil', count: 3 }] });
      g.send({ type: 'PlaceBuilding', buildable: 'garden_plot', x: 39, z: 8, yaw: 0 });
      g.teleport(36, 9.5);
      g.viewAt([37.4, 2.2, 10.2], [39, 0.4, 8]);
    });
    await page.waitForTimeout(1500);
    await shot('garden_stage0');
    await d(() => window.__mistwoodDebug.setClock(12));
    await page.waitForTimeout(1200);
    await shot('garden_stage1');
    await d(() => window.__mistwoodDebug.setClock(16));
    await page.waitForTimeout(1200);
    await shot('garden_stage2');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
  }

  if (withShop) {
    await page.evaluate(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.send({ type: 'DebugGiveItems', items: [{ itemId: 'seed_coin', count: 20 }, { itemId: 'wood', count: 8 }, { itemId: 'herb', count: 3 }] });
      g.openShop('shop_mira_supply');
    });
    await page.getByTestId('shop').waitFor({ timeout: 3000 });
    await page.waitForTimeout(300);
    await shot('shop_buy');
    await page.getByTestId('shop-tab-sell').click();
    await page.waitForTimeout(300);
    await shot('shop_sell');
    await page.keyboard.press('Escape');
    // 草藥桌（任務 7J）：一個材料不足、一個可以做
    await page.evaluate(() => {
      const g = window.__mistwoodDebug;
      g.setQuestCompleted('quest_forest_001');
      g.send({ type: 'DebugGiveItems', items: [{ itemId: 'moondew_herb', count: 2 }, { itemId: 'glow_moss', count: 2 }] });
      g.openCraft('linna_herbtable');
    });
    await page.getByTestId('craft').waitFor({ timeout: 3000 });
    await page.waitForTimeout(300);
    await shot('craft_herbtable');
    await page.keyboard.press('Escape');
  }

  if (withLetters) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    const niko = JSON.parse(readFileSync('src/data/npcs.json', 'utf8')).find((n) => n.id === 'niko').position;
    const cloth = JSON.parse(readFileSync('src/data/placements.json', 'utf8')).find((p) => p.id === 'village_dry_cloth_01').position;
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(10);
      for (const q of ['wood_for_bridge', 'repair_bridge']) g.setQuestCompleted(q);
      g.send({ type: 'AcceptQuest', quest: 'quest_dawn_004' });
    });
    await d(([x, z]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x - 2, z - 2.5);
      g.viewAt([x - 3.2, 2.2, z - 3.6], [x, 0.9, z]);
    }, niko);
    await page.waitForTimeout(1500);
    await shot('letters_niko');
    await d(([x, y, z]) => window.__mistwoodDebug.viewAt([x + 2.2, y + 1.6, z + 2.2], [x, y + 0.2, z]), cloth);
    await page.waitForTimeout(1200);
    await shot('letters_cloth');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
  }

  if (withJournal) {
    await page.evaluate(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      for (const q of ['wood_for_bridge', 'repair_bridge']) g.setQuestCompleted(q);
      g.send({ type: 'AcceptQuest', quest: 'clear_forest' });
      g.send({ type: 'AcceptQuest', quest: 'quest_forest_001' });
    });
    await page.keyboard.press('KeyJ');
    await page.getByTestId('quest-journal').waitFor({ timeout: 3000 });
    await page.waitForTimeout(400);
    await shot('journal_active');
    await page.getByTestId('journal-tab-completed').click();
    await page.waitForTimeout(300);
    await shot('journal_completed');
    await page.keyboard.press('Escape');
  }

  if (withPuffKing) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    const look = (cam) => d((c) => window.__mistwoodDebug.camera(c), cam);
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(16);
      for (const q of ['wood_for_bridge', 'repair_bridge', 'clear_forest']) g.setQuestCompleted(q);
      g.send({ type: 'AcceptQuest', quest: 'quest_dawn_003' });
      g.send({ type: 'DebugGiveItems', items: [{ itemId: 'lantern_shard', count: 3 }] });
      for (const from of ['move', 'interact', 'harvest', 'inventory']) g.send({ type: 'AdvanceTutorial', from });
      g.setQuestCompleted('quest_dawn_003');
      g.setPeaceful(true);
      g.setCameraMode('follow');
      g.teleport(-4, -110);
      g.face(-4, -122);
    });
    await look({ yaw: 0, pitch: 0.25, distance: 9 });
    await page.waitForTimeout(1300);
    await shot('puffking_intro');
    await page.waitForTimeout(1600);
    await shot('puffking_hud');
    const force = async (move, wait) => {
      await d((m) => {
        const g = window.__mistwoodDebug;
        g.send({ type: 'Rest' });
        g.setPeaceful(false);
        g.forceBossMove(m);
      }, move);
      await page.waitForFunction((m) => window.__mistwoodDebug.boss()?.state === m, move, { timeout: 8000 });
      await page.waitForTimeout(wait);
    };
    await look({ yaw: 0.5, pitch: 0.4, distance: 12 });
    await force('charge', 500);
    await shot('puffking_charge');
    await d(() => window.__mistwoodDebug.setPeaceful(true));
    await page.waitForTimeout(2500);
    await force('orbs', 450);
    await shot('puffking_orbs');
    await d(() => window.__mistwoodDebug.setPeaceful(true));
    await page.waitForTimeout(2500);
    await force('slam', 550);
    await shot('puffking_slam');
    // 蓄力時轉動星光鏡：暈眩
    await d(() => {
      const g = window.__mistwoodDebug;
      g.send({ type: 'TurnObject', placementId: 'highland_star_mirror' });
      g.setPeaceful(true);
    });
    await page.waitForTimeout(700);
    await shot('puffking_stunned');
    await d(() => {
      const g = window.__mistwoodDebug;
      const b = g.boss();
      for (let i = 0; i < 80 && g.boss(); i++) {
        g.setMp(100);
        g.hitEnemy(b.enemyId, 'spell_starlight_burst');
      }
    });
    await page.waitForTimeout(1100);
    await shot('puffking_defeated');
    await page.waitForTimeout(2000);
    const puff = JSON.parse(readFileSync('src/data/npcs.json', 'utf8')).find((n) => n.id === 'puff');
    await d(([x, z, yaw]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x + Math.sin(yaw) * 2.4 + 1, z + Math.cos(yaw) * 2.4);
      g.face(x, z);
      g.camera({ yaw: yaw + 0.6, pitch: 0.2, distance: 4 });
    }, [puff.position[0], puff.position[1], puff.facingYaw]);
    await page.waitForTimeout(1500);
    await shot('puffking_buddy');
    await d(() => window.__mistwoodDebug.setClock(10));
  }

  if (withGuardian) {
    const d = (fn, arg) => page.evaluate(fn, arg);
    const placementsData = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
    const at = (id) => placementsData.find((p) => p.id === id).position;
    const stone = at('glowmoss_root_stone');
    const lake = at('glowmoss_lake_roots');
    await d(() => {
      const g = window.__mistwoodDebug;
      g.resetWorld();
      g.setMist(null);
      g.setClock(10);
      for (const q of ['wood_for_bridge', 'repair_bridge', 'quest_forest_001', 'quest_forest_002']) g.setQuestCompleted(q);
      g.send({ type: 'AcceptQuest', quest: 'quest_forest_003' });
      for (const from of ['move', 'interact', 'harvest', 'inventory']) g.send({ type: 'AdvanceTutorial', from });
      g.setPeaceful(true);
      g.setCameraMode('follow');
      g.travelToMap('glowmoss');
    });
    await page.waitForTimeout(2500);
    // 林間水道南端：還被樹根堵住（玩家站在渠道東岸）
    await d(([x, z]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x + 5, z - 6);
      g.viewAt([x + 7, 4.5, z - 9], [x, 0, z]);
    }, [lake[0], lake[2]]);
    await page.waitForTimeout(1500);
    await shot('guardian_lake_roots');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
    // 沉睡的根源石（從入口那一側看，菌樹後面）
    await d(([x, z]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x - 4, z + 3);
      g.viewAt([x - 5.5, 2.6, z + 2.5], [x, 1.1, z]);
    }, [stone[0], stone[2]]);
    await page.waitForTimeout(1500);
    await shot('guardian_stone_dormant');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
    // 打倒苔咚：縮小後成為 NPC
    await d(() => window.__mistwoodDebug.teleport(2088, 46));
    await page.waitForTimeout(1200);
    await d(() => {
      const g = window.__mistwoodDebug;
      for (const id of ['glowmoss_crown_trough_01', 'glowmoss_crown_trough_02', 'glowmoss_crown_trough_03']) g.send({ type: 'ActivateObject', placementId: id });
      const b = g.boss();
      for (let i = 0; i < 80 && g.boss(); i++) g.hitEnemy(b.enemyId, 'spell_starlight_burst');
    });
    await page.waitForTimeout(4000);
    const buddy = JSON.parse(readFileSync('src/data/npcs.json', 'utf8')).find((n) => n.id === 'moss_thump').position;
    await d(([x, z]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x - 1.4, z - 2.4);
      g.face(x, z);
      g.viewAt([x - 3.4, 1.7, z + 1.2], [x, 0.5, z]);
    }, buddy);
    await page.waitForTimeout(1500);
    await shot('guardian_buddy');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
    // 啟動根源石：綠光擴散（芽之共鳴）
    await d(([x, z]) => {
      const g = window.__mistwoodDebug;
      g.teleport(x - 2.1, z);
      g.face(x, z);
      g.camera({ yaw: -1.9, pitch: 0.25, distance: 6 });
      g.send({ type: 'ActivateObject', placementId: 'glowmoss_root_stone' });
    }, [stone[0], stone[2]]);
    await page.waitForTimeout(450);
    await shot('guardian_resonance');
    await d(([x, z]) => window.__mistwoodDebug.viewAt([x - 5.5, 2.6, z + 2.5], [x, 1.1, z]), [stone[0], stone[2]]);
    await page.waitForTimeout(2500);
    await shot('guardian_stone_awake');
    await d(() => window.__mistwoodDebug.setClock(21));
    await page.waitForTimeout(2000);
    await shot('guardian_stone_night');
    await d(() => {
      const g = window.__mistwoodDebug;
      g.setClock(10);
      g.send({ type: 'TurnInQuest', quest: 'quest_forest_003' });
    });
    await d(([x, z]) => window.__mistwoodDebug.viewAt([x + 7, 4.5, z - 9], [x, 0, z]), [lake[0], lake[2]]);
    await d(([x, z]) => window.__mistwoodDebug.teleport(x + 5, z - 6), [lake[0], lake[2]]);
    await page.waitForTimeout(2500);
    await shot('guardian_lake_open');
    await d(() => window.__mistwoodDebug.setCameraMode('follow'));
  }

  if (withNpc) {
    const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
    for (const npc of npcs) {
      const [x, z] = npc.position;
      // 站在 NPC 面前 2.6 m，攝影機從側後方看，NPC 與角色都入鏡
      await page.evaluate(
        ([px, pz, yaw]) => {
          const d = window.__mistwoodDebug;
          d.setCameraMode('follow');
          d.teleport(px + Math.sin(yaw) * 2.6, pz + Math.cos(yaw) * 2.6);
          d.camera({ yaw: yaw + 0.5, pitch: 0.25, distance: 4.2 });
        },
        [x, z, npc.facingYaw],
      );
      await page.waitForTimeout(1200);
      await shot(`npc_${npc.id}`);
    }
    const elder = npcs.find((n) => n.id === 'elder');
    await page.evaluate(
      ([px, pz]) => {
        const d = window.__mistwoodDebug;
        d.teleport(px, pz + 1.8);
        d.camera({ yaw: 0.6, pitch: 0.25, distance: 4.5 });
      },
      elder.position,
    );
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:elder', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid="dialogue"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await shot('npc_dialogue');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.waitForSelector('[data-testid="dialogue-option"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot('npc_dialogue_options');
    await page.keyboard.press('Escape');
    // 任務追蹤（任務 3C）：接取任務並砍兩棵樹
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.send({ type: 'AcceptQuest', quest: 'wood_for_bridge' });
      d.send({ type: 'HarvestObject', placementId: 'meadow_tree_002' });
    });
    await page.waitForTimeout(800);
    await shot('quest_tracker');
  }

  if (withRegion) {
    const placements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
    const prefabs = new Map(JSON.parse(readFileSync('src/data/prefabs.json', 'utf8')).map((p) => [p.id, p]));
    const forest = JSON.parse(readFileSync('src/data/regions.json', 'utf8')).find((r) => r.id === 'forest').area;
    // 森林裡 3.6 m 內沒有樹的空地
    let spot = null;
    for (let r = 0; r < forest.radius * 0.8 && !spot; r += 1) {
      for (let a = 0; a < Math.PI * 2 && !spot; a += 0.4) {
        const x = forest.center[0] + Math.cos(a) * r;
        const z = forest.center[1] + Math.sin(a) * r;
        const blocked = placements.some((p) => prefabs.get(p.prefabId).collider === 'static' && Math.hypot(p.position[0] - x, p.position[2] - z) < 3.6);
        if (!blocked) spot = [x, z];
      }
    }
    await page.evaluate(([x, z]) => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setCameraMode('follow');
      d.setMist(null);
      d.teleport(x, z);
      d.camera({ yaw: 0.5, pitch: 0.4, distance: 6 });
    }, spot);
    await page.waitForTimeout(600);
    await shot('region_forest_enter');
    await page.waitForTimeout(2600);
    await shot('region_forest_dense');
    await page.evaluate(() => window.__mistwoodDebug.setMistStage('forest', 'clear'));
    await page.waitForTimeout(3000);
    await shot('region_forest_clear');
    await page.evaluate(() => window.__mistwoodDebug.setMist(0));
  }

  if (withMenu) {
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.setCameraMode('follow');
      d.teleport(0, 18);
      d.camera({ yaw: 0, pitch: 0.35, distance: 6 });
      d.flow('pause');
    });
    await page.waitForSelector('[data-testid="pause-menu"]', { timeout: 5000 });
    // 先存檔一次：暫停選單顯示存檔時間，主選單出現「繼續遊戲」
    await page.locator('[data-testid="pause-save"]').click();
    await page.waitForSelector('[data-testid="save-status"]:has-text("已儲存")', { timeout: 5000 });
    await page.waitForTimeout(600);
    await shot('menu_pause');
    await page.locator('[data-testid="pause-settings"]').click();
    await page.waitForSelector('[data-testid="settings"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot('menu_settings');
    await page.locator('[data-testid="settings-close"]').click();
    await page.evaluate(() => window.__mistwoodDebug.flow('returnToTitle'));
    await page.waitForSelector('[data-testid="title-continue"]', { timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot('menu_title');
    await page.locator('[data-testid="title-start"]').click();
    await page.waitForTimeout(300);
    await shot('menu_title_confirm_new');
    await page.locator('[data-testid="title-confirm-new-yes"]').click();
  }

  if (withAnim) {
    await page.evaluate(() => window.__mistwoodDebug.setBookmark('character'));
    await page.waitForTimeout(1200);
    const keys = await page.evaluate(() => window.__mistwoodDebug.animKeys());
    for (const key of keys) {
      await page.evaluate((k) => window.__mistwoodDebug.previewAnimation(k, 0.4), key);
      await page.waitForTimeout(250);
      await shot(`anim_${key}`);
    }
    await page.evaluate(() => window.__mistwoodDebug.previewAnimation(null));
  }

  const errors = await page.locator('[role="alert"]').allTextContents();
  if (errors.length > 0) {
    console.error('畫面上有錯誤訊息：', errors);
    exitCode = 1;
  }
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

// 視覺驗證截圖（規格 8）：啟動 Electron 正式版，依序切換攝影機書籤並輸出圖片。
// 用法：node scripts/screenshot.mjs [階段名稱，預設 phase0] [--anim] [--mist] [--interact] [書籤 id...]
//   --anim：另外輸出角色每個必要動畫的定格圖（動畫來源驗證，規格 4.6）
//   --mist：每個書籤另外輸出迷霧外觀（<id>_mist.png，uMist = 1；規格 4.8 晴朗 / 迷霧兩種外觀）
//   --interact：輸出寶箱互動提示與開箱後畫面（任務 1C）
//   --menu：輸出主選單、暫停選單與設定畫面（Phase 1 驗收：可回到主選單；任務 2C、2E）
//   --build：湖心小島的建造選單、可放置 / 不可放置的預覽、蓋好的家園（任務 4A）、拆除工具與營火旁（任務 4B）
//   --companion：打開序章寶箱後星光夥伴出現與打招呼、按 H 詢問提示（任務 3F）
//   --combat：森林裡的迷霧生物、攻擊前搖、玩家攻擊與傷害數字、星光衝擊、受傷與倒下（任務 3E）
//   --lake：湖泊全景、斷橋、在橋頭修理、修好的木橋（任務 3D）
//   --npc：村莊 NPC 全身、與長老對話（一般段落與選項）（任務 3B）、任務追蹤（任務 3C）
//   --region：森林空地在濃霧與迷霧清除後的跟隨視角、區域名稱（任務 3A）
//   --harvest：輸出可採集的花叢、草藥特寫、砍樹前 / 揮砍中 / 樹樁與取得通知（任務 2A）與背包（任務 2B）
// 注意：截圖只用來檢查畫面正確性，不可用於推斷效能。
/* global window -- page.evaluate / waitForFunction 的回呼在 Renderer 內執行 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

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
const [stage = 'phase0', ...only] = args.filter((a) => !a.startsWith('--'));
const outDir = path.join('docs', 'screenshots', stage);
mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, MISTWOOD_START_QUERY: 'debug=1&play=1', MISTWOOD_SAVE_DIR: mkdtempSync(path.join(tmpdir(), 'mistwood-shot-')) },
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

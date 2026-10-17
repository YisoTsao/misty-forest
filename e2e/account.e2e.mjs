// 端對端：任務 11L-2 — 主選單的「單機遊玩 / 線上遊玩」。測試建置沒有設定 Supabase（VITE_SUPABASE_URL），線上功能停用：
// 預設單機、切到線上時顯示停用提示（不顯示信箱欄位、不送出網路請求）、記住上次選的模式；
// 單機的一局在暫停選單顯示「單機遊玩」、可以匯出存檔、沒有帳號入口。
// 真正的登入、設定名稱與線上角色需要實際信箱與資料庫，由使用者手動測試（見 docs/multiplayer/accounts.md）。
// 用法：pnpm build && node e2e/account.e2e.mjs
import assert from 'node:assert/strict';
import { runE2e, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };

await runE2e('account e2e', { query: 'debug=1', env }, async ({ page, check }) => {
  const offlineTab = page.locator('[data-testid="title-mode-offline"]');
  const onlineTab = page.locator('[data-testid="title-mode-online"]');

  await check('主選單預設「單機遊玩」：顯示新遊戲，沒有線上的內容', async () => {
    await page.locator('[data-testid="title-screen"]').waitFor({ timeout: 5000 });
    assert.equal(await offlineTab.getAttribute('aria-selected'), 'true');
    assert.equal(await onlineTab.getAttribute('aria-selected'), 'false');
    await page.locator('[data-testid="title-start"]').waitFor({ timeout: 3000 });
    assert.equal(await page.locator('[data-testid="online-panel"]').count(), 0);
  });

  await check('切到「線上遊玩」：沒有設定線上服務時顯示停用提示、不顯示信箱欄位', async () => {
    await onlineTab.click();
    assert.equal(await onlineTab.getAttribute('aria-selected'), 'true');
    assert.match(await page.locator('[data-testid="online-disabled"]').innerText(), /只能單機遊玩/);
    assert.equal(await page.locator('[data-testid="online-email"]').count(), 0, '停用時不顯示信箱欄位');
    assert.equal(await page.locator('[data-testid="title-start"]').count(), 0, '線上頁不顯示單機的新遊戲');
    // 設定與離開兩邊都有
    assert.equal(await page.locator('[data-testid="title-settings"]').count(), 1);
  });

  await check('重新載入後記住上次選的模式', async () => {
    await page.reload();
    await page.locator('[data-testid="title-screen"]').waitFor({ timeout: 30_000 });
    assert.equal(await onlineTab.getAttribute('aria-selected'), 'true');
    await offlineTab.click();
    await page.locator('[data-testid="title-start"]').waitFor({ timeout: 3000 });
  });

  await check('單機的一局：暫停選單顯示「單機遊玩」、可以匯出、沒有帳號入口', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="pause-menu"]').waitFor({ timeout: 3000 });
    assert.equal(await page.locator('[data-testid="pause-mode"]').innerText(), '單機遊玩');
    assert.equal(await page.locator('[data-testid="pause-export"]').count(), 1);
    assert.equal(await page.locator('[data-testid="pause-account"]').count(), 0);
    // 沒有設定帳號服務的開發建置保留手動連線（不需登入）
    assert.equal(await page.locator('[data-testid="pause-multiplayer"]').innerText(), '多人連線');
  });
});

// 端對端：任務 11G — 帳號面板。測試建置沒有設定 Supabase（VITE_SUPABASE_URL），帳號功能停用：
// 面板顯示停用提示、不會送出任何網路請求；標題與暫停選單都有入口。真正的寄信與驗證需要實際信箱，
// 由使用者手動測試（見 docs/multiplayer/accounts.md）。
// 用法：pnpm build && node e2e/account.e2e.mjs
import assert from 'node:assert/strict';
import { runE2e, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };

await runE2e('account e2e', { query: 'debug=1', env }, async ({ page, check }) => {
  const panel = page.locator('[data-testid="account-panel"]');

  await check('標題畫面的「帳號」開啟面板，顯示停用提示（沒有設定帳號服務）', async () => {
    await page.locator('[data-testid="title-account"]').click();
    await panel.waitFor({ timeout: 3000 });
    assert.match(await page.locator('[data-testid="account-disabled"]').innerText(), /只能使用本機存檔/);
    assert.equal(await page.locator('[data-testid="account-email"]').count(), 0, '停用時不顯示信箱欄位');
  });

  await check('Esc 關閉帳號面板', async () => {
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('新遊戲後暫停選單也有「帳號」入口', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="pause-menu"]').waitFor({ timeout: 3000 });
    await page.locator('[data-testid="pause-account"]').click();
    await panel.waitFor({ timeout: 3000 });
    assert.match(await page.locator('[data-testid="account-disabled"]').innerText(), /本機存檔/);
  });
});

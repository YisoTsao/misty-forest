import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseAllowedOrigins } from './origins';

describe('連線來源允許清單（任務 11D）', () => {
  const rules = parseAllowedOrigins(' https://mistwood.vercel.app/ , https://mistwood-*-yisotsao.vercel.app,null,file://');

  it('沒有設定時全部允許', () => {
    expect(isAllowedOrigin('https://evil.example', parseAllowedOrigins(undefined))).toBe(true);
    expect(isAllowedOrigin('https://evil.example', parseAllowedOrigins(' , '))).toBe(true);
  });

  it('正式網址、預覽網址（萬用字元）與 Electron 可以', () => {
    expect(isAllowedOrigin('https://mistwood.vercel.app', rules)).toBe(true);
    expect(isAllowedOrigin('https://mistwood-git-develop-yisotsao.vercel.app', rules)).toBe(true);
    expect(isAllowedOrigin('https://mistwood-a1b2c3-yisotsao.vercel.app', rules)).toBe(true);
    expect(isAllowedOrigin('null', rules)).toBe(true);
    expect(isAllowedOrigin('file://', rules)).toBe(true);
    expect(rules.map((r) => r.raw)).toEqual(['https://mistwood.vercel.app', 'https://mistwood-*-yisotsao.vercel.app', 'null', 'file://']);
  });

  it('其他網站、相似的網域、萬用字元不跨越點與斜線', () => {
    expect(isAllowedOrigin('https://evil.example', rules)).toBe(false);
    expect(isAllowedOrigin('https://mistwood.vercel.app.evil.example', rules)).toBe(false);
    expect(isAllowedOrigin('http://mistwood.vercel.app', rules)).toBe(false);
    expect(isAllowedOrigin('https://mistwood-x.evil.example-yisotsao.vercel.app', rules)).toBe(false);
    expect(isAllowedOrigin('https://mistwood-a/b-yisotsao.vercel.app', rules)).toBe(false);
  });

  it('沒有帶 Origin 的請求（非瀏覽器）允許', () => {
    expect(isAllowedOrigin(undefined, rules)).toBe(true);
    expect(isAllowedOrigin(null, rules)).toBe(true);
  });
});

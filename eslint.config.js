import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'dist-electron', 'dist-server', 'release', 'node_modules', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // R3F 慣例：useFrame 內直接修改 ref / three 物件，不觸發 React 重新渲染
      'react-hooks/immutability': 'off',
    },
  },
  {
    // 規格 3-2：game-core 為純邏輯，不得依賴渲染、物理、UI 或 Electron
    files: ['src/game-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'three', 'three/*', '@react-three/*', 'electron', 'zustand', 'zustand/*'],
              message: 'game-core 必須保持純 TypeScript，不得 import React / Three.js / Rapier / Electron / store。',
            },
            { group: ['@/game', '@/game/*', '@/world/*', '@/render/*', '@/ui/*', '@/net/*'], message: 'game-core 不得依賴上層模組。' },
          ],
        },
      ],
    },
  },
  {
    files: ['electron/**/*.ts', 'server/**/*.ts', 'scripts/**/*.{mjs,ts}', 'e2e/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
);

import { fileURLToPath, URL } from 'node:url';
import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

const threeModule = fileURLToPath(new URL('./src/vendor/three/three.module.min.js', import.meta.url));
const threeAddons = fileURLToPath(new URL('./src/vendor/three/addons', import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'workspace-cjs',
      enforce: 'pre',
      async transform(code, id) {
        const file = id.split('?')[0] ?? id;
        if (!file.includes('/packages/') || !file.endsWith('.js')) return null;
        if (!code.includes('exports.') && !code.includes('module.exports')) return null;
        const result = await transformWithEsbuild(code, file, { loader: 'js', format: 'esm' });
        return { code: result.code, map: result.map };
      },
    },
    react(),
  ],
  resolve: {
    alias: [
      { find: /^three$/, replacement: threeModule },
      { find: /^three\/addons/, replacement: threeAddons },
    ],
  },
  optimizeDeps: {
    include: ['@aura/api-client', '@aura/shared-types', '@aura/platform'],
    exclude: ['three'],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** 组装层 vite 配置: assets/ 作为 publicDir (manifest/纹理/字体直达 /) */
export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';

function copyManifestAndIcons() {
  return {
    name: 'copy-manifest-and-icons',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      mkdirSync(distDir, { recursive: true });
      copyFileSync(resolve(__dirname, 'manifest.json'), resolve(distDir, 'manifest.json'));

      const iconsSrc = resolve(__dirname, 'public/icons');
      const iconsDest = resolve(distDir, 'icons');
      if (existsSync(iconsSrc)) {
        mkdirSync(iconsDest, { recursive: true });
        for (const file of readdirSync(iconsSrc)) {
          copyFileSync(resolve(iconsSrc, file), resolve(iconsDest, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifestAndIcons()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});

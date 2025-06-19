
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'public/popup.html'),
        background: path.resolve(__dirname, 'public/background.js'),
        content: path.resolve(__dirname, 'public/content.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  publicDir: 'public'
});

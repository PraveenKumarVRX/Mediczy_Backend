import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Local preview: `CRM_API=https://<installation host> npm run dev` proxies the API and the same-origin
// tool pages to a running installation.
const target = process.env.CRM_API || 'http://127.0.0.1:8888';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@shared': path.resolve(__dirname, '../shared') } },
  define: { global: 'globalThis' },
  server: {
    port: 5180,
    proxy: {
      '/api': { target, changeOrigin: true, secure: true },
      '/crm-tools': { target, changeOrigin: true, secure: true },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { 'vendor-charts': ['recharts'], 'vendor-voice': ['livekit-client', '@exotel-npm-dev/webrtc-client-sdk'] } },
    },
  },
});

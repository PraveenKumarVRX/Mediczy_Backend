import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { execSync } from "child_process";

const buildHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return Date.now().toString(); }
})();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    // Bind to all interfaces for browser access
    host: "0.0.0.0",
    // Use port 9443 (Cloudflare Tunnel provides HTTPS to users)
    port: 9443,
    strictPort: true,
    // Allow domain access through Cloudflare Tunnel
    allowedHosts: [
      'mediqzy.com',
      'www.mediqzy.com',
      'localhost',
      '192.168.1.72',
      '.cloudflare.com'
    ],
    // Fix HMR to work with external domain access
    hmr: {
      overlay: false, // Disable overlay to prevent reload loops
      port: 9443,
      clientPort: 9443,
    },
    watch: {
      usePolling: false,
      ignored: [
        '**/node_modules/**', 
        '**/.git/**', 
        '**/dist/**',
        '**/*.log',
        '**/logs/**',
        '**/temp/**',
        '**/.vscode/**',
        '**/coverage/**'
      ],
    },
    open: false,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    react({
      // Optimize React refresh to prevent crashes
      devTarget: 'es2022',
      plugins: [
        // Reduce plugin overhead
      ],
    }),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Optimize for development stability
  define: {
    global: 'globalThis',
    __SW_CACHE_VERSION__: JSON.stringify(buildHash),
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Pre-bundle dependencies to reduce initial load
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'lucide-react',
      '@tanstack/react-query'
    ],
    exclude: ['zxing-wasm', '@undecaf/zbar-wasm'],
  },
  build: {
    // Production build optimization with memory constraints
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
    minify: 'esbuild',
    // Reduce memory usage during build
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: false, // Disable to save memory
    rollupOptions: {
      maxParallelFileOps: 2,
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        compact: true,
        // Split heavy rarely-used libraries out of the main bundle.
        // DICOM/Cornerstone alone is ~1.4 MB — only needed when viewing imaging.
        manualChunks(id) {
          if (id.includes('cornerstoneWADOImageLoader') || id.includes('cornerstoneTools') || id.includes('cornerstone-core')) {
            return 'vendor-dicom';
          }
          if (id.includes('livekit-client')) {
            return 'vendor-video';
          }
          if (id.includes('jspdf') || id.includes('html2canvas')) {
            return 'vendor-pdf';
          }
          if (id.includes('recharts') || id.includes('generateCategoricalChart')) {
            return 'vendor-charts';
          }
          if (id.includes('exceljs')) {
            return 'vendor-excel';
          }
        },
      }
    }
  },
  // Performance optimizations
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
}));

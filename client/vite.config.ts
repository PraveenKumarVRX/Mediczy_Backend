import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
    // Prevent global object access issues
    global: 'globalThis',
  },
  optimizeDeps: {
    // Pre-bundle dependencies to reduce initial load
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'lucide-react',
      '@tanstack/react-query'
    ],
  },
  build: {
    // Production build optimization
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
    minify: 'esbuild',
  },
  // Performance optimizations
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
}));

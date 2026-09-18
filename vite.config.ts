import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    sourcemap: mode === 'development',
    rollupOptions: {
      output: {
        manualChunks: mode === 'production' ? (id) => {
          // React core PHẢI gom chung một chunk để tránh race init
          // (scheduler, use-sync-external-store, jsx-runtime đều bắt buộc)
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('/node_modules/use-sync-external-store/')
          ) {
            return 'vendor-react';
          }
          // Web3 stack — chỉ load khi vào route ví/donations/identity/admin
          if (id.includes('wagmi') || id.includes('viem') || id.includes('rainbowkit') || id.includes('@walletconnect')) {
            return 'vendor-web3';
          }
          // Agora live streaming — chỉ load khi vào /live
          if (id.includes('agora-rtc-sdk-ng')) {
            return 'vendor-agora';
          }
          // HLS video player — chỉ load khi xem stream
          if (id.includes('hls.js')) {
            return 'vendor-hls';
          }
          // Charts — chỉ Admin/Founder dùng
          if (id.includes('recharts')) {
            return 'vendor-charts';
          }
          // Visual effects (canvas-based) — defer
          if (id.includes('html2canvas') || id.includes('canvas-confetti')) {
            return 'vendor-effects';
          }
          if (id.includes('react-router-dom')) {
            return 'vendor-router';
          }
          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('@radix-ui')) {
            return 'vendor-ui';
          }
          if (id.includes('date-fns') || id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'vendor-utils';
          }
        } : undefined,
      },
    },
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 300,
  },
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react/jsx-runtime',
      'scheduler',
      'react-router-dom', 
      '@tanstack/react-query',
      '@supabase/supabase-js',
      'eventemitter3',
      'lodash',
      'lodash/get',
      'lodash/set',
      'lodash/isEqual',
      'lodash/cloneDeep',
      'lodash/isNaN',
      'lodash/isNil',
      'lodash/isString',
      'lodash/isNumber',
      'lodash/isPlainObject',
      'lodash/isFunction',
      'lodash/isArray',
      '@metamask/utils',
      'ts-ebml',
    ],
    exclude: [],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  // Performance hints
  esbuild: {
    drop: mode === 'production' ? ['debugger'] : [],
    pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
    legalComments: 'none',
  },
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(
      new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
    ),
  },
}));

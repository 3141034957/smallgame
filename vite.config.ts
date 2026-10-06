import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { loadEnv } from 'vite'
import { apiProxyTarget } from './scripts/api-proxy.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GAME_')
  const proxy = { '/api': { target: apiProxyTarget(env), changeOrigin: true } }
  return {
    base: './',
    plugins: [react()],
    build: {
      outDir: 'dist/client',
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy,
    },
    resolve: {
      alias: {
        '@': resolve(import.meta.dirname, 'src'),
      },
    },
    test: {
      // Several suites simulate minutes of gameplay, which easily busts the 5s
      // default on a small deployment box. Heavy cases set their own budget too;
      // this is the floor so a slow machine cannot fail a correct build.
      testTimeout: 60000,
    },
  }
})

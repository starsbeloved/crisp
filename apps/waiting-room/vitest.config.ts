import { defineConfig } from 'vitest/config';
// Vitest's optimizer must not retire the dependency cache of a running Vite UI.
export default defineConfig({ cacheDir:'node_modules/.vite-vitest', test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] } });

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite runs the dev server and builds the app; Vitest reads the `test` block.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});

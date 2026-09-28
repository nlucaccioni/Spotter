import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the same build works at <user>.github.io/Spotter/ now
  // and at a custom subdomain root later. Revisit if client-side routing is added.
  base: './',
  plugins: [react()],
  test: {
    // The data layer is pure and framework-agnostic; no DOM needed by default.
    // Individual test files can opt in with `// @vitest-environment jsdom` later.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});

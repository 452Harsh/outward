import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['content/**/*.test.js', 'app/src/**/*.test.js', 'server/test/**/*.test.js'],
    environment: 'node',
  },
});

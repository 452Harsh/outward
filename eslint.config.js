import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/node_modules/**', '.models/**', 'training/**'] },
  js.configs.recommended,
  {
    files: ['app/src/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Marks components used only in JSX as used (Preact shares React's JSX semantics).
    rules: { 'react/jsx-uses-vars': 'error' },
  },
  {
    files: ['server/**/*.js', 'content/**/*.js', '*.config.js', 'app/*.config.js'],
    languageOptions: { globals: globals.node },
  },
];

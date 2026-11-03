const js = require('@eslint/js');
const globals = require('globals');

/**
 * ESLint de Node (formato "flat config" de ESLint 9). Las reglas son "error": el CI no deja entrar nuevas.
 */
module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'uploads/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Un `catch {}` vacío es válido cuando el error se ignora a propósito.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];

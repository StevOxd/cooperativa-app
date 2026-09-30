import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint del frontend (formato "flat config" de ESLint 9).
 *
 * Criterio: son "error" solo los problemas que rompen la app o los hooks de React;
 * lo demás es "warn" para no bloquear el CI con el código que ya existía. Cuando las
 * advertencias bajen a cero, se pueden subir a "error".
 */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  // Código de la aplicación (navegador, React con JSX)
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      // Hooks: romper sus reglas causa errores en tiempo de ejecución.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Recarga en caliente de Vite: avisa si un archivo exporta algo más que componentes.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Advertencias por ahora (código existente)
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React$)', caughtErrors: 'none' }],
      'react/no-unescaped-entities': 'warn',
      'no-useless-escape': 'warn',
      // Un `catch {}` vacío es válido cuando el error se ignora a propósito.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // El proyecto no usa PropTypes: la documentación de props va en JSDoc.
      'react/prop-types': 'off',
    },
  },

  // Archivos de configuración (se ejecutan en Node)
  {
    files: ['*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: js.configs.recommended.rules,
  },
];

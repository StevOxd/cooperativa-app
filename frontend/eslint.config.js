import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint del frontend (formato "flat config" de ESLint 9).
 *
 * Todas las reglas son "error": el código llegó a cero advertencias (issue #18) y así el CI
 * no deja entrar nuevas.
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
      'react-hooks/exhaustive-deps': 'error',

      // Recarga en caliente de Vite: avisa si un archivo exporta algo más que componentes. Los
      // contextos exportan también su hook (y el aviso global `toast`), como es habitual.
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowExportNames: ['useAuth', 'useToast', 'toast'] },
      ],

      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React$)', caughtErrors: 'none' }],
      'react/no-unescaped-entities': 'error',
      'no-useless-escape': 'error',
      // Un `catch {}` vacío es válido cuando el error se ignora a propósito.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // El proyecto no usa PropTypes: la documentación de props va en JSDoc.
      'react/prop-types': 'off',
    },
  },

  // Vista previa de la interfaz (ui-preview.html): es una entrada propia, no un módulo que se recargue
  {
    files: ['src/dev/**/*.{js,jsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
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

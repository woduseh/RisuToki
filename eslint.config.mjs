import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

const commonJsFiles = [
  'main.js',
  'src/lib/**/*.cjs',
  'test/**/*.js'
];

const browserJsFiles = [
  'src/app/**/*.js',
  'src/lib/**/*.js'
];

const portedRendererFiles = [
  'src/app/controller.ts',
  'src/lib/preview-engine.ts',
  'src/lib/preview-format.ts'
];

const tsFiles = ['src/**/*.{ts,vue}', 'preload.ts', 'popout-preload.ts', 'vite.config.ts', 'vitest.setup.ts', 'toki-mcp-server.ts'];

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**'
    ]
  },
  {
    ...js.configs.recommended,
    files: commonJsFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off'
    }
  },
  {
    ...js.configs.recommended,
    files: browserJsFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        require: 'readonly',
        monaco: 'readonly',
        Terminal: 'readonly',
        FitAddon: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off'
    }
  },
  {
    files: portedRendererFiles,
    rules: {
      'no-control-regex': 'off',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off'
    }
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: tsFiles
  })),
  ...pluginVue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: tsFiles
  })),
  {
    files: tsFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    files: ['src/charx-io.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    files: ['src/lib/terminal-chat.ts'],
    rules: {
      'no-control-regex': 'off',
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['src/lib/preview-engine.ts'],
    rules: {
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    files: ['src/app/controller.ts'],
    rules: {
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['src/popout/controller.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
];

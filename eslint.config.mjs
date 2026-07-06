import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:core',
              onlyDependOnLibsWithTags: ['scope:core'],
            },
            {
              sourceTag: 'scope:fonts',
              onlyDependOnLibsWithTags: ['scope:core', 'scope:fonts'],
            },
            {
              sourceTag: 'scope:angular',
              onlyDependOnLibsWithTags: ['scope:core', 'scope:angular'],
            },
            {
              sourceTag: 'scope:demo',
              onlyDependOnLibsWithTags: [
                'scope:core',
                'scope:fonts',
                'scope:angular',
                'scope:demo',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
  {
    // quill-ink-core must stay framework-free (enables React/Vue wrappers)
    files: ['packages/quill-ink-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'rxjs', 'rxjs/*', 'zone.js'],
              message:
                'quill-ink-core is framework-agnostic — no Angular/rxjs imports allowed.',
            },
          ],
        },
      ],
    },
  },
];

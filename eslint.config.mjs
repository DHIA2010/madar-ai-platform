import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import eslintConfigPrettier from "eslint-config-prettier"
import importPlugin from "eslint-plugin-import"
import simpleImportSort from "eslint-plugin-simple-import-sort"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "import/no-cycle": ["error", { maxDepth: "∞" }],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}", "src/components/app/**/*.{ts,tsx}"],
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^node:", "^\\u0000"],
            ["^react$", "^next", "^@?\\w"],
            ["^@/lib", "^@/services", "^@/providers", "^@/store", "^@/types", "^@/constants"],
            ["^@/components/app"],
            ["^@/features"],
            ["^@/components/ui"],
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/ui/*"],
              message: "Feature code must consume app-layer components from '@/components/app'.",
            },
            {
              group: [
                "@/lib/query",
                "@/lib/query/*",
                "@/lib/errors",
                "@/lib/errors/*",
                "@/lib/logger",
                "@/services/api-client",
                "@/lib/env",
              ],
              message:
                "Feature code cannot import infrastructure internals directly; use approved public APIs.",
            },
            {
              group: ["@/features/*/*"],
              message:
                "Cross-feature imports must go through each feature public API: '@/features/<feature>'.",
            },
            {
              group: ["../../*", "../../../*", "../../../../*", "../../../../../*"],
              message: "Use the '@/...' alias instead of deep relative imports.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^\\/(?!\\/)/]",
          message: "Use ROUTES.* constants instead of hardcoded route strings.",
        },
        {
          selector: "TemplateLiteral[quasis.length=1][quasis.0.value.raw=/^\\/(?!\\/)/]",
          message: "Use ROUTES.* constants instead of hardcoded route strings.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  eslintConfigPrettier,
])

export default eslintConfig

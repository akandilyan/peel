import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Fluid Functionalism library files — installed from the registry, not edited
    // (see CLAUDE.md). The linter checks only project code.
    "src/components/ui/**",
    "src/components/sidebar-app/**",
    "src/hooks/**",
    "src/lib/elevated.tsx",
    "src/lib/font-weight.ts",
    "src/lib/icon-context.tsx",
    "src/lib/popup.ts",
    "src/lib/shape-context.tsx",
    "src/lib/sidebar-menu-grid.ts",
    "src/lib/size-context.tsx",
    "src/lib/springs.ts",
    "src/lib/surface-classes.ts",
    "src/lib/surface-context.tsx",
    "src/lib/utils.ts",
  ]),
]);

export default eslintConfig;

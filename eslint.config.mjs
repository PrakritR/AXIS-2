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
  ]),
  {
    rules: {
      // eslint-config-next 16 enables this React Compiler rule at "error".
      // The pre-existing codebase has ~20 legitimate reset-on-dependency
      // setState-in-effect patterns; treat it as a warning like every other
      // react-hooks finding until they are migrated intentionally.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

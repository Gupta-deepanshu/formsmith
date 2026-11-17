import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // src/core must stay framework-free: pure TypeScript usable in browser, server and tests.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "react/*"], message: "src/core must not depend on React." },
            { group: ["next", "next/*"], message: "src/core must not depend on Next.js." },
            { group: ["@supabase/*"], message: "src/core must not depend on Supabase." },
            { group: ["@/components/*", "@/features/*", "@/lib/*", "@/server/*", "@/app/*"], message: "src/core may only import from src/core." },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/supabase/database.types.ts"]),
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Server actions used with useActionState must accept (prevState, formData) even when unused.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Multi-company: app code must use scopedDb() (src/lib/db.ts) via companyContext(), never the
  // unscoped client. Only these files may import it.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/prisma.ts",
      "src/lib/db.ts",
      "src/lib/auth.ts",
      "src/lib/login-throttle.ts",
      "src/app/login/actions.ts",
      "src/app/admin/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/prisma",
              message: "Use companyContext() / scopedDb() from @/lib/context or @/lib/db — the raw client is not company-scoped.",
            },
          ],
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
]);

export default eslintConfig;

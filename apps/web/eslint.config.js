import { config as reactConfig } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  { ignores: [".next/**"] },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

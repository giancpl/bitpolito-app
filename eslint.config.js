import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "android",
      "node_modules",
      ".android-local",
      "artifacts",
      "test-results",
      "public",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**", "tests/**", "*.config.{ts,js}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Device smoke scripts evaluate callbacks inside the app's WebView.
    files: ["scripts/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "no-empty": "off", "@typescript-eslint/no-unused-expressions": "off" },
  },
);

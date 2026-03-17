export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // New feature
        "fix",      // Bug fix
        "perf",     // Performance improvement
        "refactor", // Code refactoring (no feature/bug)
        "docs",     // Documentation changes
        "style",    // Code style (formatting, etc.)
        "test",     // Tests
        "chore",    // Build/tooling changes
        "ci",       // CI/CD changes
        "revert",   // Revert a commit
        "build",    // Build system changes
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
  },
};

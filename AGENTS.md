# Repository Guidelines

## Project Structure & Module Organization
This repository is currently minimal, so keep the top level clean and introduce structure deliberately as the codebase grows. Place application code in `src/`, tests in `tests/`, static assets in `assets/`, and long-form documentation in `docs/`. Mirror source paths in tests where practical, for example `src/foo/bar.ts` with `tests/foo/bar.test.ts`.

## Build, Test, and Development Commands
No canonical build tooling is checked in yet. When adding tooling, expose the standard contributor entry points through a single interface such as `make` or package scripts.

Examples:
- `npm run dev`: start the local development server.
- `npm test`: run the full automated test suite.
- `npm run lint`: run formatting and lint checks before opening a PR.

If you introduce a new command surface, document it here and in the primary project README.

## Coding Style & Naming Conventions
Use 2-space indentation for JavaScript, TypeScript, JSON, YAML, and Markdown unless a formatter enforces otherwise. Prefer descriptive file names and keep naming consistent:
- `kebab-case` for files and directories
- `camelCase` for variables and functions
- `PascalCase` for classes, React components, and types

Adopt automated formatting early. If you add ESLint, Prettier, Ruff, or similar tools, wire them into the default lint command and keep configs committed.

## Testing Guidelines
Add tests alongside each new feature or bug fix. Name test files `*.test.*` or `*.spec.*` and keep them under `tests/` or next to the module if the chosen framework favors co-location. Cover happy paths, regressions, and edge cases. Do not merge substantial behavior changes without automated tests.

## Commit & Pull Request Guidelines
The repository does not yet show an established commit history, so use short imperative commit subjects, for example `Add initial API client`. Keep commits focused and avoid mixing refactors with behavior changes. PRs should include a concise summary, testing notes, linked issues when applicable, and screenshots or sample output for user-visible changes.

## Agent-Specific Instructions
For audits, prioritize correctness, regressions, stale docs, dead code, dependency health, and test gaps. Unattended audits must not modify source files, create issues, commit, or push unless explicitly requested. Always include file paths and concrete evidence with findings.

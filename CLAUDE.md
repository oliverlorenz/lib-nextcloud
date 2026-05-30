# CLAUDE.md

TypeScript library for the Nextcloud API. Covers files (WebDAV + OCS sharing), calendar (iCal), contacts (CardDAV), tags, talk (chat/polls), and the Polls app. Published as `@oliverlorenz/lib-nextcloud` to the GitHub npm registry.

## Commands

```bash
npm test              # build + jest with coverage (also runs on pre-commit)
npm run test:watch    # jest watch mode with HTML coverage
npm run build         # tsc compile → dist/
npm run lint:eslint   # ESLint (also runs on pre-push)
npm run lint:prettier # Prettier format check (also runs on pre-push)
npm run lint:types    # tsc --noEmit + tsc-strict plugin
npm run lint:knip     # knip — unused exports, files, dependencies
npm run lint:md       # markdownlint — markdown syntax in all *.md files
npm run lint:readme   # check README.md has required sections (Installation, Usage)
npm run lint:links    # check all links in README.md are reachable (local only, not in CI)
npm run lint:publint  # publint — package.json exports/main/types correctly configured
npm run lint:attw     # are-the-types-wrong — TypeScript types correctly exported (needs dist/)
npm run check:all     # run all git hooks locally
```

Git hooks: pre-commit runs `test`; pre-push runs `lint:eslint && lint:prettier && test`.

**Before every commit:** run `npm run lint:eslint && npm run lint:prettier` and fix all issues first. The pre-push hook will catch failures anyway, but fixing them before commit avoids a broken commit history.

## Release & versioning

Releases are fully automated via `semantic-release`. No manual steps required after merging.

**The PR title is the release signal.** Because all PRs are squash-merged, the PR title becomes the commit message on `main`. `semantic-release` reads these commits to determine the version bump, generate `CHANGELOG.md`, create the GitHub Release, and publish to GitHub Packages.

| PR title prefix | Version bump | In release notes |
|---|---|---|
| `feat: …` | minor (1.**x**.0) | ✅ Features |
| `fix: …` | patch (1.x.**x**) | ✅ Bug Fixes |
| `perf: …` / `revert: …` | patch (1.x.**x**) | ✅ |
| `feat!: …` or `BREAKING CHANGE:` in body | major (**x**.0.0) | ✅ Breaking |
| `refactor: …` / `docs: …` / `chore: …` / `ci: …` / `test: …` / `build: …` | no release | — |

**When writing PR titles:**

- Use imperative, lowercase: `feat: add contact search` not `feat: Added contact search`
- Scope is optional: `feat(contacts): add search` is fine
- Breaking change via `!` suffix: `feat!: change constructor signature`
- For breaking changes, also fill in the "Breaking changes" section of the PR template with migration instructions — this text ends up in the release notes

**Do not:**

- Create `chore(release): …` commits manually — those are written back by `semantic-release`
- Bump the version in `package.json` manually — `semantic-release` owns the version
- Edit `CHANGELOG.md` manually — it is auto-generated

## Domain structure (DDD-inspired)

Each domain lives in its own folder and is self-contained:

```text
src/
  calendar/      NextcloudCalendarService + index.ts
  contacts/      NextcloudContact (type), NextcloudContactMapper, NextcloudContactService + index.ts
  files/         NextcloudFileService + index.ts
  poll/          NextcloudPollService, NextcloudPollTypes (enums/types) + index.ts
  shared/        NextcloudHeaderService + index.ts   ← shared kernel
  tags/          NextcloudTagService + index.ts
  talk/          NextcloudTalkService + index.ts
  index.ts       re-exports every domain barrel
```

Every domain folder exposes a barrel `index.ts` that re-exports all public symbols. Imports between domains must go through the barrel, never directly into another domain's files.

## Naming conventions

All public symbols are prefixed with `Nextcloud`:

- `NextcloudXxxService` — service class
- `NextcloudXxx` — domain model type (plain TypeScript `type`, never a class)
- `NextcloudXxxMapper` — maps external data structures to domain model types
- `NextcloudXxxTypes.ts` — enums and configuration types for a domain

## Patterns

### Service

Every service has:

1. A `static create(ncBasePath, ncUsername, ncAppPassword)` factory for standalone use
2. A constructor that accepts `NextcloudHeaderService` for framework DI (e.g. NestJS)
3. All methods are `public` with explicit return types

```ts
export class NextcloudFooService {
  public static create(ncBasePath: string, ncUsername: string, ncAppPassword: string): NextcloudFooService {
    return new NextcloudFooService(ncBasePath, ncUsername, ncAppPassword, new NextcloudHeaderService());
  }

  constructor(
    private ncBasePath: string,
    private ncUsername: string,
    private ncAppPassword: string,
    private nextcloudCommonService: NextcloudHeaderService,
  ) {}
}
```

### Domain model

Plain TypeScript `type`, no classes:

```ts
export type NextcloudFoo = {
  id: string;
  name: string;
  optional?: Date;
};
```

### Mapper

A class with a single public `mapFoo(raw: ExternalType): NextcloudFoo` method. One mapper per domain model.

### Shared kernel

`NextcloudHeaderService` (in `shared/`) is the only cross-cutting class. It builds the three header variants used across domains:

- `getHeaders()` — Basic Auth only
- `getJsonResponseHeaders()` — Basic Auth + JSON content/accept
- `getOCSHeaders()` — JSON headers + `OCS-APIRequest: true` (for OCS REST endpoints)

## Two API styles

| Style | Used for | Auth header |
|---|---|---|
| WebDAV (via `webdav` library) | File up/download, directory ops, CardDAV contacts, CalDAV calendars | AuthType.Password passed to `createClient` |
| OCS REST (native `fetch`) | Sharing, tags, talk, polls | `getOCSHeaders()` from `NextcloudHeaderService` |

WebDAV client in `NextcloudFileService` is lazily initialized and cached on first access.

## TypeScript rules

Strict mode is fully enabled. The ESLint config adds:

- `@typescript-eslint/explicit-function-return-type: error` — every function needs an explicit return type
- `@typescript-eslint/explicit-member-accessibility: error` — every class member needs `public`/`private`/`protected` (constructors excluded)
- `@typescript-eslint/no-explicit-any: error` — no `any` types
- `@typescript-eslint/no-non-null-assertion: error` — no `!` operator (disabled in `*.test.ts`)
- `@typescript-eslint/no-floating-promises: error` — all promises must be awaited or explicitly handled
- `@typescript-eslint/no-unused-vars: error` — underscore prefix `_foo` exempts from the rule
- `@typescript-eslint/consistent-type-imports: error` — type-only imports must use `import type`
- `@typescript-eslint/strict-boolean-expressions: error` — no implicit boolean coercions
- `@typescript-eslint/prefer-nullish-coalescing: error` — use `??` instead of `||` for null/undefined fallbacks
- `@typescript-eslint/no-unnecessary-condition: error` — no always-true or always-false conditions
- `@typescript-eslint/member-ordering: error` — consistent ordering of class members
- `@typescript-eslint/require-await: error` — `async` functions must contain at least one `await`
- `@typescript-eslint/no-misused-promises: error` — no Promises in `forEach` / `if` conditions
- `@typescript-eslint/switch-exhaustiveness-check: error` — switch over union types must cover all cases
- `no-only-tests/no-only-tests: error` — no `test.only` or `describe.only` in test files
- No comments describing what code does — prefer self-documenting names

## Testing

- Test files colocated with source: `NextcloudFooService.test.ts` next to `NextcloudFooService.ts`
- Use `jest-mock-extended` (`mock<T>()`) to mock dependencies
- No mocking of `NextcloudHeaderService` — inject it directly in tests
- `jest.spyOn(global, 'fetch')` is the standard way to mock HTTP calls
- Coverage threshold: 80% branches, functions, lines, statements
- No `test.only` or `describe.only` — caught by ESLint

## Auth

Always use Nextcloud App Passwords, never the main account password. The credentials are passed into every service constructor and forwarded to `NextcloudHeaderService` per call — they are not stored in `NextcloudHeaderService` itself.

## Installing

```bash
npm install   # no flags needed
```

`eslint-plugin-import` was removed — it was never referenced in `eslint.config.mjs` and its peer dep constraint blocks installation with ESLint 10.

## README

Every code change that adds, removes, or alters public API behaviour must also update `README.md`. This includes new methods, changed signatures, new types, and changed constructor parameters. The README is the primary documentation for library consumers.

## Workflow

**Every change starts with a GitHub Issue.**
Before any implementation begins, the requirements must be defined and captured in a GitHub Issue. Do not write any code, create branches, or open PRs until an Issue exists and the requirements are clear. Refuse to proceed without one.

**All changes land via Pull Request.**
No direct commits to `main`. Every change goes through a feature branch and a PR.

**At the start of every session:**
Run `git branch` and `git status` to confirm you are on `main` and the working tree is clean before starting new work.

## Requirements

- Node >= 22.0.0
- Publish target: `https://npm.pkg.github.com`

# CLAUDE.md

TypeScript library for the Nextcloud API. Covers files (WebDAV + OCS sharing), calendar (iCal), contacts (CardDAV), tags, talk (chat/polls), and the Polls app. Published as `@oliverlorenz/lib-nextcloud` to the GitHub npm registry.

## Commands

```bash
npm test              # build + jest with coverage (also runs on pre-commit)
npm run test:watch    # jest watch mode with HTML coverage
npm run build         # tsc compile → dist/
npm run lint:eslint   # ESLint (also runs on pre-push)
npm run lint:prettier # Prettier format check (also runs on pre-push)
npm run lint:types    # tsc --noEmit + tsc-strict plugin (all 26 files must pass)
```

Git hooks: pre-commit runs `test`; pre-push runs `lint:eslint && lint:prettier && test`.

**Before every commit:** run `npm run lint:eslint && npm run lint:prettier` and fix all issues first. The pre-push hook will catch failures anyway, but fixing them before commit avoids a broken commit history.

## Domain structure (DDD-inspired)

Each domain lives in its own folder and is self-contained:

```
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
- `@typescript-eslint/no-non-null-assertion: error` — no `!` operator (disabled in `*.spec.ts`)
- `@typescript-eslint/no-floating-promises: error` — all promises must be awaited or explicitly handled
- `@typescript-eslint/no-unused-vars: error` — underscore prefix `_foo` exempts from the rule
- No comments describing what code does — prefer self-documenting names

## Testing

- Test files colocated with source: `NextcloudFooService.test.ts` next to `NextcloudFooService.ts`
- No mocking of `NextcloudHeaderService` — inject it directly in tests
- `jest.spyOn(global, 'fetch')` is the standard way to mock HTTP calls
- Coverage is collected but no thresholds are enforced

## Auth

Always use Nextcloud App Passwords, never the main account password. The credentials are passed into every service constructor and forwarded to `NextcloudHeaderService` per call — they are not stored in `NextcloudHeaderService` itself.

## Installing

```bash
npm install   # no flags needed
```

`eslint-plugin-import` was removed — it was never referenced in `eslint.config.mjs` and its peer dep constraint blocks installation with ESLint 10.

## README

Every code change that adds, removes, or alters public API behaviour must also update `README.md`. This includes new methods, changed signatures, new types, and changed constructor parameters. The README is the primary documentation for library consumers.

## Requirements

- Node >= 22.0.0
- Publish target: `https://npm.pkg.github.com`

## What changed and why

<!-- Briefly describe what this PR does and the motivation behind it. Link the related issue. -->

Closes #

## Breaking changes

<!-- Required when the PR title uses ! (e.g. feat!:) or the body contains BREAKING CHANGE:.
     Describe exactly what breaks and how consumers need to migrate. -->

N/A

## Checklist

### Code quality
- [ ] All public symbols are prefixed with `Nextcloud` and follow the naming conventions in CLAUDE.md
- [ ] Every function has an explicit return type (`explicit-function-return-type`)
- [ ] Every class member has an explicit access modifier (`explicit-member-accessibility`)
- [ ] No non-null assertions (`!`) outside of `*.spec.ts` files
- [ ] No floating promises (every `Promise` is awaited or explicitly handled)

### Tests
- [ ] New functionality is covered by unit tests (colocated `*.test.ts`)
- [ ] `npm test` passes locally (build + jest + coverage)

### Linting
- [ ] `npm run lint:eslint` passes
- [ ] `npm run lint:prettier` passes
- [ ] `npm run lint:types` passes

### Domain rules
- [ ] New service follows the `static create(...)` factory + DI-constructor pattern
- [ ] Cross-domain imports go through barrel `index.ts`, never directly into another domain's files
- [ ] No new cross-cutting dependencies outside of `shared/`

### Release
- [ ] PR title follows Conventional Commits: `type: short description`
  - `feat:` → minor release · `fix:` → patch · `feat!:` → major (breaking)
  - `chore:` / `ci:` / `test:` / `build:` → no release
- [ ] README.md updated if public API changed

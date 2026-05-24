## What changed and why

<!-- Briefly describe what this PR does and the motivation behind it. Link the related issue. -->

Closes #

## Type of change

<!-- Add the matching label to this PR (required for release-drafter). -->

- [ ] `type: breaking` — breaking API change
- [ ] `type: feature` — new functionality
- [ ] `type: bug` — bug fix
- [ ] `type: maintenance` — refactor, chore, build
- [ ] `type: docs` — documentation only
- [ ] `type: dependencies` — dependency updates
- [ ] `type: security` — security fix

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
- [ ] `npm run lint:types` passes (all 26 files must pass strict type check)

### Domain rules
- [ ] New service follows the `static create(...)` factory + DI-constructor pattern
- [ ] Cross-domain imports go through barrel `index.ts`, never directly into another domain's files
- [ ] No new cross-cutting dependencies outside of `shared/`

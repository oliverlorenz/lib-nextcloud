## [1.1.3](https://github.com/oliverlorenz/lib-nextcloud/compare/v1.1.2...v1.1.3) (2026-05-24)

### Bug Fixes

* **contacts:** remove grouped TEL/EMAIL properties (e.g. ITEM1.TEL) on update ([#122](https://github.com/oliverlorenz/lib-nextcloud/issues/122)) ([0de86e4](https://github.com/oliverlorenz/lib-nextcloud/commit/0de86e4f20bab64837fbc2d7d580b0106c0acd6c)), closes [#121](https://github.com/oliverlorenz/lib-nextcloud/issues/121)

## [1.1.2](https://github.com/oliverlorenz/lib-nextcloud/compare/v1.1.1...v1.1.2) (2026-05-24)

### Bug Fixes

* **contacts:** decode XML entities before trim to preserve CRLF line endings ([#120](https://github.com/oliverlorenz/lib-nextcloud/issues/120)) ([c5af983](https://github.com/oliverlorenz/lib-nextcloud/commit/c5af983f3853e3e2dd5b93b38cb0856541708b62)), closes [#13](https://github.com/oliverlorenz/lib-nextcloud/issues/13) [#13](https://github.com/oliverlorenz/lib-nextcloud/issues/13) [#119](https://github.com/oliverlorenz/lib-nextcloud/issues/119) [#13](https://github.com/oliverlorenz/lib-nextcloud/issues/13)

## [1.1.1](https://github.com/oliverlorenz/lib-nextcloud/compare/v1.1.0...v1.1.1) (2026-05-24)

### Bug Fixes

* **contacts:** use filename as canonical UID in getContacts ([#118](https://github.com/oliverlorenz/lib-nextcloud/issues/118)) ([9991172](https://github.com/oliverlorenz/lib-nextcloud/commit/99911727cc875e9369349115556499c9e7af3d57)), closes [#117](https://github.com/oliverlorenz/lib-nextcloud/issues/117)

## [1.1.0](https://github.com/oliverlorenz/lib-nextcloud/compare/v1.0.9...v1.1.0) (2026-05-24)

### Features

* **contacts:** add organization field to NextcloudContact ([#116](https://github.com/oliverlorenz/lib-nextcloud/issues/116)) ([bca2c69](https://github.com/oliverlorenz/lib-nextcloud/commit/bca2c69a884f7d461ed4d016dd53283ceacf2bd9)), closes [#115](https://github.com/oliverlorenz/lib-nextcloud/issues/115)

## [1.0.2](https://github.com/oliverlorenz/lib-nextcloud/compare/v1.0.1...v1.0.2) (2026-05-24)

### Bug Fixes

* decode XML entities in vCard text from CardDAV REPORT responses ([#114](https://github.com/oliverlorenz/lib-nextcloud/issues/114)) ([f626771](https://github.com/oliverlorenz/lib-nextcloud/commit/f626771ac9da13a02436137d2b9493ef90edcb7d)), closes [#13](https://github.com/oliverlorenz/lib-nextcloud/issues/13) [#113](https://github.com/oliverlorenz/lib-nextcloud/issues/113)

## [1.0.1](https://github.com/oliverlorenz/lib-nextcloud/compare/v1.0.0...v1.0.1) (2026-05-24)

### Documentation

* document mandatory Issue-first and PR-only workflow ([#108](https://github.com/oliverlorenz/lib-nextcloud/issues/108)) ([0a58c22](https://github.com/oliverlorenz/lib-nextcloud/commit/0a58c22ccb923c8a4e6d93561fc9807bace9b09f))

## 1.0.0 (2026-05-24)

### Features

* **contacts:** add updateContact method for individual field updates ([2490d70](https://github.com/oliverlorenz/lib-nextcloud/commit/2490d706160ff64872a7bcb2615dfc7cbb1ae0e8)), closes [#100](https://github.com/oliverlorenz/lib-nextcloud/issues/100)
* **contacts:** replace bulk export with batched CardDAV multiget ([f28a8a6](https://github.com/oliverlorenz/lib-nextcloud/commit/f28a8a6f94df5441d04f765f4bfac80b1f381261)), closes [#98](https://github.com/oliverlorenz/lib-nextcloud/issues/98)

### Bug Fixes

* correct calendar name parameter ([ee34305](https://github.com/oliverlorenz/lib-nextcloud/commit/ee3430511d890681382750769e4c68c38da49bfa))
* replace full address book download with CardDAV REPORT in getContactByPhoneNumber ([36afe65](https://github.com/oliverlorenz/lib-nextcloud/commit/36afe65ca206f2e6a9e0775edc68a264ead4ad98)), closes [#98](https://github.com/oliverlorenz/lib-nextcloud/issues/98)
* resolve lint errors from pre-push hook ([cbf5d81](https://github.com/oliverlorenz/lib-nextcloud/commit/cbf5d81198d96ca1203a655839134e8566521e04))

### Code Refactoring

* restructure to DDD, add tests, and improve code quality ([74a0805](https://github.com/oliverlorenz/lib-nextcloud/commit/74a08052376aad61f06191e5b4a45e0f7e97f6f4))

### Documentation

* add CLAUDE.md with architecture and conventions ([69eb075](https://github.com/oliverlorenz/lib-nextcloud/commit/69eb07599cd369fcc130f47a84739ad1b3ed5212))
* document Conventional Commits release workflow in PR template, README, CLAUDE.md ([5c31e52](https://github.com/oliverlorenz/lib-nextcloud/commit/5c31e523dd61a0acbe3af029f664293991aab448))
* update README with updateContact method and uid field ([197c59e](https://github.com/oliverlorenz/lib-nextcloud/commit/197c59ee934cef92a6e1356bbce9b930004c41b8))

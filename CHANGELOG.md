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

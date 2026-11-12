# Current work

- Phase: stable-upgrade experiment complete; Next 16.4.6 does not fix the no-JavaScript resource 404 defect.
- Branch: `test/resource-404-stable-upgrade`; base `5b2d491` on main `a3146a1`.
- Plan/evidence: [resource 404 framework fix](docs/superpowers/plans/2026-11-11-resource-404-framework-fix.md).
- Both 16.4.2 and 16.4.6: production build and two hydrated recovery cases pass; two no-JavaScript recovery cases fail.
- Initial broader baseline also hit local Search temporarily unavailable; no full search-suite pass claimed.
- Original dependency versions and expected-failure test restored. Only experiment documentation retained; no backport, PR, merge, deployment or working database reset.

# Current work

- Phase: owner-approved deferral of the no-JavaScript matched-resource 404 framework defect.
- Branch: `docs/defer-resource-404`, based on main `a3146a1` plus planning/experiment documentation.
- Decision and evidence: [accepted deferral](docs/superpowers/plans/2026-11-11-resource-404-framework-fix.md#accepted-deferral--owner-decision-2026-11-11).
- This specific limitation no longer blocks release. Other launch gates remain required; the defect is not fixed.
- Keep original dependencies and the narrowly scoped expected-failure regression. Revisit on Next upgrades, a compatible upstream fix or pre-release review.
- No framework patch, routing workaround, application behavior, database or deployment change. Separate local search-control failure remains uninvestigated.

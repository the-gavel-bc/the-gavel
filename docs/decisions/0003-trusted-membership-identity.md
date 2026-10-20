# 0003: Enforce trusted identity alongside membership

- Status: Accepted
- Date: 2026-10-18
- Related requirements: [Security and permissions](../security-and-permissions.md), [API contracts](../api-contracts.md)
- Supersedes / superseded by: None

## Context

The approved boundary requires a confirmed Boston College Google identity and active membership. Server checks alone cannot constrain direct Data API requests. Public profile readers also must not receive private authentication links just to resolve their own dashboard profile.

## Decision

Use a parameterless `current_profile()` accessor returning only the caller's ID/display name. Enforce trusted identity on profile writes, administrator privileges, and that accessor through `private.has_eligible_identity()`, which reads confirmed email and trusted provider metadata from Auth. Fixed-search-path security-definer functions expose predicates or narrow public fields only; application requests use publishable credentials and user sessions, without elevated keys.

## Alternatives considered

- Server checks alone: leaves direct database permissions inconsistent.
- Grant authentication-link columns to every authenticated profile reader: exposes private identity associations.
- Caller-editable user metadata: cannot establish trusted provider eligibility.

## Consequences

Public profile display fields remain publicly readable, while edit/admin privileges require the approved identity and active membership. Auth schema fields become a narrow read dependency requiring regression coverage on Supabase upgrades. Infrastructure Auth-user deletion semantics remain unresolved; application member deactivation does not require deleting Auth identities.

## Validation

pgTAP covers ineligible provider, unconfirmed email, and out-of-domain active authors/administrators, plus eligible positive cases and ownership denials. Server and JavaScript-disabled browser tests independently verify dashboard eligibility. See [testing](../testing.md) for commands and current evidence.

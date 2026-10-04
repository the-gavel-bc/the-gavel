# API contracts

Status: Draft — no endpoints are defined yet.

## Shared conventions

- API style and base URL by environment: [TODO]
- Versioning: [TODO]
- Authentication and authorization: [TODO: link to security-and-permissions.md]
- Content types: [TODO]
- Date/time, identifier, and null conventions: [TODO]
- Pagination, filtering, and sorting: [TODO]
- Error response structure: [TODO]
- Rate limits and retry behavior: [TODO]

## Schema source of truth

[TODO: choose where authoritative schemas live. For REST, consider an OpenAPI specification. Link to schemas rather than maintaining conflicting copies.]

## Endpoint / operation template

Copy this section for each operation.

### [TODO: method and path, or operation name]

- Status: Proposed / Approved / Implemented [TODO: select]
- Purpose: [TODO]
- Allowed roles and ownership rules: [TODO]
- Headers and path/query parameters: [TODO: types, required fields, defaults]
- Request schema: [TODO: types, validation, optional fields]
- Success response schema and status: [TODO]
- Error responses and status codes: [TODO]
- Side effects and idempotency: [TODO]
- Request and response examples: [TODO: synthetic data only]
- Compatibility considerations: [TODO]
- Contract validation: [TODO: how implementation is checked against this contract]

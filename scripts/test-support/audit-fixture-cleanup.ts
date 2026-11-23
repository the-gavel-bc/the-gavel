// Only use under the disposable database guards in concurrency and browser tests.
export function clearAuditFixtureRows(predicate: string) {
  return `do $fixture_audit_cleanup$
    begin
      alter table public.audit_events disable trigger audit_events_guard_delete;
      delete from public.audit_events where ${predicate};
      alter table public.audit_events enable trigger audit_events_guard_delete;
    end;
  $fixture_audit_cleanup$;`;
}

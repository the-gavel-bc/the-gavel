import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";

const workdir = process.env.SEARCH_CHECK_WORKDIR;
assert.match(
  workdir ?? "",
  /^\/(private\/)?tmp\/gavel-task17-api$/,
  "Use the disposable Task 17 API project",
);
const container = "supabase_db_gavel-task17-api";
const local = JSON.parse(
  execFileSync(
    "pnpm",
    ["exec", "supabase", "status", "--workdir", workdir, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
assert.equal(local.API_URL, "http://127.0.0.1:57321");
assert.ok(local.ANON_KEY && local.JWT_SECRET);
const sql = (text) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const state = () =>
  JSON.parse(
    sql(
      "select json_build_object('value',last_value,'called',is_called) from private.public_search_budget;",
    ),
  );
const initial = state();
const nowBase = () =>
  Number(
    sql("select floor(extract(epoch from clock_timestamp())/60)::bigint*128;"),
  );
const reset = () =>
  sql(`select setval('private.public_search_budget',${nowBase()},true);`);
const token = (role) => {
  if (role === "anon") return local.ANON_KEY;
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", aud: "authenticated", sub: "00000000-0000-0000-0000-000000000002", iat: now, exp: now + 3600 })}`;
  return `${unsigned}.${createHmac("sha256", local.JWT_SECRET).update(unsigned).digest("base64url")}`;
};
async function rpc(body, role = "anon", options = {}) {
  const response = await fetch(
    `${local.API_URL}/rest/v1/rpc/search_public_articles`,
    {
      method: "POST",
      headers: {
        apikey: local.ANON_KEY,
        Authorization: `Bearer ${token(role)}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.signal ?? AbortSignal.timeout(5000),
    },
  );
  return { response, value: await response.json() };
}
async function lock(sqlLock, seconds = 6) {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (b) => {
    stderr += b;
  });
  const done = new Promise((resolve, reject) => {
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(stderr)),
    );
    child.on("error", reject);
  });
  child.stdin.end(
    `set application_name='gavel-task17-proof';begin;${sqlLock};select pg_sleep(${seconds});rollback;`,
  );
  for (let i = 0; i < 40; i++) {
    if (
      sql(
        "select count(*) from pg_stat_activity where application_name='gavel-task17-proof' and wait_event='PgSleep';",
      ) === "1"
    )
      return { done };
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Lock fixture did not become ready");
}
try {
  reset();
  const smoke = await rpc({ p_query: "word" });
  assert.equal(smoke.value.kind, "ok", JSON.stringify(smoke.value));
  assert.match(smoke.response.headers.get("cache-control") ?? "", /no-store/);
  console.log("Direct anonymous POST returns a safe no-store search result");
  // Invalid inputs, transport tricks and forged identity/budget claims cannot
  // obtain a successful search or alter the server-owned admission parameters.
  reset();
  for (const body of [
    { p_query: "!!!" },
    { p_query: "word", p_limit: 25 },
    { p_query: "word", p_cursor: { version: 1 } },
    { p_query: "word", p_budget: 10000 },
  ]) {
    const result = await rpc(body);
    assert.notEqual(result.value.kind, "ok");
  }
  for (const method of ["GET", "HEAD"]) {
    const response = await fetch(
      `${local.API_URL}/rest/v1/rpc/search_public_articles?p_query=word`,
      {
        method,
        headers: {
          apikey: local.ANON_KEY,
          Authorization: `Bearer ${local.ANON_KEY}`,
        },
      },
    );
    assert.equal(response.status, 200);
    if (method === "GET")
      assert.equal(
        (await response.json()).kind,
        "invalid",
        "GET cannot produce successful search",
      );
  }
  assert.equal(state().value % 128, 0);
  // Start from a full expired window. Concurrent anonymous/authenticated callers
  // must agree on one rollover and one shared cap, regardless of forged headers.
  sql(
    "select pg_sleep(case when extract(second from clock_timestamp())>40 then 61-extract(second from clock_timestamp()) else 0 end);",
  );
  sql(
    `select setval('private.public_search_budget',${nowBase() - 128 + 120},true);`,
  );
  const outcomes = [];
  for (let batch = 0; batch < 20; batch++) {
    outcomes.push(
      ...(await Promise.all(
        Array.from({ length: 8 }, (_, n) =>
          rpc({ p_query: "zzabsentneedle" }, n % 2 ? "authenticated" : "anon", {
            headers: {
              "X-Forwarded-For": `192.0.2.${batch * 8 + n}`,
              "X-Search-Budget": "999999",
              "request.path": "/rpc/another_rpc",
            },
          }),
        ),
      )),
    );
  }
  const successful = outcomes.filter((x) => x.value.kind === "ok").length;
  const limited = outcomes.filter(
    (x) => x.value.kind === "rate_limited",
  ).length;
  const deadlineFailures = outcomes.filter(
    (x) => x.response.status === 503 && x.value.code === "search_unavailable",
  ).length;
  assert.equal(successful + limited + deadlineFailures, 160);
  assert.ok(successful <= 120 && limited > 0);
  assert.equal((await rpc({ p_query: "word" })).value.kind, "rate_limited");
  assert.ok(
    outcomes.every((x) =>
      /no-store/.test(x.response.headers.get("cache-control") ?? ""),
    ),
  );
  assert.equal(state().value % 128, 120);
  console.log(
    `160 mixed-role attempts: ${successful} successful, ${limited} limited, ${deadlineFailures} deadline failures; exactly 120 tickets, one rollover, forged headers ignored`,
  );
  for (const role of ["anon", "authenticated"]) {
    reset();
    // Start the lock fixture without awaiting its lifetime: RPC must time out
    // while this backend still holds the admission lock.
    const held = await lock("select pg_advisory_xact_lock(1617,1)");
    const start = performance.now();
    const result = await rpc({ p_query: "word" }, role);
    const elapsed = performance.now() - start;
    await held.done;
    assert.equal(result.response.status, 503);
    assert.equal(result.value.code, "search_unavailable");
    assert.match(
      result.response.headers.get("cache-control") ?? "",
      /no-store/,
    );
    assert.ok(
      elapsed >= 1500 && elapsed < 2800,
      `Expected actual hoisted 2s deadline, saw ${elapsed}ms`,
    );
    assert.equal(
      state().value % 128,
      0,
      "Waiting before admission must not spend a ticket",
    );
    console.log(
      `${role}: actual RPC deadline ${Math.round(elapsed)}ms; waiting cancellation spends no ticket`,
    );
  } // Hold a source table after admission, then cancel the actual server backend.
  // The nontransactional ticket must survive even though the RPC rolls back.
  reset();
  const held = await lock(
    "lock table public.articles in access exclusive mode",
  );
  const pending = rpc({ p_query: "word" });
  let pid = "";
  for (let i = 0; i < 30; i++) {
    pid = sql(
      "select pid from pg_stat_activity where usename='authenticator' and wait_event_type='Lock' and query like '%search_public_articles%' limit 1;",
    );
    if (pid && state().value % 128 === 1) break;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.match(pid, /^\d+$/, "Admitted RPC must wait on source table");
  assert.equal(state().value % 128, 1);
  sql(`select pg_cancel_backend(${pid});`);
  const cancelled = await pending;
  assert.equal(cancelled.response.status, 503);
  assert.equal(cancelled.value.code, "search_unavailable");
  assert.equal(
    state().value % 128,
    1,
    "Server cancellation cannot refund admission",
  );
  await held.done;
  assert.equal(
    (await rpc({ p_query: "word" })).value.kind,
    "ok",
    "Cancellation releases admission lock",
  );
  console.log(
    "Explicit backend cancellation returns safe 503, retains ticket and releases admission lock",
  );
  reset();
  const blocked = await lock(
    "lock table public.articles in access exclusive mode",
  );
  const controller = new AbortController();
  const aborted = rpc({ p_query: "word" }, "anon", {
    signal: controller.signal,
  }).catch((error) => error);
  for (let i = 0; i < 30 && state().value % 128 !== 1; i++)
    await new Promise((r) => setTimeout(r, 30));
  assert.equal(state().value % 128, 1);
  const started = performance.now();
  controller.abort();
  await aborted;
  // Client abort is not trusted to cancel SQL. The database deadline must still
  // release its lock without the client waiting for or consuming the response.
  while (performance.now() - started < 2800) {
    if (
      sql(
        "select count(*) from pg_stat_activity where usename='authenticator' and wait_event_type='Lock' and query like '%search_public_articles%';",
      ) === "0"
    )
      break;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(
    sql(
      "select count(*) from pg_stat_activity where usename='authenticator' and wait_event_type='Lock' and query like '%search_public_articles%';",
    ),
    "0",
  );
  assert.equal(state().value % 128, 1, "Response loss cannot refund admission");
  await blocked.done;
  assert.equal((await rpc({ p_query: "word" })).value.kind, "ok");
  console.log(
    "Client abort retains ticket; database deadline releases work and next request succeeds",
  );
} finally {
  sql(
    `select setval('private.public_search_budget',${initial.value},${initial.called});`,
  );
}

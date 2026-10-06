/* Dashboard/project CRUD on the v2 routes: list, create, rename, archive, duplicate, delete, isolation, rate limit.
   Needs the frontend dev server on :3000 (API_PORT to change). Self-cleaning. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { createClient } = createRequire(join(root, "package.json"))("@supabase/supabase-js");
const env = Object.fromEntries(readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const BASE = process.env.APP_URL ? `${process.env.APP_URL}/api/v1` : `http://localhost:${process.env.API_PORT ?? "3000"}/api/v1`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + String(x).slice(0, 300)}`); };
const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const users = [];
const mk = async (tag) => {
  const email = `e2e-proj-${tag}-${Date.now()}@capseasy.test`, password = `Pw-${Date.now()}-x!`;
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(data.user.id);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  return { id: data.user.id, token: (await anon.auth.signInWithPassword({ email, password })).data.session.access_token };
};

try {
  const A = await mk("a"), B = await mk("b");
  check("empty list", (await call("GET", "/projects", A.token)).data?.length === 0);
  const c = await call("POST", "/projects", A.token, { title: "  My video  " });
  check("create (trimmed title, CREATED status)", c.status === 201 && c.data.title === "My video" && c.data.status === "CREATED", JSON.stringify(c));
  check("create rejects empty title", (await call("POST", "/projects", A.token, { title: "  " })).status === 422);
  const id = c.data.id;
  await admin.from("projects").update({ status: "READY" }).eq("id", id);
  const l = await call("GET", "/projects", A.token);
  check("list normalizes READY -> COMPLETED", l.data?.[0]?.status === "COMPLETED" && l.meta?.total === 1, JSON.stringify(l).slice(0, 200));
  const r = await call("PATCH", `/projects/${id}`, A.token, { title: "Renamed", owner_id: B.id, status: "FAILED" });
  const { data: row } = await admin.from("projects").select("owner_id, title, status").eq("id", id).single();
  check("rename works; owner_id/status ignored", r.status === 200 && row.title === "Renamed" && row.owner_id === A.id && row.status === "READY", JSON.stringify(row));
  check("PATCH validates style_json shape", (await call("PATCH", `/projects/${id}`, A.token, { style_json: { fontSize: "huge" } })).status === 422);
  check("B cannot read A's project", (await call("GET", `/projects/${id}`, B.token)).status === 404);
  check("B cannot rename A's project", (await call("PATCH", `/projects/${id}`, B.token, { title: "x" })).status === 404);
  check("B cannot delete A's project", (await call("DELETE", `/projects/${id}`, B.token)).status === 404);
  check("B's list is empty", (await call("GET", "/projects", B.token)).data?.length === 0);

  await admin.from("caption_documents").insert({ project_id: id, owner_id: A.id, doc: { version: 2, words: [{ id: "w1", text: "hi", startMs: 0, endMs: 300 }] } });
  const d = await call("POST", `/projects/${id}/duplicate`, A.token);
  const { data: dupDoc } = await admin.from("caption_documents").select("doc").eq("project_id", d.data?.id).maybeSingle();
  check("duplicate copies captions", d.status === 201 && d.data.title === "Renamed (copy)" && dupDoc?.doc?.words?.[0]?.text === "hi", JSON.stringify(d).slice(0, 200));

  check("archive hides from default list", (await call("POST", `/projects/${id}/archive`, A.token)).status === 200 && (await call("GET", "/projects", A.token)).data.length === 1);
  check("include_archived shows it", (await call("GET", "/projects?include_archived=true", A.token)).data.length === 2);
  await call("POST", `/projects/${id}/unarchive`, A.token);
  await admin.from("jobs").insert({ project_id: id, owner_id: A.id, kind: "transcribe", job_type: "transcribe", status: "queued", payload: {} });
  check("delete", (await call("DELETE", `/projects/${id}`, A.token)).status === 200);
  const { data: j } = await admin.from("jobs").select("status").eq("project_id", id).maybeSingle();
  check("delete removes (or cancels) queued jobs", !j || j.status === "cancelled", JSON.stringify(j));
  check("deleted project is gone", (await call("GET", `/projects/${id}`, A.token)).status === 404);

  let limited = false;
  for (let i = 0; i < 32 && !limited; i++) limited = (await call("POST", "/projects", B.token, { title: `p${i}` })).status === 429;
  check("create is rate limited (30/hour)", limited);
} catch (e) {
  fail++; console.log("FATAL", e);
} finally {
  for (const uid of users) {
    const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
    const pids = (projs ?? []).map((p) => p.id);
    if (pids.length) { for (const t of ["caption_documents", "jobs", "videos"]) await admin.from(t).delete().in("project_id", pids); await admin.from("projects").delete().in("id", pids); }
    await admin.from("rate_limits").delete().like("key", `%:${uid}`);
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

/* Regression: legacy (pre-v2) projects must open in the new studio.
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
const call = async (method, path, token) => {
  const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

let uid;
try {
  const email = `e2e-legacy-${Date.now()}@capseasy.test`, password = `Pw-${Date.now()}-x!`;
  const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  uid = cu.user.id;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const token = (await anon.auth.signInWithPassword({ email, password })).data.session.access_token;

  // A: legacy project WITH an old-format transcript and a dead legacy job
  const { data: a } = await admin.from("projects").insert({ owner_id: uid, title: "legacy A", status: "COMPLETED" }).select("id").single();
  await admin.from("videos").insert({ project_id: a.id, owner_id: uid, storage_path: `projects/${a.id}/video.mp4`, status: "uploaded" });
  await admin.from("transcripts").insert({ project_id: a.id, owner_id: uid, language: "hi", transcript_json: { words: [
    { text: "naam", start_ms: 0, end_ms: 440, confidence: 0.5, highlighted: false },
    { text: "jyaadaa", start_ms: 440, end_ms: 780, confidence: 0.5, highlighted: true },
    { text: "clients?", start_ms: 780, end_ms: 1300, confidence: 0.5, highlighted: false },
  ] } });
  await admin.from("jobs").insert({ project_id: a.id, owner_id: uid, job_type: "video_metadata_extraction", status: "queued" });

  const sa = await call("GET", `/projects/${a.id}/studio`, token);
  check("legacy project with transcript opens (200)", sa.status === 200, JSON.stringify(sa).slice(0, 200));
  check("old transcript auto-converted into an editable document", sa.data?.document?.doc?.words?.length === 3, JSON.stringify(sa.data?.document));
  check("legacy highlight kept as emphasis", sa.data?.document?.doc?.words?.[1]?.emphasis === "strong");
  check("dead legacy job is ignored (no spinner)", sa.data?.job === null, JSON.stringify(sa.data?.job));
  check("editor state: nothing to transcribe", sa.data?.canTranscribe === false);
  const sa2 = await call("GET", `/projects/${a.id}/studio`, token);
  check("conversion happens once (same revision on reopen)", sa2.data?.document?.revision === sa.data?.document?.revision);

  // B: legacy project with a video but NO transcript (old pipeline failed)
  const { data: b } = await admin.from("projects").insert({ owner_id: uid, title: "legacy B" }).select("id").single();
  const { data: vb } = await admin.from("videos").insert({ project_id: b.id, owner_id: uid, storage_path: `projects/${b.id}/video.mp4`, status: "uploaded" }).select("id").single();
  await admin.from("jobs").insert({ project_id: b.id, owner_id: uid, job_type: "ai_pipeline", status: "failed", error_message: "old failure" });
  const sb = await call("GET", `/projects/${b.id}/studio`, token);
  check("legacy project without captions opens and offers 'Generate captions'", sb.status === 200 && sb.data.canTranscribe === true && sb.data.job === null, JSON.stringify(sb.data).slice(0, 250));
  const t1 = await call("POST", `/projects/${b.id}/transcribe`, token);
  check("Generate captions queues a v2 transcribe job for the latest video", t1.status === 202 && !!t1.data?.jobId, JSON.stringify(t1));
  const { data: job } = await admin.from("jobs").select("kind, status, payload").eq("id", t1.data.jobId).single();
  check("job targets that video", job.kind === "transcribe" && job.payload.videoId === vb.id, JSON.stringify(job));
  const t2 = await call("POST", `/projects/${b.id}/transcribe`, token);
  check("clicking twice does not double-queue", t2.data?.jobId === t1.data.jobId, JSON.stringify(t2));
  const sb2 = await call("GET", `/projects/${b.id}/studio`, token);
  check("studio now shows the running job", sb2.data?.job?.id === t1.data.jobId && sb2.data.canTranscribe === false);
} catch (e) {
  fail++; console.log("FATAL", e);
} finally {
  if (uid) {
    const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
    const pids = (projs ?? []).map((p) => p.id);
    if (pids.length) { for (const t of ["caption_documents", "exports", "jobs", "transcripts", "videos"]) await admin.from(t).delete().in("project_id", pids); await admin.from("projects").delete().in("id", pids); }
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

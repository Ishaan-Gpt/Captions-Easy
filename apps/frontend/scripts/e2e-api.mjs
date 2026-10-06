// End-to-end API test against the live Supabase project + local Next dev server.
// Creates two throwaway users, runs the whole flow, then deletes everything it created.
/* Usage: start the frontend dev server (default port 3000, or set API_PORT), then run:  node apps/frontend/scripts/e2e-api.mjs */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const PORT = process.env.API_PORT ?? "3000";
const BASE = process.env.APP_URL ? `${process.env.APP_URL}/api/v1` : `http://localhost:${PORT}/api/v1`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };
const call = async (method, path, { token, body, raw } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return { status: 204 };
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
};

const stamp = Date.now();
const users = [];
const mkUser = async (tag) => {
  const email = `e2e-${tag}-${stamp}@capseasy.test`, password = `Pw-${stamp}-x!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = anon();
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  users.push(data.user.id);
  return { id: data.user.id, token: s.session.access_token, client: c };
};

const cleanup = async () => {
  for (const uid of users) {
    const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
    const pids = (projs ?? []).map((p) => p.id);
    if (pids.length) {
      await admin.from("exports").delete().in("project_id", pids);
      await admin.from("jobs").delete().in("project_id", pids);
      await admin.from("transcripts").delete().in("project_id", pids);
      await admin.from("videos").delete().in("project_id", pids);
      await admin.from("projects").delete().in("id", pids);
    }
    await admin.from("workers").delete().eq("owner_id", uid);
    await admin.from("device_codes").delete().eq("owner_id", uid);
    await admin.from("usage_events").delete().eq("owner_id", uid);
    const { data: objs } = await admin.storage.from("media").list(uid, { limit: 100 });
    for (const o of objs ?? []) {
      const { data: inner } = await admin.storage.from("media").list(`${uid}/${o.name}`, { limit: 100 });
      for (const sub of inner ?? []) {
        const { data: files } = await admin.storage.from("media").list(`${uid}/${o.name}/${sub.name}`, { limit: 100 });
        const paths = (files ?? []).map((f) => `${uid}/${o.name}/${sub.name}/${f.name}`);
        if (paths.length) await admin.storage.from("media").remove(paths);
      }
    }
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
};

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/health`); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 2000)); }

  const A = await mkUser("a"), B = await mkUser("b");
  check("profile auto-created by trigger", !!(await admin.from("profiles").select("id").eq("id", A.id).maybeSingle()).data);

  // project (direct insert: project CRUD routes are legacy until P7)
  const { data: proj } = await admin.from("projects").insert({ owner_id: A.id, title: "E2E Project", status: "DRAFT" }).select("id").single();
  const pid = proj.id;

  // ---- auth basics
  check("no token -> 401", (await call("GET", `/projects/${pid}/document`)).status === 401);
  check("bad token -> 401", (await call("GET", `/projects/${pid}/document`, { token: "nope" })).status === 401);

  // ---- upload flow
  const badMime = await call("POST", `/projects/${pid}/videos`, { token: A.token, body: { filename: "a.exe", size: 100, mime: "application/x-msdownload" } });
  check("rejects non-video mime (415)", badMime.status === 415, JSON.stringify(badMime));
  const tooBig = await call("POST", `/projects/${pid}/videos`, { token: A.token, body: { filename: "a.mp4", size: 900 * 1048576, mime: "video/mp4" } });
  check("enforces free-plan size limit (402)", tooBig.status === 402, JSON.stringify(tooBig));
  const foreign = await call("POST", `/projects/${pid}/videos`, { token: B.token, body: { filename: "a.mp4", size: 1000, mime: "video/mp4" } });
  check("other user cannot upload into my project (404)", foreign.status === 404, JSON.stringify(foreign));

  const reg = await call("POST", `/projects/${pid}/videos`, { token: A.token, body: { filename: "clip.mp4", size: 2048, mime: "video/mp4", probe: { durationMs: 8000, width: 1080, height: 1920, fps: 30, hasAudio: true } } });
  check("register video -> signed upload url", reg.status === 201 && !!reg.data?.uploadUrl, JSON.stringify(reg));
  const early = await call("POST", `/videos/${reg.data.videoId}/complete`, { token: A.token, body: {} });
  check("complete before upload -> 409", early.status === 409, JSON.stringify(early));
  const up = await A.client.storage.from("media").uploadToSignedUrl(reg.data.path, reg.data.token, new Blob([new Uint8Array(2048)], { type: "video/mp4" }));
  check("direct upload to storage works", !up.error, JSON.stringify(up.error));
  const done = await call("POST", `/videos/${reg.data.videoId}/complete`, { token: A.token, body: {} });
  check("complete -> transcribe job queued", done.status === 200 && !!done.data?.jobId, JSON.stringify(done));
  const done2 = await call("POST", `/videos/${reg.data.videoId}/complete`, { token: A.token, body: {} });
  check("complete is idempotent (same job)", done2.data?.jobId === done.data?.jobId, JSON.stringify(done2));
  check("companion offline reported", done.data?.companionOnline === false);

  // ---- device pairing
  const start = await call("POST", "/device/start", { body: { workerName: "E2E PC", platform: "win32" } });
  check("device/start", start.status === 201 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(start.data?.userCode), JSON.stringify(start));
  const pend = await call("POST", "/device/token", { body: { deviceCode: start.data.deviceCode } });
  check("token pending before approval", pend.data?.status === "pending", JSON.stringify(pend));
  const lookup = await call("GET", `/device/approve?code=${start.data.userCode}`, { token: A.token });
  check("approve page can look up device", lookup.data?.workerName === "E2E PC", JSON.stringify(lookup));
  const appr = await call("POST", "/device/approve", { token: A.token, body: { userCode: start.data.userCode } });
  check("approve", appr.status === 200, JSON.stringify(appr));
  const tok = await call("POST", "/device/token", { body: { deviceCode: start.data.deviceCode } });
  check("token issued once", tok.data?.status === "approved" && tok.data.token?.startsWith("cpe_"), JSON.stringify(tok));
  const tok2 = await call("POST", "/device/token", { body: { deviceCode: start.data.deviceCode } });
  check("token cannot be minted twice", tok2.data?.status === "expired", JSON.stringify(tok2));
  const W = tok.data.token;
  const { data: wrow } = await admin.from("workers").select("token_hash, worker_token").eq("id", tok.data.workerId).single();
  check("token stored hashed, not plaintext", !!wrow.token_hash && wrow.worker_token === null);

  // ---- worker
  check("worker route rejects user JWT", (await call("POST", "/worker/heartbeat", { token: A.token, body: {} })).status === 401);
  const hb = await call("POST", "/worker/heartbeat", { token: W, body: { version: "0.1.0", platform: "win32", capabilities: { kinds: ["transcribe", "render"] } } });
  check("heartbeat", hb.status === 200 && hb.data.workerId === tok.data.workerId, JSON.stringify(hb));
  const other = await call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["render"] } });
  check("claim with no matching kind -> 204", other.status === 204, JSON.stringify(other));
  // companions >= 0.2.0 are told by the heartbeat whether there is work, and only then claim
  const hbIdle = await call("POST", "/worker/heartbeat", { token: W, body: { version: "0.2.0", platform: "win32", capabilities: { kinds: ["transcribe", "render"] } } });
  // the upload above queued a transcribe job for this user's computer
  check("heartbeat says a job is waiting and to claim now", hbIdle.data?.hasWork === true && hbIdle.data?.pollHintMs <= 2000, JSON.stringify(hbIdle.data));
  // old companions long-poll: the server re-checks every 5 s while holding the request
  const lpStart = Date.now();
  const lp = call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["thumbnail"], waitMs: 15000 } });
  await new Promise((r) => setTimeout(r, 1500));
  const queuedAt = Date.now();
  await admin.from("jobs").insert({ project_id: pid, owner_id: A.id, kind: "thumbnail", job_type: "thumbnail", status: "queued", payload: { kind: "thumbnail", videoId: reg.data.videoId } });
  const lpRes = await lp;
  const pickup = Date.now() - queuedAt;
  check(`long-poll claim picks up a new job within one 5 s re-check (${pickup} ms after it was queued)`, lpRes.status === 200 && lpRes.data?.job?.kind === "thumbnail" && pickup < 6500, JSON.stringify(lpRes).slice(0, 200));
  const idle0 = Date.now();
  const idle = await call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["thumbnail"], waitMs: 2000 } });
  check("long-poll with nothing to do returns 204 after the wait", idle.status === 204 && Date.now() - idle0 >= 1800, String(Date.now() - idle0));
  void lpStart;
  const claim = await call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["transcribe", "render", "proxy"] } });
  check("claim transcribe job with signed source url", claim.status === 200 && claim.data.job.kind === "transcribe" && !!claim.data.urls.sourceGet, JSON.stringify(claim).slice(0, 300));
  const src = await fetch(claim.data.urls.sourceGet);
  check("signed source url downloads the video", src.ok && (await src.arrayBuffer()).byteLength === 2048);
  const jobId = claim.data.job.id;
  const again = await call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["transcribe"] } });
  check("job not handed out twice", again.status === 204);
  const prog = await call("POST", `/worker/jobs/${jobId}/progress`, { token: W, body: { stage: "Transcribing", progress: 40 } });
  check("progress ok + not cancelled", prog.status === 200 && prog.data.cancelRequested === false, JSON.stringify(prog));

  const words = ["Stop", "scrolling", "and", "watch", "this", "incredible", "trick."].map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 400, endMs: i * 400 + 380, source: { text: "asr" } }));
  const complete = await call("POST", `/worker/jobs/${jobId}/complete`, { token: W, body: { kind: "transcribe", engine: "whisper_cpp", model: "small", language: "en", durationMs: 8000, words } });
  check("complete transcribe", complete.status === 200, JSON.stringify(complete));
  const complete2 = await call("POST", `/worker/jobs/${jobId}/complete`, { token: W, body: { kind: "transcribe", engine: "whisper_cpp", model: "small", language: "en", words } });
  check("complete is idempotent", complete2.status === 200 && complete2.data.duplicate === true, JSON.stringify(complete2));
  const wrongKind = await call("POST", `/worker/jobs/${jobId}/progress`, { token: W, body: { stage: "x", progress: 1 } });
  check("finished job -> LEASE_LOST 409", wrongKind.status === 409 && wrongKind.error?.code === "LEASE_LOST", JSON.stringify(wrongKind));

  // ---- document
  const d1 = await call("GET", `/projects/${pid}/document`, { token: A.token });
  check("document created from transcript (rev 1)", d1.data.revision === 1 && d1.data.doc.words.length === 7, JSON.stringify(d1).slice(0, 200));
  const edited = { ...d1.data.doc, words: d1.data.doc.words.map((w, i) => (i === 1 ? { ...w, text: "scrollin'" } : w)) };
  const s1 = await call("PUT", `/projects/${pid}/document`, { token: A.token, body: { expectedRevision: 1, doc: edited } });
  check("save with correct revision -> rev 2", s1.data?.revision === 2, JSON.stringify(s1));
  const s2 = await call("PUT", `/projects/${pid}/document`, { token: A.token, body: { expectedRevision: 1, doc: edited } });
  check("stale save -> 409 REVISION_CONFLICT + server copy", s2.status === 409 && s2.error?.code === "REVISION_CONFLICT" && s2.error.details?.revision === 2, JSON.stringify(s2).slice(0, 200));
  const bad = await call("PUT", `/projects/${pid}/document`, { token: A.token, body: { expectedRevision: 2, doc: { version: 3 } } });
  check("invalid doc -> 422", bad.status === 422, JSON.stringify(bad).slice(0, 120));

  // ---- isolation
  const bDoc = await call("GET", `/projects/${pid}/document`, { token: B.token });
  check("user B sees no document of user A", bDoc.data?.doc === null, JSON.stringify(bDoc).slice(0, 150));
  check("user B cannot save A's document", (await call("PUT", `/projects/${pid}/document`, { token: B.token, body: { expectedRevision: 2, doc: edited } })).status === 404);
  check("user B cannot get A's video url (IDOR fix)", (await call("GET", `/projects/${pid}/video`, { token: B.token })).status === 404);
  check("user B cannot get A's motion script (IDOR fix)", (await call("GET", `/projects/${pid}/motion-script`, { token: B.token })).status === 404);
  check("user B cannot list A's exports", (await call("GET", `/projects/${pid}/exports`, { token: B.token })).status === 404);
  const mass = await call("PATCH", `/projects/${pid}`, { token: A.token, body: { owner_id: B.id, title: "Renamed" } });
  const { data: after } = await admin.from("projects").select("owner_id, title").eq("id", pid).single();
  check("PATCH ignores owner_id (mass-assignment fix)", after.owner_id === A.id && after.title === "Renamed", JSON.stringify(mass));

  // ---- exports
  const noStyle = await call("POST", `/projects/${pid}/exports`, { token: A.token, body: { kind: "srt" } });
  check("export without style -> 409", noStyle.status === 409, JSON.stringify(noStyle));
  const style = { templateId: "sentence_highlight", fontId: "Inter", fontSize: 54 };
  await admin.from("projects").update({ style_json: style, look_id: "hormozi_viral", settings_json: { maxWordsPerCard: 3 } }).eq("id", pid);
  const srt = await call("POST", `/projects/${pid}/exports`, { token: A.token, body: { kind: "srt" } });
  check("srt export ready immediately", srt.status === 201 && srt.data.ready, JSON.stringify(srt));
  const srtText = await (await fetch(srt.data.downloadUrl)).text();
  check("srt content has cues and edited word", srtText.includes("-->") && srtText.includes("scrollin'"), srtText.slice(0, 200));
  const vtt = await call("POST", `/projects/${pid}/exports`, { token: A.token, body: { kind: "vtt" } });
  check("vtt export", vtt.status === 201 && (await (await fetch(vtt.data.downloadUrl)).text()).startsWith("WEBVTT"));
  const mp4 = await call("POST", `/projects/${pid}/exports`, { token: A.token, body: { kind: "mp4", crf: 20 } });
  check("mp4 export queues a render job", mp4.status === 202 && !!mp4.data.jobId && mp4.data.companionOnline === true, JSON.stringify(mp4));
  const rclaim = await call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["render"] } });
  check("render job claimed with snapshot + export url", rclaim.status === 200 && rclaim.data.job.payload.docSnapshot.words.length === 7 && !!rclaim.data.urls.exportPut && rclaim.data.job.payload.width === 1080, JSON.stringify(rclaim).slice(0, 250));
  const cancel = await call("POST", `/jobs/${rclaim.data.job.id}/cancel`, { token: A.token });
  check("user cancels running render", cancel.status === 200 && cancel.data.status === "cancelling", JSON.stringify(cancel));
  const prog2 = await call("POST", `/worker/jobs/${rclaim.data.job.id}/progress`, { token: W, body: { stage: "Rendering", progress: 10 } });
  check("companion learns about cancellation", prog2.data?.cancelRequested === true, JSON.stringify(prog2));
  const ack = await call("POST", `/worker/jobs/${rclaim.data.job.id}/fail`, { token: W, body: { errorCode: "CANCELLED", message: "cancelled", retryable: false } });
  check("cancel acknowledged", ack.data?.status === "cancelled", JSON.stringify(ack));
  const exps = await call("GET", `/projects/${pid}/exports`, { token: A.token });
  check("export list shows srt/vtt/cancelled mp4", exps.data.length === 3 && exps.data.some((e) => e.status_v2 === "cancelled"), JSON.stringify(exps.data?.map((e) => e.status_v2)));
  const retry = await call("POST", `/jobs/${rclaim.data.job.id}/retry`, { token: A.token });
  check("retry requeues cancelled job", retry.data?.status === "queued", JSON.stringify(retry));
  const rc2 = await call("POST", "/worker/jobs/claim", { token: W, body: { kinds: ["render"] } });
  const expPath = `${A.id}/${pid}/exports/${rc2.data.job.payload.exportId}.mp4`;
  const evil = await call("POST", `/worker/jobs/${rc2.data.job.id}/complete`, { token: W, body: { kind: "render", path: `${B.id}/someone-elses/file.mp4`, size: 1, renderMs: 1 } });
  check("complete without the real uploaded object -> 409 (path not trusted)", evil.status === 409, JSON.stringify(evil));
  await admin.storage.from("media").upload(expPath, new Uint8Array(3000), { contentType: "video/mp4", upsert: true });
  const rdone = await call("POST", `/worker/jobs/${rc2.data.job.id}/complete`, { token: W, body: { kind: "render", path: "ignored", size: 1, renderMs: 4200, durationMs: 8000 } });
  check("render complete marks export ready with server-computed path + real size", rdone.status === 200, JSON.stringify(rdone));
  const { data: exrow } = await admin.from("exports").select("storage_path, file_size, status_v2").eq("id", rc2.data.job.payload.exportId).single();
  check("export row has verified path and size", exrow.storage_path === expPath && exrow.file_size === 3000 && exrow.status_v2 === "ready", JSON.stringify(exrow));
  const dl = await call("GET", `/exports/${rc2.data.job.payload.exportId}/download`, { token: A.token });
  check("download of a ready export returns a signed url", dl.status === 200 && !!dl.data?.url, JSON.stringify(dl));
  check("user B cannot download A's export", (await call("GET", `/exports/${rc2.data.job.payload.exportId}/download`, { token: B.token })).status === 404);

  // ---- revoked companion
  // removed from the app (the route also drops the token from the server's 60 s auth cache)
  check("user removes the computer", (await call("DELETE", `/workers/${tok.data.workerId}`, { token: A.token })).status === 200);
  check("revoked token rejected", (await call("POST", "/worker/heartbeat", { token: W, body: {} })).status === 401);

  const { data: events } = await admin.from("job_events").select("id").eq("job_id", jobId);
  check("job_events audit trail written", (events?.length ?? 0) >= 3, String(events?.length));
} catch (e) {
  fail++; console.log("FATAL", e);
} finally {
  await cleanup();
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", users);
  console.log(`cleanup done (leftover profiles: ${count})`);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

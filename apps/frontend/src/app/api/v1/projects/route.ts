import { NextResponse } from "next/server";
import { z } from "zod";
import { planFor } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { PROJECT_COLUMNS, toApiProject } from "@/lib/api/projects";
import { rateLimit } from "@/lib/api/rateLimit";

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const includeArchived = url.searchParams.get("include_archived") === "true";

  let q = user.db.from("projects").select(PROJECT_COLUMNS, { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, count, error } = await q;
  if (error) throw new ApiFailure("INTERNAL", "Could not load projects", error.message);
  return NextResponse.json({ success: true, data: (data ?? []).map(toApiProject), meta: { total: count ?? 0, limit, offset } });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_create", 30, 3600);
  const { title } = await parseBody(req, z.object({ title: z.string().trim().min(1).max(120) }));

  const [{ data: profile }, { count }] = await Promise.all([
    user.db.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    user.db.from("projects").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  const limits = planFor(profile?.plan);
  if ((count ?? 0) >= limits.maxProjects) {
    throw new ApiFailure("LIMIT_EXCEEDED", `Your plan allows ${limits.maxProjects} projects. Delete an old one to create a new one.`);
  }

  const { data, error } = await user.db.from("projects").insert({ owner_id: user.id, title, status: "CREATED" }).select(PROJECT_COLUMNS).single();
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not create the project", error?.message);
  return ok(toApiProject(data), 201);
});

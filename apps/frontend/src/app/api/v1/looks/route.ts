import { z } from "zod";
import { CaptionStyleSchema, ProjectSettingsSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";

const MAX_LOOKS = 100;

/** The user's own saved looks ("My looks"). */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const { data, error } = await user.db.from("user_looks").select("id, name, template_id, style_json, settings_json, created_at").order("created_at", { ascending: false });
  if (error) throw new ApiFailure("INTERNAL", "Could not load your looks", error.message);
  return ok(data ?? []);
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "look_save", 60, 3600);
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60), style: CaptionStyleSchema, settings: ProjectSettingsSchema.partial().default({}) }));
  const { count } = await user.db.from("user_looks").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_LOOKS) throw new ApiFailure("LIMIT_EXCEEDED", `You can save up to ${MAX_LOOKS} looks. Delete one first.`);
  const { data, error } = await user.db
    .from("user_looks")
    .insert({ owner_id: user.id, name: body.name, template_id: body.style.templateId, style_json: body.style, settings_json: body.settings })
    .select("id, name, template_id, style_json, settings_json, created_at")
    .single();
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not save the look", error?.message);
  return ok(data, 201);
});

import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data } = await user.db.from("user_looks").delete().eq("id", id).select("id").maybeSingle();
  if (!data) throw notFound("Look");
  return ok({ deleted: true });
});

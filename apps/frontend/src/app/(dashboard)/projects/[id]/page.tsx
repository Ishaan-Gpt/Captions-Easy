"use client";

import { useParams } from "next/navigation";
import StudioPage from "@/features/studio/StudioPage";

export default function ProjectPage() {
  const params = useParams();
  return <StudioPage projectId={params.id as string} />;
}

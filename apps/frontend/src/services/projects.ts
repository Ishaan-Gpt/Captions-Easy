/**
 * Real projects service. Source: contracts/api.md > Projects. Sprint 1.6
 * replaces the previous localStorage-backed mock (list/rename/status/
 * delete) with the backend endpoints added this sprint
 * (Next.js route handlers under app/api/v1/projects, RLS-scoped).
 */

import { Project, ProjectStatus } from "./types";
import { apiClient, ApiError } from "./api-client";

interface BackendProject {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  style: string | null;
  thumbnail_url: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived_at: string | null;
}

function toProject(p: BackendProject): Project {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? undefined,
    status: (p.status as ProjectStatus) ?? "CREATED",
    style: p.style ?? undefined,
    thumbnail_url: p.thumbnail_url ?? undefined,
    language: p.language ?? undefined,
    created_at: p.created_at,
    updated_at: p.updated_at,
    deleted_at: p.deleted_at ?? undefined,
    archived_at: p.archived_at ?? undefined,
  };
}

export interface ProjectPage {
  projects: Project[];
  total: number;
  limit: number;
  offset: number;
}

export const projectsService = {
  /** Source: contracts/api.md > GET /projects (paginated). */
  async getProjectsPage(opts?: {
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
  }): Promise<ProjectPage> {
    const params = new URLSearchParams();
    params.set("limit", String(opts?.limit ?? 20));
    params.set("offset", String(opts?.offset ?? 0));
    if (opts?.includeArchived) params.set("include_archived", "true");

    const { data, meta } = await apiClient.getWithMeta<BackendProject[]>(
      `/projects?${params.toString()}`
    );
    return {
      projects: data.map(toProject),
      total: (meta.total as number) ?? data.length,
      limit: (meta.limit as number) ?? opts?.limit ?? 20,
      offset: (meta.offset as number) ?? opts?.offset ?? 0,
    };
  },

  async getProjects(): Promise<Project[]> {
    const projects = await apiClient.get<BackendProject[]>("/projects");
    return projects.map(toProject);
  },

  async getProjectById(id: string): Promise<Project | null> {
    try {
      const project = await apiClient.get<BackendProject>(`/projects/${id}`);
      return toProject(project);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_FOUND") return null;
      throw err;
    }
  },

  async createProject(title: string): Promise<Project> {
    const project = await apiClient.post<BackendProject>("/projects", { json: { title } });
    return toProject(project);
  },

  async renameProject(id: string, title: string): Promise<Project> {
    const project = await apiClient.patch<BackendProject>(`/projects/${id}`, { json: { title } });
    return toProject(project);
  },

  /** Deletes the project everywhere: our storage and database, and the video copy saved on this device. */
  async deleteProject(id: string): Promise<void> {
    const r = await apiClient.delete<{ videoIds?: string[] }>(`/projects/${id}`);
    const { deleteLocalVideo } = await import("@/features/upload/localVideos");
    await Promise.all((r?.videoIds ?? []).map(deleteLocalVideo));
  },

  async archiveProject(id: string): Promise<Project> {
    const project = await apiClient.post<BackendProject>(`/projects/${id}/archive`);
    return toProject(project);
  },

  async unarchiveProject(id: string): Promise<Project> {
    const project = await apiClient.post<BackendProject>(`/projects/${id}/unarchive`);
    return toProject(project);
  },

  async duplicateProject(id: string): Promise<Project> {
    const project = await apiClient.post<BackendProject>(`/projects/${id}/duplicate`);
    return toProject(project);
  },

  async updateProjectLanguage(id: string, language: string): Promise<Project> {
    const project = await apiClient.patch<BackendProject>(`/projects/${id}`, { json: { language } });
    return toProject(project);
  },
};

import { readCatalog } from "./chain";
import { sameAddress, splitSkills, type Profile, type Project, type Recommendation } from "./types";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export type RankedProject = { project: Project; recommendation: Recommendation };

export async function requestRecommendations(
  address: string, profile: Profile, signal: AbortSignal,
): Promise<RankedProject[]> {
  const { projects, applications } = await readCatalog(address);
  const applied = new Set(applications.map((application) => application.projectId));
  const candidates = projects.filter((project) => project.active &&
    !sameAddress(project.owner, address) && project.acceptedCount < project.capacity &&
    !applied.has(project.id));
  if (candidates.length > 1000 || applied.size > 1000) {
    throw new Error("Превышен лимит MVP в 1000 кандидатов или заявок для одного запроса.");
  }

  const response = await fetch(API_URL + "/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      user_address: address,
      applied_project_ids: [...applied],
      profile: { skills: splitSkills(profile.skills), interests: splitSkills(profile.interests), bio: profile.bio.trim() },
      top_k: 5,
      projects: candidates.map((project) => ({
        id: project.id, owner: project.owner, title: project.title, description: project.description,
        required_skills: splitSkills(project.requiredSkills), capacity: project.capacity,
        accepted_count: project.acceptedCount, active: project.active,
      })),
    }),
  }).catch((error: unknown) => {
    if (signal.aborted) throw error;
    throw new Error("API рекомендаций недоступен. Проверьте запуск FastAPI на порту 8000.");
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "API вернул ошибку " + response.status + ".");
  }
  const { recommendations } = await response.json() as { recommendations: Recommendation[] };
  const byId = new Map(candidates.map((project) => [project.id, project]));
  return recommendations.flatMap((recommendation) => {
    const project = byId.get(recommendation.id);
    return project ? [{ project, recommendation }] : [];
  });
}

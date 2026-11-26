from sklearn.metrics.pairwise import cosine_similarity

from .features import normalize_tags, profile_text, project_text, tokens, vectorizer
from .schemas import Candidate, Recommendation, RecommendationRequest


def eligible_projects(request: RecommendationRequest) -> list[Candidate]:
    unique: dict[int, Candidate] = {}
    for project in request.projects:
        unique.setdefault(project.id, project)

    applied = set(request.applied_project_ids)
    return [
        project for project in unique.values()
        if project.active
        and project.owner != request.user_address
        and project.accepted_count < project.capacity
        and project.id not in applied
    ]


def recommend(request: RecommendationRequest) -> list[Recommendation]:
    projects = eligible_projects(request)
    corpus = [project_text(project) for project in projects]
    query = profile_text(request.profile)
    if not tokens(query) or not any(map(tokens, corpus)):
        return []

    model = vectorizer()
    matrix = model.fit_transform(corpus)
    query_vector = model.transform([query])
    if query_vector.nnz == 0:
        return []

    scores = cosine_similarity(query_vector, matrix)[0]
    ordered = sorted(
        ((project, score) for project, score in zip(projects, scores, strict=True) if score > 0),
        key=lambda item: (-round(float(item[1]), 12), item[0].id),
    )
    profile_skills = set(normalize_tags(request.profile.skills))
    query_terms = set(tokens(query))
    results = []
    for project, score in ordered[:request.top_k]:
        matched = sorted(profile_skills.intersection(normalize_tags(project.required_skills)))
        if matched:
            explanation = "Совпавшие навыки — " + ", ".join(matched) + "."
        else:
            common = sorted(query_terms.intersection(tokens(project_text(project))))
            explanation = "Общие слова в профиле и проекте — " + ", ".join(common[:5]) + "."
        results.append(Recommendation(
            id=project.id, score=min(float(score), 1.0),
            matched_skills=matched, explanation=explanation,
        ))
    return results

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.features import normalize_tags
from app.main import app
from app.ranking import recommend
from app.schemas import Candidate, Profile, RecommendationRequest

USER = "0x" + "a1" * 20
AUTHOR = "0x" + "b2" * 20
MOCK_DATA = Path(__file__).resolve().parents[2] / "data/projects.json"


def call_api(method, path, **kwargs):
    async def call():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(call())


@pytest.fixture
def projects():
    loaded = json.loads(MOCK_DATA.read_text(encoding="utf-8"))
    return [
        Candidate(
            id=i, owner=AUTHOR, title=row["title"], description=row["description"],
            required_skills=row["skills"].split(", "), capacity=row["capacity"],
            accepted_count=0, active=True,
        )
        for i, row in enumerate(loaded, 1)
    ]


def request(projects, profile=None, **kwargs):
    return RecommendationRequest(
        user_address=USER, projects=projects, profile=profile or Profile(), **kwargs
    )


@pytest.mark.parametrize(("skills", "interests", "expected", "match"), [
    (["PYTHON", "машинное обучение", "pandas"], ["временные ряды"], 2, "ml"),
    (["React.js", "TS", "CSS"], ["accessibility", "адаптивный интерфейс"], 3, "typescript"),
    (["FIGMA", "UX"], ["дизайн интерфейсов", "прототип"], 8, "figma"),
])
def test_topic_relevance(projects, skills, interests, expected, match):
    result = recommend(request(projects, Profile(skills=skills, interests=interests)))
    assert result[0].id == expected
    assert match in result[0].matched_skills
    assert match in result[0].explanation
    assert 0 < result[0].score <= 1


@pytest.mark.parametrize("profile", [
    Profile(), Profile(skills=["  ", "..."]), Profile(interests=["археометрия"]),
])
def test_empty_or_no_overlap(projects, profile):
    assert recommend(request(projects, profile)) == []


def test_empty_and_tokenless_corpus(projects):
    profile = Profile(skills=["Python"])
    assert recommend(request([], profile)) == []
    tokenless = projects[0].model_copy(update={"title": "...", "description": "и для", "required_skills": []})
    assert recommend(request([tokenless], profile)) == []


def test_excludes_ineligible_and_deduplicates(projects):
    reference = projects[1]
    candidates = [
        reference.model_copy(update={"id": 100, "active": False}),
        reference.model_copy(update={"id": 101, "owner": USER}),
        reference.model_copy(update={"id": 102, "accepted_count": reference.capacity}),
        reference.model_copy(update={"id": 103}),
        reference, reference,
    ]
    results = recommend(request(candidates, Profile(skills=["Python"]), applied_project_ids=[103, 103]))
    assert [item.id for item in results] == [reference.id]


def test_equal_scores_order_by_id_and_respect_top_k(projects):
    candidate = projects[1]
    result = recommend(request([
        candidate.model_copy(update={"id": 15}),
        candidate.model_copy(update={"id": 10}),
    ], Profile(skills=["Python"]), top_k=1))
    assert [item.id for item in result] == [10]


def test_normalizes_russian_english_and_technical_tags():
    assert normalize_tags([" JS ", "JavaScript", "Машинное обучение", "ML", "C++", "C#", "Ёлки"]) == (
        "javascript", "ml", "c++", "c#", "елки"
    )


def test_api_health_post_and_empty_response(projects):
    assert call_api("GET", "/health").json() == {"status": "ok"}
    response = call_api("POST", "/recommendations", json=request(projects, Profile(skills=["Figma"])).model_dump())
    assert response.status_code == 200
    assert response.json()["recommendations"][0]["score"] > 0
    response = call_api("POST", "/recommendations", json=request([]).model_dump())
    assert response.status_code == 200
    assert response.json() == {"recommendations": []}


def test_api_rejects_invalid_payload_without_echoing_inputs():
    response = call_api("POST", "/recommendations", json={"user_address": "invalid", "projects": [], "profile": {}, "top_k": 0})
    assert response.status_code == 422
    assert "body.user_address" in response.json()["fields"]
    assert "invalid" not in response.text


def test_cors_allows_only_local_frontend():
    headers = {
        "Origin": "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = call_api("OPTIONS", "/recommendations", headers=headers)
    assert response.headers["access-control-allow-origin"] == headers["Origin"]
    response = call_api("OPTIONS", "/recommendations", headers={**headers, "Origin": "https://example.org"})
    assert "access-control-allow-origin" not in response.headers

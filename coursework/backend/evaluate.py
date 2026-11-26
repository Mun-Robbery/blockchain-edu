import json
from math import log2
from pathlib import Path
from random import Random
from statistics import mean

from app.ranking import recommend
from app.schemas import Candidate, Profile, RecommendationRequest

COURSEWORK = Path(__file__).resolve().parent.parent
SEED = 42
KS = (3, 5)
USER = "0x" + "01" * 20


def metrics(ranking: list[int], relevant: set[int], k: int) -> dict[str, float]:
    hits = [int(project_id in relevant) for project_id in ranking[:k]]
    dcg = sum(hit / log2(rank + 2) for rank, hit in enumerate(hits))
    ideal_dcg = sum(1 / log2(rank + 2) for rank in range(min(k, len(relevant))))
    return {
        f"precision@{k}": sum(hits) / k,
        f"recall@{k}": sum(hits) / len(relevant),
        f"ndcg@{k}": dcg / ideal_dcg,
    }


def main() -> None:
    projects = json.loads((COURSEWORK / "data/projects.json").read_text(encoding="utf-8"))
    profiles = json.loads((COURSEWORK / "data/profiles.json").read_text(encoding="utf-8"))
    candidates = [
        Candidate(
            id=index, owner=f"0x{row['account'] + 2:040x}", title=row["title"],
            description=row["description"], required_skills=row["skills"].split(", "),
            capacity=row["capacity"], accepted_count=0, active=True,
        )
        for index, row in enumerate(projects, 1)
    ]
    rng = Random(SEED)
    scores: dict[str, list[dict[str, float]]] = {"tfidf_cosine": [], "random": []}
    for row in profiles:
        profile = Profile(skills=row["skills"], interests=row["interests"], bio=row["bio"])
        request = RecommendationRequest(user_address=USER, projects=candidates, profile=profile)
        ranked_ids = [result.id for result in recommend(request)]
        relevant = set(row["relevant_ids"])
        shuffled = [project.id for project in candidates]
        rng.shuffle(shuffled)
        for method, ranking in (("tfidf_cosine", ranked_ids), ("random", shuffled)):
            scores[method].append({
                metric: value for k in KS for metric, value in metrics(ranking, relevant, k).items()
            })

    report = {
        "dataset": "synthetic",
        "project_count": len(projects),
        "profile_count": len(profiles),
        "random_seed": SEED,
        "metrics_macro_average": {
            method: {
                metric: round(mean(row[metric] for row in rows), 6) for metric in rows[0]
            }
            for method, rows in scores.items()
        },
    }
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    (COURSEWORK / "docs/evaluation.json").write_text(output, encoding="utf-8")
    print(output, end="")


if __name__ == "__main__":
    main()

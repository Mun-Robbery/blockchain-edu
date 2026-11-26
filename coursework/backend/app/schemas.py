from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Address = Annotated[str, StringConstraints(pattern=r"^0x[0-9a-fA-F]{40}$", to_lower=True)]
ProjectId = Annotated[int, Field(ge=1, le=2**53 - 1)]
Skill = Annotated[str, StringConstraints(strip_whitespace=True, max_length=320)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Profile(InputModel):
    skills: list[Skill] = Field(default_factory=list, max_length=160)
    interests: list[Skill] = Field(default_factory=list, max_length=160)
    bio: str = Field(default="", max_length=800)


class Candidate(InputModel):
    id: ProjectId
    owner: Address
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(max_length=1200)
    required_skills: list[Skill] = Field(max_length=160)
    capacity: int = Field(ge=1, le=30)
    accepted_count: int = Field(ge=0, le=30)
    active: bool


class RecommendationRequest(InputModel):
    user_address: Address
    applied_project_ids: list[ProjectId] = Field(default_factory=list, max_length=1000)
    projects: list[Candidate] = Field(max_length=1000)
    profile: Profile
    top_k: int = Field(default=5, ge=1, le=20)


class Recommendation(BaseModel):
    id: ProjectId
    score: float = Field(ge=0, le=1)
    matched_skills: list[str]
    explanation: str


class RecommendationResponse(BaseModel):
    recommendations: list[Recommendation]

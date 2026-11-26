import re
import unicodedata

from sklearn.feature_extraction.text import TfidfVectorizer

from .schemas import Candidate, Profile

ALIASES = {
    "js": "javascript",
    "ts": "typescript",
    "node.js": "nodejs",
    "vue.js": "vue",
    "react.js": "react",
    "scikit-learn": "sklearn",
    "machine learning": "ml",
    "машинное обучение": "ml",
    ".net": "dotnet",
}
ALIAS_PATTERN = re.compile(
    r"(?<!\w)(" + "|".join(map(re.escape, ALIASES)) + r")(?!\w)"
)
WORD_PATTERN = re.compile(r"(?u)\b[^\W_]+[+#]*")
STOP_WORDS = frozenset(
    "а без в во для до и из или к как на над о об от по под при про с со у что это "
    "a an and as at by for from in is of on or the to with".split()
)


def canonical_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold().replace("ё", "е")
    return ALIAS_PATTERN.sub(lambda match: ALIASES[match.group(0)], text)


def tokens(text: str) -> list[str]:
    return [word for word in WORD_PATTERN.findall(canonical_text(text)) if word not in STOP_WORDS]


def normalize_tags(tags: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(tag for value in tags if (tag := " ".join(tokens(value)))))


def project_text(project: Candidate) -> str:
    skills = " ".join(normalize_tags(project.required_skills))
    return "\n".join((project.title, project.description, skills, skills))


def profile_text(profile: Profile) -> str:
    skills = " ".join(normalize_tags(profile.skills))
    interests = " ".join(normalize_tags(profile.interests))
    return "\n".join((skills, skills, interests, profile.bio))


def vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(
        tokenizer=tokens, token_pattern=None, lowercase=False, ngram_range=(1, 2)
    )

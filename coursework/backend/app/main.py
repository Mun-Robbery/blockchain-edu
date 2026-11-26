import logging
import os
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ranking import recommend
from .schemas import RecommendationRequest, RecommendationResponse

load_dotenv()
logger = logging.getLogger("projectmatch")


def allowed_origins() -> list[str]:
    defaults = "http://127.0.0.1:5173,http://localhost:5173"
    origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", defaults).split(",")]
    for origin in origins:
        url = urlsplit(origin)
        if (
            url.scheme not in {"http", "https"}
            or url.hostname not in {"localhost", "127.0.0.1"}
            or url.username is not None
            or origin != f"{url.scheme}://{url.netloc}"
        ):
            raise ValueError("FRONTEND_ORIGINS должен содержать только локальные origin без пути")
    return origins


app = FastAPI(title="ProjectMatch", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError) -> JSONResponse:
    fields = [".".join(map(str, issue["loc"])) for issue in error.errors()]
    return JSONResponse(
        status_code=422,
        content={"detail": "Проверьте формат и ограничения переданных данных.", "fields": fields},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/recommendations", response_model=RecommendationResponse)
def recommendations(request: RecommendationRequest):
    try:
        return RecommendationResponse(recommendations=recommend(request))
    except Exception as error:
        logger.error("Ошибка при ранжировании проектов (%s)", type(error).__name__)
        return JSONResponse(
            status_code=500, content={"detail": "Не удалось рассчитать рекомендации."}
        )

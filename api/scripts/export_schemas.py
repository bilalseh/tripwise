"""Export the public API models as one JSON Schema (run via `pnpm gen:schemas`).

All models share one `$defs` table, so a type used by several models is generated once on
the TypeScript side.
"""

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

from tripwise_api.schemas import REQUEST_MODELS, RESPONSE_MODELS
from tripwise_api.schemas.json_schema import WithoutFieldTitles

SCHEMA_DIR = Path(__file__).resolve().parents[2] / "shared" / "schemas"
SCHEMA_FILE = SCHEMA_DIR / "api.json"

Mode = Literal["validation", "serialization"]


def main() -> None:
    models: list[tuple[type[BaseModel], Mode]] = [
        *((model, "validation") for model in REQUEST_MODELS),
        *((model, "serialization") for model in RESPONSE_MODELS),
    ]
    _, schema = models_json_schema(models, title="TripwiseApi", schema_generator=WithoutFieldTitles)
    # Request models also get Zod schemas for client-side form validation.
    schema["x-request-models"] = [model.__name__ for model in REQUEST_MODELS]

    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    SCHEMA_FILE.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Exported {len(models)} model(s) to {SCHEMA_FILE}")


if __name__ == "__main__":
    main()

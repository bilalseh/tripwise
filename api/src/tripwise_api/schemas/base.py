from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Base for every model shared with the frontend: camelCase on the wire and in Firestore,
    snake_case in Python, unknown fields rejected."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        extra="forbid",
        frozen=True,
        # Schemas describe what the API sends: a field with a default is always present, so it
        # is required in the generated TypeScript (and for the AI's structured output).
        json_schema_mode_override="serialization",
        json_schema_serialization_defaults_required=True,
    )


# ISO 4217 code, for example "EUR". Amounts are always in the trip's own currency.
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
Money = Annotated[float, Field(ge=0, le=1_000_000)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Identifier = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]

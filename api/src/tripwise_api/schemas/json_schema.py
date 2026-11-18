"""JSON Schema helpers shared by the TypeScript export and the AI providers."""

from typing import Any

from pydantic import BaseModel
from pydantic.json_schema import GenerateJsonSchema


class WithoutFieldTitles(GenerateJsonSchema):
    """Field titles would become standalone TS aliases (`Status`, `Version`) that collide across
    models, and they only add noise for AI providers, so only model titles are kept."""

    def field_title_should_be_set(self, schema: object) -> bool:
        return False


# Left out of what providers receive: Gemini refuses schemas with many limits ("too many
# states"), and Pydantic enforces every one of them on the reply anyway.
_NOT_FOR_PROVIDERS = frozenset(
    {
        "title",
        "description",
        "default",
        "additionalProperties",
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minItems",
        "maxItems",
    }
)


def _inline(node: Any, defs: dict[str, Any], seen: tuple[str, ...]) -> Any:
    if isinstance(node, list):
        return [_inline(item, defs, seen) for item in node]
    if not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if isinstance(ref, str):
        name = ref.removeprefix("#/$defs/")
        if name not in defs or name in seen:
            raise ValueError(f"cannot inline {ref}")
        return _inline(defs[name], defs, (*seen, name))
    inlined: dict[str, Any] = {}
    for key, value in node.items():
        if key in _NOT_FOR_PROVIDERS:  # keywords; a field named "title" is under "properties"
            continue
        if key == "properties" and isinstance(value, dict):
            inlined[key] = {name: _inline(field, defs, seen) for name, field in value.items()}
        else:
            inlined[key] = _inline(value, defs, seen)
    return inlined


def provider_schema(model: type[BaseModel]) -> dict[str, Any]:
    """A small self-contained schema (no `$ref`, titles or limits) every provider accepts."""
    schema = model.model_json_schema(by_alias=True, schema_generator=WithoutFieldTitles)
    defs = schema.pop("$defs", {})
    inlined: dict[str, Any] = _inline(schema, defs, ())
    return inlined

"""JSON Schema helpers for the TypeScript export."""

from pydantic.json_schema import GenerateJsonSchema


class WithoutFieldTitles(GenerateJsonSchema):
    """Field titles would become standalone TS aliases (`Status`, `Version`) that collide across
    models, so only model titles are kept."""

    def field_title_should_be_set(self, schema: object) -> bool:
        return False

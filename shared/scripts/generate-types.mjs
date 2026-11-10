// Generates TypeScript types (all models) and Zod schemas (request models) from the JSON Schema
// that api/scripts/export_schemas.py writes. Run through `pnpm gen:schemas` at the repo root.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'json-schema-to-typescript';
import { jsonSchemaToZod } from 'json-schema-to-zod';
import { format } from 'prettier';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(packageRoot, 'src', 'generated');
const banner =
  '/* Generated from the Pydantic models in api/. Do not edit; run `pnpm gen:schemas`. */';

const schema = JSON.parse(await readFile(join(packageRoot, 'schemas', 'api.json'), 'utf8'));
const defs = schema.$defs;
const names = Object.keys(defs).sort();

/** Inline `#/$defs/...` references; json-schema-to-zod does not resolve them itself. */
function inlineRefs(node, seen = []) {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, seen));
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    const name = node.$ref.replace('#/$defs/', '');
    if (!(name in defs) || seen.includes(name)) throw new Error(`Cannot inline ${node.$ref}`);
    return inlineRefs(defs[name], [...seen, name]);
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, inlineRefs(value, seen)]),
  );
}

// One declaration per definition; references to other definitions stay as type names.
const typeBlocks = [];
for (const name of names) {
  typeBlocks.push(
    await compile({ ...defs[name], $defs: defs }, name, {
      bannerComment: '',
      additionalProperties: false,
      strictIndexSignatures: true,
      declareExternallyReferenced: false,
      maxItems: -1, // `Weekday[]`, not a union of tuples for minItems/maxItems
      format: false,
    }),
  );
}

const zodBlocks = schema['x-request-models'].map((name) =>
  jsonSchemaToZod(inlineRefs(defs[name]), {
    name: `${name}Schema`,
    module: 'esm',
    noImport: true,
    withoutDescribes: true,
    zodVersion: 4,
  }),
);

const prettierOptions = { parser: 'typescript', singleQuote: true, printWidth: 100 };
const typesSource = `${banner}\n\n${typeBlocks.join('\n')}`;
const zodSource = `${banner}\n\nimport { z } from 'zod';\n\n${zodBlocks.join('\n\n')}`;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'types.ts'), await format(typesSource, prettierOptions));
await writeFile(join(outDir, 'schemas.ts'), await format(zodSource, prettierOptions));
console.log(`Generated ${names.length} type(s) and ${zodBlocks.length} Zod schema(s)`);

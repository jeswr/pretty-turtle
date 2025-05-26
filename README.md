# Pretty Turtle

A pretty turtle syntax writer (including support for RDF-star)

[![GitHub license](https://img.shields.io/github/license/jeswr/pretty-turtle.svg)](https://github.com/jeswr/pretty-turtle/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/@jeswr/pretty-turtle.svg)](https://www.npmjs.com/package/@jeswr/pretty-turtle)
[![Dependabot](https://badgen.net/badge/Dependabot/enabled/green?icon=dependabot)](https://dependabot.com/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Usage

```ts
import { write } from '@jeswr/pretty-turtle';

// Convert RDF/JS quads into a pretty turtle string
const str = await write(quads);
```

## Options

The `write` function accepts an optional second parameter with configuration options:

```ts
interface Options {
  prefixes?: Record<string, string>;
  format?: string;
  compact?: boolean;
  isImpliedBy?: boolean;
  baseIri?: string;
  explicitBaseIRI?: boolean;
}
```

### `format`

Specifies the output format. Supported values:

- `'text/turtle'` (default) - Standard Turtle format
- `'text/n3'` - Notation3 format

```ts
// Convert RDF/JS quads into a Notation3 string
const str = await write(quads, {
  format: 'text/n3'
});
```

### `prefixes`

A map of prefix names to their corresponding namespace URIs for compacting URIs in the output.

```ts
const str = await write(quads, {
  prefixes: {
    ex: "http://example.org/",
    foaf: "http://xmlns.com/foaf/0.1/",
    schema: "https://schema.org/"
  }
});
```

### `compact`

When set to `true`, produces a more compact output by removing unnecessary whitespace and line breaks.

```ts
// Compact output
const str = await write(quads, {
  compact: true
});
```

### `baseIri`

Sets the base IRI for the document, which can be used to resolve relative IRIs.

```ts
const str = await write(quads, {
  baseIri: "http://example.org/base/"
});
```

### `explicitBaseIRI`

When set to `true`, explicitly writes the `@base` directive in the output even if a base IRI is provided.

```ts
const str = await write(quads, {
  baseIri: "http://example.org/base/",
  explicitBaseIRI: true
});
// Output will include: @base <http://example.org/base/> .
```

### `isImpliedBy`

Used to opt in to using isImpliedBy syntax (`<=`) when in N3 mode.

```ts
const str = await write(quads, {
  format: 'text/n3',
  isImpliedBy: true
});
```

## Complete Example

```ts
import { write } from '@jeswr/pretty-turtle';

const str = await write(quads, {
  format: 'text/turtle',
  prefixes: {
    ex: "http://example.org/",
    foaf: "http://xmlns.com/foaf/0.1/"
  },
  baseIri: "http://example.org/base/",
  explicitBaseIRI: true,
  compact: false
});
```

## License

©2023–present
[Jesse Wright](https://github.com/jeswr),
[MIT License](https://github.com/jeswr/pretty-turtle/blob/master/LICENSE).

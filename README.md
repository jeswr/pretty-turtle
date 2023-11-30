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

This library also supports writing in Notation3 format

```ts
import { write } from '@jeswr/pretty-turtle';

// Convert RDF/JS quads into a Notation3 string
const str = await write(quads, {
  format: 'text/n3'
});
```

An additional `prefixes` parameter is supported to allow compacting of URIs

```ts
import { write } from '@jeswr/pretty-turtle';

// Convert RDF/JS quads into a Notation3 string
const str = await write(quads, {
  prefixes: {
    ex: "http://example.org/"
  }
});
```

## License
©2023–present
[Jesse Wright](https://github.com/jeswr),
[MIT License](https://github.com/jeswr/pretty-turtle/blob/master/LICENSE).

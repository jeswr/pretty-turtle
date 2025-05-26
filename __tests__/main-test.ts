import { DataFactory, Parser } from 'n3-test';
import fs from 'fs';
import path from 'path';
import { write } from '../lib';
import 'jest-rdf';

async function getQuads(file: string, _prefixes: Record<string, string> = {}, format: string = 'text/turtle', dirname = 'data', compact = false) {
  const parser = new Parser({ rdfStar: true, format } as any);
  // @ts-expect-error
  // eslint-disable-next-line no-underscore-dangle
  parser._supportsRDFStar = true;
  const prefixes = { ..._prefixes };
  const quads = parser.parse(fs.readFileSync(path.join(__dirname, '..', dirname, file)).toString(), undefined, (prefix, iri) => {
    prefixes[prefix] = iri.value;
  });

  return {
    quads,
    string: await write(quads, { prefixes, format, compact }),
  };
}

const loose: Record<string, boolean | undefined> = {
  'bnodes5.ttl': true,
};

it('It should correctly write turtle files', async () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'data'))) {
    try {
      const { string, quads } = await getQuads(file);

      if (loose[file]) {
        // If loose we only need the quads to match when we re-parse the string
        expect((new Parser()).parse(string)).toBeRdfIsomorphic(quads);
      } else {
        // If not loose we expect an exact string match
        expect(string.replace(/b\d+_/g, '')).toEqual(fs.readFileSync(path.join(__dirname, '..', 'data', file)).toString());
      }
    } catch (e: any) {
      // Suppress errors on {| syntax since N3 cannot parse it for now
      if (!`${e}`.includes('Unexpected "|"')) {
        throw e;
      }
    }
  }
});

it('It should correctly write N3 files', async () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'n3_data'))) {
    const { string, quads } = await getQuads(file, undefined, 'text/n3', 'n3_data');

    const parser = new Parser({ format: 'text/n3' });
    // @ts-expect-error
    // eslint-disable-next-line no-underscore-dangle
    parser._supportsRDFStar = true;
    expect(parser.parse(string)).toBeRdfIsomorphic(quads);
  }

  for (const file of fs.readdirSync(path.join(__dirname, '..', 'n3_data'))) {
    const { string, quads } = await getQuads(file, undefined, 'text/n3', 'n3_data', true);

    const parser = new Parser({ format: 'text/n3' });
    // @ts-expect-error
    // eslint-disable-next-line no-underscore-dangle
    parser._supportsRDFStar = true;
    expect(parser.parse(string)).toBeRdfIsomorphic(quads);
  }
});

it('Should throw an error on unsupported formats', async () => {
  const { quads } = await getQuads('bnodes5.ttl');

  await expect(write(quads, { format: 'text/unsupported' as any })).rejects.toThrow();
});

it('Should should strip unnecessary prefixes', async () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'data'))) {
    try {
      const { string, quads } = await getQuads(file, {
        alt: 'http://example.alt.org/',
        v1: 'http://example.v1.org/',
      });

      if (loose[file]) {
        // If loose we only need the quads to match when we re-parse the string
        expect((new Parser()).parse(string)).toBeRdfIsomorphic(quads);
      } else {
        // If not loose we expect an exact string match
        expect(string.replace(/b\d+_/g, '')).toEqual(fs.readFileSync(path.join(__dirname, '..', 'data', file)).toString());
      }
    } catch (e: any) {
      // Suppress errors on {| syntax since N3 cannot parse it for now
      if (!`${e}`.includes('Unexpected "|"')) {
        throw e;
      }
    }
  }
});

it('Should throw error named graphs in quoted and asserted triples', () => {
  expect(write([DataFactory.quad(
    DataFactory.namedNode('s'),
    DataFactory.namedNode('p'),
    DataFactory.quad(
      DataFactory.namedNode('s'),
      DataFactory.namedNode('p'),
      DataFactory.namedNode('o'),
      DataFactory.namedNode('g'),
    ),
  )])).rejects.toThrowError();

  expect(write([DataFactory.quad(
    DataFactory.namedNode('s'),
    DataFactory.namedNode('p'),
    DataFactory.quad(
      DataFactory.namedNode('s'),
      DataFactory.namedNode('p'),
      DataFactory.namedNode('o'),
      DataFactory.namedNode('g'),
    ),
    DataFactory.namedNode('g'),
  )])).rejects.toThrowError();

  expect(write([DataFactory.quad(
    DataFactory.namedNode('s'),
    DataFactory.namedNode('p'),
    DataFactory.quad(
      DataFactory.namedNode('s'),
      DataFactory.namedNode('p'),
      DataFactory.namedNode('o'),
    ),
    DataFactory.namedNode('g'),
  )])).rejects.toThrowError();

  expect(write([DataFactory.quad(
    DataFactory.namedNode('s'),
    DataFactory.namedNode('p'),
    DataFactory.quad(
      DataFactory.namedNode('s'),
      DataFactory.namedNode('p'),
      DataFactory.namedNode('o'),
    ),
    DataFactory.namedNode('g'),
  ),
  DataFactory.quad(
    DataFactory.namedNode('s'),
    DataFactory.namedNode('p'),
    DataFactory.quad(
      DataFactory.namedNode('s'),
      DataFactory.namedNode('p'),
      DataFactory.namedNode('o'),
    ),
    DataFactory.namedNode('g2'),
  )])).rejects.toThrowError();
});

describe('Relative IRIs with baseIRI', () => {
  it('Should create relative IRIs when baseIRI is provided and IRIs can be made relative', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://example.org/predicate'),
        DataFactory.namedNode('http://example.org/object'),
      ),
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        DataFactory.namedNode('http://example.org/Class'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/',
      prefixes: {
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      },
    });

    // Should use relative IRIs for subjects, predicates, and objects that can be made relative
    expect(result).toContain('<subject>');
    expect(result).toContain('<predicate>');
    expect(result).toContain('<object>');
    expect(result).toContain('<Class>');
    expect(result).toContain('a'); // rdf:type should be abbreviated

    // Should not contain absolute IRIs for things that can be made relative
    expect(result).not.toContain('<http://example.org/subject>');
    expect(result).not.toContain('<http://example.org/predicate>');
    expect(result).not.toContain('<http://example.org/object>');
    expect(result).not.toContain('<http://example.org/Class>');
  });

  it('Should keep absolute IRIs when they cannot be made relative to baseIRI', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://other.org/predicate'),
        DataFactory.namedNode('http://example.org/object'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/',
    });

    // Should use relative IRIs for same-domain IRIs
    expect(result).toContain('<subject>');
    expect(result).toContain('<object>');

    // Should keep absolute IRI for different domain
    expect(result).toContain('<http://other.org/predicate>');
  });

  it('Should handle baseIRI with path components', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/path/to/subject'),
        DataFactory.namedNode('http://example.org/path/to/predicate'),
        DataFactory.namedNode('http://example.org/path/other/object'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/path/to/',
    });

    // Should create relative IRIs based on the base path
    expect(result).toContain('<subject>');
    expect(result).toContain('<predicate>');
    expect(result).toContain('<../other/object>');
  });

  it('Should handle baseIRI with fragment', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/doc#subject'),
        DataFactory.namedNode('http://example.org/doc#predicate'),
        DataFactory.namedNode('http://example.org/doc#object'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/doc',
    });

    // Should create relative IRIs with fragments
    expect(result).toContain('<#subject>');
    expect(result).toContain('<#predicate>');
    expect(result).toContain('<#object>');
  });

  it('Should handle baseIRI ending with slash vs without slash', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/path/subject'),
        DataFactory.namedNode('http://example.org/path/predicate'),
        DataFactory.namedNode('http://example.org/path/object'),
      ),
    ];

    // Test with trailing slash
    const resultWithSlash = await write(quads, {
      baseIri: 'http://example.org/path/',
    });

    // Test without trailing slash
    const resultWithoutSlash = await write(quads, {
      baseIri: 'http://example.org/path',
    });

    // Both should create relative IRIs, but the exact form may differ
    expect(resultWithSlash).toContain('<subject>');
    expect(resultWithSlash).toContain('<predicate>');
    expect(resultWithSlash).toContain('<object>');

    expect(resultWithoutSlash).toContain('<subject>');
    expect(resultWithoutSlash).toContain('<predicate>');
    expect(resultWithoutSlash).toContain('<object>');
  });

  it('Should handle literals with datatype IRIs that can be made relative', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://example.org/predicate'),
        DataFactory.literal('value', DataFactory.namedNode('http://example.org/CustomType')),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/',
    });

    // Should use relative IRIs for subject and predicate
    expect(result).toContain('<subject>');
    expect(result).toContain('<predicate>');

    // Should use relative IRI for custom datatype
    expect(result).toContain('^^<CustomType>');
    expect(result).not.toContain('^^<http://example.org/CustomType>');
  });

  it('Should work with prefixes and baseIRI together', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        DataFactory.namedNode('http://example.org/Class'),
      ),
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://xmlns.com/foaf/0.1/name'),
        DataFactory.literal('Test Name'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/',
      prefixes: {
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        foaf: 'http://xmlns.com/foaf/0.1/',
      },
    });

    // Should use relative IRIs for same-domain IRIs
    expect(result).toContain('<subject>');
    expect(result).toContain('<Class>');

    // Should use prefixes for different domains
    expect(result).toContain('a'); // rdf:type
    expect(result).toContain('foaf:name');

    // Should not contain absolute IRIs for things that can be abbreviated
    expect(result).not.toContain('<http://example.org/subject>');
    expect(result).not.toContain('<http://example.org/Class>');
  });

  it('Should handle empty relative IRIs (same as base)', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/'),
        DataFactory.namedNode('http://example.org/predicate'),
        DataFactory.namedNode('http://example.org/'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/',
    });

    // Should use relative IRIs
    expect(result).toContain('<>'); // Empty relative IRI for the base itself
    expect(result).toContain('<predicate>');
  });

  it('Should handle query parameters and fragments in relative IRIs', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/path?param=value'),
        DataFactory.namedNode('http://example.org/predicate'),
        DataFactory.namedNode('http://example.org/path#fragment'),
      ),
    ];

    const result = await write(quads, {
      baseIri: 'http://example.org/',
    });

    // Should preserve query parameters and fragments in relative IRIs
    expect(result).toContain('<path?param=value>');
    expect(result).toContain('<predicate>');
    expect(result).toContain('<path#fragment>');
  });

  it('Should not create relative IRIs when baseIRI is not provided', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://example.org/predicate'),
        DataFactory.namedNode('http://example.org/object'),
      ),
    ];

    const result = await write(quads);

    // Should use absolute IRIs when no baseIRI is provided
    expect(result).toContain('<http://example.org/subject>');
    expect(result).toContain('<http://example.org/predicate>');
    expect(result).toContain('<http://example.org/object>');
  });

  it('Should handle invalid baseIRI gracefully', async () => {
    const quads = [
      DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://example.org/predicate'),
        DataFactory.namedNode('http://example.org/object'),
      ),
    ];

    // Test with invalid baseIRI that BaseIRI.supports() would reject
    const result = await write(quads, {
      baseIri: 'not-a-valid-iri',
    });

    // Should fall back to absolute IRIs when baseIRI is invalid
    expect(result).toContain('<http://example.org/subject>');
    expect(result).toContain('<http://example.org/predicate>');
    expect(result).toContain('<http://example.org/object>');
  });
});

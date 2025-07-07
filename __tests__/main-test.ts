import { DataFactory, Parser } from 'n3-test';
import fs from 'fs';
import path from 'path';
import { write, Options } from '../lib';
import 'jest-rdf';

async function getQuads(file: string, dirname = 'data', options: Options = {}) {
  const baseIri = 'http://example.base/ns/a/b/c/d';
  const format = options.format || 'text/turtle';
  const parser = new Parser({ rdfStar: true, format, baseIRI: baseIri } as any);
  // @ts-expect-error
  // eslint-disable-next-line no-underscore-dangle
  parser._supportsRDFStar = true;
  const prefixes = { ...options.prefixes };
  const quads = parser.parse(fs.readFileSync(path.join(__dirname, '..', dirname, file)).toString(), undefined, (prefix, iri) => {
    prefixes[prefix] = iri.value;
  });

  return {
    quads,
    string: await write(quads, {
      prefixes,
      format: options.format,
      compact: options.compact,
      baseIri,
      explicitBaseIRI: file.includes('explicit-base'),
      ordered: options.ordered,
    }),
    baseIri,
  };
}

const loose: Record<string, boolean | undefined> = {
  'bnodes5.ttl': true,
};

const options: Options[] = [];

for (const compact of [true, false]) {
  for (const ordered of [true, false]) {
    options.push({ compact, ordered });
  }
}

it.each(options)('It should correctly write turtle files [options: %s]', async (option) => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'data'))) {
    try {
      const { string, quads, baseIri } = await getQuads(file, 'data', option);

      if (loose[file] || option.ordered || option.compact) {
        // If loose we only need the quads to match when we re-parse the string
        expect((new Parser({ baseIRI: baseIri })).parse(string)).toBeRdfIsomorphic(quads);
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

it.each([options])('It should correctly write N3 files [options: %s]', async (option) => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'n3_data'))) {
    const { string, quads, baseIri } = await getQuads(file, 'n3_data', { format: 'text/n3', ...option });

    const parser = new Parser({ format: 'text/n3', baseIRI: baseIri });
    // @ts-expect-error
    // eslint-disable-next-line no-underscore-dangle
    parser._supportsRDFStar = true;
    expect(parser.parse(string)).toBeRdfIsomorphic(quads);
  }

  for (const file of fs.readdirSync(path.join(__dirname, '..', 'n3_data'))) {
    const { string, quads } = await getQuads(file, 'n3_data', { format: 'text/n3', ...option });

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
      const { string, quads } = await getQuads(file, 'data', {
        prefixes: {
          alt: 'http://example.alt.org/',
          v1: 'http://example.v1.org/',
        },
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

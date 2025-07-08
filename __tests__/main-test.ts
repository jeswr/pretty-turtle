import { DataFactory, Parser } from 'n3-test';
import type N3 from 'n3';
import fs from 'fs';
import path from 'path';
import 'jest-rdf';
// @ts-ignore
import perms from 'array-permutation';
import { write, Options } from '../lib';

async function getQuads(file: string, dirname = 'data', options: Options = {}) {
  const baseIri = 'http://example.base/ns/a/b/c/d';
  const format = options.format || 'text/turtle';
  const parser: N3.Parser = new Parser({ rdfStar: true, format, baseIRI: baseIri } as any);
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
    prefixes,
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

// Create test cases for each file and option combination
const testCases: Array<{ file: string; option: Options }> = [];
const dataFiles = fs.readdirSync(path.join(__dirname, '..', 'data'));

for (const file of dataFiles) {
  for (const option of options) {
    testCases.push({ file, option });
  }
}

function getMagnitude(num: number) {
  for (let i = 0; ; i += 1) {
    if (num < (10 ** i)) {
      return i;
    }
  }
}

it.each(testCases)('It should correctly write turtle file $file [options: $option]', async ({ file, option }) => {
  try {
    const {
      string, quads, baseIri, prefixes,
    } = await getQuads(file, 'data', option);

    if (option.ordered) {
      let i = 0;
      for (const perm of perms(quads)) {
        i += 1;
        if ((i > 5000) && i % 100 !== 0) {
          // Limit the number of permutations to test
          // eslint-disable-next-line no-continue
          continue;
        } else if (i > 10000 && i % (10 ** (getMagnitude(i) - 3)) !== 0) {
          // eslint-disable-next-line no-continue
          continue;
        } else if (i > 10 ** 6 || (i > 100 && file === 'catalog.ttl')) {
          break;
        }
        // If ordered we expect the quads to be in the same order as the original file
        await expect(write(perm, {
          format: 'text/turtle',
          baseIri: 'http://example.base/ns/a/b/c/d',
          explicitBaseIRI: file.includes('explicit-base'),
          ...option,
          prefixes,
        })).resolves.toEqual(string);
      }

      if (file === 'catalog.ttl') {
        for (let k = 0; k < 100; k += 1) {
          let j = 0;
          // Test a few random permutations
          const perm = quads.sort(() => {
            j += 1;
            return (((k + j) % 3) === 0 ? 1 : -1);
          });
          await expect(write(perm, {
            format: 'text/turtle',
            baseIri: 'http://example.base/ns/a/b/c/d',
            explicitBaseIRI: file.includes('explicit-base'),
            ...option,
            prefixes,
          })).resolves.toEqual(string);
        }
      }
    }

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
});

// Create test cases for each N3 file and option combination
const n3TestCases: Array<{ file: string; option: Options }> = [];
const n3Files = fs.readdirSync(path.join(__dirname, '..', 'n3_data'));

for (const file of n3Files) {
  for (const option of options) {
    n3TestCases.push({ file, option });
  }
}

it.each(n3TestCases)('It should correctly write N3 file $file [options: $option]', async ({ file, option }) => {
  const { string, quads, baseIri } = await getQuads(file, 'n3_data', { format: 'text/n3', ...option });

  const parser = new Parser({ format: 'text/n3', baseIRI: baseIri });
  // @ts-ignore
  // eslint-disable-next-line no-underscore-dangle
  parser._supportsRDFStar = true;
  expect(parser.parse(string)).toBeRdfIsomorphic(quads);
});

it.each(n3TestCases)('It should correctly write N3 file $file without baseIRI [options: $option]', async ({ file, option }) => {
  const { string, quads } = await getQuads(file, 'n3_data', { format: 'text/n3', ...option });

  const parser = new Parser({ format: 'text/n3' });
  // @ts-ignore
  // eslint-disable-next-line no-underscore-dangle
  parser._supportsRDFStar = true;
  expect(parser.parse(string)).toBeRdfIsomorphic(quads);
});

it('Should throw an error on unsupported formats', async () => {
  const { quads } = await getQuads('bnodes5.ttl');

  await expect(write(quads, { format: 'text/unsupported' as any })).rejects.toThrow();
});

it.each(dataFiles)('Should strip unnecessary prefixes for file %s', async (file) => {
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

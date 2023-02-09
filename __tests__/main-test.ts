import { DataFactory, Parser } from 'n3';
import fs from 'fs';
import path from 'path';
import { write } from '../lib';
import 'jest-rdf';

async function getQuads(file: string, _prefixes: Record<string, string> = {}) {
  const parser = new Parser({ rdfStar: true } as any);
  const prefixes = { ..._prefixes };
  const quads = parser.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file)).toString(), undefined, (prefix, iri) => {
    prefixes[prefix] = iri.value;
  });

  return {
    quads,
    string: await write(quads, { prefixes }),
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

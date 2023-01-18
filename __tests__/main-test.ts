import { DataFactory, Parser } from 'n3';
import fs from 'fs';
import path from 'path';
import { write } from '../lib';

async function getQuads(file: string) {
  const parser = new Parser({ rdfStar: true } as any);
  const prefixes: Record<string, string> = {};
  const quads = parser.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file)).toString(), undefined, (prefix, iri) => {
    prefixes[prefix] = iri.value;
  });

  return {
    quads,
    string: await write(quads, { prefixes }),
  };
}

it('It should correctly write turtle files', async () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'data'))) {
    const { string } = await getQuads(file);
    expect(string.replace(/b0_/g, '')).toEqual(fs.readFileSync(path.join(__dirname, '..', 'data', file)).toString());
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

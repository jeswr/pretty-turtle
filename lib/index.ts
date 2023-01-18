import { DataFactory as DF } from 'n3';
import type { Quad } from '@rdfjs/types';
import Store from './volatile-store';
import { TTLWriter } from './ttlwriter';
import Writer from './writer';

export interface Options {
  prefixes: Record<string, string>
}

export async function write(quads: Quad[], options?: Options): Promise<string> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise<string>(async (resolve, reject) => {
    try {
      let s = '';
      const volatileStore = new Store(quads);

      const graphs = volatileStore.getGraphs(null, null, null);

      if (graphs.length > 1) {
        throw new Error('More than one graph found - can serialize in the default graph');
      }

      if (graphs.length === 1 && !graphs[0].equals(DF.defaultGraph())) {
        throw new Error(`Expected all triples to be in the default graph, instead triples were in ${graphs[0].value}`);
      }

      const w = new Writer({
        write: (chunk: string) => {
          s += chunk;
        },
        end: () => {
          resolve(s);
        },
      });
      const writer = new TTLWriter(
        volatileStore,
        w,
        options?.prefixes,
      );
      await writer.write();
    } catch (e) {
      reject(e);
    }
  });
}

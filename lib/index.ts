import type { Quad } from '@rdfjs/types';
import Store from './volatile-store';
import { TTLWriter, Options } from './ttlwriter';
import Writer from './writer';

export { Options };

export async function write(quads: Quad[], options?: Options): Promise<string> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise<string>(async (resolve, reject) => {
    try {
      let s = '';
      const volatileStore = new Store(quads);

      const w = new Writer({
        write: (chunk: string) => {
          s += chunk;
        },
        end: () => {
          resolve(s);
        },
        compact: options?.compact,
      });
      const writer = new TTLWriter(
        volatileStore,
        w,
        options?.prefixes,
        options,
      );
      await writer.write();
    } catch (e) {
      reject(e);
    }
  });
}

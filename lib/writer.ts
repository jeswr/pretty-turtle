/* eslint-disable no-unused-vars */
type writeFunc = (chunk: string, encoding: string, done?: Function) => void;

/**
 * Convenience class used to write chunks
 */
export default class Writer {
  private indents = 0;

  private write: writeFunc;

  end: (done?: Function) => void;

  constructor(options: { write: writeFunc, end: (done?: Function) => void }) {
    this.write = options.write;
    this.end = options.end;
  }

  indent() {
    this.indents += 1;
    return this;
  }

  deindent() {
    this.indents -= 1;
    return this;
  }

  add(s: string) {
    this.write(s, 'utf-8');
    return this;
  }

  newLine(no: number) {
    this.write('\n'.repeat(no) + '  '.repeat(this.indents), 'utf-8');
    return this;
  }
}

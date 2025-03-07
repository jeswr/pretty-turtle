/* eslint-disable no-unused-vars */
/* eslint-disable lines-between-class-members */
/* eslint-disable no-dupe-class-members */
/**
 * Generates a SHACLC file stream from a quad stream, since SHACLC is
 * lossy with respect to N3, a stream of quads that could not be
 * written is also output.
 */
import type * as RDF from '@rdfjs/types';
import { DataFactory as DF, Quad, Term } from 'n3';
import { termToString } from 'rdf-string-ttl';
import Store from './volatile-store';
import Writer from './writer';

export interface Options {
  prefixes?: Record<string, string>;
  format?: string;
  compact?: boolean;
  isImpliedBy?: boolean;
}

function getNamespace(str: string) {
  return /^[^]*[#/]/.exec(str)?.[0];
}

export class TTLWriter {
  private isN3 = false;

  private isImpliedBy = false;

  private prefixes: { [prefix: string]: string } = {};

  private prefixRev: { [namespace: string]: string } = {};

  private writer: Writer;

  private explicitBnodes = new Set<string>();

  private currentGraph: RDF.Term = DF.defaultGraph();

  constructor(
    // eslint-disable-next-line no-unused-vars
    private store: Store,
    // eslint-disable-next-line no-unused-vars
    writer: Writer,
    prefixes: { [prefix: string]: string } = {},
    options: Options = {},
  ) {
    switch (options?.format) {
      case 'text/n3':
        this.isN3 = true;
        break;
      case undefined:
      case 'text/turtle':
        break;
      default:
        throw new Error(`Unsupported format: ${options?.format}`);
    }

    this.isImpliedBy = options?.isImpliedBy || false;

    if (!this.isN3) {
      const graphs = store.getGraphs(null, null, null);

      if (graphs.length > 1) {
        throw new Error('More than one graph found - can serialize in the default graph');
      }

      if (graphs.length === 1 && !graphs[0].equals(DF.defaultGraph())) {
        throw new Error(`Expected all triples to be in the default graph, instead triples were in ${graphs[0].value}`);
      }
    }

    const terms: Set<string> = new Set();

    function addTerm(term: RDF.Term) {
      if (term.termType === 'NamedNode') {
        terms.add(term.value);
      } else if (term.termType === 'Quad') {
        addTerm(term.subject);
        addTerm(term.predicate);
        addTerm(term.object);
        addTerm(term.graph);
      }
    }

    for (const list of [
      this.store.getSubjects(null, null, null),
      this.store.getPredicates(null, null, null),
      this.store.getObjects(null, null, null),
    ]) {
      for (const node of list) {
        addTerm(node);
      }
    }

    const termList = [...terms];

    for (const key of Object.keys(prefixes)) {
      if (termList.some((term) => term.startsWith(prefixes[key]))) {
        const iri = prefixes[key];
        this.prefixRev[iri] = key;
        this.prefixes[key] = iri;
      }
    }
    this.writer = writer;
  }

  async write() {
    // Write the prefixes
    for (const prefix in this.prefixes) {
      if (typeof prefix === 'string') {
        this.writer.add(`@prefix ${prefix}: <${this.prefixes[prefix]}> .`);
        this.writer.newLine(1);
      }
    }

    this.writer.newLine(1);

    // TODO: See if we need this in any regard
    // NOTE: We really should be using the same logic as below to determine
    // the order to print things
    // First write annotated quads
    // for (const subject of this.store.getSubjects(null, null, null)) {
    //   // Test if the quad is in the store as an annotated statement
    //   // @ts-ignore
    //   if (subject.termType === 'Quad' && this.store.has(subject)) {
    //     await this.writeTurtleSubject(subject);
    //   }
    // }

    await this.writeGraph();

    this.writer.end();
  }

  private async writeGraph() {
    // First write Named Node subjects
    for (const subject of this.store.getSubjects(null, null, this.currentGraph)) {
      if (subject.termType === 'NamedNode') {
        await this.writeTurtleSubject(subject);
      }
    }

    // Then write blank node subjects that can be anonymized at the top level
    for (const subject of this.store.getSubjects(null, null, this.currentGraph)) {
      if (
        subject.termType === 'BlankNode'
        && !this.explicitBnodes.has(subject.value)
        // Ensure still in store as subject
        && this.store.getQuads(subject, null, null, this.currentGraph).length > 0
        && this.store.getQuads(null, subject, null, this.currentGraph).length === 0
        && this.store.getQuads(null, null, subject, this.currentGraph).length === 0
      ) {
        await this.writeTurtleSubject(subject, true);
      }
    }

    // Next write blank nodes that cannot be anonymized within another set of statements
    // (it is not an explicit bnode,
    // occurs as the object of one quad,
    // and only as the subject in other quads)
    for (const subject of this.store.getSubjects(null, null, this.currentGraph)) {
      // Ensure still in store as subject
      if (
        subject.termType === 'BlankNode' && !(
          this.store.getQuads(null, null, subject, this.currentGraph).length !== 1
          || !this.store.getQuads(null, null, subject, this.currentGraph)[0].subject.equals(subject)
        )
      ) {
        this.explicitBnodes.add(subject.value);
        await this.writeTurtleSubject(subject);
      }
    }

    for (const subject of this.store.getSubjects(null, null, this.currentGraph)) {
      // Ensure still in store as subject
      if (this.store.getQuads(subject, null, null, this.currentGraph).length > 0) {
        if (subject.termType === 'BlankNode') {
          this.explicitBnodes.add(subject.value);
        }
        await this.writeTurtleSubject(subject);
      }
    }
  }

  private async writeNestedGraph(term:Term) {
    if (this.isN3 && this.store.getQuads(null, null, null, term).length !== 0) {
      const { currentGraph } = this;
      this.currentGraph = term;
      this.writer.add('{');
      this.writer.indent();
      this.writer.newLine(1);
      await this.writeGraph();
      this.writer.deindent();
      this.writer.newLine(1);
      this.writer.add('}');
      this.currentGraph = currentGraph;
      return true;
    }
    return false;
  }

  private async writeTurtleSubject(term: Term, anonymizeSubject = false) {
    if (await this.writeNestedGraph(term)) {
      // noop
    } else if (this.isN3 && await this.writeList(term, true)) {
      // noop
    } else if (anonymizeSubject) {
      this.writer.add('[]');
    } else {
      this.writer.add(await this.termToString(term));
    }
    this.writer.add(' ');
    this.writer.indent();
    await this.writeTurtlePredicates(term);
    this.writer.deindent();
    this.writer.add(' .');
    this.writer.newLine(this.store.size === 0 ? 1 : 2);
  }

  private async termToString(term: Term | RDF.Quad): Promise<string> {
    if (term.termType === 'NamedNode') {
      if (this.isN3 && term.value === 'http://www.w3.org/2000/10/swap/log#implies') {
        return '=>';
      }
      if (this.isN3 && this.isImpliedBy && term.value === 'http://www.w3.org/2000/10/swap/log#isImpliedBy') {
        return '<=';
      }
      const namespace = getNamespace(term.value);
      if (namespace && namespace in this.prefixRev) {
        if (namespace in this.prefixRev) {
          return `${this.prefixRev[namespace]}:${term.value.slice(namespace.length)}`;
        }
      }
    } if (term.termType === 'Literal' && (term.datatypeString === 'http://www.w3.org/2001/XMLSchema#integer'
      || term.datatypeString === 'http://www.w3.org/2001/XMLSchema#boolean')) {
      return term.value;
    }
    if (term.termType === 'Quad') {
      if (!term.graph.equals(DF.defaultGraph())) {
        throw new Error('Default graph expected on nested quads');
      }

      const anon = (_term: Term) => {
        if (_term.termType === 'BlankNode' && !this.explicitBnodes.has(_term.value)) {
          return '[]';
        }
        return this.termToString(_term as any);
      };

      return `<<${await anon(term.subject as any)} ${term.predicate.termType === 'NamedNode'
          && term.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
        ? 'a'
        : await this.termToString(term.predicate as any)} ${await anon(term.object as any)}>>`;
    }
    return termToString(term);
  }

  private async writeTurtlePredicates(term: Term) {
    return this.writeGivenTurtlePredicates(
      term,
      this.store.getPredicates(term, null, this.currentGraph),
    );
  }

  private async writeGivenTurtlePredicates(term: Term, predicates: Term[]) {
    let semi = false;

    if (predicates.some(
      (predicate) => predicate.equals(DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')),
    )) {
      const types = this.store.getObjectsOnce(
        term,
        DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        this.currentGraph,
      );
      if (types.length > 0) {
        semi = true;
        this.writer.add('a ');
        await this.writeTurtleObjects(types);
      }
    }

    for (const predicate of predicates) {
      if (!predicate.equals(DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'))) {
        if (semi) {
          this.writer.add(' ;');
          this.writer.newLine(1);
        } else {
          semi = true;
        }

        this.writer.add(
          await this.termToString(predicate),
        );
        this.writer.add(' ');
        await this.writeTurtleObjects(
          this.store.getObjectsOnce(term, predicate, this.currentGraph),
          term,
          predicate,
        );
      }
    }
  }

  private async writeTurtleObjects(objects: Term[], subject?: Term, predicate?: Term) {
    const blankObjects: Term[] = [];
    const nonBlankObjects: Term[] = [];
    for (const object of objects) {
      if (object.termType === 'BlankNode'
        && [
          ...this.store.match(null, null, object, this.currentGraph as any),
          ...this.store.match(null, object, null, this.currentGraph as any),
        ].length === 0
        && !this.explicitBnodes.has(object.value)
      ) {
        blankObjects.push(object);
      } else {
        if (object.termType === 'BlankNode') {
          this.explicitBnodes.add(object.value);
        }
        nonBlankObjects.push(object);
      }
    }

    let comma = false;
    let lastQuad = false;
    this.writer.indent();
    for (const object of nonBlankObjects) {
      if (comma) {
        this.writer.add(', ');
        if (lastQuad) {
          // Start a new line for multiple quad objects
          this.writer.newLine(1);
        }
      }

      this.writer.add(await this.termToString(object));
      // @ts-ignore (n3.js type error?)
      lastQuad = object.termType === 'Quad';

      if (subject && predicate) {
        const quad = DF.quad(subject as any, predicate as any, object as any);
        if (this.store.getQuads(quad, null, null, this.currentGraph).length > 0) {
          this.writer.add(' {| ');
          await this.writeTurtlePredicates(quad as any);
          this.writer.add(' |}');
        }
      }

      comma = true;
    }
    this.writer.deindent();

    // this.writer.add(
    //   (await Promise.all(nonBlankObjects.map((object) => this.termToString(object)))).join(', '),
    // );

    // let comma = nonBlankObjects.length > 0;

    if (blankObjects.length > 0) {
      for (const blank of blankObjects) {
        if (comma) {
          this.writer.add(', ');
        } else {
          comma = true;
        }
        if (await this.writeNestedGraph(blank)) {
          // noop
        } else if (!(await this.writeList(blank))) {
          this.writer.add('[');
          if (this.store.getQuads(blank, null, null, this.currentGraph).length > 0) {
            this.writer.indent();
            this.writer.newLine(1);
            await this.writeTurtlePredicates(blank);
            this.writer.deindent();
            this.writer.newLine(1);
          }
          this.writer.add(']');
        }

        // Write annotations as appropriate
        if (subject && predicate) {
          const quad = DF.quad(subject as any, predicate as any, blank as any);
          if (this.store.getQuads(quad, null, null, this.currentGraph).length > 0) {
            this.writer.add(' {| ');
            await this.writeTurtlePredicates(quad as any);
            this.writer.add(' |}');
          }
        }
      }
    }
  }

  private async writeList(object: Term, isSubject = false) {
    let node = object;
    const elems: Term[] = [];
    const quads: Quad[] = [];

    while (!node.equals(DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'))) {
      const first = this.store.getQuadsOnce(
        node,
        DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'),
        null,
        this.currentGraph,
      );
      const rest = this.store.getQuadsOnce(
        node,
        DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'),
        null,
        this.currentGraph,
      );

      quads.push(
        ...first,
        ...rest,
      );

      if (first.length !== 1
        || rest.length !== 1
        || (this.store.getQuads(node, null, null, this.currentGraph).length !== 0 && !isSubject)
      ) {
        this.store.addQuads(quads);
        return false;
      }

      elems.push(first[0].object);
      node = rest[0].object;
      // eslint-disable-next-line no-param-reassign
      isSubject = false;
    }

    let space = false;

    this.writer.add('(');
    for (const elem of elems) {
      if (space) {
        this.writer.add(' ');
      } else {
        space = true;
      }
      await this.writeTurtleObjects([elem]);
    }
    this.writer.add(')');

    return true;
  }
}

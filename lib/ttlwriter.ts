/* eslint-disable no-unused-vars */
/* eslint-disable lines-between-class-members */
/* eslint-disable no-dupe-class-members */
/**
 * Generates a SHACLC file stream from a quad stream, since SHACLC is
 * lossy with respect to N3, a stream of quads that could not be
 * written is also output.
 */
import type * as RDF from '@rdfjs/types';
import { DataFactory, Quad, Term } from 'n3';
import { termToString } from 'rdf-string-ttl';
import Store from './volatile-store';
import Writer from './writer';

function getNamespace(str: string) {
  return /^[^]*[#/]/.exec(str)?.[0];
}

export class TTLWriter {
  private prefixes: { [prefix: string]: string } = {};

  private prefixRev: { [namespace: string]: string } = {};

  private writer: Writer;

  private explicitBnodes = new Set<string>();

  constructor(
    // eslint-disable-next-line no-unused-vars
    private store: Store,
    // eslint-disable-next-line no-unused-vars
    writer: Writer,
    prefixes: { [prefix: string]: string } = {},
  ) {
    for (const key of Object.keys(prefixes)) {
      const iri = prefixes[key];
      this.prefixRev[iri] = key;
      this.prefixes[key] = iri;
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

    // First write Named Node subjects
    for (const subject of this.store.getSubjects(null, null, null)) {
      if (subject.termType === 'NamedNode') {
        await this.writeTurtleSubject(subject);
      }
    }

    // Then write blank node subjects that can be anonymized at the top level
    for (const subject of this.store.getSubjects(null, null, null)) {
      if (
        subject.termType === 'BlankNode'
        && !this.explicitBnodes.has(subject.value)
        // Ensure still in store as subject
        && this.store.getQuads(subject, null, null, null).length > 0
        && this.store.getQuads(null, subject, null, null).length === 0
        && this.store.getQuads(null, null, subject, null).length === 0
      ) {
        await this.writeTurtleSubject(subject, true);
      }
    }

    // Next write blank nodes that cannot be anonymized within another set of statements
    // (it is not an explicit bnode,
    // occurs as the object of one quad,
    // and only as the subject in other quads)
    for (const subject of this.store.getSubjects(null, null, null)) {
      // Ensure still in store as subject
      if (
        subject.termType === 'BlankNode' && !(
          this.store.getQuads(null, null, subject, null).length !== 1
          || !this.store.getQuads(null, null, subject, null)[0].subject.equals(subject)
        )
      ) {
        this.explicitBnodes.add(subject.value);
        await this.writeTurtleSubject(subject);
      }
    }

    for (const subject of this.store.getSubjects(null, null, null)) {
      // Ensure still in store as subject
      if (this.store.getQuads(subject, null, null, null).length > 0) {
        if (subject.termType === 'BlankNode') {
          this.explicitBnodes.add(subject.value);
        }
        await this.writeTurtleSubject(subject);
      }
    }

    this.writer.end();
  }

  private async writeTurtleSubject(term: Term, anonymizeSubject = false) {
    if (anonymizeSubject) {
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
      if (!term.graph.equals(DataFactory.defaultGraph())) {
        throw new Error('Default graph expected on nested quads');
      }
      return `<<${await this.termToString(term.subject as any)} ${term.predicate.termType === 'NamedNode'
          && term.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
        ? 'a'
        : await this.termToString(term.predicate as any)} ${await this.termToString(term.object as any)}>>`;
    }
    return termToString(term);
  }

  private async writeTurtlePredicates(term: Term) {
    return this.writeGivenTurtlePredicates(term, this.store.getPredicates(term, null, null));
  }

  private async writeGivenTurtlePredicates(term: Term, predicates: Term[]) {
    let semi = false;

    if (predicates.some(
      (predicate) => predicate.equals(DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')),
    )) {
      const types = this.store.getObjectsOnce(
        term,
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        null,
      );
      if (types.length > 0) {
        semi = true;
        this.writer.add('a ');
        await this.writeTurtleObjects(types);
      }
    }

    for (const predicate of predicates) {
      if (!predicate.equals(DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'))) {
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
          this.store.getObjectsOnce(term, predicate, null),
        );
      }
    }
  }

  private async writeTurtleObjects(objects: Term[]) {
    const blankObjects: Term[] = [];
    const nonBlankObjects: Term[] = [];
    for (const object of objects) {
      if (object.termType === 'BlankNode'
        && [
          ...this.store.match(null, null, object),
          ...this.store.match(null, object, null),
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

    this.writer.add(
      (await Promise.all(nonBlankObjects.map((object) => this.termToString(object)))).join(', '),
    );

    let comma = nonBlankObjects.length > 0;

    if (blankObjects.length > 0) {
      for (const blank of blankObjects) {
        if (comma) {
          this.writer.add(', ');
        } else {
          comma = true;
        }
        if (!(await this.writeList(blank))) {
          this.writer.add('[');
          if (this.store.getQuads(blank, null, null, null).length > 0) {
            this.writer.indent();
            this.writer.newLine(1);
            await this.writeTurtlePredicates(blank);
            this.writer.deindent();
            this.writer.newLine(1);
          }
          this.writer.add(']');
        }
      }
    }
  }

  private async writeList(object: Term) {
    let node = object;
    const elems: Term[] = [];
    const quads: Quad[] = [];

    while (!node.equals(DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'))) {
      const first = this.store.getQuadsOnce(
        node,
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'),
        null,
        null,
      );
      const rest = this.store.getQuadsOnce(
        node,
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'),
        null,
        null,
      );

      quads.push(
        ...first,
        ...rest,
      );

      if (first.length !== 1
        || rest.length !== 1
        || this.store.getQuads(node, null, null, null).length !== 0
      ) {
        this.store.addQuads(quads);
        return false;
      }

      elems.push(first[0].object);
      node = rest[0].object;
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

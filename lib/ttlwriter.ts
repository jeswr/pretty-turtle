/* eslint-disable no-unused-vars */
/* eslint-disable lines-between-class-members */
/* eslint-disable no-dupe-class-members */
/**
 * Generates a SHACLC file stream from a quad stream, since SHACLC is
 * lossy with respect to N3, a stream of quads that could not be
 * written is also output.
 */
import type * as RDF from '@rdfjs/types';

import {
  DataFactory as DF, Quad, Term,
  // @ts-expect-error BaseIRI type not exported in n3.js but exists at runtime
  BaseIRI,
} from 'n3';
import { termToString } from 'rdf-string-ttl';
import Store from './volatile-store';
import Writer from './writer';
import { escapeStringRDF, escapeIRI } from './escape';

const compareTerms = (a: RDF.Term, b: RDF.Term): number => {
  for (const key of ['termType', 'value'] as const) {
    const comparison = a[key].localeCompare(b[key]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  if (a.termType === 'Literal' && b.termType === 'Literal') {
    if (a.datatype.value !== b.datatype.value) {
      return a.datatype.value.localeCompare(b.datatype.value);
    }
    if (a.language !== b.language) {
      return a.language.localeCompare(b.language);
    }
  }
  return 0;
};

/**
 * Configuration options for the turtle/N3 writer
 */
export interface Options {
  /**
   * A map of prefix names to their corresponding namespace URIs for compacting URIs in the output.
   *
   * @example
   * ```ts
   * {
   *   ex: "http://example.org/",
   *   foaf: "http://xmlns.com/foaf/0.1/",
   *   schema: "https://schema.org/"
   * }
   * ```
   */
  prefixes?: Record<string, string>;

  /**
   * Specifies the output format.
   *
   * @defaultValue 'text/turtle'
   *
   * Supported values:
   * - `'text/turtle'` - Standard Turtle format
   * - `'text/n3'` - Notation3 format
   */
  format?: string;

  /**
   * When set to `true`, produces a more compact output by
   * removing unnecessary whitespace and line breaks.
   *
   * @defaultValue false
   */
  compact?: boolean;

  /**
   * Used to opt in to using isImpliedBy syntax (`<=`) when in N3 mode.
   *
   * @defaultValue false
   */
  isImpliedBy?: boolean;

  /**
   * Sets the base IRI for the document, which can be used to resolve relative IRIs.
   *
   * @example "http://example.org/base/"
   */
  baseIri?: string;

  /**
   * When set to `true`, explicitly writes the `@base` directive
   * in the output even if a base IRI is provided.
   *
   * @defaultValue false
   *
   * @example
   * When enabled, output will include: `@base <http://example.org/base/> .`
   */
  explicitBaseIRI?: boolean;

  /**
   * When set to `true`, the output will be ordered.
   *
   * @defaultValue false
   *
   * @example
   * When enabled, the output will maintain a consistent order of triples.
   */
  ordered?: boolean;
}

function getNamespace(str: string) {
  return /^[^]*[#/]/.exec(str)?.[0];
}

const defaultPrefixes: { [prefix: string]: string } = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  sh: 'http://www.w3.org/ns/shacl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ex: 'http://example.com/ns#',
};

const WELL_DEFINED_DATATYPES = ['http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'http://www.w3.org/2001/XMLSchema#string', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString'];

export class TTLWriter {
  private isN3 = false;

  private isImpliedBy = false;

  private prefixes: { [prefix: string]: string } = {};

  private prefixRev: { [namespace: string]: string } = {};

  private writer: Writer;

  private explicitBnodes = new Set<string>();

  private currentGraph: RDF.Term = DF.defaultGraph();

  private baseIRI: BaseIRI | null = null;

  private baseIRIString: string | undefined = undefined;

  private explicitBaseIRI = false;

  private ordered: boolean = false;

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
    this.explicitBaseIRI = options?.explicitBaseIRI || false;

    if (options.baseIri && BaseIRI.supports(options.baseIri)) {
      this.baseIRI = new BaseIRI(options.baseIri);
      this.baseIRIString = options.baseIri;
    }

    if (!this.isN3) {
      const graphs = store.getGraphs(null, null, null);

      if (graphs.length > 1) {
        throw new Error('More than one graph found - can serialize in the default graph');
      }

      if (graphs.length === 1 && !graphs[0].equals(DF.defaultGraph())) {
        throw new Error(`Expected all triples to be in the default graph, instead triples were in ${graphs[0].value}`);
      }
    }

    this.ordered = options?.ordered || false;

    const terms: Set<string> = new Set();

    function addTerm(term: RDF.Term) {
      if (term.termType === 'NamedNode') {
        terms.add(term.value);
      } else if (term.termType === 'Quad') {
        addTerm(term.subject);
        if (term.predicate.termType !== 'NamedNode' || term.predicate.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
          addTerm(term.predicate);
        }
        addTerm(term.object);
        addTerm(term.graph);
      } else if (term.termType === 'Literal' && term.datatype.termType === 'NamedNode' && !WELL_DEFINED_DATATYPES.includes(term.datatype.value)) {
        addTerm(term.datatype);
      }
    }

    for (const list of [
      this.store.getSubjects(null, null, null),
      this.store.getPredicates(null, null, null).filter((p) => p.termType !== 'NamedNode' || p.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      this.store.getObjects(null, null, null),
    ]) {
      for (const node of list) {
        addTerm(node);
      }
    }

    const termList = [...terms];
    termList.sort();

    const allPrefixKeys = [...Object.keys(prefixes), ...Object.keys(defaultPrefixes)];

    if (this.ordered) {
      // Sort prefixes alphabetically if ordered is true
      allPrefixKeys.sort();
    }

    for (const key of allPrefixKeys) {
      const iri = prefixes[key] || defaultPrefixes[key];
      if (!(iri in this.prefixRev) && termList.some((term) => term.startsWith(iri))) {
        this.prefixRev[iri] = key;
        this.prefixes[key] = iri;
      }
    }
    this.writer = writer;
  }

  async write() {
    // Write the BASE statement if explicitBaseIRI is enabled
    if (this.explicitBaseIRI && typeof this.baseIRIString === 'string') {
      this.writer.add(`@base <${escapeIRI(this.baseIRIString)}> .`);
      this.writer.newLine(1);
    }

    // Write the prefixes
    const prefixes = Object.keys(this.prefixes);

    if (this.ordered) {
      // Sort prefixes alphabetically if ordered is true
      prefixes.sort();
    }

    for (const prefix of prefixes) {
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
    const subjects = this.store.getSubjects(null, null, this.currentGraph);
    if (this.ordered) {
      // Sort subjects alphabetically if ordered is true
      subjects.sort((a, b) => compareTerms(a, b));
    }
    for (const subject of subjects) {
      if (subject.termType === 'NamedNode') {
        await this.writeTurtleSubject(subject);
      }
    }

    // Then write blank node subjects that can be anonymized at the top level

    const bnodes = this.store.getSubjects(null, null, this.currentGraph).filter((s) => s.termType === 'BlankNode');
    if (this.ordered) {
      // Sort blank nodes alphabetically if ordered is true
      bnodes.sort((a, b) => compareTerms(a, b));
    }

    for (const subject of bnodes) {
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

    const b2nodes = this.store.getSubjects(null, null, this.currentGraph).filter((s) => s.termType === 'BlankNode');
    if (this.ordered) {
      // Sort blank nodes alphabetically if ordered is true
      b2nodes.sort((a, b) => compareTerms(a, b));
    }

    for (const subject of b2nodes) {
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

    const subjects2 = this.store.getSubjects(null, null, this.currentGraph);

    if (this.ordered) {
      // Sort subjects alphabetically if ordered is true
      subjects2.sort((a, b) => compareTerms(a, b));
    }

    for (const subject of subjects2) {
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
    }
    if (term.termType === 'NamedNode' && this.baseIRI !== null) {
      return `<${escapeIRI(this.baseIRI.toRelative(term.value))}>`;
    }
    if (term.termType === 'Literal' && (term.datatypeString === 'http://www.w3.org/2001/XMLSchema#integer'
      || term.datatypeString === 'http://www.w3.org/2001/XMLSchema#boolean')) {
      return term.value;
    }
    if (term.termType === 'Quad') {
      if (!term.graph.equals(DF.defaultGraph())) {
        throw new Error('Default graph expected on nested quads');
      }
      return `<<${await this.termToString(term.subject as Term)} ${term.predicate.termType === 'NamedNode'
          && term.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
        ? 'a'
        : await this.termToString(term.predicate as Term)} ${await this.termToString(term.object as Term)}>>`;
    }

    if (term.termType === 'Literal' && !WELL_DEFINED_DATATYPES.includes(term.datatype.value)) {
      return `"${escapeStringRDF(term.value)}"^^${await this.termToString(term.datatype)}`;
    }

    return termToString(term);
  }

  private async writeTurtlePredicates(term: Term) {
    const predicates = this.store.getPredicates(term, null, this.currentGraph);

    if (this.ordered) {
      // Sort predicates alphabetically if ordered is true
      predicates.sort((a, b) => compareTerms(a, b));
    }

    return this.writeGivenTurtlePredicates(
      term,
      predicates,
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

      if (this.ordered) {
        // Sort types alphabetically if ordered is true
        types.sort((a, b) => compareTerms(a, b));
      }

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

        const objects = this.store.getObjectsOnce(term, predicate, this.currentGraph);
        if (this.ordered) {
          // Sort objects alphabetically if ordered is true
          objects.sort((a, b) => compareTerms(a, b));
        }

        await this.writeTurtleObjects(
          objects,
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
          ...this.store.match(null, null, object, this.currentGraph as Term),
          ...this.store.match(null, object, null, this.currentGraph as Term),
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

    if (this.ordered) {
      // Sort objects alphabetically if ordered is true
      blankObjects.sort((a, b) => compareTerms(a, b));
      nonBlankObjects.sort((a, b) => compareTerms(a, b));
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
      // @ts-expect-error Property 'termType' does not exist due to n3.js type definitions
      lastQuad = object.termType === 'Quad';

      if (subject && predicate) {
        const quad = DF.quad(
          subject as RDF.Quad_Subject,
          predicate as RDF.Quad_Predicate,
          object as RDF.Quad_Object,
        );
        if (this.store.getQuads(quad, null, null, this.currentGraph).length > 0) {
          this.writer.add(' {| ');
          await this.writeTurtlePredicates(quad as unknown as Term);
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
          const quad = DF.quad(
            subject as RDF.Quad_Subject,
            predicate as RDF.Quad_Predicate,
            blank as RDF.Quad_Object,
          );
          if (this.store.getQuads(quad, null, null, this.currentGraph).length > 0) {
            this.writer.add(' {| ');
            await this.writeTurtlePredicates(quad as unknown as Term);
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

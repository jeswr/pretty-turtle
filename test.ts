import { Parser } from 'n3';
import { write } from './lib';

const path = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ns3: <https://example.org/ns/3/> .
@prefix context: <https://example.org/ns/3/context/> .
@prefix math: <http://www.w3.org/2000/10/swap/math#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ns2: <https://example.org/ns/2/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sc: <http://localhost:3000/semanticContext/01_01_2023#> .
@prefix tod: <http://localhost:3000/contextRules/trueOnDate#> .

{
  (_:b1 31622400) math:integerQuotient ?age .
  (?date _:b2) math:difference _:b1 .
  ?s foaf:birthday _:b2 .
} => {
  <<?s foaf:age ?age>> ns3:trueOnDate ?date .
} .
`

const parser = new Parser({ format: 'text/n3' });
// @ts-ignore
parser._supportsRDFStar = true;
write(parser.parse(path), { format: 'text/n3', prefixes: {
  math: 'http://www.w3.org/2000/10/swap/math#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  ns3: 'https://example.org/ns/3/',
} }).then(console.log)

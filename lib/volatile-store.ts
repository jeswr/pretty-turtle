/* eslint-disable camelcase */
/**
 * Convenience class that extends the n3 store API that deletes
 * quads as they are extracted from the store
 */
import {
  Store, OTerm, Quad, Quad_Object,
} from 'n3';

export default class VolitileStore extends Store {
  getQuadsOnce(s: OTerm, p: OTerm, o: OTerm, g: OTerm): Quad[] {
    const quads = this.getQuads(s, p, o, g);
    this.removeQuads(quads);
    return quads;
  }

  getObjectsOnce(s: OTerm, p: OTerm, g: OTerm): Quad_Object[] {
    return this.getQuadsOnce(s, p, null, g).map((term) => term.object);
  }
}

// Copied from https://github.com/rubensworks/rdf-string-ttl.js/blob/31fe9415569cfbde2aec661e4a2a8ae67e81782b/lib/TermUtil.ts#L229

const escapes = new Map([
  ['\\', '\\\\'],
  ['"', '\\"'],
  ['\t', '\\t'],
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\b', '\\b'],
  ['\f', '\\f'],
]);

function replaceEscapedCharacter(character: string): string {
  // Try simplest case first, get replacement for character
  const result = escapes.get(character);
  if (!result) {
    if (character.length === 1) {
      // Single unicode charachters, i.e. not a surrogate pair
      const code = character.charCodeAt(0).toString(16);
      return `${'\\u0000'.slice(0, -code.length)}${code}`;
    }
    // Surrogate pairs
    const code = ((character.charCodeAt(0) - 0xD8_00) * 0x4_00 + character.charCodeAt(1) + 0x24_00)
      .toString(16);
    return `${'\\U00000000'.slice(0, -code.length)}${code}`;
  }
  return result;
}

// eslint-disable-next-line no-control-regex
const escapePattern = /["\\\t\n\r\b\f\u0000-\u0019]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

export function escapeStringRDF(stringValue: string): string {
  if (escapePattern.test(stringValue)) {
    return stringValue.replace(escapePattern, replaceEscapedCharacter);
  }
  return stringValue;
}

export function escapeIRI(iriValue: string): string {
  return iriValue.replace(escapePattern, replaceEscapedCharacter);
}

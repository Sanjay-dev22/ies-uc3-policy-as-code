// Minimal deterministic JSON canonicalization (subset of RFC 8785 JCS):
// recursively sort object keys, no insignificant whitespace. Sufficient for our
// flat numeric/string/array shapes. A verifier in another language would need
// this exact same rule to get the same bytes out (only the Node verifier exists
// in this repository; evaluator.py computes bills, it does not verify signatures).
export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const body = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k]));
  return "{" + body.join(",") + "}";
}

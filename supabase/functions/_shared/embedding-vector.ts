/** Reject malformed provider output before scoring or sending a pgvector query. */
export function embeddingVector(value: unknown): number[] {
  if (!Array.isArray(value) && !(value instanceof Float32Array) && !(value instanceof Float64Array)) {
    throw new Error('Embedding output must be a numeric vector');
  }
  const vector = Array.from(value);
  if (vector.length !== 384 || !vector.every((element) => typeof element === 'number' && Number.isFinite(element))) {
    throw new Error('Embedding output must contain 384 finite numbers');
  }
  return vector;
}

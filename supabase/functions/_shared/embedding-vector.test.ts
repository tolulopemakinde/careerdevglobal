import { embeddingVector } from './embedding-vector.ts';
Deno.test('gte-small array and typed vector accepted', () => {
  for (const vector of [Array(384).fill(0), new Float32Array(384), new Float64Array(384)]) {
    if (embeddingVector(vector).length !== 384) throw new Error('Valid vector rejected');
  }
});
Deno.test('provider error objects and wrong dimensions rejected', () => {
  for (const vector of [{ error: 'upstream failure' }, null, [], Array(383).fill(0), Array(385).fill(0)]) {
    let denied=false; try { embeddingVector(vector); } catch { denied=true; }
    if (!denied) throw new Error('Malformed provider output accepted');
  }
});
Deno.test('nonnumeric and nonfinite embeddings rejected', () => {
  for (const item of [NaN, Infinity, -Infinity, '0', null]) {
    const vector=Array(384).fill(0); vector[0]=item;
    let denied=false; try { embeddingVector(vector); } catch { denied=true; }
    if (!denied) throw new Error('Unsafe vector element accepted');
  }
});

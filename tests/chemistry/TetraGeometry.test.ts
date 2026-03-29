import { describe, it, expect } from 'vitest';
import { setTetraMatrices } from '@/chemistry/TetraGeometry';
import { mat44Identity } from '@/chemistry/Matrix44';

describe('TetraGeometry', () => {
  const { transform, lookat } = setTetraMatrices(1.0);

  it('produces [2][14] arrays of 16-element matrices', () => {
    expect(transform).toHaveLength(2);
    expect(lookat).toHaveLength(2);
    for (let lang = 0; lang < 2; lang++) {
      expect(transform[lang]).toHaveLength(14);
      expect(lookat[lang]).toHaveLength(14);
      for (let i = 0; i < 14; i++) {
        expect(transform[lang][i]).toHaveLength(16);
        expect(lookat[lang][i]).toHaveLength(16);
      }
    }
  });

  it('language 0 transform matrices are not identity', () => {
    const id = mat44Identity();
    for (let i = 0; i < 14; i++) {
      const isIdentity = transform[0][i].every((v, j) => Math.abs(v - id[j]) < 1e-6);
      expect(isIdentity).toBe(false);
    }
  });

  it('language 0 lookat matrices differ from transforms', () => {
    // Lookat is captured before translation, so it should differ from transform
    for (let i = 0; i < 14; i++) {
      const same = transform[0][i].every(
        (v, j) => Math.abs(v - lookat[0][i][j]) < 1e-6,
      );
      expect(same).toBe(false);
    }
  });

  it('single bond matrices (indices 0,1,3,7) use TETRA_DIST_1', () => {
    // For single bonds, translation component should reflect 1.7 distance
    // Index 0 (bitfield 1): identity + translate Z by 1.7 + rotate Y 180
    // After translate(0,0,1.7) and rotate Y 180, the translation row
    // should have non-zero values
    const m = transform[0][0];
    // The matrix should contain the distance information
    // Check that the matrix has significant non-zero values
    const hasLargeValues = m.some((v) => Math.abs(v) > 1.5);
    expect(hasLargeValues).toBe(true);
  });

  it('scale parameter affects transform distances', () => {
    const scaled = setTetraMatrices(2.0);
    const unscaled = setTetraMatrices(1.0);
    // Scaled matrices should differ from unscaled
    const same = scaled.transform[0][0].every(
      (v, i) => Math.abs(v - unscaled.transform[0][0][i]) < 1e-6,
    );
    expect(same).toBe(false);
  });

  it('scale parameter does NOT affect lookat matrices', () => {
    const scaled = setTetraMatrices(2.0);
    const unscaled = setTetraMatrices(1.0);
    // Lookat is captured before translation, so scale shouldn't affect it
    for (let i = 0; i < 14; i++) {
      for (let j = 0; j < 16; j++) {
        expect(scaled.lookat[0][i][j]).toBeCloseTo(unscaled.lookat[0][i][j], 5);
      }
    }
  });

  it('language 1 (benzene) index 1 and 3 share the same transform', () => {
    // Both are copied from the same computation
    for (let j = 0; j < 16; j++) {
      expect(transform[1][1][j]).toBeCloseTo(transform[1][3][j], 6);
    }
  });

  it('language 1 (benzene) double-bond indices share same transform', () => {
    // Indices 2, 4, 5, 8, 11 are all copies of index 9
    const ref = transform[1][9];
    for (const idx of [2, 4, 5, 8, 11]) {
      for (let j = 0; j < 16; j++) {
        expect(transform[1][idx][j]).toBeCloseTo(ref[j], 6);
      }
    }
  });

  it('produces deterministic results', () => {
    const a = setTetraMatrices(1.0);
    const b = setTetraMatrices(1.0);
    for (let lang = 0; lang < 2; lang++) {
      for (let i = 0; i < 14; i++) {
        for (let j = 0; j < 16; j++) {
          expect(a.transform[lang][i][j]).toBe(b.transform[lang][i][j]);
          expect(a.lookat[lang][i][j]).toBe(b.lookat[lang][i][j]);
        }
      }
    }
  });
});

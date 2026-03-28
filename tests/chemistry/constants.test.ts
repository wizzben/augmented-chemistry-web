import { describe, it, expect } from 'vitest';
import {
  AC_ATOM_MAX_CONNECTIONS,
  AC_ATOM_CONNECTION,
  AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD,
  AC_ATOM_TETRA_DIST_1,
  AC_ATOM_TETRA_DIST_2,
  AC_ATOM_TETRA_DIST_3,
  AC_ATOM_TETRA_DIST_N,
  AC_ATOM_TETRA_ANGLE_VV,
  AC_TETRA_ANGLE_BENZENE,
  HISTOGRAM_SIZE,
} from '@/chemistry/constants';

describe('constants', () => {
  it('has 4 max connections', () => {
    expect(AC_ATOM_MAX_CONNECTIONS).toBe(4);
  });

  it('has correct connection bitfield values', () => {
    expect(AC_ATOM_CONNECTION).toEqual([1, 2, 4, 8]);
  });

  it('has correct bitfield-to-count lookup table', () => {
    expect(AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD).toHaveLength(16);
    // Verify popcount for all 16 values
    for (let i = 0; i < 16; i++) {
      let bits = 0;
      for (let b = 0; b < 4; b++) {
        if (i & (1 << b)) bits++;
      }
      expect(AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[i]).toBe(bits);
    }
  });

  it('has correct tetrahedral distances', () => {
    expect(AC_ATOM_TETRA_DIST_1).toBe(1.7);
    expect(AC_ATOM_TETRA_DIST_2).toBe(1.0);
    expect(AC_ATOM_TETRA_DIST_3).toBe(0.866);
    expect(AC_ATOM_TETRA_DIST_N).toBe(1.732);
  });

  it('has correct tetrahedral angle', () => {
    expect(AC_ATOM_TETRA_ANGLE_VV).toBeCloseTo(109.4712206, 5);
  });

  it('has correct benzene angle', () => {
    expect(AC_TETRA_ANGLE_BENZENE).toBe(120.0);
  });

  it('histogram size is 16', () => {
    expect(HISTOGRAM_SIZE).toBe(16);
  });
});

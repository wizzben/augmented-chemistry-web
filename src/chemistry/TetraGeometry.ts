import {
  mat44Identity,
  mat44Copy,
  mat44CopyInto,
  mat44LoadIdentity,
  mat44DirectRotate,
  mat44DirectTranslate,
} from './Matrix44';
import {
  AC_ATOM_TETRA_DIST_1,
  AC_ATOM_TETRA_DIST_2,
  AC_ATOM_TETRA_DIST_3,
  AC_ATOM_TETRA_DIST_N,
  AC_ATOM_TETRA_ANGLE_VV,
  AC_TETRA_ANGLE_BENZENE,
} from './constants';

export interface TetraMatrices {
  /** [2][14] arrays of number[16] — [language][bitfield-1][matrix] */
  transform: number[][][];
  /** [2][14] arrays of number[16] — lookat matrices */
  lookat: number[][][];
}

/**
 * Compute the tetrahedral transformation matrices.
 * Port of ac_structures_71SetTetraMatrices
 *
 * AC_TETRA_TRANSFORM[language][index][16] where index = bitfield - 1.
 * Language 0 = regular tetrahedral, language 1 = benzene planar.
 */
export function setTetraMatrices(scale = 1.0): TetraMatrices {
  // Allocate [2][14] arrays of 16-element matrices
  const transform: number[][][] = [
    Array.from({ length: 14 }, () => mat44Identity()),
    Array.from({ length: 14 }, () => mat44Identity()),
  ];
  const lookat: number[][][] = [
    Array.from({ length: 14 }, () => mat44Identity()),
    Array.from({ length: 14 }, () => mat44Identity()),
  ];

  let m: number[];
  let language: number;

  // =========================================================================
  // Language 0 (REGULAR TETRAHEDRAL)
  // =========================================================================
  language = 0;

  // 0 => index 0 (bitfield 1)
  m = transform[language][0];
  mat44LoadIdentity(m);
  mat44CopyInto(m, lookat[language][0]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_1 * scale);
  mat44DirectRotate(m, 1, 180.0);

  // 1 => index 1 (bitfield 2)
  m = transform[language][1];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 1, -AC_ATOM_TETRA_ANGLE_VV);
  mat44CopyInto(m, lookat[language][1]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_1 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, AC_ATOM_TETRA_ANGLE_VV);

  // 2 => index 3 (bitfield 4)
  m = transform[language][3];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 120.0);
  mat44DirectRotate(m, 1, -AC_ATOM_TETRA_ANGLE_VV);
  mat44CopyInto(m, lookat[language][3]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_1 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, AC_ATOM_TETRA_ANGLE_VV);
  mat44DirectRotate(m, 2, -120.0);

  // 3 => index 7 (bitfield 8)
  m = transform[language][7];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, -120.0);
  mat44DirectRotate(m, 1, -AC_ATOM_TETRA_ANGLE_VV);
  mat44CopyInto(m, lookat[language][7]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_1 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, AC_ATOM_TETRA_ANGLE_VV);
  mat44DirectRotate(m, 2, 120.0);

  // 0+1 => index 2 (bitfield 3)
  m = transform[language][2];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 1, -54.25);
  mat44CopyInto(m, lookat[language][2]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_2 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 54.25);

  // 0+3 => index 8 (bitfield 9)
  m = transform[language][8];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, -120.0);
  mat44DirectRotate(m, 1, -54.25);
  mat44CopyInto(m, lookat[language][8]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_2 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 54.25);
  mat44DirectRotate(m, 2, 120.0);

  // 1+3 => index 9 (bitfield 10)
  m = transform[language][9];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, -60.0);
  mat44DirectRotate(m, 1, -120.0);
  mat44CopyInto(m, lookat[language][9]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_2 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 120.0);
  mat44DirectRotate(m, 2, 60.0);

  // 0+2 => index 4 (bitfield 5)
  m = transform[language][4];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 120.0);
  mat44DirectRotate(m, 1, -54.25);
  mat44CopyInto(m, lookat[language][4]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_2 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 54.25);
  mat44DirectRotate(m, 2, -120.0);

  // 1+2 => index 5 (bitfield 6)
  m = transform[language][5];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 60.0);
  mat44DirectRotate(m, 1, -120.0);
  mat44CopyInto(m, lookat[language][5]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_2 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 120.0);
  mat44DirectRotate(m, 2, -60.0);

  // 2+3 => index 11 (bitfield 12)
  m = transform[language][11];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 180.0);
  mat44DirectRotate(m, 1, -120.0);
  mat44CopyInto(m, lookat[language][11]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_2 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 120.0);
  mat44DirectRotate(m, 2, -180.0);

  // 0+1+3 => index 10 (bitfield 11)
  m = transform[language][10];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, -60.0);
  mat44DirectRotate(m, 1, -60.0);
  mat44CopyInto(m, lookat[language][10]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_3 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 60.0);
  mat44DirectRotate(m, 2, 60.0);

  // 0+1+2 => index 6 (bitfield 7)
  m = transform[language][6];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 60.0);
  mat44DirectRotate(m, 1, -60.0);
  mat44CopyInto(m, lookat[language][6]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_3 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 60.0);
  mat44DirectRotate(m, 2, -60.0);

  // 0+2+3 => index 12 (bitfield 13)
  m = transform[language][12];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 180.0);
  mat44DirectRotate(m, 1, -60.0);
  mat44CopyInto(m, lookat[language][12]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_3 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 60.0);
  mat44DirectRotate(m, 2, -180.0);

  // 1+2+3 => index 13 (bitfield 14)
  m = transform[language][13];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 1, -180.0);
  mat44CopyInto(m, lookat[language][13]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_3 * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, 180.0);

  // =========================================================================
  // Language 1 (BENZENE)
  // =========================================================================
  language = 1;

  // 0 => index 0 (bitfield 1)
  m = transform[language][0];
  mat44LoadIdentity(m);
  mat44CopyInto(m, lookat[language][0]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_N * scale);
  mat44DirectRotate(m, 1, 180.0);

  // 1-bonding: index 3 (bitfield 4), shared with index 1
  m = transform[language][3];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, 120.0);
  mat44DirectRotate(m, 1, -AC_TETRA_ANGLE_BENZENE);
  mat44CopyInto(m, lookat[language][1]);
  mat44CopyInto(m, lookat[language][3]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_N * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 2, 180.0);
  mat44DirectRotate(m, 1, AC_TETRA_ANGLE_BENZENE);
  mat44DirectRotate(m, 2, -120.0);

  mat44CopyInto(m, transform[language][1]);

  // index 7 (bitfield 8)
  m = transform[language][7];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, -120.0);
  mat44DirectRotate(m, 1, -AC_TETRA_ANGLE_BENZENE);
  mat44CopyInto(m, lookat[language][7]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_N * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 1, AC_TETRA_ANGLE_BENZENE);
  mat44DirectRotate(m, 2, 120.0);

  // 2-bonding: index 9 (bitfield 10), shared with indices 2,8,4,5,11
  m = transform[language][9];
  mat44LoadIdentity(m);
  mat44DirectRotate(m, 2, -60.0);
  mat44DirectRotate(m, 1, -120.0);
  mat44CopyInto(m, lookat[language][2]);
  mat44CopyInto(m, lookat[language][8]);
  mat44CopyInto(m, lookat[language][9]);
  mat44CopyInto(m, lookat[language][4]);
  mat44CopyInto(m, lookat[language][5]);
  mat44CopyInto(m, lookat[language][11]);
  mat44DirectTranslate(m, 0, 0, AC_ATOM_TETRA_DIST_N * scale);
  mat44DirectRotate(m, 1, 180.0);
  mat44DirectRotate(m, 2, 180.0);
  mat44DirectRotate(m, 1, 120.0);
  mat44DirectRotate(m, 2, 60.0);

  mat44CopyInto(m, transform[language][2]);
  mat44CopyInto(m, transform[language][8]);
  mat44CopyInto(m, transform[language][4]);
  mat44CopyInto(m, transform[language][5]);
  mat44CopyInto(m, transform[language][11]);

  return { transform, lookat };
}

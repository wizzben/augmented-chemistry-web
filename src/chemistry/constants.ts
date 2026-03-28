/** Maximum connection slots per atom (tetrahedral geometry) */
export const AC_ATOM_MAX_CONNECTIONS = 4;

/** Bitfield value for each connection slot: slot i has value 2^i */
export const AC_ATOM_CONNECTION: readonly number[] = [0x1, 0x2, 0x4, 0x8];

/** Lookup table: bitfield value -> number of occupied connection slots */
export const AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD: readonly number[] = [
  0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4,
];

/** Bond distance for single bonds */
export const AC_ATOM_TETRA_DIST_1 = 1.7;

/** Bond distance for double bonds */
export const AC_ATOM_TETRA_DIST_2 = 1.0;

/** Bond distance for triple bonds */
export const AC_ATOM_TETRA_DIST_3 = 0.866;

/** Bond distance for benzene C-C bonds */
export const AC_ATOM_TETRA_DIST_N = 1.732;

/** Tetrahedral bond angle in degrees */
export const AC_ATOM_TETRA_ANGLE_VV = 109.4712206;

/** Benzene planar bond angle in degrees */
export const AC_TETRA_ANGLE_BENZENE = 120.0;

/** Benzene complementary angle in degrees */
export const AC_TETRA_ANGLE_BENZENE2 = 60.0;

/** Size of the element histogram array */
export const HISTOGRAM_SIZE = 16;

/** Connection flag: regular bond */
export const AC_ATOM_CFLAG_REGULAR = 0;

/** Connection flag: part of a circular/ring structure */
export const AC_ATOM_CFLAG_CIRCULAR = 1;

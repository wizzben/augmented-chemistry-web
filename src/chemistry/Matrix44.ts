/**
 * 4x4 matrix operations, ported from achlp_matrix44.c.
 *
 * Matrices are stored as number[16] with the same layout as the original C code.
 * The multiply loop uses result[4*i+j] += m[4*i+k] * n[4*k+j].
 * Translation lives at indices [12, 13, 14].
 *
 * directRotate/directTranslate pre-multiply: result = newTransform * existing,
 * matching OpenGL's glRotatef/glTranslatef convention.
 */

export const DEG2RAD = Math.PI / 180.0;

export function mat44Identity(): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function mat44LoadIdentity(matrix: number[]): void {
  matrix[0]  = 1; matrix[1]  = 0; matrix[2]  = 0; matrix[3]  = 0;
  matrix[4]  = 0; matrix[5]  = 1; matrix[6]  = 0; matrix[7]  = 0;
  matrix[8]  = 0; matrix[9]  = 0; matrix[10] = 1; matrix[11] = 0;
  matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; matrix[15] = 1;
}

export function mat44Copy(src: number[]): number[] {
  return src.slice(0, 16);
}

export function mat44CopyInto(src: number[], dest: number[]): void {
  for (let i = 0; i < 16; i++) {
    dest[i] = src[i];
  }
}

/**
 * Matrix multiplication: result = m * n
 * Port of achlp_matrix44_02multiply
 */
export function mat44Multiply(m: number[], n: number[]): number[] {
  const result = new Array<number>(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[4 * i + j] = 0;
      for (let k = 0; k < 4; k++) {
        result[4 * i + j] += m[4 * i + k] * n[4 * k + j];
      }
    }
  }
  return result;
}

/**
 * Fill rotation elements for X-axis rotation (in radians).
 * Only sets the 4 directly concerned elements.
 * Port of achlp_matrix44_03rotateX
 */
export function mat44RotateX(matrix: number[], angle: number): void {
  matrix[5]  =  Math.cos(angle);
  matrix[6]  =  Math.sin(angle);
  matrix[9]  = -Math.sin(angle);
  matrix[10] =  Math.cos(angle);
}

/**
 * Fill rotation elements for Y-axis rotation (in radians).
 * Port of achlp_matrix44_04rotateY
 */
export function mat44RotateY(matrix: number[], angle: number): void {
  matrix[0]  =  Math.cos(angle);
  matrix[2]  = -Math.sin(angle);
  matrix[8]  =  Math.sin(angle);
  matrix[10] =  Math.cos(angle);
}

/**
 * Fill rotation elements for Z-axis rotation (in radians).
 * Port of achlp_matrix44_05rotateZ
 */
export function mat44RotateZ(matrix: number[], angle: number): void {
  matrix[0] =  Math.cos(angle);
  matrix[1] =  Math.sin(angle);
  matrix[4] = -Math.sin(angle);
  matrix[5] =  Math.cos(angle);
}

/**
 * Pre-multiply a rotation onto matrix (like glRotatef).
 * axis: 0=X, 1=Y, 2=Z. deg is in degrees.
 * result = rotation(axis, deg) * matrix
 * Port of achlp_matrix44_16directRotate
 */
export function mat44DirectRotate(matrix: number[], axis: number, deg: number): void {
  const rotation = mat44Identity();
  const temp = mat44Copy(matrix);

  if (axis === 0) {
    mat44RotateX(rotation, DEG2RAD * deg);
  } else if (axis === 1) {
    mat44RotateY(rotation, DEG2RAD * deg);
  } else {
    mat44RotateZ(rotation, DEG2RAD * deg);
  }

  const result = mat44Multiply(rotation, temp);
  mat44CopyInto(result, matrix);
}

/**
 * Pre-multiply a translation onto matrix (like glTranslatef).
 * result = translation(dx,dy,dz) * matrix
 * Port of achlp_matrix44_15directTranslate
 */
export function mat44DirectTranslate(matrix: number[], dx: number, dy: number, dz: number): void {
  const translation = mat44Identity();
  translation[12] = dx;
  translation[13] = dy;
  translation[14] = dz;

  const temp = mat44Copy(matrix);
  const result = mat44Multiply(translation, temp);
  mat44CopyInto(result, matrix);
}

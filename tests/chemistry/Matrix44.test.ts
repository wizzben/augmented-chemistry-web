import { describe, it, expect } from 'vitest';
import {
  DEG2RAD,
  mat44Identity,
  mat44LoadIdentity,
  mat44Copy,
  mat44CopyInto,
  mat44Multiply,
  mat44RotateX,
  mat44RotateY,
  mat44RotateZ,
  mat44DirectRotate,
  mat44DirectTranslate,
} from '@/chemistry/Matrix44';

function expectMatricesClose(a: number[], b: number[], precision = 6) {
  expect(a).toHaveLength(16);
  expect(b).toHaveLength(16);
  for (let i = 0; i < 16; i++) {
    expect(a[i]).toBeCloseTo(b[i], precision);
  }
}

describe('Matrix44', () => {
  describe('mat44Identity', () => {
    it('returns a 16-element identity matrix', () => {
      const id = mat44Identity();
      expect(id).toHaveLength(16);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          expect(id[4 * i + j]).toBe(i === j ? 1 : 0);
        }
      }
    });
  });

  describe('mat44LoadIdentity', () => {
    it('resets matrix to identity in place', () => {
      const m = new Array(16).fill(99);
      mat44LoadIdentity(m);
      expectMatricesClose(m, mat44Identity());
    });
  });

  describe('mat44Copy', () => {
    it('creates an independent copy', () => {
      const m = mat44Identity();
      m[12] = 5;
      const c = mat44Copy(m);
      expect(c[12]).toBe(5);
      c[12] = 10;
      expect(m[12]).toBe(5);
    });
  });

  describe('mat44CopyInto', () => {
    it('copies values into destination', () => {
      const src = mat44Identity();
      src[12] = 7;
      const dest = new Array(16).fill(0);
      mat44CopyInto(src, dest);
      expectMatricesClose(dest, src);
    });
  });

  describe('mat44Multiply', () => {
    it('identity * identity = identity', () => {
      const result = mat44Multiply(mat44Identity(), mat44Identity());
      expectMatricesClose(result, mat44Identity());
    });

    it('identity * M = M', () => {
      const m = mat44Identity();
      m[12] = 3; m[13] = 4; m[14] = 5;
      const result = mat44Multiply(mat44Identity(), m);
      expectMatricesClose(result, m);
    });

    it('M * identity = M', () => {
      const m = mat44Identity();
      m[12] = 3; m[13] = 4; m[14] = 5;
      const result = mat44Multiply(m, mat44Identity());
      expectMatricesClose(result, m);
    });

    it('multiplies two known matrices correctly', () => {
      // Translation * rotation should compose
      const t = mat44Identity();
      t[12] = 10; // translate x by 10

      const r = mat44Identity();
      // 90 degree Z rotation
      mat44RotateZ(r, Math.PI / 2);

      // t * r: row 3 of t is [10,0,0,1], multiplied through r
      // result[12] = 10*cos90 + 0 + 0 + 0 ≈ 0
      // result[13] = 10*sin90 + 0 + 0 + 0 ≈ 10
      const result = mat44Multiply(t, r);
      expect(result[12]).toBeCloseTo(0, 5);
      expect(result[13]).toBeCloseTo(10, 5);
    });
  });

  describe('mat44RotateX', () => {
    it('90 degree rotation sets correct elements', () => {
      const m = mat44Identity();
      mat44RotateX(m, Math.PI / 2);
      expect(m[5]).toBeCloseTo(0, 6);   // cos(90)
      expect(m[6]).toBeCloseTo(1, 6);   // sin(90)
      expect(m[9]).toBeCloseTo(-1, 6);  // -sin(90)
      expect(m[10]).toBeCloseTo(0, 6);  // cos(90)
      // Other elements unchanged
      expect(m[0]).toBe(1);
      expect(m[15]).toBe(1);
    });
  });

  describe('mat44RotateY', () => {
    it('90 degree rotation sets correct elements', () => {
      const m = mat44Identity();
      mat44RotateY(m, Math.PI / 2);
      expect(m[0]).toBeCloseTo(0, 6);   // cos(90)
      expect(m[2]).toBeCloseTo(-1, 6);  // -sin(90)
      expect(m[8]).toBeCloseTo(1, 6);   // sin(90)
      expect(m[10]).toBeCloseTo(0, 6);  // cos(90)
      expect(m[5]).toBe(1);
    });
  });

  describe('mat44RotateZ', () => {
    it('90 degree rotation sets correct elements', () => {
      const m = mat44Identity();
      mat44RotateZ(m, Math.PI / 2);
      expect(m[0]).toBeCloseTo(0, 6);   // cos(90)
      expect(m[1]).toBeCloseTo(1, 6);   // sin(90)
      expect(m[4]).toBeCloseTo(-1, 6);  // -sin(90)
      expect(m[5]).toBeCloseTo(0, 6);   // cos(90)
      expect(m[10]).toBe(1);
    });
  });

  describe('mat44DirectRotate', () => {
    it('rotating identity by 0 gives identity', () => {
      const m = mat44Identity();
      mat44DirectRotate(m, 0, 0);
      expectMatricesClose(m, mat44Identity());
    });

    it('rotating identity by 360 gives identity', () => {
      const m = mat44Identity();
      mat44DirectRotate(m, 1, 360);
      expectMatricesClose(m, mat44Identity(), 5);
    });

    it('pre-multiplies: rotation * existing', () => {
      // Start with a translation
      const m = mat44Identity();
      m[12] = 5;
      // Rotate 90 degrees around Z: result = rotZ90 * m
      // Row 3 of rotZ90 is [0,0,0,1], so translation row is unchanged:
      // result[12..15] = [0,0,0,1] * m = m[12..15] = [5,0,0,1]
      mat44DirectRotate(m, 2, 90);
      expect(m[12]).toBeCloseTo(5, 5);
      expect(m[13]).toBeCloseTo(0, 5);
      expect(m[14]).toBeCloseTo(0, 5);
      // But the rotation part (upper-left 3x3) IS rotated
      expect(m[0]).toBeCloseTo(0, 5);   // cos(90)
      expect(m[1]).toBeCloseTo(1, 5);   // sin(90)
    });

    it('axis 0 = X rotation', () => {
      const m = mat44Identity();
      mat44DirectRotate(m, 0, 90);
      // After 90 deg X rotation, Y->Z, Z->-Y
      expect(m[5]).toBeCloseTo(0, 5);
      expect(m[6]).toBeCloseTo(1, 5);
      expect(m[9]).toBeCloseTo(-1, 5);
      expect(m[10]).toBeCloseTo(0, 5);
    });

    it('axis 1 = Y rotation', () => {
      const m = mat44Identity();
      mat44DirectRotate(m, 1, 90);
      expect(m[0]).toBeCloseTo(0, 5);
      expect(m[8]).toBeCloseTo(1, 5);
    });
  });

  describe('mat44DirectTranslate', () => {
    it('translating identity sets translation', () => {
      const m = mat44Identity();
      mat44DirectTranslate(m, 3, 4, 5);
      expect(m[12]).toBeCloseTo(3, 6);
      expect(m[13]).toBeCloseTo(4, 6);
      expect(m[14]).toBeCloseTo(5, 6);
      // Rotation part unchanged
      expect(m[0]).toBe(1);
      expect(m[5]).toBe(1);
      expect(m[10]).toBe(1);
    });

    it('pre-multiplies: translation * existing', () => {
      // Start with a 90-degree Z rotation
      const m = mat44Identity();
      mat44DirectRotate(m, 2, 90);
      // Now translate (10, 0, 0): result = trans(10,0,0) * rotZ90
      // Row 3 of trans is [10,0,0,1], multiplied through rotZ90:
      // result[12] = 10*cos90 + 0 = 0
      // result[13] = 10*sin90 + 0 = 10
      mat44DirectTranslate(m, 10, 0, 0);
      expect(m[12]).toBeCloseTo(0, 5);
      expect(m[13]).toBeCloseTo(10, 5);
    });

    it('composing two translations adds them', () => {
      const m = mat44Identity();
      mat44DirectTranslate(m, 1, 2, 3);
      mat44DirectTranslate(m, 4, 5, 6);
      expect(m[12]).toBeCloseTo(5, 6);
      expect(m[13]).toBeCloseTo(7, 6);
      expect(m[14]).toBeCloseTo(9, 6);
    });
  });

  describe('DEG2RAD', () => {
    it('converts degrees to radians', () => {
      expect(DEG2RAD * 180).toBeCloseTo(Math.PI, 6);
      expect(DEG2RAD * 90).toBeCloseTo(Math.PI / 2, 6);
      expect(DEG2RAD * 360).toBeCloseTo(2 * Math.PI, 6);
    });
  });
});

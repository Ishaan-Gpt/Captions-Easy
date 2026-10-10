import { describe, expect, it } from "vitest";
import { parseCubeLUT, sample3DLUT } from "./lutParser";

describe("3D LUT Parser & Color Sampling Engine", () => {
  const sampleCube = `
TITLE "Test Vintage 3D LUT"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

  it("correctly parses TITLE, SIZE, and 3D data array", () => {
    const lut = parseCubeLUT(sampleCube);
    expect(lut.title).toBe("Test Vintage 3D LUT");
    expect(lut.size).toBe(2);
    expect(lut.data.length).toBe(24); // 2^3 * 3 = 24 floats
  });

  it("performs trilinear interpolation sampling on 3D LUT colors", () => {
    const lut = parseCubeLUT(sampleCube);
    const result = sample3DLUT(lut, 0.5, 0.5, 0.5);
    expect(result[0]).toBeCloseTo(0.5, 2);
    expect(result[1]).toBeCloseTo(0.5, 2);
    expect(result[2]).toBeCloseTo(0.5, 2);
  });
});

export interface LUT3D {
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array; // Size * Size * Size * 3
}

/**
 * Parses a standard Adobe/DaVinci .cube 3D LUT file format into 32-bit floating point data.
 */
export function parseCubeLUT(cubeContent: string): LUT3D {
  const lines = cubeContent.split(/\r?\n/);
  let title = "Custom LUT";
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const rawValues: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("TITLE")) {
      title = line.replace(/TITLE\s*"?([^"]*)"?/, "$1") || title;
      continue;
    }
    if (line.startsWith("LUT_3D_SIZE")) {
      const parts = line.split(/\s+/);
      if (parts[1]) size = parseInt(parts[1], 10);
      continue;
    }
    if (line.startsWith("DOMAIN_MIN")) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3) domainMin = [parts[0], parts[1], parts[2]];
      continue;
    }
    if (line.startsWith("DOMAIN_MAX")) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3) domainMax = [parts[0], parts[1], parts[2]];
      continue;
    }

    // Numbers
    const numbers = line.split(/\s+/).map(Number);
    if (numbers.length === 3 && !numbers.some(isNaN)) {
      rawValues.push(...numbers);
    }
  }

  if (size === 0) {
    // Infer cubic root
    size = Math.round(Math.cbrt(rawValues.length / 3));
  }

  return {
    title,
    size,
    domainMin,
    domainMax,
    data: new Float32Array(rawValues),
  };
}

/**
 * Trilinear interpolation of a 3D LUT for precise 32-bit floating point color mapping.
 */
export function sample3DLUT(
  lut: LUT3D,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  if (lut.size === 0 || lut.data.length === 0) return [r, g, b];

  const s = lut.size;
  // Normalize color to [0, s - 1]
  const nr = Math.max(0, Math.min(1, r)) * (s - 1);
  const ng = Math.max(0, Math.min(1, g)) * (s - 1);
  const nb = Math.max(0, Math.min(1, b)) * (s - 1);

  const x0 = Math.floor(nr);
  const x1 = Math.min(s - 1, x0 + 1);
  const y0 = Math.floor(ng);
  const y1 = Math.min(s - 1, y0 + 1);
  const z0 = Math.floor(nb);
  const z1 = Math.min(s - 1, z0 + 1);

  const dx = nr - x0;
  const dy = ng - y0;
  const dz = nb - z0;

  const getIdx = (x: number, y: number, z: number) => (z * s * s + y * s + x) * 3;

  const out: [number, number, number] = [0, 0, 0];

  for (let c = 0; c < 3; c++) {
    const c000 = lut.data[getIdx(x0, y0, z0) + c];
    const c100 = lut.data[getIdx(x1, y0, z0) + c];
    const c010 = lut.data[getIdx(x0, y1, z0) + c];
    const c110 = lut.data[getIdx(x1, y1, z0) + c];
    const c001 = lut.data[getIdx(x0, y0, z1) + c];
    const c101 = lut.data[getIdx(x1, y0, z1) + c];
    const c011 = lut.data[getIdx(x0, y1, z1) + c];
    const c111 = lut.data[getIdx(x1, y1, z1) + c];

    const c00 = c000 * (1 - dx) + c100 * dx;
    const c01 = c001 * (1 - dx) + c101 * dx;
    const c10 = c010 * (1 - dx) + c110 * dx;
    const c11 = c011 * (1 - dx) + c111 * dx;

    const c0 = c00 * (1 - dy) + c10 * dy;
    const c1 = c01 * (1 - dy) + c11 * dy;

    out[c] = c0 * (1 - dz) + c1 * dz;
  }

  return out;
}

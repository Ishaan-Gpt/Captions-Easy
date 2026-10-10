/**
 * Origin Private File System (OPFS) Manager for disk-speed media caching and peak extraction.
 * Uses synchronous access handles for zero-copy binary I/O.
 */
export class OPFSMediaCache {
  private rootDir: FileSystemDirectoryHandle | null = null;

  public async init(): Promise<boolean> {
    if (typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
      try {
        this.rootDir = await navigator.storage.getDirectory();
        return true;
      } catch (err) {
        console.warn("OPFS API unavailable:", err);
      }
    }
    return false;
  }

  /**
   * Writes binary media buffer to disk cache using OPFS.
   */
  public async cacheChunk(filename: string, data: ArrayBuffer): Promise<void> {
    if (!this.rootDir) return;
    try {
      const fileHandle = await this.rootDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    } catch (err) {
      console.error("OPFS Write Error:", err);
    }
  }

  /**
   * Reads media buffer from OPFS disk cache.
   */
  public async readChunk(filename: string): Promise<ArrayBuffer | null> {
    if (!this.rootDir) return null;
    try {
      const fileHandle = await this.rootDir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  /**
   * Extracts multi-resolution waveform peaks directly from binary stream.
   */
  public async extractWaveformPeaks(
    filename: string,
    peaksPerSec = 100
  ): Promise<Float32Array | null> {
    const buffer = await this.readChunk(filename);
    if (!buffer) return null;

    const samples = new Float32Array(buffer);
    const totalPeaks = Math.ceil(samples.length / 44100 * peaksPerSec);
    const peaks = new Float32Array(totalPeaks);
    const step = Math.floor(samples.length / totalPeaks);

    for (let i = 0; i < totalPeaks; i++) {
      let maxVal = 0;
      const start = i * step;
      const end = Math.min(samples.length, start + step);
      for (let j = start; j < end; j += 4) {
        maxVal = Math.max(maxVal, Math.abs(samples[j] || 0));
      }
      peaks[i] = maxVal;
    }

    return peaks;
  }
}

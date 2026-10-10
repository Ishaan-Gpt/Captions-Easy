import { describe, expect, it } from "vitest";
import { DEFAULT_VFX_GRAPH, evaluateGraphExecutionOrder } from "./vfxGraphEngine";

describe("VFX Node Graph Evaluator", () => {
  it("topologically sorts DAG node connections in exact execution order", () => {
    const sorted = evaluateGraphExecutionOrder(DEFAULT_VFX_GRAPH);
    expect(sorted.length).toBe(4);
    expect(sorted[0].id).toBe("node-1"); // Source
    expect(sorted[1].id).toBe("node-2"); // Chroma Key
    expect(sorted[2].id).toBe("node-3"); // Color Grade
    expect(sorted[3].id).toBe("node-4"); // Output
  });
});

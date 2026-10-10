export type VFXNodeType =
  | "source"
  | "transform"
  | "mask"
  | "chromaKey"
  | "colorGrade"
  | "output";

export interface NodePort {
  id: string;
  name: string;
  type: "image" | "mask" | "float";
}

export interface VFXNode {
  id: string;
  name: string;
  type: VFXNodeType;
  position: { x: number; y: number };
  inputs: NodePort[];
  outputs: NodePort[];
  params: Record<string, any>;
}

export interface VFXConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface VFXGraph {
  nodes: VFXNode[];
  connections: VFXConnection[];
}

/**
 * Performs Topological Sorting on the VFX Directed Acyclic Graph (DAG)
 * to determine execution order for real-time frame rendering.
 */
export function evaluateGraphExecutionOrder(graph: VFXGraph): VFXNode[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  graph.nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  });

  graph.connections.forEach((conn) => {
    adjList.get(conn.fromNodeId)?.push(conn.toNodeId);
    inDegree.set(conn.toNodeId, (inDegree.get(conn.toNodeId) || 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  const executionOrder: VFXNode[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currNode = graph.nodes.find((n) => n.id === currId);
    if (currNode) executionOrder.push(currNode);

    adjList.get(currId)?.forEach((neighborId) => {
      const updatedDegree = (inDegree.get(neighborId) || 0) - 1;
      inDegree.set(neighborId, updatedDegree);
      if (updatedDegree === 0) queue.push(neighborId);
    });
  }

  return executionOrder;
}

export const DEFAULT_VFX_GRAPH: VFXGraph = {
  nodes: [
    {
      id: "node-1",
      name: "Video Source",
      type: "source",
      position: { x: 50, y: 100 },
      inputs: [],
      outputs: [{ id: "out-img", name: "Output", type: "image" }],
      params: { mediaId: "main-video" },
    },
    {
      id: "node-2",
      name: "Chroma Keyer",
      type: "chromaKey",
      position: { x: 280, y: 100 },
      inputs: [{ id: "in-img", name: "Image", type: "image" }],
      outputs: [
        { id: "out-img", name: "Output", type: "image" },
        { id: "out-matte", name: "Matte", type: "mask" },
      ],
      params: { keyColor: "#00FF00", tolerance: 0.15, spillSuppression: 0.8 },
    },
    {
      id: "node-3",
      name: "3D LUT Grade",
      type: "colorGrade",
      position: { x: 520, y: 100 },
      inputs: [{ id: "in-img", name: "Image", type: "image" }],
      outputs: [{ id: "out-img", name: "Output", type: "image" }],
      params: { lutFile: "Rec709_Cinematic.cube", opacity: 1.0 },
    },
    {
      id: "node-4",
      name: "Final Composite",
      type: "output",
      position: { x: 750, y: 100 },
      inputs: [{ id: "in-img", name: "Input", type: "image" }],
      outputs: [],
      params: { renderRes: "4K" },
    },
  ],
  connections: [
    {
      id: "conn-1",
      fromNodeId: "node-1",
      fromPortId: "out-img",
      toNodeId: "node-2",
      toPortId: "in-img",
    },
    {
      id: "conn-2",
      fromNodeId: "node-2",
      fromPortId: "out-img",
      toNodeId: "node-3",
      toPortId: "in-img",
    },
    {
      id: "conn-3",
      fromNodeId: "node-3",
      fromPortId: "out-img",
      toNodeId: "node-4",
      toPortId: "in-img",
    },
  ],
};

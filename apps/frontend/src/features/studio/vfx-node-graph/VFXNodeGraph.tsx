"use client";

import React, { useState } from "react";
import {
  Layers,
  Move,
  Plus,
  Sliders,
  Sparkles,
  Tv,
  Wand2,
  X,
} from "lucide-react";
import {
  DEFAULT_VFX_GRAPH,
  evaluateGraphExecutionOrder,
  type VFXConnection,
  type VFXGraph,
  type VFXNode,
  type VFXNodeType,
} from "./vfxGraphEngine";

export const VFXNodeGraph: React.FC = () => {
  const [graph, setGraph] = useState<VFXGraph>(DEFAULT_VFX_GRAPH);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("node-2");
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId);

  const handlePointerDownNode = (e: React.PointerEvent, node: VFXNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setDraggingNode({
      id: node.id,
      offsetX: e.clientX - node.position.x,
      offsetY: e.clientY - node.position.y,
    });
  };

  const handlePointerMoveCanvas = (e: React.PointerEvent) => {
    if (!draggingNode) return;
    const nextX = Math.max(0, e.clientX - draggingNode.offsetX);
    const nextY = Math.max(0, e.clientY - draggingNode.offsetY);

    setGraph({
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === draggingNode.id
          ? { ...n, position: { x: nextX, y: nextY } }
          : n
      ),
    });
  };

  const handlePointerUpCanvas = () => {
    setDraggingNode(null);
  };

  const addNode = (type: VFXNodeType) => {
    const id = `node-${Date.now()}`;
    const nameMap: Record<VFXNodeType, string> = {
      source: "Media Source",
      transform: "2D/3D Transform",
      mask: "Power Window Mask",
      chromaKey: "Chroma Keyer",
      colorGrade: "Color Grade & LUT",
      output: "Render Composite",
    };
    const newNode: VFXNode = {
      id,
      name: nameMap[type],
      type,
      position: { x: 300, y: 200 },
      inputs: [{ id: "in-img", name: "Image", type: "image" }],
      outputs: [{ id: "out-img", name: "Output", type: "image" }],
      params: {},
    };
    setGraph({
      ...graph,
      nodes: [...graph.nodes, newNode],
    });
    setSelectedNodeId(id);
  };

  const getNodeIcon = (type: VFXNodeType) => {
    switch (type) {
      case "source":
        return <Tv className="h-4 w-4 text-blue-400" />;
      case "chromaKey":
        return <Wand2 className="h-4 w-4 text-emerald-400" />;
      case "transform":
        return <Move className="h-4 w-4 text-amber-400" />;
      case "colorGrade":
        return <Sliders className="h-4 w-4 text-purple-400" />;
      case "output":
        return <Sparkles className="h-4 w-4 text-pink-400" />;
      default:
        return <Layers className="h-4 w-4 text-neutral-400" />;
    }
  };

  const executionOrder = evaluateGraphExecutionOrder(graph);

  return (
    <div className="flex h-full w-full select-none border border-neutral-800 bg-neutral-950 text-white font-sans overflow-hidden">
      {/* Main Node Graph Canvas */}
      <div
        className="relative flex-1 overflow-hidden bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:16px_16px]"
        onPointerMove={handlePointerMoveCanvas}
        onPointerUp={handlePointerUpCanvas}
      >
        {/* Node Graph Header Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/90 p-1.5 backdrop-blur shadow-lg">
          <span className="px-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Add VFX Node:
          </span>
          <button
            onClick={() => addNode("chromaKey")}
            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          >
            <Wand2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Chroma Key</span>
          </button>
          <button
            onClick={() => addNode("transform")}
            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          >
            <Move className="h-3.5 w-3.5 text-amber-400" />
            <span>Transform</span>
          </button>
          <button
            onClick={() => addNode("colorGrade")}
            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          >
            <Sliders className="h-3.5 w-3.5 text-purple-400" />
            <span>Color Grade</span>
          </button>
        </div>

        {/* SVG Cubic Bezier Connections */}
        <svg className="absolute inset-0 pointer-events-none h-full w-full">
          {graph.connections.map((conn) => {
            const fromNode = graph.nodes.find((n) => n.id === conn.fromNodeId);
            const toNode = graph.nodes.find((n) => n.id === conn.toNodeId);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.position.x + 180;
            const y1 = fromNode.position.y + 40;
            const x2 = toNode.position.x;
            const y2 = toNode.position.y + 40;

            const dx = Math.abs(x2 - x1) * 0.5;
            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            return (
              <g key={conn.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                  className="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                />
              </g>
            );
          })}
        </svg>

        {/* Render Node Cards */}
        {graph.nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;

          return (
            <div
              key={node.id}
              onPointerDown={(e) => handlePointerDownNode(e, node)}
              className={`absolute w-44 rounded-lg border bg-neutral-900 shadow-xl transition-shadow ${
                isSelected
                  ? "border-emerald-500 ring-2 ring-emerald-500/40 z-10"
                  : "border-neutral-800 hover:border-neutral-700"
              }`}
              style={{
                left: node.position.x,
                top: node.position.y,
              }}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 bg-neutral-950/60 rounded-t-lg">
                <div className="flex items-center gap-2">
                  {getNodeIcon(node.type)}
                  <span className="text-xs font-semibold text-neutral-200">
                    {node.name}
                  </span>
                </div>
              </div>

              {/* Card Ports */}
              <div className="p-2.5 text-[11px] flex justify-between gap-2">
                <div className="flex flex-col gap-1.5">
                  {node.inputs.map((inp) => (
                    <div key={inp.id} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full border border-emerald-400 bg-neutral-900" />
                      <span className="text-neutral-400">{inp.name}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5 text-right">
                  {node.outputs.map((out) => (
                    <div key={out.id} className="flex items-center justify-end gap-1.5">
                      <span className="text-neutral-400">{out.name}</span>
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Inspector Panel */}
      <div className="w-72 border-l border-neutral-800 bg-neutral-900 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Node Inspector
          </h3>
        </div>

        {selectedNode ? (
          <div className="flex flex-col gap-4 text-xs">
            <div className="flex items-center gap-2">
              {getNodeIcon(selectedNode.type)}
              <span className="font-bold text-white text-sm">{selectedNode.name}</span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-neutral-400">Key Color Target:</label>
              <input
                type="color"
                defaultValue={selectedNode.params.keyColor || "#00FF00"}
                className="h-8 w-full cursor-pointer rounded border border-neutral-700 bg-neutral-800 p-1"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-neutral-400">Keying Tolerance:</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={selectedNode.params.tolerance || 0.2}
                className="accent-emerald-500"
              />
            </div>

            <div className="border-t border-neutral-800 pt-3">
              <span className="text-[11px] font-mono text-neutral-500">Execution Order:</span>
              <div className="mt-1 flex flex-col gap-1">
                {executionOrder.map((n, i) => (
                  <div
                    key={n.id}
                    className={`rounded px-2 py-1 font-mono text-[11px] ${
                      n.id === selectedNode.id
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-neutral-950 text-neutral-400"
                    }`}
                  >
                    #{i + 1} {n.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-neutral-500 text-xs italic">
            Select a node on the canvas to inspect its parameters.
          </div>
        )}
      </div>
    </div>
  );
};

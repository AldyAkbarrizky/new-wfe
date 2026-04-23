"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type XYPosition,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { WorkflowNode } from "@/components/workflow-node";
import {
  buildWorkflowFlow,
  getExpandableWorkflowIds,
  type WorkflowApiMeta,
  type WorkflowApiResponse,
  type WorkflowFlowEdge,
  type WorkflowRelationKind,
  type WorkflowRecord,
} from "@/lib/workflow-graph";

const nodeTypes = {
  workflow: WorkflowNode,
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

type WorkflowMutationResponse = {
  workflowId: string;
  nextWorkflow: string | null;
  nextWorkflowIds: string[];
  nextSequential: string | null;
  nextSequentialIds: string[];
  removedTargetId: string | null;
  updatedTargetId: string | null;
  updatedAt: string;
};

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || `API returned status ${response.status}.`;
  } catch {
    return `API returned status ${response.status}.`;
  }
}

function shouldIgnoreDeleteShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function getPrimaryTransition(edge: WorkflowFlowEdge) {
  return edge.data?.transitions[0] ?? null;
}

function relationFieldLabel(relationKind: WorkflowRelationKind) {
  return relationKind === "nextSequential"
    ? "`next_sequential`"
    : "`next_workflow`";
}

function relationDisplayLabel(relationKind: WorkflowRelationKind) {
  return relationKind === "nextSequential" ? "paralel" : "sequential";
}

function captureNodePositions(
  nodes: Array<{ id: string; position: XYPosition }>,
) {
  return new Map(
    nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
  );
}

function normalizeWorkflowRecord(record: WorkflowRecord) {
  return {
    ...record,
    nextWorkflow: record.nextWorkflow ?? null,
    nextWorkflowIds: Array.isArray(record.nextWorkflowIds)
      ? record.nextWorkflowIds
      : [],
    nextSequential: record.nextSequential ?? null,
    nextSequentialIds: Array.isArray(record.nextSequentialIds)
      ? record.nextSequentialIds
      : [],
  };
}

async function updateNextWorkflowTransition(
  edge: WorkflowFlowEdge,
  nextTargetWorkflowId: string | null,
) {
  const transition = getPrimaryTransition(edge);
  if (!edge.data?.reconnectable || !transition) {
    throw new Error(
      edge.data?.editHint || "Edge ini belum bisa dimodifikasi langsung.",
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/api/workflows/${transition.sourceRecordId}/next-workflow`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transitionIndex: transition.transitionIndex,
        expectedRawTargetId: transition.rawTargetId,
        nextTargetWorkflowId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WorkflowMutationResponse;
}

async function updateWorkflowTransitionRelationKind(edge: WorkflowFlowEdge) {
  const transition = getPrimaryTransition(edge);
  if (!edge.data?.editable || !transition) {
    throw new Error(
      edge.data?.editHint || "Edge ini belum bisa dimodifikasi langsung.",
    );
  }

  const nextRelationKind: WorkflowRelationKind =
    transition.relationKind === "nextWorkflow"
      ? "nextSequential"
      : "nextWorkflow";

  const response = await fetch(
    `${API_BASE_URL}/api/workflows/${transition.sourceRecordId}/transition`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        relationKind: transition.relationKind,
        transitionIndex: transition.transitionIndex,
        expectedRawTargetId: transition.rawTargetId,
        nextRelationKind,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WorkflowMutationResponse;
}

async function deleteWorkflowTransition(edge: WorkflowFlowEdge) {
  const transition = getPrimaryTransition(edge);
  if (!edge.data?.editable || !transition) {
    throw new Error(
      edge.data?.editHint || "Edge ini belum bisa dimodifikasi langsung.",
    );
  }

  const endpoint =
    transition.relationKind === "nextWorkflow"
      ? `${API_BASE_URL}/api/workflows/${transition.sourceRecordId}/next-workflow`
      : `${API_BASE_URL}/api/workflows/${transition.sourceRecordId}/transition`;
  const payload =
    transition.relationKind === "nextWorkflow"
      ? {
          transitionIndex: transition.transitionIndex,
          expectedRawTargetId: transition.rawTargetId,
          nextTargetWorkflowId: null,
        }
      : {
          relationKind: transition.relationKind,
          transitionIndex: transition.transitionIndex,
          expectedRawTargetId: transition.rawTargetId,
          nextTargetWorkflowId: null,
        };

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WorkflowMutationResponse;
}

async function createNextWorkflowTransition({
  sourceRecordId,
  transitionIndex,
  nextTargetWorkflowId,
}: {
  sourceRecordId: number;
  transitionIndex: number;
  nextTargetWorkflowId: string;
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/workflows/${sourceRecordId}/next-workflow`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transitionIndex,
        expectedRawTargetId: null,
        nextTargetWorkflowId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WorkflowMutationResponse;
}

function numberLabel(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = "light",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "light" | "dark" | "accent";
}) {
  const toneClass =
    tone === "dark"
      ? "bg-slate-950 text-white hover:bg-slate-800"
      : tone === "accent"
        ? "border border-teal-800/12 bg-teal-700/10 text-teal-950 hover:bg-teal-700/14"
        : "border border-slate-900/10 bg-white/80 text-slate-800 hover:bg-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full px-5 py-3 text-sm font-semibold transition",
        toneClass,
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FloatingControl({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-900/10 bg-white/92 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_30px_rgba(22,32,51,0.08)] backdrop-blur transition hover:bg-white"
    >
      {children}
    </button>
  );
}

function ConfirmationModal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(15,23,42,0.32)] px-6 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-[30px] border border-slate-900/10 bg-white/96 px-7 py-7 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-rose-900/60">
          Delete Edge
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>

        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-slate-900/10 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full border border-rose-900/12 bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Menghapus..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NodeContextMenu({
  workflowId,
  x,
  y,
  editEnabled,
  onAddFlow,
  onClose,
}: {
  workflowId: string;
  x: number;
  y: number;
  editEnabled: boolean;
  onAddFlow: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-40 w-56 rounded-[24px] border border-slate-900/10 bg-white/96 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur"
      style={{ left: x, top: y }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        Node Action
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-950">
        {workflowId}
      </p>
      <button
        type="button"
        onClick={onAddFlow}
        disabled={!editEnabled}
        className="mt-3 flex w-full items-center justify-between rounded-2xl border border-teal-900/10 bg-teal-700/8 px-4 py-3 text-left text-sm font-semibold text-teal-950 transition hover:bg-teal-700/14 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>Add flow</span>
        <span className="text-xs uppercase tracking-[0.18em] text-teal-900/55">
          next
        </span>
      </button>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full rounded-2xl border border-slate-900/8 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Tutup
      </button>
    </div>
  );
}

function EdgeContextMenu({
  edge,
  x,
  y,
  editEnabled,
  onToggleRelationKind,
  onClose,
}: {
  edge: WorkflowFlowEdge;
  x: number;
  y: number;
  editEnabled: boolean;
  onToggleRelationKind: () => void;
  onClose: () => void;
}) {
  const relationKind = edge.data?.relationKind ?? "nextWorkflow";
  const toggleLabel =
    relationKind === "nextWorkflow"
      ? "Ubah menjadi paralel"
      : "Ubah menjadi sequential";

  return (
    <div
      className="fixed z-40 w-64 rounded-[24px] border border-slate-900/10 bg-white/96 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur"
      style={{ left: x, top: y }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        Edge Action
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-950">
        {edge.source} -&gt; {edge.target}
      </p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {relationKind === "nextSequential" ? "next_sequential" : "next_workflow"}
      </p>
      <button
        type="button"
        onClick={onToggleRelationKind}
        disabled={!editEnabled || !edge.data?.editable}
        className="mt-3 flex w-full items-center justify-between rounded-2xl border border-teal-900/10 bg-teal-700/8 px-4 py-3 text-left text-sm font-semibold text-teal-950 transition hover:bg-teal-700/14 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{toggleLabel}</span>
        <span className="text-xs uppercase tracking-[0.18em] text-teal-900/55">
          swap
        </span>
      </button>
      {!edge.data?.editable && edge.data?.editHint ? (
        <p className="mt-3 rounded-2xl border border-slate-900/8 bg-slate-50/90 px-3 py-3 text-xs leading-6 text-slate-600">
          {edge.data.editHint}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full rounded-2xl border border-slate-900/8 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Tutup
      </button>
    </div>
  );
}

function LegendMailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M4 7.5h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m5 8 7 5 7-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LegendUserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5.5 19a6.5 6.5 0 0 1 13 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LegendItem({
  sample,
  title,
  description,
}: {
  sample: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="grid grid-cols-[52px_1fr] items-center gap-3 rounded-2xl border border-slate-900/6 bg-white/78 px-3 py-2.5">
      <div className="flex items-center justify-center">{sample}</div>
      <div>
        <p className="text-xs font-semibold text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function FlowViewport({
  records,
  openNodeIds,
  onToggleNode,
  compactMode,
  selectedEdgeId,
  onSelectEdge,
  editEnabled,
  mutationPending,
  autoLayoutToken,
  pendingAddFlowSourceId,
  onReconnectEdge,
  onCreateEdge,
  onStartAddFlow,
  onAppendAddFlow,
  onCancelAddFlow,
  onDeleteSelection,
  onToggleEdgeRelationKind,
}: {
  records: WorkflowRecord[];
  openNodeIds: string[];
  onToggleNode: (workflowId: string) => void;
  compactMode: boolean;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  editEnabled: boolean;
  mutationPending: boolean;
  autoLayoutToken: number;
  pendingAddFlowSourceId: string | null;
  onReconnectEdge: (
    edge: WorkflowFlowEdge,
    connection: Connection,
  ) => Promise<void>;
  onCreateEdge: (connection: Connection) => Promise<void>;
  onStartAddFlow: (workflowId: string) => void;
  onAppendAddFlow: (targetWorkflowId: string) => Promise<void>;
  onCancelAddFlow: () => void;
  onDeleteSelection: (payload: {
    nodesCount: number;
    edges: WorkflowFlowEdge[];
  }) => Promise<void>;
  onToggleEdgeRelationKind: (edge: WorkflowFlowEdge) => Promise<void>;
}) {
  const deferredOpenNodeIds = useDeferredValue(openNodeIds);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<
    Map<string, XYPosition>
  >(() => new Map());
  const onAppendAddFlowRef = useRef(onAppendAddFlow);
  const stableAddFlowTargetHandlerRef = useRef<
    ((workflowId: string) => void) | null
  >(null);
  const seededAutoLayoutTokenRef = useRef(-1);
  if (!stableAddFlowTargetHandlerRef.current) {
    stableAddFlowTargetHandlerRef.current = (workflowId: string) => {
      void onAppendAddFlowRef.current(workflowId);
    };
  }
  const graph = buildWorkflowFlow(
    records,
    new Set(deferredOpenNodeIds),
    onToggleNode,
    seededAutoLayoutTokenRef.current === autoLayoutToken
      ? positionOverrides
      : undefined,
    stableAddFlowTargetHandlerRef.current,
  );
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    workflowId: string;
    x: number;
    y: number;
  } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [addFlowPointerClientPosition, setAddFlowPointerClientPosition] =
    useState<XYPosition | null>(null);
  const reactFlow = useReactFlow();

  function closeNodeContextMenu() {
    setNodeContextMenu(null);
  }

  function closeEdgeContextMenu() {
    setEdgeContextMenu(null);
  }

  function closeContextMenus() {
    closeNodeContextMenu();
    closeEdgeContextMenu();
  }

  useEffect(() => {
    onAppendAddFlowRef.current = onAppendAddFlow;
  }, [onAppendAddFlow]);

  useEffect(() => {
    const validIds = new Set(records.map((record) => record.workflowId));

    setPositionOverrides((current) => {
      let changed = false;
      const next = new Map<string, XYPosition>();

      current.forEach((position, workflowId) => {
        if (!validIds.has(workflowId)) {
          changed = true;
          return;
        }

        next.set(workflowId, position);
      });

      return changed ? next : current;
    });
  }, [records]);

  function persistNodePosition(workflowId: string, position: XYPosition) {
    setPositionOverrides((current) => {
      const previous = current.get(workflowId);
      if (previous && previous.x === position.x && previous.y === position.y) {
        return current;
      }

      const next = new Map(current);
      next.set(workflowId, position);
      return next;
    });
  }

  useEffect(() => {
    if (!hoveredEdgeId) {
      return;
    }

    const edgeStillExists = graph.edges.some(
      (edge) => edge.id === hoveredEdgeId,
    );
    if (!edgeStillExists) {
      setHoveredEdgeId(null);
    }
  }, [hoveredEdgeId, graph.edges]);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }

    const edgeStillExists = graph.edges.some(
      (edge) => edge.id === selectedEdgeId,
    );
    if (!edgeStillExists) {
      onSelectEdge(null);
    }
  }, [graph.edges, onSelectEdge, selectedEdgeId]);

  useEffect(() => {
    if (!nodeContextMenu) {
      return;
    }

    const nodeStillExists = graph.nodes.some(
      (node) => node.id === nodeContextMenu.workflowId,
    );
    if (!nodeStillExists) {
      setNodeContextMenu(null);
    }
  }, [graph.nodes, nodeContextMenu]);

  useEffect(() => {
    if (!edgeContextMenu) {
      return;
    }

    const edgeStillExists = graph.edges.some(
      (edge) => edge.id === edgeContextMenu.edgeId,
    );
    if (!edgeStillExists) {
      setEdgeContextMenu(null);
    }
  }, [edgeContextMenu, graph.edges]);

  const absoluteNodePositions = useMemo(() => {
    const nodeLookup = new Map(graph.nodes.map((node) => [node.id, node]));
    const cache = new Map<string, XYPosition>();

    function resolveAbsolutePosition(nodeId: string): XYPosition {
      const cached = cache.get(nodeId);
      if (cached) {
        return cached;
      }

      const node = nodeLookup.get(nodeId);
      if (!node) {
        return { x: 0, y: 0 };
      }

      if (!node.parentId) {
        cache.set(nodeId, node.position);
        return node.position;
      }

      const parentPosition = resolveAbsolutePosition(node.parentId);
      const absolutePosition = {
        x: parentPosition.x + node.position.x,
        y: parentPosition.y + node.position.y,
      };
      cache.set(nodeId, absolutePosition);
      return absolutePosition;
    }

    graph.nodes.forEach((node) => {
      resolveAbsolutePosition(node.id);
    });

    return cache;
  }, [graph.nodes]);

  const addFlowPreview = useMemo(() => {
    if (!pendingAddFlowSourceId) {
      return null;
    }

    const sourceNode = graph.nodes.find(
      (node) => node.id === pendingAddFlowSourceId,
    );
    const sourceAbsolutePosition = absoluteNodePositions.get(
      pendingAddFlowSourceId,
    );
    const container = containerRef.current;
    if (!sourceNode || !sourceAbsolutePosition || !container) {
      return null;
    }

    const sourceWidth =
      typeof sourceNode.style?.width === "number" ? sourceNode.style.width : 0;
    const sourceHeight =
      typeof sourceNode.style?.height === "number"
        ? sourceNode.style.height
        : 0;
    const sourceClientPosition = reactFlow.flowToScreenPosition({
      x: sourceAbsolutePosition.x + sourceWidth,
      y: sourceAbsolutePosition.y + sourceHeight / 2,
    });
    const containerRect = container.getBoundingClientRect();

    return {
      start: {
        x: sourceClientPosition.x - containerRect.left,
        y: sourceClientPosition.y - containerRect.top,
      },
      end: addFlowPointerClientPosition
        ? {
            x: addFlowPointerClientPosition.x - containerRect.left,
            y: addFlowPointerClientPosition.y - containerRect.top,
          }
        : {
            x: sourceClientPosition.x - containerRect.left + 120,
            y: sourceClientPosition.y - containerRect.top,
          },
      width: containerRect.width,
      height: containerRect.height,
    };
  }, [
    absoluteNodePositions,
    addFlowPointerClientPosition,
    graph.nodes,
    pendingAddFlowSourceId,
    reactFlow,
  ]);

  useEffect(() => {
    if (!pendingAddFlowSourceId) {
      setAddFlowPointerClientPosition(null);
      return;
    }

    function handlePointerMove(event: MouseEvent) {
      const nextPointerPosition = {
        x: event.clientX,
        y: event.clientY,
      };

      setAddFlowPointerClientPosition((current) => {
        if (
          current &&
          current.x === nextPointerPosition.x &&
          current.y === nextPointerPosition.y
        ) {
          return current;
        }

        return nextPointerPosition;
      });
    }

    window.addEventListener("mousemove", handlePointerMove);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
    };
  }, [pendingAddFlowSourceId]);

  const tracedEdgeId = hoveredEdgeId ?? selectedEdgeId;

  const tracedNodeIds = useMemo(() => {
    if (!tracedEdgeId) {
      return null;
    }

    const tracedEdge = graph.edges.find((edge) => edge.id === tracedEdgeId);
    if (!tracedEdge) {
      return null;
    }

    return new Set([tracedEdge.source, tracedEdge.target]);
  }, [tracedEdgeId, graph.edges]);

  const displayNodes = useMemo(() => {
    return graph.nodes.map((node) => {
      const focused = tracedNodeIds ? tracedNodeIds.has(node.id) : true;

      return {
        ...node,
        data: {
          ...node.data,
          traceHighlighted: Boolean(tracedNodeIds) && focused,
          traceMuted: Boolean(tracedNodeIds) && !focused,
          addFlowTargetMode: Boolean(pendingAddFlowSourceId),
          addFlowSource: pendingAddFlowSourceId === node.id,
        },
        style: {
          ...node.style,
          opacity: tracedNodeIds ? (focused ? 1 : 0.34) : 1,
          transition: "opacity 140ms ease",
        },
      };
    });
  }, [graph.nodes, pendingAddFlowSourceId, tracedNodeIds]);

  const displayEdges = useMemo(() => {
    return graph.edges.map((edge) => {
      const hovered = edge.id === hoveredEdgeId;
      const selected = edge.id === selectedEdgeId;
      const baseOpacity =
        typeof edge.style?.opacity === "number" ? edge.style.opacity : 1;
      const baseZIndex = typeof edge.zIndex === "number" ? edge.zIndex : 1;
      const faded = hoveredEdgeId
        ? !hovered
        : selectedEdgeId
          ? !selected
          : false;
      const baseStroke =
        typeof edge.style?.stroke === "string" ? edge.style.stroke : "#c2410c";
      const stroke = hovered ? "#0e7490" : selected ? "#0f172a" : baseStroke;
      const strokeWidth =
        hovered || selected
          ? hovered
            ? 3.8
            : 3.1
          : typeof edge.style?.strokeWidth === "number"
            ? edge.style.strokeWidth
            : 1.8;

      return {
        ...edge,
        reconnectable:
          editEnabled && !mutationPending
            ? edge.data?.reconnectable
              ? edge.reconnectable
              : false
            : false,
        zIndex: hovered ? 999 : selected ? 500 : baseZIndex,
        animated: hovered ? true : edge.animated,
        markerEnd:
          edge.markerEnd && typeof edge.markerEnd === "object"
            ? {
                ...edge.markerEnd,
                color: stroke,
              }
            : edge.markerEnd,
        style: {
          ...edge.style,
          opacity: faded ? 0.12 : baseOpacity,
          stroke,
          strokeWidth,
          transition: "opacity 140ms ease, stroke-width 140ms ease",
        },
      };
    });
  }, [
    editEnabled,
    graph.edges,
    hoveredEdgeId,
    mutationPending,
    selectedEdgeId,
  ]);

  useEffect(() => {
    if (seededAutoLayoutTokenRef.current === autoLayoutToken) {
      return;
    }

    if (graph.nodes.length === 0) {
      return;
    }

    seededAutoLayoutTokenRef.current = autoLayoutToken;
    setPositionOverrides(captureNodePositions(graph.nodes));

    const timer = window.setTimeout(() => {
      void reactFlow.fitView({
        padding: compactMode ? 0.12 : 0.18,
        duration: 500,
        minZoom: 0.08,
        maxZoom: 1.1,
      });
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoLayoutToken, compactMode, graph.nodes, reactFlow]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        elementsSelectable
        zoomOnDoubleClick={false}
        nodesDraggable
        nodesConnectable={editEnabled && !mutationPending}
        edgesReconnectable={editEnabled && !mutationPending}
        deleteKeyCode={["Backspace", "Delete"]}
        panOnScroll
        isValidConnection={(connection) => {
          return (
            editEnabled &&
            Boolean(connection.source) &&
            Boolean(connection.target) &&
            connection.source !== connection.target
          );
        }}
        onBeforeDelete={async ({ nodes, edges }) => {
          await onDeleteSelection({
            nodesCount: nodes.length,
            edges: edges as WorkflowFlowEdge[],
          });

          return false;
        }}
        defaultEdgeOptions={{
          zIndex: 2,
          interactionWidth: 30,
        }}
        onEdgeClick={(_event, edge) => {
          closeContextMenus();
          onSelectEdge(edge.id);
        }}
        onConnect={(connection) => {
          void onCreateEdge(connection);
        }}
        onNodeClick={(event, node) => {
          closeContextMenus();
          setHoveredEdgeId(null);

          if (!pendingAddFlowSourceId) {
            return;
          }

          event.preventDefault();

          if (node.id === pendingAddFlowSourceId) {
            onCancelAddFlow();
            return;
          }

          void onAppendAddFlow(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          event.stopPropagation();
          setHoveredEdgeId(null);
          onSelectEdge(null);
          closeEdgeContextMenu();

          const menuWidth = 224;
          const menuHeight = 136;
          const nextX = Math.min(
            event.clientX,
            Math.max(16, window.innerWidth - menuWidth - 16),
          );
          const nextY = Math.min(
            event.clientY,
            Math.max(16, window.innerHeight - menuHeight - 16),
          );

          setNodeContextMenu({
            workflowId: node.id,
            x: nextX,
            y: nextY,
          });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          event.stopPropagation();
          closeNodeContextMenu();
          setHoveredEdgeId(edge.id);
          onSelectEdge(edge.id);

          const menuWidth = 256;
          const menuHeight = edge.data?.editable ? 156 : 214;
          const nextX = Math.min(
            event.clientX,
            Math.max(16, window.innerWidth - menuWidth - 16),
          );
          const nextY = Math.min(
            event.clientY,
            Math.max(16, window.innerHeight - menuHeight - 16),
          );

          setEdgeContextMenu({
            edgeId: edge.id,
            x: nextX,
            y: nextY,
          });
        }}
        onNodeDrag={(_event, node) => {
          persistNodePosition(node.id, node.position);
        }}
        onNodeMouseEnter={() => {
          closeContextMenus();
          setHoveredEdgeId(null);
        }}
        onNodeDragStop={(_event, node) => {
          persistNodePosition(node.id, node.position);
        }}
        onEdgeMouseEnter={(_event, edge) => {
          setHoveredEdgeId(edge.id);
        }}
        onEdgeMouseLeave={() => {
          setHoveredEdgeId(null);
        }}
        onPaneClick={() => {
          closeContextMenus();
          setHoveredEdgeId(null);
          if (pendingAddFlowSourceId) {
            onCancelAddFlow();
          }
          onSelectEdge(null);
        }}
        onPaneContextMenu={() => {
          closeContextMenus();
        }}
        onReconnectStart={() => {
          closeContextMenus();
          setHoveredEdgeId(null);
        }}
        onReconnect={(edge, connection) => {
          void onReconnectEdge(edge as WorkflowFlowEdge, connection);
        }}
        onReconnectEnd={() => {
          setHoveredEdgeId(null);
        }}
      >
        <Background
          gap={22}
          size={1}
          color="rgba(22, 32, 51, 0.12)"
          variant={BackgroundVariant.Dots}
        />

        {nodeContextMenu ? (
          <NodeContextMenu
            workflowId={nodeContextMenu.workflowId}
            x={nodeContextMenu.x}
            y={nodeContextMenu.y}
            editEnabled={editEnabled && !mutationPending}
            onAddFlow={() => {
              onStartAddFlow(nodeContextMenu.workflowId);
              closeNodeContextMenu();
            }}
            onClose={() => {
              closeNodeContextMenu();
            }}
          />
        ) : null}

        {edgeContextMenu
          ? (() => {
              const contextEdge =
                graph.edges.find((edge) => edge.id === edgeContextMenu.edgeId) ??
                null;
              if (!contextEdge) {
                return null;
              }

              return (
                <EdgeContextMenu
                  edge={contextEdge}
                  x={edgeContextMenu.x}
                  y={edgeContextMenu.y}
                  editEnabled={editEnabled && !mutationPending}
                  onToggleRelationKind={() => {
                    void onToggleEdgeRelationKind(contextEdge);
                    closeEdgeContextMenu();
                  }}
                  onClose={() => {
                    closeEdgeContextMenu();
                  }}
                />
              );
            })()
          : null}
      </ReactFlow>

      {addFlowPreview ? (
        <svg
          className="pointer-events-none absolute inset-0 z-20 overflow-visible"
          width={addFlowPreview.width}
          height={addFlowPreview.height}
          viewBox={`0 0 ${addFlowPreview.width} ${addFlowPreview.height}`}
        >
          <defs>
            <marker
              id="add-flow-preview-marker"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill="#0f766e" />
            </marker>
          </defs>
          <line
            x1={addFlowPreview.start.x}
            y1={addFlowPreview.start.y}
            x2={addFlowPreview.end.x}
            y2={addFlowPreview.end.y}
            stroke="#0f766e"
            strokeWidth="2.4"
            strokeDasharray="8 6"
            strokeLinecap="round"
            opacity="0.92"
            markerEnd="url(#add-flow-preview-marker)"
          />
        </svg>
      ) : null}
    </div>
  );
}

export function WorkflowStudio() {
  const [records, setRecords] = useState<WorkflowRecord[]>([]);
  const [meta, setMeta] = useState<WorkflowApiMeta>({
    databaseConfigured: false,
    warnings: [],
  });
  const [source, setSource] = useState<WorkflowApiResponse["source"]>("seed");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [openNodeIds, setOpenNodeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [savingEdgeId, setSavingEdgeId] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingDeleteEdge, setPendingDeleteEdge] =
    useState<WorkflowFlowEdge | null>(null);
  const [pendingAddFlowSourceId, setPendingAddFlowSourceId] = useState<
    string | null
  >(null);
  const [autoLayoutToken, setAutoLayoutToken] = useState(0);

  function applyWorkflowMutation(payload: WorkflowMutationResponse) {
    startTransition(() => {
      setRecords((currentRecords) =>
        currentRecords.map((record) => {
          if (record.workflowId !== payload.workflowId) {
            return record;
          }

          return {
            ...record,
            nextWorkflow: payload.nextWorkflow || null,
            nextWorkflowIds: payload.nextWorkflowIds,
            nextSequential: payload.nextSequential || null,
            nextSequentialIds: payload.nextSequentialIds,
          };
        }),
      );
      setFetchedAt(payload.updatedAt);
      setSource("database");
      setError(null);
    });
  }

  async function fetchWorkflows(
    requestedSource?: WorkflowApiResponse["source"],
    options?: {
      background?: boolean;
    },
  ) {
    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
    }

    try {
      const endpoint = requestedSource
        ? `${API_BASE_URL}/api/workflows?source=${requestedSource}`
        : `${API_BASE_URL}/api/workflows`;
      const response = await fetch(endpoint, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}.`);
      }

      const payload = (await response.json()) as WorkflowApiResponse;
      const normalizedItems = payload.items.map(normalizeWorkflowRecord);
      const nextExpandableIds = getExpandableWorkflowIds(normalizedItems);

      startTransition(() => {
        setRecords(normalizedItems);
        setMeta(payload.meta);
        setSource(payload.source);
        setFetchedAt(payload.fetchedAt);
        setOpenNodeIds((currentIds) =>
          currentIds.filter((workflowId) =>
            nextExpandableIds.includes(workflowId),
          ),
        );
        setError(null);
      });
    } catch (fetchError) {
      const errorMessage =
        fetchError instanceof Error
          ? fetchError.message
          : "Unknown error while loading workflow data.";

      startTransition(() => {
        if (background) {
          setMutationError(errorMessage);
          return;
        }

        setError(errorMessage);
      });
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void fetchWorkflows();
  }, []);

  const editEnabled =
    source === "database" && !loading && !error && meta.databaseConfigured;
  const expandableIds = getExpandableWorkflowIds(records);
  const graphPreview = buildWorkflowFlow(
    records,
    new Set(openNodeIds),
    () => {},
  );
  const recordsByWorkflowId = useMemo(
    () => new Map(records.map((record) => [record.workflowId, record])),
    [records],
  );
  const selectedEdge =
    graphPreview.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const compactMode = leftCollapsed;

  useEffect(() => {
    if (selectedEdgeId && !selectedEdge) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdge, selectedEdgeId]);

  useEffect(() => {
    if (!pendingDeleteEdge || savingEdgeId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setPendingDeleteEdge(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingDeleteEdge, savingEdgeId]);

  useEffect(() => {
    if (!pendingAddFlowSourceId || savingEdgeId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setPendingAddFlowSourceId(null);
      setMutationMessage("Mode Add flow dibatalkan.");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingAddFlowSourceId, savingEdgeId]);

  useEffect(() => {
    if (!selectedEdge || savingEdgeId) {
      return;
    }

    const activeSelectedEdge = selectedEdge;

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreDeleteShortcut(event.target)) {
        return;
      }

      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }

      event.preventDefault();
      void handleDeleteSelection({
        nodesCount: 0,
        edges: [activeSelectedEdge],
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [savingEdgeId, selectedEdge]);

  function handleToggleNode(workflowId: string) {
    startTransition(() => {
      setOpenNodeIds((currentIds) => {
        if (currentIds.includes(workflowId)) {
          return currentIds.filter((currentId) => currentId !== workflowId);
        }

        return [...currentIds, workflowId];
      });
    });
  }

  function handleStartAddFlow(workflowId: string) {
    if (!editEnabled) {
      setMutationError(
        "Penambahan panah hanya tersedia saat source aktif berasal dari database.",
      );
      return;
    }

    if (!recordsByWorkflowId.has(workflowId)) {
      setMutationError("Workflow sumber tidak ditemukan.");
      return;
    }

    setPendingDeleteEdge(null);
    setSelectedEdgeId(null);
    setMutationError(null);
    setPendingAddFlowSourceId(workflowId);
    setMutationMessage(
      `Mode Add flow aktif untuk ${workflowId}. Klik node tujuan untuk menambahkan relasi next_workflow.`,
    );
  }

  function handleCancelAddFlow() {
    setPendingAddFlowSourceId(null);
    setMutationMessage("Mode Add flow dibatalkan.");
  }

  async function appendNextWorkflowLink({
    sourceWorkflowId,
    targetWorkflowId,
    requireEmptySource,
  }: {
    sourceWorkflowId: string;
    targetWorkflowId: string;
    requireEmptySource: boolean;
  }) {
    if (!editEnabled) {
      setMutationError(
        "Penambahan panah hanya tersedia saat source aktif berasal dari database.",
      );
      return;
    }

    if (
      !sourceWorkflowId ||
      !targetWorkflowId ||
      sourceWorkflowId === targetWorkflowId
    ) {
      setMutationError("Workflow tidak bisa diarahkan ke dirinya sendiri.");
      return;
    }

    const sourceRecord = recordsByWorkflowId.get(sourceWorkflowId);
    const targetRecord = recordsByWorkflowId.get(targetWorkflowId);

    if (!sourceRecord || !targetRecord) {
      setMutationError("Node sumber atau tujuan tidak ditemukan.");
      return;
    }

    if (requireEmptySource && (sourceRecord.nextWorkflowIds ?? []).length > 0) {
      setMutationError(
        `Workflow ${sourceWorkflowId} sudah memiliki next_workflow. Gunakan klik kanan Add flow untuk append relasi baru.`,
      );
      return;
    }

    if (
      (sourceRecord.nextWorkflowIds ?? []).includes(targetRecord.workflowId)
    ) {
      setMutationError(
        `Relasi ${sourceWorkflowId} -> ${targetWorkflowId} sudah ada.`,
      );
      return;
    }

    const transitionIndex = (sourceRecord.nextWorkflowIds ?? []).length;

    setSavingEdgeId(`create:${sourceWorkflowId}`);
    setMutationError(null);
    setMutationMessage(
      transitionIndex === 0
        ? `Menambahkan relasi ${sourceWorkflowId} -> ${targetWorkflowId}.`
        : `Menambahkan relasi tambahan ${sourceWorkflowId} -> ${targetWorkflowId}.`,
    );

    try {
      const mutationResponse = await createNextWorkflowTransition({
        sourceRecordId: sourceRecord.id,
        transitionIndex,
        nextTargetWorkflowId: targetRecord.workflowId,
      });
      applyWorkflowMutation(mutationResponse);
      void fetchWorkflows("database", { background: true });
      startTransition(() => {
        setPendingAddFlowSourceId(null);
        setMutationMessage(
          transitionIndex === 0
            ? `Relasi ${sourceWorkflowId} -> ${targetWorkflowId} berhasil ditambahkan.`
            : `Relasi tambahan ${sourceWorkflowId} -> ${targetWorkflowId} berhasil ditambahkan.`,
        );
      });
    } catch (mutationFailure) {
      setMutationError(
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "Gagal menambahkan panah baru.",
      );
    } finally {
      setSavingEdgeId(null);
    }
  }

  async function runEdgeMutation(
    edge: WorkflowFlowEdge,
    nextTargetWorkflowId: string | null,
  ) {
    const transition = getPrimaryTransition(edge);

    if (!editEnabled) {
      setMutationError(
        "Edit edge hanya tersedia saat source aktif berasal dari database.",
      );
      return;
    }

    if (!edge.data?.editable || !transition) {
      setMutationError(
        edge.data?.editHint || "Edge ini belum bisa dimodifikasi langsung.",
      );
      return;
    }

    setSavingEdgeId(edge.id);
    setMutationError(null);
    setPendingAddFlowSourceId(null);
    setMutationMessage(
      nextTargetWorkflowId
        ? `Menyimpan perubahan relasi ${transition.sourceWorkflowId} -> ${nextTargetWorkflowId}.`
        : `Menghapus relasi ${transition.sourceWorkflowId} -> ${transition.resolvedTargetWorkflowId} dari ${relationFieldLabel(transition.relationKind)}.`,
    );

    try {
      const mutationResponse = nextTargetWorkflowId
        ? await updateNextWorkflowTransition(edge, nextTargetWorkflowId)
        : await deleteWorkflowTransition(edge);
      applyWorkflowMutation(mutationResponse);
      void fetchWorkflows("database", { background: true });
      startTransition(() => {
        setSelectedEdgeId(null);
        setPendingDeleteEdge(null);
        setMutationMessage(
          nextTargetWorkflowId
            ? `Relasi ${transition.sourceWorkflowId} berhasil dipindahkan ke ${nextTargetWorkflowId}.`
            : `Relasi ${transition.sourceWorkflowId} -> ${transition.resolvedTargetWorkflowId} di ${relationFieldLabel(transition.relationKind)} berhasil dihapus.`,
        );
      });
    } catch (mutationFailure) {
      setMutationError(
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "Gagal menyimpan perubahan edge.",
      );
    } finally {
      setSavingEdgeId(null);
    }
  }

  async function handleReconnectEdge(
    edge: WorkflowFlowEdge,
    connection: Connection,
  ) {
    const transition = getPrimaryTransition(edge);
    const nextTargetWorkflowId = connection.target;

    if (!nextTargetWorkflowId || !transition) {
      return;
    }

    if (nextTargetWorkflowId === transition.resolvedTargetWorkflowId) {
      setMutationMessage(
        `Relasi ${transition.sourceWorkflowId} tetap mengarah ke ${transition.resolvedTargetWorkflowId}.`,
      );
      setMutationError(null);
      return;
    }

    await runEdgeMutation(edge, nextTargetWorkflowId);
  }

  async function handleCreateEdge(connection: Connection) {
    const sourceWorkflowId = connection.source;
    const targetWorkflowId = connection.target;
    await appendNextWorkflowLink({
      sourceWorkflowId: sourceWorkflowId ?? "",
      targetWorkflowId: targetWorkflowId ?? "",
      requireEmptySource: true,
    });
  }

  async function handleAppendAddFlow(targetWorkflowId: string) {
    if (!pendingAddFlowSourceId) {
      return;
    }

    await appendNextWorkflowLink({
      sourceWorkflowId: pendingAddFlowSourceId,
      targetWorkflowId,
      requireEmptySource: false,
    });
  }

  async function handleDeleteSelection({
    nodesCount,
    edges,
  }: {
    nodesCount: number;
    edges: WorkflowFlowEdge[];
  }) {
    if (nodesCount > 0) {
      setMutationError("Node tidak bisa dihapus dari visualisasi ini.");
      return;
    }

    if (edges.length === 0) {
      return;
    }

    if (edges.length > 1) {
      setMutationError("Hapus edge dilakukan satu per satu.");
      return;
    }

    const edge = edges[0];
    const transition = getPrimaryTransition(edge);

    if (!edge.data?.editable || !transition) {
      setMutationError(
        edge.data?.editHint || "Edge ini belum bisa dihapus langsung.",
      );
      return;
    }

    setPendingDeleteEdge(edge);
  }

  async function handleConfirmDeleteEdge() {
    if (!pendingDeleteEdge) {
      return;
    }

    await runEdgeMutation(pendingDeleteEdge, null);
  }

  async function handleToggleEdgeRelationKind(edge: WorkflowFlowEdge) {
    const transition = getPrimaryTransition(edge);

    if (!editEnabled) {
      setMutationError(
        "Edit edge hanya tersedia saat source aktif berasal dari database.",
      );
      return;
    }

    if (!edge.data?.editable || !transition) {
      setMutationError(
        edge.data?.editHint || "Edge ini belum bisa dimodifikasi langsung.",
      );
      return;
    }

    const nextRelationKind: WorkflowRelationKind =
      transition.relationKind === "nextWorkflow"
        ? "nextSequential"
        : "nextWorkflow";

    setSavingEdgeId(edge.id);
    setMutationError(null);
    setPendingAddFlowSourceId(null);
    setPendingDeleteEdge(null);
    setMutationMessage(
      `Memindahkan relasi ${transition.sourceWorkflowId} -> ${transition.resolvedTargetWorkflowId} ke ${relationFieldLabel(nextRelationKind)}.`,
    );

    try {
      const mutationResponse = await updateWorkflowTransitionRelationKind(edge);
      applyWorkflowMutation(mutationResponse);
      void fetchWorkflows("database", { background: true });
      startTransition(() => {
        setSelectedEdgeId(null);
        setMutationMessage(
          `Relasi ${transition.sourceWorkflowId} -> ${transition.resolvedTargetWorkflowId} berhasil diubah menjadi ${relationDisplayLabel(nextRelationKind)}.`,
        );
      });
    } catch (mutationFailure) {
      setMutationError(
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "Gagal mengubah jenis edge.",
      );
    } finally {
      setSavingEdgeId(null);
    }
  }

  function handleExpandAll() {
    startTransition(() => {
      setOpenNodeIds(expandableIds);
    });
  }

  function handleCollapseAll() {
    startTransition(() => {
      setOpenNodeIds([]);
    });
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden px-4 py-4 text-slate-950 md:px-6 md:py-6">
      <section
        className={[
          "grid min-h-0 flex-1 gap-4",
          leftCollapsed ? "grid-cols-1" : "xl:grid-cols-[320px_minmax(0,1fr)]",
        ].join(" ")}
      >
        {!leftCollapsed ? (
          <aside className="min-h-0 overflow-y-auto rounded-[32px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                Left Panel
              </p>
              <ActionButton
                onClick={() => {
                  setLeftCollapsed(true);
                }}
              >
                Hide
              </ActionButton>
            </div>

            <div className="mt-4 rounded-[24px] bg-white/74 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                Legend
              </p>
              <div className="mt-3 space-y-2">
                <LegendItem
                  sample={
                    <span className="h-8 w-8 rounded-[6px] border border-slate-900/14 bg-white" />
                  }
                  title="Leaf node (workflow tanpa child)."
                />
                <LegendItem
                  sample={
                    <span className="h-8 w-8 rounded-[6px] border-2 border-amber-700/45 bg-[radial-gradient(circle_at_top_left,rgba(255,244,210,0.95),rgba(255,249,238,0.94)_40%,rgba(233,251,247,0.94))]" />
                  }
                  title="Parent node (punya child, bisa collapse/expand)."
                />
                <LegendItem
                  sample={
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-teal-700/18 bg-teal-700/10 text-teal-900">
                      <LegendMailIcon />
                    </span>
                  }
                  title="`need_bucket = 1`."
                />
                <LegendItem
                  sample={
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-amber-700/18 bg-amber-700/10 text-amber-900">
                      <LegendUserIcon />
                    </span>
                  }
                  title="`update_status_parent = 1`."
                />
                <LegendItem
                  sample={
                    <span className="h-[2px] w-8 rounded-full bg-[#c2410c]" />
                  }
                  title="Relasi sequential"
                />
                <LegendItem
                  sample={
                    <span className="h-0 w-8 border-t-2 border-dashed border-teal-700" />
                  }
                  title="Relasi paralel."
                />
                <LegendItem
                  sample={
                    <span className="h-[3px] w-8 rounded-full bg-cyan-700" />
                  }
                  title="Edge yang sedang di-hover untuk tracing."
                />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-[24px] bg-white/74 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                  Edit Next Flow
                </p>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  <p>
                    Mode:{" "}
                    <span className="font-semibold text-slate-950">
                      {editEnabled ? "Editable" : "Read only"}
                    </span>
                  </p>
                  <p>Node sekarang bisa digeser untuk merapikan area kerja.</p>
                  <p>
                    Geser ujung panah ke node lain untuk mengganti
                    `next_workflow`.
                  </p>
                  <p>
                    Klik kanan node lalu pilih `Add flow`, kemudian klik node
                    tujuan untuk append relasi baru.
                  </p>
                  <p>
                    Pilih satu edge lalu tekan `Delete` atau `Backspace` untuk
                    menghapus panah, termasuk edge paralel.
                  </p>
                  <p>
                    Klik kanan edge untuk menukar relasi sequential dan
                    paralel.
                  </p>
                  {pendingAddFlowSourceId ? (
                    <div className="rounded-2xl border border-teal-900/10 bg-teal-50/92 px-3 py-3 text-xs leading-6 text-teal-950">
                      Mode Add flow aktif dari{" "}
                      <span className="font-semibold">
                        {pendingAddFlowSourceId}
                      </span>
                      . Klik node tujuan atau tekan `Escape` untuk batal.
                    </div>
                  ) : null}
                  {selectedEdge ? (
                    <div className="rounded-2xl border border-slate-900/8 bg-slate-50/90 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                        Selected edge
                      </p>
                      <p className="mt-2 font-semibold text-slate-950">
                        {selectedEdge.source} -&gt; {selectedEdge.target}
                      </p>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {selectedEdge.data?.relationKind === "nextSequential"
                          ? "next_sequential"
                          : "next_workflow"}
                      </p>
                      <p className="mt-2 text-xs leading-6 text-slate-600">
                        {selectedEdge.data?.editable
                          ? selectedEdge.data?.reconnectable
                            ? "Edge ini bisa dipindahkan, dihapus, atau ditukar menjadi paralel."
                            : "Edge ini bisa dihapus atau ditukar jenis relasinya."
                          : selectedEdge.data?.editHint ||
                            "Edge ini belum bisa diedit langsung."}
                      </p>
                      {selectedEdge.data?.editable ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteSelection({
                                nodesCount: 0,
                                edges: [selectedEdge],
                              });
                            }}
                            disabled={Boolean(savingEdgeId)}
                            className="rounded-full border border-rose-900/12 bg-rose-600/10 px-4 py-2 text-xs font-semibold text-rose-950 transition hover:bg-rose-600/16 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Hapus edge terpilih
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleEdgeRelationKind(selectedEdge);
                            }}
                            disabled={Boolean(savingEdgeId)}
                            className="rounded-full border border-teal-900/12 bg-teal-700/10 px-4 py-2 text-xs font-semibold text-teal-950 transition hover:bg-teal-700/16 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {selectedEdge.data?.relationKind === "nextSequential"
                              ? "Ubah menjadi sequential"
                              : "Ubah menjadi paralel"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[24px] bg-white/74 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                  Graph Health
                </p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Visible edges</span>
                    <span className="font-semibold text-slate-950">
                      {numberLabel(graphPreview.stats.visibleEdges)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Unresolved links</span>
                    <span className="font-semibold text-slate-950">
                      {numberLabel(graphPreview.stats.unresolvedLinks)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Open parents</span>
                    <span className="font-semibold text-slate-950">
                      {numberLabel(openNodeIds.length)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] bg-white/74 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                  Data Source
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>
                    Status backend:{" "}
                    <span className="font-semibold text-slate-950">
                      {loading ? "Loading" : error ? "Error" : "Ready"}
                    </span>
                  </p>
                  <p>
                    Database config:{" "}
                    <span className="font-semibold text-slate-950">
                      {meta.databaseConfigured
                        ? "Configured"
                        : "Not configured"}
                    </span>
                  </p>
                  <p>
                    Saving edge:{" "}
                    <span className="font-semibold text-slate-950">
                      {savingEdgeId ? "In progress" : "Idle"}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <div className="relative min-h-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--background-deep)] shadow-[var(--shadow)]">
          <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
            {leftCollapsed ? (
              <FloatingControl
                onClick={() => {
                  setLeftCollapsed(false);
                }}
              >
                Show left panel
              </FloatingControl>
            ) : (
              <FloatingControl
                onClick={() => {
                  setLeftCollapsed(true);
                }}
              >
                Hide left panel
              </FloatingControl>
            )}

            <FloatingControl onClick={handleExpandAll}>
              Open all parent
            </FloatingControl>
            <FloatingControl onClick={handleCollapseAll}>
              Collapse all parent
            </FloatingControl>
            <FloatingControl
              onClick={() => {
                setAutoLayoutToken((current) => current + 1);
              }}
            >
              Auto layout
            </FloatingControl>
            <FloatingControl
              onClick={() => {
                void fetchWorkflows(source);
              }}
            >
              Reload
            </FloatingControl>
            <span className="inline-flex items-center rounded-full border border-slate-900/10 bg-white/92 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_30px_rgba(22,32,51,0.08)]">
              Source {source}
            </span>
            {fetchedAt ? (
              <span className="inline-flex items-center rounded-full border border-slate-900/10 bg-white/92 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_30px_rgba(22,32,51,0.08)]">
                Updated {new Date(fetchedAt).toLocaleString("id-ID")}
              </span>
            ) : null}
          </div>

          {meta.warnings.length > 0 || mutationError || mutationMessage ? (
            <div className="absolute left-4 top-[4.7rem] z-20 flex max-w-[min(42rem,calc(100%-2rem))] flex-col gap-2">
              {meta.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-[22px] border border-amber-900/10 bg-amber-50/94 px-4 py-3 text-sm text-amber-950 shadow-[0_10px_30px_rgba(22,32,51,0.08)] backdrop-blur"
                >
                  {warning}
                </div>
              ))}
              {mutationError || mutationMessage ? (
                <div
                  className={[
                    "rounded-[22px] px-4 py-3 text-sm shadow-[0_10px_30px_rgba(22,32,51,0.08)] backdrop-blur",
                    mutationError
                      ? "border border-rose-900/10 bg-rose-50/94 text-rose-950"
                      : "border border-teal-900/10 bg-teal-50/94 text-teal-950",
                  ].join(" ")}
                >
                  {mutationError || mutationMessage}
                </div>
              ) : null}
            </div>
          ) : null}

          {loading && records.length === 0 ? (
            <div className="flex h-full min-h-[72vh] items-center justify-center px-6 text-center">
              <div className="max-w-md rounded-[28px] border border-slate-900/8 bg-white/78 px-8 py-8 shadow-[0_18px_50px_rgba(22,32,51,0.08)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Loading
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  Menarik data workflow dari backend
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Pastikan backend `new-wfe-be` berjalan di port 3001 atau set
                  `NEXT_PUBLIC_API_BASE_URL` ke endpoint Anda.
                </p>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(239,230,212,0.82)] px-6">
              <div className="max-w-lg rounded-[28px] border border-amber-900/12 bg-white/90 px-8 py-8 text-center shadow-[0_18px_50px_rgba(22,32,51,0.08)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-900/60">
                  Backend Error
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  Data workflow belum bisa dimuat
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    void fetchWorkflows(source);
                  }}
                  className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Coba lagi
                </button>
              </div>
            </div>
          ) : null}

          {pendingDeleteEdge ? (
            <ConfirmationModal
              title="Hapus flow?"
              description={`Relasi ${pendingDeleteEdge.source} -> ${pendingDeleteEdge.target} akan dihapus dari nilai ${relationFieldLabel(pendingDeleteEdge.data?.relationKind ?? "nextWorkflow")}.`}
              confirmLabel="Ya, hapus flow"
              busy={Boolean(savingEdgeId)}
              onCancel={() => {
                if (!savingEdgeId) {
                  setPendingDeleteEdge(null);
                }
              }}
              onConfirm={() => {
                void handleConfirmDeleteEdge();
              }}
            />
          ) : null}

          {records.length > 0 ? (
            <ReactFlowProvider>
              <FlowViewport
                records={records}
                openNodeIds={openNodeIds}
                onToggleNode={handleToggleNode}
                compactMode={compactMode}
                selectedEdgeId={selectedEdgeId}
                onSelectEdge={setSelectedEdgeId}
                editEnabled={editEnabled}
                mutationPending={Boolean(savingEdgeId)}
                autoLayoutToken={autoLayoutToken}
                pendingAddFlowSourceId={pendingAddFlowSourceId}
                onReconnectEdge={handleReconnectEdge}
                onCreateEdge={handleCreateEdge}
                onStartAddFlow={handleStartAddFlow}
                onAppendAddFlow={handleAppendAddFlow}
                onCancelAddFlow={handleCancelAddFlow}
                onDeleteSelection={handleDeleteSelection}
                onToggleEdgeRelationKind={handleToggleEdgeRelationKind}
              />
            </ReactFlowProvider>
          ) : null}
        </div>
      </section>
    </main>
  );
}

import {
  MarkerType,
  type Edge,
  type Node,
  type XYPosition,
} from "@xyflow/react";

const ROOT_ID = "__root__";
const LEAF_WIDTH = 272;
const LEAF_HEIGHT = 132;
const COLLAPSED_PARENT_WIDTH = LEAF_WIDTH;
const COLLAPSED_PARENT_HEIGHT = LEAF_HEIGHT;
const EXPANDED_MIN_WIDTH = LEAF_WIDTH;
const EXPANDED_HEADER_HEIGHT = LEAF_HEIGHT;
const GROUP_PADDING_X = 28;
const GROUP_PADDING_Y = 28;
const COLUMN_GAP = 86;
const ROW_GAP = 32;
const SECTION_GAP = 72;

export type WorkflowRecord = {
  id: number;
  workflowId: string;
  moduleName: string;
  processName: string;
  nextWorkflow: string | null;
  nextWorkflowIds: string[];
  nextSequential: string | null;
  nextSequentialIds: string[];
  conditionalNextWorkflow: string | null;
  conditionalNextWorkflowIds: string[];
  migrateData: string[];
  parentWorkflowId: string | null;
  division: string | null;
  updateStatusParent: boolean;
  revisionWorkflowId: string | null;
  needBucket: boolean;
  createdDate: string | null;
  createdBy: number | null;
  modifiedDate: string | null;
  modifiedBy: number | null;
  isDeleted: boolean;
  isShow: boolean;
};

export type WorkflowApiMeta = {
  databaseConfigured: boolean;
  warnings: string[];
};

export type WorkflowApiResponse = {
  source: "seed" | "database";
  count: number;
  items: WorkflowRecord[];
  meta: WorkflowApiMeta;
  fetchedAt: string;
};

export type WorkflowNodeData = {
  recordId: number;
  workflowId: string;
  moduleName: string;
  processName: string;
  childCount: number;
  nextCount: number;
  canCreateNextWorkflow: boolean;
  hasChildren: boolean;
  expanded: boolean;
  needBucket: boolean;
  updateStatusParent: boolean;
  traceHighlighted?: boolean;
  traceMuted?: boolean;
  addFlowTargetMode?: boolean;
  addFlowSource?: boolean;
  onToggle: (workflowId: string) => void;
  onSelectAddFlowTarget?: (workflowId: string) => void;
};

type WorkflowNode = Node<WorkflowNodeData>;

type LayoutEntry = {
  width: number;
  height: number;
  childPositions: Map<string, XYPosition>;
};

type LayoutResult = {
  width: number;
  height: number;
  positions: Map<string, XYPosition>;
};

export type WorkflowPositionOverrides = ReadonlyMap<string, XYPosition>;

type VisibleEdge = {
  id: string;
  source: string;
  target: string;
  pathCount: number;
  transitions: WorkflowTransition[];
};

export type WorkflowGraphStats = {
  totalRows: number;
  visibleNodes: number;
  visibleEdges: number;
  expandableNodes: number;
  unresolvedLinks: number;
};

export type WorkflowGraphResult = {
  nodes: WorkflowNode[];
  edges: WorkflowFlowEdge[];
  stats: WorkflowGraphStats;
};

export type WorkflowTransition = {
  relationKind: WorkflowRelationKind;
  visibilityMode: WorkflowTransitionVisibilityMode;
  sourceRecordId: number;
  sourceWorkflowId: string;
  rawTargetId: string;
  resolvedTargetWorkflowId: string;
  transitionIndex: number;
  isDirect: boolean;
};

export type WorkflowRelationKind = "nextWorkflow" | "nextSequential";

export type WorkflowTransitionVisibilityMode = "direct" | "collapsed";

export type WorkflowEdgeData = {
  relationKind: WorkflowRelationKind;
  visibilityMode: WorkflowTransitionVisibilityMode;
  editable: boolean;
  reconnectable: boolean;
  editHint: string | null;
  transitionCount: number;
  transitions: WorkflowTransition[];
};

export type WorkflowFlowEdge = Edge<WorkflowEdgeData>;

function getEdgeStyleConfig(
  relationKind: WorkflowRelationKind,
  visibilityMode: WorkflowTransitionVisibilityMode,
  pathCount: number,
) {
  if (relationKind === "nextSequential") {
    return {
      edgeType: "default" as const,
      color: "#0f766e",
      strokeWidth: visibilityMode === "direct" ? 1.8 : 1.2,
      strokeDasharray: "7 8",
      opacity: visibilityMode === "direct" ? 0.68 : 0.38,
      markerWidth: 14,
      markerHeight: 14,
      pathOptions: {
        curvature: visibilityMode === "direct" ? 0.18 : 0.26,
      },
      zIndex: visibilityMode === "direct" ? 1 : 0,
    };
  }

  return {
    edgeType: "smoothstep" as const,
    color:
      visibilityMode === "direct"
        ? pathCount > 1
          ? "#0f766e"
          : "#c2410c"
        : "#c2410c",
    strokeWidth:
      visibilityMode === "direct"
        ? pathCount > 1
          ? 2.4
          : 1.8
        : 1.45,
    strokeDasharray: undefined,
    opacity: visibilityMode === "direct" ? 0.96 : 0.46,
    markerWidth: 18,
    markerHeight: 18,
    pathOptions: {
      offset:
        visibilityMode === "direct"
          ? pathCount > 1
            ? 24
            : 18
          : 30,
      borderRadius: 14,
    },
    zIndex: visibilityMode === "direct" ? 2 : 1,
  };
}

function buildAliasLookup(records: WorkflowRecord[]) {
  const lookup = new Map<string, string>();

  for (const record of records) {
    const aliases = [record.workflowId, record.processName, record.moduleName];

    for (const alias of aliases) {
      if (!alias || lookup.has(alias)) {
        continue;
      }

      lookup.set(alias, record.workflowId);
    }
  }

  return lookup;
}

function makeChildrenMap(
  records: WorkflowRecord[],
  parentById: Map<string, string | null>,
) {
  const childrenByParent = new Map<string, WorkflowRecord[]>();

  for (const record of records) {
    const parentId = parentById.get(record.workflowId) ?? null;
    const parentKey = parentId ?? ROOT_ID;
    const siblings = childrenByParent.get(parentKey);

    if (siblings) {
      siblings.push(record);
      continue;
    }

    childrenByParent.set(parentKey, [record]);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.id - right.id);
  }

  return childrenByParent;
}

function getNormalizedParentIds(records: WorkflowRecord[]) {
  const aliasLookup = buildAliasLookup(records);

  return records
    .map((record) => {
      if (!record.parentWorkflowId) {
        return null;
      }

      return aliasLookup.get(record.parentWorkflowId) ?? null;
    })
    .filter((value): value is string => Boolean(value));
}

function resolveParentMap(records: WorkflowRecord[]) {
  const aliasLookup = buildAliasLookup(records);
  const parentById = new Map<string, string | null>();

  for (const record of records) {
    const resolvedParentId = record.parentWorkflowId
      ? aliasLookup.get(record.parentWorkflowId) ?? null
      : null;

    if (resolvedParentId === record.workflowId) {
      parentById.set(record.workflowId, null);
      continue;
    }

    parentById.set(record.workflowId, resolvedParentId);
  }

  return {
    aliasLookup,
    parentById,
  };
}

function makeAncestorsResolver(parentById: Map<string, string | null>) {
  const cache = new Map<string, string[]>();

  function getAncestors(workflowId: string): string[] {
    const cached = cache.get(workflowId);
    if (cached) {
      return cached;
    }

    const ancestors: string[] = [];
    const seen = new Set<string>();
    let current = parentById.get(workflowId) ?? null;

    while (current && !seen.has(current)) {
      seen.add(current);
      ancestors.unshift(current);
      current = parentById.get(current) ?? null;
    }

    cache.set(workflowId, ancestors);
    return ancestors;
  }

  return getAncestors;
}

function createVisibleNodeResolver(
  parentIds: Set<string>,
  openIds: ReadonlySet<string>,
  getAncestors: (workflowId: string) => string[],
) {
  const cache = new Map<string, string>();

  return (workflowId: string) => {
    const cached = cache.get(workflowId);
    if (cached) {
      return cached;
    }

    for (const ancestorId of getAncestors(workflowId)) {
      if (parentIds.has(ancestorId) && !openIds.has(ancestorId)) {
        cache.set(workflowId, ancestorId);
        return ancestorId;
      }
    }

    cache.set(workflowId, workflowId);
    return workflowId;
  };
}

function emptyLayout(): LayoutResult {
  return {
    width: 0,
    height: 0,
    positions: new Map<string, XYPosition>(),
  };
}

function layoutColumns(
  columns: string[][],
  sizes: Map<string, LayoutEntry>,
): LayoutResult {
  if (columns.length === 0) {
    return emptyLayout();
  }

  const columnHeights = columns.map((column) => {
    return column.reduce((total, workflowId, index) => {
      const layout = sizes.get(workflowId);
      if (!layout) {
        return total;
      }

      return total + layout.height + (index === 0 ? 0 : ROW_GAP);
    }, 0);
  });

  const totalHeight = Math.max(...columnHeights, 0);
  const positions = new Map<string, XYPosition>();

  let offsetX = 0;
  columns.forEach((column, columnIndex) => {
    const columnWidth = Math.max(
      ...column.map((workflowId) => sizes.get(workflowId)?.width ?? 0),
      0,
    );
    let offsetY = (totalHeight - columnHeights[columnIndex]) / 2;

    for (const workflowId of column) {
      positions.set(workflowId, { x: offsetX, y: offsetY });
      offsetY += (sizes.get(workflowId)?.height ?? 0) + ROW_GAP;
    }

    offsetX += columnWidth + COLUMN_GAP;
  });

  return {
    width: Math.max(0, offsetX - COLUMN_GAP),
    height: totalHeight,
    positions,
  };
}

function layoutGrid(ids: string[], sizes: Map<string, LayoutEntry>) {
  if (ids.length === 0) {
    return emptyLayout();
  }

  const columnCount =
    ids.length <= 2 ? ids.length : ids.length <= 6 ? 2 : ids.length <= 12 ? 3 : 4;
  const columns = Array.from({ length: columnCount }, () => [] as string[]);

  ids.forEach((workflowId, index) => {
    columns[index % columnCount].push(workflowId);
  });

  return layoutColumns(columns, sizes);
}

function layoutByDepth(
  ids: string[],
  edges: Array<Pick<VisibleEdge, "source" | "target">>,
  sizes: Map<string, LayoutEntry>,
) {
  if (ids.length === 0) {
    return emptyLayout();
  }

  const idSet = new Set(ids);
  const order = new Map(ids.map((workflowId, index) => [workflowId, index]));
  const indegree = new Map(ids.map((workflowId) => [workflowId, 0]));
  const adjacency = new Map(ids.map((workflowId) => [workflowId, [] as string[]]));

  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) {
      continue;
    }

    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = ids
    .filter((workflowId) => (indegree.get(workflowId) ?? 0) === 0)
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  const depth = new Map<string, number>();

  for (const workflowId of queue) {
    depth.set(workflowId, 0);
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentDepth = depth.get(currentId) ?? 0;
    const nextIds = adjacency.get(currentId) ?? [];

    for (const nextId of nextIds) {
      depth.set(nextId, Math.max(depth.get(nextId) ?? 0, currentDepth + 1));
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);

      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  ids.forEach((workflowId) => {
    if (!depth.has(workflowId)) {
      depth.set(workflowId, 0);
    }
  });

  const depthGroups = new Map<number, string[]>();

  ids.forEach((workflowId) => {
    const layer = depth.get(workflowId) ?? 0;
    const group = depthGroups.get(layer);

    if (group) {
      group.push(workflowId);
      return;
    }

    depthGroups.set(layer, [workflowId]);
  });

  const columns = [...depthGroups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, columnIds]) =>
      columnIds.sort(
        (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
      ),
    );

  return layoutColumns(columns, sizes);
}

function combineLayouts(connected: LayoutResult, isolated: LayoutResult) {
  if (connected.width === 0 && isolated.width === 0) {
    return emptyLayout();
  }

  if (connected.width === 0) {
    return isolated;
  }

  if (isolated.width === 0) {
    return connected;
  }

  const positions = new Map<string, XYPosition>(connected.positions);
  const isolatedOffsetY = connected.height + SECTION_GAP;

  isolated.positions.forEach((position, workflowId) => {
    positions.set(workflowId, {
      x: position.x,
      y: position.y + isolatedOffsetY,
    });
  });

  return {
    width: Math.max(connected.width, isolated.width),
    height: isolatedOffsetY + isolated.height,
    positions,
  };
}

export function getExpandableWorkflowIds(records: WorkflowRecord[]) {
  return [...new Set(getNormalizedParentIds(records))];
}

export function buildWorkflowFlow(
  records: WorkflowRecord[],
  openIds: ReadonlySet<string>,
  onToggle: (workflowId: string) => void,
  positionOverrides?: WorkflowPositionOverrides,
  onSelectAddFlowTarget?: (workflowId: string) => void,
): WorkflowGraphResult {
  const sortedRecords = [...records].sort((left, right) => left.id - right.id);
  const byId = new Map(sortedRecords.map((record) => [record.workflowId, record]));
  const { aliasLookup, parentById } = resolveParentMap(sortedRecords);
  const childrenByParent = makeChildrenMap(sortedRecords, parentById);
  const parentIds = new Set(
    [...childrenByParent.keys()].filter((parentId) => parentId !== ROOT_ID),
  );
  const getAncestors = makeAncestorsResolver(parentById);
  const resolveVisibleNodeId = createVisibleNodeResolver(
    parentIds,
    openIds,
    getAncestors,
  );
  const visibleIds = new Set<string>();

  function getChildren(parentId: string | null) {
    return childrenByParent.get(parentId ?? ROOT_ID) ?? [];
  }

  function collectVisibleNodes(parentId: string | null) {
    for (const record of getChildren(parentId)) {
      visibleIds.add(record.workflowId);

      if (parentIds.has(record.workflowId) && openIds.has(record.workflowId)) {
        collectVisibleNodes(record.workflowId);
      }
    }
  }

  collectVisibleNodes(null);

  function getTopLevelAncestorId(workflowId: string) {
    let currentId = workflowId;
    const seen = new Set<string>();

    while (!seen.has(currentId)) {
      seen.add(currentId);
      const parentId = parentById.get(currentId) ?? null;

      if (!parentId) {
        return currentId;
      }

      currentId = parentId;
    }

    return workflowId;
  }

  const missingTargets: string[] = [];
  const visibleEdgeMap = new Map<string, VisibleEdge>();

  function registerTransitions(
    record: WorkflowRecord,
    rawTargetIds: string[] | undefined,
    relationKind: WorkflowRelationKind,
  ) {
    for (const [transitionIndex, rawTargetId] of (rawTargetIds ?? []).entries()) {
      const resolvedTargetId = aliasLookup.get(rawTargetId) ?? rawTargetId;
      const target = byId.get(resolvedTargetId);

      if (!target) {
        missingTargets.push(`${relationKind}:${record.workflowId}:${rawTargetId}`);
        continue;
      }

      const visibleSourceId = resolveVisibleNodeId(record.workflowId);
      const visibleTargetId = resolveVisibleNodeId(target.workflowId);

      if (
        visibleSourceId === visibleTargetId ||
        !visibleIds.has(visibleSourceId) ||
        !visibleIds.has(visibleTargetId)
      ) {
        continue;
      }

      const edgeKey = `${relationKind}:${visibleSourceId}->${visibleTargetId}`;
      const visibilityMode: WorkflowTransitionVisibilityMode =
        visibleSourceId === record.workflowId &&
        visibleTargetId === target.workflowId
          ? "direct"
          : "collapsed";
      const edgeKeyWithMode = `${edgeKey}:${visibilityMode}`;
      const existingEdge = visibleEdgeMap.get(edgeKeyWithMode);
      const transition: WorkflowTransition = {
        relationKind,
        visibilityMode,
        sourceRecordId: record.id,
        sourceWorkflowId: record.workflowId,
        rawTargetId,
        resolvedTargetWorkflowId: target.workflowId,
        transitionIndex,
        isDirect: visibilityMode === "direct",
      };

      if (existingEdge) {
        existingEdge.pathCount += 1;
        existingEdge.transitions.push(transition);
        continue;
      }

      visibleEdgeMap.set(edgeKeyWithMode, {
        id: edgeKeyWithMode,
        source: visibleSourceId,
        target: visibleTargetId,
        pathCount: 1,
        transitions: [transition],
      });
    }
  }

  for (const record of sortedRecords) {
    registerTransitions(record, record.nextWorkflowIds ?? [], "nextWorkflow");
    registerTransitions(record, record.nextSequentialIds ?? [], "nextSequential");
  }

  function getTopLevelAncestor(workflowId: string) {
    return getTopLevelAncestorId(workflowId);
  }

  function getDirectChildUnderParent(workflowId: string, parentId: string) {
    let currentId = workflowId;
    const seen = new Set<string>();

    while (!seen.has(currentId)) {
      seen.add(currentId);
      const currentParentId = parentById.get(currentId) ?? null;

      if (currentParentId === parentId) {
        return currentId;
      }

      if (!currentParentId) {
        return null;
      }

      currentId = currentParentId;
    }

    return null;
  }

  function buildSiblingEdges(siblingIds: string[], parentId: string | null) {
    const siblingSet = new Set(siblingIds);
    const siblingEdgeMap = new Map<string, Pick<VisibleEdge, "source" | "target">>();

    for (const edge of visibleEdgeMap.values()) {
      const sourceId =
        parentId === null
          ? getTopLevelAncestor(edge.source)
          : getDirectChildUnderParent(edge.source, parentId);
      const targetId =
        parentId === null
          ? getTopLevelAncestor(edge.target)
          : getDirectChildUnderParent(edge.target, parentId);

      if (
        !sourceId ||
        !targetId ||
        sourceId === targetId ||
        !siblingSet.has(sourceId) ||
        !siblingSet.has(targetId)
      ) {
        continue;
      }

      const siblingEdgeKey = `${sourceId}->${targetId}`;
      if (!siblingEdgeMap.has(siblingEdgeKey)) {
        siblingEdgeMap.set(siblingEdgeKey, {
          source: sourceId,
          target: targetId,
        });
      }
    }

    return [...siblingEdgeMap.values()];
  }

  function layoutCollection(
    ids: string[],
    edges: Array<Pick<VisibleEdge, "source" | "target">>,
    sizes: Map<string, LayoutEntry>,
  ) {
    const connectedIds = new Set<string>();

    for (const edge of edges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }

    const connected = ids.filter((workflowId) => connectedIds.has(workflowId));
    const isolated = ids.filter((workflowId) => !connectedIds.has(workflowId));

    return combineLayouts(
      layoutByDepth(connected, edges, sizes),
      layoutGrid(isolated, sizes),
    );
  }

  const layoutCache = new Map<string, LayoutEntry>();

  function getNodeLayout(workflowId: string): LayoutEntry {
    const cached = layoutCache.get(workflowId);
    if (cached) {
      return cached;
    }

    const directChildren = openIds.has(workflowId) ? getChildren(workflowId) : [];

    if (directChildren.length === 0) {
      const layout = {
        width: parentIds.has(workflowId) ? COLLAPSED_PARENT_WIDTH : LEAF_WIDTH,
        height: parentIds.has(workflowId) ? COLLAPSED_PARENT_HEIGHT : LEAF_HEIGHT,
        childPositions: new Map<string, XYPosition>(),
      };
      layoutCache.set(workflowId, layout);
      return layout;
    }

    const childSizes = new Map<string, LayoutEntry>();
    directChildren.forEach((child) => {
      childSizes.set(child.workflowId, getNodeLayout(child.workflowId));
    });

    const childrenLayout = layoutCollection(
      directChildren.map((child) => child.workflowId),
      buildSiblingEdges(
        directChildren.map((child) => child.workflowId),
        workflowId,
      ),
      childSizes,
    );

    const childPositions = new Map<string, XYPosition>();
    childrenLayout.positions.forEach((position, childId) => {
      childPositions.set(childId, {
        x: position.x + GROUP_PADDING_X,
        y: position.y + EXPANDED_HEADER_HEIGHT + GROUP_PADDING_Y,
      });
    });

    const layout = {
      width: Math.max(
        EXPANDED_MIN_WIDTH,
        childrenLayout.width + GROUP_PADDING_X * 2,
      ),
      height:
        EXPANDED_HEADER_HEIGHT +
        Math.max(childrenLayout.height, LEAF_HEIGHT - 24) +
        GROUP_PADDING_Y * 2,
      childPositions,
    };

    layoutCache.set(workflowId, layout);
    return layout;
  }

  const rootRecords = getChildren(null);
  const rootSizes = new Map<string, LayoutEntry>();

  rootRecords.forEach((record) => {
    rootSizes.set(record.workflowId, getNodeLayout(record.workflowId));
  });

  const rootLayout = layoutCollection(
    rootRecords.map((record) => record.workflowId),
    buildSiblingEdges(
      rootRecords.map((record) => record.workflowId),
      null,
    ),
    rootSizes,
  );

  const nodes: WorkflowNode[] = [];

  function appendVisibleNode(
    workflowId: string,
    position: XYPosition,
    parentId?: string,
    parentAbsolutePosition?: XYPosition,
  ) {
    const record = byId.get(workflowId);
    if (!record) {
      return;
    }

    const layout = getNodeLayout(workflowId);
    const hasChildren = parentIds.has(workflowId);
    const effectivePosition = positionOverrides?.get(workflowId) ?? position;
    const absolutePosition =
      parentId && parentAbsolutePosition
        ? {
            x: parentAbsolutePosition.x + effectivePosition.x,
            y: parentAbsolutePosition.y + effectivePosition.y,
          }
        : effectivePosition;

    nodes.push({
      id: workflowId,
      type: "workflow",
      position: effectivePosition,
      parentId,
      extent: parentId ? "parent" : undefined,
      draggable: true,
      selectable: true,
      deletable: false,
      connectable: false,
      style: {
        width: layout.width,
        height: layout.height,
      },
      data: {
        recordId: record.id,
        workflowId,
        moduleName: record.moduleName,
        processName: record.processName,
        childCount: getChildren(workflowId).length,
        nextCount:
          (record.nextWorkflowIds ?? []).length +
          (record.nextSequentialIds ?? []).length,
        canCreateNextWorkflow: (record.nextWorkflowIds ?? []).length === 0,
        hasChildren,
        expanded: hasChildren && openIds.has(workflowId),
        needBucket: record.needBucket,
        updateStatusParent: record.updateStatusParent,
        onToggle,
        onSelectAddFlowTarget,
      },
    });

    if (hasChildren && openIds.has(workflowId)) {
      const directChildren = getChildren(workflowId);

      for (const child of directChildren) {
        const childPosition = layout.childPositions.get(child.workflowId);
        if (!childPosition) {
          continue;
        }

        appendVisibleNode(
          child.workflowId,
          childPosition,
          workflowId,
          absolutePosition,
        );
      }
    }
  }

  rootRecords.forEach((record) => {
    const rootPosition = rootLayout.positions.get(record.workflowId);
    if (!rootPosition) {
      return;
    }

    appendVisibleNode(record.workflowId, rootPosition);
  });

  const edges: WorkflowFlowEdge[] = [...visibleEdgeMap.values()].map((edge) => {
    const relationKind = edge.transitions[0]?.relationKind ?? "nextWorkflow";
    const visibilityMode = edge.transitions[0]?.visibilityMode ?? "direct";
    const editable = edge.transitions.length === 1;
    const reconnectable =
      relationKind === "nextWorkflow" && edge.transitions.length === 1;
    const edgeStyle = getEdgeStyleConfig(
      relationKind,
      visibilityMode,
      edge.pathCount,
    );
    const editHint =
      edge.transitions.length > 1
        ? "Edge ini mewakili beberapa jalur. Buka parent terkait untuk mengedit satu relasi."
        : editable
          ? null
          : "Buka parent terkait terlebih dahulu agar edge merepresentasikan satu relasi langsung.";
    const edgeLabel =
      relationKind === "nextWorkflow" && edge.pathCount > 1
        ? `${edge.pathCount} jalur`
        : undefined;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edgeStyle.edgeType,
      animated: edge.pathCount > 1,
      reconnectable: reconnectable ? "target" : false,
      deletable: editable,
      zIndex: edgeStyle.zIndex,
      pathOptions: edgeStyle.pathOptions,
      data: {
        relationKind,
        visibilityMode,
        editable,
        reconnectable,
        editHint,
        transitionCount: edge.transitions.length,
        transitions: edge.transitions,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: edgeStyle.markerWidth,
        height: edgeStyle.markerHeight,
        color: edgeStyle.color,
      },
      style: {
        stroke: edgeStyle.color,
        strokeWidth: edgeStyle.strokeWidth,
        strokeDasharray: edgeStyle.strokeDasharray,
        opacity: edgeStyle.opacity,
      },
      label: edgeLabel,
      labelStyle: {
        fontSize: 12,
        fontWeight: 700,
        fill: "#162033",
      },
      labelBgStyle: {
        fill: "#fff8ee",
        fillOpacity: 0.92,
      },
    };
  });

  return {
    nodes,
    edges,
    stats: {
      totalRows: records.length,
      visibleNodes: nodes.length,
      visibleEdges: edges.length,
      expandableNodes: parentIds.size,
      unresolvedLinks: missingTargets.length,
    },
  };
}

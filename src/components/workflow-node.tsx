"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { WorkflowNodeData } from "@/lib/workflow-graph";

type WorkflowFlowNode = Node<WorkflowNodeData>;

function MailIcon() {
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

function UserIcon() {
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

export function WorkflowNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const isParent = data.hasChildren;
  const hasIndicators = data.needBucket || data.updateStatusParent;
  const traceClass = data.traceHighlighted
    ? "ring-2 ring-cyan-700/45 shadow-[0_0_0_1px_rgba(14,116,144,0.28),0_20px_45px_rgba(14,116,144,0.26)]"
    : data.traceMuted
      ? "opacity-75"
      : "";
  const addFlowClass = data.addFlowSource
    ? "ring-2 ring-teal-700/55 shadow-[0_0_0_1px_rgba(15,118,110,0.24),0_18px_45px_rgba(15,118,110,0.18)]"
    : data.addFlowTargetMode
      ? "ring-1 ring-teal-700/18"
      : "";
  const surfaceClass = isParent
    ? [
        "border-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]",
        data.expanded ? "border-teal-700/38" : "border-amber-700/38",
        "bg-[radial-gradient(circle_at_top_left,rgba(255,244,210,0.95),rgba(255,249,238,0.94)_40%,rgba(233,251,247,0.94))]",
      ].join(" ")
    : "border border-slate-950/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(245,247,250,0.95))]";

  return (
    <div className="group relative h-full w-full">
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        isConnectableEnd
        className="!h-3 !w-3 !border-2 !border-white !bg-[#c2410c]"
      />

      <div
        className={[
          "relative flex h-full w-full flex-col overflow-hidden rounded-[8px] shadow-[0_20px_50px_rgba(22,32,51,0.12)] transition-all duration-200",
          surfaceClass,
          traceClass,
          addFlowClass,
          selected ? "ring-2 ring-slate-950/15" : "",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={(event) => {
            if (data.addFlowTargetMode) {
              event.preventDefault();
              event.stopPropagation();
              data.onSelectAddFlowTarget?.(data.workflowId);
              return;
            }

            if (data.hasChildren) {
              data.onToggle(data.workflowId);
            }
          }}
          className={[
            "flex h-full w-full flex-col px-5 pb-5 pt-5 text-left",
            data.addFlowTargetMode
              ? "cursor-crosshair"
              : data.hasChildren
                ? "cursor-pointer"
                : "cursor-default",
          ].join(" ")}
        >
          {hasIndicators ? (
            <div className="mb-2 flex justify-end gap-2">
              {data.needBucket ? (
                <span
                  title="Need bucket"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-teal-700/16 bg-teal-700/10 text-teal-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                >
                  <MailIcon />
                </span>
              ) : null}
              {data.updateStatusParent ? (
                <span
                  title="Update status parent"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-amber-700/16 bg-amber-700/10 text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                >
                  <UserIcon />
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              {data.moduleName}
            </p>
            <h3 className="break-words text-[1.10rem] leading-[1.2] font-semibold text-slate-950">
              {data.processName}
            </h3>
          </div>
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectableStart={data.canCreateNextWorkflow}
        isConnectableEnd={false}
        className="!h-3 !w-3 !border-2 !border-white !bg-[#0f766e]"
      />
    </div>
  );
}

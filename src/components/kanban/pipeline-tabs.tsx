"use client";

import { useDroppable } from "@dnd-kit/core";
import { TabLink, TabNav } from "@/components/ui/tabs";
import { pipelineTabId } from "./move";
import type { PipelineOption } from "./types";

export interface PipelineSwitcherData {
  boardId: string;
  pipelineId: string;
  pipelines: PipelineOption[];
}

function TabLabel({ pipeline }: { pipeline: PipelineOption }) {
  const count = `${pipeline.taskCount} ${pipeline.taskCount === 1 ? "task" : "tasks"}`;
  return (
    <>
      {pipeline.name}
      <span className="sr-only">, {count}</span>
      <span aria-hidden="true" className="inline-flex min-w-6 justify-center rounded-pill bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{pipeline.taskCount}</span>
    </>
  );
}

/** The DOM id of a pipeline's tab link, so the board can put focus on it. */
export const tabElementId = (pipelineId: string) => `pipeline-tab-${pipelineId}`;

const hrefOf = (boardId: string, pipelineId: string) => `/boards/${boardId}/pipelines/${pipelineId}`;

/** Must render inside a DndContext: dropping a card on another pipeline's tab moves it there. */
function DroppableTab({ boardId, pipeline, dragging }: { boardId: string; pipeline: PipelineOption; dragging: boolean }) {
  // A pipeline without stages has nowhere to put the card, so it is not a drop target.
  const { setNodeRef, isOver } = useDroppable({ id: pipelineTabId(pipeline.id), disabled: pipeline.stages.length === 0 });
  return (
    <TabLink ref={setNodeRef} id={tabElementId(pipeline.id)} href={hrefOf(boardId, pipeline.id)} highlighted={dragging && isOver}>
      <TabLabel pipeline={pipeline} />
    </TabLink>
  );
}

/** Links to every pipeline of the board with their task counts; with `droppable`, writers can drop cards on the other tabs. */
export function PipelineTabs({ data, droppable, dragging = false }: { data: PipelineSwitcherData; droppable: boolean; dragging?: boolean }) {
  return (
    <TabNav label="Pipelines">
      {data.pipelines.map((pipeline) =>
        pipeline.id === data.pipelineId ? (
          <TabLink key={pipeline.id} id={tabElementId(pipeline.id)} href={hrefOf(data.boardId, pipeline.id)} current>
            <TabLabel pipeline={pipeline} />
          </TabLink>
        ) : droppable ? (
          <DroppableTab key={pipeline.id} boardId={data.boardId} pipeline={pipeline} dragging={dragging} />
        ) : (
          <TabLink key={pipeline.id} id={tabElementId(pipeline.id)} href={hrefOf(data.boardId, pipeline.id)}>
            <TabLabel pipeline={pipeline} />
          </TabLink>
        ),
      )}
    </TabNav>
  );
}

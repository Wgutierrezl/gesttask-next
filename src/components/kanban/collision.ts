import { closestCorners, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import { PIPELINE_PREFIX } from "./move";

const isTab = (id: string | number) => String(id).startsWith(PIPELINE_PREFIX);

/**
 * A pipeline tab only counts when the pointer is really inside it; everything else (columns, cards) uses the closest corners.
 * Tabs are kept out of the second step, so a card dropped near the top of a column can never land on the tab strip above it.
 * Keyboard drags have no pointer, so they never reach a tab: the Move menu is their way across pipelines.
 */
export const collideBoard: CollisionDetection = (args) => {
  const onTab = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter(({ id }) => isTab(id)) });
  if (onTab.length > 0) return onTab;
  return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter(({ id }) => !isTab(id)) });
};

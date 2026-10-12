import { PointerSensor, type PointerSensorOptions } from "@dnd-kit/core";
import type { PointerEvent } from "react";

/**
 * dnd-kit's pointer sensor for mouse and pen only. A finger also fires pointer events, and letting this sensor take them as
 * well as the touch sensor would grab a card the moment a swipe starts instead of after the hold that tells a drag from a scroll.
 */
export class MousePointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: PointerEvent, { onActivation }: PointerSensorOptions) => {
        if (nativeEvent.pointerType === "touch" || !nativeEvent.isPrimary || nativeEvent.button !== 0) return false;
        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

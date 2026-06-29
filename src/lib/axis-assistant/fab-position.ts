export type FabEdge = "right" | "left" | "bottom" | "top";

export type FabPlacement = {
  x: number;
  y: number;
  edge: FabEdge | null;
};

export const FAB_DRAG_THRESHOLD_PX = 8;
export const EDGE_SNAP_THRESHOLD_PX = 52;
export const FAB_DIAMETER_PX = 56;

export type ViewportInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function defaultFabPlacement(
  viewportWidth: number,
  viewportHeight: number,
  insets: ViewportInsets,
  nativeBottomOffset = 0,
): FabPlacement {
  const x = viewportWidth - insets.right - 20 - FAB_DIAMETER_PX / 2;
  const y = viewportHeight - insets.bottom - nativeBottomOffset - 20 - FAB_DIAMETER_PX / 2;
  return { x, y, edge: "right" };
}

export function clampFabCenter(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  insets: ViewportInsets,
  nativeBottomOffset = 0,
): { x: number; y: number } {
  const half = FAB_DIAMETER_PX / 2;
  const minX = insets.left + half;
  const maxX = viewportWidth - insets.right - half;
  const minY = insets.top + half;
  const maxY = viewportHeight - insets.bottom - nativeBottomOffset - half;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

export function detectNearestEdge(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  insets: ViewportInsets,
  nativeBottomOffset = 0,
): FabEdge | null {
  const distRight = viewportWidth - insets.right - x;
  const distLeft = x - insets.left;
  const distBottom = viewportHeight - insets.bottom - nativeBottomOffset - y;
  const distTop = y - insets.top;
  const min = Math.min(distRight, distLeft, distBottom, distTop);
  if (min > EDGE_SNAP_THRESHOLD_PX) return null;
  if (min === distRight) return "right";
  if (min === distLeft) return "left";
  if (min === distBottom) return "bottom";
  return "top";
}

export function snapFabToEdge(
  edge: FabEdge,
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  insets: ViewportInsets,
  nativeBottomOffset = 0,
): FabPlacement {
  const clamped = clampFabCenter(x, y, viewportWidth, viewportHeight, insets, nativeBottomOffset);
  const edgePad = 20;
  const half = FAB_DIAMETER_PX / 2;

  switch (edge) {
    case "right":
      return {
        x: viewportWidth - insets.right - edgePad - half,
        y: clamped.y,
        edge,
      };
    case "left":
      return {
        x: insets.left + edgePad + half,
        y: clamped.y,
        edge,
      };
    case "bottom":
      return {
        x: clamped.x,
        y: viewportHeight - insets.bottom - nativeBottomOffset - edgePad - half,
        edge,
      };
    case "top":
      return {
        x: clamped.x,
        y: insets.top + edgePad + half,
        edge,
      };
  }
}

export function resolveFabPlacementAfterDrag(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  insets: ViewportInsets,
  nativeBottomOffset = 0,
): FabPlacement {
  const clamped = clampFabCenter(x, y, viewportWidth, viewportHeight, insets, nativeBottomOffset);
  const edge = detectNearestEdge(
    clamped.x,
    clamped.y,
    viewportWidth,
    viewportHeight,
    insets,
    nativeBottomOffset,
  );
  if (!edge) return { ...clamped, edge: null };
  return snapFabToEdge(edge, clamped.x, clamped.y, viewportWidth, viewportHeight, insets, nativeBottomOffset);
}

/** Swipe delta that tucks (positive = toward edge) or expands (negative = away). */
export function swipeTucksOnEdge(edge: FabEdge, deltaX: number, deltaY: number): boolean | null {
  switch (edge) {
    case "right":
      if (deltaX > 36) return true;
      if (deltaX < -24) return false;
      return null;
    case "left":
      if (deltaX < -36) return true;
      if (deltaX > 24) return false;
      return null;
    case "bottom":
      if (deltaY > 36) return true;
      if (deltaY < -24) return false;
      return null;
    case "top":
      if (deltaY < -36) return true;
      if (deltaY > 24) return false;
      return null;
  }
}

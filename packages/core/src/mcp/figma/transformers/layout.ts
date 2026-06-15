import { isInAutoLayoutFlow, isFrame, isLayout, isRectangle } from "../utils/identity.js";
import type {
  Node as FigmaDocumentNode,
  HasFramePropertiesTrait,
  HasLayoutTrait,
} from "@figma/rest-api-spec";
import { generateCSSShorthand, pixelRound } from "../utils/common.js";

export interface NormalizedLayout {
  display?: "flex";
  flexDirection?: "row" | "column";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline" | "stretch";
  alignItems?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline" | "stretch";
  alignSelf?: "flex-start" | "flex-end" | "center" | "stretch";
  flexWrap?: "wrap";
  gap?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
  padding?: string;
  sizing?: {
    horizontal?: "fixed" | "fill" | "hug";
    vertical?: "fixed" | "fill" | "hug";
  };
  overflowScroll?: ("x" | "y")[];
  /** CSS overflow from clipsContent + overflowDirection */
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  position?: "absolute";
}

type LayoutMode = "none" | "row" | "column";

/**
 * Extract overflow styles from Figma clipsContent and overflow settings.
 * Maps clipsContent + overflowDirection + layout to CSS overflow properties.
 */
export function extractClipsContent(
  clipsContent?: boolean,
  overflowDirection?: string,
  layoutMode?: string,
  layoutSizingHorizontal?: string,
  layoutSizingVertical?: string,
): Record<string, string> {
  const styles: Record<string, string> = {};

  if (clipsContent !== true) {
    return styles;
  }

  // Has scroll setting - use scroll overflow
  const hasScroll =
    overflowDirection &&
    overflowDirection !== "NONE" &&
    (overflowDirection.includes("HORIZONTAL") ||
      overflowDirection.includes("VERTICAL") ||
      overflowDirection === "BOTH" ||
      overflowDirection === "HORIZONTAL_SCROLLING" ||
      overflowDirection === "VERTICAL_SCROLLING" ||
      overflowDirection === "HORIZONTAL_AND_VERTICAL_SCROLLING");

  if (hasScroll) {
    if (
      overflowDirection === "HORIZONTAL" ||
      overflowDirection === "HORIZONTAL_SCROLLING"
    ) {
      styles.overflowX = "auto";
      styles.overflowY = "hidden";
    } else if (
      overflowDirection === "VERTICAL" ||
      overflowDirection === "VERTICAL_SCROLLING"
    ) {
      styles.overflowX = "hidden";
      styles.overflowY = "auto";
    } else if (
      overflowDirection === "BOTH" ||
      overflowDirection === "HORIZONTAL_AND_VERTICAL_SCROLLING"
    ) {
      styles.overflow = "auto";
    } else {
      styles.overflow = "hidden";
    }
  } else {
    // No scroll - determine overflow from layout and sizing
    if (
      layoutSizingHorizontal === "FILL" &&
      layoutSizingVertical === "FILL"
    ) {
      return styles;
    }

    if (layoutMode === "HORIZONTAL") {
      if (layoutSizingVertical !== "FILL") {
        styles.overflowY = "hidden";
      }
    } else if (layoutMode === "VERTICAL") {
      if (layoutSizingHorizontal !== "FILL") {
        styles.overflowX = "hidden";
      }
    } else {
      if (
        layoutSizingHorizontal !== "FILL" &&
        layoutSizingVertical !== "FILL"
      ) {
        styles.overflow = "hidden";
      }
    }
  }

  return styles;
}

function computeMode(n: FigmaDocumentNode): LayoutMode {
  if (!isFrame(n)) return "none";
  if (!n.layoutMode || n.layoutMode === "NONE") return "none";
  return n.layoutMode === "HORIZONTAL" ? "row" : "column";
}

// Convert Figma's layout config into a more typical flex-like schema
export function buildNormalizedLayout(
  n: FigmaDocumentNode,
  parent?: FigmaDocumentNode,
): NormalizedLayout {
  const mode = computeMode(n);
  const frameValues = buildNormalizedFrameValues(n, mode);
  const layoutValues = buildNormalizedLayoutValues(n, parent, mode) || {};

  return { ...frameValues, ...layoutValues };
}

// For flex layouts, process alignment and sizing
function convertAlign(
  axisAlign?:
    | HasFramePropertiesTrait["primaryAxisAlignItems"]
    | HasFramePropertiesTrait["counterAxisAlignItems"],
  stretch?: {
    children: FigmaDocumentNode[];
    axis: "primary" | "counter";
    mode: LayoutMode;
  },
) {
  if (stretch && stretch.mode !== "none") {
    const { children, mode, axis } = stretch;

    // Compute whether to check horizontally or vertically based on axis and direction
    const direction = getDirection(axis, mode);

    const shouldStretch =
      children.length > 0 &&
      children.reduce((shouldStretch, c) => {
        if (!shouldStretch) return false;
        if ("layoutPositioning" in c && c.layoutPositioning === "ABSOLUTE") return true;
        if (direction === "horizontal") {
          return "layoutSizingHorizontal" in c && c.layoutSizingHorizontal === "FILL";
        } else if (direction === "vertical") {
          return "layoutSizingVertical" in c && c.layoutSizingVertical === "FILL";
        }
        return false;
      }, true);

    if (shouldStretch) return "stretch";
  }

  switch (axisAlign) {
    case "MIN":
      // MIN, AKA flex-start, is the default alignment
      return undefined;
    case "MAX":
      return "flex-end";
    case "CENTER":
      return "center";
    case "SPACE_BETWEEN":
      return "space-between";
    case "BASELINE":
      return "baseline";
    default:
      return undefined;
  }
}

function convertSelfAlign(align?: HasLayoutTrait["layoutAlign"]) {
  switch (align) {
    case "MIN":
      // MIN, AKA flex-start, is the default alignment
      return undefined;
    case "MAX":
      return "flex-end";
    case "CENTER":
      return "center";
    case "STRETCH":
      return "stretch";
    default:
      return undefined;
  }
}

// interpret sizing
function convertSizing(
  s?: HasLayoutTrait["layoutSizingHorizontal"] | HasLayoutTrait["layoutSizingVertical"],
) {
  if (s === "FIXED") return "fixed";
  if (s === "FILL") return "fill";
  if (s === "HUG") return "hug";
  return undefined;
}

function getDirection(
  axis: "primary" | "counter",
  mode: "row" | "column",
): "horizontal" | "vertical" {
  if (axis === "primary") {
    return mode === "row" ? "horizontal" : "vertical";
  }
  return mode === "row" ? "vertical" : "horizontal";
}

function buildNormalizedFrameValues(n: FigmaDocumentNode, mode: LayoutMode): NormalizedLayout {
  if (!isFrame(n)) {
    return {};
  }

  const frameValues: NormalizedLayout = {};

  const overflowScroll: NormalizedLayout["overflowScroll"] = [];
  if (n.overflowDirection?.includes("HORIZONTAL")) overflowScroll.push("x");
  if (n.overflowDirection?.includes("VERTICAL")) overflowScroll.push("y");
  if (overflowScroll.length > 0) frameValues.overflowScroll = overflowScroll;

  // Extract overflow styles from clipsContent
  if ("clipsContent" in n) {
    const overflowStyles = extractClipsContent(
      n.clipsContent,
      n.overflowDirection,
      n.layoutMode,
      n.layoutSizingHorizontal,
      n.layoutSizingVertical,
    );
    Object.assign(frameValues, overflowStyles);
  }

  if (mode === "none") {
    return frameValues;
  }

  frameValues.display = "flex";
  frameValues.flexDirection = mode;

  frameValues.justifyContent = convertAlign(n.primaryAxisAlignItems ?? "MIN", {
    children: n.children,
    axis: "primary",
    mode,
  });
  frameValues.alignItems = convertAlign(n.counterAxisAlignItems ?? "MIN", {
    children: n.children,
    axis: "counter",
    mode,
  });
  frameValues.alignSelf = convertSelfAlign(n.layoutAlign);

  frameValues.flexWrap = n.layoutWrap === "WRAP" ? "wrap" : undefined;
  frameValues.gap = n.itemSpacing ? `${n.itemSpacing ?? 0}px` : undefined;

  if (n.paddingTop || n.paddingBottom || n.paddingLeft || n.paddingRight) {
    frameValues.padding = generateCSSShorthand({
      top: n.paddingTop ?? 0,
      right: n.paddingRight ?? 0,
      bottom: n.paddingBottom ?? 0,
      left: n.paddingLeft ?? 0,
    });
  }

  return frameValues;
}

function buildNormalizedLayoutValues(
  n: FigmaDocumentNode,
  parent: FigmaDocumentNode | undefined,
  mode: LayoutMode,
): NormalizedLayout | undefined {
  if (!isLayout(n)) return undefined;

  const layoutValues: NormalizedLayout = {};

  const hSizing = convertSizing(n.layoutSizingHorizontal);
  const vSizing = convertSizing(n.layoutSizingVertical);
  if ((hSizing && hSizing !== "fixed") || (vSizing && vSizing !== "fixed")) {
    layoutValues.sizing = {
      horizontal: hSizing !== "fixed" ? hSizing : undefined,
      vertical: vSizing !== "fixed" ? vSizing : undefined,
    };
  }

  // Only include positioning-related properties if the node is absolutely positioned
  if (
    isFrame(parent) &&
    !isInAutoLayoutFlow(n, parent)
  ) {
    if (n.layoutPositioning === "ABSOLUTE") {
      layoutValues.position = "absolute";
    }
  }

  // Include dimensions for absolute-positioned nodes and fixed-size nodes
  const needsDimensions =
    layoutValues.position === "absolute" ||
    hSizing === "fixed" ||
    vSizing === "fixed";

  if (needsDimensions && isRectangle("absoluteBoundingBox", n)) {
    const w = hSizing === "fixed" || layoutValues.position === "absolute"
      ? pixelRound(n.absoluteBoundingBox.width)
      : undefined;
    const h = vSizing === "fixed" || layoutValues.position === "absolute"
      ? pixelRound(n.absoluteBoundingBox.height)
      : undefined;
    if (w !== undefined || h !== undefined) {
      layoutValues.dimensions = { width: w, height: h };
    }
  }

  return layoutValues;
}

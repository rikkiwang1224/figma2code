import type {
  ExtractorFn,
  GlobalVars,
  StyleTypes,
  TraversalContext,
  NormalizedNode,
  NormalizedTextSegment,
} from "./types.js";
import { buildNormalizedLayout } from "../transformers/layout.js";
import { buildNormalizedStrokes, parsePaint } from "../transformers/style.js";
import { buildNormalizedEffects } from "../transformers/effects.js";
import {
  extractNodeText,
  extractTextStyle,
  extractStyledTextSegments,
  extractListStyle,
  hasTextStyle,
  isTextNode,
} from "../transformers/text.js";
import { hasValue, isRectangleCornerRadii, isFrame } from "../utils/identity.js";
import { generateVarId, isVisible, getPlaceholderImage } from "../utils/common.js";
import type { NormalizedImageFill } from "../transformers/style.js";
import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";

type AfterChildrenFn = (
  node: FigmaDocumentNode,
  result: NormalizedNode,
  children: NormalizedNode[],
) => NormalizedNode[];

/**
 * Helper function to find or create a global variable.
 */
function findOrCreateVar(globalVars: GlobalVars, value: StyleTypes, prefix: string): string {
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) => JSON.stringify(existingValue) === JSON.stringify(value),
    ) ?? [];
  if (existingVarId) return existingVarId;
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  return varId;
}

/**
 * Find or create text style var, preferring a given key (e.g. styleName or composite key)
 * for association. Dedupes by value.
 */
function findOrCreateTextStyleVar(
  globalVars: GlobalVars,
  value: StyleTypes,
  preferredKey: string,
  fallbackPrefix: string,
): string {
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) => JSON.stringify(existingValue) === JSON.stringify(value),
    ) ?? [];
  if (existingVarId) return existingVarId;
  const key = preferredKey || generateVarId(fallbackPrefix);
  globalVars.styles[key] = value;
  return key;
}

/**
 * Extracts layout-related properties from a node.
 */
export const layoutExtractor: ExtractorFn = (node, result, context) => {
  const layout = buildNormalizedLayout(node, context.parent);
  if (Object.keys(layout).length > 0) {
    result.layout = findOrCreateVar(context.globalVars, layout, "layout");
  }
};

/**
 * Extracts text content and text styling from a node.
 */
export const textExtractor: ExtractorFn = (node, result, context) => {
  // Extract text content
  if (isTextNode(node)) {
    result.text = extractNodeText(node);

    const listStyle = extractListStyle(node);
    if (listStyle) {
      result.listStyle = listStyle;
    }

    // Extract per-character style segments (mixed colors, font overrides, etc.)
    const rawSegments = extractStyledTextSegments(node);
    if (rawSegments) {
      result.textSegments = rawSegments.map((seg) => {
        const segment: NormalizedTextSegment = { text: seg.text };

        if (seg.overrideFills?.length) {
          const visibleFills = seg.overrideFills.filter(isVisible);
          if (visibleFills.length) {
            // Prefer named Figma style via inheritFillStyleId
            if (seg.inheritFillStyleId) {
              const meta = context.globalVars.extraStyles?.[seg.inheritFillStyleId];
              if (meta?.name) {
                const parsed = visibleFills.map((f) => parsePaint(f, false));
                context.globalVars.styles[meta.name] = parsed;
                segment.fills = meta.name;
              }
            }
            // Fallback: register as anonymous fill variable
            if (!segment.fills) {
              const parsed = visibleFills.map((f) => parsePaint(f, false));
              segment.fills = findOrCreateVar(context.globalVars, parsed, "fill");
            }
          }
        }

        return segment;
      });
    }
  }

  // Extract text style (CSS truncation properties are pre-converted from Figma)
  if (hasTextStyle(node)) {
    const textStyle = extractTextStyle(node);
    if (textStyle) {
      const styleName = getStyleName(node, context, ["text", "typography"]);
      const hasTruncation = textStyle.overflow === "hidden";

      if (styleName) {
        // Named style: use composite key when node has truncation to avoid overwriting
        let effectiveKey = styleName;
        if (hasTruncation) {
          const clamp = textStyle.WebkitLineClamp;
          effectiveKey = clamp
            ? `${styleName}__CLAMP_${clamp}`
            : `${styleName}__ELLIPSIS`;
        }
        result.textStyle = findOrCreateTextStyleVar(
          context.globalVars,
          textStyle,
          effectiveKey,
          "style",
        );
      } else {
        result.textStyle = findOrCreateVar(context.globalVars, textStyle, "style");
      }
    }
  }
};

/**
 * Extracts visual appearance properties (fills, strokes, effects, opacity, border radius).
 */
export const visualsExtractor: ExtractorFn = (node, result, context) => {
  // Check if node has children to determine CSS properties
  const hasChildren =
    hasValue("children", node) && Array.isArray(node.children) && node.children.length > 0;

  // fills
  if (hasValue("fills", node) && Array.isArray(node.fills) && node.fills.length) {
    const fills = node.fills.filter(isVisible).map((fill) => parsePaint(fill, hasChildren)).reverse();

    // Enrich IMAGE fills with a placeholder URL derived from the node's bounding box
    if (hasValue("absoluteBoundingBox", node)) {
      const bbox = node.absoluteBoundingBox as { width: number; height: number };
      for (const fill of fills) {
        if (typeof fill === "object" && "type" in fill && fill.type === "IMAGE") {
          (fill as NormalizedImageFill).placeholderUrl = getPlaceholderImage(bbox.width, bbox.height);
        }
      }
    }

    if (fills.length) {
      const styleName = getStyleName(node, context, ["fill", "fills"]);
      if (styleName) {
        context.globalVars.styles[styleName] = fills;
        result.fills = styleName;
      } else {
        result.fills = findOrCreateVar(context.globalVars, fills, "fill");
      }
    }
  }

  // strokes
  const strokes = buildNormalizedStrokes(node, hasChildren);
  if (strokes.colors.length) {
    const styleName = getStyleName(node, context, ["stroke", "strokes"]);
    if (styleName) {
      context.globalVars.styles[styleName] = strokes.colors;
      result.borderColor = styleName;
      if (strokes.border) result.border = strokes.border;
      if (strokes.borderTop) result.borderTop = strokes.borderTop;
      if (strokes.borderRight) result.borderRight = strokes.borderRight;
      if (strokes.borderBottom) result.borderBottom = strokes.borderBottom;
      if (strokes.borderLeft) result.borderLeft = strokes.borderLeft;
      if (strokes.strokeDashes) result.strokeDashes = strokes.strokeDashes;
      if (strokes.strokeAlign) result.strokeAlign = strokes.strokeAlign;
    } else {
      result.borderColor = findOrCreateVar(context.globalVars, strokes, "stroke");
    }
  }

  // effects
  const effects = buildNormalizedEffects(node);
  if (Object.keys(effects).length) {
    const styleName = getStyleName(node, context, ["effect", "effects"]);
    if (styleName) {
      // Effects styles store only the effect values
      context.globalVars.styles[styleName] = effects;
      result.effects = styleName;
    } else {
      result.effects = findOrCreateVar(context.globalVars, effects, "effect");
    }
  }

  // opacity
  if (hasValue("opacity", node) && typeof node.opacity === "number" && node.opacity !== 1) {
    result.opacity = node.opacity;
  }

  // border radius
  if (hasValue("cornerRadius", node) && typeof node.cornerRadius === "number") {
    result.borderRadius = `${node.cornerRadius}px`;
  }
  if (hasValue("rectangleCornerRadii", node, isRectangleCornerRadii)) {
    result.borderRadius = `${node.rectangleCornerRadii[0]}px ${node.rectangleCornerRadii[1]}px ${node.rectangleCornerRadii[2]}px ${node.rectangleCornerRadii[3]}px`;
  }
};

/**
 * Extracts component-related properties from INSTANCE nodes.
 */
export const componentExtractor: ExtractorFn = (node, result, context) => {
  if (node.type === "INSTANCE") {
    if (hasValue("componentId", node)) {
      const comp = context.components?.[node.componentId];
      if (comp?.name) result.componentName = comp.name;
    }

    // Add specific properties for instances of components (omit BOOLEAN false to reduce noise)
    if (hasValue("componentProperties", node)) {
      result.componentProperties = Object.entries(node.componentProperties ?? {})
        .filter(([, { value, type }]) => !(type === "BOOLEAN" && value === false))
        .map(([name, { value, type }]) => ({
          name,
          value: value.toString(),
          type,
        }));
    }
  }
};

// Helper to fetch a Figma style name for specific style keys on a node
function getStyleName(
  node: FigmaDocumentNode,
  context: TraversalContext,
  keys: string[],
): string | undefined {
  if (!hasValue("styles", node)) return undefined;
  const styleMap = node.styles as Record<string, string>;
  for (const key of keys) {
    const styleId = styleMap[key];
    if (styleId) {
      const meta = context.globalVars.extraStyles?.[styleId];
      if (meta?.name) return meta.name;
    }
  }
  return undefined;
}

// -------------------- CONVENIENCE COMBINATIONS --------------------

/**
 * All extractors - replicates the current parseNode behavior.
 */
export const allExtractors = [layoutExtractor, textExtractor, visualsExtractor, componentExtractor];

/**
 * Layout and text only - useful for content analysis and layout planning.
 */
export const layoutAndText = [layoutExtractor, textExtractor];

/**
 * Text content only - useful for content audits and copy extraction.
 */
export const contentOnly = [textExtractor];

/**
 * Visuals only - useful for design system analysis and style extraction.
 */
export const visualsOnly = [visualsExtractor];

/**
 * Layout only - useful for structure analysis.
 */
export const layoutOnly = [layoutExtractor];

// -------------------- AFTER CHILDREN HELPERS --------------------

/**
 * Node types that can be exported as SVG images.
 * When a FRAME, GROUP, or INSTANCE contains only these types, we can collapse it to IMAGE-SVG.
 * Note: FRAME/GROUP/INSTANCE are NOT included here—they're only eligible if collapsed to IMAGE-SVG.
 */
export const SVG_ELIGIBLE_TYPES = new Set([
  "IMAGE-SVG", // VECTOR nodes are converted to IMAGE-SVG, or containers that were collapsed
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "ELLIPSE",
  "REGULAR_POLYGON",
  "RECTANGLE",
]);

/**
 * afterChildren callback that collapses SVG-heavy containers to IMAGE-SVG.
 *
 * If a FRAME, GROUP, or INSTANCE contains only SVG-eligible children, the parent
 * is marked as IMAGE-SVG and children are omitted, reducing payload size.
 *
 * @param node - Original Figma node
 * @param result - NormalizedNode being built
 * @param children - Processed children
 * @returns Children to include (empty array if collapsed)
 */
export function collapseSvgContainers(
  node: FigmaDocumentNode,
  result: NormalizedNode,
  children: NormalizedNode[],
): NormalizedNode[] {
  const allChildrenAreSvgEligible = children.every((child) =>
    SVG_ELIGIBLE_TYPES.has(child.type),
  );

  if (
    (node.type === "FRAME" || node.type === "GROUP" || node.type === "INSTANCE" || node.type === "BOOLEAN_OPERATION") &&
    allChildrenAreSvgEligible
  ) {
    result.type = "IMAGE-SVG";
    return [];
  }

  // Include all children normally
  return children;
}

/**
 * afterChildren callback that flattens visually transparent FRAME/GROUP containers
 * into their parent when layout direction is compatible.
 *
 * A child is flattened (its children promoted to the parent level) when ALL conditions are met:
 *   1. Type is FRAME or GROUP (INSTANCEs are semantically meaningful, never flattened)
 *   2. Visually transparent: no fills, strokes, borderRadius, or opacity change
 *   3. No spacing contribution: no padding, no gap, no scroll overflow
 *   4. Layout direction compatible with parent:
 *      - Single grandchild: always flatten (direction irrelevant for pass-through)
 *      - Same direction as parent (both row or both column): flatten
 *      - Cross-direction with >=2 grandchildren: preserve (layout boundary is meaningful)
 *   5. Parent itself must have auto-layout (display: flex); absolute-positioned
 *      contexts are left untouched to avoid breaking spatial relationships
 */
export function flattenTransparentFrames(
  node: FigmaDocumentNode,
  _result: NormalizedNode,
  children: NormalizedNode[],
): NormalizedNode[] {
  const parentMode = getLayoutDirection(node);

  if (parentMode === "none") {
    return children;
  }

  const originalChildMap = buildOriginalChildMap(node);

  return children.flatMap((child) => {
    const originalChild = originalChildMap.get(child.id);
    if (shouldFlattenChild(child, parentMode, originalChild)) {
      return child.children ?? [];
    }
    return [child];
  });
}

function shouldFlattenChild(
  child: NormalizedNode,
  parentMode: "row" | "column",
  originalChild: FigmaDocumentNode | undefined,
): boolean {
  if (child.type !== "FRAME" && child.type !== "GROUP") return false;
  if (!child.children || child.children.length === 0) return false;
  if (!isVisuallyTransparent(child)) return false;
  if (!originalChild) return false;
  if (!hasNoSpacingContribution(originalChild)) return false;

  const childMode = getLayoutDirection(originalChild);

  if (child.children.length === 1) return true;
  if (childMode === parentMode) return true;
  return false;
}

function isVisuallyTransparent(node: NormalizedNode): boolean {
  if (node.fills || node.borderColor || node.borderRadius || node.effects) return false;
  if (node.opacity !== undefined && node.opacity !== 1) return false;
  return true;
}

function hasNoSpacingContribution(node: FigmaDocumentNode): boolean {
  if (!isFrame(node)) return true;

  const { paddingTop = 0, paddingBottom = 0, paddingLeft = 0, paddingRight = 0 } = node;
  if (paddingTop > 0 || paddingBottom > 0 || paddingLeft > 0 || paddingRight > 0) return false;

  if ((node.itemSpacing ?? 0) > 0) return false;

  if (node.overflowDirection && node.overflowDirection !== "NONE") return false;

  return true;
}

function getLayoutDirection(node: FigmaDocumentNode): "row" | "column" | "none" {
  if (!isFrame(node)) return "none";
  if (node.layoutMode === "HORIZONTAL") return "row";
  if (node.layoutMode === "VERTICAL") return "column";
  return "none";
}

function buildOriginalChildMap(node: FigmaDocumentNode): Map<string, FigmaDocumentNode> {
  const map = new Map<string, FigmaDocumentNode>();
  if (hasValue("children", node) && Array.isArray(node.children)) {
    for (const child of node.children) {
      map.set(child.id, child);
    }
  }
  return map;
}

/**
 * When a parent frame has negative itemSpacing, its children visually overlap.
 * Annotate the second-and-later children with _overlapPreviousPx so the LLM
 * knows to use negative margins (common in mobile header-extends-behind-cards patterns).
 */
export const annotateSiblingOverlap: AfterChildrenFn = (node, _result, children) => {
  if (!isFrame(node) || !node.itemSpacing || node.itemSpacing >= 0 || children.length < 2) {
    return children;
  }
  const overlapPx = Math.abs(node.itemSpacing);
  for (let i = 1; i < children.length; i++) {
    children[i]._overlapPreviousPx = overlapPx;
  }
  return children;
};

/**
 * Composes multiple afterChildren callbacks into a single pipeline.
 * Each function receives the output of the previous one.
 */
export function composeAfterChildren(...fns: AfterChildrenFn[]): AfterChildrenFn {
  return (node, result, children) => {
    let current = children;
    for (const fn of fns) {
      current = fn(node, result, current);
    }
    return current;
  };
}

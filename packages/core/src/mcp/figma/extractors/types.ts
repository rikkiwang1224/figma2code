import type { Node as FigmaDocumentNode, Style } from "@figma/rest-api-spec";
import type { NormalizedTextStyle } from "../transformers/text.js";
import type { NormalizedLayout } from "../transformers/layout.js";
import type { NormalizedFill, NormalizedStroke } from "../transformers/style.js";
import type { NormalizedEffects } from "../transformers/effects.js";
import type { ComponentProperties } from "../transformers/component.js";

export type StyleTypes =
  | NormalizedTextStyle
  | NormalizedFill[]
  | NormalizedLayout
  | NormalizedStroke
  | NormalizedEffects
  | string;

export type GlobalVars = {
  styles: Record<string, StyleTypes>;
};

/** Minimal component info for resolving componentId → name during extraction */
export type ComponentNameMap = Record<string, { name: string }>;

export interface TraversalContext {
  globalVars: GlobalVars & { extraStyles?: Record<string, Style> };
  currentDepth: number;
  parent?: FigmaDocumentNode;
  /** Map of componentId → { name } for resolving INSTANCE componentName */
  components?: ComponentNameMap;
}

export interface TraversalOptions {
  maxDepth?: number;
  nodeFilter?: (node: FigmaDocumentNode) => boolean;
  /**
   * Called after children are processed, allowing modification of the parent node
   * and control over which children to include in the output.
   *
   * @param node - Original Figma node
   * @param result - NormalizedNode being built (can be mutated)
   * @param children - Processed children
   * @returns Children to include (return empty array to omit children)
   */
  afterChildren?: (
    node: FigmaDocumentNode,
    result: NormalizedNode,
    children: NormalizedNode[],
  ) => NormalizedNode[];
}

/**
 * An extractor function that can modify a NormalizedNode during traversal.
 *
 * @param node - The current Figma node being processed
 * @param result - NormalizedNode object being built—this can be mutated inside the extractor
 * @param context - Traversal context including globalVars and parent info. This can also be mutated inside the extractor.
 */
export type ExtractorFn = (
  node: FigmaDocumentNode,
  result: NormalizedNode,
  context: TraversalContext,
) => void;

export interface NormalizedDesign {
  name: string;
  nodes: NormalizedNode[];
  globalVars: GlobalVars;
}

export interface RepeatVariable {
  path: string;
  values: (string | number | undefined)[];
}

export interface RepeatAnnotation {
  count: number;
  variables?: RepeatVariable[];
}

export interface NormalizedTextSegment {
  text: string;
  fills?: string;
}

export interface NormalizedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, etc.
  // text
  text?: string;
  textStyle?: string;
  textSegments?: NormalizedTextSegment[];
  listStyle?: "unordered" | "ordered";
  // appearance
  fills?: string;
  styles?: string;
  borderColor?: string;
  // Border widths derived from strokes — kept on the node when border uses a named color style
  /** Uniform border width on all sides (e.g. "1px") */
  border?: string;
  /** Per-side border widths — only sides with > 0 width are present */
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  strokeDashes?: number[];
  /** Only present when NOT "INSIDE" (INSIDE is the CSS default with box-sizing: border-box) */
  strokeAlign?: "OUTSIDE" | "CENTER";
  effects?: string;
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: string;
  // INSTANCE: resolved component (set) name + props
  componentName?: string;
  componentProperties?: ComponentProperties[];
  /** Raw SVG markup fetched via Figma export API (only for IMAGE-SVG nodes) */
  svgContent?: string;
  // children
  children?: NormalizedNode[];
  // repetition annotations (added by post-processing)
  _repeat?: RepeatAnnotation;
  _childPattern?: string;
  // sibling overlap annotation (added by afterChildren)
  _overlapPreviousPx?: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

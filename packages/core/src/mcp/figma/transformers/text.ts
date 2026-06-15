import type { Node as FigmaDocumentNode, Paint } from "@figma/rest-api-spec";
import { hasValue, isTruthy } from "../utils/identity.js";

export type NormalizedTextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textAlign: string;
  verticalAlign: string;
  /** CSS text-decoration (underline, strikethrough) */
  textDecoration?: string;
  /** CSS text-transform (uppercase, lowercase, capitalize) */
  textTransform?: string;
  /** CSS overflow (from Figma textTruncation) */
  overflow?: string;
  /** CSS text-overflow: ellipsis (single-line truncation) */
  textOverflow?: string;
  /** CSS white-space: nowrap (single-line truncation) */
  whiteSpace?: string;
  /** CSS display: -webkit-box (multi-line truncation) */
  display?: string;
  /** CSS -webkit-line-clamp: N (multi-line truncation) */
  WebkitLineClamp?: number;
  /** CSS -webkit-box-orient: vertical (multi-line truncation) */
  WebkitBoxOrient?: string;
  /** CSS word-break: break-word (multi-line truncation) */
  wordBreak?: string;
}>;

export interface RawTextSegment {
  text: string;
  overrideFills?: Paint[];
  inheritFillStyleId?: string;
}

export function isTextNode(
  n: FigmaDocumentNode,
): n is Extract<FigmaDocumentNode, { type: "TEXT" }> {
  return n.type === "TEXT";
}

export function hasTextStyle(
  n: FigmaDocumentNode,
): n is FigmaDocumentNode & { style: Extract<FigmaDocumentNode, { style: any }>["style"] } {
  return hasValue("style", n) && Object.keys(n.style).length > 0;
}

/**
 * Normalize typographic Unicode characters that could cause issues in generated code.
 *
 * Smart single quotes (U+2018/U+2019) are intentionally kept as-is because they are
 * safe inside JS template literals (backticks) and single-quoted strings (they are
 * different characters from U+0027). Converting them to ASCII apostrophes would
 * guarantee breakage in single-quoted strings like $gt('you'll').
 */
function sanitizeText(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

// Keep other simple properties directly
export function extractNodeText(n: FigmaDocumentNode) {
  if (hasValue("characters", n, isTruthy)) {
    return sanitizeText(n.characters);
  }
}

/**
 * Extract list style from Figma lineTypes.
 * Returns "unordered" for bullet lists, "ordered" for numbered lists, undefined otherwise.
 */
export function extractListStyle(
  n: FigmaDocumentNode,
): "unordered" | "ordered" | undefined {
  const node = n as Record<string, any>;
  const lineTypes: string[] | undefined = node.lineTypes;
  if (!lineTypes) return undefined;

  const nonNone = lineTypes.filter((t: string) => t !== "NONE");
  if (nonNone.length === 0) return undefined;

  const hasUnordered = nonNone.includes("UNORDERED");
  const hasOrdered = nonNone.includes("ORDERED");
  if (hasUnordered && !hasOrdered) return "unordered";
  if (hasOrdered && !hasUnordered) return "ordered";
  return nonNone.filter((t: string) => t === "UNORDERED").length >= nonNone.length / 2
    ? "unordered"
    : "ordered";
}

/** Map Figma textAlignHorizontal to CSS text-align value (LEFT is default, omitted) */
function convertTextAlign(align?: string): string | undefined {
  if (!align || align === "LEFT") return undefined;
  const map: Record<string, string> = {
    CENTER: "center",
    RIGHT: "right",
    JUSTIFIED: "justify",
  };
  return map[align];
}

/** Map Figma textAlignVertical to CSS-friendly value (TOP is default, omitted) */
function convertVerticalAlign(align?: string): string | undefined {
  if (!align || align === "TOP") return undefined;
  const map: Record<string, string> = {
    CENTER: "middle",
    BOTTOM: "bottom",
  };
  return map[align];
}

/** Map Figma textDecoration to CSS value */
function extractTextDecoration(value?: string): string | undefined {
  if (!value || value === "NONE") return undefined;
  if (value === "STRIKETHROUGH") return "line-through";
  return value.toLowerCase();
}

/** Map Figma textCase to CSS text-transform */
function extractTextTransform(textCase?: string): string | undefined {
  if (!textCase || textCase === "ORIGINAL") return undefined;
  const map: Record<string, string> = {
    UPPER: "uppercase",
    LOWER: "lowercase",
    TITLE: "capitalize",
  };
  return map[textCase] ?? textCase.toLowerCase();
}

export function extractTextStyle(n: FigmaDocumentNode) {
  if (hasTextStyle(n)) {
    const style = n.style as Record<string, unknown>;
    const node = n as Record<string, unknown>;

    const textStyle: NormalizedTextStyle = {
      fontFamily: style.fontFamily as string,
      fontWeight: style.fontWeight as number,
      fontSize: style.fontSize as number,
      lineHeight:
        "lineHeightPx" in style && style.lineHeightPx && style.fontSize
          ? `${(style.lineHeightPx as number) / (style.fontSize as number)}em`
          : undefined,
      letterSpacing:
        style.letterSpacing && style.letterSpacing !== 0 && style.fontSize
          ? `${(((style.letterSpacing as number) / (style.fontSize as number)) * 100)}%`
          : undefined,
      textCase: style.textCase as string,
      textAlign: convertTextAlign(style.textAlignHorizontal as string),
      verticalAlign: convertVerticalAlign(style.textAlignVertical as string),
    };

    // textDecoration
    const textDecoration = extractTextDecoration(
      (style.textDecoration ?? node.textDecoration) as string | undefined,
    );
    if (textDecoration) textStyle.textDecoration = textDecoration;

    // textTransform (from textCase)
    const textTransform = extractTextTransform(style.textCase as string);
    if (textTransform) textStyle.textTransform = textTransform;

    // textTruncation + maxLines → CSS truncation properties
    const textTruncation = (style.textTruncation ?? node.textTruncation) as
      | string
      | undefined;
    if (textTruncation && textTruncation === "ENDING") {
      const maxLines = (style.maxLines ?? node.maxLines) as number | undefined;
      if (maxLines != null && maxLines > 1) {
        // Multi-line clamp
        textStyle.overflow = "hidden";
        textStyle.display = "-webkit-box";
        textStyle.WebkitLineClamp = maxLines;
        textStyle.WebkitBoxOrient = "vertical";
        textStyle.wordBreak = "break-word";
        textStyle.whiteSpace = "normal";
      } else {
        // Single-line ellipsis
        textStyle.overflow = "hidden";
        textStyle.textOverflow = "ellipsis";
        textStyle.whiteSpace = "nowrap";
      }
    }

    return textStyle;
  }
}

/**
 * Parse characterStyleOverrides + styleOverrideTable into styled text segments.
 * Returns undefined when there are no visually meaningful per-character overrides.
 */
export function extractStyledTextSegments(node: FigmaDocumentNode): RawTextSegment[] | undefined {
  const n = node as Record<string, any>;
  const chars: string | undefined = n.characters ? sanitizeText(n.characters) : undefined;
  const overrides: number[] | undefined = n.characterStyleOverrides;
  const overrideTable: Record<string, any> | undefined = n.styleOverrideTable;

  if (!chars || !overrides?.length || !overrideTable) return undefined;

  const baseStyle = n.style as Record<string, any> | undefined;

  // Identify overrides with visually meaningful differences (fills, font changes, decoration)
  const visualOverrides = new Map<number, { fills?: Paint[]; inheritFillStyleId?: string }>();
  for (const [key, entry] of Object.entries(overrideTable)) {
    const hasFillOverride = Array.isArray(entry.fills) && entry.fills.length > 0;
    const hasFontOverride =
      (entry.fontWeight !== undefined && entry.fontWeight !== baseStyle?.fontWeight) ||
      (entry.fontSize !== undefined && entry.fontSize !== baseStyle?.fontSize) ||
      (entry.fontFamily && entry.fontFamily !== baseStyle?.fontFamily) ||
      !!entry.textDecoration;

    if (hasFillOverride || hasFontOverride) {
      visualOverrides.set(Number(key), {
        fills: hasFillOverride ? entry.fills : undefined,
        inheritFillStyleId: entry.inheritFillStyleId,
      });
    }
  }

  if (visualOverrides.size === 0) return undefined;

  // Map each character to its visual group key:
  //   0 → base style (override index 0 or any non-visual override)
  //   N → the override index when it carries a visual change
  function getVisualKey(i: number): number {
    const idx = i < overrides!.length ? overrides![i] : 0;
    return visualOverrides.has(idx) ? idx : 0;
  }

  // Group consecutive characters sharing the same visual key
  const segments: RawTextSegment[] = [];
  let segStart = 0;
  let currentKey = getVisualKey(0);

  for (let i = 1; i <= chars.length; i++) {
    const key = i < chars.length ? getVisualKey(i) : -1; // sentinel to flush last segment
    if (key !== currentKey) {
      const text = chars.slice(segStart, i);
      const segment: RawTextSegment = { text };

      if (currentKey !== 0) {
        const override = visualOverrides.get(currentKey);
        if (override?.fills) {
          segment.overrideFills = override.fills;
        }
        if (override?.inheritFillStyleId) {
          segment.inheritFillStyleId = override.inheritFillStyleId;
        }
      }

      segments.push(segment);
      segStart = i;
      currentKey = key;
    }
  }

  return segments.length > 1 ? segments : undefined;
}

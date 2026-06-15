import type { NormalizedNode, RepeatVariable } from "../extractors/types.js";

const MIN_REPEAT_COUNT = 2;

/**
 * Post-processing pass that detects structurally repeated siblings and folds them.
 *
 * Walks the tree bottom-up so nested repetitions are resolved first.
 * For each parent node, siblings are grouped by structural fingerprint.
 * Only **consecutive** runs of same-fingerprint siblings are folded: the first
 * instance (exemplar) of each run is annotated with `_repeat` metadata and the
 * remaining instances are removed. Non-consecutive occurrences are left in place
 * to preserve the original child ordering.
 *
 * TEXT-only sibling groups are never folded. TEXT nodes are leaf-level content
 * carriers whose identity IS their text value; folding them pollutes upstream
 * fingerprints (via _repeat.variables) and prevents legitimate container-level
 * folds. Text differences are instead captured when their parent containers
 * are folded via variable extraction.
 *
 * Mutates the tree in place.
 */
export function detectAndFoldRepetition(node: NormalizedNode): NormalizedNode {
  if (!node.children) return node;

  for (const child of node.children) {
    detectAndFoldRepetition(child);
  }

  if (node.children.length >= MIN_REPEAT_COUNT) {
    foldRepeatedSiblings(node);
  }

  return node;
}

// ---------------------------------------------------------------------------
// Core folding
// ---------------------------------------------------------------------------

function foldRepeatedSiblings(node: NormalizedNode): void {
  const children = node.children!;
  const fingerprints = children.map(computeFingerprint);

  const groups = groupByFingerprint(fingerprints);

  const indicesToRemove = new Set<number>();

  for (const [_, indices] of groups) {
    if (indices.length < MIN_REPEAT_COUNT) continue;
    if (indices.every((i) => children[i].type === "TEXT")) continue;

    // Split into consecutive runs so that non-adjacent duplicates are
    // preserved in their original positions (avoids reordering children).
    const runs = splitIntoConsecutiveRuns(indices);
    for (const run of runs) {
      if (run.length < MIN_REPEAT_COUNT) continue;

      const instances = run.map((i) => children[i]);
      const exemplar = instances[0];

      const variables = extractVariables(instances);
      exemplar._repeat = { count: instances.length };
      if (variables.length > 0) {
        exemplar._repeat.variables = variables;
      }

      for (let i = 1; i < run.length; i++) {
        indicesToRemove.add(run[i]);
      }
    }
  }

  if (indicesToRemove.size === 0) return;

  node.children = children.filter((_, idx) => !indicesToRemove.has(idx));
}

function groupByFingerprint(fingerprints: string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  fingerprints.forEach((fp, idx) => {
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp)!.push(idx);
  });
  return groups;
}

/**
 * Splits an array of sorted indices into sub-arrays of consecutive indices.
 *
 * Example: [0, 1, 3, 5, 6, 7] → [[0, 1], [3], [5, 6, 7]]
 */
function splitIntoConsecutiveRuns(indices: number[]): number[][] {
  if (indices.length === 0) return [];
  const runs: number[][] = [[indices[0]]];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      runs[runs.length - 1].push(indices[i]);
    } else {
      runs.push([indices[i]]);
    }
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Structural fingerprinting
// ---------------------------------------------------------------------------

/**
 * Computes a structural fingerprint that captures the "skeleton" of a subtree.
 *
 * Included (structural identity):
 *   type, layout ref, componentName, textStyle ref,
 *   _repeat.count AND _repeat.variables (to prevent lossy double-folds),
 *   boolean presence of fills/strokes/borderRadius/effects/opacity,
 *   recursive children fingerprints.
 *
 * Excluded (per-instance content):
 *   text value, specific fills/strokes/effects refs, node id/name,
 *   componentProperties values.
 *
 * Why include _repeat.variables in the fingerprint:
 *   After bottom-up folding, two parent containers may share identical structure
 *   (same child types, same _repeat.count) but contain entirely different data
 *   (e.g. "Order ID, SN, Seller" vs "PIC, Creation Time, Paid Time").
 *   Including variable VALUES prevents these semantically distinct sections
 *   from being falsely merged, while still allowing truly identical sections
 *   (same labels, same variable paths+values) to be folded.
 */
function computeFingerprint(node: NormalizedNode): string {
  return JSON.stringify(buildSkeleton(node));
}

function buildSkeleton(node: NormalizedNode): unknown {
  return {
    t: node.type,
    l: node.type === "IMAGE-SVG" ? undefined : node.layout,
    cn: node.componentName,
    ts: node.textStyle,
    tx: node.text !== undefined,
    f: node.fills !== undefined,
    s: node.borderColor !== undefined,
    br: node.borderRadius !== undefined,
    e: node.effects !== undefined,
    o: node.opacity !== undefined && node.opacity !== 1,
    rc: node._repeat?.count,
    rv: node._repeat?.variables,
    ch: node.children?.map(buildSkeleton) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Variable extraction — diff repeated instances to find what varies
// ---------------------------------------------------------------------------

/** All NormalizedNode props that can differ across repeated instances (incl. stroke fields). */
const DIFF_PROPS: (keyof NormalizedNode)[] = [
  "name",
  "text",
  "svgContent",
  "layout",
  "fills",
  "borderColor",
  "effects",
  "textStyle",
  "borderRadius",
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "strokeDashes",
  "strokeAlign",
];

function extractVariables(instances: NormalizedNode[]): RepeatVariable[] {
  if (instances.length < 2) return [];
  const out: RepeatVariable[] = [];
  collectDiffs(instances, "", out);
  return out;
}

function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => valueEquals(x, b[i]));
  }
  return false;
}

function collectDiffs(
  instances: NormalizedNode[],
  prefix: string,
  out: RepeatVariable[],
): void {
  for (const prop of DIFF_PROPS) {
    const raw = instances.map((n) => n[prop as keyof NormalizedNode]);
    const differs = raw.some((v, i) => !valueEquals(v, raw[0]));
    if (!differs) continue;
    const values = raw.map((v) =>
      v === undefined ? undefined : Array.isArray(v) ? JSON.stringify(v) : (v as string | number),
    ) as (string | number | undefined)[];
    out.push({ path: `${prefix}${prop}`, values });
  }

  const opacities = instances.map((n) => n.opacity);
  if (opacities.some((v) => v !== opacities[0])) {
    out.push({ path: `${prefix}opacity`, values: opacities });
  }

  const counts = instances.map((n) => n.children?.length ?? 0);
  if (counts[0] > 0 && counts.every((c) => c === counts[0])) {
    for (let i = 0; i < counts[0]; i++) {
      collectDiffs(
        instances.map((n) => n.children![i]),
        `${prefix}children[${i}].`,
        out,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Child pattern — human-readable description of original interleaving order
// ---------------------------------------------------------------------------

function hasNonConsecutiveRepeats(groups: Map<string, number[]>): boolean {
  for (const [_, indices] of groups) {
    if (indices.length < MIN_REPEAT_COUNT) continue;
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) return true;
    }
  }
  return false;
}

function buildChildPattern(
  fingerprints: string[],
  groups: Map<string, number[]>,
  children: NormalizedNode[],
): string {
  const fpToLabel = new Map<string, string>();
  let labelIdx = 0;
  for (const fp of fingerprints) {
    if (!fpToLabel.has(fp)) {
      fpToLabel.set(fp, String.fromCharCode(65 + (labelIdx % 26)));
      labelIdx++;
    }
  }

  const sequence = fingerprints.map((fp) => fpToLabel.get(fp)!);
  const compressed = compressSequence(sequence);

  const legendParts: string[] = [];
  for (const [fp, indices] of groups) {
    const label = fpToLabel.get(fp)!;
    const name = children[indices[0]].name;
    const suffix = indices.length >= MIN_REPEAT_COUNT ? ` ×${indices.length}` : "";
    legendParts.push(`${label}=${name}${suffix}`);
  }

  return `${compressed} (${legendParts.join(", ")})`;
}

/**
 * Compresses a label sequence by detecting repeating subsequences,
 * then falling back to run-length encoding.
 *
 * Examples:
 *   [A, B, A, B, A, B, A] → "[A, B] × 3, A"
 *   [A, A, B, B, B]       → "A × 2, B × 3"
 *   [A, B, C]             → "A, B, C"
 */
function compressSequence(seq: string[]): string {
  if (seq.length === 0) return "";

  for (let unitLen = 2; unitLen <= Math.floor(seq.length / 2); unitLen++) {
    const unit = seq.slice(0, unitLen);
    let count = 0;
    let pos = 0;

    while (pos + unitLen <= seq.length) {
      const chunk = seq.slice(pos, pos + unitLen);
      if (chunk.every((v, i) => v === unit[i])) {
        count++;
        pos += unitLen;
      } else {
        break;
      }
    }

    if (count >= 2) {
      const unitStr = `[${unit.join(", ")}]`;
      const parts = [`${unitStr} × ${count}`];
      const remainder = seq.slice(pos);
      if (remainder.length > 0) {
        parts.push(compressSequence(remainder));
      }
      return parts.join(", ");
    }
  }

  const runs: { label: string; count: number }[] = [];
  for (const label of seq) {
    if (runs.length > 0 && runs[runs.length - 1].label === label) {
      runs[runs.length - 1].count++;
    } else {
      runs.push({ label, count: 1 });
    }
  }

  return runs.map((r) => (r.count > 1 ? `${r.label} × ${r.count}` : r.label)).join(", ");
}

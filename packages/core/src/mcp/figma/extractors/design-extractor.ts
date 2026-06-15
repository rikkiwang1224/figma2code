import type {
  GetFileResponse,
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  Component,
  ComponentSet,
  Style,
} from "@figma/rest-api-spec";
import { isVisible } from "../utils/common.js";
import type {
  ExtractorFn,
  TraversalOptions,
  NormalizedDesign,
  TraversalContext,
  ComponentNameMap,
} from "./types.js";
import { extractFromDesign } from "./node-walker.js";

/**
 * Extract a complete NormalizedDesign from raw Figma API response using extractors.
 */
export function normalizeRawFigmaObject(
  apiResponse: GetFileResponse | GetFileNodesResponse,
  nodeExtractors: ExtractorFn[],
  options: TraversalOptions = {},
): NormalizedDesign {
  const { metadata, rawNodes, components, componentSets, extraStyles } =
    parseAPIResponse(apiResponse);

  // Prefer component set name (e.g. "Tabs") over component variant name (e.g. "Style=Default, 顶头=True")
  const componentNameMap: ComponentNameMap = {};
  for (const [id, comp] of Object.entries(components)) {
    const name =
      comp.componentSetId && componentSets[comp.componentSetId]
        ? componentSets[comp.componentSetId].name
        : comp.name;
    componentNameMap[id] = { name };
  }

  const globalVars: TraversalContext["globalVars"] = { styles: {}, extraStyles };
  const { nodes: extractedNodes, globalVars: finalGlobalVars } = extractFromDesign(
    rawNodes,
    nodeExtractors,
    options,
    globalVars,
    componentNameMap,
  );

  return {
    ...metadata,
    nodes: extractedNodes,
    globalVars: { styles: finalGlobalVars.styles },
  };
}

/**
 * Parse the raw Figma API response to extract metadata, nodes, and components.
 */
function parseAPIResponse(data: GetFileResponse | GetFileNodesResponse) {
  const aggregatedComponents: Record<string, Component> = {};
  const aggregatedComponentSets: Record<string, ComponentSet> = {};
  let extraStyles: Record<string, Style> = {};
  let nodesToParse: Array<FigmaDocumentNode>;

  if ("nodes" in data) {
    const nodeResponses = Object.values(data.nodes);
    nodeResponses.forEach((nodeResponse) => {
      if (nodeResponse.components) {
        Object.assign(aggregatedComponents, nodeResponse.components);
      }
      if (nodeResponse.componentSets) {
        Object.assign(aggregatedComponentSets, nodeResponse.componentSets);
      }
      if (nodeResponse.styles) {
        Object.assign(extraStyles, nodeResponse.styles);
      }
    });
    nodesToParse = nodeResponses.map((n) => n.document).filter(isVisible);
  } else {
    Object.assign(aggregatedComponents, data.components);
    Object.assign(aggregatedComponentSets, data.componentSets);
    if (data.styles) {
      extraStyles = data.styles;
    }
    nodesToParse = data.document.children.filter(isVisible);
  }

  const { name } = data;

  return {
    metadata: { name },
    rawNodes: nodesToParse,
    extraStyles,
    components: aggregatedComponents,
    componentSets: aggregatedComponentSets,
  };
}

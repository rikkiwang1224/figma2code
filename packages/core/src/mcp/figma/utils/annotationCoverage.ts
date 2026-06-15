/**
 * 从 Figma API 响应中收集实例节点列表及标注信息，用于统计标注覆盖率。
 */

import { FIGMA_PLUGIN_ID } from "./constants.js";

/** 单个实例节点在输出中的项：id、名称、是否有标注 */
export interface InstanceNodeItem {
  id: string;
  name: string;
  hasAnnotation: boolean;
}

/** 实例节点列表 + 汇总统计 */
export interface InstanceNodeListResult {
  /** 实例节点列表：每个实例的 id、name、是否有标注 */
  instanceNodeList: InstanceNodeItem[];
  /** 实例节点总数 */
  totalInstance: number;
  /** 有标注的实例节点数 */
  annotatedInstance: number;
  /** 标注覆盖率 0–100，无实例时为 100 */
  coveragePercent: number;
}

/** 遍历用：带 children 的原始节点（Figma API 返回的 document 节点） */
interface RawNodeWithChildren {
  id?: string;
  name?: string;
  type?: string;
  children?: RawNodeWithChildren[];
  pluginData?: Record<string, { metaData?: string }>;
}

/**
 * 判断节点是否有有效标注（存在 pluginData[FIGMA_PLUGIN_ID].metaData）
 */
function hasAnnotation(node: RawNodeWithChildren): boolean {
  const pluginData = node.pluginData?.[FIGMA_PLUGIN_ID];
  const metaData = pluginData?.metaData;
  return typeof metaData === "string" && metaData.length > 0;
}

/**
 * 递归遍历节点树，收集所有 INSTANCE 节点及其标注情况。
 */
function collectInstanceNodes(
  node: RawNodeWithChildren,
  list: InstanceNodeItem[],
): void {
  if (!node || node.type !== "INSTANCE") {
    const children = node?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        collectInstanceNodes(child, list);
      }
    }
    return;
  }

  const id = node.id ?? "";
  const name = typeof node.name === "string" ? node.name : "";
  list.push({
    id,
    name,
    hasAnnotation: hasAnnotation(node),
  });

  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      collectInstanceNodes(child, list);
    }
  }
}

/**
 * 从 GetFileResponse 或 GetFileNodesResponse 中收集实例节点列表及标注统计。
 * 请求需带 plugin_data=FIGMA_PLUGIN_ID 才能拿到 pluginData。
 */
export function getInstanceNodeList(
  apiResponse: { nodes?: Record<string, { document: RawNodeWithChildren }>; document?: { children?: RawNodeWithChildren[] } },
): InstanceNodeListResult {
  const instanceNodeList: InstanceNodeItem[] = [];
  const roots: RawNodeWithChildren[] = [];

  if ("nodes" in apiResponse && apiResponse.nodes) {
    for (const key of Object.keys(apiResponse.nodes)) {
      const doc = apiResponse.nodes[key].document;
      if (doc) roots.push(doc);
    }
  } else if ("document" in apiResponse && apiResponse.document?.children) {
    roots.push(...apiResponse.document.children);
  }

  for (const root of roots) {
    collectInstanceNodes(root, instanceNodeList);
  }

  const totalInstance = instanceNodeList.length;
  const annotatedInstance = instanceNodeList.filter((item) => item.hasAnnotation).length;
  const coveragePercent =
    totalInstance === 0 ? 100 : Math.round((annotatedInstance / totalInstance) * 100);

  return {
    instanceNodeList,
    totalInstance,
    annotatedInstance,
    coveragePercent,
  };
}

/** 令牌化树中的节点（含 children、可选 annotatedMeta） */
interface NormalizedNodeLike {
  id?: string;
  name?: string;
  type?: string;
  children?: NormalizedNodeLike[];
  annotatedMeta?: unknown;
}

/**
 * 从规范化设计树（normalized-node-tree.json）中收集实例节点列表及标注统计。
 * hasAnnotation 取自节点是否存在 annotatedMeta（若简化时未注入则为 false）。
 */
export function getInstanceNodeListFromNormalized(data: {
  nodes: NormalizedNodeLike[];
}): InstanceNodeListResult {
  const instanceNodeList: InstanceNodeItem[] = [];

  function walk(nodes: NormalizedNodeLike[]): void {
    for (const node of nodes) {
      if (!node) continue;
      if (node.type === "INSTANCE") {
        instanceNodeList.push({
          id: node.id ?? "",
          name: typeof node.name === "string" ? node.name : "",
          hasAnnotation: !!node.annotatedMeta,
        });
      }
      if (Array.isArray(node.children)) walk(node.children);
    }
  }

  if (Array.isArray(data.nodes)) walk(data.nodes);

  const totalInstance = instanceNodeList.length;
  const annotatedInstance = instanceNodeList.filter((item) => item.hasAnnotation).length;
  const coveragePercent =
    totalInstance === 0 ? 100 : Math.round((annotatedInstance / totalInstance) * 100);

  return {
    instanceNodeList,
    totalInstance,
    annotatedInstance,
    coveragePercent,
  };
}

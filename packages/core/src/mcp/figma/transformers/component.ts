import type { Component, ComponentPropertyType, ComponentSet } from "@figma/rest-api-spec";

export interface ComponentProperties {
  name: string;
  value: string;
  type: ComponentPropertyType;
}

export interface NormalizedComponentDefinition {
  id: string;
  key: string;
  name: string;
  componentSetId?: string;
}

export interface NormalizedComponentSetDefinition {
  id: string;
  key: string;
  name: string;
  description?: string;
}

/**
 * Remove unnecessary component properties and convert to normalized format.
 */
export function simplifyComponents(
  aggregatedComponents: Record<string, Component>,
): Record<string, NormalizedComponentDefinition> {
  return Object.fromEntries(
    Object.entries(aggregatedComponents).map(([id, comp]) => [
      id,
      {
        id,
        key: comp.key,
        name: comp.name,
        componentSetId: comp.componentSetId,
      },
    ]),
  );
}

/**
 * Remove unnecessary component set properties and convert to normalized format.
 */
export function simplifyComponentSets(
  aggregatedComponentSets: Record<string, ComponentSet>,
): Record<string, NormalizedComponentSetDefinition> {
  return Object.fromEntries(
    Object.entries(aggregatedComponentSets).map(([id, set]) => [
      id,
      {
        id,
        key: set.key,
        name: set.name,
        description: set.description,
      },
    ]),
  );
}

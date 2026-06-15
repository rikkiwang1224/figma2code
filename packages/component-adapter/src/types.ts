export interface ComponentMeta {
  name: string;
  displayName?: string;
  category?: string;
  importPath: string;
  exportName?: string;
  description?: string;
  props?: ComponentPropMeta[];
  subComponents?: string[];
  tags?: string[];
}

export interface ComponentPropMeta {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description?: string;
}

export interface ComponentExample {
  name: string;
  description?: string;
  code: string;
  fileName?: string;
}

/**
 * Pluggable component library adapter.
 * Open-source demo uses Ant Design; internal SSC adapters stay in agent-server.
 */
export interface ComponentLibraryAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly npmPackage: string;
  readonly iconPackage?: string;

  listComponents(): Promise<ComponentMeta[]>;
  getComponentSource(name: string): Promise<string | null>;
  getExamples(name: string): Promise<ComponentExample[]>;
  getTypeDefinitions(name: string): Promise<string | null>;

  /** Prompt fragments injected into system prompt / workflow */
  buildLibraryPromptSection(): string;
  buildIconPromptSection(): string;
}

export interface AdapterRegistry {
  register(adapter: ComponentLibraryAdapter): void;
  get(id: string): ComponentLibraryAdapter;
  list(): ComponentLibraryAdapter[];
}

export function createAdapterRegistry(
  adapters: ComponentLibraryAdapter[] = [],
): AdapterRegistry {
  const map = new Map<string, ComponentLibraryAdapter>();

  for (const adapter of adapters) {
    map.set(adapter.id, adapter);
  }

  return {
    register(adapter) {
      map.set(adapter.id, adapter);
    },
    get(id) {
      const adapter = map.get(id);
      if (!adapter) {
        throw new Error(
          `Unknown component adapter "${id}". Available: ${[...map.keys()].join(', ') || '(none)'}`,
        );
      }
      return adapter;
    },
    list() {
      return [...map.values()];
    },
  };
}

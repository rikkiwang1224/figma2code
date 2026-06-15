import { adapterRegistry } from '../../../config/adapterRegistry.js';
import { AntDesignAdapter } from './adapter.js';

export function registerAntDesignAdapter(): void {
  adapterRegistry.register(new AntDesignAdapter());
}

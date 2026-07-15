/**
 * Compatibility facade for persistence.
 * Implementation lives in domain modules; keep this entry stable for tests and scripts.
 */
export { createDatabase } from './domain/schema.js';
export * from './domain/store.js';

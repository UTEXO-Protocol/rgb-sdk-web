// Local RLN contract barrel.
//
// Re-exports the vendored RLN model types and binding interfaces so RLN consumers
// in this package can import them from a single local path instead of
// @utexo/rgb-sdk-core (which does not yet publish these). Swap the underlying
// modules for the core package here if/when it ships the equivalents.

export type * from '../types/rln-model';
export type { IRlnWalletBinding } from '../interfaces/IRlnWalletBinding';
export type { IRlnNodeBinding } from '../interfaces/IRlnNodeBinding';
export type { IRlnSdkBinding } from '../interfaces/IRlnSdkBinding';

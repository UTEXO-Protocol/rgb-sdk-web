/**
 * Type-level conformance check — compiled, never bundled.
 *
 * `tsconfig.json` includes `src`, so `tsc --noEmit` verifies this file; `tsup`
 * bundles only what is reachable from `src/index.ts`, so it never ships. It
 * contains no runtime exports and no tests to run.
 *
 * What it guards: the v3 contract's central promise — that surface a platform
 * cannot perform is **unreachable at compile time** rather than a method that
 * throws at runtime. Every `@ts-expect-error` below fails the build if the call
 * it marks ever becomes legal again, which is what would happen if someone
 * flattened a carrier back onto the wallet or restored one of the five §2.5
 * signature lies.
 *
 * Types alone cannot check the reverse direction (that a *present* carrier
 * really works) — that needs the runtime conformance suite, plan §7.
 */
import type { IUTEXOWallet } from '@utexo/rgb-sdk-core';
import { UTEXOWallet } from './utexo/utexo-wallet';

declare const concrete: UTEXOWallet;
// A consumer programming against the shared contract, not the concrete class:
const w: IUTEXOWallet<void> = concrete;

// 1. Always-present surface — must compile.
void w.getBtcBalance();
void w.listChannels();
void w.createLightningInvoice({ amountSats: 1000 });

// 2. Carrier access — must compile.
void w.backupNow();
void w.psbt?.signPsbt('psbt');
void w.beginEnd?.sendBtcBegin({ address: 'a', amount: 1, feeRate: 1 });

// 3. Removed §2.5 params — each line below MUST be an error.
// @ts-expect-error accountXpub is no longer in the shared contract
void w.verifyMessage('m', 's', 'xpub');
// @ts-expect-error paymentHash was silently dropped by web; gone from the model
void w.createLightningInvoice({ amountSats: 1, paymentHash: 'h' });
// @ts-expect-error mnemonic is a web platform extra, not shared surface
void w.onchainSend({ invoice: 'i' }, 'mnemonic');
// @ts-expect-error flat carrier methods are not on the contract
void w.vssBackup();
// @ts-expect-error PSBT signing is reached through the carrier only
void w.signPsbt('psbt');

/* tslint:disable */
/* eslint-disable */

/**
 * Apply scan filter (0: ORIGINAL, 1: MAGIC COLOR, 2: B&W)
 */
export function apply_scan_filter(rgba: Uint8Array | number[], width: number, height: number, mode: number, contrast: number, brightness: number): Uint8Array;

/**
 * Detect document 4 corners: returns [x0, y0, x1, y1, x2, y2, x3, y3] as TL, TR, BR, BL
 */
export function detect_document_quad(rgba: Uint8Array | number[], width: number, height: number): Float32Array | undefined;

/**
 * Encode RGBA buffer into JPEG bytes in pure Rust
 */
export function encode_jpeg(rgba: Uint8Array | number[], width: number, height: number, quality: number): Uint8Array;

/**
 * Generate multi-page PDF document embedding DCTDecode JPEG buffers
 */
export function generate_pdf(jpeg_pages_val: any, page_size: string): Uint8Array;

export function init_panic_hook(): void;

/**
 * Perspective warp flattening paper quad to rectangular RGBA buffer.
 * Binary layout: [out_w: u32 (4 bytes LE)][out_h: u32 (4 bytes LE)][RGBA pixels...]
 * Direct byte vector eliminates serde-wasm-bindgen overhead and returns native Uint8Array to JS.
 */
export function warp_perspective(rgba: Uint8Array | number[], width: number, height: number, quad: Float32Array | number[]): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly apply_scan_filter: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly detect_document_quad: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_jpeg: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly generate_pdf: (a: any, b: number, c: number) => [number, number, number, number];
    readonly init_panic_hook: () => void;
    readonly warp_perspective: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

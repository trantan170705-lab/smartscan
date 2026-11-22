use wasm_bindgen::prelude::*;

pub mod detector;
pub mod filters;
pub mod pdf;
pub mod warp;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Detect document 4 corners: returns [x0, y0, x1, y1, x2, y2, x3, y3] as TL, TR, BR, BL
#[wasm_bindgen]
pub fn detect_document_quad(rgba: &[u8], width: u32, height: u32) -> Option<Vec<f32>> {
    detector::detect_document_quad(rgba, width, height)
}

/// Perspective warp flattening paper quad to rectangular RGBA buffer.
/// Binary layout: [out_w: u32 (4 bytes LE)][out_h: u32 (4 bytes LE)][RGBA pixels...]
/// Direct byte vector eliminates serde-wasm-bindgen overhead and returns native Uint8Array to JS.
#[wasm_bindgen]
pub fn warp_perspective(rgba: &[u8], width: u32, height: u32, quad: &[f32]) -> Result<Vec<u8>, JsValue> {
    let (data, out_w, out_h) = warp::warp_perspective_core(rgba, width, height, quad)
        .map_err(|e| JsValue::from_str(&e))?;

    let mut out = Vec::with_capacity(8 + data.len());
    out.extend_from_slice(&out_w.to_le_bytes());
    out.extend_from_slice(&out_h.to_le_bytes());
    out.extend_from_slice(&data);
    Ok(out)
}

/// Apply scan filter (0: ORIGINAL, 1: MAGIC COLOR, 2: B&W)
#[wasm_bindgen]
pub fn apply_scan_filter(
    rgba: &[u8],
    width: u32,
    height: u32,
    mode: u8,
    contrast: f32,
    brightness: f32,
) -> Vec<u8> {
    filters::apply_scan_filter(rgba, width, height, mode, contrast, brightness)
}

/// Encode RGBA buffer into JPEG bytes in pure Rust
#[wasm_bindgen]
pub fn encode_jpeg(rgba: &[u8], width: u32, height: u32, quality: u8) -> Result<Vec<u8>, JsValue> {
    use image::codecs::jpeg::JpegEncoder;
    use image::{ColorType, ImageEncoder};
    use std::io::Cursor;

    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    let total_pixels = (width * height) as usize;
    for i in 0..total_pixels {
        let idx = i * 4;
        if idx + 2 < rgba.len() {
            rgb.push(rgba[idx]);
            rgb.push(rgba[idx + 1]);
            rgb.push(rgba[idx + 2]);
        }
    }

    let mut out = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut out, quality.clamp(10, 100));
    encoder
        .write_image(&rgb, width, height, ColorType::Rgb8.into())
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(out.into_inner())
}

/// Generate multi-page PDF document embedding DCTDecode JPEG buffers
#[wasm_bindgen]
pub fn generate_pdf(jpeg_pages_val: JsValue, page_size: &str) -> Result<Vec<u8>, JsValue> {
    let pages: Vec<Vec<u8>> = serde_wasm_bindgen::from_value(jpeg_pages_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid JPEG pages input: {}", e)))?;

    pdf::generate_pdf_from_jpegs(&pages, page_size)
        .map_err(|e| JsValue::from_str(&e))
}

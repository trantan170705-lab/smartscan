use image::{GrayImage, Luma};
use imageproc::contrast::adaptive_threshold;

/// Adjust contrast and brightness on a single channel byte
#[inline(always)]
fn adjust_channel(val: u8, contrast: f32, brightness: f32) -> u8 {
    let v = val as f32;
    let res = (v - 128.0) * contrast + 128.0 + brightness;
    res.clamp(0.0, 255.0).round() as u8
}

/// Downscale image RGB to small thumbnail for smooth illumination mapping
fn downscale_rgb(
    rgba: &[u8],
    width: u32,
    height: u32,
    target_dim: u32,
) -> (Vec<[f32; 3]>, u32, u32) {
    let (dw, dh) = if width >= height {
        (
            target_dim,
            ((height as f32 / width as f32) * target_dim as f32)
                .max(1.0)
                .round() as u32,
        )
    } else {
        (
            ((width as f32 / height as f32) * target_dim as f32)
                .max(1.0)
                .round() as u32,
            target_dim,
        )
    };

    let mut grid = vec![[0.0f32; 3]; (dw * dh) as usize];
    let sx = width as f32 / dw as f32;
    let sy = height as f32 / dh as f32;

    for dy in 0..dh {
        let src_y = ((dy as f32) * sy).min((height - 1) as f32) as u32;
        let row_offset = (dy * dw) as usize;
        for dx in 0..dw {
            let src_x = ((dx as f32) * sx).min((width - 1) as f32) as u32;
            let idx = ((src_y * width + src_x) * 4) as usize;
            grid[row_offset + dx as usize] = [
                rgba[idx] as f32,
                rgba[idx + 1] as f32,
                rgba[idx + 2] as f32,
            ];
        }
    }

    (grid, dw, dh)
}

/// Separable Morphological Dilation (Max Filter) on RGB channels
/// Replaces dark text and line strokes with local paper background brightness
fn max_filter_rgb(data: &mut [[f32; 3]], width: u32, height: u32, radius: usize) {
    let w = width as usize;
    let h = height as usize;
    let mut temp = vec![[0.0f32; 3]; data.len()];

    // Horizontal max pass
    for y in 0..h {
        let row_offset = y * w;
        for x in 0..w {
            let start = if x > radius { x - radius } else { 0 };
            let end = (x + radius + 1).min(w);
            let mut max_r = 0.0f32;
            let mut max_g = 0.0f32;
            let mut max_b = 0.0f32;
            for k in start..end {
                let p = data[row_offset + k];
                if p[0] > max_r {
                    max_r = p[0];
                }
                if p[1] > max_g {
                    max_g = p[1];
                }
                if p[2] > max_b {
                    max_b = p[2];
                }
            }
            temp[row_offset + x] = [max_r, max_g, max_b];
        }
    }

    // Vertical max pass
    for x in 0..w {
        for y in 0..h {
            let start = if y > radius { y - radius } else { 0 };
            let end = (y + radius + 1).min(h);
            let mut max_r = 0.0f32;
            let mut max_g = 0.0f32;
            let mut max_b = 0.0f32;
            for k in start..end {
                let p = temp[k * w + x];
                if p[0] > max_r {
                    max_r = p[0];
                }
                if p[1] > max_g {
                    max_g = p[1];
                }
                if p[2] > max_b {
                    max_b = p[2];
                }
            }
            data[y * w + x] = [max_r, max_g, max_b];
        }
    }
}

/// Separable Box Blur on RGB channels to yield smooth continuous illumination surface
fn box_blur_rgb(data: &mut [[f32; 3]], width: u32, height: u32, radius: usize) {
    let w = width as usize;
    let h = height as usize;
    let mut temp = vec![[0.0f32; 3]; data.len()];

    // Horizontal pass
    for y in 0..h {
        let row_offset = y * w;
        for x in 0..w {
            let start = if x > radius { x - radius } else { 0 };
            let end = (x + radius + 1).min(w);
            let count = (end - start) as f32;
            let mut sum_r = 0.0f32;
            let mut sum_g = 0.0f32;
            let mut sum_b = 0.0f32;
            for k in start..end {
                let p = data[row_offset + k];
                sum_r += p[0];
                sum_g += p[1];
                sum_b += p[2];
            }
            temp[row_offset + x] = [sum_r / count, sum_g / count, sum_b / count];
        }
    }

    // Vertical pass
    for x in 0..w {
        for y in 0..h {
            let start = if y > radius { y - radius } else { 0 };
            let end = (y + radius + 1).min(h);
            let count = (end - start) as f32;
            let mut sum_r = 0.0f32;
            let mut sum_g = 0.0f32;
            let mut sum_b = 0.0f32;
            for k in start..end {
                let p = temp[k * w + x];
                sum_r += p[0];
                sum_g += p[1];
                sum_b += p[2];
            }
            data[y * w + x] = [sum_r / count, sum_g / count, sum_b / count];
        }
    }
}

/// Sample smoothed background map via bilinear interpolation
#[inline(always)]
fn sample_bg_rgb(bg: &[[f32; 3]], dw: u32, dh: u32, u: f32, v: f32) -> [f32; 3] {
    let x = (u * (dw as f32)).clamp(0.0, (dw - 1) as f32);
    let y = (v * (dh as f32)).clamp(0.0, (dh - 1) as f32);

    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let x1 = (x0 + 1).min(dw as usize - 1);
    let y1 = (y0 + 1).min(dh as usize - 1);

    let fx = x - x0 as f32;
    let fy = y - y0 as f32;

    let w00 = (1.0 - fx) * (1.0 - fy);
    let w10 = fx * (1.0 - fy);
    let w01 = (1.0 - fx) * fy;
    let w11 = fx * fy;

    let p00 = bg[y0 * dw as usize + x0];
    let p10 = bg[y0 * dw as usize + x1];
    let p01 = bg[y1 * dw as usize + x0];
    let p11 = bg[y1 * dw as usize + x1];

    [
        p00[0] * w00 + p10[0] * w10 + p01[0] * w01 + p11[0] * w11,
        p00[1] * w00 + p10[1] * w10 + p01[1] * w01 + p11[1] * w11,
        p00[2] * w00 + p10[2] * w10 + p01[2] * w01 + p11[2] * w11,
    ]
}

/// Apply scan filters:
/// mode = 0 (ORIGINAL): Keep color fidelity + contrast & brightness
/// mode = 1 (MAGIC COLOR - MÀU THẦN KỲ): Retinex Illumination Normalization (shadow removal, white paper, vivid red stamp & colors)
/// mode = 2 (MAGIC PRO - THẦN KỲ CHUYÊN NGHIỆP): CamScanner Pro engine (pure crisp white background, deep black ink, feather margin desk cleanup, vivid red seal)
/// mode = 3 (B&W DOCUMENT - TRẮNG ĐEN): Adaptive thresholding for crisp laser-quality black & white
pub fn apply_scan_filter(
    rgba: &[u8],
    width: u32,
    height: u32,
    mode: u8,
    contrast: f32,
    brightness: f32,
) -> Vec<u8> {
    let total_pixels = (width * height) as usize;
    let mut out = vec![255u8; total_pixels * 4];

    if rgba.len() < total_pixels * 4 || width == 0 || height == 0 {
        return out;
    }

    match mode {
        // ====================================================================
        // MODE 0: ORIGINAL (Pure color fidelity)
        // ====================================================================
        0 => {
            for i in 0..total_pixels {
                let idx = i * 4;
                let r = adjust_channel(rgba[idx], contrast, brightness);
                let g = adjust_channel(rgba[idx + 1], contrast, brightness);
                let b = adjust_channel(rgba[idx + 2], contrast, brightness);

                out[idx] = r;
                out[idx + 1] = g;
                out[idx + 2] = b;
                out[idx + 3] = 255;
            }
        }

        // ====================================================================
        // MODE 1: MÀU THẦN KỲ (CamScanner Magic Color)
        // Eliminates lighting casts and shadows via Retinex division,
        // whitens the paper smoothly, sharpens text, and preserves rich colors.
        // ====================================================================
        1 => {
            // 1. Estimate illumination surface via dilation + 2x box blur
            let (mut bg, dw, dh) = downscale_rgb(rgba, width, height, 240);
            max_filter_rgb(&mut bg, dw, dh, 8);
            box_blur_rgb(&mut bg, dw, dh, 10);
            box_blur_rgb(&mut bg, dw, dh, 10);

            // 2. Find 80th percentile paper reference luminance
            let mut lumas: Vec<f32> = bg
                .iter()
                .map(|p| 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])
                .collect();
            lumas.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let ref_paper = lumas
                .get((lumas.len() as f32 * 0.80) as usize)
                .copied()
                .unwrap_or(210.0)
                .clamp(150.0, 245.0);
            let min_bg_floor = (ref_paper * 0.55).max(40.0);

            // 3. Process each pixel with Retinex division + smooth tone curve
            for y in 0..height {
                let v = y as f32 / height as f32;
                for x in 0..width {
                    let u = x as f32 / width as f32;
                    let idx = ((y * width + x) * 4) as usize;

                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let b = rgba[idx + 2] as f32;

                    let bg_p = sample_bg_rgb(&bg, dw, dh, u, v);
                    let bg_r = bg_p[0].max(min_bg_floor);
                    let bg_g = bg_p[1].max(min_bg_floor);
                    let bg_b = bg_p[2].max(min_bg_floor);

                    // Retinex division: cancel lighting shadow & yellow cast
                    let mut r_div = (r / bg_r * 255.0).clamp(0.0, 255.0);
                    let mut g_div = (g / bg_g * 255.0).clamp(0.0, 255.0);
                    let mut b_div = (b / bg_b * 255.0).clamp(0.0, 255.0);

                    let luma = 0.299 * r_div + 0.587 * g_div + 0.114 * b_div;
                    let is_red_seal = r_div > (g_div + 15.0) && r_div > (b_div + 15.0);

                    if is_red_seal {
                        // Boost Vietnamese red seal brilliance
                        r_div = (r_div * 1.25).min(255.0);
                        g_div = (g_div * 0.82).min(255.0);
                        b_div = (b_div * 0.82).min(255.0);
                    } else if luma >= 200.0 {
                        // Paper background: smooth, uniform roll-off to pure white across the entire sheet
                        let f = ((luma - 200.0) / 45.0).clamp(0.0, 1.0);
                        let w_factor = f.powf(0.55);
                        r_div = (r_div + (255.0 - r_div) * w_factor).min(255.0);
                        g_div = (g_div + (255.0 - g_div) * w_factor).min(255.0);
                        b_div = (b_div + (255.0 - b_div) * w_factor).min(255.0);
                        if luma >= 225.0 {
                            r_div = 255.0;
                            g_div = 255.0;
                            b_div = 255.0;
                        }
                    } else if luma < 178.0 {
                        // Text & ink: deepen contrast so text is dark, bold and sharp
                        let d_factor = (luma / 178.0).powf(0.36);
                        r_div *= d_factor;
                        g_div *= d_factor;
                        b_div *= d_factor;
                    }

                    // Boost colorful stamps / emblems / signatures
                    let max_c = r_div.max(g_div).max(b_div);
                    let min_c = r_div.min(g_div).min(b_div);
                    let chroma = max_c - min_c;
                    if chroma > 18.0 && !is_red_seal {
                        let cur_l = 0.299 * r_div + 0.587 * g_div + 0.114 * b_div;
                        r_div = (cur_l + (r_div - cur_l) * 1.30).clamp(0.0, 255.0);
                        g_div = (cur_l + (g_div - cur_l) * 1.30).clamp(0.0, 255.0);
                        b_div = (cur_l + (b_div - cur_l) * 1.30).clamp(0.0, 255.0);
                    }

                    out[idx] = adjust_channel(r_div.round() as u8, contrast, brightness);
                    out[idx + 1] = adjust_channel(g_div.round() as u8, contrast, brightness);
                    out[idx + 2] = adjust_channel(b_div.round() as u8, contrast, brightness);
                    out[idx + 3] = 255;
                }
            }
        }

        // ====================================================================
        // MODE 2: THẦN KỲ CHUYÊN NGHIỆP (CamScanner Magic Pro)
        // Clean dazzling white paper, ultra-deep black ink, vivid red seal,
        // and smooth feather edge dissolution of desk/photocopy bleed.
        // ====================================================================
        2 => {
            // 1. Illumination estimation
            let (mut bg, dw, dh) = downscale_rgb(rgba, width, height, 240);
            max_filter_rgb(&mut bg, dw, dh, 10);
            box_blur_rgb(&mut bg, dw, dh, 12);
            box_blur_rgb(&mut bg, dw, dh, 12);

            let mut lumas: Vec<f32> = bg
                .iter()
                .map(|p| 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])
                .collect();
            lumas.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let ref_paper = lumas
                .get((lumas.len() as f32 * 0.85) as usize)
                .copied()
                .unwrap_or(215.0)
                .clamp(160.0, 245.0);
            let min_bg_floor = (ref_paper * 0.60).max(45.0);

            // Margin for outer edge feathering (dissolves desk edge without ugly boxes)
            let margin_x = ((width as f32) * 0.018).max(4.0);
            let margin_y = ((height as f32) * 0.018).max(4.0);

            for y in 0..height {
                let v = y as f32 / height as f32;
                let dist_y = (y as f32).min((height - 1 - y) as f32);

                for x in 0..width {
                    let u = x as f32 / width as f32;
                    let dist_x = (x as f32).min((width - 1 - x) as f32);
                    let idx = ((y * width + x) * 4) as usize;

                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let b = rgba[idx + 2] as f32;

                    let bg_p = sample_bg_rgb(&bg, dw, dh, u, v);
                    let bg_r = bg_p[0].max(min_bg_floor);
                    let bg_g = bg_p[1].max(min_bg_floor);
                    let bg_b = bg_p[2].max(min_bg_floor);

                    // Retinex normalization
                    let mut r_div = (r / bg_r * 255.0).clamp(0.0, 255.0);
                    let mut g_div = (g / bg_g * 255.0).clamp(0.0, 255.0);
                    let mut b_div = (b / bg_b * 255.0).clamp(0.0, 255.0);

                    let luma = 0.299 * r_div + 0.587 * g_div + 0.114 * b_div;
                    let is_red_seal = r_div > (g_div + 15.0) && r_div > (b_div + 15.0);

                    if is_red_seal {
                        // High-fidelity scarlet red seal enhancement
                        r_div = (r_div * 1.30).min(255.0);
                        g_div = (g_div * 0.78).min(255.0);
                        b_div = (b_div * 0.78).min(255.0);
                    } else if luma >= 195.0 {
                        // Professional pure paper white roll-off
                        let f = ((luma - 195.0) / 45.0).clamp(0.0, 1.0);
                        let w_factor = f.powf(0.55);
                        r_div = (r_div + (255.0 - r_div) * w_factor).min(255.0);
                        g_div = (g_div + (255.0 - g_div) * w_factor).min(255.0);
                        b_div = (b_div + (255.0 - b_div) * w_factor).min(255.0);
                        if luma >= 220.0 {
                            r_div = 255.0;
                            g_div = 255.0;
                            b_div = 255.0;
                        }
                    } else if luma < 178.0 {
                        // Deep black laser ink
                        let d_factor = (luma / 178.0).powf(0.40);
                        r_div *= d_factor;
                        g_div *= d_factor;
                        b_div *= d_factor;
                    }

                    // Feather border edges: softly dissolves any desk shadow or photocopy edge leak
                    if !is_red_seal {
                        let edge_dist = dist_x.min(dist_y);
                        let margin = margin_x.min(margin_y);
                        if edge_dist < margin && luma > 100.0 {
                            let blend = (edge_dist / margin).clamp(0.0, 1.0);
                            r_div = r_div * blend + 255.0 * (1.0 - blend);
                            g_div = g_div * blend + 255.0 * (1.0 - blend);
                            b_div = b_div * blend + 255.0 * (1.0 - blend);
                        }
                    }

                    out[idx] = adjust_channel(r_div.round() as u8, contrast, brightness);
                    out[idx + 1] = adjust_channel(g_div.round() as u8, contrast, brightness);
                    out[idx + 2] = adjust_channel(b_div.round() as u8, contrast, brightness);
                    out[idx + 3] = 255;
                }
            }
        }

        // ====================================================================
        // MODE 3: TRẮNG ĐEN (B&W Document with Adaptive Thresholding)
        // Crisp, high-readability black text on pure white paper
        // ====================================================================
        3 => {
            let mut gray = GrayImage::new(width, height);
            for y in 0..height {
                for x in 0..width {
                    let idx = ((y * width + x) * 4) as usize;
                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let b = rgba[idx + 2] as f32;
                    let luma = (0.299 * r + 0.587 * g + 0.114 * b).round() as u8;
                    gray.put_pixel(x, y, Luma([luma]));
                }
            }

            let radius = (width.min(height) / 28).clamp(8, 26);
            let bw = adaptive_threshold(&gray, radius);

            for y in 0..height {
                for x in 0..width {
                    let val = bw.get_pixel(x, y)[0];
                    let idx = ((y * width + x) * 4) as usize;
                    let final_val = adjust_channel(val, contrast, brightness);
                    out[idx] = final_val;
                    out[idx + 1] = final_val;
                    out[idx + 2] = final_val;
                    out[idx + 3] = 255;
                }
            }
        }

        _ => {}
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filters_output_length() {
        let w = 100u32;
        let h = 100u32;
        let rgba = vec![128u8; (w * h * 4) as usize];

        for mode in 0..=3 {
            let res = apply_scan_filter(&rgba, w, h, mode, 1.0, 0.0);
            assert_eq!(res.len(), (w * h * 4) as usize);
            assert_eq!(res[3], 255);
        }
    }

    #[test]
    fn test_magic_color_preserves_red_seal() {
        let w = 60u32;
        let h = 60u32;
        let mut rgba = vec![200u8; (w * h * 4) as usize]; // light paper

        // Put a red seal pixel in center
        let center_idx = ((30 * w + 30) * 4) as usize;
        rgba[center_idx] = 220; // R high
        rgba[center_idx + 1] = 50; // G low
        rgba[center_idx + 2] = 50; // B low

        let res = apply_scan_filter(&rgba, w, h, 1, 1.0, 0.0);
        let out_r = res[center_idx];
        let out_g = res[center_idx + 1];
        let out_b = res[center_idx + 2];

        // Red channel must remain dominant and vibrant
        assert!(out_r > out_g + 50);
        assert!(out_r > out_b + 50);
    }
}

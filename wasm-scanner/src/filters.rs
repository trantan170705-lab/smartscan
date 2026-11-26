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

/// Unified CamScanner-grade Retinex + Stain Eraser + Edge-Gated Unsharp + Despeckle engine
/// Used by Mode 1 (Magic Color) and Mode 2 (Magic Pro)
fn apply_retinex_enhancement(
    rgba: &[u8],
    width: u32,
    height: u32,
    contrast: f32,
    brightness: f32,
    max_rad: usize,
    blur_rad: usize,
    sharpen_amt: f32,
    ink_gamma: f32,
    red_boost: f32,
    red_attenuate: f32,
    feather_edges: bool,
    out: &mut [u8],
) {
    let w = width as usize;
    let h = height as usize;
    let total_pixels = w * h;

    // 1. Estimate local illumination surface tightly so curved paper shadows cancel completely
    let (mut bg, dw, dh) = downscale_rgb(rgba, width, height, 320);
    max_filter_rgb(&mut bg, dw, dh, max_rad);
    box_blur_rgb(&mut bg, dw, dh, blur_rad);
    box_blur_rgb(&mut bg, dw, dh, blur_rad);

    let mut bg_lumas: Vec<f32> = bg
        .iter()
        .map(|p| 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])
        .collect();
    bg_lumas.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let ref_paper = bg_lumas
        .get((bg_lumas.len() as f32 * 0.80) as usize)
        .copied()
        .unwrap_or(210.0)
        .clamp(150.0, 245.0);
    let min_bg_floor = (ref_paper * 0.58).max(42.0);

    // 2. Retinex division into intermediate RGB & luminance buffers
    let mut div_rgb = vec![[255.0f32; 3]; total_pixels];
    let mut div_luma = vec![255.0f32; total_pixels];
    for y in 0..h {
        let v = y as f32 / height as f32;
        let row_off = y * w;
        for x in 0..w {
            let u = x as f32 / width as f32;
            let i = row_off + x;
            let idx = i * 4;
            let bg_p = sample_bg_rgb(&bg, dw, dh, u, v);
            let r_d = (rgba[idx] as f32 / bg_p[0].max(min_bg_floor) * 255.0).clamp(0.0, 255.0);
            let g_d = (rgba[idx + 1] as f32 / bg_p[1].max(min_bg_floor) * 255.0).clamp(0.0, 255.0);
            let b_d = (rgba[idx + 2] as f32 / bg_p[2].max(min_bg_floor) * 255.0).clamp(0.0, 255.0);
            div_rgb[i] = [r_d, g_d, b_d];
            div_luma[i] = 0.299 * r_d + 0.587 * g_d + 0.114 * b_d;
        }
    }

    // 3. Edge-Gated 3x3 Unsharp Mask: sharpens ONLY dark ink strokes/lines (diff < -3.2),
    // NEVER amplifying JPEG block noise or gray paper grain!
    let mut sharp_temp = vec![255.0f32; total_pixels];
    for y in 0..h {
        let row_off = y * w;
        for x in 0..w {
            let l = div_luma[row_off + x.saturating_sub(1)];
            let c = div_luma[row_off + x];
            let r = div_luma[row_off + (x + 1).min(w - 1)];
            sharp_temp[row_off + x] = (l + c + r) / 3.0;
        }
    }
    let mut sharp_luma = vec![255.0f32; total_pixels];
    for y in 0..h {
        let y_prev = y.saturating_sub(1) * w;
        let y_curr = y * w;
        let y_next = (y + 1).min(h - 1) * w;
        for x in 0..w {
            let blur_l = (sharp_temp[y_prev + x] + sharp_temp[y_curr + x] + sharp_temp[y_next + x]) / 3.0;
            let orig_l = div_luma[y_curr + x];
            let diff_l = orig_l - blur_l;
            if orig_l < 238.0 && diff_l < -3.2 {
                sharp_luma[y_curr + x] = (orig_l + sharpen_amt * diff_l).clamp(0.0, 255.0);
            } else {
                sharp_luma[y_curr + x] = orig_l;
            }
        }
    }

    // 4.Separable 7x7 local peak luminance for Gray Stain Detection ("Xóa vết nám xám"):
    // Broad smooth stains have tiny local_drop (< 12.5), whereas 1px thin borders/text have local_drop >= 18!
    let r_loc = 3usize;
    let mut hi_temp = vec![0.0f32; total_pixels];
    let mut local_hi = vec![0.0f32; total_pixels];
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let s = x.saturating_sub(r_loc);
            let e = (x + r_loc + 1).min(w);
            let mut m = 0.0f32;
            for k in s..e {
                if div_luma[row + k] > m {
                    m = div_luma[row + k];
                }
            }
            hi_temp[row + x] = m;
        }
    }
    for x in 0..w {
        for y in 0..h {
            let s = y.saturating_sub(r_loc);
            let e = (y + r_loc + 1).min(h);
            let mut m = 0.0f32;
            for k in s..e {
                if hi_temp[k * w + x] > m {
                    m = hi_temp[k * w + x];
                }
            }
            local_hi[y * w + x] = m;
        }
    }

    // 5. Adaptive paper white floor & ink black anchor
    let step = (total_pixels / 4096).max(1);
    let mut sample_div: Vec<f32> = div_luma.iter().step_by(step).copied().collect();
    sample_div.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mut sample_sharp: Vec<f32> = sharp_luma.iter().step_by(step).copied().collect();
    sample_sharp.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n_samp = sample_div.len().max(1);
    let paper_med = sample_div[n_samp / 2];
    let p02 = sample_sharp[(n_samp as f32 * 0.015) as usize];

    let white_floor = (paper_med - 20.0).clamp(212.0, 234.0);
    let pure_white = (paper_med - 8.0).clamp(228.0, 244.0);
    let black_pt = (p02 - 12.0).clamp(20.0, 118.0);

    let margin_x = ((width as f32) * 0.035).max(6.0);
    let margin_y = ((height as f32) * 0.020).max(5.0);

    // Track protected colored pixels so 5x5 gray-stain despeckle never touches seals/stamps
    let mut is_colored = vec![false; total_pixels];

    // 6. Tone mapping, gray stain removal & crisp color preservation
    for y in 0..h {
        let dist_y = (y as f32).min((h - 1 - y) as f32);
        let row_off = y * w;
        for x in 0..w {
            let dist_x = (x as f32).min((w - 1 - x) as f32);
            let i = row_off + x;
            let idx = i * 4;

            let orig_l = div_luma[i].max(1.0);
            let base_r = div_rgb[i][0];
            let base_g = div_rgb[i][1];
            let base_b = div_rgb[i][2];
            let is_red_seal = base_r > (base_g + 15.0) && base_r > (base_b + 15.0);
            let max_b0 = base_r.max(base_g).max(base_b);
            let min_b0 = base_r.min(base_g).min(base_b);
            let has_chroma = (max_b0 - min_b0) > 22.0;

            if is_red_seal || has_chroma {
                is_colored[i] = true;
            }

            let target_sharp_l = sharp_luma[i];
            let local_drop = local_hi[i] - target_sharp_l;
            let is_gray_stain = !is_red_seal && !has_chroma && div_luma[i] >= 168.0 && local_drop < 12.5;

            let (mut r_div, mut g_div, mut b_div) = if is_red_seal {
                (
                    (base_r * red_boost).min(255.0),
                    (base_g * red_attenuate).min(255.0),
                    (base_b * red_attenuate).min(255.0),
                )
            } else if is_gray_stain || target_sharp_l >= pure_white {
                (255.0, 255.0, 255.0)
            } else {
                let l_ratio = (target_sharp_l / orig_l).clamp(0.30, 1.30);
                let mut r_s = (base_r * l_ratio).clamp(0.0, 255.0);
                let mut g_s = (base_g * l_ratio).clamp(0.0, 255.0);
                let mut b_s = (base_b * l_ratio).clamp(0.0, 255.0);

                if target_sharp_l >= white_floor {
                    let f = ((target_sharp_l - white_floor) / (pure_white - white_floor).max(1.0)).clamp(0.0, 1.0);
                    let w_factor = f.powf(0.80);
                    r_s = (r_s + (255.0 - r_s) * w_factor).min(255.0);
                    g_s = (g_s + (255.0 - g_s) * w_factor).min(255.0);
                    b_s = (b_s + (255.0 - b_s) * w_factor).min(255.0);
                } else {
                    let t_ink = ((target_sharp_l - black_pt) / (white_floor - black_pt).max(1.0)).clamp(0.0, 1.0);
                    let new_luma = t_ink.powf(ink_gamma) * 206.0;
                    let s = if target_sharp_l > 1.0 { new_luma / target_sharp_l } else { 0.0 };
                    r_s = (r_s * s).clamp(0.0, 255.0);
                    g_s = (g_s * s).clamp(0.0, 255.0);
                    b_s = (b_s * s).clamp(0.0, 255.0);
                }
                (r_s, g_s, b_s)
            };

            if has_chroma && !is_red_seal {
                let cur_l = 0.299 * r_div + 0.587 * g_div + 0.114 * b_div;
                r_div = (cur_l + (r_div - cur_l) * 1.28).clamp(0.0, 255.0);
                g_div = (cur_l + (g_div - cur_l) * 1.28).clamp(0.0, 255.0);
                b_div = (cur_l + (b_div - cur_l) * 1.28).clamp(0.0, 255.0);
            }

            if feather_edges && !is_red_seal {
                let edge_dist = (dist_x / margin_x).min(dist_y / margin_y);
                let cur_l = 0.299 * r_div + 0.587 * g_div + 0.114 * b_div;
                if edge_dist < 1.0 && cur_l > 140.0 {
                    let blend = edge_dist.clamp(0.0, 1.0);
                    let bs = blend * blend * (3.0 - 2.0 * blend);
                    r_div = r_div * bs + 255.0 * (1.0 - bs);
                    g_div = g_div * bs + 255.0 * (1.0 - bs);
                    b_div = b_div * bs + 255.0 * (1.0 - bs);
                }
            }

            out[idx] = r_div.round() as u8;
            out[idx + 1] = g_div.round() as u8;
            out[idx + 2] = b_div.round() as u8;
            out[idx + 3] = 255;
        }
    }

    // 7. 5x5 Gray-Speckle & Residual Stain Cleaner (preserves all anti-aliased strokes adjacent to <= 165 ink!)
    let mut out_luma = vec![255u8; total_pixels];
    for i in 0..total_pixels {
        let idx = i * 4;
        out_luma[i] = ((0.299 * out[idx] as f32
            + 0.587 * out[idx + 1] as f32
            + 0.114 * out[idx + 2] as f32)
            .round()) as u8;
    }

    let mut min_h_buf = vec![255u8; total_pixels];
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let s = x.saturating_sub(2);
            let e = (x + 3).min(w);
            let mut m = 255u8;
            for k in s..e {
                if out_luma[row + k] < m {
                    m = out_luma[row + k];
                }
            }
            min_h_buf[row + x] = m;
        }
    }

    for y in 0..h {
        let s_y = y.saturating_sub(2);
        let e_y = (y + 3).min(h);
        let row = y * w;
        for x in 0..w {
            let i = row + x;
            let idx = i * 4;
            if !is_colored[i] && out_luma[i] > 172 {
                let mut min5 = 255u8;
                for ky in s_y..e_y {
                    let v = min_h_buf[ky * w + x];
                    if v < min5 {
                        min5 = v;
                    }
                }
                if min5 > 162 {
                    out[idx] = 255;
                    out[idx + 1] = 255;
                    out[idx + 2] = 255;
                }
            }
            out[idx] = adjust_channel(out[idx], contrast, brightness);
            out[idx + 1] = adjust_channel(out[idx + 1], contrast, brightness);
            out[idx + 2] = adjust_channel(out[idx + 2], contrast, brightness);
        }
    }
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
        // Eliminates lighting casts and shadows via Retinex + crisp Unsharp Mask,
        // keeps pure #FFFFFF paper, bolds ink strokes, preserves red stamps.
        // ====================================================================
        1 => {
            apply_retinex_enhancement(
                rgba, width, height, contrast, brightness,
                4, 5, 1.10, 1.32, 1.25, 0.82, true, &mut out,
            );
        }

        // ====================================================================
        // MODE 2: THẦN KỲ CHUYÊN NGHIỆP (CamScanner Magic Pro)
        // Dazzling uniform #FFFFFF paper, ultra-deep laser black ink, vivid red seal,
        // and smooth feather edge dissolution of desk/photocopy bleed.
        // ====================================================================
        2 => {
            apply_retinex_enhancement(
                rgba, width, height, contrast, brightness,
                5, 6, 1.25, 1.42, 1.30, 0.78, true, &mut out,
            );
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

    #[test]
    fn test_gray_stain_removed_while_thin_border_preserved() {
        let w = 120u32;
        let h = 120u32;
        // Clean paper at 215
        let mut rgba = vec![215u8; (w * h * 4) as usize];
        for i in 0..(w * h) as usize {
            rgba[i * 4 + 3] = 255;
        }
        // Add a broad gray stain band (width 18px, luma 188) on the left x=12..30
        for y in 15..105 {
            for x in 12..30 {
                let idx = ((y * w + x) * 4) as usize;
                rgba[idx] = 188;
                rgba[idx + 1] = 188;
                rgba[idx + 2] = 188;
            }
        }
        // Add a thin 1px horizontal box border at y=50, x=45..95 (luma 165)
        for x in 45..95 {
            let idx = ((50 * w + x) * 4) as usize;
            rgba[idx] = 165;
            rgba[idx + 1] = 165;
            rgba[idx + 2] = 165;
        }

        let res = apply_scan_filter(&rgba, w, h, 1, 1.0, 0.0);
        // Stain interior at (20, 60) must be completely whitened to 255
        let stain_idx = ((60 * w + 20) * 4) as usize;
        assert_eq!(res[stain_idx], 255, "Expected gray stain to be erased to 255, got {}", res[stain_idx]);

        // Thin 1px border at (70, 50) must be preserved and darkened
        let line_idx = ((50 * w + 70) * 4) as usize;
        assert!(res[line_idx] < 140, "Expected thin 1px border to be preserved dark, got {}", res[line_idx]);
    }
}

use image::RgbaImage;
use imageproc::geometric_transformations::Projection;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PointF {
    pub x: f32,
    pub y: f32,
}

fn dist(p1: PointF, p2: PointF) -> f32 {
    ((p1.x - p2.x).powi(2) + (p1.y - p2.y).powi(2)).sqrt()
}

/// Catmull-Rom 4-tap bicubic interpolation weights for t in [0, 1)
#[inline(always)]
fn cubic_weights(t: f32) -> [f32; 4] {
    let t2 = t * t;
    let t3 = t2 * t;
    [
        -0.5 * t + t2 - 0.5 * t3,
        1.0 - 2.5 * t2 + 1.5 * t3,
        0.5 * t + 2.0 * t2 - 1.5 * t3,
        -0.5 * t2 + 0.5 * t3,
    ]
}

/// Sample RGBA image with clamped-border Catmull-Rom bicubic interpolation
#[inline(always)]
fn sample_bicubic_clamped(rgba: &[u8], width: i32, height: i32, sx: f32, sy: f32) -> [u8; 4] {
    let x_floor = sx.floor();
    let y_floor = sy.floor();
    let fx = sx - x_floor;
    let fy = sy - y_floor;
    let xi = x_floor as i32;
    let yi = y_floor as i32;

    let wx = cubic_weights(fx);
    let wy = cubic_weights(fy);

    let mut acc = [0.0f32; 3];
    let w_stride = width as usize;

    for j in 0..4 {
        let py = (yi - 1 + j as i32).clamp(0, height - 1) as usize;
        let row_off = py * w_stride;
        let wj = wy[j];
        for i in 0..4 {
            let px = (xi - 1 + i as i32).clamp(0, width - 1) as usize;
            let idx = (row_off + px) * 4;
            let w = wj * wx[i];
            acc[0] += rgba[idx] as f32 * w;
            acc[1] += rgba[idx + 1] as f32 * w;
            acc[2] += rgba[idx + 2] as f32 * w;
        }
    }

    [
        acc[0].clamp(0.0, 255.0).round() as u8,
        acc[1].clamp(0.0, 255.0).round() as u8,
        acc[2].clamp(0.0, 255.0).round() as u8,
        255,
    ]
}

/// Fast bilinear clamped sample (used only for fast geometry pre-pass)
#[inline(always)]
fn sample_bilinear_luma(rgba: &[u8], width: i32, height: i32, sx: f32, sy: f32) -> u8 {
    let cx = sx.clamp(0.0, (width - 1) as f32);
    let cy = sy.clamp(0.0, (height - 1) as f32);
    let x0 = cx.floor() as i32;
    let y0 = cy.floor() as i32;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);
    let fx = cx - x0 as f32;
    let fy = cy - y0 as f32;

    let luma_at = |x: i32, y: i32| -> f32 {
        let idx = ((y as usize) * (width as usize) + (x as usize)) * 4;
        0.299 * rgba[idx] as f32 + 0.587 * rgba[idx + 1] as f32 + 0.114 * rgba[idx + 2] as f32
    };

    let v = luma_at(x0, y0) * (1.0 - fx) * (1.0 - fy)
        + luma_at(x1, y0) * fx * (1.0 - fy)
        + luma_at(x0, y1) * (1.0 - fx) * fy
        + luma_at(x1, y1) * fx * fy;
    v.round() as u8
}

/// Recover true 3D rectangle W/H aspect ratio from 4 projected corner points
/// using Zhang's focal-length orthogonality constraint around image center.
fn estimate_aspect_ratio_3d(pts: &[PointF; 4], img_w: u32, img_h: u32) -> Option<f32> {
    let cx = img_w as f64 / 2.0;
    let cy = img_h as f64 / 2.0;

    let m1 = [pts[0].x as f64 - cx, pts[0].y as f64 - cy, 1.0];
    let m2 = [pts[1].x as f64 - cx, pts[1].y as f64 - cy, 1.0];
    let m3 = [pts[3].x as f64 - cx, pts[3].y as f64 - cy, 1.0];
    let m4 = [pts[2].x as f64 - cx, pts[2].y as f64 - cy, 1.0];

    let cross = |a: [f64; 3], b: [f64; 3]| -> [f64; 3] {
        [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ]
    };
    let dot = |a: [f64; 3], b: [f64; 3]| -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] };

    let c14 = cross(m1, m4);
    let denom2 = dot(cross(m2, m4), m3);
    let denom3 = dot(cross(m3, m4), m2);
    if denom2.abs() < 1e-6 || denom3.abs() < 1e-6 {
        return None;
    }

    let k2 = dot(c14, m3) / denom2;
    let k3 = dot(c14, m2) / denom3;

    let n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    let n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

    let n_z_prod = n2[2] * n3[2];
    if n_z_prod.abs() < 1e-7 {
        return None;
    }

    let f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / n_z_prod;
    if !f2.is_finite() || f2 <= 100.0 {
        return None;
    }

    let num = n2[0] * n2[0] + n2[1] * n2[1] + f2 * n2[2] * n2[2];
    let den = n3[0] * n3[0] + n3[1] * n3[1] + f2 * n3[2] * n3[2];
    if den <= 1e-9 || num <= 1e-9 {
        return None;
    }

    let ar = (num / den).sqrt() as f32;
    if (0.45..=2.20).contains(&ar) {
        Some(ar)
    } else {
        None
    }
}

/// Normalize illumination on a grayscale grid via separable dilation + box blur
fn normalize_gray_grid(gray: &[u8], w: usize, h: usize) -> Vec<f32> {
    let r_dil = 5usize;
    let mut temp = vec![0u8; gray.len()];
    let mut bg = vec![0u8; gray.len()];

    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let s = x.saturating_sub(r_dil);
            let e = (x + r_dil + 1).min(w);
            let mut m = 0u8;
            for k in s..e {
                if gray[row + k] > m {
                    m = gray[row + k];
                }
            }
            temp[row + x] = m;
        }
    }
    for x in 0..w {
        for y in 0..h {
            let s = y.saturating_sub(r_dil);
            let e = (y + r_dil + 1).min(h);
            let mut m = 0u8;
            for k in s..e {
                let v = temp[k * w + x];
                if v > m {
                    m = v;
                }
            }
            bg[y * w + x] = m;
        }
    }

    let r_blur = 8usize;
    let mut temp_f = vec![0.0f32; gray.len()];
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let s = x.saturating_sub(r_blur);
            let e = (x + r_blur + 1).min(w);
            let mut sum = 0.0f32;
            for k in s..e {
                sum += bg[row + k] as f32;
            }
            temp_f[row + x] = sum / (e - s) as f32;
        }
    }
    let mut norm = vec![255.0f32; gray.len()];
    for x in 0..w {
        for y in 0..h {
            let s = y.saturating_sub(r_blur);
            let e = (y + r_blur + 1).min(h);
            let mut sum = 0.0f32;
            for k in s..e {
                sum += temp_f[k * w + x];
            }
            let bg_val = (sum / (e - s) as f32).max(40.0);
            norm[y * w + x] = ((gray[y * w + x] as f32 / bg_val) * 255.0).clamp(0.0, 255.0);
        }
    }
    norm
}

/// Fit horizontal baseline tilt `b` (px at edge u=±1) and parabolic bow `a` (px at u^2 - 1/3)
/// inside vertical band [y0..y1] using sub-pixel histogram splatting and squared-derivative sharpness.
fn fit_band_parabola_subpixel(
    gy: &[f32],
    w: usize,
    y0: usize,
    y1: usize,
) -> (f32, f32, f32) {
    if w < 40 || y1 <= y0 + 12 {
        return (0.0, 0.0, 1.0);
    }
    let x_start = ((w as f32) * 0.07) as usize;
    let x_end = ((w as f32) * 0.93) as usize;
    let sh = y1 - y0;
    let half_w = w as f32 / 2.0;

    // Precompute (u, u2, rel_y, weight) for active horizontal-line edge pixels
    let mut samples: Vec<(f32, f32, f32, f32)> = Vec::new();
    for y in y0..y1 {
        let row = y * w;
        let ry_base = (y - y0) as f32;
        for x in x_start..x_end {
            let wt = gy[row + x];
            if wt > 4.0 {
                let u = (x as f32 - half_w) / half_w;
                samples.push((u, u * u - 1.0 / 3.0, ry_base, wt));
            }
        }
    }

    if samples.len() < ((x_end - x_start) * sh / 160).max(24) {
        return (0.0, 0.0, 1.0);
    }

    let mut hist = vec![0.0f32; sh];
    let mut eval = |b: f32, a: f32| -> f32 {
        hist.fill(0.0);
        let max_bin = (sh - 2) as i32;
        for &(u, u2, ry_base, wt) in &samples {
            let ry = ry_base - (b * u + a * u2);
            let bin = ry.floor() as i32;
            if bin >= 0 && bin <= max_bin {
                let fy = ry - bin as f32;
                let idx = bin as usize;
                hist[idx] += wt * (1.0 - fy);
                hist[idx + 1] += wt * fy;
            }
        }
        let mut energy = 0.0f32;
        for i in 0..(sh - 1) {
            let d = hist[i + 1] - hist[i];
            energy += d * d;
        }
        energy
    };

    let s_zero = eval(0.0, 0.0).max(1.0);
    let max_b = (half_w * 7.5f32.to_radians().tan()).max(12.0);
    let max_a = (w as f32 * 0.018).clamp(4.0, 9.0);

    let mut best_b = 0.0f32;
    let mut best_a = 0.0f32;
    let mut best_s = s_zero;

    // 1) High-resolution sub-pixel inner sweep (0.5px step in [-12..12] catches 1px thin borders!)
    let inner_b = 12.0f32.min(max_b);
    for ib in -24..=24 {
        let b = (ib as f32) * (inner_b / 24.0);
        for ia in -12..=12 {
            let a = (ia as f32) * (max_a / 12.0);
            let s = eval(b, a);
            if s > best_s {
                best_s = s;
                best_b = b;
                best_a = a;
            }
        }
    }

    // 2) Wide tilt sweep for heavily skewed scans (> 3 deg)
    if max_b > 12.5 {
        for ib in -36..=36 {
            let b = (ib as f32 / 36.0) * max_b;
            if b.abs() <= 11.5 {
                continue;
            }
            for ia in -6..=6 {
                let a = (ia as f32 / 6.0) * max_a;
                let s = eval(b, a);
                if s > best_s {
                    best_s = s;
                    best_b = b;
                    best_a = a;
                }
            }
        }
    }

    // 3) Ultra-fine 0.1px polish around peak
    let center_b = best_b;
    let center_a = best_a;
    for ib in -6..=6 {
        let b = center_b + (ib as f32) * 0.10;
        for ia in -6..=6 {
            let a = center_a + (ia as f32) * 0.10;
            let s = eval(b, a);
            if s > best_s {
                best_s = s;
                best_b = b;
                best_a = a;
            }
        }
    }

    // Prefer pure tilt (a=0) only if bow adds negligible (< 0.4%) sharpness
    let mut best_pure_tilt_s = s_zero;
    let mut best_pure_b = 0.0f32;
    for ib in -10..=10 {
        let b = best_b + (ib as f32) * 0.15;
        let s = eval(b, 0.0);
        if s > best_pure_tilt_s {
            best_pure_tilt_s = s;
            best_pure_b = b;
        }
    }
    if best_s < best_pure_tilt_s * 1.004 {
        best_b = best_pure_b;
        best_a = 0.0;
        best_s = best_pure_tilt_s;
    }

    let gain = best_s / s_zero;
    if gain < 1.010 {
        (0.0, 0.0, 1.0)
    } else {
        (best_b, best_a, gain)
    }
}

/// Measure horizontal text baseline tilt angle (in degrees) across the full image
pub fn estimate_text_tilt_angle(rgba: &[u8], width: u32, height: u32) -> f32 {
    if width < 50 || height < 50 {
        return 0.0;
    }
    let th = 420u32.min(height);
    let scale = height as f32 / th as f32;
    let tw = ((width as f32) / scale).round().max(10.0) as u32;
    let mut gray = vec![0u8; (tw * th) as usize];
    for y in 0..th {
        let sy = (y as f32) * scale;
        for x in 0..tw {
            let sx = (x as f32) * scale;
            gray[(y * tw + x) as usize] = sample_bilinear_luma(rgba, width as i32, height as i32, sx, sy);
        }
    }
    let norm = normalize_gray_grid(&gray, tw as usize, th as usize);
    let w = tw as usize;
    let h = th as usize;
    let mut gy = vec![0.0f32; w * h];
    for y in 1..(h - 1) {
        for x in 0..w {
            gy[y * w + x] = ((norm[(y + 1) * w + x] - norm[(y - 1) * w + x]).abs() - 10.0).max(0.0);
        }
    }
    let (b, _, _) = fit_band_parabola_subpixel(&gy, w, (h as f32 * 0.08) as usize, (h as f32 * 0.92) as usize);
    // b is dy at u=+1 over dx = tw/2 -> angle = atan(b / (tw/2))
    (b / (tw as f32 / 2.0)).atan().to_degrees()
}

/// Fit vertical column / left-margin curve x_shift(v) = s1 * v + s2 * (v^2 - 1/3) in grid pixels.
/// Returns Option<(s1, s2)> when confident left-aligned body margin or vertical column edges exist.
fn fit_vertical_margin_curve(norm: &[f32], w: usize, h: usize) -> Option<(f32, f32)> {
    if w < 60 || h < 60 {
        return None;
    }

    // Light 3x3 smoothing so thin strokes on downscaled grid form solid words
    let mut blur = vec![255.0f32; w * h];
    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let mut s = 0.0f32;
            for dy in 0..3 {
                for dx in 0..3 {
                    s += norm[(y + dy - 1) * w + (x + dx - 1)];
                }
            }
            blur[y * w + x] = s / 9.0;
        }
    }

    let x_min = ((w as f32) * 0.07) as usize;
    let x_max = ((w as f32) * 0.48) as usize;
    let y_start = ((h as f32) * 0.12) as usize;
    let y_end = ((h as f32) * 0.90) as usize;

    let mut left_pts: Vec<(f32, f32)> = Vec::new();
    for y in (y_start..y_end).step_by(3) {
        let y_hi = (y + 5).min(h);
        let mut dark_cols = 0usize;
        let mut run = 0usize;
        let mut found_x: Option<usize> = None;
        for x in x_min..x_max {
            let mut col_dark = false;
            for yy in y..y_hi {
                if blur[yy * w + x] < 212.0 {
                    col_dark = true;
                    break;
                }
            }
            if col_dark {
                dark_cols += 1;
                run += 1;
                if found_x.is_none() && run >= 3 {
                    found_x = Some(x - 2);
                }
            } else {
                run = 0;
            }
        }
        if dark_cols >= 7 {
            if let Some(fx) = found_x {
                left_pts.push((y as f32 + 2.0, fx as f32));
            }
        }
    }

    if left_pts.len() >= 12 {
        let mut best_inliers: Vec<usize> = Vec::new();
        for i in 0..left_pts.len() {
            for j in (i + 1)..left_pts.len() {
                let dy = left_pts[j].0 - left_pts[i].0;
                if dy.abs() < (h as f32) * 0.25 {
                    continue;
                }
                let sl = (left_pts[j].1 - left_pts[i].1) / dy;
                if sl.abs() > 0.15 {
                    continue;
                }
                let ic = left_pts[i].1 - sl * left_pts[i].0;
                let inl: Vec<usize> = left_pts
                    .iter()
                    .enumerate()
                    .filter(|(_, p)| (p.1 - (sl * p.0 + ic)).abs() <= 2.6)
                    .map(|(idx, _)| idx)
                    .collect();
                if inl.len() > best_inliers.len() {
                    best_inliers = inl;
                }
            }
        }

        let ratio = best_inliers.len() as f32 / left_pts.len() as f32;
        if best_inliers.len() >= 12 && ratio >= 0.42 {
            // Solve 3x3 normal equations for x(v) = c0 + s1 * v + s2 * v^2 on inliers
            let half_h = h as f32 / 2.0;
            let mut ata = [[0.0f64; 3]; 3];
            let mut atb = [0.0f64; 3];
            for &idx in &best_inliers {
                let v = ((left_pts[idx].0 - half_h) / half_h) as f64;
                let x = left_pts[idx].1 as f64;
                let basis = [1.0, v, v * v];
                for r in 0..3 {
                    atb[r] += basis[r] * x;
                    for c in 0..3 {
                        ata[r][c] += basis[r] * basis[c];
                    }
                }
            }
            // Small ridge regularization on s2 (ata[2][2]) prevents curve overfitting on short spans
            ata[2][2] += 1.5;
            if let Some(sol) = solve_3x3(ata, atb) {
                let s1 = sol[1] as f32;
                let max_s2 = (w as f32 * 0.015).clamp(2.5, 6.5);
                let s2 = (sol[2] as f32).clamp(-max_s2, max_s2);
                let max_s1 = (h as f32 / 2.0) * 7.5f32.to_radians().tan();
                if s1.abs() <= max_s1 {
                    return Some((s1, s2));
                }
            }
        }
    }

    None
}

fn solve_3x3(mut a: [[f64; 3]; 3], mut b: [f64; 3]) -> Option<[f64; 3]> {
    for i in 0..3 {
        let mut pivot = i;
        for r in (i + 1)..3 {
            if a[r][i].abs() > a[pivot][i].abs() {
                pivot = r;
            }
        }
        if a[pivot][i].abs() < 1e-9 {
            return None;
        }
        a.swap(i, pivot);
        b.swap(i, pivot);
        let div = a[i][i];
        for c in i..3 {
            a[i][c] /= div;
        }
        b[i] /= div;
        for r in 0..3 {
            if r != i {
                let factor = a[r][i];
                for c in i..3 {
                    a[r][c] -= factor * a[i][c];
                }
                b[r] -= factor * b[i];
            }
        }
    }
    Some(b)
}

#[inline(always)]
fn interp3(v: f32, v0: f32, v1: f32, v2: f32, y0: f32, y1: f32, y2: f32) -> f32 {
    if v <= v0 {
        y0
    } else if v <= v1 {
        let t = (v - v0) / (v1 - v0);
        y0 + t * (y1 - y0)
    } else if v <= v2 {
        let t = (v - v1) / (v2 - v1);
        y1 + t * (y2 - y1)
    } else {
        y2
    }
}

/// Single-pass perspective warp + 2D polynomial dewarping + seamless margin cleanup & centering
pub fn warp_perspective_core(
    rgba: &[u8],
    width: u32,
    height: u32,
    quad: &[f32],
) -> Result<(Vec<u8>, u32, u32), String> {
    if quad.len() < 8 {
        return Err("Quad must contain at least 8 numbers [TL, TR, BR, BL]".to_string());
    }
    if rgba.len() < (width * height * 4) as usize {
        return Err("Invalid buffer length for width and height".to_string());
    }

    let tl = PointF { x: quad[0], y: quad[1] };
    let tr = PointF { x: quad[2], y: quad[3] };
    let br = PointF { x: quad[4], y: quad[5] };
    let bl = PointF { x: quad[6], y: quad[7] };

    // 1. Target dimensions with 3D perspective aspect ratio recovery
    let w_top = dist(tl, tr);
    let w_bot = dist(bl, br);
    let out_w = (w_top.max(w_bot).round() as u32).clamp(16, 4000);

    let h_left = dist(tl, bl);
    let h_right = dist(tr, br);
    let h_raw = h_left.max(h_right);

    let is_full_frame = (tl.x.abs() < 1.0 && tl.y.abs() < 1.0)
        && ((tr.x - width as f32).abs() < 1.0 && tr.y.abs() < 1.0)
        && ((br.x - width as f32).abs() < 1.0 && (br.y - height as f32).abs() < 1.0)
        && (bl.x.abs() < 1.0 && (bl.y - height as f32).abs() < 1.0);

    let out_h = if is_full_frame {
        height.clamp(16, 4000)
    } else if let Some(ar) = estimate_aspect_ratio_3d(&[tl, tr, br, bl], width, height) {
        let h_est = (out_w as f32) / ar;
        if h_est >= h_raw * 0.68 && h_est <= h_raw * 1.48 {
            (h_est.round() as u32).clamp(16, 4000)
        } else {
            (h_raw.round() as u32).clamp(16, 4000)
        }
    } else {
        (h_raw.round() as u32).clamp(16, 4000)
    };

    // Inverse homography mapping rectified quad coords (0..out_w, 0..out_h) -> source photo (x, y)
    let src_pts: [(f32, f32); 4] = [(tl.x, tl.y), (tr.x, tr.y), (br.x, br.y), (bl.x, bl.y)];
    let dest_pts: [(f32, f32); 4] = [
        (0.0, 0.0),
        (out_w as f32, 0.0),
        (out_w as f32, out_h as f32),
        (0.0, out_h as f32),
    ];
    let inv_proj = Projection::from_control_points(dest_pts, src_pts)
        .ok_or_else(|| "Failed to calculate inverse perspective projection matrix".to_string())?;

    // 2. Build pre-warped grayscale grid (~620px height) for crisp sub-pixel curve & margin analysis
    let eval_h = 620u32.min(out_h).max(16);
    let scale_y = out_h as f32 / eval_h as f32;
    let eval_w = ((out_w as f32) / scale_y).round().max(16.0) as u32;
    let scale_x = out_w as f32 / eval_w as f32;

    let mut pre_gray = vec![255u8; (eval_w * eval_h) as usize];
    for y in 0..eval_h {
        let qy = (y as f32) * scale_y;
        let row = (y * eval_w) as usize;
        for x in 0..eval_w {
            let qx = (x as f32) * scale_x;
            let (sx, sy) = inv_proj * (qx, qy);
            pre_gray[row + x as usize] = sample_bilinear_luma(rgba, width as i32, height as i32, sx, sy);
        }
    }

    let ew = eval_w as usize;
    let eh = eval_h as usize;
    let norm = normalize_gray_grid(&pre_gray, ew, eh);

    let mut gy = vec![0.0f32; ew * eh];
    for y in 1..(eh - 1) {
        for x in 0..ew {
            gy[y * ew + x] = ((norm[(y + 1) * ew + x] - norm[(y - 1) * ew + x]).abs() - 10.0).max(0.0);
        }
    }

    let (b_all_s, a_all_s, _) = fit_band_parabola_subpixel(&gy, ew, (eh as f32 * 0.08) as usize, (eh as f32 * 0.92) as usize);
    let (b_top_s, a_top_s, g_top) = fit_band_parabola_subpixel(&gy, ew, (eh as f32 * 0.08) as usize, (eh as f32 * 0.36) as usize);
    let (b_mid_s, a_mid_s, g_mid) = fit_band_parabola_subpixel(&gy, ew, (eh as f32 * 0.34) as usize, (eh as f32 * 0.66) as usize);
    let (b_bot_s, a_bot_s, g_bot) = fit_band_parabola_subpixel(&gy, ew, (eh as f32 * 0.62) as usize, (eh as f32 * 0.92) as usize);

    // Scale vertical curve parameters from eval_h to full out_h
    let use_bands = g_top >= 1.010 || g_mid >= 1.010 || g_bot >= 1.010;
    let (b_top, a_top, b_mid, a_mid, b_bot, a_bot) = if use_bands {
        (
            b_top_s * scale_y,
            a_top_s * scale_y,
            b_mid_s * scale_y,
            a_mid_s * scale_y,
            b_bot_s * scale_y,
            a_bot_s * scale_y,
        )
    } else {
        let bf = b_all_s * scale_y;
        let af = a_all_s * scale_y;
        (bf, af, bf, af, bf, af)
    };

    // Vertical margin quadratic fit (or orthogonal rigid-rotation fallback when no left paragraph margin)
    let (s1, s2) = if let Some((s1_s, s2_s)) = fit_vertical_margin_curve(&norm, ew, eh) {
        (s1_s * scale_x, s2_s * scale_x)
    } else {
        // Rigid rotation coupling: if horizontal lines tilt by b_mid over out_w/2, x shifts by -b_mid * (out_h / out_w)
        let rigid_s1 = -b_mid * (out_h as f32 / out_w.max(1) as f32);
        (rigid_s1, 0.0)
    };

    let negligible_dewarp = b_top.abs() < 0.35
        && b_mid.abs() < 0.35
        && b_bot.abs() < 0.35
        && a_top.abs() < 0.45
        && a_mid.abs() < 0.45
        && a_bot.abs() < 0.45
        && s1.abs() < 0.60
        && s2.abs() < 0.50;

    // Fast lossless return if already full-frame and completely straight
    if is_full_frame && negligible_dewarp && out_w == width && out_h == height {
        return Ok((rgba.to_vec(), out_w, out_h));
    }

    // 3. Single-Pass Composed Sampling (Output -> Dewarp Grid -> Inverse Homography -> Bicubic Raw Sample)
    let mut out_buf = vec![255u8; (out_w * out_h * 4) as usize];
    let mut inside_mask = vec![true; (out_w * out_h) as usize];
    let half_w = out_w as f32 / 2.0;
    let half_h = out_h as f32 / 2.0;

    // Exclude outer curved edge band of physical paper quad (~1.6% inset) where desk/under-paper sleeve leaks in
    let inset_x = if is_full_frame { 0.0 } else { (out_w as f32 * 0.016).clamp(4.0, 14.0) };
    let inset_y = if is_full_frame { 0.0 } else { (out_h as f32 * 0.008).clamp(2.0, 10.0) };

    for y in 0..out_h {
        let v = (y as f32 - half_h) / half_h;
        let dx_v = s1 * v + s2 * (v * v - 1.0 / 3.0);
        let b_v = interp3(v, -0.56, 0.0, 0.54, b_top, b_mid, b_bot);
        let a_v = interp3(v, -0.56, 0.0, 0.54, a_top, a_mid, a_bot);
        let row_off = (y * out_w) as usize;

        for x in 0..out_w {
            let u = (x as f32 - half_w) / half_w;
            let px = x as f32 + dx_v;
            let py = y as f32 + (b_v * u + a_v * (u * u - 1.0 / 3.0));

            let p_idx = row_off + x as usize;
            if !is_full_frame
                && (px < inset_x
                    || px > (out_w as f32 - 1.0 - inset_x)
                    || py < inset_y
                    || py > (out_h as f32 - 1.0 - inset_y))
            {
                inside_mask[p_idx] = false;
            }

            let (sx, sy) = inv_proj * (px, py);
            if sx < -1.0 || sx > width as f32 || sy < -1.0 || sy > height as f32 {
                inside_mask[p_idx] = false;
            }
            let pix = sample_bicubic_clamped(rgba, width as i32, height as i32, sx, sy);
            let out_idx = p_idx * 4;
            out_buf[out_idx..out_idx + 4].copy_from_slice(&pix);
        }
    }

    if is_full_frame {
        return Ok((out_buf, out_w, out_h));
    }

    // 4. Seamless Natural-Paper Border Trim & Symmetric Margin Centering
    // Estimate clean natural paper RGB (82nd percentile of interior pixels) so Mode 0 looks natural
    // and Mode 1/2 Retinex sees ZERO artificial 255 step seam!
    let mut r_samples = Vec::with_capacity(1024);
    let mut g_samples = Vec::with_capacity(1024);
    let mut b_samples = Vec::with_capacity(1024);
    let x0_s = (out_w as f32 * 0.15) as u32;
    let x1_s = (out_w as f32 * 0.85) as u32;
    let y0_s = (out_h as f32 * 0.15) as u32;
    let y1_s = (out_h as f32 * 0.85) as u32;
    let step_x = ((x1_s - x0_s) / 28).max(1);
    let step_y = ((y1_s - y0_s) / 28).max(1);

    for y in (y0_s..y1_s).step_by(step_y as usize) {
        for x in (x0_s..x1_s).step_by(step_x as usize) {
            let idx = ((y * out_w + x) * 4) as usize;
            r_samples.push(out_buf[idx]);
            g_samples.push(out_buf[idx + 1]);
            b_samples.push(out_buf[idx + 2]);
        }
    }
    let paper_rgb = if !r_samples.is_empty() {
        r_samples.sort_unstable();
        g_samples.sort_unstable();
        b_samples.sort_unstable();
        let k = (r_samples.len() * 82 / 100).min(r_samples.len() - 1);
        [r_samples[k], g_samples[k], b_samples[k]]
    } else {
        [240, 240, 240]
    };

    // Replace outside-inset pixels with natural paper_rgb
    for i in 0..(out_w * out_h) as usize {
        if !inside_mask[i] {
            let idx = i * 4;
            out_buf[idx] = paper_rgb[0];
            out_buf[idx + 1] = paper_rgb[1];
            out_buf[idx + 2] = paper_rgb[2];
        }
    }

    // Measure rectified content bounding box at FULL resolution using local contrast drop
    // so ultra-thin 1px box borders (even near x=3% before centering!) are 100% preserved while smooth edge stains are ignored!
    let xp = ((out_w as f32) * 0.022).max(5.0) as u32;
    let yp = ((out_h as f32) * 0.045) as u32;
    let mut col_hits = vec![0u32; out_w as usize];
    for y in yp..(out_h.saturating_sub(yp)) {
        let row = (y * out_w) as usize;
        for x in xp..(out_w.saturating_sub(xp).min(out_w - 4)) {
            let l_c = {
                let i = (row + x as usize) * 4;
                0.299 * out_buf[i] as f32 + 0.587 * out_buf[i + 1] as f32 + 0.114 * out_buf[i + 2] as f32
            };
            let mut l_hi = l_c;
            for k in [x - 4, x - 2, x + 2, x + 4] {
                let ik = (row + k as usize) * 4;
                let lk = 0.299 * out_buf[ik] as f32 + 0.587 * out_buf[ik + 1] as f32 + 0.114 * out_buf[ik + 2] as f32;
                if lk > l_hi {
                    l_hi = lk;
                }
            }
            // Sharp vertical/horizontal stroke or dark character core (ignores smooth edge shadow)
            if (l_hi - l_c) >= 18.0 || l_c < 95.0 {
                col_hits[x as usize] += 1;
            }
        }
    }

    let min_col_hits = ((out_h as f32) * 0.012).max(5.0) as u32;
    let w_usize = out_w as usize;
    // Require adjacent interior stroke support within 8px so an isolated 1px sleeve/edge hairline is skipped & wiped!
    let xmin_opt = (0..w_usize.saturating_sub(10)).find(|&x| {
        if col_hits[x] < min_col_hits {
            return false;
        }
        let neighbor_sum: u32 = col_hits[(x + 2)..=(x + 9).min(w_usize - 1)].iter().sum();
        neighbor_sum >= min_col_hits
    });
    let xmax_opt = (10..w_usize).rev().find(|&x| {
        if col_hits[x] < min_col_hits {
            return false;
        }
        let neighbor_sum: u32 = col_hits[x.saturating_sub(9)..=(x - 2)].iter().sum();
        neighbor_sum >= min_col_hits
    });

    if let (Some(xmin_u), Some(xmax_u)) = (xmin_opt, xmax_opt) {
        if xmax_u > xmin_u + 20 {
            let xmin_full = xmin_u as i32;
            let xmax_full = xmax_u as i32;

            // Clean outer curved-paper / sleeve shadow strictly outside [xmin_full - 5, xmax_full + 5]
            let clean_left = (xmin_full - 5).min((out_w as f32 * 0.13) as i32).max(0) as u32;
            let clean_right = (xmax_full + 5).max((out_w as f32 * 0.87) as i32).min(out_w as i32) as u32;
            for y in 0..out_h {
                let row = (y * out_w) as usize;
                for x in 0..clean_left {
                    let idx = (row + x as usize) * 4;
                    let rem = (clean_left - x) as f32;
                    let w_amt = (rem / 4.0).clamp(0.0, 1.0);
                    for c in 0..3 {
                        out_buf[idx + c] = (out_buf[idx + c] as f32 * (1.0 - w_amt) + paper_rgb[c] as f32 * w_amt).round() as u8;
                    }
                }
                for x in clean_right..out_w {
                    let idx = (row + x as usize) * 4;
                    let rem = (x - clean_right + 1) as f32;
                    let w_amt = (rem / 4.0).clamp(0.0, 1.0);
                    for c in 0..3 {
                        out_buf[idx + c] = (out_buf[idx + c] as f32 * (1.0 - w_amt) + paper_rgb[c] as f32 * w_amt).round() as u8;
                    }
                }
            }

            // Balance left & right margins symmetrically using seamless paper_rgb fill
            let lm = xmin_full;
            let rm = (out_w as i32 - 1) - xmax_full;
            let shift_x = (lm + rm) / 2 - lm;
            let max_shift = ((out_w as f32) * 0.10) as i32;

            if shift_x.abs() >= 4
                && shift_x.abs() <= max_shift
                && (xmin_full + shift_x) >= 6
                && (xmax_full + shift_x) <= (out_w as i32 - 6)
            {
                let mut shifted = vec![255u8; out_buf.len()];
                for i in 0..(out_w * out_h) as usize {
                    shifted[i * 4] = paper_rgb[0];
                    shifted[i * 4 + 1] = paper_rgb[1];
                    shifted[i * 4 + 2] = paper_rgb[2];
                }
                for y in 0..out_h as usize {
                    let row = y * out_w as usize;
                    for x in 0..out_w as i32 {
                        let sx = x - shift_x;
                        if sx >= 0 && sx < out_w as i32 {
                            let dst_i = (row + x as usize) * 4;
                            let src_i = (row + sx as usize) * 4;
                            shifted[dst_i..dst_i + 4].copy_from_slice(&out_buf[src_i..src_i + 4]);
                        }
                    }
                }
                out_buf = shifted;
            }
        }
    }

    let _ = RgbaImage::new(1, 1); // keep image import active for tests
    Ok((out_buf, out_w, out_h))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_warp_crop_subrect() {
        let w = 200u32;
        let h = 200u32;
        let mut rgba = vec![240u8; (w * h * 4) as usize];
        for dy in -1..=1 {
            for dx in -1..=1 {
                let idx = (((75 + dy) as u32 * w + (75 + dx) as u32) * 4) as usize;
                rgba[idx] = 20;
                rgba[idx + 1] = 20;
                rgba[idx + 2] = 20;
            }
        }

        let quad = [50.0, 50.0, 150.0, 50.0, 150.0, 150.0, 50.0, 150.0];
        let (out_data, out_w, out_h) = warp_perspective_core(&rgba, w, h, &quad).unwrap();
        assert_eq!(out_w, 100);
        assert_eq!(out_h, 100);
        let out_idx = ((25 * 100 + 25) * 4) as usize;
        assert!(out_data[out_idx] < 60, "Expected dark marker at (25, 25), got {}", out_data[out_idx]);
    }

    #[test]
    fn test_deskew_corrects_plus_and_minus_tilt() {
        for &tilt_deg in &[-3.5f32, 3.5f32] {
            let w = 360u32;
            let h = 360u32;
            let mut rgba = vec![255u8; (w * h * 4) as usize];
            let rad = tilt_deg.to_radians();
            for line_y in (60..300).step_by(24) {
                for x in 40..320 {
                    let y = (line_y as f32 + (x as f32 - 180.0) * rad.tan()).round() as i32;
                    for dy in -1..=1 {
                        let py = y + dy;
                        if py >= 0 && py < h as i32 {
                            let idx = ((py as u32 * w + x) * 4) as usize;
                            rgba[idx] = 20;
                            rgba[idx + 1] = 20;
                            rgba[idx + 2] = 20;
                        }
                    }
                }
            }
            let quad = [0.0, 0.0, w as f32, 0.0, w as f32, h as f32, 0.0, h as f32];
            let (out, ow, oh) = warp_perspective_core(&rgba, w, h, &quad).unwrap();
            let remaining = estimate_text_tilt_angle(&out, ow, oh);
            assert!(
                remaining.abs() <= 0.35,
                "Expected near-zero remaining tilt for {:.1} deg input, got {:.2}",
                tilt_deg,
                remaining
            );
        }
    }

    #[test]
    fn test_parabolic_bow_dewarping() {
        let w = 400u32;
        let h = 500u32;
        let mut rgba = vec![255u8; (w * h * 4) as usize];
        // Draw bowed horizontal lines: y = line_y + 4.5 * (u^2 - 1/3)
        for line_y in (70..430).step_by(26) {
            for x in 40..360 {
                let u = (x as f32 - 200.0) / 200.0;
                let y = (line_y as f32 + 4.5 * (u * u - 1.0 / 3.0)).round() as i32;
                for dy in 0..=1 {
                    let py = y + dy;
                    if py >= 0 && py < h as i32 {
                        let idx = ((py as u32 * w + x) * 4) as usize;
                        rgba[idx] = 15;
                        rgba[idx + 1] = 15;
                        rgba[idx + 2] = 15;
                    }
                }
            }
        }
        let quad = [0.0, 0.0, w as f32, 0.0, w as f32, h as f32, 0.0, h as f32];
        let (out, ow, oh) = warp_perspective_core(&rgba, w, h, &quad).unwrap();
        // Verify remaining parabolic bow in middle band is < 0.8px
        let mut gray = vec![0u8; (ow * oh) as usize];
        for i in 0..(ow * oh) as usize {
            gray[i] = out[i * 4];
        }
        let norm = normalize_gray_grid(&gray, ow as usize, oh as usize);
        let mut gy = vec![0.0f32; (ow * oh) as usize];
        for y in 1..(oh as usize - 1) {
            for x in 0..ow as usize {
                gy[y * ow as usize + x] = ((norm[(y + 1) * ow as usize + x] - norm[(y - 1) * ow as usize + x]).abs() - 10.0).max(0.0);
            }
        }
        let (_, rem_a, _) = fit_band_parabola_subpixel(&gy, ow as usize, 60, 440);
        assert!(rem_a.abs() <= 0.85, "Expected parabolic bow to be flattened, remaining bow={:.2}px", rem_a);
    }

    #[test]
    fn test_real_78a30c16_pipeline() {
        let path = "C:/Users/Windows/.gemini/antigravity/brain/d9932247-42ea-498a-a477-a8f1d6c2b150/.user_uploaded/media_1795402710896_78a30c16.jpg";
        if let Ok(img) = image::open(path) {
            let rgba_img = img.to_rgba8();
            let (w, h) = rgba_img.dimensions();
            let quad = crate::detector::detect_document_quad(rgba_img.as_raw(), w, h)
                .unwrap_or_else(|| vec![0.0, 0.0, w as f32, 0.0, w as f32, h as f32, 0.0, h as f32]);
            let (warped, ow, oh) = warp_perspective_core(rgba_img.as_raw(), w, h, &quad).unwrap();
            let tilt = estimate_text_tilt_angle(&warped, ow, oh);
            println!("Real 78a30c16 v3 {}x{}: remaining tilt={:.2} deg", ow, oh, tilt);
            assert!(tilt.abs() <= 0.45, "Remaining tilt too large: {:.2}", tilt);
            let filtered = crate::filters::apply_scan_filter(&warped, ow, oh, 1, 1.0, 0.0);
            if let Some(out_img) = RgbaImage::from_raw(ow, oh, filtered) {
                let _ = out_img.save("C:/Users/Windows/.gemini/antigravity/brain/d9932247-42ea-498a-a477-a8f1d6c2b150/scratch/rust_out_78a30c16_v3.png");
            }
        }
    }
}

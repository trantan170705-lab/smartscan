use image::{Rgba, RgbaImage};
use imageproc::geometric_transformations::{warp_into, Interpolation, Projection};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PointF {
    pub x: f32,
    pub y: f32,
}

fn dist(p1: PointF, p2: PointF) -> f32 {
    ((p1.x - p2.x).powi(2) + (p1.y - p2.y).powi(2)).sqrt()
}

/// Measure horizontal text baseline tilt angle (in degrees) using Radon projection profile
pub fn estimate_text_tilt_angle(rgba: &[u8], width: u32, height: u32) -> f32 {
    if width < 50 || height < 50 {
        return 0.0;
    }
    // 1. Downscale to small thumbnail height 180px for fast evaluation (< 3ms)
    let target_h = 180u32.min(height);
    let scale = height as f32 / target_h as f32;
    let target_w = ((width as f32) / scale).round().max(10.0) as u32;

    let mut small_gray = vec![0u8; (target_w * target_h) as usize];
    let mut sum_luma = 0u64;
    for y in 0..target_h {
        let sy = ((y as f32) * scale).min((height - 1) as f32) as u32;
        let row_off = (y * target_w) as usize;
        for x in 0..target_w {
            let sx = ((x as f32) * scale).min((width - 1) as f32) as u32;
            let idx = ((sy * width + sx) * 4) as usize;
            let luma = (0.299 * rgba[idx] as f32 + 0.587 * rgba[idx + 1] as f32 + 0.114 * rgba[idx + 2] as f32) as u8;
            small_gray[row_off + x as usize] = luma;
            sum_luma += luma as u64;
        }
    }

    // Adaptive threshold: text is 1, background is 0
    let avg_luma = (sum_luma / (target_w * target_h) as u64) as u8;
    let text_thresh = avg_luma.saturating_sub(15);
    let mut binary = vec![0u8; (target_w * target_h) as usize];
    let mut text_count = 0;
    for i in 0..binary.len() {
        if small_gray[i] < text_thresh {
            binary[i] = 1;
            text_count += 1;
        }
    }

    // Require enough text pixels to reliably estimate tilt
    if text_count < (target_w * target_h / 40) as usize {
        return 0.0;
    }

    // Test candidate angles from -6.0° to +6.0° in steps of 0.25°
    let mut best_angle = 0.0f32;
    let mut max_variance = 0.0f32;
    let center_x = target_w as f32 / 2.0;
    let center_y = target_h as f32 / 2.0;

    let steps = 49; // -6.0 to +6.0 in 0.25 steps
    for s in 0..steps {
        let ang_deg = -6.0 + (s as f32) * 0.25;
        let rad = ang_deg.to_radians();
        let cos_a = rad.cos();
        let sin_a = rad.sin();

        let mut row_sums = vec![0.0f32; target_h as usize];
        for y in 0..target_h {
            let dy = y as f32 - center_y;
            for x in 0..target_w {
                if binary[(y * target_w + x) as usize] == 1 {
                    let dx = x as f32 - center_x;
                    let rot_y = (-dx * sin_a + dy * cos_a + center_y).round() as i32;
                    if rot_y >= 0 && rot_y < target_h as i32 {
                        row_sums[rot_y as usize] += 1.0;
                    }
                }
            }
        }

        let mean = row_sums.iter().sum::<f32>() / (target_h as f32);
        let var = row_sums.iter().map(|&v| (v - mean).powi(2)).sum::<f32>();
        if var > max_variance {
            max_variance = var;
            best_angle = ang_deg;
        }
    }

    best_angle
}

/// Perspective warp flattening paper quad to rectangular image with automatic text line straightening
/// quad: [x0, y0, x1, y1, x2, y2, x3, y3] -> [TL, TR, BR, BL]
/// Returns (rgba_data, out_width, out_height)
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

    // 1. Calculate target dimensions
    let w_top = dist(tl, tr);
    let w_bot = dist(bl, br);
    let out_w = (w_top.max(w_bot).round() as u32).clamp(16, 4000);

    let h_left = dist(tl, bl);
    let h_right = dist(tr, br);
    let out_h = (h_left.max(h_right).round() as u32).clamp(16, 4000);

    // 2. Control points:
    let src_pts: [(f32, f32); 4] = [
        (tl.x, tl.y),
        (tr.x, tr.y),
        (br.x, br.y),
        (bl.x, bl.y),
    ];
    let dest_pts: [(f32, f32); 4] = [
        (0.0, 0.0),
        (out_w as f32, 0.0),
        (out_w as f32, out_h as f32),
        (0.0, out_h as f32),
    ];

    let projection = Projection::from_control_points(src_pts, dest_pts)
        .ok_or_else(|| "Failed to calculate perspective projection matrix".to_string())?;

    let src_img = RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| "Failed to construct source image from buffer".to_string())?;

    let mut dest_img = RgbaImage::new(out_w, out_h);
    let default_pixel = Rgba([255, 255, 255, 255]);

    warp_into(
        &src_img,
        &projection,
        Interpolation::Bilinear,
        default_pixel,
        &mut dest_img,
    );

    // 3. CamScanner Automatic Content Deskew (Làm thẳng nội dung tự động)
    // Measure residual text line tilt angle
    let raw_dest = dest_img.as_raw();
    let tilt_angle = estimate_text_tilt_angle(raw_dest, out_w, out_h);

    if tilt_angle.abs() >= 0.35 && tilt_angle.abs() <= 6.0 {
        // Rotate dest_pts by -tilt_angle around center to produce perfectly horizontal text
        let theta = (-tilt_angle).to_radians();
        let cos_t = theta.cos();
        let sin_t = theta.sin();
        let cx = out_w as f32 / 2.0;
        let cy = out_h as f32 / 2.0;

        let deskew_dest_pts: [(f32, f32); 4] = [
            (
                cos_t * (0.0 - cx) - sin_t * (0.0 - cy) + cx,
                sin_t * (0.0 - cx) + cos_t * (0.0 - cy) + cy,
            ),
            (
                cos_t * (out_w as f32 - cx) - sin_t * (0.0 - cy) + cx,
                sin_t * (out_w as f32 - cx) + cos_t * (0.0 - cy) + cy,
            ),
            (
                cos_t * (out_w as f32 - cx) - sin_t * (out_h as f32 - cy) + cx,
                sin_t * (out_w as f32 - cx) + cos_t * (out_h as f32 - cy) + cy,
            ),
            (
                cos_t * (0.0 - cx) - sin_t * (out_h as f32 - cy) + cx,
                sin_t * (0.0 - cx) + cos_t * (out_h as f32 - cy) + cy,
            ),
        ];

        if let Some(deskew_proj) = Projection::from_control_points(src_pts, deskew_dest_pts) {
            let mut deskewed_dest = RgbaImage::new(out_w, out_h);
            warp_into(
                &src_img,
                &deskew_proj,
                Interpolation::Bilinear,
                default_pixel,
                &mut deskewed_dest,
            );
            return Ok((deskewed_dest.into_raw(), out_w, out_h));
        }
    }

    Ok((dest_img.into_raw(), out_w, out_h))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_warp_crop_subrect() {
        let w = 200u32;
        let h = 200u32;
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        // Put a marker at (75, 75)
        let idx = ((75 * w + 75) * 4) as usize;
        rgba[idx] = 255; // R
        rgba[idx + 3] = 255;

        // Quad from (50, 50) to (150, 150)
        let quad = [50.0, 50.0, 150.0, 50.0, 150.0, 150.0, 50.0, 150.0];
        let (out_data, out_w, out_h) = warp_perspective_core(&rgba, w, h, &quad).unwrap();
        assert_eq!(out_w, 100);
        assert_eq!(out_h, 100);
        // (75, 75) in src should be at (25, 25) in out!
        let out_idx = ((25 * 100 + 25) * 4) as usize;
        println!("Value at (25, 25): {}", out_data[out_idx]);
        assert_eq!(out_data[out_idx], 255, "Expected marker at (25, 25)");
    }
}

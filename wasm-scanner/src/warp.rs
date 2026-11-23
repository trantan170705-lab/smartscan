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
    // 1. Downscale to small thumbnail height 240px for fast evaluation (< 3ms)
    let target_h = 240u32.min(height);
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
    let text_thresh = avg_luma.saturating_sub(18);
    let mut binary = vec![0u8; (target_w * target_h) as usize];
    let mut text_count = 0;
    for i in 0..binary.len() {
        if small_gray[i] < text_thresh {
            binary[i] = 1;
            text_count += 1;
        }
    }

    // Require enough text pixels to reliably estimate tilt (at least 1.5% of pixels)
    if text_count < (target_w * target_h / 65) as usize {
        return 0.0;
    }

    // Test candidate angles from -8.0° to +8.0° in steps of 0.20°
    let mut best_angle = 0.0f32;
    let mut max_variance = 0.0f32;
    let center_x = target_w as f32 / 2.0;
    let center_y = target_h as f32 / 2.0;

    let steps = 81; // -8.0 to +8.0 in 0.20 steps
    for s in 0..steps {
        let ang_deg = -8.0 + (s as f32) * 0.20;
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

    // 3. BƯỚC 2: Làm thẳng nội dung trên giấy sau khi cắt góc (CamScanner Content Deskew)
    // Không làm thẳng 4 góc giấy (để bảo toàn 100% nội dung, không cắt phạm vào chữ).
    // Phân tích góc nghiêng của các dòng chữ trên trang giấy đã cắt:
    let raw_dest = dest_img.as_raw();
    let tilt_angle = estimate_text_tilt_angle(raw_dest, out_w, out_h);

    if tilt_angle.abs() >= 0.35 && tilt_angle.abs() <= 8.0 {
        let rad = tilt_angle.to_radians();
        let cos_a = rad.cos();
        let sin_a = rad.sin();
        let cx = out_w as f32 / 2.0;
        let cy = out_h as f32 / 2.0;

        let mut deskewed = RgbaImage::from_pixel(out_w, out_h, default_pixel);
        let src_raw = dest_img.as_raw();

        for y in 0..out_h {
            let dy = y as f32 - cy;
            for x in 0..out_w {
                let dx = x as f32 - cx;
                // Backward mapping: To rotate image by -tilt_angle, look up using +tilt_angle
                let sx = cos_a * dx - sin_a * dy + cx;
                let sy = sin_a * dx + cos_a * dy + cy;

                if sx >= 0.0 && sx < (out_w - 1) as f32 && sy >= 0.0 && sy < (out_h - 1) as f32 {
                    let x0 = sx.floor() as u32;
                    let y0 = sy.floor() as u32;
                    let x1 = x0 + 1;
                    let y1 = y0 + 1;

                    let fx = sx - x0 as f32;
                    let fy = sy - y0 as f32;

                    let idx00 = ((y0 * out_w + x0) * 4) as usize;
                    let idx10 = ((y0 * out_w + x1) * 4) as usize;
                    let idx01 = ((y1 * out_w + x0) * 4) as usize;
                    let idx11 = ((y1 * out_w + x1) * 4) as usize;

                    let w00 = (1.0 - fx) * (1.0 - fy);
                    let w10 = fx * (1.0 - fy);
                    let w01 = (1.0 - fx) * fy;
                    let w11 = fx * fy;

                    let r = (src_raw[idx00] as f32 * w00
                        + src_raw[idx10] as f32 * w10
                        + src_raw[idx01] as f32 * w01
                        + src_raw[idx11] as f32 * w11)
                        .round() as u8;
                    let g = (src_raw[idx00 + 1] as f32 * w00
                        + src_raw[idx10 + 1] as f32 * w10
                        + src_raw[idx01 + 1] as f32 * w01
                        + src_raw[idx11 + 1] as f32 * w11)
                        .round() as u8;
                    let b = (src_raw[idx00 + 2] as f32 * w00
                        + src_raw[idx10 + 2] as f32 * w10
                        + src_raw[idx01 + 2] as f32 * w01
                        + src_raw[idx11 + 2] as f32 * w11)
                        .round() as u8;

                    deskewed.put_pixel(x, y, Rgba([r, g, b, 255]));
                }
            }
        }
        return Ok((deskewed.into_raw(), out_w, out_h));
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

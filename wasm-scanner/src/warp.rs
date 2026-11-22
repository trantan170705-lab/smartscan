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

/// Perspective warp flattening paper quad to rectangular image
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
    // In imageproc, Projection::from_control_points takes (from, to).
    // warp_into calls projection.invert() internally, so the projection
    // must map from source (input) coordinates to destination (output) coordinates!
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

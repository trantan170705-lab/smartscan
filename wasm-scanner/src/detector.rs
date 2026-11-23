use image::GrayImage;
use imageproc::contours::find_contours;
use imageproc::edges::canny;
use imageproc::point::Point;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct QuadCorner {
    pub x: f32,
    pub y: f32,
}

/// Calculate Euclidean distance between two points
pub fn distance(p1: QuadCorner, p2: QuadCorner) -> f32 {
    ((p1.x - p2.x).powi(2) + (p1.y - p2.y).powi(2)).sqrt()
}

/// Calculate perpendicular distance from point P to line AB
fn perpendicular_distance(p: Point<i32>, a: Point<i32>, b: Point<i32>) -> f64 {
    let dx = (b.x - a.x) as f64;
    let dy = (b.y - a.y) as f64;
    let line_len = (dx * dx + dy * dy).sqrt();
    if line_len == 0.0 {
        let px = (p.x - a.x) as f64;
        let py = (p.y - a.y) as f64;
        return (px * px + py * py).sqrt();
    }
    let cross = ((dy * (p.x as f64)) - (dx * (p.y as f64)) + ((b.x as f64) * (a.y as f64)) - ((b.y as f64) * (a.x as f64))).abs();
    cross / line_len
}

/// Ramer-Douglas-Peucker simplification for open segment
fn rdp_open(points: &[Point<i32>], epsilon: f64) -> Vec<Point<i32>> {
    if points.len() <= 2 {
        return points.to_vec();
    }

    let a = points[0];
    let b = points[points.len() - 1];

    let mut max_dist = 0.0;
    let mut index = 0;

    for i in 1..(points.len() - 1) {
        let d = perpendicular_distance(points[i], a, b);
        if d > max_dist {
            max_dist = d;
            index = i;
        }
    }

    if max_dist > epsilon {
        let mut left = rdp_open(&points[0..=index], epsilon);
        let right = rdp_open(&points[index..points.len()], epsilon);
        left.pop();
        left.extend(right);
        left
    } else {
        vec![a, b]
    }
}

/// Ramer-Douglas-Peucker simplification for closed contour
pub fn approx_poly_dp_custom(points: &[Point<i32>], epsilon: f64) -> Vec<Point<i32>> {
    if points.len() < 4 {
        return points.to_vec();
    }

    let p0 = points[0];
    let mut max_d = 0.0;
    let mut split_idx = 0;
    for (i, p) in points.iter().enumerate().skip(1) {
        let dx = (p.x - p0.x) as f64;
        let dy = (p.y - p0.y) as f64;
        let d = dx * dx + dy * dy;
        if d > max_d {
            max_d = d;
            split_idx = i;
        }
    }

    if split_idx == 0 || split_idx == points.len() - 1 {
        return points.to_vec();
    }

    let mut part1 = rdp_open(&points[0..=split_idx], epsilon);
    let mut part2 = rdp_open(&points[split_idx..points.len()], epsilon);

    part1.pop();
    part1.append(&mut part2);

    if let (Some(first), Some(last)) = (part1.first(), part1.last()) {
        let dist = (((first.x - last.x).pow(2) + (first.y - last.y).pow(2)) as f64).sqrt();
        if dist < epsilon.max(6.0) {
            part1.pop();
        }
    }

    let mut cleaned: Vec<Point<i32>> = Vec::new();
    for p in part1 {
        if let Some(&last) = cleaned.last() {
            let dist = (((p.x - last.x).pow(2) + (p.y - last.y).pow(2)) as f64).sqrt();
            if dist >= 6.0 {
                cleaned.push(p);
            }
        } else {
            cleaned.push(p);
        }
    }

    cleaned
}

/// Calculate area of polygon using Shoelace formula
pub fn polygon_area(points: &[Point<i32>]) -> f64 {
    let n = points.len();
    if n < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += (points[i].x as f64) * (points[j].y as f64);
        area -= (points[j].x as f64) * (points[i].y as f64);
    }
    (area.abs()) / 2.0
}

/// Compute 2D Convex Hull using Andrew's monotone chain algorithm O(N log N)
pub fn convex_hull(points: &[Point<i32>]) -> Vec<Point<i32>> {
    let mut pts = points.to_vec();
    if pts.len() <= 3 {
        return pts;
    }
    pts.sort_by(|a, b| a.x.cmp(&b.x).then_with(|| a.y.cmp(&b.y)));
    pts.dedup();
    if pts.len() <= 3 {
        return pts;
    }

    let cross = |o: Point<i32>, a: Point<i32>, b: Point<i32>| -> i64 {
        ((a.x - o.x) as i64) * ((b.y - o.y) as i64) - ((a.y - o.y) as i64) * ((b.x - o.x) as i64)
    };

    let mut lower = Vec::new();
    for &p in &pts {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], p) <= 0 {
            lower.pop();
        }
        lower.push(p);
    }

    let mut upper = Vec::new();
    for &p in pts.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], p) <= 0 {
            upper.pop();
        }
        upper.push(p);
    }

    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

/// Calculate perimeter of polygon
pub fn polygon_perimeter(points: &[Point<i32>]) -> f64 {
    let n = points.len();
    if n < 2 {
        return 0.0;
    }
    let mut perim = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        let dx = (points[i].x - points[j].x) as f64;
        let dy = (points[i].y - points[j].y) as f64;
        perim += (dx * dx + dy * dy).sqrt();
    }
    perim
}

/// Check if a polygon is convex
pub fn is_convex(points: &[Point<i32>]) -> bool {
    let n = points.len();
    if n < 4 {
        return false;
    }
    let mut prev_cross = 0.0;
    for i in 0..n {
        let p1 = points[i];
        let p2 = points[(i + 1) % n];
        let p3 = points[(i + 2) % n];

        let dx1 = (p2.x - p1.x) as f64;
        let dy1 = (p2.y - p1.y) as f64;
        let dx2 = (p3.x - p2.x) as f64;
        let dy2 = (p3.y - p2.y) as f64;

        let cross = dx1 * dy2 - dy1 * dx2;
        if i == 0 {
            prev_cross = cross;
        } else if cross * prev_cross < 0.0 {
            return false;
        }
    }
    true
}

/// Check if interior angles are all in reasonable range [45°, 135°]
pub fn has_valid_document_angles(points: &[Point<i32>]) -> bool {
    let n = points.len();
    if n != 4 {
        return false;
    }
    for i in 0..n {
        let p1 = points[(i + 3) % n];
        let p2 = points[i];
        let p3 = points[(i + 1) % n];

        let v1_x = (p1.x - p2.x) as f64;
        let v1_y = (p1.y - p2.y) as f64;
        let v2_x = (p3.x - p2.x) as f64;
        let v2_y = (p3.y - p2.y) as f64;

        let dot = v1_x * v2_x + v1_y * v2_y;
        let len1 = (v1_x * v1_x + v1_y * v1_y).sqrt();
        let len2 = (v2_x * v2_x + v2_y * v2_y).sqrt();

        if len1 == 0.0 || len2 == 0.0 {
            return false;
        }

        let cos_theta = (dot / (len1 * len2)).clamp(-1.0, 1.0);
        let angle_deg = cos_theta.acos() * 180.0 / std::f64::consts::PI;

        if angle_deg < 45.0 || angle_deg > 135.0 {
            return false;
        }
    }
    true
}

/// Orders 4 points canonically into [TL, TR, BR, BL]
/// Uses the canonical computer vision formulation:
/// TL = argmin(x + y)
/// BR = argmax(x + y)
/// TR = argmax(x - y)
/// BL = argmin(x - y)
pub fn order_quad_points(pts: &[QuadCorner; 4]) -> [QuadCorner; 4] {
    let mut tl = pts[0];
    let mut br = pts[0];
    let mut min_sum = pts[0].x + pts[0].y;
    let mut max_sum = pts[0].x + pts[0].y;

    for &p in pts.iter().skip(1) {
        let s = p.x + p.y;
        if s < min_sum {
            min_sum = s;
            tl = p;
        }
        if s > max_sum {
            max_sum = s;
            br = p;
        }
    }

    let mut tr = pts[0];
    let mut bl = pts[0];
    let mut max_diff = f32::MIN;
    let mut min_diff = f32::MAX;

    for &p in pts.iter() {
        let d = p.x - p.y;
        if d > max_diff {
            max_diff = d;
            tr = p;
        }
        if d < min_diff {
            min_diff = d;
            bl = p;
        }
    }

    [tl, tr, br, bl]
}

/// Compute gradient magnitude image (Sobel-like)
fn compute_gradient_magnitude(gray: &GrayImage) -> Vec<f32> {
    let (w, h) = gray.dimensions();
    let mut grad = vec![0.0f32; (w * h) as usize];
    for y in 1..(h.saturating_sub(1)) {
        for x in 1..(w.saturating_sub(1)) {
            let gx = (gray.get_pixel(x + 1, y)[0] as f32) - (gray.get_pixel(x - 1, y)[0] as f32);
            let gy = (gray.get_pixel(x, y + 1)[0] as f32) - (gray.get_pixel(x, y - 1)[0] as f32);
            grad[(y * w + x) as usize] = (gx * gx + gy * gy).sqrt();
        }
    }
    grad
}

/// Compute average gradient along a line segment between p1 and p2
fn sample_line_gradient(p1: (f32, f32), p2: (f32, f32), grad: &[f32], w: u32, h: u32, samples: usize) -> f32 {
    if samples == 0 {
        return 0.0;
    }
    let mut sum = 0.0;
    for i in 0..samples {
        let t = (i as f32 + 0.5) / (samples as f32);
        let x = (p1.0 + t * (p2.0 - p1.0)).round() as i32;
        let y = (p1.1 + t * (p2.1 - p1.1)).round() as i32;
        if x >= 0 && x < w as i32 && y >= 0 && y < h as i32 {
            sum += grad[(y as u32 * w + x as u32) as usize];
        }
    }
    sum / (samples as f32)
}

/// Score a candidate quadrilateral based on edge gradients and geometric properties
fn score_quad_candidate(
    quad: &[QuadCorner; 4],
    grad: &[f32],
    gray: &GrayImage,
    w: u32,
    h: u32,
    area: f64,
    frame_area: f64,
) -> f32 {
    let (tl, tr, br, bl) = (quad[0], quad[1], quad[2], quad[3]);

    // 1. Average edge gradient along 4 borders
    let samples = 20;
    let g1 = sample_line_gradient((tl.x, tl.y), (tr.x, tr.y), grad, w, h, samples);
    let g2 = sample_line_gradient((tr.x, tr.y), (br.x, br.y), grad, w, h, samples);
    let g3 = sample_line_gradient((br.x, br.y), (bl.x, bl.y), grad, w, h, samples);
    let g4 = sample_line_gradient((bl.x, bl.y), (tl.x, tl.y), grad, w, h, samples);
    let min_g = g1.min(g2).min(g3).min(g4);
    let avg_g = (g1 + g2 + g3 + g4) / 4.0;

    // Saturated edge contrast score (a real paper edge >= 25 is fully scored; prevents desk wood contrast from dominating)
    let edge_score = ((avg_g * 0.7 + min_g * 0.3) / 25.0).tanh();

    // 2. Rectangularity / aspect ratio score
    let w_top = ((tl.x - tr.x).powi(2) + (tl.y - tr.y).powi(2)).sqrt();
    let w_bot = ((bl.x - br.x).powi(2) + (bl.y - br.y).powi(2)).sqrt();
    let h_left = ((tl.x - bl.x).powi(2) + (tl.y - bl.y).powi(2)).sqrt();
    let h_right = ((tr.x - br.x).powi(2) + (tr.y - br.y).powi(2)).sqrt();

    let avg_w = (w_top + w_bot) / 2.0;
    let avg_h = (h_left + h_right) / 2.0;
    if avg_w == 0.0 || avg_h == 0.0 {
        return 0.0;
    }

    let aspect = (avg_w / avg_h).max(avg_h / avg_w);
    if aspect > 3.0 {
        return 0.0; // unrealistic document aspect ratio
    }

    // Symmetry check (real documents under perspective tilt have matching opposite edge lengths)
    let w_ratio = w_top.min(w_bot) / w_top.max(w_bot);
    let h_ratio = h_left.min(h_right) / h_left.max(h_right);
    if w_ratio < 0.45 || h_ratio < 0.45 {
        return 0.0;
    }
    let symmetry = (w_ratio * h_ratio).sqrt();

    // Opposite edge parallelism check:
    // Top edge vector: tr - tl
    // Bot edge vector: br - bl
    let v_top_x = tr.x - tl.x;
    let v_top_y = tr.y - tl.y;
    let v_bot_x = br.x - bl.x;
    let v_bot_y = br.y - bl.y;
    let ang_top = v_top_x.atan2(v_top_y);
    let ang_bot = v_bot_x.atan2(v_bot_y);
    let mut diff_h = (ang_top - ang_bot).abs();
    if diff_h > std::f32::consts::PI {
        diff_h = 2.0 * std::f32::consts::PI - diff_h;
    }
    let diff_h_deg = diff_h * 180.0 / std::f32::consts::PI;

    // Left edge vector: bl - tl
    // Right edge vector: br - tr
    let v_left_x = bl.x - tl.x;
    let v_left_y = bl.y - tl.y;
    let v_right_x = br.x - tr.x;
    let v_right_y = br.y - tr.y;
    let ang_left = v_left_x.atan2(v_left_y);
    let ang_right = v_right_x.atan2(v_right_y);
    let mut diff_v = (ang_left - ang_right).abs();
    if diff_v > std::f32::consts::PI {
        diff_v = 2.0 * std::f32::consts::PI - diff_v;
    }
    let diff_v_deg = diff_v * 180.0 / std::f32::consts::PI;

    let max_ang_diff = diff_h_deg.max(diff_v_deg);
    if max_ang_diff > 35.0 {
        return 0.0;
    }
    let par_factor = (1.0 - (max_ang_diff / 35.0).powi(2)).max(0.15);

    let bounding_area = (avg_w * avg_h) as f64;
    let rectangularity = ((area / bounding_area) as f32).clamp(0.0, 1.0);

    // 3. Area coverage factor: documents typically occupy 5% to 85% of camera frame
    let area_ratio = (area / frame_area) as f32;
    let area_score = if area_ratio > 0.95 {
        0.25 // penalize snapping to full camera frame
    } else if area_ratio < 0.04 {
        0.05 // tiny noise
    } else {
        (area_ratio / 0.20).min(1.0).powf(0.5)
    };

    // 4. White Document Saliency: evaluate interior brightness of candidate quad
    // A true document (paper) has bright white/cream interior (luma > 160)
    // A computer monitor screen has dark gray background (luma ~ 80-110)
    let mut inside_luma_sum = 0.0f32;
    let mut bright_samples = 0;
    let mut total_samples = 0;
    for gy in 1..=4 {
        for gx in 1..=4 {
            let u = gx as f32 / 5.0;
            let v = gy as f32 / 5.0;
            let tx = tl.x + u * (tr.x - tl.x);
            let ty = tl.y + u * (tr.y - tl.y);
            let bx = bl.x + u * (br.x - bl.x);
            let by = bl.y + u * (br.y - bl.y);
            let px = (tx + v * (bx - tx)).round() as i32;
            let py = (ty + v * (by - ty)).round() as i32;
            if px >= 0 && px < w as i32 && py >= 0 && py < h as i32 {
                let lum = gray.get_pixel(px as u32, py as u32)[0] as f32;
                inside_luma_sum += lum;
                if lum >= 135.0 {
                    bright_samples += 1;
                }
                total_samples += 1;
            }
        }
    }
    let mean_luma = if total_samples > 0 { inside_luma_sum / total_samples as f32 } else { 128.0 };
    let bright_frac = if total_samples > 0 { bright_samples as f32 / total_samples as f32 } else { 0.5 };

    let whiteness_factor = if mean_luma >= 155.0 && bright_frac >= 0.65 {
        1.40 // Massive bonus for bright white paper
    } else if mean_luma < 110.0 {
        0.30 // Heavy penalty for dark monitor screen or desk
    } else {
        1.0
    };

    // Border proximity penalty (real documents are typically inside frame)
    let mut border_penalty = 1.0f32;
    for p in quad {
        if p.x < 2.0 || p.x > (w as f32 - 3.0) || p.y < 2.0 || p.y > (h as f32 - 3.0) {
            border_penalty *= 0.85;
        }
    }

    edge_score * rectangularity * symmetry * par_factor * area_score * whiteness_factor * border_penalty
}

/// Scans inward from an outer candidate border towards its opposite border.
/// If an outer leakage (e.g. background photocopy paper, desk gap) is present,

/// Refine a border line by searching locally (within ±8 pixels) along the normal direction for the sharpest edge
fn snap_line_to_strongest_gradient(
    p1: (f32, f32),
    p2: (f32, f32),
    grad: &[f32],
    w: u32,
    h: u32,
    normal: (f32, f32),
) -> (f32, f32, f32, f32) {
    let mut best_offset = 0.0f32;
    let mut best_score = sample_line_gradient(p1, p2, grad, w, h, 30);

    for offset in -10..=10 {
        if offset == 0 {
            continue;
        }
        let off = offset as f32;
        let np1 = (p1.0 + off * normal.0, p1.1 + off * normal.1);
        let np2 = (p2.0 + off * normal.0, p2.1 + off * normal.1);
        let s = sample_line_gradient(np1, np2, grad, w, h, 30);
        if s > best_score {
            best_score = s;
            best_offset = off;
        }
    }

    (
        p1.0 + best_offset * normal.0,
        p1.1 + best_offset * normal.1,
        p2.0 + best_offset * normal.0,
        p2.1 + best_offset * normal.1,
    )
}

/// Refine corner locations by locally maximizing the edge gradients of its two connected borders
/// regularized by perspective rectangle geometry (parallelism, length symmetry, and 90° right angle)
pub fn refine_quad_corners(
    quad: &[QuadCorner; 4],
    grad: &[f32],
    w: u32,
    h: u32,
) -> [QuadCorner; 4] {
    let mut refined = *quad;

    // Check if the candidate is already an exact, well-formed document boundary:
    let g_top = sample_line_gradient((refined[0].x, refined[0].y), (refined[1].x, refined[1].y), grad, w, h, 25);
    let g_right = sample_line_gradient((refined[1].x, refined[1].y), (refined[2].x, refined[2].y), grad, w, h, 25);
    let g_bot = sample_line_gradient((refined[2].x, refined[2].y), (refined[3].x, refined[3].y), grad, w, h, 25);
    let g_left = sample_line_gradient((refined[3].x, refined[3].y), (refined[0].x, refined[0].y), grad, w, h, 25);
    let min_border_g = g_top.min(g_right).min(g_bot).min(g_left);

    let w_top = ((refined[1].x - refined[0].x).powi(2) + (refined[1].y - refined[0].y).powi(2)).sqrt();
    let w_bot = ((refined[2].x - refined[3].x).powi(2) + (refined[2].y - refined[3].y).powi(2)).sqrt();
    let h_left = ((refined[0].x - refined[3].x).powi(2) + (refined[0].y - refined[3].y).powi(2)).sqrt();
    let h_right = ((refined[1].x - refined[2].x).powi(2) + (refined[1].y - refined[2].y).powi(2)).sqrt();

    let is_symmetric_rect = (w_top.min(w_bot) / w_top.max(w_bot) >= 0.92) && (h_left.min(h_right) / h_left.max(h_right) >= 0.92);

    if min_border_g >= 35.0 && is_symmetric_rect {
        return order_quad_points(&refined);
    }

    // 1. Fine local snap for Left, Right, and Top borders (within ±8 pixels to land exactly on the outer white paper boundary)
    // Left border normal: horizontal (1, 0)
    let (l_tl_x, _, l_bl_x, _) = snap_line_to_strongest_gradient(
        (refined[0].x, refined[0].y),
        (refined[3].x, refined[3].y),
        grad,
        w,
        h,
        (1.0, 0.0),
    );
    refined[0].x = l_tl_x;
    refined[3].x = l_bl_x;

    // Right border normal: horizontal (1, 0)
    let (r_tr_x, _, r_br_x, _) = snap_line_to_strongest_gradient(
        (refined[1].x, refined[1].y),
        (refined[2].x, refined[2].y),
        grad,
        w,
        h,
        (1.0, 0.0),
    );
    refined[1].x = r_tr_x;
    refined[2].x = r_br_x;

    // Top border normal: vertical (0, 1)
    let (_, t_tl_y, _, t_tr_y) = snap_line_to_strongest_gradient(
        (refined[0].x, refined[0].y),
        (refined[1].x, refined[1].y),
        grad,
        w,
        h,
        (0.0, 1.0),
    );
    refined[0].y = t_tl_y;
    refined[1].y = t_tr_y;

    // Bottom border normal: vertical (0, 1)
    let (_, b_bl_y, _, b_br_y) = snap_line_to_strongest_gradient(
        (refined[3].x, refined[3].y),
        (refined[2].x, refined[2].y),
        grad,
        w,
        h,
        (0.0, 1.0),
    );
    refined[3].y = b_bl_y;
    refined[2].y = b_br_y;

    order_quad_points(&refined)
}

/// Compute Otsu optimal threshold value
fn compute_otsu_threshold(gray: &GrayImage) -> u8 {
    let (width, height) = gray.dimensions();
    let total_pixels = (width * height) as f32;
    if total_pixels == 0.0 {
        return 128;
    }

    let mut hist = [0u32; 256];
    for p in gray.pixels() {
        hist[p[0] as usize] += 1;
    }

    let mut sum = 0.0;
    for i in 0..256 {
        sum += (i as f32) * (hist[i] as f32);
    }

    let mut sum_b = 0.0;
    let mut w_b = 0.0;
    let mut max_var = 0.0;
    let mut otsu_thresh = 128u8;

    for i in 0..256 {
        w_b += hist[i] as f32;
        if w_b == 0.0 {
            continue;
        }
        let w_f = total_pixels - w_b;
        if w_f == 0.0 {
            break;
        }

        sum_b += (i as f32) * (hist[i] as f32);
        let m_b = sum_b / w_b;
        let m_f = (sum - sum_b) / w_f;

        let var_between = w_b * w_f * (m_b - m_f) * (m_b - m_f);
        if var_between > max_var {
            max_var = var_between;
            otsu_thresh = i as u8;
        }
    }

    otsu_thresh
}

/// Fast Separable Morphological Closing (Dilation followed by Erosion)
fn morphological_close(img: &GrayImage, radius: u32) -> GrayImage {
    let (width, height) = img.dimensions();
    let r = radius as i32;

    // Horizontal dilation
    let mut temp_d = GrayImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let mut max_val = 0u8;
            let start = (x as i32 - r).max(0) as u32;
            let end = (x as i32 + r).min(width as i32 - 1) as u32;
            for nx in start..=end {
                let v = img.get_pixel(nx, y)[0];
                if v > max_val {
                    max_val = v;
                }
            }
            temp_d.put_pixel(x, y, image::Luma([max_val]));
        }
    }

    // Vertical dilation
    let mut dilated = GrayImage::new(width, height);
    for y in 0..height {
        let start = (y as i32 - r).max(0) as u32;
        let end = (y as i32 + r).min(height as i32 - 1) as u32;
        for x in 0..width {
            let mut max_val = 0u8;
            for ny in start..=end {
                let v = temp_d.get_pixel(x, ny)[0];
                if v > max_val {
                    max_val = v;
                }
            }
            dilated.put_pixel(x, y, image::Luma([max_val]));
        }
    }

    // Horizontal erosion
    let mut temp_e = GrayImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let mut min_val = 255u8;
            let start = (x as i32 - r).max(0) as u32;
            let end = (x as i32 + r).min(width as i32 - 1) as u32;
            for nx in start..=end {
                let v = dilated.get_pixel(nx, y)[0];
                if v < min_val {
                    min_val = v;
                }
            }
            temp_e.put_pixel(x, y, image::Luma([min_val]));
        }
    }

    // Vertical erosion
    let mut closed = GrayImage::new(width, height);
    for y in 0..height {
        let start = (y as i32 - r).max(0) as u32;
        let end = (y as i32 + r).min(height as i32 - 1) as u32;
        for x in 0..width {
            let mut min_val = 255u8;
            for ny in start..=end {
                let v = temp_e.get_pixel(x, ny)[0];
                if v < min_val {
                    min_val = v;
                }
            }
            closed.put_pixel(x, y, image::Luma([min_val]));
        }
    }

    closed
}

/// Detect document quadrilateral from RGBA buffer
/// Returns 8 floats: [x0, y0, x1, y1, x2, y2, x3, y3] -> [TL, TR, BR, BL]
pub fn detect_document_quad(rgba: &[u8], width: u32, height: u32) -> Option<Vec<f32>> {
    if width == 0 || height == 0 || rgba.len() < (width * height * 4) as usize {
        return None;
    }

    // 1. Downscale image to width ~320px
    let target_w = 320u32.min(width);
    let scale_x = width as f32 / target_w as f32;
    let target_h = ((height as f32) / scale_x).round().max(1.0) as u32;
    let scale_y = height as f32 / target_h as f32;

    // Fast downscale to grayscale
    let mut gray_small = GrayImage::new(target_w, target_h);
    for y in 0..target_h {
        let src_y = ((y as f32) * scale_y).min((height - 1) as f32) as u32;
        for x in 0..target_w {
            let src_x = ((x as f32) * scale_x).min((width - 1) as f32) as u32;
            let idx = ((src_y * width + src_x) * 4) as usize;
            let r = rgba[idx] as f32;
            let g = rgba[idx + 1] as f32;
            let b = rgba[idx + 2] as f32;
            let luma = (0.299 * r + 0.587 * g + 0.114 * b).round() as u8;
            gray_small.put_pixel(x, y, image::Luma([luma]));
        }
    }

    let frame_area = (target_w * target_h) as f64;
    // Allow real documents that occupy from 5% of the frame (e.g. document shown on computer screen)
    let min_area = frame_area * 0.045;
    let max_area = frame_area * 0.96;

    // Compute edge gradient map for robust candidate evaluation
    let grad_map = compute_gradient_magnitude(&gray_small);

    // Multi-pass candidate collection
    let mut candidates: Vec<([QuadCorner; 4], f64)> = Vec::new();

    let mut evaluate_contour = |pts: &[Point<i32>]| {
        let mut try_approx = |pts_slice: &[Point<i32>]| {
            let area = polygon_area(pts_slice);
            if area < min_area || area > max_area {
                return;
            }

            let perim = polygon_perimeter(pts_slice);
            if perim == 0.0 {
                return;
            }

            for eps_factor in [0.015, 0.02, 0.03, 0.04, 0.05, 0.06] {
                let epsilon = perim * eps_factor;
                let approx = approx_poly_dp_custom(pts_slice, epsilon);

                if approx.len() == 4 && is_convex(&approx) && has_valid_document_angles(&approx) {
                    let corners = [
                        QuadCorner { x: approx[0].x as f32, y: approx[0].y as f32 },
                        QuadCorner { x: approx[1].x as f32, y: approx[1].y as f32 },
                        QuadCorner { x: approx[2].x as f32, y: approx[2].y as f32 },
                        QuadCorner { x: approx[3].x as f32, y: approx[3].y as f32 },
                    ];
                    let ordered = order_quad_points(&corners);
                    candidates.push((ordered, area));
                    break;
                }
            }
        };

        try_approx(pts);
        let hull = convex_hull(pts);
        if hull.len() >= 4 {
            try_approx(&hull);
        }
    };

    // Calculate brightness percentiles to isolate White Document Saliency
    let mut hist = [0u32; 256];
    for p in gray_small.pixels() {
        hist[p[0] as usize] += 1;
    }
    let total_px = (target_w * target_h) as f32;
    let mut cum = 0u32;
    let mut p80 = 140u8;
    let mut p90 = 170u8;
    let mut p95 = 200u8;
    for i in 0..256 {
        cum += hist[i];
        let frac = cum as f32 / total_px;
        if frac >= 0.80 && p80 == 140 { p80 = i as u8; }
        if frac >= 0.90 && p90 == 170 { p90 = i as u8; }
        if frac >= 0.95 && p95 == 200 { p95 = i as u8; }
    }

    // Compute Otsu optimal threshold value
    let otsu_val = compute_otsu_threshold(&gray_small);

    // PASS 1: White Paper Saliency & Adaptive Midpoint
    // Cleanly separates paper from desk even under directional lighting or shadows
    let th_mid_paper = (((otsu_val as u32 + p90 as u32) / 2) as u8).clamp(130, 195);
    let th_white_high = p90.saturating_sub(15).max(140);
    let th_white_low = p80.saturating_sub(25).max(125);

    for &threshold in &[th_mid_paper, th_white_high, th_white_low] {
        let mut binary = GrayImage::new(target_w, target_h);
        for y in 0..target_h {
            for x in 0..target_w {
                let p = gray_small.get_pixel(x, y)[0];
                let v = if p > threshold { 255 } else { 0 };
                binary.put_pixel(x, y, image::Luma([v]));
            }
        }
        let closed_blob = morphological_close(&binary, 5);
        for contour in find_contours::<i32>(&closed_blob) {
            evaluate_contour(&contour.points);
        }
    }

    // PASS 2: Otsu Multi-thresholding (for white or textured desk backgrounds)
    for &threshold in &[otsu_val, otsu_val.saturating_sub(25), otsu_val.saturating_add(25)] {
        let mut binary = GrayImage::new(target_w, target_h);
        for y in 0..target_h {
            for x in 0..target_w {
                let p = gray_small.get_pixel(x, y)[0];
                let v = if p > threshold { 255 } else { 0 };
                binary.put_pixel(x, y, image::Luma([v]));
            }
        }
        let closed_blob = morphological_close(&binary, 5);
        for contour in find_contours::<i32>(&closed_blob) {
            evaluate_contour(&contour.points);
        }

        let closed = morphological_close(&binary, 2);
        for contour in find_contours::<i32>(&closed) {
            evaluate_contour(&contour.points);
        }
    }

    // PASS 3: Multi-scale Canny Edges (direct on small gray for crisp edge preservation)
    for &(low_t, high_t) in &[(20.0f32, 60.0f32), (35.0f32, 95.0f32)] {
        let edges = canny(&gray_small, low_t, high_t);
        let closed_edges = morphological_close(&edges, 2);
        for contour in find_contours::<i32>(&closed_edges) {
            evaluate_contour(&contour.points);
        }
    }

    // Rank all collected candidates using CamScanner edge gradient & paper whiteness scoring
    let mut best_quad: Option<[QuadCorner; 4]> = None;
    let mut best_score = 0.0f32;

    for (quad, area) in &candidates {
        let score = score_quad_candidate(quad, &grad_map, &gray_small, target_w, target_h, *area, frame_area);
        if score > best_score {
            best_score = score;
            best_quad = Some(*quad);
        }
    }

    best_quad.map(|q| {
        let refined = refine_quad_corners(&q, &grad_map, target_w, target_h);
        let scaled_corners = [
            QuadCorner { x: refined[0].x * scale_x, y: refined[0].y * scale_y },
            QuadCorner { x: refined[1].x * scale_x, y: refined[1].y * scale_y },
            QuadCorner { x: refined[2].x * scale_x, y: refined[2].y * scale_y },
            QuadCorner { x: refined[3].x * scale_x, y: refined[3].y * scale_y },
        ];
        let ordered = order_quad_points(&scaled_corners);
        // Apply a subtle 0.6% inward safety inset to eliminate border bleeding from desk or underlying paper
        let center_x = (ordered[0].x + ordered[1].x + ordered[2].x + ordered[3].x) / 4.0;
        let center_y = (ordered[0].y + ordered[1].y + ordered[2].y + ordered[3].y) / 4.0;
        let inset = 0.006f32;
        vec![
            ordered[0].x + (center_x - ordered[0].x) * inset,
            ordered[0].y + (center_y - ordered[0].y) * inset,
            ordered[1].x + (center_x - ordered[1].x) * inset,
            ordered[1].y + (center_y - ordered[1].y) * inset,
            ordered[2].x + (center_x - ordered[2].x) * inset,
            ordered[2].y + (center_y - ordered[2].y) * inset,
            ordered[3].x + (center_x - ordered[3].x) * inset,
            ordered[3].y + (center_y - ordered[3].y) * inset,
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_order_quad_points() {
        let pts = [
            QuadCorner { x: 300.0, y: 300.0 }, // BR
            QuadCorner { x: 100.0, y: 100.0 }, // TL
            QuadCorner { x: 100.0, y: 300.0 }, // BL
            QuadCorner { x: 300.0, y: 100.0 }, // TR
        ];
        let ordered = order_quad_points(&pts);
        assert_eq!(ordered[0], QuadCorner { x: 100.0, y: 100.0 }); // TL
        assert_eq!(ordered[1], QuadCorner { x: 300.0, y: 100.0 }); // TR
        assert_eq!(ordered[2], QuadCorner { x: 300.0, y: 300.0 }); // BR
        assert_eq!(ordered[3], QuadCorner { x: 100.0, y: 300.0 }); // BL
    }

    #[test]
    fn test_detect_document_quad_synthetic() {
        let width = 640u32;
        let height = 480u32;
        let mut rgba = vec![25u8; (width * height * 4) as usize];

        // Draw a tilted white quad on dark background:
        let expected_tl = QuadCorner { x: 150.0, y: 100.0 };
        let expected_tr = QuadCorner { x: 500.0, y: 120.0 };
        let expected_br = QuadCorner { x: 480.0, y: 400.0 };
        let expected_bl = QuadCorner { x: 130.0, y: 380.0 };

        let poly = [expected_tl, expected_tr, expected_br, expected_bl];
        for y in 0..height {
            for x in 0..width {
                let idx = ((y * width + x) * 4) as usize;
                let noise = ((x * 17 + y * 31) % 15) as u8;
                rgba[idx] = 20 + noise;
                rgba[idx + 1] = 20 + noise;
                rgba[idx + 2] = 20 + noise;
                rgba[idx + 3] = 255;

                let px = x as f32;
                let py = y as f32;
                let mut inside = true;
                for i in 0..4 {
                    let p1 = poly[i];
                    let p2 = poly[(i + 1) % 4];
                    let cross = (p2.x - p1.x) * (py - p1.y) - (p2.y - p1.y) * (px - p1.x);
                    if cross < 0.0 {
                        inside = false;
                        break;
                    }
                }
                if inside {
                    rgba[idx] = 230;
                    rgba[idx + 1] = 230;
                    rgba[idx + 2] = 230;
                }
            }
        }

        let detected = detect_document_quad(&rgba, width, height);
        assert!(detected.is_some(), "Document quad should be detected");
        let q = detected.unwrap();
        assert_eq!(q.len(), 8);

        let dt_tl = distance(QuadCorner { x: q[0], y: q[1] }, expected_tl);
        let dt_tr = distance(QuadCorner { x: q[2], y: q[3] }, expected_tr);
        let dt_br = distance(QuadCorner { x: q[4], y: q[5] }, expected_br);
        let dt_bl = distance(QuadCorner { x: q[6], y: q[7] }, expected_bl);

        assert!(dt_tl < 5.0, "TL error should be < 5px, got {:.2}", dt_tl);
        assert!(dt_tr < 5.0, "TR error should be < 5px, got {:.2}", dt_tr);
        assert!(dt_br < 5.0, "BR error should be < 5px, got {:.2}", dt_br);
        assert!(dt_bl < 5.0, "BL error should be < 5px, got {:.2}", dt_bl);
    }

    #[test]
    fn test_real_user_image() {
        let path = "C:/Users/PC/.gemini/antigravity/brain/a068dbfa-d6d5-48f8-a3c9-05cb7a60b3e6/.user_uploaded/media_1795319853844_5cc4fc07.jpg";
        if let Ok(img) = image::open(path) {
            let rgba_img = img.to_rgba8();
            let (w, h) = rgba_img.dimensions();
            println!("User image dimensions: {}x{}", w, h);

            if let Some(detected) = detect_document_quad(rgba_img.as_raw(), w, h) {
                println!("Auto-detected Quad: {:?}", detected);
                println!("Norm Quad: [TL: ({:.3}, {:.3}), TR: ({:.3}, {:.3}), BR: ({:.3}, {:.3}), BL: ({:.3}, {:.3})]",
                    detected[0] / w as f32, detected[1] / h as f32,
                    detected[2] / w as f32, detected[3] / h as f32,
                    detected[4] / w as f32, detected[5] / h as f32,
                    detected[6] / w as f32, detected[7] / h as f32,
                );
            } else {
                println!("No quad detected by auto-crop");
            }
        }
    }

    #[test]
    fn test_new_document_image() {
        let path = "C:/Users/PC/.gemini/antigravity/brain/a068dbfa-d6d5-48f8-a3c9-05cb7a60b3e6/.user_uploaded/media_1795342771821_d80df761.jpg";
        match image::open(path) {
            Ok(img) => {
                let rgba_img = img.to_rgba8();
                let (w, h) = rgba_img.dimensions();
                println!("New document image dimensions: {}x{}", w, h);

                if let Some(detected) = detect_document_quad(rgba_img.as_raw(), w, h) {
                    println!("Auto-detected Quad for new doc: {:?}", detected);
                    println!("Norm Quad: [TL: ({:.3}, {:.3}), TR: ({:.3}, {:.3}), BR: ({:.3}, {:.3}), BL: ({:.3}, {:.3})]",
                        detected[0] / w as f32, detected[1] / h as f32,
                        detected[2] / w as f32, detected[3] / h as f32,
                        detected[4] / w as f32, detected[5] / h as f32,
                        detected[6] / w as f32, detected[7] / h as f32,
                    );
                } else {
                    println!("No quad detected for new doc");
                }
            }
            Err(e) => {
                println!("Failed to open image: {:?}", e);
            }
        }
    }
}

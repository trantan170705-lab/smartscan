use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};

/// Parse JPEG dimensions (width, height) directly from JPEG header markers
pub fn parse_jpeg_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }

    let mut idx = 2;
    while idx + 4 < data.len() {
        if data[idx] != 0xFF {
            idx += 1;
            continue;
        }

        let marker = data[idx + 1];
        idx += 2;

        if marker == 0x00 || marker == 0xFF {
            continue;
        }

        if marker == 0xD9 {
            break;
        }

        if idx + 2 > data.len() {
            break;
        }

        let length = ((data[idx] as usize) << 8) | (data[idx + 1] as usize);

        if marker == 0xC0 || marker == 0xC1 || marker == 0xC2 {
            if idx + 7 <= data.len() {
                let h = ((data[idx + 3] as u32) << 8) | (data[idx + 4] as u32);
                let w = ((data[idx + 5] as u32) << 8) | (data[idx + 6] as u32);
                return Some((w, h));
            }
        }

        idx += length;
    }

    None
}

/// Generate PDF with DCTDecode embedded JPEG pages
pub fn generate_pdf_from_jpegs(
    jpeg_pages: &[Vec<u8>],
    page_size: &str,
) -> Result<Vec<u8>, String> {
    if jpeg_pages.is_empty() {
        return Err("No JPEG pages provided".to_string());
    }

    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut page_ids = Vec::new();

    for (page_idx, jpeg_bytes) in jpeg_pages.iter().enumerate() {
        let (img_w, img_h) = parse_jpeg_dimensions(jpeg_bytes).unwrap_or((1200, 1600));

        let is_landscape = img_w > img_h;
        let (base_w, base_h) = match page_size {
            "Letter" => (612.0f32, 792.0f32),
            _ => (595.28f32, 841.89f32), // Default A4
        };

        // Determine page dimensions: auto-switch to landscape for landscape images
        let (page_w, page_h) = if page_size == "Fit" {
            (img_w as f32 * 0.75, img_h as f32 * 0.75) // 96 DPI -> 72 pt/in
        } else if is_landscape {
            (base_h, base_w)
        } else {
            (base_w, base_h)
        };

        // Margin: 18pt for standard paper, 0pt for Fit
        let margin = if page_size == "Fit" { 0.0f32 } else { 18.0f32 };
        let printable_w = (page_w - margin * 2.0).max(1.0);
        let printable_h = (page_h - margin * 2.0).max(1.0);

        // Scale keeping aspect ratio
        let scale_w = printable_w / (img_w as f32);
        let scale_h = printable_h / (img_h as f32);
        let scale = scale_w.min(scale_h);

        let final_w = (img_w as f32) * scale;
        let final_h = (img_h as f32) * scale;
        let offset_x = (page_w - final_w) / 2.0;
        let offset_y = (page_h - final_h) / 2.0;

        // 1. Create Image XObject
        let img_name = format!("Im{}", page_idx + 1);
        let img_dict = dictionary! {
            "Type" => Object::Name(b"XObject".to_vec()),
            "Subtype" => Object::Name(b"Image".to_vec()),
            "Width" => Object::Integer(img_w as i64),
            "Height" => Object::Integer(img_h as i64),
            "ColorSpace" => Object::Name(b"DeviceRGB".to_vec()),
            "BitsPerComponent" => Object::Integer(8),
            "Filter" => Object::Name(b"DCTDecode".to_vec()),
        };

        let img_stream = Stream::new(img_dict, jpeg_bytes.clone());
        let img_id = doc.add_object(img_stream);

        // 2. Create Page Content Stream
        let ops = vec![
            Operation::new("q", vec![]),
            Operation::new(
                "cm",
                vec![
                    Object::Real(final_w),
                    Object::Real(0.0),
                    Object::Real(0.0),
                    Object::Real(final_h),
                    Object::Real(offset_x),
                    Object::Real(offset_y),
                ],
            ),
            Operation::new("Do", vec![Object::Name(img_name.as_bytes().to_vec())]),
            Operation::new("Q", vec![]),
        ];

        let content = Content { operations: ops };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap_or_default()));

        // 3. Create Resources Dictionary
        let resources_dict = dictionary! {
            "XObject" => dictionary! {
                img_name => Object::Reference(img_id),
            },
        };

        // 4. Create Page Object
        let page_id = doc.add_object(dictionary! {
            "Type" => Object::Name(b"Page".to_vec()),
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![
                Object::Real(0.0),
                Object::Real(0.0),
                Object::Real(page_w),
                Object::Real(page_h),
            ],
            "Contents" => Object::Reference(content_id),
            "Resources" => resources_dict,
        });

        page_ids.push(Object::Reference(page_id));
    }

    // 5. Create Pages & Catalog Dictionary
    let pages_dict = dictionary! {
        "Type" => Object::Name(b"Pages".to_vec()),
        "Kids" => Object::Array(page_ids),
        "Count" => Object::Integer(jpeg_pages.len() as i64),
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let catalog_id = doc.add_object(dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => Object::Reference(pages_id),
    });

    doc.trailer.set("Root", Object::Reference(catalog_id));

    let mut output = Vec::new();
    doc.save_to(&mut output)
        .map_err(|e| format!("Failed to serialize PDF: {:?}", e))?;

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn create_synthetic_jpeg(w: u32, h: u32) -> Vec<u8> {
        use image::{ImageBuffer, Rgb};
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(w, h, Rgb([200, 220, 240]));
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Jpeg).expect("JPEG encoding failed");
        buf.into_inner()
    }

    #[test]
    fn test_parse_jpeg_dimensions() {
        let jpeg = create_synthetic_jpeg(320, 240);
        let dims = parse_jpeg_dimensions(&jpeg);
        assert_eq!(dims, Some((320, 240)));
    }

    #[test]
    fn test_generate_pdf_a4() {
        let page1 = create_synthetic_jpeg(300, 400);
        let page2 = create_synthetic_jpeg(300, 400);

        let pdf = generate_pdf_from_jpegs(&[page1, page2], "A4");
        assert!(pdf.is_ok(), "PDF generation must succeed");
        let bytes = pdf.unwrap();

        assert!(bytes.starts_with(b"%PDF-1.5"));
        assert!(bytes.len() > 1000);
    }
}

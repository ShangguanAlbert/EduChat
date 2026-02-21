#!/usr/bin/env python3
import json
import os
import sys

MAX_PAGES_CAP = 50
DEFAULT_DPI = 200

def to_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def main():
    result = {"ok": False, "page_count": 0, "rendered": [], "error": ""}
    if len(sys.argv) < 5:
        result["error"] = "usage: aliyun_pdf_to_images.py <input_pdf> <output_dir> <max_pages> <dpi>"
        print(json.dumps(result, ensure_ascii=False))
        return 1

    input_path = str(sys.argv[1] or "").strip()
    output_dir = str(sys.argv[2] or "").strip()
    requested_max_pages = max(1, to_int(sys.argv[3], MAX_PAGES_CAP))
    max_pages = min(MAX_PAGES_CAP, requested_max_pages)
    dpi = max(72, min(600, to_int(sys.argv[4], DEFAULT_DPI)))

    if not input_path or not output_dir:
        result["error"] = "missing input path or output dir"
        print(json.dumps(result, ensure_ascii=False))
        return 1

    try:
        import pypdfium2 as pdfium

        os.makedirs(output_dir, exist_ok=True)
        doc = pdfium.PdfDocument(input_path)
        total_pages = len(doc)
        result["page_count"] = int(total_pages)
        if total_pages <= 0:
            result["ok"] = True
            print(json.dumps(result, ensure_ascii=False))
            return 0

        scale = float(dpi) / 72.0
        limit = min(total_pages, max_pages)
        for idx in range(limit):
            page = doc[idx]
            bitmap = page.render(scale=scale)
            image = bitmap.to_pil()
            output_path = os.path.join(output_dir, f"page-{idx + 1:03d}.jpg")
            image.save(output_path, format="JPEG", quality=86, optimize=True)
            image.close()
            result["rendered"].append(output_path)

        result["ok"] = True
    except Exception as exc:
        result["error"] = str(exc)

    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

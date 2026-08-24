import argparse
import json
import math
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


GREEN = (0.196, 0.804, 0.196)


def is_green(value):
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        return False
    return math.dist(tuple(float(v) for v in value[:3]), GREEN) < 0.08


def group_lines(words):
    lines = []
    for word in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        if not lines or abs(lines[-1]["top"] - word["top"]) > 3:
            lines.append({"top": word["top"], "words": [word]})
        else:
            lines[-1]["words"].append(word)
    return [
        {"top": line["top"], "text": " ".join(w["text"] for w in line["words"]).strip()}
        for line in lines
    ]


def extract_question(page, index):
    words = page.extract_words(keep_blank_chars=False) or []
    lines = group_lines(words)

    id_line = next((line for line in lines if line["text"].startswith("FrageID:")), None)
    question_id = f"seite-{index + 1}"
    kind = "Single Choice"
    if id_line:
        raw = id_line["text"].replace("FrageID:", "").strip()
        parts = [part.strip() for part in raw.split(",", 1)]
        if parts and parts[0]:
            question_id = parts[0]
        if len(parts) > 1 and parts[1]:
            kind = parts[1]

    check_rects = [
        rect
        for rect in page.rects
        if 7 <= rect.get("width", 0) <= 32
        and 7 <= rect.get("height", 0) <= 32
        and rect.get("top", 0) > 250
        and rect.get("x0", 0) < 130
        and (
            rect.get("stroke")
            or rect.get("fill")
            or is_green(rect.get("non_stroking_color"))
            or rect.get("non_stroking_color") == [1.0, 0.0, 0.0]
        )
    ]

    grouped = {}
    for rect in check_rects:
        key = round(rect["top"])
        grouped.setdefault(key, []).append(rect)

    options = []
    tops = sorted(grouped)
    for option_index, top in enumerate(tops):
        rects = grouped[top]
        next_top = tops[option_index + 1] if option_index + 1 < len(tops) else 735
        option_lines = [
            line["text"]
            for line in lines
            if top - 14 <= line["top"] < next_top - 14
        ]
        options.append(
            {
                "label": chr(65 + option_index),
                "text": " ".join(option_lines).strip(),
                "correct": any(rect.get("fill") and is_green(rect.get("non_stroking_color")) for rect in rects),
                "_top": top,
                "_bottom": next_top,
            }
        )

    question_lines = []
    if id_line:
        for line in lines:
            if 95 <= line["top"] < id_line["top"] - 2:
                text = line["text"]
                if not text.startswith("ETT - Fragenkatalog"):
                    question_lines.append(text)

    return {
        "id": question_id,
        "page": index + 1,
        "type": kind,
        "question": " ".join(question_lines).strip(),
        "options": options,
        "questionImage": f"assets/questions/question-{index + 1:03d}.jpg",
        "solutionImage": f"assets/solutions/page-{index + 1:03d}.jpg",
        "_questionBottom": (id_line["top"] - 8) if id_line else 735,
        "_pageWidth": page.width,
        "_pageHeight": page.height,
    }


def render_pages(pdf_path, output_dir):
    pages_dir = output_dir / "assets" / "solutions"
    pages_dir.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for index in range(len(pdf)):
            page = pdf.get_page(index)
            try:
                bitmap = page.render(scale=1.5, prefer_bgrx=True)
                image = bitmap.to_pil()
                image.save(pages_dir / f"page-{index + 1:03d}.jpg", "JPEG", quality=82, optimize=True)
            finally:
                page.close()
    finally:
        pdf.close()


def crop_learning_images(questions, output_dir):
    questions_dir = output_dir / "assets" / "questions"
    options_dir = output_dir / "assets" / "options"
    questions_dir.mkdir(parents=True, exist_ok=True)
    options_dir.mkdir(parents=True, exist_ok=True)

    for question in questions:
        page = question["page"]
        source = output_dir / "assets" / "solutions" / f"page-{page:03d}.jpg"
        if not source.exists():
            continue

        with Image.open(source) as img:
            scale_x = img.width / question["_pageWidth"]
            scale_y = img.height / question["_pageHeight"]

            def px_x(value):
                return max(0, min(img.width, int(round(value * scale_x))))

            def px_y(value):
                return max(0, min(img.height, int(round(value * scale_y))))

            q_left = px_x(55)
            q_top = px_y(55)
            q_right = px_x(question["_pageWidth"] - 55)
            q_bottom = max(q_top + 80, px_y(question["_questionBottom"]))
            img.crop((q_left, q_top, q_right, q_bottom)).save(
                output_dir / question["questionImage"],
                "JPEG",
                quality=86,
                optimize=True,
            )

            for option in question["options"]:
                o_top = max(0, option["_top"] - 14)
                o_bottom = min(question["_pageHeight"] - 70, option["_bottom"] - 14)
                crop = img.crop((px_x(106), px_y(o_top), px_x(question["_pageWidth"] - 55), px_y(o_bottom)))
                path = f"assets/options/page-{page:03d}-{option['label']}.jpg"
                crop.save(output_dir / path, "JPEG", quality=88, optimize=True)
                option["image"] = path


def strip_private_fields(questions):
    for question in questions:
        for key in list(question):
            if key.startswith("_"):
                del question[key]
        for option in question["options"]:
            for key in list(option):
                if key.startswith("_"):
                    del option[key]


def main():
    parser = argparse.ArgumentParser(description="Import ETT question PDFs for the trainer app.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--no-render", action="store_true")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    with pdfplumber.open(args.pdf) as pdf:
        questions = [extract_question(page, index) for index, page in enumerate(pdf.pages)]

    if not args.no_render:
        render_pages(args.pdf, args.out)
        crop_learning_images(questions, args.out)

    strip_private_fields(questions)

    data_dir = args.out / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "questions.json").write_text(
        json.dumps(
            {
                "title": args.pdf.stem,
                "source": args.pdf.name,
                "count": len(questions),
                "questions": questions,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Imported {len(questions)} questions into {args.out}")


if __name__ == "__main__":
    main()

"""Compara texto por página y rasterización; solo usa archivos de ensayo locales."""
import argparse
import json
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--output", type=Path, default=Path("artifacts/export-visual"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    texts = []
    for label, file in [("antes", args.before), ("despues", args.after)]:
        subprocess.run(["pdftoppm", "-r", "96", "-png", str(file.resolve()), str(args.output / label)], check=True, timeout=180)
        result = subprocess.run(["node", "scripts/pdfjs/valida-pdf.mjs", str(file.resolve()), "--json"], capture_output=True, text=True, check=True, timeout=60)
        texts.append(json.loads(result.stdout)["paginas"])
    normalize = lambda value: re.sub(r"\s", "", value)
    if [normalize(value) for value in texts[0]] != [normalize(value) for value in texts[1]]:
        raise ValueError("Cambió el número de páginas o el texto de alguna página.")
    results = []
    before = sorted(args.output.glob("antes-*.png"), key=lambda file: int(file.stem.split("-")[-1]))
    after = sorted(args.output.glob("despues-*.png"), key=lambda file: int(file.stem.split("-")[-1]))
    if len(before) != len(after) or len(before) != len(texts[0]):
        raise ValueError("El número de imágenes no coincide con las páginas.")
    for index, (left, right) in enumerate(zip(before, after), 1):
        a = np.array(Image.open(left).convert("RGB"), dtype=np.int16)
        b = np.array(Image.open(right).convert("RGB"), dtype=np.int16)
        if a.shape != b.shape:
            raise ValueError("Cambió el tamaño de una página.")
        difference = np.abs(a - b)
        results.append({"page": index, "meanAbsoluteDifference": float(difference.mean()), "fractionPixelsOver16": float((difference.max(axis=2) > 16).mean())})
    report = {"pages": len(results), "dpi": 96, "textByPageIdentical": True, "thresholds": {"meanAbsoluteDifference": 0.5, "fractionPixelsOver16": 0.005}, "results": results}
    (args.output / "comparacion.json").write_text(json.dumps(report, indent=2) + "\n")
    if any(page["meanAbsoluteDifference"] > 0.5 or page["fractionPixelsOver16"] > 0.005 for page in results):
        raise ValueError("La rasterización supera la tolerancia declarada; revisar las imágenes.")
    print(f"Comparación aprobada: {len(results)} páginas, texto idéntico por página y diferencias visuales dentro de tolerancia.")


if __name__ == "__main__":
    main()

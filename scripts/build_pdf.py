#!/usr/bin/env python3
"""
Merge data.js + pdf_extra_cases.json per pdf_manifest.json, generate
video frame strips and audio waveforms, then write ../pdf_data.js.

Requires: ffmpeg and ffprobe on PATH.
Run from repo root:  python3 scripts/build_pdf.py
Or:                   python3 omni-critique-demo/scripts/build_pdf.py (with cwd = omni-critique-demo)
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SITE_ROOT = SCRIPT_DIR.parent
DATA_JS = SITE_ROOT / "data.js"
MANIFEST = SCRIPT_DIR / "pdf_manifest.json"
EXTRA = SCRIPT_DIR / "pdf_extra_cases.json"
OUT_JS = SITE_ROOT / "pdf_data.js"
FRAMES_DIR = SITE_ROOT / "media" / "pdf_frames"
WAVES_DIR = SITE_ROOT / "media" / "pdf_waves"
N_VIDEO_FRAMES = 6
FRAME_WIDTH = 280
WAVE_SIZE = "1100x180"


def _run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def parse_data_js(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8")
    m = re.search(r"window\.__CASES__\s*=\s*(\[.*\])\s*;", raw, re.DOTALL)
    if not m:
        raise ValueError(f"Could not parse cases from {path}")
    return json.loads(m.group(1))


def video_duration(path: Path) -> float:
    r = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    if r.returncode != 0:
        return 1.0
    try:
        return max(float(r.stdout.strip()), 0.1)
    except ValueError:
        return 1.0


def extract_video_strip(video_path: Path, out_png: Path, n: int = N_VIDEO_FRAMES) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    dur = video_duration(video_path)
    tmp = Path(tempfile.mkdtemp(prefix="pdfstrip_"))
    try:
        paths = []
        for i in range(n):
            t = (i + 0.5) * dur / n
            fp = tmp / f"f{i:03d}.png"
            r = _run(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    str(t),
                    "-i",
                    str(video_path),
                    "-frames:v",
                    "1",
                    "-vf",
                    f"scale={FRAME_WIDTH}:-1",
                    str(fp),
                ]
            )
            if r.returncode != 0 or not fp.is_file():
                raise RuntimeError(f"ffmpeg frame extract failed: {r.stderr}")
            paths.append(fp)
        args = ["ffmpeg", "-y"]
        for p in paths:
            args.extend(["-i", str(p)])
        parts = "".join(f"[{i}:v]format=rgba[v{i}];" for i in range(n))
        stack_in = "".join(f"[v{i}]" for i in range(n))
        filt = f"{parts}{stack_in}hstack=inputs={n}[out]"
        args.extend(["-filter_complex", filt, "-map", "[out]", str(out_png)])
        r = _run(args)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg hstack failed: {r.stderr}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def extract_audio_wave(audio_path: Path, out_png: Path) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    r = _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(audio_path),
            "-filter_complex",
            f"showwavespic=s={WAVE_SIZE}:colors=0x4f6df5|0x1a1a2e",
            "-frames:v",
            "1",
            str(out_png),
        ]
    )
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg showwavespic failed: {r.stderr}")


def main() -> int:
    if not DATA_JS.is_file():
        print(f"Missing {DATA_JS}; run scripts/prepare_cases.py first.", file=sys.stderr)
        return 1
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        print("ffmpeg and ffprobe are required on PATH.", file=sys.stderr)
        return 1

    cases = parse_data_js(DATA_JS)
    by_id = {c["id"]: c for c in cases}
    extra = json.loads(EXTRA.read_text(encoding="utf-8")) if EXTRA.is_file() else []
    for row in extra:
        by_id[row["id"]] = row

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    transcriptions = manifest.get("transcriptions") or {}

    figures_out = []
    for fig in manifest["figures"]:
        cid = fig["id"]
        if cid not in by_id:
            print(f"Warning: unknown case id {cid!r}, skipping.", file=sys.stderr)
            continue
        case = dict(by_id[cid])
        rel_media = case.get("mediaRelPath") or ""
        abs_media = SITE_ROOT / rel_media if rel_media else None

        strip_rel = ""
        wave_rel = ""
        modality = case.get("modality", "")

        if modality == "video" and abs_media and abs_media.is_file():
            strip_name = f"{cid}_strip.png"
            strip_abs = FRAMES_DIR / strip_name
            try:
                extract_video_strip(abs_media, strip_abs)
                strip_rel = str(strip_abs.relative_to(SITE_ROOT)).replace("\\", "/")
            except Exception as e:
                print(f"Warning: video strip for {cid}: {e}", file=sys.stderr)
        elif modality == "video":
            print(f"Warning: missing video file for {cid}: {rel_media}", file=sys.stderr)

        if modality == "audio" and abs_media and abs_media.is_file():
            wave_name = f"{cid}.png"
            wave_abs = WAVES_DIR / wave_name
            try:
                extract_audio_wave(abs_media, wave_abs)
                wave_rel = str(wave_abs.relative_to(SITE_ROOT)).replace("\\", "/")
            except Exception as e:
                print(f"Warning: audio wave for {cid}: {e}", file=sys.stderr)
        elif modality == "audio":
            print(f"Warning: missing audio file for {cid}: {rel_media}", file=sys.stderr)

        figures_out.append(
            {
                "section": fig["section"],
                "sectionTitle": fig["sectionTitle"],
                "caption": fig["caption"],
                "transcription": transcriptions.get(cid, ""),
                "stripRelPath": strip_rel,
                "waveRelPath": wave_rel,
                **case,
            }
        )

    bundle = {
        "title": manifest.get("title", "examples of the reasoning critiques"),
        "figures": figures_out,
    }
    OUT_JS.write_text(
        "window.__PDF_BUNDLE__ = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT_JS} ({len(figures_out)} figures).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Imagine a standing T-pose model sheet + unlabeled front crop via xAI.

POST https://api.x.ai/v1/images/edits  model=grok-imagine-image-2.0
Up to 3 local refs. Prefer response_format=b64_json.

Never prints secrets. Key from --secrets-json, XAI_API_KEY, or default connector file.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageChops, ImageFilter, ImageOps

DEFAULT_SECRETS = (
    "/home/box/agent-data/connector-secrets/"
    "3ffb7cad-0a29-4270-8502-71eeb1aa2526/xai.json"
)
EDITS_URL = "https://api.x.ai/v1/images/edits"
MODEL = "grok-imagine-image-2.0"

DEFAULT_STAND = (
    "POSE CRITICAL: STANDING T-POSE / BIND POSE. Four paws planted on the ground. "
    "Front AND hind legs EXTENDED as vertical columns, belly clearly off the floor, "
    "backline HIGH and almost level (shoulders and hips similar height). "
    "Hindquarters NOT tucked. Haunches NOT sitting. Tail raised or gently curved, "
    "NOT dragged flat on the ground. NOT sitting, NOT sit, NOT loaf, NOT play-bow, "
    "NOT crouch, NOT lying down. Quadruped standing still, weight on all four feet."
)

DEFAULT_IDENTITY = (
    "Same character in every reference. Preserve species, colors, markings, eyes, "
    "and signature accessory. Stylized game-art, not photoreal."
)


def load_key(secrets_path: str | None) -> str:
    env = os.environ.get("XAI_API_KEY")
    if env:
        return env
    path = secrets_path or os.environ.get("XAI_SECRETS_JSON") or DEFAULT_SECRETS
    with open(path) as f:
        d = json.load(f)
    k = d.get("XAI_API_KEY") or d.get("key") or d.get("api_key")
    if not k:
        raise SystemExit("missing XAI_API_KEY (env or secrets json)")
    return k


def to_data_uri(path: str, max_side: int = 1024) -> str:
    im = Image.open(path)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    elif im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (240, 240, 242))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    w, h = im.size
    s = max(w, h)
    if s > max_side:
        im = im.resize((max(1, int(w * max_side / s)), max(1, int(h * max_side / s))),
                       Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def image_field(uri: str) -> dict:
    return {"url": uri, "type": "image_url"}


def save_item(item: dict, dest: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(dest)) or ".", exist_ok=True)
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
        with open(dest, "wb") as f:
            f.write(raw)
        print(f"wrote b64 {dest} bytes={len(raw)}", flush=True)
        return dest
    url = item.get("url")
    if not url:
        raise RuntimeError(f"no b64_json or url; keys={list(item.keys())}")
    print(f"downloading url for {os.path.basename(dest)} (host only)", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "suki-canon-pipe/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read()
    with open(dest, "wb") as f:
        f.write(raw)
    print(f"wrote url {dest} bytes={len(raw)}", flush=True)
    return dest


def post_edits(key: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        EDITS_URL,
        data=data,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        print(f"HTTP {e.code}: {err[:500]}", flush=True)
        raise


def imagine_edit(key: str, prompt: str, dest: str, refs: list[str],
                 aspect: str = "3:4", n: int = 1) -> str:
    if len(refs) > 3:
        refs = refs[:3]
        print("warning: truncated to 3 refs", flush=True)
    uris = [to_data_uri(p) for p in refs]
    fields = [image_field(u) for u in uris]
    base = {
        "model": MODEL,
        "prompt": prompt,
        "n": n,
        "aspect_ratio": aspect,
        "resolution": "1k",
        "response_format": "b64_json",
    }
    attempts = []
    if len(fields) == 1:
        attempts.append({**base, "image": fields[0]})
    else:
        attempts.append({**base, "images": fields})
        attempts.append({**base, "image": fields})
        attempts.append({**base, "image": uris})
    last = None
    for i, payload in enumerate(attempts):
        kind = "images" if "images" in payload else type(payload.get("image")).__name__
        print(f"POST edits -> {os.path.basename(dest)} aspect={aspect} refs={len(refs)} try={i} field={kind}",
              flush=True)
        try:
            body = post_edits(key, payload)
        except urllib.error.HTTPError as e:
            last = e
            continue
        if "data" not in body:
            print("unexpected keys", list(body.keys()), flush=True)
            last = RuntimeError(str(body)[:400])
            continue
        return save_item(body["data"][0], dest)
    raise RuntimeError(f"all edit payload shapes failed: {last}")


def crop_unlabeled_front(sheet_path: str, dest: str) -> str:
    """Largest bright subject crop — used if a dedicated front is missing."""
    im = Image.open(sheet_path).convert("RGB")
    w, h = im.size
    gray = ImageOps.grayscale(im)
    # invert so dark subject on light bg becomes bright; also handle dark bg
    corners = [gray.getpixel((2, 2)), gray.getpixel((w - 3, 2)),
               gray.getpixel((2, h - 3)), gray.getpixel((w - 3, h - 3))]
    bg = sum(corners) / 4
    if bg > 140:
        mask = gray.point(lambda p: 255 if p < bg - 18 else 0)
    else:
        mask = gray.point(lambda p: 255 if p > bg + 18 else 0)
    mask = mask.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MaxFilter(9))
    bbox = mask.getbbox()
    if not bbox:
        # fall back: center 60%
        bbox = (int(w * 0.2), int(h * 0.08), int(w * 0.8), int(h * 0.95))
    # if sheet is multi-panel, prefer leftmost/front-ish third if very wide
    bw = bbox[2] - bbox[0]
    if w / max(1, h) > 1.6 and bw > w * 0.7:
        bbox = (int(w * 0.02), int(h * 0.08), int(w * 0.28), int(h * 0.95))
    pad = 12
    x0 = max(0, bbox[0] - pad)
    y0 = max(0, bbox[1] - pad)
    x1 = min(w, bbox[2] + pad)
    y1 = min(h, bbox[3] + pad)
    crop = im.crop((x0, y0, x1, y1))
    crop.save(dest)
    print(f"cropped unlabeled front {dest} size={crop.size}", flush=True)
    return dest


def build_prompts(identity: str, extra: str) -> dict[str, str]:
    idn = identity.strip()
    stand = DEFAULT_STAND
    extra = extra.strip()
    sheet = (
        f"{idn} {stand} {extra} "
        "Production model sheet, clean light-gray studio, even lighting, same scale. "
        "Four views of the SAME standing character: FRONT, LEFT SIDE, BACK, THREE-QUARTER. "
        "Tiny labels under panels only. No extra props, no second animal. "
        "Legs must look like four visible columns in FRONT and SIDE. "
        "Side view must show a long standing body, not a sit triangle."
    )
    front = (
        f"{idn} {stand} {extra} "
        "SINGLE SUBJECT only. One character, full body, FRONT camera, chest-height. "
        "Plain solid light-gray background. NO labels, NO text, NO watermark, "
        "NO multi-panel, NO turnaround grid. Subject fills more than 50 percent of the frame. "
        "Show all four standing paws planted. Face fully visible. "
        "Clean studio lighting, game-art character turnaround style."
    )
    left = (
        f"{idn} {stand} {extra} "
        "SINGLE SUBJECT only. Full body, STRICT LEFT SIDE PROFILE (no 3/4). "
        "Plain solid light-gray background. NO labels, NO text, NO multi-panel. "
        "Subject fills more than 50 percent of the frame. Four-on-floor standing."
    )
    right = (
        f"{idn} {stand} {extra} "
        "SINGLE SUBJECT only. Full body, STRICT RIGHT SIDE PROFILE (no 3/4). "
        "Plain solid light-gray background. NO labels, NO text, NO multi-panel. "
        "Subject fills more than 50 percent of the frame. Four-on-floor standing."
    )
    back = (
        f"{idn} {stand} {extra} "
        "SINGLE SUBJECT only. Full body, STRICT REAR / BACK VIEW. "
        "Plain solid light-gray background. NO labels, NO text, NO multi-panel. "
        "Four-on-floor standing, hind legs extended as columns (not sit). "
        "Tail slightly aside so both hind legs show."
    )
    return {"sheet": sheet, "front": front, "left": left, "right": right, "back": back}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Imagine standing T-pose sheet + front crop")
    ap.add_argument("--ref", action="append", dest="refs", required=True,
                    help="Reference image path (repeat, max 3 used)")
    ap.add_argument("--out-sheet", required=True)
    ap.add_argument("--out-front", required=True)
    ap.add_argument("--out-left")
    ap.add_argument("--out-right")
    ap.add_argument("--out-back")
    ap.add_argument("--identity", default=DEFAULT_IDENTITY)
    ap.add_argument("--extra", default="")
    ap.add_argument("--secrets-json")
    ap.add_argument("--skip-sheet", action="store_true")
    ap.add_argument("--front-only", action="store_true")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    refs = [r for r in args.refs if r]
    missing = [r for r in refs if not os.path.isfile(r)]
    if missing:
        raise SystemExit(f"missing refs: {missing}")
    key = load_key(args.secrets_json)
    prompts = build_prompts(args.identity, args.extra)
    if not args.skip_sheet and not args.front_only:
        imagine_edit(key, prompts["sheet"], args.out_sheet, refs, aspect="16:9")
    if not args.skip_sheet and args.front_only is False:
        pass
    imagine_edit(key, prompts["front"], args.out_front, refs, aspect="3:4")
    if args.out_left:
        imagine_edit(key, prompts["left"], args.out_left, refs, aspect="4:3")
    if args.out_right:
        imagine_edit(key, prompts["right"], args.out_right, refs, aspect="4:3")
    if args.out_back:
        imagine_edit(key, prompts["back"], args.out_back, refs, aspect="3:4")
    if os.path.isfile(args.out_sheet) and os.path.isfile(args.out_front):
        print("sheet+front ready", flush=True)
    print("imagine_tpose done", flush=True)


if __name__ == "__main__":
    main()

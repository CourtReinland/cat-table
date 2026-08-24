#!/usr/bin/env python3
"""Fal Hunyuan 3D v3.1 Pro image-to-3d.

Endpoint: fal-ai/hunyuan-3d/v3.1/pro/image-to-3d
Front required. Optional back/left/right.

Never prints secrets. Key from FAL_KEY, --secrets-json, or default connector file.
Uses venv fal_client when available (recommended: /workspace/.venv-fal).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

DEFAULT_SECRETS = (
    "/home/box/agent-data/connector-secrets/"
    "3ffb7cad-0a29-4270-8502-71eeb1aa2526/fal.json"
)
ENDPOINT = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d"


def load_key(secrets_path: str | None) -> str:
    env = os.environ.get("FAL_KEY")
    if env:
        return env
    path = secrets_path or os.environ.get("FAL_SECRETS_JSON") or DEFAULT_SECRETS
    with open(path) as f:
        d = json.load(f)
    k = d.get("key") or d.get("FAL_KEY") or d.get("api_key")
    if not k:
        raise SystemExit("missing FAL_KEY (env or secrets json)")
    return k


def download(url: str, dest: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(dest)) or ".", exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "suki-canon-pipe/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        raw = r.read()
    with open(dest, "wb") as f:
        f.write(raw)
    print(f"wrote {dest} bytes={len(raw)}", flush=True)
    return dest


def run(front: str, out_glb: str, back=None, left=None, right=None,
        face_count=80000, enable_pbr=True, generate_type="Normal",
        thumb=None, secrets=None) -> dict:
    key = load_key(secrets)
    os.environ["FAL_KEY"] = key
    try:
        import fal_client
    except ImportError:
        raise SystemExit("fal_client missing — use /workspace/.venv-fal/bin/python")

    def up(path: str | None) -> str | None:
        if not path:
            return None
        if not os.path.isfile(path):
            raise SystemExit(f"missing image: {path}")
        url = fal_client.upload_file(path)
        print(f"uploaded {os.path.basename(path)}", flush=True)
        return url

    args = {
        "input_image_url": up(front),
        "generate_type": generate_type,
        "enable_pbr": bool(enable_pbr),
        "face_count": int(face_count),
    }
    for key_name, path in (
        ("back_image_url", back),
        ("left_image_url", left),
        ("right_image_url", right),
    ):
        u = up(path)
        if u:
            args[key_name] = u

    print(f"subscribe {ENDPOINT} face_count={face_count} pbr={enable_pbr}", flush=True)

    def on_q(update):
        if isinstance(update, dict):
            st = update.get("status")
            print(f"queue {st}", flush=True)
        else:
            st = getattr(update, "status", None)
            if st:
                print(f"queue {st}", flush=True)

    result = fal_client.subscribe(ENDPOINT, arguments=args, with_logs=True)
    if not isinstance(result, dict):
        result = dict(result) if hasattr(result, "keys") else {"raw": str(result)}
    print(f"result keys={list(result.keys())}", flush=True)

    glb_info = result.get("model_glb") or {}
    glb_url = None
    if isinstance(glb_info, dict):
        glb_url = glb_info.get("url")
    elif isinstance(glb_info, str):
        glb_url = glb_info
    if not glb_url:
        urls = result.get("model_urls") or {}
        if isinstance(urls, dict):
            glb = urls.get("glb") or urls.get("gltf")
            if isinstance(glb, dict):
                glb_url = glb.get("url")
            elif isinstance(glb, str):
                glb_url = glb
    if not glb_url:
        raise RuntimeError(f"no GLB url in result keys={list(result.keys())}")
    download(glb_url, out_glb)

    tinfo = result.get("thumbnail") or {}
    turl = tinfo.get("url") if isinstance(tinfo, dict) else None
    if turl and thumb:
        try:
            download(turl, thumb)
        except Exception as e:
            print(f"thumb download failed: {e}", flush=True)

    meta = {
        "endpoint": ENDPOINT,
        "out_glb": out_glb,
        "bytes": os.path.getsize(out_glb) if os.path.isfile(out_glb) else 0,
        "seed": result.get("seed"),
        "views": [k for k in args if k.endswith("_url")],
    }
    meta_path = out_glb + ".json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"hunyuan done {out_glb} bytes={meta['bytes']}", flush=True)
    return meta


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Hunyuan 3D v3.1 Pro image-to-3d")
    ap.add_argument("--front", required=True)
    ap.add_argument("--back")
    ap.add_argument("--left")
    ap.add_argument("--right")
    ap.add_argument("--out", required=True)
    ap.add_argument("--thumb")
    ap.add_argument("--face-count", type=int, default=80000)
    ap.add_argument("--no-pbr", action="store_true")
    ap.add_argument("--generate-type", default="Normal")
    ap.add_argument("--secrets-json")
    return ap.parse_args()


def main() -> None:
    a = parse_args()
    run(
        front=a.front,
        out_glb=a.out,
        back=a.back,
        left=a.left,
        right=a.right,
        face_count=a.face_count,
        enable_pbr=not a.no_pbr,
        generate_type=a.generate_type,
        thumb=a.thumb,
        secrets=a.secrets_json,
    )


if __name__ == "__main__":
    main()

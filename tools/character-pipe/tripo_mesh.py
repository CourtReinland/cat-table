#!/usr/bin/env python3
"""Tripo image-to-3d (boy / human heads).

Fal P1 (`tripo3d/p1/image-to-3d`) is the working Fal head. Default.
Fal H3.1 (`tripo3d/h3.1/image-to-3d`) is FAIL — painted blob; do not use.
Official Studio Smart Mesh (`--backend official`, P1-20260311) is preferred
when TRIPO_API_KEY / --tripo-secrets-json exists. Do not invent a key.

Never prints secrets. Fal key from FAL_KEY, --secrets-json, or default
connector file. Uses venv fal_client when available
(recommended: /workspace/.venv-fal).
"""
from __future__ import annotations

import argparse
import json
import os
import time
import uuid
import urllib.error
import urllib.request

DEFAULT_SECRETS = (
    "/home/box/agent-data/connector-secrets/"
    "3ffb7cad-0a29-4270-8502-71eeb1aa2526/fal.json"
)
ENDPOINT_P1 = "tripo3d/p1/image-to-3d"
ENDPOINT_H31 = "tripo3d/h3.1/image-to-3d"
FAL_ENDPOINTS = {"p1": ENDPOINT_P1, "h3.1": ENDPOINT_H31}
DEFAULT_FAL_MODEL = "p1"
OFFICIAL_ENDPOINT = "https://openapi.tripo3d.ai/v3/generation/image-to-model"
OFFICIAL_FILES = "https://openapi.tripo3d.ai/v3/files"
OFFICIAL_TASK = "https://openapi.tripo3d.ai/v3/tasks/"
OFFICIAL_MODEL = "P1-20260311"


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


def load_tripo_key(secrets_path: str | None) -> str:
    env = os.environ.get("TRIPO_API_KEY")
    if env:
        return env
    path = secrets_path or os.environ.get("TRIPO_SECRETS_JSON")
    if not path:
        raise SystemExit(
            "official backend needs TRIPO_API_KEY or --tripo-secrets-json "
            "(Fal P1 is the working unkeyed path; do not invent a Studio key)"
        )
    with open(path) as f:
        d = json.load(f)
    k = d.get("TRIPO_API_KEY") or d.get("key") or d.get("api_key")
    if not k:
        raise SystemExit("missing TRIPO_API_KEY (env or tripo secrets json)")
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


def file_url(obj) -> str | None:
    if isinstance(obj, str) and obj:
        return obj
    if isinstance(obj, dict):
        u = obj.get("url") or obj.get("file_url")
        if isinstance(u, str) and u:
            return u
    return None


def pick_mesh_url(result: dict, want_quad: bool = False) -> str:
    url = file_url(result.get("model_mesh"))
    if url:
        return url
    urls = result.get("model_urls") or {}
    if isinstance(urls, dict):
        keys = ("fbx", "glb", "gltf") if want_quad else ("glb", "gltf", "fbx")
        for k in keys:
            u = file_url(urls.get(k))
            if u:
                return u
    raise RuntimeError(f"no model_mesh / model_urls.glb in result keys={list(result.keys())}")


def write_sidecar(out_path: str, endpoint: str, face_limit: int) -> dict:
    meta = {
        "endpoint": endpoint,
        "face_limit": int(face_limit),
        "bytes": os.path.getsize(out_path) if os.path.isfile(out_path) else 0,
    }
    meta_path = out_path + ".json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"sidecar {meta_path} bytes={meta['bytes']}", flush=True)
    return meta


def _http_json(req: urllib.request.Request, timeout: int = 120) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        print(f"HTTP {e.code}: {err[:500]}", flush=True)
        raise


def official_headers(token: str, content_type: str | None = None) -> dict:
    h = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "suki-canon-pipe/1.0",
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def official_upload(token: str, path: str) -> str:
    if not os.path.isfile(path):
        raise SystemExit(f"missing image: {path}")
    filename = os.path.basename(path)
    ext = os.path.splitext(filename)[1].lower()
    ctype = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".png": "image/png",
    }.get(ext, "application/octet-stream")
    with open(path, "rb") as f:
        raw = f.read()
    boundary = uuid.uuid4().hex
    safe_name = filename.replace('"', "_")
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
        f"Content-Type: {ctype}\r\n\r\n"
    ).encode("utf-8") + raw + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        OFFICIAL_FILES,
        data=body,
        headers=official_headers(token, f"multipart/form-data; boundary={boundary}"),
        method="POST",
    )
    body_json = _http_json(req, timeout=180)
    if body_json.get("code") not in (0, None):
        raise RuntimeError(f"official upload failed code={body_json.get('code')}")
    data = body_json.get("data") or {}
    token_out = data.get("file_token") or data.get("token")
    if not token_out:
        raise RuntimeError(f"official upload missing file_token keys={list(data.keys())}")
    print(f"uploaded {os.path.basename(path)}", flush=True)
    return token_out


def official_poll(token: str, task_id: str, timeout_s: int = 600) -> dict:
    deadline = time.time() + timeout_s
    url = OFFICIAL_TASK + task_id
    while time.time() < deadline:
        req = urllib.request.Request(
            url,
            headers=official_headers(token),
            method="GET",
        )
        body = _http_json(req, timeout=60)
        if body.get("code") not in (0, None):
            raise RuntimeError(f"official poll failed code={body.get('code')}")
        data = body.get("data") or {}
        st = data.get("status")
        print(f"task {st} progress={data.get('progress')}", flush=True)
        if st == "success":
            return data
        if st in ("failed", "cancelled"):
            raise RuntimeError(f"official task {st}")
        time.sleep(2)
    raise RuntimeError("official task timed out")


def run_official(front: str, out_mesh: str, face_limit=5000, enable_pbr=True,
                 texture=True, quad=False, auto_size=False, orientation="default",
                 model_seed=None, thumb=None, tripo_secrets=None) -> dict:
    token = load_tripo_key(tripo_secrets)
    file_token = official_upload(token, front)
    payload = {
        "input": file_token,
        "model": OFFICIAL_MODEL,
        "face_limit": int(face_limit),
        "texture": bool(texture),
        "pbr": bool(enable_pbr),
        "orientation": orientation,
    }
    if auto_size:
        payload["auto_size"] = True
    if model_seed is not None:
        payload["model_seed"] = int(model_seed)
    if quad:
        print("official P1-20260311 does not support quad — omitted", flush=True)
    print(f"POST official {OFFICIAL_MODEL} face_limit={face_limit} pbr={enable_pbr}",
          flush=True)
    req = urllib.request.Request(
        OFFICIAL_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers=official_headers(token, "application/json"),
        method="POST",
    )
    created = _http_json(req, timeout=120)
    if created.get("code") not in (0, None):
        raise RuntimeError(f"official create failed code={created.get('code')}")
    task_id = (created.get("data") or {}).get("task_id")
    if not task_id:
        raise RuntimeError("official create missing task_id")
    data = official_poll(token, task_id)
    output = data.get("output") or {}
    mesh_url = (
        output.get("model_url")
        or output.get("pbr_model")
        or output.get("model")
        or output.get("base_model")
    )
    if not mesh_url:
        raise RuntimeError(f"no official model url keys={list(output.keys())}")
    download(mesh_url, out_mesh)
    turl = output.get("rendered_image_url") or output.get("rendered_image")
    if turl and thumb:
        try:
            download(turl, thumb)
        except Exception as e:
            print(f"thumb download failed: {e}", flush=True)
    meta = write_sidecar(out_mesh, OFFICIAL_ENDPOINT, face_limit)
    print(f"tripo official done {out_mesh} bytes={meta['bytes']}", flush=True)
    return meta


def run_fal(front: str, out_mesh: str, face_limit=5000, enable_pbr=True,
            texture=True, quad=False, auto_size=False, orientation="default",
            model_seed=None, thumb=None, secrets=None, fal_model=DEFAULT_FAL_MODEL) -> dict:
    fal_model = fal_model or DEFAULT_FAL_MODEL
    if fal_model not in FAL_ENDPOINTS:
        raise SystemExit(f"unknown fal model: {fal_model}")
    endpoint = FAL_ENDPOINTS[fal_model]
    if fal_model == "h3.1":
        print("FAIL: Fal H3.1 is a painted blob — do not use; default is P1", flush=True)

    key = load_key(secrets)
    os.environ["FAL_KEY"] = key
    try:
        import fal_client
    except ImportError:
        raise SystemExit("fal_client missing — use /workspace/.venv-fal/bin/python")

    if not os.path.isfile(front):
        raise SystemExit(f"missing image: {front}")
    image_url = fal_client.upload_file(front)
    print(f"uploaded {os.path.basename(front)}", flush=True)

    args = {
        "image_url": image_url,
        "face_limit": int(face_limit),
        "texture": bool(texture),
    }
    if model_seed is not None:
        args["model_seed"] = int(model_seed)
    if fal_model == "h3.1":
        args["pbr"] = bool(enable_pbr)
        args["orientation"] = orientation
        if quad:
            args["quad"] = True
        if auto_size:
            args["auto_size"] = True
    else:
        if not enable_pbr:
            print("Fal P1 has no pbr flag — omitted", flush=True)
        if quad:
            print("Fal P1 has no quad flag — omitted", flush=True)
        if auto_size:
            print("Fal P1 has no auto_size flag — omitted", flush=True)
        if orientation != "default":
            print("Fal P1 has no orientation flag — omitted", flush=True)

    print(f"subscribe {endpoint} face_limit={face_limit} texture={texture}", flush=True)

    def on_q(update):
        if isinstance(update, dict):
            st = update.get("status")
            print(f"queue {st}", flush=True)
        else:
            st = getattr(update, "status", None)
            if st:
                print(f"queue {st}", flush=True)

    result = fal_client.subscribe(
        endpoint, arguments=args, with_logs=True, on_queue_update=on_q,
    )
    if not isinstance(result, dict):
        result = dict(result) if hasattr(result, "keys") else {"raw": str(result)}
    print(f"result keys={list(result.keys())}", flush=True)

    mesh_info = result.get("model_mesh") or {}
    ct = mesh_info.get("content_type") if isinstance(mesh_info, dict) else None
    if ct:
        print(f"model content_type={ct}", flush=True)
    download(pick_mesh_url(result, want_quad=quad), out_mesh)

    turl = file_url(result.get("rendered_image"))
    if turl and thumb:
        try:
            download(turl, thumb)
        except Exception as e:
            print(f"thumb download failed: {e}", flush=True)

    meta = write_sidecar(out_mesh, endpoint, face_limit)
    print(f"tripo done {out_mesh} bytes={meta['bytes']}", flush=True)
    return meta


def run(front: str, out_mesh: str, face_limit=5000, enable_pbr=True,
        texture=True, quad=False, auto_size=False, orientation="default",
        model_seed=None, thumb=None, secrets=None, backend="fal",
        tripo_secrets=None, fal_model=DEFAULT_FAL_MODEL) -> dict:
    if backend == "official":
        return run_official(
            front=front,
            out_mesh=out_mesh,
            face_limit=face_limit,
            enable_pbr=enable_pbr,
            texture=texture,
            quad=quad,
            auto_size=auto_size,
            orientation=orientation,
            model_seed=model_seed,
            thumb=thumb,
            tripo_secrets=tripo_secrets,
        )
    return run_fal(
        front=front,
        out_mesh=out_mesh,
        face_limit=face_limit,
        enable_pbr=enable_pbr,
        texture=texture,
        quad=quad,
        auto_size=auto_size,
        orientation=orientation,
        model_seed=model_seed,
        thumb=thumb,
        secrets=secrets,
        fal_model=fal_model,
    )


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description=(
            "Tripo image-to-3d (boy / human heads). "
            "Fal H3.1 FAIL (painted blob). Fal P1 working. "
            "Official preferred when keyed."
        )
    )
    ap.add_argument("--front", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--thumb")
    ap.add_argument("--face-limit", type=int, default=5000)
    ap.add_argument("--no-pbr", action="store_true")
    ap.add_argument("--no-texture", action="store_true")
    ap.add_argument("--quad", action="store_true")
    ap.add_argument("--auto-size", action="store_true")
    ap.add_argument("--orientation", choices=("default", "align_image"), default="default")
    ap.add_argument("--model-seed", type=int)
    ap.add_argument("--secrets-json")
    ap.add_argument(
        "--backend",
        choices=("fal", "official"),
        default="fal",
        help="fal (default P1) or official Studio if a key exists",
    )
    ap.add_argument(
        "--fal-model",
        choices=("p1", "h3.1"),
        default=DEFAULT_FAL_MODEL,
        help="Fal model. Default p1. h3.1 is FAIL — do not use.",
    )
    ap.add_argument("--tripo-secrets-json")
    return ap.parse_args()


def main() -> None:
    a = parse_args()
    run(
        front=a.front,
        out_mesh=a.out,
        face_limit=a.face_limit,
        enable_pbr=not a.no_pbr,
        texture=not a.no_texture,
        quad=a.quad,
        auto_size=a.auto_size,
        orientation=a.orientation,
        model_seed=a.model_seed,
        thumb=a.thumb,
        secrets=a.secrets_json,
        backend=a.backend,
        tripo_secrets=a.tripo_secrets_json,
        fal_model=a.fal_model,
    )


if __name__ == "__main__":
    main()

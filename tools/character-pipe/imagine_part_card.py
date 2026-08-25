#!/usr/bin/env python3
"""Imagine a bust card or no-face hair helmet via xAI.

Bypasses imagine_tpose.py's four-on-floor lock. 2D refs only — never
3D isolation viewports. Imports helpers from this same directory.

Never prints secrets. Key from --secrets-json, XAI_API_KEY, or default connector file.
"""
from __future__ import annotations

import argparse
import os
import sys

# Same-dir helpers (not /workspace/suki-canon/pipe).
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from imagine_tpose import DEFAULT_IDENTITY, imagine_edit, load_key

KINDS = ("bust", "hair")


def build_prompt(kind: str, identity: str, extra: str) -> str:
    idn = identity.strip()
    extra = extra.strip()
    extra_bit = f" {extra}" if extra else ""
    if kind == "bust":
        return (
            f"{idn}{extra_bit} "
            "SINGLE SUBJECT only. Head-and-shoulders portrait / bust card. "
            "Face fully visible, mouth CLOSED. Cream-apricot cat, canon eyes, pink bow. "
            "Hair ON the head. Plain solid light-gray studio, even lighting. "
            "NO full body, NO sit, NO loaf, NO four-on-floor sheet, NO multi-panel, "
            "NO labels, NO text, NO watermark. Front camera, chest-height. "
            "Subject fills more than 50 percent of the frame."
        )
    return (
        f"{idn}{extra_bit} "
        "SINGLE SUBJECT only. Hair helmet / fluff wig of the SAME skull. "
        "NO face features, NO eyes, NO nose, NO mouth, NO skin. "
        "Ear silhouette ok. Pink bow ok at the neck. "
        "FRONT camera preferred (not rear, not 3/4-from-behind). "
        "Plain solid light-gray studio, even lighting. "
        "NO full body, NO sit, NO loaf, NO four-on-floor sheet, NO multi-panel, "
        "NO labels, NO text, NO watermark. Subject fills more than 50 percent of the frame."
    )


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Imagine a bust card or no-face hair helmet (2D refs only)"
    )
    ap.add_argument("--kind", required=True, choices=KINDS)
    ap.add_argument("--ref", action="append", dest="refs", required=True,
                    help="Reference image path (repeat, max 3 used). 2D only.")
    ap.add_argument("--out", required=True)
    ap.add_argument("--identity", default=DEFAULT_IDENTITY)
    ap.add_argument("--extra", default="")
    ap.add_argument("--secrets-json")
    ap.add_argument("--aspect", default="3:4")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    refs = [r for r in args.refs if r]
    missing = [r for r in refs if not os.path.isfile(r)]
    if missing:
        raise SystemExit(f"missing refs: {missing}")
    key = load_key(args.secrets_json)
    prompt = build_prompt(args.kind, args.identity, args.extra)
    print(f"imagine_part_card kind={args.kind} aspect={args.aspect} refs={len(refs)}",
          flush=True)
    imagine_edit(key, prompt, args.out, refs, aspect=args.aspect)
    print("imagine_part_card done", flush=True)


if __name__ == "__main__":
    main()

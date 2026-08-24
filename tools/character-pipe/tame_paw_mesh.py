#!/usr/bin/env python3
"""GS-PAW-MESH: tame Swipe/Hit travel and lock paw shells to paw bones.

Operates on the already-bound Hunyuan play GLB. Does not remesh, Hunyuan,
or metaball. Clip deltas are slerped toward rest; paw-region verts are
hard-bound to a single paw_* joint; distal limb cards drop spine/body
weights so a Hit grab cannot tube legs into the chest.
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

COMP = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# Rest-relative scale. Swipe authored ~59° upper / 55° shoulder / 22° wrist;
# walk is ~20° / 16° / 8°. Hit spine/neck is milder but smears limb cards.
SWIPE_ROT_SCALE = {
    "shoulder_L": 0.40,
    "shoulder_R": 0.40,
    "upper_FL": 0.38,
    "upper_FR": 0.38,
    "lower_FL": 0.40,
    "lower_FR": 0.40,
    "paw_FL": 0.40,
    "paw_FR": 0.40,
    "spine_03": 0.50,
}
HIT_ROT_SCALE = {
    "spine_01": 0.45,
    "spine_02": 0.45,
    "spine_03": 0.45,
    "neck": 0.40,
    "head": 0.45,
    "tail_01": 0.50,
}
HIT_TRS_SCALE = {"root": 0.40}

PAW_NAMES = ("paw_FL", "paw_FR", "paw_HL", "paw_HR")
LIMB_CHAINS = {
    "FL": ("shoulder_L", "upper_FL", "lower_FL", "paw_FL"),
    "FR": ("shoulder_R", "upper_FR", "lower_FR", "paw_FR"),
    "HL": ("hip_L", "thigh_L", "shin_L", "paw_HL"),
    "HR": ("hip_R", "thigh_R", "shin_R", "paw_HR"),
}
DISTAL = {
    "paw_FL": "paw_FL",
    "paw_FR": "paw_FR",
    "paw_HL": "paw_HL",
    "paw_HR": "paw_HR",
    "lower_FL": "paw_FL",
    "lower_FR": "paw_FR",
    "shin_L": "paw_HL",
    "shin_R": "paw_HR",
}
BODY_PREFIXES = ("spine", "neck", "head", "ear", "bow", "tail", "root")
PAW_CAPTURE = 0.048
PAW_Y = 0.058
PAW_XZ = 0.055


def qnorm(q):
    q = np.asarray(q, dtype=np.float64)
    n = np.linalg.norm(q)
    return q / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0])


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array(
        [
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ]
    )


def qconj(q):
    return np.array([-q[0], -q[1], -q[2], q[3]])


def qangle_deg(q):
    w = float(np.clip(qnorm(q)[3], -1.0, 1.0))
    return 2.0 * math.acos(abs(w)) * 180.0 / math.pi


def slerp(q0, q1, t):
    q0 = qnorm(q0)
    q1 = qnorm(q1)
    dot = float(np.dot(q0, q1))
    if dot < 0.0:
        q1 = -q1
        dot = -dot
    if dot > 0.9995:
        return qnorm(q0 + t * (q1 - q0))
    th = math.acos(min(1.0, dot))
    s = math.sin(th)
    return qnorm(math.sin((1.0 - t) * th) / s * q0 + math.sin(t * th) / s * q1)


def tame_quat(rest, anim, scale):
    rest = qnorm(rest)
    anim = qnorm(anim)
    delta = qmul(qconj(rest), anim)
    if delta[3] < 0:
        delta = -delta
    return qmul(rest, slerp(np.array([0.0, 0.0, 0.0, 1.0]), delta, scale))


def trs_matrix(t, r, s):
    r = qnorm(r)
    x, y, z, w = r
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    rot = np.array(
        [
            [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
            [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
            [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
        ],
        dtype=np.float64,
    )
    rot *= np.asarray(s, dtype=np.float64)
    m = np.eye(4, dtype=np.float64)
    m[:3, :3] = rot
    m[:3, 3] = np.asarray(t, dtype=np.float64)
    return m


def node_trs(node):
    t = node.get("translation", [0.0, 0.0, 0.0])
    r = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    s = node.get("scale", [1.0, 1.0, 1.0])
    return np.array(t, dtype=np.float64), np.array(r, dtype=np.float64), np.array(s, dtype=np.float64)


def load_glb(path: Path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise SystemExit(f"not a GLB: {path}")
    off = 12
    jlen, jtype = struct.unpack_from("<II", data, off)
    gltf = json.loads(data[off + 8 : off + 8 + jlen].rstrip(b" \x00"))
    off = off + 8 + jlen
    while off % 4:
        off += 1
    blen, btype = struct.unpack_from("<II", data, off)
    blob = bytearray(data[off + 8 : off + 8 + blen])
    return gltf, blob


def save_glb(path: Path, gltf, blob: bytearray):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    bin_chunk = bytes(blob)
    while len(bin_chunk) % 4:
        bin_chunk += b"\x00"
    gltf["buffers"][0]["byteLength"] = len(bin_chunk)
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(bin_chunk)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A)
    out += js
    out += struct.pack("<II", len(bin_chunk), 0x004E4942)
    out += bin_chunk
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


def acc_view(gltf, blob, index):
    acc = gltf["accessors"][index]
    bv = gltf["bufferViews"][acc["bufferView"]]
    ctype, csize = COMP[acc["componentType"]]
    n = NCOMP[acc["type"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", csize * n)
    return acc, start, stride, n, csize, ctype


def read_f32_vec(gltf, blob, index):
    acc, start, stride, n, csize, _ = acc_view(gltf, blob, index)
    count = acc["count"]
    if stride == csize * n and csize == 4:
        return np.frombuffer(blob, dtype=np.float32, offset=start, count=count * n).reshape(count, n).copy()
    out = np.zeros((count, n), dtype=np.float32)
    for i in range(count):
        out[i] = struct.unpack_from("<" + "f" * n, blob, start + i * stride)
    return out


def write_f32_vec(gltf, blob, index, arr: np.ndarray):
    acc, start, stride, n, csize, _ = acc_view(gltf, blob, index)
    arr = np.asarray(arr, dtype=np.float32)
    if arr.shape != (acc["count"], n):
        raise ValueError(f"accessor {index} shape {arr.shape} != {(acc['count'], n)}")
    if stride == csize * n:
        blob[start : start + arr.nbytes] = arr.tobytes()
    else:
        for i, row in enumerate(arr):
            struct.pack_into("<" + "f" * n, blob, start + i * stride, *row.tolist())


def read_u8_vec4(gltf, blob, index):
    acc, start, stride, n, csize, _ = acc_view(gltf, blob, index)
    count = acc["count"]
    if stride == 4:
        return np.frombuffer(blob, dtype=np.uint8, offset=start, count=count * 4).reshape(count, 4).copy()
    out = np.zeros((count, 4), dtype=np.uint8)
    for i in range(count):
        out[i] = struct.unpack_from("4B", blob, start + i * stride)
    return out


def write_u8_vec4(gltf, blob, index, arr: np.ndarray):
    acc, start, stride, n, csize, _ = acc_view(gltf, blob, index)
    arr = np.asarray(arr, dtype=np.uint8)
    if stride == 4:
        blob[start : start + arr.nbytes] = arr.tobytes()
    else:
        for i, row in enumerate(arr):
            struct.pack_into("4B", blob, start + i * stride, *row.tolist())


def read_indices(gltf, blob, index):
    acc, start, stride, n, csize, ctype = acc_view(gltf, blob, index)
    dtype = {1: np.uint8, 2: np.uint16, 4: np.uint32}[csize]
    count = acc["count"]
    return np.frombuffer(blob, dtype=dtype, offset=start, count=count).copy()


def rest_delta_deg(rest, anims):
    return max(qangle_deg(qmul(qconj(qnorm(rest)), qnorm(q))) for q in anims)


def find_channel(gltf, anim, bone, path):
    nodes = gltf["nodes"]
    for ch in anim["channels"]:
        if nodes[ch["target"]["node"]].get("name") == bone and ch["target"]["path"] == path:
            return ch, anim["samplers"][ch["sampler"]]
    return None, None


def sample_rot(times, quats, t):
    if t <= times[0]:
        return quats[0]
    if t >= times[-1]:
        return quats[-1]
    i = int(np.searchsorted(times, t, side="right") - 1)
    i = max(0, min(i, len(times) - 2))
    u = (t - times[i]) / max(1e-8, times[i + 1] - times[i])
    return slerp(quats[i], quats[i + 1], u)


def sample_vec(times, vals, t):
    if t <= times[0]:
        return vals[0]
    if t >= times[-1]:
        return vals[-1]
    i = int(np.searchsorted(times, t, side="right") - 1)
    i = max(0, min(i, len(times) - 2))
    u = (t - times[i]) / max(1e-8, times[i + 1] - times[i])
    return vals[i] * (1 - u) + vals[i + 1] * u


def joint_hierarchy(gltf):
    nodes = gltf["nodes"]
    skin = gltf["skins"][0]
    joints = skin["joints"]
    node_to_j = {ni: ji for ji, ni in enumerate(joints)}
    parent = [-1] * len(joints)
    for ji, ni in enumerate(joints):
        for c in nodes[ni].get("children") or []:
            if c in node_to_j:
                parent[node_to_j[c]] = ji
    return parent, joints


def ibm_worlds(gltf, blob):
    skin = gltf["skins"][0]
    acc = gltf["accessors"][skin["inverseBindMatrices"]]
    bv = gltf["bufferViews"][acc["bufferView"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    raw = np.frombuffer(blob, dtype=np.float32, offset=start, count=acc["count"] * 16).reshape(acc["count"], 4, 4)
    ibm = np.transpose(raw, (0, 2, 1)).astype(np.float64)
    worlds = np.array([np.linalg.inv(m) for m in ibm])
    return ibm, worlds


def posed_worlds(gltf, blob, anim_name, t, ibm, parent, joints):
    nodes = gltf["nodes"]
    anim = next(a for a in gltf["animations"] if a["name"] == anim_name)
    # Accumulate TRS per joint — a later translation channel must not
    # rebuild the matrix from rest rotation and wipe the tamed quat.
    posed = {}
    for ni in joints:
        posed[ni] = [x.copy() for x in node_trs(nodes[ni])]
    for ch in anim["channels"]:
        ni = ch["target"]["node"]
        path = ch["target"]["path"]
        if ni not in posed:
            continue
        samp = anim["samplers"][ch["sampler"]]
        times = read_f32_vec(gltf, blob, samp["input"]).reshape(-1)
        out = read_f32_vec(gltf, blob, samp["output"])
        if path == "rotation":
            posed[ni][1] = sample_rot(times, out, t)
        elif path == "translation":
            posed[ni][0] = sample_vec(times, out, t)
        elif path == "scale":
            posed[ni][2] = sample_vec(times, out, t)
    locals_ = [trs_matrix(*posed[ni]) for ni in joints]
    world = [None] * len(joints)
    order = []
    remaining = set(range(len(joints)))
    while remaining:
        progressed = False
        for ji in list(remaining):
            p = parent[ji]
            if p < 0 or world[p] is not None:
                world[ji] = locals_[ji] if p < 0 else world[p] @ locals_[ji]
                remaining.remove(ji)
                order.append(ji)
                progressed = True
        if not progressed:
            raise SystemExit("cycle in joint parents")
    return np.array(world)


def skin_points(pos, joints_idx, weights, pose_world, ibm):
    v = pos.shape[0]
    out = np.zeros((v, 3), dtype=np.float64)
    p4 = np.ones((v, 4), dtype=np.float64)
    p4[:, :3] = pos
    for k in range(4):
        w = weights[:, k]
        mask = w > 1e-8
        if not np.any(mask):
            continue
        js = joints_idx[mask, k]
        # unique joints in this slot
        for j in np.unique(js):
            sel = mask.copy()
            sel[mask] = js == j
            skin_m = pose_world[j] @ ibm[j]
            pts = (skin_m @ p4[sel].T).T
            out[sel] += w[sel, None] * pts[:, :3]
    return out


def write_png(path: Path, rgb: np.ndarray):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def rasterize(pos, faces, w=720, h=540, eye=None, look=None):
    """Orthographic clay still — white volume on charcoal, enough to see tubes."""
    eye = np.array(eye if eye is not None else (0.42, 0.22, 0.38))
    look = np.array(look if look is not None else (0.01, 0.14, -0.02))
    fwd = look - eye
    fwd = fwd / np.linalg.norm(fwd)
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(fwd, up)
    right = right / np.linalg.norm(right)
    up = np.cross(right, fwd)
    rel = pos - look
    x = rel @ right
    y = rel @ up
    z = rel @ fwd
    scale = 1.55
    col = ((x * scale) * 0.5 + 0.5) * (w - 1)
    row = (0.5 - (y * scale) * 0.5) * (h - 1)
    zbuf = np.full((h, w), 1e9, dtype=np.float32)
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = (22, 20, 24)
    light = np.array([0.45, 0.75, 0.48])
    light = light / np.linalg.norm(light)
    i0, i1, i2 = faces[:, 0], faces[:, 1], faces[:, 2]
    # backface + lambert from rest-ish skinned normals
    e1 = pos[i1] - pos[i0]
    e2 = pos[i2] - pos[i0]
    nrm = np.cross(e1, e2)
    nlen = np.linalg.norm(nrm, axis=1) + 1e-12
    nrm = nrm / nlen[:, None]
    ndot = nrm @ light
    shade = np.clip(0.22 + 0.78 * np.clip(ndot, 0, 1), 0, 1)
    # skip degenerate
    area = nlen
    keep = area > 1e-12
    xs = np.stack([col[i0], col[i1], col[i2]], axis=1)
    ys = np.stack([row[i0], row[i1], row[i2]], axis=1)
    zs = np.stack([z[i0], z[i1], z[i2]], axis=1)
    for ti in np.nonzero(keep)[0]:
        minx = int(max(0, np.floor(xs[ti].min())))
        maxx = int(min(w - 1, np.ceil(xs[ti].max())))
        miny = int(max(0, np.floor(ys[ti].min())))
        maxy = int(min(h - 1, np.ceil(ys[ti].max())))
        if maxx < minx or maxy < miny:
            continue
        x0, x1, x2 = xs[ti]
        y0, y1, y2 = ys[ti]
        z0, z1, z2 = zs[ti]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-8:
            continue
        s = int(np.clip(shade[ti] * 255, 8, 255))
        color = np.array([s, s - 2 if s > 2 else s, s - 6 if s > 6 else s], dtype=np.uint8)
        for py in range(miny, maxy + 1):
            for px in range(minx, maxx + 1):
                w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den
                w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den
                w2 = 1.0 - w0 - w1
                if w0 < -0.01 or w1 < -0.01 or w2 < -0.01:
                    continue
                zz = w0 * z0 + w1 * z1 + w2 * z2
                if zz < zbuf[py, px]:
                    zbuf[py, px] = zz
                    img[py, px] = color
    return img


def rasterize_points(pos, w=720, h=540, eye=None, look=None, radius=1):
    """Fast fallback splat if triangle fill is too slow — still shows tubes."""
    eye = np.array(eye if eye is not None else (0.42, 0.22, 0.38))
    look = np.array(look if look is not None else (0.01, 0.14, -0.02))
    fwd = look - eye
    fwd /= np.linalg.norm(fwd)
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(fwd, up)
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    rel = pos - look
    x = rel @ right
    y = rel @ up
    z = rel @ fwd
    scale = 1.55
    col = ((x * scale) * 0.5 + 0.5) * (w - 1)
    row = (0.5 - (y * scale) * 0.5) * (h - 1)
    zbuf = np.full((h, w), 1e9, dtype=np.float32)
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = (22, 20, 24)
    # height shade
    t = np.clip((pos[:, 1] - 0.0) / 0.40, 0, 1)
    for i in range(len(pos)):
        px = int(round(col[i]))
        py = int(round(row[i]))
        if px < 0 or py < 0 or px >= w or py >= h:
            continue
        if z[i] >= zbuf[py, px]:
            continue
        zbuf[py, px] = z[i]
        s = int(40 + 200 * t[i])
        img[py, px] = (s, s - 4, s - 10)
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if dx * dx + dy * dy > radius * radius:
                    continue
                qx, qy = px + dx, py + dy
                if 0 <= qx < w and 0 <= qy < h and z[i] < zbuf[qy, qx]:
                    zbuf[qy, qx] = z[i]
                    img[qy, qx] = (s, s - 4, s - 10)
    return img


def lock_weights(pos, joints_idx, weights, names, rest_world):
    name_to_j = {n: i for i, n in enumerate(names)}
    paw_js = np.array([name_to_j[n] for n in PAW_NAMES])
    paw_heads = rest_world[paw_js, :3, 3]
    J = len(names)
    heads = rest_world[:, :3, 3]
    yaxis = rest_world[:, :3, 1]
    # leaf length ~3cm along bone Y
    tails = heads + yaxis * 0.028
    # better tails from children
    child_of = {n: [] for n in names}
    for chain in LIMB_CHAINS.values():
        for a, b in zip(chain, chain[1:]):
            child_of[a].append(b)
    for i, n in enumerate(names):
        kids = child_of.get(n) or []
        if kids:
            tails[i] = heads[name_to_j[kids[0]]]

    V = pos.shape[0]
    # distance to each bone segment
    dseg = np.empty((V, J), dtype=np.float64)
    for j in range(J):
        a = heads[j]
        b = tails[j]
        ab = b - a
        l2 = float(np.dot(ab, ab))
        if l2 < 1e-12:
            dseg[:, j] = np.linalg.norm(pos - a, axis=1)
            continue
        t = np.clip(((pos - a) @ ab) / l2, 0.0, 1.0)
        proj = a + t[:, None] * ab
        dseg[:, j] = np.linalg.norm(pos - proj, axis=1)
    nearest = np.argmin(dseg, axis=1)
    nearest_d = dseg[np.arange(V), nearest]
    nearest_name = np.array(names)[nearest]

    # xz distance to each paw
    dxz = np.stack(
        [np.linalg.norm(pos[:, [0, 2]] - paw_heads[k, [0, 2]], axis=1) for k in range(4)],
        axis=1,
    )
    paw_xz_i = np.argmin(dxz, axis=1)
    paw_xz_d = dxz[np.arange(V), paw_xz_i]

    body_js = np.array(
        [i for i, n in enumerate(names) if n.startswith(BODY_PREFIXES) or n in BODY_PREFIXES],
        dtype=np.int32,
    )
    distal_to_paw = {name_to_j[k]: name_to_j[v] for k, v in DISTAL.items()}
    chain_js = {
        side: np.array([name_to_j[n] for n in bones]) for side, bones in LIMB_CHAINS.items()
    }
    joint_to_chain = {}
    for side, bones in LIMB_CHAINS.items():
        for n in bones:
            joint_to_chain[name_to_j[n]] = side

    new_j = joints_idx.copy()
    new_w = weights.copy()
    paw_locked = 0
    limb_isolated = 0

    for i in range(V):
        p = pos[i]
        nj = int(nearest[i])
        nm = names[nj]
        exclusive_paw = None
        if nm in PAW_NAMES and nearest_d[i] < PAW_CAPTURE:
            exclusive_paw = nj
        elif p[1] < PAW_Y and paw_xz_d[i] < PAW_XZ and names[nj] in DISTAL:
            exclusive_paw = distal_to_paw.get(nj, paw_js[int(paw_xz_i[i])])
        elif p[1] < 0.045 and paw_xz_d[i] < 0.07:
            exclusive_paw = paw_js[int(paw_xz_i[i])]

        if exclusive_paw is not None:
            new_j[i] = (exclusive_paw, 0, 0, 0)
            new_w[i] = (1.0, 0.0, 0.0, 0.0)
            paw_locked += 1
            continue

        side = joint_to_chain.get(nj)
        if side and nm not in ("shoulder_L", "shoulder_R", "hip_L", "hip_R"):
            # distal/mid limb card: drop body + contralateral, keep this chain
            allow = set(chain_js[side].tolist())
            kept = []
            for k in range(4):
                j = int(joints_idx[i, k])
                w = float(weights[i, k])
                if w > 1e-4 and j in allow:
                    kept.append((j, w))
            if not kept:
                # nearest two in-chain
                dd = dseg[i, chain_js[side]]
                order = np.argsort(dd)[:2]
                for oi in order:
                    kept.append((int(chain_js[side][oi]), 1.0 / max(dd[oi], 0.006) ** 2))
            tot = sum(w for _, w in kept) or 1.0
            packed = [(j, w / tot) for j, w in kept[:4]]
            while len(packed) < 4:
                packed.append((packed[0][0], 0.0))
            new_j[i] = tuple(j for j, _ in packed)
            new_w[i] = tuple(w for _, w in packed)
            limb_isolated += 1
            continue

        # body / shoulder blend: strip contralateral paws/arms if they snuck in
        kept = []
        for k in range(4):
            j = int(joints_idx[i, k])
            w = float(weights[i, k])
            if w <= 1e-4:
                continue
            # drop the other side's distal bones from a body vert
            kept.append((j, w))
        if kept:
            tot = sum(w for _, w in kept) or 1.0
            packed = [(j, w / tot) for j, w in kept[:4]]
            while len(packed) < 4:
                packed.append((0, 0.0))
            new_j[i] = tuple(j for j, _ in packed)
            new_w[i] = tuple(w for _, w in packed)

    return new_j, new_w, paw_locked, limb_isolated


def clip_max_deltas(gltf, blob, anim_name, bones):
    anim = next(a for a in gltf["animations"] if a["name"] == anim_name)
    nodes = gltf["nodes"]
    out = {}
    for bone in bones:
        ch, samp = find_channel(gltf, anim, bone, "rotation")
        if samp is None:
            continue
        ni = ch["target"]["node"]
        rest = node_trs(nodes[ni])[1]
        quats = read_f32_vec(gltf, blob, samp["output"])
        out[bone] = rest_delta_deg(rest, quats)
    return out


def tame_clip(gltf, blob, anim_name, rot_scale, trs_scale):
    anim = next(a for a in gltf["animations"] if a["name"] == anim_name)
    nodes = gltf["nodes"]
    touched = {}
    for ch in anim["channels"]:
        ni = ch["target"]["node"]
        name = nodes[ni].get("name")
        path = ch["target"]["path"]
        samp = anim["samplers"][ch["sampler"]]
        if path == "rotation" and name in rot_scale:
            rest = node_trs(nodes[ni])[1]
            quats = read_f32_vec(gltf, blob, samp["output"])
            scale = rot_scale[name]
            tamed = np.array([tame_quat(rest, q, scale) for q in quats], dtype=np.float32)
            write_f32_vec(gltf, blob, samp["output"], tamed)
            touched[name] = {
                "before": rest_delta_deg(rest, quats),
                "after": rest_delta_deg(rest, tamed),
                "scale": scale,
            }
        elif path == "translation" and name in trs_scale:
            rest = node_trs(nodes[ni])[0]
            vals = read_f32_vec(gltf, blob, samp["output"])
            scale = trs_scale[name]
            tamed = rest + (vals - rest) * scale
            write_f32_vec(gltf, blob, samp["output"], tamed.astype(np.float32))
            before = float(np.max(np.linalg.norm(vals - rest, axis=1)))
            after = float(np.max(np.linalg.norm(tamed - rest, axis=1)))
            touched[name + ".trs"] = {"before": before, "after": after, "scale": scale}
    return touched


def exclusive_paw_frac(pos, joints_idx, weights, names, y_cut=0.045):
    name_to_j = {n: i for i, n in enumerate(names)}
    paw = {name_to_j[n] for n in PAW_NAMES}
    low = pos[:, 1] < y_cut
    n = int(low.sum())
    if n == 0:
        return 0.0, 0
    jj = joints_idx[low]
    ww = weights[low]
    ok = 0
    for i in range(n):
        k = int(np.argmax(ww[i]))
        if int(jj[i, k]) in paw and ww[i, k] >= 0.99:
            ok += 1
    return ok / n, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default="public/assets/models/suki.glb")
    ap.add_argument("--out", dest="dst", default="public/assets/models/suki.glb")
    ap.add_argument("--stills", default="tools/character-pipe/stills")
    ap.add_argument("--report", default="tools/character-pipe/paw-mesh-report.json")
    args = ap.parse_args()

    src = Path(args.src)
    gltf, blob = load_glb(src)
    nodes = gltf["nodes"]
    skin = gltf["skins"][0]
    names = [nodes[j]["name"] for j in skin["joints"]]
    prim = gltf["meshes"][0]["primitives"][0]
    pos = read_f32_vec(gltf, blob, prim["attributes"]["POSITION"])
    joints_idx = read_u8_vec4(gltf, blob, prim["attributes"]["JOINTS_0"])
    weights = read_f32_vec(gltf, blob, prim["attributes"]["WEIGHTS_0"])
    faces = read_indices(gltf, blob, prim["indices"]).reshape(-1, 3)

    swipe_before = clip_max_deltas(
        gltf, blob, "Swipe", list(SWIPE_ROT_SCALE.keys())
    )
    hit_before = clip_max_deltas(gltf, blob, "Hit", list(HIT_ROT_SCALE.keys()))
    paw_frac_before, low_n = exclusive_paw_frac(pos, joints_idx, weights, names)

    already = swipe_before.get("upper_FL", 99) <= 28 and paw_frac_before >= 0.85
    if already:
        print("GLB already tamed — skip clip/weight writes, stills only", flush=True)
        swipe_tame = {}
        hit_tame = {}
        new_j, new_w = joints_idx, weights
        paw_locked = limb_isolated = 0
        ibm, rest_world = ibm_worlds(gltf, blob)
    else:
        swipe_tame = tame_clip(gltf, blob, "Swipe", SWIPE_ROT_SCALE, {})
        hit_tame = tame_clip(gltf, blob, "Hit", HIT_ROT_SCALE, HIT_TRS_SCALE)

        ibm, rest_world = ibm_worlds(gltf, blob)
        new_j, new_w, paw_locked, limb_isolated = lock_weights(
            pos, joints_idx, weights, names, rest_world
        )
        write_u8_vec4(gltf, blob, prim["attributes"]["JOINTS_0"], new_j)
        write_f32_vec(gltf, blob, prim["attributes"]["WEIGHTS_0"], new_w)

    swipe_after = clip_max_deltas(gltf, blob, "Swipe", list(SWIPE_ROT_SCALE.keys()))
    hit_after = clip_max_deltas(gltf, blob, "Hit", list(HIT_ROT_SCALE.keys()))
    paw_frac_after, _ = exclusive_paw_frac(pos, new_j, new_w, names)

    dst = Path(args.dst)
    save_glb(dst, gltf, blob)

    # stills from the patched buffers
    parent, joint_nodes = joint_hierarchy(gltf)
    rest_pose = posed_worlds(gltf, blob, "Idle", 0.0, ibm, parent, joint_nodes)
    swipe_pose = posed_worlds(gltf, blob, "Swipe", 0.40, ibm, parent, joint_nodes)
    hit_pose = posed_worlds(gltf, blob, "Hit", 0.23, ibm, parent, joint_nodes)
    rest_v = skin_points(pos, new_j, new_w, rest_pose, ibm)
    swipe_v = skin_points(pos, new_j, new_w, swipe_pose, ibm)
    hit_v = skin_points(pos, new_j, new_w, hit_pose, ibm)

    stills = Path(args.stills)
    print("rasterizing stills…", flush=True)
    # Point splat is the reliable still (triangle fill is too slow in CPython
    # on 140k tris). Radius 2 reads as a volume; tubes would be long thin traces.
    for name, verts in (("rest", rest_v), ("swipe", swipe_v), ("hit", hit_v)):
        img = rasterize_points(verts, radius=2)
        write_png(stills / f"gs-paw-mesh-{name}.png", img)
        print(f"  wrote {stills / f'gs-paw-mesh-{name}.png'}")

    report = {
        "input": str(src),
        "output": str(dst),
        "verts": int(pos.shape[0]),
        "paw_locked": int(paw_locked),
        "limb_isolated": int(limb_isolated),
        "low_y_exclusive_before": paw_frac_before,
        "low_y_exclusive_after": paw_frac_after,
        "low_y_count": int(low_n),
        "swipe_before": swipe_before,
        "swipe_after": swipe_after,
        "hit_before": hit_before,
        "hit_after": hit_after,
        "swipe_tame": swipe_tame,
        "hit_tame": hit_tame,
    }
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    if paw_frac_after < 0.85:
        print("WARN: low-Y exclusive paw bind < 0.85", file=sys.stderr)
        return 1
    if swipe_after.get("upper_FL", 99) > 28:
        print("WARN: Swipe upper_FL still too hot", file=sys.stderr)
        return 1
    if hit_after.get("neck", 99) > 14:
        print("WARN: Hit neck still too hot", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Minimal BlenderMCP socket client for live sculpt sessions."""
import socket
import json
import sys

HOST, PORT = 'localhost', 9876


def cmd(cmd_type: str, params: dict | None = None, timeout: float = 60.0):
    s = socket.create_connection((HOST, PORT), timeout=timeout)
    payload = json.dumps({"type": cmd_type, "params": params or {}}).encode()
    s.sendall(payload)
    data = b''
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        data += chunk
        try:
            resp = json.loads(data.decode())
            s.close()
            return resp
        except json.JSONDecodeError:
            continue
    s.close()
    raise RuntimeError(f'no complete response for {cmd_type}: {data[:200]}')


def run(code: str):
    """Execute bpy python inside the live Blender and return status."""
    resp = cmd('execute_code', {'code': code})
    status = resp.get('status')
    if status != 'success':
        raise RuntimeError(f'execute_code failed: {json.dumps(resp)[:800]}')
    return resp.get('result')


def shot(path: str, max_size: int = 900):
    resp = cmd('get_viewport_screenshot', {'filepath': path, 'max_size': max_size})
    if resp.get('status') != 'success':
        raise RuntimeError(f'screenshot failed: {json.dumps(resp)[:400]}')
    return path


if __name__ == '__main__':
    if sys.argv[1] == 'shot':
        print(shot(sys.argv[2]))
    elif sys.argv[1] == 'run':
        print(run(sys.argv[2]))
    elif sys.argv[1] == 'cmd':
        print(json.dumps(cmd(sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else None), indent=1))

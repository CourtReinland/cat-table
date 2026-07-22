"""Launch helper: opens a clean scene and starts the BlenderMCP socket server (port 9876)."""
import bpy

# start from the default empty scene and bring the MCP bridge up
bpy.ops.blendermcp.start_server()
print('[mcp] BlenderMCP socket server started on localhost:9876')

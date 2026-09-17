import bpy
from pathlib import Path


blend_dir = Path(bpy.path.abspath("//"))
texture_dir = blend_dir / "redrawn-v3"
texture_map = {
    "Highwind1.png": "Highwind1-redrawn-v3.webp",
    "Highwind2.png": "Highwind2-redrawn-v3.webp",
    "Highwind3.png": "Highwind3-redrawn-v3.webp",
}

for image_name, texture_name in texture_map.items():
    original_image = bpy.data.images.get(image_name)
    if original_image is None:
        raise RuntimeError(f"Image datablock not found: {image_name}")

    texture_path = texture_dir / texture_name
    if not texture_path.is_file():
        raise RuntimeError(f"Texture file not found: {texture_path}")

    v3_image = bpy.data.images.load(str(texture_path), check_existing=False)
    v3_image.name = Path(texture_name).stem
    v3_image.pack()

    for material in bpy.data.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image == original_image:
                node.image = v3_image

bpy.context.scene["asset_revision"] = "Highwind V3 / redrawn-v3"
bpy.context.scene["texture_revision"] = "redrawn-v3"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_dir / "Highwind-v3.blend"))

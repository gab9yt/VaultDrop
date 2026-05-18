import os
import random
from typing import List, Dict
from pydantic import BaseModel

sys_random = random.SystemRandom()

class Skin(BaseModel):
    name: str
    rarity: str
    filename: str
    box_name: str
    image_url: str

class BoxInfo(BaseModel):
    name: str
    skin_count: int
    skins: List[Skin]

class BoxScanner:
    def __init__(self, root_dir: str):
        self.root_dir = root_dir

    def scan_boxes(self) -> Dict[str, BoxInfo]:
        inventory = {}
        if not os.path.exists(self.root_dir):
            os.makedirs(self.root_dir)
            return {}

        for box_folder in os.listdir(self.root_dir):
            if box_folder == "boxesstyle": continue
            box_path = os.path.join(self.root_dir, box_folder)
            if os.path.isdir(box_path):
                skins = []
                print(f"Scanning folder: {box_folder}")
                for filename in os.listdir(box_path):
                    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.glb', '.gltf')):
                        print(f"MATCH found in {box_folder}: {filename}")
                        parts = filename.split('_', 1)
                        rarity = parts[0] if len(parts) > 1 else "Commun"
                        name = os.path.splitext(parts[1] if len(parts) > 1 else parts[0])[0].replace('_', ' ')
                        
                        skins.append(Skin(
                            name=name,
                            rarity=rarity,
                            filename=filename,
                            box_name=box_folder,
                            image_url=f"/static/boxes/{box_folder}/{filename}"
                        ))
                
                inventory[box_folder] = BoxInfo(
                    name=box_folder,
                    skin_count=len(skins),
                    skins=skins
                )
        return inventory

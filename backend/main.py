import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from services.scanner import BoxScanner

app = FastAPI(title="Kinetic Economy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BOXES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "boxes"))
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

app.mount("/static/boxes", StaticFiles(directory=BOXES_DIR), name="boxes")

scanner = BoxScanner(BOXES_DIR)

@app.get("/api/boxes")
def get_boxes():
    """Retourne la liste des caisses et leurs skins (détection automatique)."""
    return scanner.scan_boxes()

@app.get("/api/boxes/{box_name}")
def get_box_details(box_name: str):
    """Retourne les détails d'une caisse spécifique."""
    boxes = scanner.scan_boxes()
    if box_name in boxes:
        return boxes[box_name]
    return {"error": "Caisse non trouvée"}

# Monter le frontend en dernier pour servir index.html à la racine
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

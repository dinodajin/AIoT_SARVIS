import cv2
import numpy as np
from insightface.app import FaceAnalysis
import os

# 1. Initialize Buffalo_SC (Lightweight but accurate)
print("Loading Buffalo_SC Model...")
app_sc = FaceAnalysis(
    name='buffalo_sc', 
    providers=['CPUExecutionProvider'],
    allowed_modules=['detection', 'recognition']
)
# Using 320x320 for faster inference, suitable for mobile-sized tasks
app_sc.prepare(ctx_id=0, det_size=(320, 320))

def get_embedding(image_path):
    if not os.path.exists(image_path):
        print("Error: File not found -> " + image_path)
        return None
    
    img = cv2.imread(image_path)
    if img is None:
        return None
        
    faces = app_sc.get(img)
    
    if len(faces) == 0:
        print("Error: No face detected in -> " + image_path)
        return None
    
    # Return normalized embedding
    return faces[0].normed_embedding

# 2. Process both photos with SAME Buffalo_SC model
print("\n[Step 1] Processing Android photo with Buffalo_SC...")
emb_android = get_embedding("android_photo.jpg")

print("[Step 2] Processing Webcam photo with Buffalo_SC...")
emb_webcam = get_embedding("webcam_photo.jpg")

# 3. Compare Results
print("\n" + "="*45)
print("      Unified Model Similarity Result (SC)")
print("="*45)

if emb_android is not None and emb_webcam is not None:
    # Cosine similarity via dot product
    score = np.dot(emb_android, emb_webcam)
    print(" Android(SC) vs Webcam(SC) : " + "{:.4f}".format(score))
    
    # Standard threshold for Buffalo_SC is around 0.4 ~ 0.5
    if score > 0.45:
        print(" Result: MATCH (Same Person)")
    else:
        print(" Result: NO MATCH (Different Person)")
else:
    print(" Comparison failed: Could not extract embeddings.")

print("="*45)
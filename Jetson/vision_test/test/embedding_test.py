import cv2
import numpy as np
from insightface.app import FaceAnalysis
import os

# 1. Initialize FaceAnalysis
app_face = FaceAnalysis(
    name='buffalo_sc', 
    providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
    allowed_modules=['detection', 'recognition']
)
app_face.prepare(ctx_id=0, det_size=(320, 320))

def get_embedding(image_path):
    if not os.path.exists(image_path):
        print("Error: File not found -> " + image_path)
        return None

    img = cv2.imread(image_path)
    if img is None:
        return None

    # Detect faces and extract features
    faces = app_face.get(img)
    
    if len(faces) == 0:
        print("Error: No face detected in -> " + image_path)
        return None
    
    # Return normalized embedding of the first face detected
    return faces[0].normed_embedding

def calculate_similarity(emb1, emb2):
    if emb1 is None or emb2 is None:
        return 0.0
    return np.dot(emb1, emb2)

# 2. File list
targets = {
    "iPhone": "iphone_photo.jpg",
    "Android": "android_photo.jpg",
    "Webcam": "webcam_photo.jpg"
}

# 3. Process embeddings
embeddings = {}
for name, path in targets.items():
    print("Processing: " + name)
    embeddings[name] = get_embedding(path)

# 4. Print Results
print("\n" + "="*45)
print("      Similarity Comparison Results")
print("="*45)

pairs = [("iPhone", "Android"), ("iPhone", "Webcam"), ("Android", "Webcam")]

for d1, d2 in pairs:
    score = calculate_similarity(embeddings[d1], embeddings[d2])
    # Threshold 0.45 is common for Buffalo models
    result = "SAME" if score > 0.45 else "DIFF"
    print(d1 + " vs " + d2 + " : " + "{:.4f}".format(score) + " [" + result + "]")

print("="*45)
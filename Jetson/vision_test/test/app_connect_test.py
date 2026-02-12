import socket
from flask import Flask, request, jsonify
import cv2
import numpy as np
import gc

app = Flask(__name__)

@app.route('/upload_face', methods=['POST'])
def upload_face():
    try:
        # 1. Read file from request
        if 'image' not in request.files:
            return jsonify({"error": "No image key in request"}), 400
            
        file = request.files['image']
        
        # 2. Convert to numpy array without saving to disk
        file_bytes = np.frombuffer(file.read(), np.uint8)
        
        # 3. Decode to OpenCV image (RAM only)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        cv2.imwrite('test_received.jpg', img)

        if img is not None:
            # --- START: Your Embedding Logic Here ---
            # Example: print image shape to console
            print("Image received. Shape: {}".format(img.shape))
            # --- END ---
            
            # 4. Explicit memory management
            del img
            del file_bytes
            gc.collect() 

            return jsonify({"status": "success", "message": "Image processed in memory"}), 200
        else:
            return jsonify({"error": "Decode failed"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run server on SoftAP Gateway IP
    app.run(host='10.42.0.1', port=5000, debug=True)
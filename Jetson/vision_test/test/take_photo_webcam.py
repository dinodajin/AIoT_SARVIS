import cv2
import time
import os

def take_photo():
    # Attempt to open the webcam (index 0)
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Error: Could not open webcam. Check connection.")
        return

    print("Camera is active. Taking a photo in 3 seconds...")
    print("Please look at the camera.")

    # Countdown for 3 seconds to let camera adjust light
    for i in range(3, 0, -1):
        print(f"{i}...")
        time.sleep(1)

    # Capture one frame
    ret, frame = cap.read()

    if ret:
        filename = "webcam_photo.jpg"
        cv2.imwrite(filename, frame)
        print(f"Success! Saved as: {os.path.abspath(filename)}")
    else:
        print("Error: Failed to capture image.")

    # Cleanup
    cap.release()

if __name__ == "__main__":
    take_photo()
import cv2

# CSI 카메라의 경우 GStreamer 파이프라인 설정이 필요할 수 있습니다.
cap = cv2.VideoCapture(0) 

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    cv2.imshow('S.A.R.V.I.S Camera Test', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

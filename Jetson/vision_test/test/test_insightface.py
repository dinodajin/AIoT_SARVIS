import cv2
from insightface.app import FaceAnalysis

app = FaceAnalysis(name='antelopev2', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

cap = cv2.VideoCapture(0)

# 한 프레임만 잡아서 저장해보기
ret, frame = cap.read()
if ret:
    faces = app.get(frame)
    for face in faces:
        bbox = face.bbox.astype(int)
        # 얼굴에 사각형 그리기
        cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 2)
        # 이름 대신 인식 결과 쓰기
        cv2.putText(frame, "Detected", (bbox[0], bbox[1]-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

    # 결과를 파일로 저장
    cv2.imwrite('result.jpg', frame)
    print("인식 결과가 'result.jpg'로 저장되었습니다. 왼쪽 파일 목록에서 확인하세요!")

cap.release()

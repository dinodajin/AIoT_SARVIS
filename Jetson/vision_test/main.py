# -*- coding: utf-8 -*-
import uvicorn
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from services import process_registration, process_login
import api_client # 추가

app = FastAPI()

# 서버 시작 시 소켓 초기화
@app.on_event("startup")
async def startup_event():
    api_client.init_socket()

class SignupRequest(BaseModel):
    uid: str

@app.post("/start-signup/")
async def start_signup(request: SignupRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_registration, request.uid)
    return {"status": "started"}

@app.post("/start-login/")
async def start_login(background_tasks: BackgroundTasks):
    background_tasks.add_task(process_login)
    return {"status": "started"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
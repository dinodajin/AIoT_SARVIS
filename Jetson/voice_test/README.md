# voice recognition folder

## Install (Jetson)
pip install -r requirements.lock.txt

## Full Process
- mic (always on)
- preprocess (highpass filter, notch filter, denoise, etc)
- RMS Gate
- VAD
- Segment
- Wake Word ("SARVIS")
- KWS (Keyword Selection)
- Intent / LLM (Parsing)
- Command JSON
- Raspberry Pi

### 01/16 development
- getting input -> preprocess

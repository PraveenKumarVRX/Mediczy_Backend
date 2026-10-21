"""Private model-backed speaker inference. Raw audio is processed in memory only."""
from __future__ import annotations
import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import time
import wave
from collections import OrderedDict
import aiohttp
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict

app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
_seen=OrderedDict()
_model=None
_spoof=None
_lock=asyncio.Lock()

class Payload(BaseModel):
    model_config=ConfigDict(extra='forbid')
    audio:str
    phrase:str

def decode_wave(value):
    try:
        raw=base64.b64decode(value,validate=True)
        if len(raw)>660000: raise ValueError('size')
        with wave.open(io.BytesIO(raw),'rb') as wav:
            if wav.getnchannels()!=1 or wav.getsampwidth()!=2 or wav.getframerate()!=16000: raise ValueError('format')
            if not 3<=wav.getnframes()/16000<=20: raise ValueError('duration')
            samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
        if np.sqrt(np.mean(samples*samples))<0.005: raise ValueError('silence')
        return raw,samples
    except Exception as exc:
        raise HTTPException(422,'Require 3–20 seconds of audible mono 16 kHz PCM16 WAV') from exc

def checked_file(path,expected):
    p=Path(path)
    if not p.is_file() or not expected or hashlib.sha256(p.read_bytes()).hexdigest()!=expected: raise RuntimeError('Pinned model hash mismatch')
    return p

def encode(samples):
    global _model,_spoof
    import torch
    from speechbrain.inference.classifiers import EncoderClassifier
    directory=Path(os.environ['VOICE_SPEAKER_MODEL_DIR']).resolve()
    checked_file(directory/'embedding_model.ckpt',os.environ['VOICE_BIOMETRIC_MODEL_SHA256'])
    checked_file(directory/'hyperparams.yaml',os.environ['VOICE_SPEAKER_CONFIG_SHA256'])
    if _model is None:
        manifest=json.loads((Path(__file__).parent/'model-manifest.json').read_text())
        for name,digest in manifest['files'].items(): checked_file(directory/name,digest)
        # All loadables must come from the reviewed local artifact, never the
        # mutable upstream path embedded in the original YAML.
        _model=EncoderClassifier.from_hparams(source=str(directory),savedir=str(directory),overrides={'pretrained_path':str(directory)},run_opts={'device':os.environ.get('VOICE_SPEAKER_DEVICE','cpu')})
    audio=torch.from_numpy(samples.copy()).unsqueeze(0)
    with torch.inference_mode():
        embedding=_model.encode_batch(audio).squeeze().cpu().tolist()
        live=False
        anti_hash=os.environ.get('VOICE_ANTISPOOF_MODEL_SHA256')
        if anti_hash:
            path=checked_file(os.environ['VOICE_ANTISPOOF_MODEL_PATH'],anti_hash)
            if _spoof is None: _spoof=torch.jit.load(str(path),map_location='cpu').eval()
            # Approved TorchScript contract: [batch, samples] -> logits [spoof, bona_fide].
            logits=_spoof(audio)
            if list(logits.shape)!=[1,2]: raise RuntimeError('Invalid antispoof model output')
            live=bool(torch.softmax(logits,dim=-1)[0,1].item()>=float(os.environ.get('VOICE_ANTISPOOF_THRESHOLD','0.99')))
    if len(embedding)!=192 or not np.isfinite(embedding).all(): raise RuntimeError('Invalid ECAPA output')
    return {'embedding':embedding,'liveness':live,'antiSpoofModel':anti_hash,'model':os.environ['VOICE_BIOMETRIC_MODEL_SHA256']}

async def transcribe(raw):
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as http:
        form=aiohttp.FormData();form.add_field('file',raw,filename='challenge.wav',content_type='audio/wav');form.add_field('model','whisper-large-v3-turbo');form.add_field('language','en')
        async with http.post('https://api.groq.com/openai/v1/audio/transcriptions',data=form,headers={'Authorization':'Bearer '+os.environ['GROQ_API_KEY']},allow_redirects=False) as response:
            if response.status!=200: raise RuntimeError('Challenge transcription unavailable')
            return (await response.json())['text']

@app.post('/v1/embed')
async def infer(request:Request):
    if int(request.headers.get('content-length','0'))>910000: raise HTTPException(413,'Audio payload too large')
    chunks=[];size=0
    async for chunk in request.stream():
        size+=len(chunk)
        if size>910000: raise HTTPException(413,'Audio payload too large')
        chunks.append(chunk)
    raw=b''.join(chunks)
    stamp=request.headers.get('x-voice-timestamp','');nonce=request.headers.get('x-voice-nonce','');sig=request.headers.get('x-voice-signature','')
    secret=os.environ.get('VOICE_BIOMETRIC_SECRET')
    if not secret or not stamp.isdigit() or abs(time.time()*1000-int(stamp))>120000 or not 16<=len(nonce)<=80: raise HTTPException(403,'Invalid service signature')
    expected=hmac.new(secret.encode(),stamp.encode()+b'.'+nonce.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,sig): raise HTTPException(403,'Invalid service signature')
    while _seen and next(iter(_seen.values()))<time.time()-120: _seen.popitem(last=False)
    if nonce in _seen: raise HTTPException(409,'Replayed inference request')
    _seen[nonce]=time.time()
    if len(_seen)>5000: _seen.popitem(last=False)
    try: value=Payload.model_validate_json(raw)
    except Exception as exc: raise HTTPException(422,'Invalid inference payload') from exc
    audio,samples=decode_wave(value.audio)
    try:
        transcript=await transcribe(audio)
        async with _lock: result=await asyncio.to_thread(encode,samples)
        return {**result,'transcript':transcript}
    except Exception as exc:
        raise HTTPException(503,'Speaker inference unavailable') from exc

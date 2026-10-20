import asyncio,base64,hashlib,hmac,io,json,os,sys,unittest,uuid,wave
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import contact_center_worker as worker
sys.path.insert(0,str(Path(__file__).parent.parent/'voice-biometrics'))
import service as speaker
from evaluate import upper95

class AudioContract(unittest.TestCase):
 def test_toy_datasets_cannot_establish_a_low_false_accept_rate(self):
  self.assertGreater(upper95(0,10),.001);self.assertLess(upper95(0,5000),.001)
 def wave(self,channels=1,duration=4,silent=False):
  data=np.zeros(16000*duration*channels,dtype='<i2') if silent else (5000*np.sin(np.arange(16000*duration*channels)*.03)).astype('<i2')
  out=io.BytesIO()
  with wave.open(out,'wb') as f:f.setnchannels(channels);f.setsampwidth(2);f.setframerate(16000);f.writeframes(data.tobytes())
  return base64.b64encode(out.getvalue()).decode()
 def test_audio_is_decoded_to_bounded_mono_samples(self):
  raw,samples=speaker.decode_wave(self.wave());self.assertEqual(len(samples),64000);self.assertEqual(samples.dtype,np.float32)
 def test_silence_stereo_short_and_malformed_audio_rejected(self):
  for value in [self.wave(silent=True),self.wave(channels=2),self.wave(duration=1),'not-audio']:
   with self.assertRaises(speaker.HTTPException):speaker.decode_wave(value)
 def test_payload_cannot_supply_similarity_or_model_scores(self):
  with self.assertRaises(Exception):speaker.Payload.model_validate({'audio':'test','phrase':'1 2 3','score':1})

class WorkerContract(unittest.IsolatedAsyncioTestCase):
 async def test_bot_uses_governed_backend_and_requests_human_handoff(self):
  bridge=SimpleNamespace(send=AsyncMock(return_value={'reply':'A staff member will help.','handoff':True}))
  agent=worker.ReceptionAgent(bridge)
  ctx=SimpleNamespace(items=[SimpleNamespace(role='user',text_content='Connect a human')])
  output=[text async for text in agent.llm_node(ctx,[],None)]
  self.assertEqual(output,['A staff member will help.']);self.assertTrue(agent.pending_handoff)
  bridge.send.assert_awaited_once_with('bot_reply',text='Connect a human',history=[])
 async def test_bot_control_api_failure_falls_back_without_clinical_actions(self):
  agent=worker.ReceptionAgent(SimpleNamespace(send=AsyncMock(side_effect=RuntimeError('UNAVAILABLE'))))
  result=[text async for text in agent.llm_node(SimpleNamespace(items=[]),[],None)]
  self.assertTrue(agent.pending_handoff);self.assertIn('hospital team',result[0])
 async def test_control_requests_are_signed_over_exact_utf8_json(self):
  captured={}
  class Response:
   status=200
   async def json(self):return {'ok':True}
   async def __aenter__(self):return self
   async def __aexit__(self,*args):return None
  class Session:
   def __init__(self,**kwargs):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):return None
   def post(self,url,**kwargs):captured.update(kwargs);return Response()
  with patch.dict(os.environ,{'VOICE_PUBLIC_BASE_URL':'https://approved.example','VOICE_INTERNAL_SECRET':'synthetic-secret'}),patch.object(worker.aiohttp,'ClientSession',Session):
   bridge=worker.Bridge('HOSPITAL_11',str(uuid.uuid4()));await bridge.send('bot_reply',text='नमस्ते')
  headers=captured['headers'];message=headers['X-Voice-Timestamp']+'.'+headers['X-Voice-Nonce']+'.'+captured['data'].decode()
  self.assertEqual(headers['X-Voice-Signature'],hmac.new(b'synthetic-secret',message.encode(),hashlib.sha256).hexdigest())
  self.assertFalse(captured['allow_redirects'])
 async def test_live_stt_track_emits_labeled_segment_and_broadcasts_only_redacted_text(self):
  ended=asyncio.Event()
  class Stream:
   def push_frame(self,frame):pass
   def end_input(self):ended.set()
   async def aclose(self):pass
   async def __aiter__(self):
    await ended.wait()
    yield SimpleNamespace(type=worker.stt.SpeechEventType.FINAL_TRANSCRIPT,alternatives=[SimpleNamespace(text='Email fixture@example.test')])
  class Recognizer:
   def __init__(self,**kwargs):pass
   def stream(self):return Stream()
   async def aclose(self):pass
  class Audio:
   def __init__(self,*args,**kwargs):pass
   async def __aiter__(self):
    for _ in range(10):yield SimpleNamespace(frame=SimpleNamespace(samples_per_channel=320,sample_rate=16000))
   async def aclose(self):pass
  bridge=SimpleNamespace(send=AsyncMock(return_value={'ok':True,'segment':{'text':'Email [REDACTED-EMAIL]'}}))
  publish=AsyncMock();ctx=SimpleNamespace(room=SimpleNamespace(local_participant=SimpleNamespace(publish_transcription=publish)))
  with patch.object(worker.stt,'StreamAdapter',Recognizer),patch.object(worker,'speech_provider',lambda lang:None),patch.object(worker.silero.VAD,'load',lambda **kwargs:None),patch.object(worker.rtc,'AudioStream',Audio):
   await worker.observe_track(ctx,bridge,SimpleNamespace(sid='TR_test'),SimpleNamespace(identity='caller'),worker.time.monotonic(),'en')
  call=bridge.send.await_args;self.assertEqual(call.args,('transcript',));self.assertEqual(call.kwargs['segment']['speaker'],'caller');self.assertTrue(call.kwargs['segment']['final'])
  self.assertEqual(publish.await_args.args[0].segments[0].text,'Email [REDACTED-EMAIL]')

if __name__=='__main__':unittest.main()

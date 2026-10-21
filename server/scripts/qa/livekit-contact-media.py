import asyncio,json,sys,math,struct
from pathlib import Path
from livekit import rtc

async def main():
    cfg=json.load(open(sys.argv[1])); rooms={k:rtc.Room() for k in cfg}; tracks={k:[] for k in cfg};frames={'caller':0,'agent':0,'coach':0}
    tasks=[]
    async def consume(track,side):
        async for event in rtc.AudioStream(track,sample_rate=16000,num_channels=1):
            frames[side]+=1
            if frames[side]>=20:break
    for side,room in rooms.items():
        def subscribed(track,publication,participant,side=side):
            tracks[side].append(participant.identity)
            if side in frames:tasks.append(asyncio.create_task(consume(track,side)))
        room.on('track_subscribed',subscribed)
    await asyncio.gather(*(room.connect(cfg[side]['serverUrl'],cfg[side]['token']) for side,room in rooms.items()))
    sources=[]
    for side in ['agent','caller','supervisor']:
        source=rtc.AudioSource(16000,1);track=rtc.LocalAudioTrack.create_audio_track(side,source);sources.append(source)
        await rooms[side].local_participant.publish_track(track,rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
    await asyncio.sleep(1)
    for index in range(80):
        data=struct.pack('<320h',*(int(5000*math.sin(2*math.pi*440*(index*320+i)/16000)) for i in range(320)))
        await asyncio.gather(*(source.capture_frame(rtc.AudioFrame(data,16000,1,320)) for source in sources))
        await asyncio.sleep(.02)
    await asyncio.sleep(2)
    assert 'agent-qa' in tracks['caller'],tracks
    assert 'caller' in tracks['agent'],tracks
    assert 'supervisor-qa' in tracks['coach'],tracks
    assert 'supervisor-qa' not in tracks['caller'],tracks
    assert all(count>10 for count in frames.values()),frames
    result={'passed':True,'checks':['Caller receives agent audio','Agent receives caller audio','Agent receives private coaching audio','Caller cannot subscribe to supervisor coaching room'],'receivedFrames':frames}
    directory=Path(sys.argv[2]);(directory/'ready.json').write_text(json.dumps(result))
    for _ in range(200):
        if (directory/'stop.signal').exists():break
        await asyncio.sleep(.1)
    for task in tasks:task.cancel()
    await asyncio.gather(*tasks,return_exceptions=True)
    await asyncio.gather(*(room.disconnect() for room in rooms.values()))
    print(json.dumps(result))
asyncio.run(main())

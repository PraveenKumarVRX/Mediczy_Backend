import {AccessToken,RoomServiceClient,SipClient,AgentDispatchClient,WebhookReceiver,DataPacket_Kind,TrackSource} from 'livekit-server-sdk';
import {createHmac,randomBytes} from 'node:crypto';
import {fail,phone} from './policy.js';

/** Reuses the application's existing LiveKit project, API key and secret. */
export function createLiveKitTransport({env=process.env,clients}={}){
  function connection(){
    const url=env.LIVEKIT_URL||env.LIVEKIT_API_URL,key=env.LIVEKIT_API_KEY,secret=env.LIVEKIT_API_SECRET;
    if(!url||!key||!secret||!/^wss:\/\//.test(url))throw fail(503,'LIVEKIT_NOT_CONFIGURED','The existing LiveKit project is not configured');
    const parsed=new URL(url);if(parsed.username||parsed.password)throw fail(503,'LIVEKIT_NOT_CONFIGURED','Invalid LiveKit server URL');
    return {url,key,secret,host:url.replace(/^wss:/,'https:')};
  }
  const api=()=>{const cfg=connection();return clients||{rooms:new RoomServiceClient(cfg.host,cfg.key,cfg.secret),sip:new SipClient(cfg.host,cfg.key,cfg.secret),dispatch:new AgentDispatchClient(cfg.host,cfg.key,cfg.secret)};};
  const permissions=publish=>({canPublish:publish,canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE],canUpdateMetadata:false});
  return {
    ready(){try{connection();return true;}catch{return false;}},
    async create(room,metadata){await api().rooms.createRoom({name:room,metadata:JSON.stringify(metadata),emptyTimeout:180,departureTimeout:30,maxParticipants:12});await api().rooms.createRoom({name:`${room}-coach`,emptyTimeout:180,departureTimeout:30,maxParticipants:4});},
    async token(room,identity,{publish=false,metadata={}}={}){
      const cfg=connection();const token=new AccessToken(cfg.key,cfg.secret,{identity,ttl:120,metadata:JSON.stringify(metadata)});
      token.addGrant({room,roomJoin:true,canPublish:publish,canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE],canUpdateOwnMetadata:false});
      return {serverUrl:cfg.url,roomName:room,token:await token.toJwt(),expiresIn:120};
    },
    async dial(uid,room,to){
      let binding;try{binding=JSON.parse(env.VOICE_LIVEKIT_BINDINGS||'{}')[uid];}catch{/* fail closed */}
      if(!binding?.outbound_trunk_id||!binding?.number)throw fail(503,'LIVEKIT_TRUNK_REQUIRED','Bind this hospital to an approved LiveKit SIP trunk and number');
      return api().sip.createSipParticipant(binding.outbound_trunk_id,phone(to),room,{participantIdentity:'caller',participantName:'Caller',fromNumber:phone(binding.number),hidePhoneNumber:true,ringingTimeout:45,maxCallDuration:3600,waitUntilAnswered:false});
    },
    async hold(room,held){await api().rooms.updateParticipant(room,'caller',{permission:{...permissions(!held),canSubscribe:!held}});},
    async permission(room,identity,publish){await api().rooms.updateParticipant(room,identity,{permission:permissions(publish)});},
    async remove(room,identity){await api().rooms.removeParticipant(room,identity);},
    async end(room){await api().rooms.deleteRoom(room);await api().rooms.deleteRoom(`${room}-coach`).catch(()=>{});},
    async dispatch(room,kind,metadata){return api().dispatch.createDispatch(room,kind==='bot'?'mediqzy-contact-bot':'mediqzy-contact-stt',{metadata:JSON.stringify(metadata)});},
    async stopDispatch(room,id){if(id)await api().dispatch.deleteDispatch(id,room);},
    async command(room,callId,action){
      if(!env.VOICE_INTERNAL_SECRET)throw fail(503,'VOICE_AGENT_NOT_CONFIGURED','Voice worker signing is not configured');
      const body={callId,action},timestamp=String(Date.now()),nonce=randomBytes(16).toString('hex');
      const signature=createHmac('sha256',env.VOICE_INTERNAL_SECRET).update(`${timestamp}.${nonce}.${JSON.stringify(body)}`).digest('hex');
      await api().rooms.sendData(room,Buffer.from(JSON.stringify({body,timestamp,nonce,signature})),DataPacket_Kind.RELIABLE,{topic:'mediqzy.voice.control'});
    },
    async webhook(raw,authorization){const cfg=connection();return new WebhookReceiver(cfg.key,cfg.secret).receive(raw,authorization,false,10);},
    async participants(room){return api().rooms.listParticipants(room);},
  };
}

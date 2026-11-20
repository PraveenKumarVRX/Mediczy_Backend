export function encodePcmWave(samples:Float32Array,sampleRate:number){
 const size=Math.round(samples.length*16000/sampleRate),buffer=new ArrayBuffer(44+size*2),view=new DataView(buffer);
 const text=(at:number,s:string)=>[...s].forEach((ch,i)=>view.setUint8(at+i,ch.charCodeAt(0)));
 text(0,'RIFF');view.setUint32(4,36+size*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,size*2,true);
 for(let i=0;i<size;i++){const source=i*sampleRate/16000,index=Math.floor(source),weight=source-index;const value=(samples[index]||0)*(1-weight)+(samples[index+1]||0)*weight;view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,value))*32767),true);}
 const bytes=new Uint8Array(buffer);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
}
export async function captureVoiceWave(signal:AbortSignal){
 const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true}});const context=new AudioContext({sampleRate:16000}),source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),sink=context.createGain();sink.gain.value=0;
 const chunks:Float32Array[]=[];processor.onaudioprocess=event=>chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));source.connect(processor);processor.connect(sink);sink.connect(context.destination);
 try{await context.resume();await new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new Error('Capture cancelled'));return;}const abort=()=>{clearTimeout(timer);reject(new Error('Capture cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},6000);signal.addEventListener('abort',abort,{once:true});});const length=chunks.reduce((s,c)=>s+c.length,0),samples=new Float32Array(length);let offset=0;for(const c of chunks){samples.set(c,offset);offset+=c.length;}return encodePcmWave(samples,context.sampleRate);}
 finally{stream.getTracks().forEach(track=>track.stop());processor.disconnect();source.disconnect();sink.disconnect();await context.close();}
}

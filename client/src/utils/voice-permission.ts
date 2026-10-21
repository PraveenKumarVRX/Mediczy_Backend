/** Ask before reserving a call or consuming a single-use caller invitation. */
export async function ensureVoiceMicrophone(){
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires a supported secure browser.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 stream.getTracks().forEach(track=>track.stop());
}

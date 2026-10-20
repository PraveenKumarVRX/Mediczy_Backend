declare module '@exotel-npm-dev/webrtc-client-sdk' {
  export class ExotelWebClient {
    static setEnableConsoleLogging(enabled:boolean):void;
    initWebrtc(account:Record<string,unknown>,registration:(state:string)=>void,calls:(call:any,state:string)=>void,sessions:(state:string)=>void):Promise<boolean>;
    DoRegister():boolean;
    UnRegister():void;
    getCall():any;
  }
}
declare module '@exotel-npm-dev/webrtc-core-sdk' {
  export function getLogger():{setEnableConsoleLogging:(value:boolean)=>void;registerLoggerCallback:(callback:(...args:unknown[])=>void)=>void};
}

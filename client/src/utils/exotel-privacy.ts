/** Disable both provider console output and its default persistent log sink before supplying SIP credentials. */
export function configurePrivateExotelLogging(Client:{setEnableConsoleLogging:(value:boolean)=>void},logger:{setEnableConsoleLogging:(value:boolean)=>void;registerLoggerCallback:(callback:(...args:unknown[])=>void)=>void}){
  Client.setEnableConsoleLogging(false);
  logger.setEnableConsoleLogging(false);
  logger.registerLoggerCallback(()=>{});
}

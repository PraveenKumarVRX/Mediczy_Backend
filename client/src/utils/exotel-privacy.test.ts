import {describe,it,expect,vi} from 'vitest';
import {configurePrivateExotelLogging} from './exotel-privacy';
describe('Exotel credential log protection',()=>{
  it('replaces the provider persistent sink before credentials are supplied',()=>{
    const persisted=vi.fn();let sink:(...args:unknown[])=>void=persisted;
    const Client={setEnableConsoleLogging:vi.fn()};
    const logger={setEnableConsoleLogging:vi.fn(),registerLoggerCallback:(callback:(...args:unknown[])=>void)=>{sink=callback;}};
    configurePrivateExotelLogging(Client,logger);
    sink('log','SIP account',{secret:'synthetic-secret-marker'});
    expect(persisted).not.toHaveBeenCalled();
    expect(Client.setEnableConsoleLogging).toHaveBeenCalledWith(false);
    expect(logger.setEnableConsoleLogging).toHaveBeenCalledWith(false);
  });
});

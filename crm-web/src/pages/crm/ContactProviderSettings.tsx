import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {CONTACT_CENTER_PROVIDERS,contactCenterProvider} from '@shared/contact-center-providers.mjs';
type Row=Record<string,any>;
export default function ContactProviderSettings({config,savedConfig,busy,onChange,onSave}:{config:Row;savedConfig:Row|null;busy:boolean;onChange:(c:Row)=>void;onSave:(c:Row)=>Promise<void>}){
  const drafts=useRef<Record<string,Row>>({}),[confirm,setConfirm]=useState(false);
  const provider=contactCenterProvider(config.provider)||CONTACT_CENTER_PROVIDERS[0];
  const changedProvider=Boolean(savedConfig&&(savedConfig.provider||'exotel')!==provider.id);
  const valid=/^\+[1-9]\d{7,14}$/.test(config.number||'')&&/^VOICE_[A-Z0-9_]{3,60}$/.test(config.credential_prefix||'')&&Number.isInteger(config.retention_days)&&config.retention_days>=1&&config.retention_days<=3650;
  const save=async()=>{await onSave({...config,provider:provider.id,recording_enabled:provider.recording&&Boolean(config.recording_enabled)});setConfirm(false);};
  return <section className="min-w-0 rounded-2xl border border-border bg-card text-card-foreground p-4 sm:p-5 shadow-sm">
    <h2 className="font-semibold mb-4">Calling provider</h2>
    <label htmlFor="voice-provider" className="block text-xs font-semibold text-muted-foreground mb-2">Provider</label>
    <select id="voice-provider" aria-label="Calling provider" disabled={busy} className="w-full rounded-lg border border-input bg-background text-foreground p-2" value={provider.id} onChange={e=>{
      drafts.current[provider.id]=config;const next=e.target.value;
      onChange(drafts.current[next]||{provider:next,credential_prefix:`VOICE_${next.toUpperCase()}`,number:'',enabled:false,recording_enabled:false,retention_days:config.retention_days||30,gateway_prefix:null});setConfirm(false);
    }}>{CONTACT_CENTER_PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
    <p className="text-sm text-muted-foreground mt-3">{provider.setup}</p>
    {provider.mode==='connector'&&<p className="text-xs text-muted-foreground mt-2">Calling stays unavailable until the server connection is configured. Recordings stay with your provider.</p>}
    <label className="block text-xs font-semibold text-muted-foreground mt-4 mb-2" htmlFor="voice-number">{provider.numberLabel}</label>
    <Input id="voice-number" aria-label={provider.numberLabel} disabled={busy} type="tel" placeholder="+91…" value={config.number} onChange={e=>onChange({...config,number:e.target.value})}/>
    <label className="block text-xs font-semibold text-muted-foreground mt-3 mb-2" htmlFor="voice-reference">Server credential reference</label>
    <Input id="voice-reference" aria-label="Credential reference" disabled={busy} value={config.credential_prefix} onChange={e=>onChange({...config,credential_prefix:e.target.value})}/>
    <p className="text-xs text-muted-foreground mt-2">Reference only. Provider keys stay in your server secret store.</p>
    <label className="flex gap-2 text-sm mt-4"><input type="checkbox" disabled={busy} checked={config.enabled} onChange={e=>onChange({...config,enabled:e.target.checked})}/>{provider.mode==='desktop'?'Enable Zoom Phone launch':'Enable calling'}</label>
    {provider.recording&&<label className="flex gap-2 text-sm mt-3"><input type="checkbox" disabled={busy} checked={config.recording_enabled} onChange={e=>onChange({...config,recording_enabled:e.target.checked})}/>Allow recording after consent</label>}
    <label className="block text-xs font-semibold text-muted-foreground mt-4 mb-2" htmlFor="voice-retention">Recording retention · days</label>
    <Input id="voice-retention" disabled={busy} type="number" min={1} max={3650} value={config.retention_days} onChange={e=>onChange({...config,retention_days:Number(e.target.value)})}/>
    {changedProvider&&<p className="text-sm text-muted-foreground mt-3">The current connection remains active until you save. Finish active calls before switching.</p>}
    {confirm?<div role="alert" className="mt-4 space-y-3"><p>Switch the active calling provider to {provider.label}? New calls will use this saved connection. Existing call history will be retained.</p><div className="flex gap-2"><Button disabled={busy||!valid} onClick={()=>void save()}>Confirm provider switch</Button><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Keep editing</Button></div></div>:<Button className="mt-4" disabled={busy||!valid} onClick={()=>changedProvider?setConfirm(true):void save()}>Save connection</Button>}
  </section>;
}

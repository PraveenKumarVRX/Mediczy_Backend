import { DragEvent, useEffect, useMemo, useState } from 'react';
import { GitBranch, Play, Plus, Save, Trash2 } from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });
const NODE_TYPES = ['trigger', 'condition', 'delay', 'split', 'randomizer', 'send_message', 'set_field', 'wait_for_reply', 'hand_to_human', 'http_request'];
type FlowNode = { nodeKey: string; nodeType: string; config: Record<string, unknown>; position: { x: number; y: number } };
type FlowEdge = { fromNodeKey: string; toNodeKey: string; branchKey: string };
type Flow = { id?: string; name: string; description?: string; trigger?: Record<string, unknown>; trigger_config?: Record<string, unknown>; nodes: FlowNode[]; edges: FlowEdge[]; status?: string };

const fromApiFlow = (value: any): Flow => ({
  ...value,
  trigger: value.trigger || value.trigger_config || {},
  nodes: (value.nodes || []).map((node: any) => ({ nodeKey: node.nodeKey || node.node_key, nodeType: node.nodeType || node.node_type, config: node.config || {}, position: node.position || { x: 80, y: 80 } })),
  edges: (value.edges || []).map((edge: any) => ({ fromNodeKey: edge.fromNodeKey || edge.from_node_key, toNodeKey: edge.toNodeKey || edge.to_node_key, branchKey: edge.branchKey || edge.branch_key || 'default' })),
});

const starter: Flow = {
  name: 'New lead follow-up', description: '', trigger: { event: 'lead.created' },
  nodes: [
    { nodeKey: 'trigger', nodeType: 'trigger', config: { event: 'lead.created' }, position: { x: 80, y: 80 } },
    { nodeKey: 'human', nodeType: 'hand_to_human', config: { queue: 'sales' }, position: { x: 340, y: 80 } },
  ], edges: [{ fromNodeKey: 'trigger', toNodeKey: 'human', branchKey: 'default' }],
};

export default function CRMFlowBuilderPage() {
  const [flows, setFlows] = useState<Flow[]>([]); const [form, setForm] = useState<Flow>(starter); const [selected, setSelected] = useState<Flow | null>(null); const [selectedKey, setSelectedKey] = useState(''); const [result, setResult] = useState<unknown>(null); const [error, setError] = useState('');
  const selectedNode = useMemo(() => form.nodes.find((node) => node.nodeKey === selectedKey) || null, [form.nodes, selectedKey]);

  const load = async () => { try { const { data } = await api.get('/crm/flows', { headers: auth() }); setFlows(data.flows || []); setError(''); } catch (e: any) { setError(e.response?.data?.message || 'Flow builder is disabled or unavailable.'); } };
  useEffect(() => { load(); }, []);

  const addNode = (type: string, position = { x: 80 + (form.nodes.length % 3) * 240, y: 80 + Math.floor(form.nodes.length / 3) * 140 }) => {
    const base = type.replace(/[^a-z0-9]+/gi, '_'); let key = base; let count = 2; while (form.nodes.some((node) => node.nodeKey === key)) key = `${base}_${count++}`;
    const node: FlowNode = { nodeKey: key, nodeType: type, config: {}, position };
    const previous = form.nodes[form.nodes.length - 1];
    setForm({ ...form, nodes: [...form.nodes, node], edges: previous ? [...form.edges, { fromNodeKey: previous.nodeKey, toNodeKey: key, branchKey: 'default' }] : form.edges }); setSelectedKey(key);
  };
  const dropNode = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const type = event.dataTransfer.getData('text/node-type'); if (!type) return; const box = event.currentTarget.getBoundingClientRect(); addNode(type, { x: Math.max(10, event.clientX - box.left - 70), y: Math.max(10, event.clientY - box.top - 30) }); };
  const updateSelected = (changes: Partial<FlowNode>) => {
    const nextKey = changes.nodeKey || selectedKey;
    const edges = nextKey === selectedKey ? form.edges : form.edges.map((edge) => ({
      ...edge,
      fromNodeKey: edge.fromNodeKey === selectedKey ? nextKey : edge.fromNodeKey,
      toNodeKey: edge.toNodeKey === selectedKey ? nextKey : edge.toNodeKey,
    }));
    setForm({ ...form, nodes: form.nodes.map((node) => node.nodeKey === selectedKey ? { ...node, ...changes } : node), edges });
    if (nextKey !== selectedKey) setSelectedKey(nextKey);
  };
  const removeSelected = () => { if (!selectedKey) return; setForm({ ...form, nodes: form.nodes.filter((node) => node.nodeKey !== selectedKey), edges: form.edges.filter((edge) => edge.fromNodeKey !== selectedKey && edge.toNodeKey !== selectedKey) }); setSelectedKey(''); };
  const save = async () => { try { const { data } = form.id ? await api.put(`/crm/flows/${form.id}`, form, { headers: auth() }) : await api.post('/crm/flows', form, { headers: auth() }); const next = fromApiFlow(data.flow); setSelected(next); setForm(next); setResult(null); await load(); } catch (e: any) { setError(e.response?.data?.message || 'Could not save flow.'); } };
  const publish = async () => { if (!selected?.id) return; try { const { data } = await api.post(`/crm/flows/${selected.id}/publish`, {}, { headers: auth() }); const next = fromApiFlow(data.flow); setSelected(next); setForm(next); await load(); } catch (e: any) { setError(e.response?.data?.message || 'Could not publish flow.'); } };
  const dryRun = async () => { if (!selected?.id) return; try { const { data } = await api.post(`/crm/flows/${selected.id}/run`, { dryRun: true, input: { leadId: '' } }, { headers: auth() }); setResult(data.run); } catch (e: any) { setError(e.response?.data?.message || 'Dry run failed.'); } };
  const openFlow = async (id: string) => { try { const { data } = await api.get(`/crm/flows/${id}`, { headers: auth() }); const next = fromApiFlow(data.flow); setSelected(next); setForm(next); setSelectedKey(''); } catch (e: any) { setError(e.response?.data?.message || 'Could not load flow.'); } };

  return <CRMLayout title="Visual Flow Builder"><div className="mx-auto max-w-7xl space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-white">Visual automation flow builder</h2><p className="text-sm text-slate-400">Drag standard automation nodes onto the canvas. Drafts are versioned and publishing never sends a message by itself.</p></div><GitBranch className="h-8 w-8 text-violet-300" /></div>{error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    <div className="grid gap-5 lg:grid-cols-[250px_1fr_260px]"><aside className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-white">Flows</h3><button onClick={() => { setSelected(null); setForm(starter); setSelectedKey(''); }} className="rounded-lg bg-violet-600 p-1.5 text-white" aria-label="New flow"><Plus className="h-4 w-4" /></button></div><div className="space-y-2">{flows.map((flow: any) => <button key={flow.id} onClick={() => openFlow(flow.id)} className="w-full rounded-lg bg-slate-800 p-3 text-left"><p className="text-sm text-white">{flow.name}</p><p className="text-xs text-slate-500">{flow.status} · {flow.node_count || flow.nodes?.length || 0} nodes</p></button>)}{!flows.length && <p className="text-xs text-slate-500">No flows yet.</p>}</div><h3 className="mt-6 mb-3 font-semibold text-white">Node palette</h3><div className="space-y-2">{NODE_TYPES.map((type) => <button key={type} draggable onDragStart={(event) => event.dataTransfer.setData('text/node-type', type)} onClick={() => addNode(type)} className="w-full cursor-grab rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs text-slate-300 active:cursor-grabbing">{type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</button>)}</div></aside>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Name<input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="text-xs text-slate-400">Description<input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label></div><div onDragOver={(event) => event.preventDefault()} onDrop={dropNode} className="relative min-h-[560px] overflow-hidden rounded-xl border border-dashed border-slate-600 bg-slate-950"><div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#64748b 1px, transparent 1px), linear-gradient(90deg, #64748b 1px, transparent 1px)', backgroundSize: '32px 32px' }} />{form.edges.map((edge) => <div key={`${edge.fromNodeKey}-${edge.toNodeKey}`} className="absolute z-10 text-[10px] text-slate-500" style={{ left: `${(form.nodes.find((n) => n.nodeKey === edge.fromNodeKey)?.position.x || 0) + 80}px`, top: `${(form.nodes.find((n) => n.nodeKey === edge.fromNodeKey)?.position.y || 0) + 36}px` }}>→ {edge.toNodeKey}</div>)}{form.nodes.map((node) => <button key={node.nodeKey} onClick={() => setSelectedKey(node.nodeKey)} className={`absolute z-20 w-36 rounded-xl border p-3 text-left shadow-lg ${selectedKey === node.nodeKey ? 'border-violet-400 bg-violet-950' : 'border-slate-700 bg-slate-800'}`} style={{ left: node.position.x, top: node.position.y }}><p className="truncate text-sm font-medium text-white">{node.nodeKey}</p><p className="mt-1 text-[11px] text-slate-400">{node.nodeType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p></button>)}</div><div className="mt-4 flex flex-wrap gap-2"><button onClick={save} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"><Save className="h-4 w-4" />Save draft</button>{selected?.id && <><button onClick={publish} className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white">Publish</button><button onClick={dryRun} className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white"><Play className="h-4 w-4" />Dry run</button></>}</div>{result && <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-cyan-200">{JSON.stringify(result, null, 2)}</pre>}</section>
      <aside className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><h3 className="font-semibold text-white">Node inspector</h3>{selectedNode ? <div className="mt-3 space-y-3"><label className="text-xs text-slate-400">Node key<input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={selectedNode.nodeKey} onChange={(e) => updateSelected({ nodeKey: e.target.value })} /></label><label className="text-xs text-slate-400">Type<select className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" value={selectedNode.nodeType} onChange={(e) => updateSelected({ nodeType: e.target.value })}>{NODE_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}</select></label><label className="text-xs text-slate-400">Config JSON<textarea className="mt-1 h-36 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white" value={JSON.stringify(selectedNode.config, null, 2)} onChange={(e) => { try { updateSelected({ config: JSON.parse(e.target.value) }); } catch { /* keep editing until valid JSON */ } }} /></label><button onClick={removeSelected} className="flex items-center gap-2 rounded-lg bg-red-700/80 px-3 py-2 text-sm text-white"><Trash2 className="h-4 w-4" />Remove node</button></div> : <p className="mt-3 text-sm text-slate-500">Select a node to edit its key, type and configuration.</p>}</aside></div></div></CRMLayout>;
}

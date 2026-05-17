import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, BarChart3, Mail, MousePointerClick, ShieldAlert, UserMinus } from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

const authHeaders = () => {
  const token = localStorage.getItem('crmToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const panel = 'rounded-2xl bg-white/[0.03] border border-white/[0.06]';

export default function CRMCampaignAnalyticsPage() {
  const { id } = useParams();
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    api.get(`/crm/campaign-analytics/${id}`, { headers: authHeaders() }).then(({ data }) => setAnalytics(data.data));
  }, [id]);

  const o = analytics?.overview || {};
  return <CRMLayout title="Campaign Analytics">
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Recipients" value={o.recipients || 0} icon={Mail} />
        <Metric label="Delivered" value={`${o.delivered || 0} (${o.delivery_rate || 0}%)`} icon={Activity} />
        <Metric label="Open Rate" value={`${o.unique_opens || 0} (${o.open_rate || 0}%)`} icon={Mail} />
        <Metric label="Click Rate" value={`${o.unique_clicks || 0} (${o.click_rate || 0}%)`} icon={MousePointerClick} />
        <Metric label="Bounces" value={`${o.bounced || 0} (${o.bounce_rate || 0}%)`} icon={ShieldAlert} />
        <Metric label="Unsubscribed" value={`${o.unsubscribed || 0} (${o.unsubscribe_rate || 0}%)`} icon={UserMinus} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={`${panel} p-5`}>
          <h2 className="text-white font-semibold mb-4">Engagement Timeline</h2>
          <div className="space-y-2">
            {(analytics?.timeline || []).map((row: any, index: number) => (
              <div key={`${row.bucket}-${row.event_type}-${index}`} className="flex justify-between text-sm">
                <span className="text-slate-500">{new Date(row.bucket).toLocaleString()} · {row.event_type}</span>
                <span className="text-slate-200">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panel} p-5`}>
          <h2 className="text-white font-semibold mb-4">Top Links</h2>
          <div className="space-y-2">
            {(analytics?.links || []).map((row: any, index: number) => (
              <div key={`${row.url}-${index}`} className="flex justify-between gap-4 text-sm">
                <span className="truncate text-slate-500">{row.url || 'Unknown link'}</span>
                <span className="text-slate-200">{row.clicks}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <section className={`${panel} p-5`}>
          <h2 className="text-white font-semibold mb-4">Top Domains</h2>
          <div className="space-y-2">
            {(analytics?.domains || []).map((row: any) => (
              <div key={row.domain} className="flex justify-between text-sm">
                <span className="text-slate-500">{row.domain}</span>
                <span className="text-slate-200">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panel} overflow-hidden`}>
          <div className="p-5 pb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-400" /><h2 className="text-white font-semibold">Recipient Activity</h2></div>
          <table className="w-full text-sm">
            <thead className="text-slate-500 border-b border-white/[0.06]"><tr><th className="p-4 text-left">Email</th><th className="text-left">Status</th><th className="text-left">Sent</th><th className="text-left">Opened</th><th className="text-left">Clicked</th></tr></thead>
            <tbody>{(analytics?.recipients || []).map((row: any) => (
              <tr key={row.email} className="border-b border-white/[0.04]">
                <td className="p-4 text-white">{row.email}</td>
                <td className="text-slate-300">{row.status}</td>
                <td className="text-slate-500">{row.sent_at ? new Date(row.sent_at).toLocaleString() : '-'}</td>
                <td className="text-slate-500">{row.opened_at ? new Date(row.opened_at).toLocaleString() : '-'}</td>
                <td className="text-slate-500">{row.clicked_at ? new Date(row.clicked_at).toLocaleString() : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </div>
  </CRMLayout>;
}

function Metric({ label, value, icon: Icon }: any) {
  return <div className={`${panel} p-4`}>
    <div className="flex justify-between text-sm text-slate-500"><span>{label}</span><Icon className="h-4 w-4" /></div>
    <div className="mt-2 text-xl font-semibold text-white">{value}</div>
  </div>;
}

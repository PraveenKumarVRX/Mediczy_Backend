/**
 * Orders & Revenue — real purchase history (lab/pharmacy orders + membership upgrades)
 *
 * Built to close a gap found in the 2026-09-15 micro-audit: /admin/payments and
 * /admin/billing looked like they should show this, but neither actually worked
 * (wrong data source / missing endpoint). This reads directly from the
 * orders+payments and user_plans tables via GET /api/admin/orders-revenue.
 *
 * Layout-agnostic: shared by both the Admin portal (pages/admin/OrdersRevenue.tsx,
 * wrapped in AdminLayout) and the Team portal (pages/team/TeamOrdersRevenue.tsx,
 * wrapped in MainLayout, gated by the 'Finance Access' team permission).
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import api from '@/utils/api';
import { format } from 'date-fns';
import { Receipt, IndianRupee, ShoppingBag, CalendarDays, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface PurchaseRow {
  id: string;
  type: 'order' | 'membership_upgrade';
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  employer: string | null;
  itemLabel: string;
  amount: number;
  currency: string;
  status: string;
  paymentId: string | null;
  gateway: string | null;
  createdAt: string;
}

function formatMoney(amount: number, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusColor(status: string) {
  if (status === 'success') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (status === 'free') return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
  if (status === 'failed') return 'bg-red-500/10 text-red-700 dark:text-red-400';
  return 'bg-muted text-muted-foreground';
}

export default function OrdersRevenueView() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: summaryData } = useQuery({
    queryKey: ['orders-revenue-summary'],
    queryFn: async () => {
      const { data } = await api.get('/admin/orders-revenue/summary');
      return data.summary;
    },
    refetchInterval: 60000,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['orders-revenue-list', debouncedSearch, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      params.append('page', String(page));
      params.append('limit', String(limit));
      const { data } = await api.get(`/admin/orders-revenue?${params.toString()}`);
      return data;
    },
  });

  const rows: PurchaseRow[] = listData?.data || [];
  const pagination = listData?.pagination;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-teal-500/10 via-background to-emerald-500/5 p-6 md:p-8">
        <div className="flex items-center gap-2 text-teal-600">
          <Receipt className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-wider">Finance</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Orders &amp; Revenue</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Every paid lab/pharmacy order and membership upgrade, in one place — sourced directly from the orders and payments tables.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { label: 'Today', value: formatMoney(summaryData?.todayRevenue || 0), sub: `${summaryData?.todayCount ?? 0} purchases`, icon: CalendarDays, tone: 'text-teal-600' },
          { label: 'This week', value: formatMoney(summaryData?.weekRevenue || 0), sub: `${summaryData?.weekCount ?? 0} purchases`, icon: ShoppingBag, tone: 'text-blue-600' },
          { label: 'This month', value: formatMoney(summaryData?.monthRevenue || 0), sub: `${summaryData?.monthCount ?? 0} purchases`, icon: IndianRupee, tone: 'text-emerald-600' },
          { label: 'All time', value: formatMoney(summaryData?.allTimeRevenue || 0), sub: `${summaryData?.allTimeCount ?? 0} purchases`, icon: Receipt, tone: 'text-purple-600' },
        ].map((stat) => (
          <Card key={stat.label} className="border-muted/60 shadow-sm">
            <CardContent className="flex items-center justify-between p-4 md:p-6">
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">{stat.label}</p>
                <p className="text-xl font-bold md:text-2xl">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </div>
              <stat.icon className={`h-7 w-7 ${stat.tone} opacity-80`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-lg">Purchase history</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customer name, email, phone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 sm:w-72"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="order">Orders (lab/pharmacy)</SelectItem>
                <SelectItem value="membership_upgrade">Membership upgrades</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No purchases found.</TableCell></TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={`${row.type}-${row.id}`}>
                    <TableCell>
                      <div className="font-medium">{row.customerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.customerEmail}{row.customerPhone ? ` · ${row.customerPhone}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{row.itemLabel}</div>
                      <Badge variant="outline" className="mt-1 text-xs font-normal">
                        {row.type === 'order' ? 'Order' : 'Membership'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatMoney(row.amount, row.currency)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusColor(row.status)}`}>
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{row.paymentId || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.createdAt ? format(new Date(row.createdAt), 'dd MMM yyyy, h:mm a') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

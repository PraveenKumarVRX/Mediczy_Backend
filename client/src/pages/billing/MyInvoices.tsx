import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  TablePagination,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Download, Visibility, Receipt, Refresh } from '@mui/icons-material';
import { useToast } from '@/hooks/use-toast';

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled' | 'draft' | string;
  totalAmount: number;
  taxAmount?: number;
  amount?: number;
  currency?: string;
  issueDate: string;
  dueDate?: string;
  pdfUrl?: string;
  order?: {
    id: string;
    orderNumber: string;
    orderType?: string;
    status?: string;
  };
}

const statusColor = (status: string) => {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'overdue':
      return 'error';
    case 'cancelled':
      return 'default';
    default:
      return 'info';
  }
};

const MyInvoices = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchInvoices();
  }, [page, rowsPerPage, statusFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params: any = { page: page + 1, limit: rowsPerPage };
      if (statusFilter !== 'all') params.status = statusFilter;

      const { data } = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/invoices`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }
      );

      if (data?.success) {
        setInvoices(data.data.invoices);
        setTotal(data.data.pagination.total);
      }
    } catch (err) {
      console.error('Invoice fetch failed', err);
      toast({
        title: 'Unable to load invoices',
        description: 'Please try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () =>
      invoices.filter((inv) => {
        if (!search) return true;
        const term = search.toLowerCase();
        return (
          inv.invoiceNumber?.toLowerCase().includes(term) ||
          inv.order?.orderNumber?.toLowerCase().includes(term)
        );
      }),
    [invoices, search]
  );

  const handleDownload = async (invoice: Invoice) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/invoices/${invoice.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice_${invoice.invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast({ title: 'Invoice downloaded', description: invoice.invoiceNumber });
    } catch (err) {
      console.error('Invoice download failed', err);
      toast({
        title: 'Download failed',
        description: 'Invoice could not be downloaded right now.',
        variant: 'destructive',
      });
    }
  };

  const paidAmount = (inv: Invoice) =>
    (inv.totalAmount ?? inv.amount ?? 0) + (inv.taxAmount ?? 0);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Grid container spacing={3} alignItems="center" sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Typography variant="h4" fontWeight={700}>
            My Invoices
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Download invoices and review order billing history.
          </Typography>
        </Grid>
        <Grid item xs={12} md={4} display="flex" justifyContent={{ md: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={<Receipt />}
            onClick={() => navigate('/billing/orders')}
          >
            Go to Order History
          </Button>
        </Grid>
      </Grid>

      <Card elevation={0} sx={{ border: '1px solid #eef1f5', mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="Search invoice or order #"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(0);
                    setStatusFilter(e.target.value);
                  }}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="paid">Paid</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="overdue">Overdue</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={fetchInvoices}
                disabled={loading}
                fullWidth
              >
                Refresh
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: '1px solid #eef1f5' }}>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : filtered.length === 0 ? (
            <Alert severity="info">
              No invoices found. Completed payments will generate invoices automatically.
            </Alert>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice</TableCell>
                      <TableCell>Order</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Issue Date</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow key={inv.id} hover>
                        <TableCell>
                          <Typography fontWeight={600}>{inv.invoiceNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {inv.id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {inv.order ? (
                            <>
                              <Typography fontWeight={600}>{inv.order.orderNumber}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {inv.order.orderType || 'Order'}
                              </Typography>
                            </>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={inv.status.toUpperCase()}
                            color={statusColor(inv.status)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {inv.issueDate ? format(new Date(inv.issueDate), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell>
                          {inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell align="right">
                          ₹{paidAmount(inv).toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="View invoice details">
                            <span>
                              <IconButton
                                onClick={() => inv.order?.id && navigate(`/billing/orders/${inv.order.id}`)}
                                disabled={!inv.order?.id}
                              >
                                <Visibility fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Download invoice">
                            <span>
                              <IconButton onClick={() => handleDownload(inv)} disabled={!inv.pdfUrl}>
                                <Download fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Divider sx={{ my: 2 }} />
              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default MyInvoices;

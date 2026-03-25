import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Paper,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Visibility,
  Download,
  Receipt,
  Refresh,
  CheckCircle,
  Cancel,
  HourglassEmpty,
  Error as ErrorIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

interface Order {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    pdfUrl: string;
    status: string;
  };
  payments?: any[];
}

const OrderHistory: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
    fetchStats();

    // Show success toast if redirected after payment
    if (location.state?.paymentSuccess) {
      toast({ title: 'Success', description: 'Payment completed successfully!' });
      window.history.replaceState({}, document.title);
    }
  }, [page, rowsPerPage, statusFilter, orderTypeFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const params: any = {
        page: page + 1,
        limit: rowsPerPage
      };

      if (statusFilter) params.status = statusFilter;
      if (orderTypeFilter) params.orderType = orderTypeFilter;

      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/orders`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params
        }
      );

      if (response.data.success) {
        setOrders(response.data.data.orders);
        setTotalOrders(response.data.data.pagination.total);
      }
    } catch (error: any) {
      console.error('Fetch orders error:', error);
      toast({ title: 'Error', description: 'Failed to load orders', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/stats`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error: any) {
      console.error('Fetch stats error:', error);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleViewOrder = (orderId: string) => {
    navigate(`/billing/orders/${orderId}`);
  };

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/billing/invoices/${invoiceId}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice_${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast({ title: 'Success', description: 'Invoice downloaded successfully' });
    } catch (error: any) {
      console.error('Download invoice error:', error);
      toast({ title: 'Error', description: 'Failed to download invoice', variant: 'destructive' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle fontSize="small" />;
      case 'failed':
      case 'cancelled':
        return <Cancel fontSize="small" />;
      case 'pending':
      case 'processing':
        return <HourglassEmpty fontSize="small" />;
      default:
        return <ErrorIcon fontSize="small" />;
    }
  };

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
      case 'cancelled':
        return 'error';
      case 'pending':
        return 'warning';
      case 'processing':
        return 'info';
      default:
        return 'default';
    }
  };

  const filteredOrders = orders.filter(order =>
    order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.orderType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Order History
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchOrders}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography color="textSecondary" variant="body2">
                Total Spent
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                ₹{parseFloat(stats.totalSpent).toFixed(2)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography color="textSecondary" variant="body2">
                Total Orders
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                {totalOrders}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography color="textSecondary" variant="body2">
                Pending Invoices
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                {stats.pendingInvoices}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography color="textSecondary" variant="body2">
                Recent Payments
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                {stats.recentPayments.length}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Search"
                variant="outlined"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Order number, type..."
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="processing">Processing</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Order Type</InputLabel>
                <Select
                  value={orderTypeFilter}
                  label="Order Type"
                  onChange={(e) => setOrderTypeFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="membership">Membership</MenuItem>
                  <MenuItem value="appointment">Appointment</MenuItem>
                  <MenuItem value="prescription">Prescription</MenuItem>
                  <MenuItem value="device">Device</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order Number</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Invoice</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="textSecondary">
                      No orders found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {order.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={order.orderType}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {format(new Date(order.createdAt), 'dd MMM yyyy, hh:mm a')}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {order.currency} {order.total.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getStatusIcon(order.status)}
                        label={order.status}
                        size="small"
                        color={getStatusColor(order.status)}
                      />
                    </TableCell>
                    <TableCell>
                      {order.invoice ? (
                        <Tooltip title="Download Invoice">
                          <IconButton
                            size="small"
                            onClick={() => handleDownloadInvoice(
                              order.invoice!.id,
                              order.invoice!.invoiceNumber
                            )}
                          >
                            <Receipt color="primary" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="textSecondary">
                          N/A
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={() => handleViewOrder(order.id)}
                        >
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalOrders}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Card>
    </Box>
  );
};

export default OrderHistory;

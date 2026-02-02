/**
 * Local AI Node Management Panel
 * Hospital admin dashboard component for managing local AI nodes
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  Grid,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  IconButton,
  Tooltip,
  LinearProgress,
  Divider,
  Paper
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  PowerOff as PowerOffIcon,
  PowerSettingsNew as PowerOnIcon,
  Key as KeyIcon,
  Monitor as MonitorIcon,
  Cloud as CloudIcon,
  Storage as StorageIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import localAiNodeService, { LocalAiNode, RegisterNodeRequest } from '@/services/localAiNode.service';

interface NodeStatusChipProps {
  status: string;
  isOnline: boolean;
}

const NodeStatusChip: React.FC<NodeStatusChipProps> = ({ status, isOnline }) => {
  const getColor = () => {
    if (!isOnline) return 'default';
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'DEGRADED': return 'warning';
      case 'MAINTENANCE': return 'info';
      case 'SUSPENDED': return 'error';
      default: return 'default';
    }
  };

  const getIcon = () => {
    if (!isOnline) return <ErrorIcon fontSize="small" />;
    switch (status) {
      case 'ACTIVE': return <CheckCircleIcon fontSize="small" />;
      case 'DEGRADED': return <WarningIcon fontSize="small" />;
      default: return null;
    }
  };

  return (
    <Chip 
      label={isOnline ? status : 'OFFLINE'} 
      color={getColor()} 
      size="small"
      icon={getIcon() || undefined}
    />
  );
};

interface NodeCardProps {
  node: LocalAiNode;
  onViewDetails: (node: LocalAiNode) => void;
  onDeactivate: (node: LocalAiNode) => void;
  onReactivate: (node: LocalAiNode) => void;
  onGenerateKey: (node: LocalAiNode) => void;
}

const NodeCard: React.FC<NodeCardProps> = ({ 
  node, 
  onViewDetails, 
  onDeactivate, 
  onReactivate,
  onGenerateKey 
}) => {
  const isOnline = node.isOnline;
  const healthMetrics = node.health_metrics || {};

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <StorageIcon color={isOnline ? 'primary' : 'disabled'} />
            <Typography variant="h6">{node.node_code}</Typography>
          </Box>
        }
        subheader={node.hospital_name}
        action={
          <NodeStatusChip status={node.status} isOnline={isOnline} />
        }
      />
      <CardContent sx={{ flexGrow: 1 }}>
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Typography variant="caption" color="textSecondary">Type</Typography>
            <Typography variant="body2">{node.node_type}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="caption" color="textSecondary">Last Heartbeat</Typography>
            <Typography variant="body2">
              {node.last_heartbeat 
                ? new Date(node.last_heartbeat).toLocaleTimeString()
                : 'Never'
              }
            </Typography>
          </Grid>
        </Grid>

        <Box mt={2}>
          <Typography variant="caption" color="textSecondary">Capabilities</Typography>
          <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
            {node.capabilities?.map((cap, i) => (
              <Chip key={i} label={cap} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>

        {isOnline && (
          <Box mt={2}>
            <Typography variant="caption" color="textSecondary">Resource Usage</Typography>
            <Box mt={1}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <MemoryIcon fontSize="small" color="action" />
                <Typography variant="body2" sx={{ minWidth: 50 }}>CPU</Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={healthMetrics.cpu_usage || 0} 
                  sx={{ flexGrow: 1 }}
                  color={healthMetrics.cpu_usage > 80 ? 'error' : 'primary'}
                />
                <Typography variant="body2">{healthMetrics.cpu_usage || 0}%</Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <StorageIcon fontSize="small" color="action" />
                <Typography variant="body2" sx={{ minWidth: 50 }}>RAM</Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={healthMetrics.memory_usage || 0} 
                  sx={{ flexGrow: 1 }}
                  color={healthMetrics.memory_usage > 80 ? 'error' : 'primary'}
                />
                <Typography variant="body2">{healthMetrics.memory_usage || 0}%</Typography>
              </Box>
              {healthMetrics.avg_latency_ms && (
                <Box display="flex" alignItems="center" gap={1}>
                  <SpeedIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    Avg Latency: {healthMetrics.avg_latency_ms}ms
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </CardContent>
      
      <Divider />
      
      <Box display="flex" justifyContent="space-between" p={1}>
        <Tooltip title="View Details">
          <IconButton size="small" onClick={() => onViewDetails(node)}>
            <MonitorIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Generate API Key">
          <IconButton size="small" onClick={() => onGenerateKey(node)}>
            <KeyIcon />
          </IconButton>
        </Tooltip>
        {node.status === 'SUSPENDED' ? (
          <Tooltip title="Reactivate Node">
            <IconButton size="small" color="success" onClick={() => onReactivate(node)}>
              <PowerOnIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Deactivate Node">
            <IconButton size="small" color="error" onClick={() => onDeactivate(node)}>
              <PowerOffIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Card>
  );
};

const LocalAiNodeManagement: React.FC = () => {
  const [nodes, setNodes] = useState<LocalAiNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<LocalAiNode | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'reactivate' | null>(null);

  // Registration form state
  const [registerForm, setRegisterForm] = useState<RegisterNodeRequest>({
    hospitalId: 0,
    hospitalName: '',
    endpoint: '',
    nodeType: 'ON_PREMISE',
    capabilities: ['SCRIBE', 'TRANSCRIPTION'],
    models: ['indic-gemma-2b', 'whisper-small']
  });

  const loadNodes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await localAiNodeService.getNodes();
      setNodes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadNodes, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRegisterNode = async () => {
    try {
      setLoading(true);
      const result = await localAiNodeService.registerNode(registerForm);
      setNewApiKey(result.apiKey);
      setApiKeyDialogOpen(true);
      setRegisterDialogOpen(false);
      await loadNodes();
    } catch (err: any) {
      setError(err.message || 'Failed to register node');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedNode) return;
    try {
      setLoading(true);
      await localAiNodeService.deactivateNode(selectedNode.node_id, deactivateReason);
      setConfirmDialogOpen(false);
      setDeactivateReason('');
      await loadNodes();
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate node');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!selectedNode) return;
    try {
      setLoading(true);
      const result = await localAiNodeService.reactivateNode(selectedNode.node_id);
      setNewApiKey(result.newApiKey);
      setApiKeyDialogOpen(true);
      setConfirmDialogOpen(false);
      await loadNodes();
    } catch (err: any) {
      setError(err.message || 'Failed to reactivate node');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async (node: LocalAiNode) => {
    try {
      setLoading(true);
      const result = await localAiNodeService.generateApiKey(node.node_id, {
        name: `Key generated on ${new Date().toLocaleDateString()}`
      });
      setNewApiKey(result.apiKey);
      setApiKeyDialogOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate API key');
    } finally {
      setLoading(false);
    }
  };

  const openConfirmDialog = (action: 'deactivate' | 'reactivate', node: LocalAiNode) => {
    setSelectedNode(node);
    setConfirmAction(action);
    setConfirmDialogOpen(true);
  };

  const onlineNodes = nodes.filter(n => n.isOnline);
  const offlineNodes = nodes.filter(n => !n.isOnline);

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            <CloudIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Local AI Nodes
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Manage your hospital's local AI compute infrastructure
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadNodes}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setRegisterDialogOpen(true)}
          >
            Register Node
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Statistics Summary */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
            <Typography variant="h3" color="success.dark">{onlineNodes.length}</Typography>
            <Typography variant="body2">Online Nodes</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light' }}>
            <Typography variant="h3" color="error.dark">{offlineNodes.length}</Typography>
            <Typography variant="body2">Offline Nodes</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
            <Typography variant="h3" color="info.dark">{nodes.length}</Typography>
            <Typography variant="body2">Total Nodes</Typography>
          </Paper>
        </Grid>
      </Grid>

      {loading && nodes.length === 0 ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : nodes.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <StorageIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Local AI Nodes Registered
          </Typography>
          <Typography variant="body2" color="textSecondary" mb={2}>
            Register your first local AI node to enable offline AI capabilities
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setRegisterDialogOpen(true)}
          >
            Register Your First Node
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {nodes.map(node => (
            <Grid item xs={12} sm={6} md={4} key={node.node_id}>
              <NodeCard
                node={node}
                onViewDetails={(n) => console.log('View details:', n)}
                onDeactivate={(n) => openConfirmDialog('deactivate', n)}
                onReactivate={(n) => openConfirmDialog('reactivate', n)}
                onGenerateKey={handleGenerateKey}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Register Node Dialog */}
      <Dialog 
        open={registerDialogOpen} 
        onClose={() => setRegisterDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Register New AI Node</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Hospital Name"
                value={registerForm.hospitalName}
                onChange={(e) => setRegisterForm({ ...registerForm, hospitalName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Node Endpoint URL"
                placeholder="https://ai.hospital.local:8006"
                value={registerForm.endpoint}
                onChange={(e) => setRegisterForm({ ...registerForm, endpoint: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Node Type</InputLabel>
                <Select
                  value={registerForm.nodeType}
                  label="Node Type"
                  onChange={(e) => setRegisterForm({ ...registerForm, nodeType: e.target.value as any })}
                >
                  <MenuItem value="ON_PREMISE">On-Premise Server</MenuItem>
                  <MenuItem value="EDGE">Edge Device</MenuItem>
                  <MenuItem value="HYBRID">Hybrid (Cloud + Local)</MenuItem>
                  <MenuItem value="MOBILE">Mobile Device</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleRegisterNode}
            disabled={!registerForm.hospitalName || !registerForm.endpoint}
          >
            Register
          </Button>
        </DialogActions>
      </Dialog>

      {/* API Key Display Dialog */}
      <Dialog 
        open={apiKeyDialogOpen} 
        onClose={() => { setApiKeyDialogOpen(false); setNewApiKey(null); }}
      >
        <DialogTitle>API Key Generated</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Important:</strong> This API key will only be shown once. Please copy and save it securely.
          </Alert>
          <TextField
            fullWidth
            multiline
            rows={3}
            value={newApiKey || ''}
            InputProps={{ readOnly: true }}
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            navigator.clipboard.writeText(newApiKey || '');
          }}>
            Copy to Clipboard
          </Button>
          <Button variant="contained" onClick={() => { setApiKeyDialogOpen(false); setNewApiKey(null); }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Action Dialog */}
      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>
          {confirmAction === 'deactivate' ? 'Deactivate Node' : 'Reactivate Node'}
        </DialogTitle>
        <DialogContent>
          {confirmAction === 'deactivate' ? (
            <>
              <Typography gutterBottom>
                Are you sure you want to deactivate node <strong>{selectedNode?.node_code}</strong>?
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                This will revoke all API keys and stop AI processing on this node.
              </Typography>
              <TextField
                fullWidth
                label="Reason for deactivation"
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                sx={{ mt: 2 }}
              />
            </>
          ) : (
            <Typography>
              Are you sure you want to reactivate node <strong>{selectedNode?.node_code}</strong>?
              A new API key will be generated.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            color={confirmAction === 'deactivate' ? 'error' : 'success'}
            onClick={confirmAction === 'deactivate' ? handleDeactivate : handleReactivate}
          >
            {confirmAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LocalAiNodeManagement;

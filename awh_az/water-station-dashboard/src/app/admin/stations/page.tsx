'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Avatar,
  Alert,
  Skeleton,
  Chip,
  Divider,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { apiClient, type StationInfo, type StationMetadata } from '@/lib/api-client';
import StationDataDownload from '@/components/StationDataDownload';

// A station fresh from POST /admin/stations (or any station that hasn't
// uploaded a reading yet) has no metadata — GET /stations only ever returns
// stations with at least one reading, so it never has this shape. Everywhere
// below that needs available_fields/last_reading guards on metadata being
// present instead of assuming every station has it.
type AdminStationRow = Omit<StationInfo, 'metadata' | 'unit'> & {
  unit?: string;
  metadata?: StationMetadata;
};

interface EditState {
  display_name: string;
  description: string;
  hidden: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface NewStationForm {
  station_name: string;
  display_name: string;
  description: string;
}

const EMPTY_NEW_STATION: NewStationForm = { station_name: '', display_name: '', description: '' };

export default function AdminStationsPage() {
  const [stations, setStations] = useState<AdminStationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [downloadOpen, setDownloadOpen] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newStation, setNewStation] = useState<NewStationForm>(EMPTY_NEW_STATION);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminStationRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const applyStations = (data: AdminStationRow[]) => {
    data.sort((a, b) => a.station_name.localeCompare(b.station_name));
    setStations(data);
    const initialEdits: Record<string, EditState> = {};
    for (const s of data) {
      initialEdits[s.station_name] = {
        display_name: s.display_name || '',
        description: s.description || '',
        hidden: Boolean(s.hidden),
      };
    }
    setEdits(initialEdits);
  };

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // GET /stations only ever returns stations with at least one reading
        // — a station just created via "Add Station" (or any real station
        // whose Pi hasn't reported yet) has none, so it'd be silently
        // invisible here without also pulling the full admin registry and
        // merging in whatever getStations() doesn't already have.
        const [withReadings, registryRes] = await Promise.all([
          apiClient.getStations(),
          fetch('/api/admin/stations'),
        ]);
        if (!registryRes.ok) throw new Error(`Failed to load station registry (${registryRes.status})`);
        const registry: AdminStationRow[] = await registryRes.json();

        const byName = new Map<string, AdminStationRow>(withReadings.map((s) => [s.station_name, s]));
        for (const row of registry) {
          if (!byName.has(row.station_name)) byName.set(row.station_name, row);
        }

        applyStations(Array.from(byName.values()));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stations');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleCreateStation = async () => {
    const station_name = newStation.station_name.trim();
    if (!station_name) {
      setAddError('Station ID is required.');
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch('/api/admin/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_name,
          display_name: newStation.display_name.trim() || null,
          description: newStation.description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || `Failed to create station (${res.status})`);
      }
      applyStations([...stations, data as AdminStationRow]);
      setAddDialogOpen(false);
      setNewStation(EMPTY_NEW_STATION);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create station');
    } finally {
      setAddSaving(false);
    }
  };

  const handleDeleteStation = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/stations/${encodeURIComponent(deleteTarget.station_name)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || `Failed to delete station (${res.status})`);
      }
      applyStations(stations.filter((s) => s.station_name !== deleteTarget.station_name));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete station');
    } finally {
      setDeleteSaving(false);
    }
  };

  const updateEdit = (stationName: string, patch: Partial<EditState>) => {
    setEdits((prev) => ({ ...prev, [stationName]: { ...prev[stationName], ...patch } }));
  };

  const save = async (stationName: string) => {
    setSaveStatus((prev) => ({ ...prev, [stationName]: 'saving' }));
    const edit = edits[stationName];
    try {
      const res = await fetch(`/api/admin/stations/${encodeURIComponent(stationName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: edit.display_name || null,
          description: edit.description || null,
          hidden: edit.hidden,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSaveStatus((prev) => ({ ...prev, [stationName]: 'saved' }));
      setStations((prev) =>
        prev.map((s) =>
          s.station_name === stationName
            ? { ...s, display_name: edit.display_name, description: edit.description, hidden: edit.hidden }
            : s
        )
      );
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [stationName]: 'idle' })), 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [stationName]: 'error' }));
    }
  };

  const handleImageSelect = async (stationName: string, file: File) => {
    setUploading((prev) => ({ ...prev, [stationName]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin/stations/${encodeURIComponent(stationName)}/image`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const data = await res.json();
      setStations((prev) =>
        prev.map((s) => (s.station_name === stationName ? { ...s, image_url: data.image_url } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading((prev) => ({ ...prev, [stationName]: false }));
    }
  };

  const handleRemoveImage = async (stationName: string) => {
    setUploading((prev) => ({ ...prev, [stationName]: true }));
    try {
      const res = await fetch(`/api/admin/stations/${encodeURIComponent(stationName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: null }),
      });
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
      setStations((prev) =>
        prev.map((s) => (s.station_name === stationName ? { ...s, image_url: null } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally {
      setUploading((prev) => ({ ...prev, [stationName]: false }));
    }
  };

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '900px', mx: 'auto' }}>
        <Skeleton variant="text" width={280} height={48} sx={{ mb: 3 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={220} sx={{ mb: 3 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '900px', mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 1 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Manage Stations
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setNewStation(EMPTY_NEW_STATION);
            setAddError(null);
            setAddDialogOpen(true);
          }}
          sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
        >
          Add Station
        </Button>
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        Edit display name, description, and photo, or hide a station from the public site.
        None of this touches sensor readings or historical data unless you delete a station.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {stations.map((station) => {
        const edit = edits[station.station_name];
        const status = saveStatus[station.station_name] || 'idle';
        const isUploading = uploading[station.station_name];
        if (!edit) return null;

        const statusLabel =
          station.status === 'active' ? 'Online' : station.status === 'pending' ? 'Pending' : 'Offline';
        const statusColor =
          station.status === 'active' ? 'success' : station.status === 'pending' ? 'warning' : 'default';

        return (
          <Card key={station.station_name} sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {station.station_name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  <Chip size="small" label={statusLabel} color={statusColor} />
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineIcon fontSize="small" />}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(station);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Delete
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    src={station.image_url || '/station-placeholder.svg'}
                    variant="rounded"
                    sx={{ width: 96, height: 96 }}
                  />
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={(el) => {
                      fileInputRefs.current[station.station_name] = el;
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(station.station_name, file);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    size="small"
                    startIcon={<CloudUploadIcon fontSize="small" />}
                    disabled={isUploading}
                    onClick={() => fileInputRefs.current[station.station_name]?.click()}
                  >
                    {isUploading ? 'Working...' : 'Change photo'}
                  </Button>
                  {station.image_url && (
                    <Button
                      size="small"
                      color="error"
                      disabled={isUploading}
                      onClick={() => handleRemoveImage(station.station_name)}
                    >
                      Remove photo
                    </Button>
                  )}
                </Box>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Display name"
                    placeholder={station.station_name}
                    value={edit.display_name}
                    onChange={(e) => updateEdit(station.station_name, { display_name: e.target.value })}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Description"
                    value={edit.description}
                    onChange={(e) => updateEdit(station.station_name, { description: e.target.value })}
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={edit.hidden}
                          onChange={(e) => updateEdit(station.station_name, { hidden: e.target.checked })}
                        />
                      }
                      label="Hidden from public site"
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {status === 'saved' && (
                        <Typography variant="caption" color="success.main">Saved</Typography>
                      )}
                      {status === 'error' && (
                        <Typography variant="caption" color="error.main">Save failed</Typography>
                      )}
                      <Button
                        variant="contained"
                        size="small"
                        disabled={status === 'saving'}
                        onClick={() => save(station.station_name)}
                      >
                        {status === 'saving' ? 'Saving...' : 'Save'}
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {station.metadata && (
                <>
                  <Divider sx={{ my: 2.5 }} />

                  <Button
                    size="small"
                    startIcon={<DownloadIcon fontSize="small" />}
                    endIcon={downloadOpen[station.station_name] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() =>
                      setDownloadOpen((prev) => ({ ...prev, [station.station_name]: !prev[station.station_name] }))
                    }
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Download data
                  </Button>
                  <Collapse in={!!downloadOpen[station.station_name]} unmountOnExit>
                    <Box sx={{ mt: 2 }}>
                      <StationDataDownload station={station as StationInfo} />
                    </Box>
                  </Collapse>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {stations.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 6 }}>
          No stations yet. Add one to get started.
        </Typography>
      )}

      {/* Add Station dialog */}
      <Dialog open={addDialogOpen} onClose={() => !addSaving && setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Station</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Registers a new station in Firestore. It'll appear here right away with status
            &quot;Pending&quot; and go &quot;Online&quot; automatically once its Raspberry Pi starts
            uploading real readings.
          </DialogContentText>
          {addError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {addError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Station ID"
              placeholder="station_NewUnit@Location"
              helperText="Must match the exact station_name the Pi will upload readings under. Cannot be changed later."
              value={newStation.station_name}
              onChange={(e) => setNewStation((prev) => ({ ...prev, station_name: e.target.value }))}
              size="small"
              fullWidth
              autoFocus
              disabled={addSaving}
            />
            <TextField
              label="Display name (optional)"
              value={newStation.display_name}
              onChange={(e) => setNewStation((prev) => ({ ...prev, display_name: e.target.value }))}
              size="small"
              fullWidth
              disabled={addSaving}
            />
            <TextField
              label="Description (optional)"
              value={newStation.description}
              onChange={(e) => setNewStation((prev) => ({ ...prev, description: e.target.value }))}
              size="small"
              fullWidth
              multiline
              minRows={2}
              disabled={addSaving}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddDialogOpen(false)} disabled={addSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateStation} disabled={addSaving}>
            {addSaving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Add Station'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !deleteSaving && setDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>Delete station?</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <DialogContentText component="div">
              This permanently deletes{' '}
              <strong>{deleteTarget.display_name || deleteTarget.station_name}</strong>
              {' '}(<code>{deleteTarget.station_name}</code>) and its entire reading history —
              {deleteTarget.metadata && deleteTarget.metadata.total_readings > 0 ? (
                <>
                  {' '}at least{' '}
                  <strong>
                    {deleteTarget.metadata.total_readings === 50 ? '50+' : deleteTarget.metadata.total_readings}
                  </strong>{' '}
                  readings.
                </>
              ) : (
                ' it has no readings recorded yet.'
              )}{' '}
              This cannot be undone, and can take a while for a station with a lot of history.
            </DialogContentText>
          )}
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteStation} disabled={deleteSaving}>
            {deleteSaving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Delete Station'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

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
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { apiClient, type StationInfo } from '@/lib/api-client';

interface EditState {
  display_name: string;
  description: string;
  hidden: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function AdminStationsPage() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiClient.getStations();
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
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stations');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        Manage Stations
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        Edit display name, description, and photo, or hide a station from the public site.
        None of this touches sensor readings or historical data.
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

        return (
          <Card key={station.station_name} sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {station.station_name}
                </Typography>
                <Chip
                  size="small"
                  label={station.status === 'active' ? 'Online' : 'Offline'}
                  color={station.status === 'active' ? 'success' : 'default'}
                />
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
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

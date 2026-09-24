'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Typography,
  Button,
  Chip,
  Box
} from '@mui/material';
import { Circle as CircleIcon, Info as InfoIcon, LocationOn as LocationOnIcon } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { Station } from '@/types';
import { slugify } from '@/lib/slug';
import { freshnessOf, formatAge } from '@/lib/freshness';

interface StationCardProps {
  station: Station;
}

const StationCard: React.FC<StationCardProps> = ({ station }) => {
  const router = useRouter();

  // station.name is already display_name || station_name (see stations/page.tsx),
  // so this reads as the station's name in the URL instead of its raw,
  // Firestore-key-shaped station_name.
  const handleViewDetails = () => {
    router.push(`/stations/${encodeURIComponent(slugify(station.name))}`);
  };

  // Lazy initial value keeps render pure; the age is only as fresh as the
  // last list fetch, which is fine for a coarse Live / Delayed / Not sending label.
  const [nowMs] = React.useState(() => Date.now());
  const fresh = freshnessOf(station.lastReading, nowMs);

  const getStatusColor = (status: string) => {
    return status === 'Online' ? 'success' : 'error';
  };

  return (
    <Card 
      sx={{ 
        height: '100%', 
        width: '100%',
        display: 'flex', 
        flexDirection: 'column',
        background: 'background.paper',
        border: '2px solid',
        borderColor: 'primary.main',
        borderRadius: 2,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-8px)',
          boxShadow: '0 12px 28px rgba(144, 19, 64, 0.3)',
          borderColor: 'primary.dark',
        }
      }}
      onClick={handleViewDetails}
    >
      <CardMedia
        component="img"
        height="120"
        image={station.image || '/station-placeholder.svg'}
        alt={station.image ? `${station.name} photo` : 'Station photo coming soon'}
        sx={{
          objectFit: 'cover',
          borderBottom: '3px solid',
          borderColor: 'primary.main',
        }}
      />
      <CardContent sx={{ flexGrow: 1, p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} gap={1}>
          <Typography
            variant="body1"
            component="h2"
            sx={{
              color: 'primary.main',
              fontWeight: 700,
              fontSize: '0.85rem',
              flex: 1,
              minWidth: 0,
              wordBreak: 'break-word',
            }}
          >
            {station.name}
          </Typography>
          <Chip
            label={station.status.toUpperCase()}
            color={getStatusColor(station.status)}
            size="small"
            icon={<CircleIcon sx={{ fontSize: 12 }} />}
            sx={{
              fontWeight: 600,
              fontSize: '0.68rem',
              height: 22,
              flexShrink: 0,
            }}
          />
        </Box>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 1,
            fontWeight: 600,
            color: 'text.secondary',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <LocationOnIcon sx={{ fontSize: 14 }} />
          {station.location || 'Location Unknown'}
        </Typography>

        <Typography
          variant="caption"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, fontWeight: 600, color: 'text.secondary' }}
        >
          <CircleIcon sx={{ fontSize: 9, color: fresh.color }} aria-hidden />
          <span style={{ color: fresh.color }}>{fresh.label}</span>
          {fresh.ageSec != null && <span>· last reading {formatAge(fresh.ageSec)}</span>}
        </Typography>


        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            lineHeight: 1.5,
            color: 'text.secondary',
            fontSize: '0.78rem'
          }}
        >
          {station.description ||
            'Atmospheric water harvesting station utilizing advanced condensation technology to extract moisture from ambient air.'}
        </Typography>
      </CardContent>

      <CardActions sx={{ p: 1.5, pt: 0 }}>
        <Button
          size="small"
          variant="contained"
          startIcon={<InfoIcon sx={{ fontSize: 16 }} />}
          fullWidth
          sx={{
            backgroundColor: 'primary.main',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.8rem',
            py: 0.6,
            '&:hover': {
              backgroundColor: 'primary.dark',
              transform: 'translateY(-2px)',
            }
          }}
        >
          View Full Details
        </Button>
      </CardActions>
    </Card>
  );
};

export default StationCard;
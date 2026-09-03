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
import { Circle as CircleIcon, Info as InfoIcon } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { Station } from '@/types';

interface StationCardProps {
  station: Station;
}

const StationCard: React.FC<StationCardProps> = ({ station }) => {
  const router = useRouter();

  const handleViewDetails = () => {
    router.push(`/stations/${encodeURIComponent(station.id)}`);
  };

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
        background: '#ffffff',
        border: '2px solid #1e88e5',
        borderRadius: 2,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-8px)',
          boxShadow: '0 12px 28px rgba(30, 136, 229, 0.3)',
          borderColor: '#1565c0',
        }
      }}
      onClick={handleViewDetails}
    >
      <CardMedia
        component="img"
        height="120"
        image="/station-placeholder.svg"
        alt="Station photo coming soon"
        sx={{
          objectFit: 'cover',
          borderBottom: '3px solid #1e88e5'
        }}
      />
      <CardContent sx={{ flexGrow: 1, p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} gap={1}>
          <Typography
            variant="body1"
            component="h2"
            sx={{
              color: '#1e88e5',
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
            color: '#555',
            fontSize: '0.8rem',
          }}
        >
          📍 {station.location || 'Location Unknown'}
        </Typography>


        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            lineHeight: 1.5,
            color: '#666',
            fontSize: '0.78rem'
          }}
        >
          Atmospheric water harvesting station utilizing advanced condensation technology to extract moisture from ambient air.
        </Typography>
      </CardContent>

      <CardActions sx={{ p: 1.5, pt: 0 }}>
        <Button
          size="small"
          variant="contained"
          startIcon={<InfoIcon sx={{ fontSize: 16 }} />}
          fullWidth
          sx={{
            backgroundColor: '#1e88e5',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.8rem',
            py: 0.6,
            '&:hover': {
              backgroundColor: '#1565c0',
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
'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography
} from '@mui/material';
import { Download, Preview } from '@mui/icons-material';
import Papa from 'papaparse';
import { StationData, FeatureType } from '@/types';

interface CSVExportProps {
  data: StationData[];
  feature: FeatureType;
  stationName: string;
  dateRange: string;
}

const CSVExport: React.FC<CSVExportProps> = ({ data, feature, stationName, dateRange }) => {
  const [previewOpen, setPreviewOpen] = useState(false);

  const prepareExportData = () => {
    return data.map(item => ({
      Date: item.date,
      [feature]: item[feature],
      Station: stationName,
    }));
  };

  const handleExportCSV = () => {
    const exportData = prepareExportData();
    const csv = Papa.unparse(exportData);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${stationName}_${feature}_${dateRange}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = () => {
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
  };

  const exportData = prepareExportData();

  return (
    <Box 
      sx={{ 
        mt: { xs: 3, sm: 4 }, 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2, 
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <Button
        variant="contained"
        startIcon={<Download />}
        onClick={handleExportCSV}
        disabled={data.length === 0}
        color="primary"
        size="large"
        sx={{
          width: { xs: '100%', sm: 'auto' },
          minWidth: { sm: 180 },
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(144, 19, 64, 0.3)',
          '&:hover': {
            boxShadow: '0 6px 16px rgba(144, 19, 64, 0.4)',
            transform: 'translateY(-2px)',
          }
        }}
      >
        Export as CSV
      </Button>

      <Button
        variant="outlined"
        startIcon={<Preview />}
        onClick={handlePreview}
        disabled={data.length === 0}
        color="secondary"
        size="large"
        sx={{
          width: { xs: '100%', sm: 'auto' },
          minWidth: { sm: 180 },
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 600,
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
            transform: 'translateY(-2px)',
          }
        }}
      >
        Preview Excel File
      </Button>

      <Dialog 
        open={previewOpen} 
        onClose={handleClosePreview}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Use non-heading wrapper to avoid nested <h*> elements from MUI inner components */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" component="div">
                Excel Preview - {stationName} {feature} Data
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" component="div">
                {dateRange}
              </Typography>
            </div>
          </DialogTitle>
        
        <DialogContent>
          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                    Date
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                    {feature}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                    Station
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exportData.map((row, index) => (
                  <TableRow 
                    key={index}
                    sx={{ 
                      '&:nth-of-type(odd)': { 
                        backgroundColor: '#fafafa' 
                      } 
                    }}
                  >
                    <TableCell>{row.Date}</TableCell>
                    <TableCell>{row[feature]}</TableCell>
                    <TableCell>{row.Station}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClosePreview}>Close</Button>
          <Button onClick={handleExportCSV} variant="contained">
            Export CSV
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CSVExport;
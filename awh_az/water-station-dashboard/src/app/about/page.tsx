import { Box, Typography, Paper } from '@mui/material';

export default function AboutPage() {
  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 4, maxWidth: '1200px', mx: 'auto' }}>
      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        sx={{
          fontWeight: 700,
          color: 'primary.main',
          mb: 4,
        }}
      >
        About AzAWH
      </Typography>

      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 4,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Atmospheric Water Harvesting
        </Typography>
        <Typography variant="body1" paragraph color="text.secondary" sx={{ lineHeight: 1.8 }}>
          AzAWH (Arizona Atmospheric Water Harvesting) stations extract liquid water directly
          from humid air, using fan-driven airflow across a condensing surface, with no
          groundwater, reservoir, or existing water source required. The stations are designed,
          deployed, and operated by the School of Sustainable Engineering and the Built
          Environment (SSEBE) at Arizona State University.
        </Typography>
        <Typography variant="body1" paragraph color="text.secondary" sx={{ lineHeight: 1.8 }}>
          This dashboard is the monitoring layer for that hardware. 9 stations have been deployed
          and instrumented to date, together generating a combined archive of over 1.5 million
          sensor readings. Each streams intake and outtake air temperature and humidity, airflow
          velocity, water collected, power draw, and cumulative energy use. The full historical
          record for every station remains available here even after it stops reporting new data.
        </Typography>
      </Paper>

      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        Key Features
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          mb: 4,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Real-Time Monitoring
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Live intake and outtake air temperature and humidity, airflow velocity, water
            collected, and power draw, refreshed continuously across every station.
          </Typography>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Harvesting Efficiency Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Hourly-aggregated charts of water production, harvesting efficiency, and specific
            energy consumption (kWh per liter), plus side-by-side comparison across stations.
          </Typography>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Export & Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Download raw or hourly-aggregated readings as CSV for any station and date range,
            for offline analysis or reporting.
          </Typography>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Responsive Design
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Access the platform seamlessly from any device, including desktop, tablet, and
            mobile, with a fully responsive interface.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}

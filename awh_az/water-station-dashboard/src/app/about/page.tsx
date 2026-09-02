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
        About AWH
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
          The AWH (Atmospheric Water Harvesting) is an innovative system developed
          by Arizona State University that extracts clean water from the atmosphere. Our platform provides 
          real-time monitoring and analysis of atmospheric water harvesting stations across the region, 
          helping ensure optimal water production and quality management.
        </Typography>
        <Typography variant="body1" paragraph color="text.secondary" sx={{ lineHeight: 1.8 }}>
          With advanced data visualization and analytics capabilities, AWH enables researchers,
          administrators, and stakeholders to make informed decisions about water resource management
          and conservation efforts.
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
            Track water quality metrics including temperature, pH levels, humidity, and water
            production in real-time across multiple stations.
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
            Data Visualization
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Interactive charts and graphs provide clear insights into water station performance
            and trends over customizable time periods.
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
            Export data in CSV format and preview in Excel-compatible format for further analysis
            and reporting purposes.
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
            Access the platform seamlessly from any device - desktop, tablet, or mobile - with
            a fully responsive interface.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}

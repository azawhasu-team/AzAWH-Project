import { Box, Typography, Paper, TextField, Button } from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';

export default function ContactPage() {
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
        Contact Us
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '2fr 3fr' },
          gap: 4,
        }}
      >
        {/* Contact Information */}
        <Paper
          elevation={0}
          sx={{
            p: 4,
            border: '1px solid',
            borderColor: 'divider',
            height: 'fit-content',
          }}
        >
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            Get in Touch
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph sx={{ lineHeight: 1.8 }}>
            Have questions about the AWH Atmospheric Water Harvesting System? We're here to help!
          </Typography>

          <Box sx={{ mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
              <LocationOnIcon sx={{ color: 'primary.main', mt: 0.5 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Address
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Arizona State University<br />
                  Tempe, AZ 85287<br />
                  United States
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
              <EmailIcon sx={{ color: 'primary.main', mt: 0.5 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Email
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  azawh@asu.edu
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <PhoneIcon sx={{ color: 'primary.main', mt: 0.5 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Phone
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  +1 (480) 965-2100
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Contact Form */}
        <Paper
          elevation={0}
          sx={{
            p: 4,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            Send us a Message
          </Typography>

          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              fullWidth
              label="Name"
              variant="outlined"
              required
            />

            <TextField
              fullWidth
              label="Email"
              type="email"
              variant="outlined"
              required
            />

            <TextField
              fullWidth
              label="Subject"
              variant="outlined"
              required
            />

            <TextField
              fullWidth
              label="Message"
              variant="outlined"
              multiline
              rows={6}
              required
            />

            <Button
              variant="contained"
              size="large"
              sx={{
                mt: 2,
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(144, 19, 64, 0.3)',
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(144, 19, 64, 0.4)',
                },
              }}
            >
              Send Message
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

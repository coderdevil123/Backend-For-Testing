require('dotenv').config();
const express = require('express');
const passport = require('./auth/google');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { supabase } = require('./lib/supabase');
const app = express();
const reportIssueRoute = require('./routes/reportIssue');
const announcementRoutes = require('./routes/announcements');
const teamRoutes = require('./routes/team');

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use('/api', reportIssueRoute);
app.use('/api/announcements', announcementRoutes);
app.use('/api/team', teamRoutes);

app.get('/auth/failed', (req, res) => {
  res.status(401).send('Google authentication failed');
});

app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/auth/failed',
  }),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).send('Unauthorized');
    }

    const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        google_id: req.user.google_id,
        email: req.user.email,
        name: req.user.name,
        avatar_url: req.user.avatar_url || null,
        role: 'Member',
        department: 'General',
      },
      { onConflict: 'email' }
    );
    
    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).send('Profile sync failed');
    }

    const token = jwt.sign(
      {
        google_id: req.user.google_id,
        email: req.user.email,
        name: req.user.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/oauth/success?token=${token}`
    );
  }
);

app.get('/', (req, res) => {
  res.send('PF Auth Server Running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});

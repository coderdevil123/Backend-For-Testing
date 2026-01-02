import announcementRoutes from './routes/announcements.js';
require('dotenv').config();
const express = require('express');
const passport = require('./auth/google');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const supabase = require('./lib/supabase');
const app = express();
const reportIssueRoute = require('./routes/reportIssue');

app.use(cors({
  origin: process.env.FRONTEND_URL,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', reportIssueRoute);
app.use('/api/announcements', announcementRoutes);
app.use(passport.initialize());

app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

app.get(
  '/auth/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    // 1️⃣ UPSERT PROFILE
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          google_id: req.user.google_id,
          email: req.user.email,
          name: req.user.name,
          avatar_url: req.user.avatar_url,
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).send('Profile sync failed');
    }

    // 2️⃣ JWT
    const token = jwt.sign(
      {
        google_id: req.user.google_id,
        email: req.user.email,
        name: req.user.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 3️⃣ REDIRECT
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

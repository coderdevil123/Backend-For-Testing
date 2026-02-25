// require('dotenv').config();
// const express = require('express');
// const passport = require('./auth/google');
// const jwt = require('jsonwebtoken');
// const cors = require('cors');
// const { supabase } = require('./lib/supabase');
// const app = express();
// const reportIssueRoute = require('./routes/reportIssue');
// const announcementRoutes = require('./routes/announcements');
// const teamRoutes = require('./routes/team');
// const profileRoutes = require('./routes/profile');
// const toolsRoutes = require('./routes/tools');
// const tasksRoutes = require('./routes/tasks');
// const { warmCache, startKeepAlive } = require('./services/cacheWarmer');

// const ALLOWED_ORIGINS = [
//   'https://pf-workspace.vercel.app',
//   'http://10.10.10.57:8090',
//   'https://pf.growthsupercharged.com',
// ];

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       if (!origin) return callback(null, true);
//       if (ALLOWED_ORIGINS.includes(origin)) {
//         return callback(null, true);
//       }
//       return callback(new Error('Not allowed by CORS'));
//     },
//     credentials: true,
//   })
// );

// app.use(passport.initialize());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.use('/api/profile', profileRoutes);
// app.use('/api', reportIssueRoute);
// app.use('/api/announcements', announcementRoutes);
// app.use('/api/team', teamRoutes);
// app.use('/api/tools', toolsRoutes);
// app.use('/api/tasks', tasksRoutes);
// app.use('/api/admin', require('./routes/admin/index'));
// app.use('/api/manager', require('./routes/manager'));

// app.get('/auth/failed', (req, res) => {
//   res.status(401).send('Google authentication failed');
// });

// // ✅ Pass origin in state param (no session needed!)
// app.get('/auth/google', (req, res, next) => {
//   passport.authenticate('google', {
//     scope: ['profile', 'email'],
//     state: req.query.origin || process.env.FRONTEND_URL,
//   })(req, res, next);
// });

// app.get(
//   '/auth/google/callback',
//   passport.authenticate('google', {
//     session: false,
//     failureRedirect: '/auth/failed',
//   }),
//   async (req, res) => {
//     if (!req.user) {
//       return res.status(401).send('Unauthorized');
//     }

//     const { data: existingProfile } = await supabase
//       .from('profiles')
//       .select('avatar_url')
//       .eq('email', req.user.email)
//       .maybeSingle();

//     const payload = {
//       google_id: req.user.google_id,
//       email: req.user.email,
//       name: req.user.name,
//     };

//     if (!existingProfile?.avatar_url) {
//       payload.avatar_url = req.user.avatar_url || null;
//     }

//     const { error } = await supabase
//       .from('profiles')
//       .upsert(payload, { onConflict: 'email' });

//     if (error) {
//       console.error('Supabase upsert error:', error);
//       return res.status(500).send('Profile sync failed');
//     }

//     const token = jwt.sign(
//       {
//         google_id: req.user.google_id,
//         email: req.user.email,
//         name: req.user.name,
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     // Get origin from state
//     const origin = req.query.state || process.env.FRONTEND_URL;

//     res.redirect(`${origin}/oauth/success?token=${token}`);
//   }
// );

// app.get('/', (req, res) => {
//   res.send('PF Auth Server Running');
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Auth server running on port ${PORT}`);
// });

require('dotenv').config();
const express  = require('express');
const passport = require('./auth/google');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const { supabase } = require('./lib/supabase');
const app = express();

const ALLOWED_ORIGINS = [
  'https://pf-workspace.vercel.app',
  'http://10.10.10.57:8090',
  'https://pf.growthsupercharged.com',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(passport.initialize());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/profile',       require('./routes/profile'));
app.use('/api',               require('./routes/reportIssue'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/team',          require('./routes/team'));
app.use('/api/tools',         require('./routes/tools'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/admin',         require('./routes/admin/index'));
app.use('/api/manager',       require('./routes/manager'));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.get('/auth/failed', (req, res) => res.status(401).send('Google authentication failed'));

app.get('/auth/google', (req, res, next) => {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: req.query.origin || process.env.FRONTEND_URL,
  })(req, res, next);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failed' }),
  async (req, res) => {
    if (!req.user) return res.status(401).send('Unauthorized');

    const { data: existing } = await supabase
      .from('profiles').select('avatar_url')
      .eq('email', req.user.email).maybeSingle();

    const payload = {
      google_id: req.user.google_id,
      email:     req.user.email,
      name:      req.user.name,
    };
    if (!existing?.avatar_url) payload.avatar_url = req.user.avatar_url || null;

    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'email' });
    if (error) return res.status(500).send('Profile sync failed');

    const token = jwt.sign(
      { google_id: req.user.google_id, email: req.user.email, name: req.user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const origin = req.query.state || process.env.FRONTEND_URL;
    res.redirect(`${origin}/oauth/success?token=${token}`);
  }
);

app.get('/', (req, res) => res.send('PF Auth Server Running'));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Keep Supabase awake — ping every 4 minutes so it never cold-starts
  setInterval(async () => {
    try {
      await supabase.from('roles').select('id').limit(1);
      console.log('[KeepAlive] Supabase pinged ok');
    } catch (e) {
      console.warn('[KeepAlive] ping failed:', e.message);
    }
  }, 4 * 60 * 1000);
});
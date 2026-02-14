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
const profileRoutes = require('./routes/profile');
const toolsRoutes = require('./routes/tools');
const tasksRoutes = require('./routes/tasks');
const cron = require('node-cron');
// const { runMattermostReader } = require('./services/mattermostReader');
// const session = require('express-session');

// app.use(cors({
//   origin: process.env.FRONTEND_URL,
//   credentials: true,
// }));

// app.use(
//   session({
//     secret: process.env.JWT_SECRET,
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       httpOnly: true,
//       sameSite: 'lax',
//     },
//   })
// );

const ALLOWED_ORIGINS = [
  'https://pf-workspace.vercel.app',
  'http://10.10.10.57:8090',
  'https://pf.growthsupercharged.com',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow curl / server requests
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// app.use(cookieParser());
// app.use(passport.initialize());


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/profile', profileRoutes);
app.use('/api', reportIssueRoute);
app.use('/api/announcements', announcementRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/admin', require('./routes/admin/index'));
app.use('/api/manager', require('./routes/manager'));
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/auth/failed', (req, res) => {
  res.status(401).send('Google authentication failed');
});

app.get('/auth/google', (req, res, next) => {
  const { origin } = req.query;

  const ALLOWED_ORIGINS = [
    'https://pf-workspace.vercel.app',
    'http://10.10.10.57:8090',
    'https://pf.growthsupercharged.com',
  ];

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    req.session.oauth_origin = origin;
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })(req, res, next);
});

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

    // Check if profile already exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('email', req.user.email)
    .maybeSingle();

    // payload
    const payload = {
      google_id: req.user.google_id,
      email: req.user.email,
      name: req.user.name,
    };

    // Only set avatar_url IF it does NOT exist yet
    if (!existingProfile?.avatar_url) {
      payload.avatar_url = req.user.avatar_url || null;
    }

    // Upsert safely
    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'email' });

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

    const origin = req.session.oauth_origin || process.env.FRONTEND_URL;
    delete req.session.oauth_origin;

    // res.cookie('auth_token', token, {
    //   httpOnly: true,
    //   secure: origin.startsWith('https'), // secure only for https
    //   sameSite: 'lax',
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    //   domain: origin.includes('growthsupercharged.com') ? '.growthsupercharged.com' : undefined
    // });

    res.redirect(`${origin}/oauth/success?token=${token}`);
  }
);

app.get('/', (req, res) => {
  res.send('PF Auth Server Running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});

// cron.schedule('* * * * *', async () => {
//   console.log('🔄 Checking Mattermost DMs...');
//   await runMattermostReader();
// });
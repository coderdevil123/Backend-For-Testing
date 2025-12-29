const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const supabase = require('../lib/supabase');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const google_id = profile.id;
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const avatar = profile.photos?.[0]?.value || null;

        // 🔍 Check if user exists
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .single();

        if (existingUser) {
          return done(null, existingUser);
        }

        // 🆕 Create new user
        const { data: newUser } = await supabase
          .from('profiles')
          .insert([
            { email, name, avatar_url: avatar }
          ])
          .select()
          .single();

        return done(null, newUser);
      } catch (err) {
        console.error('Google auth DB error:', err);
        done(err, null);
      }
    }
  )
);

module.exports = passport;

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      const user = {
        google_id: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar_url: profile.photos?.[0]?.value || null,
      };

      return done(null, user);
    }
  )
);

module.exports = passport;

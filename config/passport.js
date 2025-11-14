const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const stripeConfig = require('./stripeConfig');
const stripe = require('stripe')(stripeConfig.secretKey);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/user/auth/google/callback',
    passReqToCallback: true,
    store: true  // Enable state storage for custom redirect URLs
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
            // User exists, return the user
            return done(null, user);
        }

        // Check if user exists with this email
        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
            // User exists with email but hasn't linked Google yet
            // Link the Google account to existing user
            user.googleId = profile.id;
            user.authMethod = user.authMethod === 'local' ? 'both' : 'google';
            user.profilePicture = profile.photos?.[0]?.value;
            await user.save();
            return done(null, user);
        }

        // Create new user
        // Generate a unique username from email or Google profile
        let username = profile.emails[0].value.split('@')[0];

        // Check if username already exists and make it unique
        let existingUser = await User.findOne({ username });
        let counter = 1;
        while (existingUser) {
            username = `${profile.emails[0].value.split('@')[0]}${counter}`;
            existingUser = await User.findOne({ username });
            counter++;
        }

        // Create Stripe customer
        const customer = await stripe.customers.create({
            email: profile.emails[0].value,
            name: profile.displayName || username,
        });

        // Create new user
        const newUser = new User({
            username,
            email: profile.emails[0].value,
            googleId: profile.id,
            authMethod: 'google',
            stripeCustomerId: customer.id,
            profilePicture: profile.photos?.[0]?.value,
            roles: ['member']
        });

        await newUser.save();
        done(null, newUser);
    } catch (err) {
        console.error('Error in Google OAuth strategy:', err);
        done(err, null);
    }
}));

module.exports = passport;

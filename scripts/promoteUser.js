// scripts/updateUserRoles.js

const mongoose = require('mongoose');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Add Stripe secret key
const User = require('../models/User'); // Adjust the path if necessary

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;
console.log("DB Name", DBNAME);
console.log("DB ADDRESS", DBADDRESS)
console.log("STRIPE KEY", process.env.STRIPE_SECRET_KEY)

mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

const updateUserRoles = async () => {
  try {
    // Find the user by username
    const username = 'uthman.aq';
    const user = await User.findOne({ username });

    if (!user) {
      console.log(`User with username ${username} not found`);
      return;
    }

    // Create a Stripe customer if the user doesn't have one
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
      });
      user.stripeCustomerId = customer.id;
    }

    // Update user roles
    user.roles = ['admin', 'member', 'public', 'editor'];
    await user.save();

    console.log(`Updated roles for user ${username}:`, user.roles);
    mongoose.connection.close();
  } catch (error) {
    console.error('Error updating user roles:', error);
    mongoose.connection.close();
  }
};

updateUserRoles();

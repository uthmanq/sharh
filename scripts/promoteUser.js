// scripts/updateUserRoles.js

const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User'); // Adjust the path if necessary

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

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

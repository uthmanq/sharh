const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('./models/User'); // Adjust the path if necessary

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

const migratePasswords = async () => {
  try {
    const users = await User.find();

    for (const user of users) {
      if (!bcrypt.getRounds(user.password)) { // Check if the password is already hashed
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
        await user.save();
        console.log(`Updated password for user: ${user.username}`);
      }
    }

    console.log('Password migration complete.');
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    mongoose.connection.close();
  }
};

migratePasswords();

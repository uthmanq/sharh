const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User'); // Adjust the path if necessary
const Book = require('../models/Book'); // Adjust the path if necessary

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

const updateBooks = async () => {
  try {
    // Find the user with the username 'uthman.aq'
    const user = await User.findOne({ username: 'uthman.aq' });

    if (!user) {
      throw new Error('User with username uthman.aq not found');
    }

    // Find all books that need to be updated
    const books = await Book.find({});

    for (const book of books) {
      // Set the owner to the found user and visibility to 'public'
      book.owner = user._id;
      book.visibility = 'public';
      await book.save();
      console.log(`Updated book: ${book.title}`);
    }

    console.log('Book updates complete.');
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    mongoose.connection.close();
  }
};

updateBooks();

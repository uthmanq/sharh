const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;
const User = require('../models/User');

async function getUserIdIfLoggedIn(req, res, next) {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) {
        req.userId = null; // No token, treat as anonymous
        return next();
    }

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) {
            req.userId = null; // Invalid token, treat as anonymous
            return next();
        }

        const foundUser = await User.findById(decoded.id);
        req.userId = foundUser ? foundUser._id : null;
        next();
    });
}

module.exports = getUserIdIfLoggedIn;

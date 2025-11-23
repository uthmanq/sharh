const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;
const User = require('../models/User'); // Ensure you have the User model imported

function authenticateToken(requiredRoles = ['member']) {
    return async (req, res, next) => {
        const token = req.header('Authorization')?.split(' ')[1];
        if (!token) return res.status(401).send('Unauthorized: No token provided');

        jwt.verify(token, SECRET_KEY, async (err, user) => {
            if (err) return res.status(403).send('Forbidden: Invalid token');

            // Fetch the user from the database to get the latest roles
            const foundUser = await User.findById(user.id);
            if (!foundUser) return res.status(404).send('User not found');

            // Check if the user has at least one of the required roles
            const hasRequiredRole = requiredRoles.some(role => foundUser.roles.includes(role));
            if (requiredRoles.length && !hasRequiredRole) {
                return res.status(403).send('Forbidden: You do not have the required permissions');
            }

            req.user = foundUser; // Attach the user object to the request
            next();
        });
    };
}

// Optional authentication - doesn't fail if no token provided
function optionalAuthenticateToken() {
    return async (req, res, next) => {
        const token = req.header('Authorization')?.split(' ')[1];

        if (!token) {
            req.user = null; // No user authenticated
            return next();
        }

        jwt.verify(token, SECRET_KEY, async (err, user) => {
            if (err) {
                req.user = null; // Invalid token, treat as unauthenticated
                return next();
            }

            // Fetch the user from the database
            const foundUser = await User.findById(user.id);
            req.user = foundUser || null;
            next();
        });
    };
}

module.exports = authenticateToken;
module.exports.optionalAuthenticateToken = optionalAuthenticateToken;

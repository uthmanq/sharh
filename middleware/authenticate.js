
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRETKEY

function authenticateToken(req, res, next) {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized: No token provided');

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).send('Forbidden: Invalid token');
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;

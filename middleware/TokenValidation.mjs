import expressAsyncHandler from 'express-async-handler';
import Jwt from 'jsonwebtoken';

const TokenValidate = expressAsyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;          // lower-case
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }

    const [scheme, token] = authHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return res.status(401).json({ message: 'Malformed authorization header' });
    }

    try {
        // Jwt.verify with no callback throws if invalid
        const decoded = Jwt.verify(token, process.env.TOKEN_SECRET);
        req.user = decoded;
        req.authenticated = true;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
});

export { TokenValidate };

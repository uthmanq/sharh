const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: false }, // Made optional for OAuth users
    email: { type: String, required: true, unique: true },
    stripeCustomerId: { type: String, required: true },
    roles: { type: [String], default: ['member'] },
    createdAt: { type: Date, default: Date.now },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    // OAuth fields
    googleId: { type: String, sparse: true, unique: true },
    authMethod: { type: String, enum: ['local', 'google', 'both'], default: 'local' },
    profilePicture: { type: String } // URL from OAuth provider
});

// Pre-save hook to hash the password before saving
userSchema.pre('save', async function(next) {
    // Skip hashing if password is not set (OAuth users) or not modified
    if (!this.password || !this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;

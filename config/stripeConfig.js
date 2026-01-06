const TEST_SECRET_KEY = 'sk_test_51HMygzId9CfEnWZp0F01aT3gPRWBWGhdCl8iCz3EEPHcFLq09ARMpro87kSPubAFE2J6CjXpq9w6sD5Vf6lR89PR00qAdlDMK9';

// Use getter to evaluate STRIPE_ENV at access time, not at require time
// This ensures --teststripe flag is processed before the key is accessed
const config = {
    get secretKey() {
        if (process.env.STRIPE_ENV === 'test') {
            return TEST_SECRET_KEY;
        }
        return process.env.STRIPE_SECRET_KEY;
    }
};

module.exports = config;
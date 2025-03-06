const devConfig = {
    secretKey : 'sk_test_51HMygzId9CfEnWZp0F01aT3gPRWBWGhdCl8iCz3EEPHcFLq09ARMpro87kSPubAFE2J6CjXpq9w6sD5Vf6lR89PR00qAdlDMK9'
}

const prodConfig = {
    secretKey : process.env.STRIPE_SECRET_KEY
}

const config = process.env.STRIPE_ENV === 'test' ? devConfig : prodConfig;

module.exports = config;
require('dotenv').config();
const {
  SESClient,
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
  ListIdentitiesCommand
} = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function checkSESConfiguration() {
  try {
    console.log('AWS SES Configuration Check');
    console.log('='.repeat(60));
    console.log(`Region: ${process.env.AWS_SES_REGION || 'us-east-1'}\n`);

    // Get all verified identities
    const listCommand = new ListIdentitiesCommand({});
    const identities = await sesClient.send(listCommand);

    console.log('📧 Verified Identities:');
    if (identities.Identities && identities.Identities.length > 0) {
      identities.Identities.forEach(id => console.log(`  - ${id}`));
    } else {
      console.log('  ⚠️  None found');
    }

    if (identities.Identities && identities.Identities.length > 0) {
      // Check verification status
      console.log('\n📋 Verification Status:');
      const verifyCommand = new GetIdentityVerificationAttributesCommand({
        Identities: identities.Identities
      });
      const verifyResult = await sesClient.send(verifyCommand);

      for (const [identity, attrs] of Object.entries(verifyResult.VerificationAttributes)) {
        console.log(`\n  ${identity}:`);
        console.log(`    Status: ${attrs.VerificationStatus}`);
        if (attrs.VerificationToken) {
          console.log(`    Token: ${attrs.VerificationToken}`);
        }
      }

      // Check DKIM status
      console.log('\n🔐 DKIM Configuration:');
      const dkimCommand = new GetIdentityDkimAttributesCommand({
        Identities: identities.Identities
      });
      const dkimResult = await sesClient.send(dkimCommand);

      for (const [identity, attrs] of Object.entries(dkimResult.DkimAttributes)) {
        console.log(`\n  ${identity}:`);
        console.log(`    DKIM Enabled: ${attrs.DkimEnabled ? '✅ Yes' : '❌ No'}`);
        console.log(`    DKIM Verification Status: ${attrs.DkimVerificationStatus || 'Not configured'}`);

        if (attrs.DkimTokens && attrs.DkimTokens.length > 0) {
          console.log('    DKIM Tokens (add these as CNAME records):');
          attrs.DkimTokens.forEach((token, i) => {
            console.log(`      ${i + 1}. ${token}._domainkey.${identity.replace('*', '')} -> ${token}.dkim.amazonses.com`);
          });
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📝 Recommendations to Avoid Spam:');
    console.log('\n1. ✉️  Change FROM address from "no-reply@" to a real address');
    console.log('   Current: no-reply@sharhapp.com');
    console.log('   Better: hello@sharhapp.com, team@sharhapp.com, or support@sharhapp.com');

    console.log('\n2. 🔐 Enable DKIM for your domain');
    console.log('   - Go to AWS SES Console');
    console.log('   - Select your domain identity');
    console.log('   - Enable DKIM signing');
    console.log('   - Add the CNAME records to your DNS');

    console.log('\n3. 📊 Add SPF Record to DNS:');
    console.log('   Type: TXT');
    console.log('   Name: @');
    console.log('   Value: v=spf1 include:amazonses.com ~all');

    console.log('\n4. 🛡️  Add DMARC Record to DNS:');
    console.log('   Type: TXT');
    console.log('   Name: _dmarc');
    console.log('   Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@sharhapp.com');

    console.log('\n5. ✅ Verify entire domain (not just email address)');
    console.log('   - Verifying sharhapp.com allows you to send from any @sharhapp.com address');

    console.log('\n6. 📝 Email Content Tips:');
    console.log('   - Include unsubscribe link');
    console.log('   - Use proper HTML structure');
    console.log('   - Avoid spam trigger words ("FREE!", "ACT NOW!", etc.)');
    console.log('   - Include physical address in footer');
    console.log('   - Keep text-to-image ratio balanced');

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Error checking SES configuration:', error.message);
    console.error(error);
  }
}

checkSESConfiguration();

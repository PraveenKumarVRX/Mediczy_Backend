const fs = require('node:fs');
const path = require('node:path');
module.exports = ({ config }) => {
  const profileName = process.env.TENANT_APP_PROFILE;
  if (!profileName) return { ...config, extra: { ...config.extra, tenantApp: { product: 'patient', appId: 'mediczy.patient' } } };
  if (!/^[a-z0-9-]+$/.test(profileName)) throw new Error('Invalid TENANT_APP_PROFILE');
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles', `${profileName}.json`), 'utf8'));
  if (!['patient', 'phlebo', 'crm', 'smart-force'].includes(profile.product) ||
      !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(profile.appId) ||
      typeof profile.name !== 'string' || !profile.name.trim() || !/^#[0-9a-f]{6}$/i.test(profile.color)) throw new Error('Invalid tenant app profile');
  return { ...config, name: profile.name, slug: profileName, scheme: profileName,
    ios: { ...config.ios, bundleIdentifier: profile.appId }, android: { ...config.android, package: profile.appId },
    splash: { ...config.splash, backgroundColor: profile.color },
    extra: { ...config.extra, tenantApp: { product: profile.product, appId: profile.appId } },
  };
};

// Usage: node server/scripts/ssm-env-loader.mjs server/scripts/ops/gupshup-partner-login.mjs <email> <password>
const email = process.argv[process.argv.length - 2];
const password = process.argv[process.argv.length - 1];

const form = new URLSearchParams({ email, secret: password });
const resp = await fetch('https://partner.gupshup.io/partner/account/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form.toString(),
});
const text = await resp.text();
console.log('status:', resp.status);
console.log(text.slice(0, 1000));
process.exit(0);

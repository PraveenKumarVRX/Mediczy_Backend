# GoDaddy Certificate Reissue Instructions
# =============================================

## 🔐 STEP 1: Login to GoDaddy
1. Go to: https://sso.godaddy.com/
2. Login to your GoDaddy account
3. Navigate to: "My Products" → "SSL Certificates"

## 🔄 STEP 2: Reissue Your Certificate
1. Find your "mayden.in" SSL certificate
2. Click "Manage" or "SSL Management"
3. Click "Re-Key Certificate" or "Reissue"
4. When prompted for CSR, paste the following:

-----BEGIN CERTIFICATE REQUEST-----
MIICnDCCAYQCAQAwVzELMAkGA1UEBhMCSU4xDjAMBgNVBAgMBVN0YXRlMQ0wCwYD
VQQHDARDaXR5MRUwEwYDVQQKDAxPcmdhbml6YXRpb24xEjAQBgNVBAMMCW1heWRl
bi5pbjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALrJ8FgfcMUIN9rm
ogyWg0Ib9ZeTbABs4flzX+5clgNetqJm3OEhCvXIXGesa2AZNYjLi49uUiuGh0kC
v5nHOjC8ndTSmBa4K2dFErMjrzWzcZmHp3vaADbAWaTujgyGf+At7a9buCwnK8xw
DYnVlPMA24ZrwXEsLOo8Ohb5WTnA0TRxbAPFjPjiICMRvKG8HPaMWebeWuk7EldK
0mGscS2dVrebH8siLVj2veB3P1ew7ewPmfYbdvUL5aFHUHy1kZNTEc5FwfAEuZBv
IDlont7GjdpIC6mEkntrRvS1X+TuojPKuFZxJzOTG0pgkg4AmqyYNTcPkHqk1m2G
OGPbZjsCAwEAAaAAMA0GCSqGSIb3DQEBCwUAA4IBAQA9Kxh2lCgrwBYQWp59URIb
qossjdWUqmY1s59W7sjV/g8DBVZUrl/ao/zR+h5v9QRXgVRkrjdsfP4FrkEUQxTP
Bk44nNYKCywsCQteE+WGfLfxGkXLXQu0bh0C5NdV/7bWNkyK887iwtZFA/DY8C/Y
+zQ+CPl6DpTGsG70fHPAK0vq8OdBmZV0n4BCgeLsYYTTZR7sRoTN7+0G8Icp28Hu
TVnblv4Tr9KOVs7xNhXSJMSP/NHiDgWcaS+a4+vuM/fz+3fH1djErXDG95nnsnil
t69LvMHUg6Ec/BPj4NsPgMbL1ZFCkwq8QIWn2yMygGCCuumJ5lJWrI69xrX2xO1S
-----END CERTIFICATE REQUEST-----

## ⏰ STEP 3: Wait for Processing
- GoDaddy typically processes reissues within 24 hours
- You'll receive an email when ready
- Download will include: domain.crt and gd_bundle-g2.crt

## 📧 STEP 4: After Receiving New Certificate
Run this command on your server:
./install-new-godaddy-cert.sh

---
Save this file for reference!
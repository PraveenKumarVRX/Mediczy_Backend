# Production Deployment Guide for mayden.in

## 🚀 Quick Setup Summary

The Mediczy application has been configured for production deployment on **mayden.in** with GoDaddy SSL certificates.

### ✅ Completed Configuration

1. **Nginx Configuration**: `/etc/nginx/sites-available/mayden`
2. **Web Root**: `/var/www/mayden`
3. **Environment Files**: Updated for mayden.in domain
4. **Build Configuration**: Optimized for production
5. **Deployment Scripts**: Automated deployment tools

### 📋 Required Steps to Go Live

#### 1. Install GoDaddy SSL Certificates
```bash
# Place your GoDaddy certificates:
sudo cp your-certificate.crt /etc/nginx/ssl/mayden.in.crt
sudo cp your-private-key.key /etc/nginx/ssl/mayden.in.key

# Run SSL installation script:
./install-ssl.sh
```

#### 2. Deploy to Production
```bash
# Run the deployment script:
./deploy-production.sh
```

#### 3. DNS Configuration
Point your domain's DNS records to this server:
- A Record: `mayden.in` → `SERVER_IP`
- A Record: `www.mayden.in` → `SERVER_IP`

### 🛠️ Management Commands

```bash
# Production management
./production-manager.sh status    # Check status
./production-manager.sh start     # Start backend
./production-manager.sh stop      # Stop backend
./production-manager.sh restart   # Restart backend
./production-manager.sh logs      # View logs
./production-manager.sh deploy    # Full deployment
./production-manager.sh backup    # Create backup

# Build commands
cd client && npm run build:prod   # Production build
cd client && npm run deploy       # Build and deploy
```

### 🌐 URLs After Deployment

- **Website**: https://mayden.in
- **Admin Panel**: https://mayden.in/admin/login
- **Team Portal**: https://mayden.in/team/login
- **API Endpoint**: https://mayden.in/api

### 🔧 Environment Variables

Update these in `/root/Mediczy/.env` and `/root/Mediczy/server/.env`:

```bash
# Database credentials
DB_PASSWORD=your_actual_db_password

# Security keys (generate new ones!)
SECRET_TOKEN=your_super_secure_secret_key
ENCRYPTION_KEY=your_encryption_key_64_chars

# Email configuration
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### 📝 SSL Certificate Requirements

Your GoDaddy SSL certificate should include:
1. **Primary certificate** (mayden.in)
2. **Intermediate certificates** (certificate chain)
3. **Private key**

### 🔍 Verification Checklist

After deployment, verify:
- [ ] https://mayden.in loads correctly
- [ ] SSL certificate is valid and trusted
- [ ] Admin login works at https://mayden.in/admin/login
- [ ] Team login works at https://mayden.in/team/login
- [ ] API endpoints respond correctly
- [ ] All static assets load properly

### 📊 Monitoring

**Log Files:**
- Backend: `/var/log/mediczy-backend.log`
- Nginx: `/var/log/nginx/error.log`
- Access: `/var/log/nginx/access.log`

**Status Check:**
```bash
./production-manager.sh status
```

### 🔄 Updates and Maintenance

For future updates:
```bash
# Pull latest changes
git pull origin main

# Deploy updates
./deploy-production.sh

# Or use the manager
./production-manager.sh deploy
```

---

## 🎉 Ready for Production!

Your Mediczy application is now configured for production deployment on mayden.in. Follow the steps above to complete the setup and go live.
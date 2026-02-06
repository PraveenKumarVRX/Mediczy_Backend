# EC2 PostgreSQL Connection Setup Guide

## Overview
Your PostgreSQL database is running on AWS EC2 instance at **13.234.17.52**

## Quick Start

### Step 1: Upload SSH Key to Codespace

Your SSH key is currently at: `C:\Users\admin\.ssh\mediqzy.pem`

**Upload it to the codespace:**

```bash
# Create SSH directory if needed
mkdir -p ~/.ssh

# Open nano editor
nano ~/.ssh/mediqzy.pem
```

Then:
1. Open `C:\Users\admin\.ssh\mediqzy.pem` on your Windows machine
2. Copy the entire content (including `-----BEGIN` and `-----END` lines)
3. Paste into the nano editor in codespace
4. Press `Ctrl+X`, then `Y`, then `Enter` to save
5. Set correct permissions:

```bash
chmod 600 ~/.ssh/mediqzy.pem
```

### Step 2: Start SSH Tunnel

Open a **new terminal** and run:

```bash
./connect-ec2-db.sh
```

This creates a secure tunnel: `localhost:5433` → `EC2:5432`

**⚠️ Important:** Keep this terminal open while working with the database!

### Step 3: Test Database Connection

In another terminal:

```bash
./test-db-connection.sh
```

Expected output: `✅ Connection successful!`

### Step 4: Run Database Migration

```bash
./setup-database.sh
```

This will:
- Test connection
- Create 17 API tables
- Insert seed data (clinic-demo tenant)

### Step 5: Start Application Server

```bash
npm start
```

Server will start on http://localhost:5000

---

## Connection Details

**EC2 Instance:**
- Public IP: `13.234.17.52`
- SSH User: `ubuntu`
- SSH Port: `22`
- SSH Key: `~/.ssh/mediqzy.pem`

**PostgreSQL Database (on EC2):**
- Host: `localhost` (via SSH tunnel on port 5433)
- Port: `5433` (local) → forwarded to `5432` (EC2)
- Database: `mediczy`
- Username: `mediczy`
- Password: `Mediczy2024Secure`

**Updated in:** `.env` file

---

## Alternative: Direct Connection (Not Recommended)

If you prefer direct PostgreSQL connection without SSH tunnel:

### On EC2 Instance (via SSH):

1. **Edit PostgreSQL config:**
```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
# Change: listen_addresses = '*'
```

2. **Edit access control:**
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add: host all all 0.0.0.0/0 md5
```

3. **Restart PostgreSQL:**
```bash
sudo systemctl restart postgresql
```

4. **Open Security Group:**
- AWS Console → EC2 → Security Groups
- Add Inbound Rule: PostgreSQL (port 5432) from your IP

5. **Update `.env`:**
```env
POSTGRES_HOST=13.234.17.52
POSTGRES_PORT=5432
```

⚠️ **Security Warning:** This exposes PostgreSQL to the internet. SSH tunnel is much more secure!

---

## Troubleshooting

### "Permission denied (publickey)"
- Ensure SSH key has correct permissions: `chmod 600 ~/.ssh/mediqzy.pem`
- Verify key is uploaded correctly (should start with `-----BEGIN`)

### "Connection refused"
- Check EC2 security group allows SSH (port 22) from your IP
- Verify EC2 instance is running

### "password authentication failed"
- Database credentials might be different
- Check PostgreSQL user exists on EC2: 
  ```bash
  ssh -i ~/.ssh/mediqzy.pem ubuntu@13.234.17.52 "sudo -u postgres psql -c '\du'"
  ```

### Tunnel disconnects
- SSH tunnel script includes keep-alive settings
- If disconnected, just run `./connect-ec2-db.sh` again

---

## Database Credentials Verification

If connection fails, check what databases exist on EC2:

```bash
# SSH into EC2
ssh -i ~/.ssh/mediqzy.pem ubuntu@13.234.17.52

# List databases
sudo -u postgres psql -c "\l"

# List users
sudo -u postgres psql -c "\du"
```

You mentioned these credentials earlier:
- Database: `Mediczy_Helper`
- User: `Mediczy_Helper`
- Password: `Mediczy2024Helper`

If those are correct instead, update `.env`:
```env
POSTGRES_DATABASE=Mediczy_Helper
POSTGRES_USER=Mediczy_Helper
POSTGRES_PASSWORD=Mediczy2024Helper
```

---

## Next Steps

1. ✅ Upload SSH key
2. ✅ Start tunnel: `./connect-ec2-db.sh`
3. ✅ Test connection: `./test-db-connection.sh`
4. ✅ Run migration: `./setup-database.sh`
5. ✅ Start server: `npm start`
6. ✅ Test API: `curl http://localhost:5000/v1/health`

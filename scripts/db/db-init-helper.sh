#!/bin/bash
# Database initialization without sudo

echo "🔧 PostgreSQL Setup Assistant"
echo "============================="
echo ""

echo "This PostgreSQL server needs the database and user created."
echo ""
echo "To create the database, you need ONE of these:"
echo ""
echo "1. Sudo/admin access on this machine"
echo "2. Connection to a cloud PostgreSQL database"
echo "3. A preconfigured PostgreSQL connection string"
echo ""
echo "Current status:"
echo "  - PostgreSQL is running on localhost: 5432"
echo "  - No 'mediczy_helper' user exists yet"
echo "  - No 'mediczy_ai' database exists yet"
echo ""
echo "What would you like to do?"
echo ""
echo "  A) I have admin access (I can use 'sudo')"
echo "  B) I want to use a cloud database (Azure, AWS, etc.)"
echo "  C) I have a PostgreSQL connection string"
echo  "  D) Skip database setup for now (run app without DB)"
echo ""
read -p "Enter your choice (A/B/C/D): " choice

case $choice in
  [Aa]* )
    echo ""
    echo "Run these commands with sudo access:"
    echo ""
    echo "sudo -u postgres psql << 'EOF'"
    echo "CREATE USER mediczy_helper WITH PASSWORD 'Mediczy2024Helper';"
    echo "CREATE DATABASE mediczy_ai OWNER mediczy_helper;"
    echo "GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;"
    echo "\\q"
    echo "EOF"
    echo ""
    echo "Then run: ./setup-database.sh"
    ;;
  [Bb]* )
    echo ""
    echo "Update .env with your cloud database credentials:"
    echo ""
    echo "POSTGRES_HOST=your-server.database.cloud"
    echo "POSTGRES_PORT=5432"
    echo "POSTGRES_DATABASE=your_database"
    echo "POSTGRES_USER=your_username"
    echo "POSTGRES_PASSWORD=your_password"
    echo "POSTGRES_SSL=true"
    ;;
  [Cc]* )
    echo ""
    read -p "Paste your PostgreSQL connection string: " conn_string
    echo "Connection string: $conn_string"
    # Parse and update .env...
    ;;
  [Dd]* )
    echo ""
    echo "You can start the server, but database features won't work."
    echo "Run: npm start"
    ;;
  * )
    echo "Invalid choice"
    ;;
esac

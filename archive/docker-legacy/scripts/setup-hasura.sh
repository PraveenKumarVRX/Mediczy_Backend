#!/bin/bash

###############################################################################
# Hasura GraphQL Setup Script
# 
# This script sets up Hasura GraphQL Engine for Mediczy
# Provides instant GraphQL API on top of existing PostgreSQL database
###############################################################################

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Mediczy Hasura GraphQL Setup                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${BLUE}✓ Docker and Docker Compose are installed${NC}"

# Create Hasura metadata directory
echo -e "\n${BLUE}📁 Creating Hasura metadata directory...${NC}"
mkdir -p hasura/metadata
mkdir -p hasura/migrations
mkdir -p hasura/seeds

# Create basic metadata structure
cat > hasura/metadata/version.yaml << 'EOF'
version: 3
EOF

cat > hasura/metadata/databases.yaml << 'EOF'
- name: default
  kind: postgres
  configuration:
    connection_info:
      use_prepared_statements: true
      database_url:
        from_env: HASURA_GRAPHQL_DATABASE_URL
      isolation_level: read-committed
      pool_settings:
        connection_lifetime: 600
        retries: 1
        idle_timeout: 180
        max_connections: 50
  tables: []
  functions: []
EOF

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating one...${NC}"
    cat > .env << 'EOF'
# PostgreSQL Configuration
POSTGRES_PASSWORD=mediczy_secure_2024

# Hasura Configuration
HASURA_ADMIN_SECRET=mediczy_hasura_secret_2024

# JWT Secret (must match your existing JWT_SECRET)
JWT_SECRET=mediczy-super-secret-key-2024
EOF
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Start Hasura
echo -e "\n${BLUE}🚀 Starting Hasura GraphQL Engine...${NC}"
docker-compose -f docker-compose.hasura.yml up -d

# Wait for Hasura to be ready
echo -e "\n${BLUE}⏳ Waiting for Hasura to be ready...${NC}"
sleep 10

# Check if Hasura is running
if docker ps | grep -q mediczy-hasura; then
    echo -e "${GREEN}✓ Hasura is running!${NC}"
else
    echo -e "${RED}❌ Failed to start Hasura${NC}"
    exit 1
fi

# Display information
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   Setup Complete! 🎉                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Hasura GraphQL Console:${NC}  http://localhost:8080"
echo -e "${GREEN}GraphQL Endpoint:${NC}        http://localhost:8080/v1/graphql"
echo -e "${GREEN}Admin Secret:${NC}            mediczy_hasura_secret_2024"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Open Hasura Console: http://localhost:8080"
echo "2. Enter admin secret: mediczy_hasura_secret_2024"
echo "3. Click 'Data' tab"
echo "4. Track existing tables (users, doctors, appointments, etc.)"
echo "5. Set up relationships between tables"
echo "6. Configure permissions for different roles"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  - View logs:        docker-compose -f docker-compose.hasura.yml logs -f hasura"
echo "  - Stop Hasura:      docker-compose -f docker-compose.hasura.yml down"
echo "  - Restart Hasura:   docker-compose -f docker-compose.hasura.yml restart hasura"
echo ""
echo -e "${GREEN}GraphQL is now available! Try a query:${NC}"
echo ""
cat << 'EOF'
query {
  users {
    id
    email
    firstName
    lastName
  }
}
EOF
echo ""

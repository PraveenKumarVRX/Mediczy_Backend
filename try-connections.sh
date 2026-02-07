#!/bin/bash
# Try different PostgreSQL connection combinations

echo "🔍 Testing PostgreSQL Connections"
echo "================================="
echo ""

# Combinations to try
declare -a CONFIGS=(
  "mediczy_helper:Mediczy2024Helper:mediczy_ai"
  "mediczy_helper:Mediczy2024Helper:Mediczy_Helper"
  "Mediczy_Helper:Mediczy2024Helper:mediczy_ai"
  "Mediczy_Helper:Mediczy2024Helper:Mediczy_Helper"
  "postgres:Mediczy2024Helper:mediczy_ai"
  "postgres:Mediczy2024Helper:postgres"
)

for config in "${CONFIGS[@]}"; do
  IFS=':' read -r user pass db <<< "$config"
  echo "Testing: User=$user, Database=$db"
  
  PGPASSWORD="$pass" psql -h 127.0.0.1 -U "$user" -d "$db" -c "SELECT 'SUCCESS' as status, version();" 2>/dev/null
  
  if [ $? -eq 0 ]; then
    echo "✅ CONNECTION SUCCESSFUL!"
    echo ""
    echo "Working credentials:"
    echo "  POSTGRES_USER=$user"
    echo "  POSTGRES_PASSWORD=$pass"
    echo "  POSTGRES_DATABASE=$db"
    echo ""
    
    # Update .env file
    sed -i "s/^POSTGRES_USER=.*/POSTGRES_USER=$user/" .env
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$pass/" .env
    sed -i "s/^POSTGRES_DATABASE=.*/POSTGRES_DATABASE=$db/" .env
    
    echo ".env file updated!"
    echo ""
    echo "Now run: ./setup-database.sh"
    exit 0
  else
    echo "  ❌ Failed"
  fi
  echo ""
done

echo "❌ None of the combinations worked."
echo ""
echo "Your PostgreSQL database needs to be set up first."
echo "Please provide:"
echo "  1. The exact database NAME"
echo "  2. The exact USERNAME"
echo "  3. Confirm the PASSWORD"

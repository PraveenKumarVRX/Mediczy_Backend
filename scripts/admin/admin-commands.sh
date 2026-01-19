#!/bin/bash
# Admin Workflow Quick Commands

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Mediczy Admin Quick Commands ===${NC}\n"

# 1. Get admin token
echo -e "${GREEN}1. Login as Admin:${NC}"
echo 'TOKEN=$(curl -s -X POST http://localhost:8000/api/admin/login -H "Content-Type: application/json" -d "{\"email\":\"admin@mediczy.local\",\"password\":\"Admin@1234\"}" | grep -o "\"token\":\"[^\"]*" | cut -d"\"" -f4)'
echo -e "\n"

# 2. Upload doctors
echo -e "${GREEN}2. Upload Doctors:${NC}"
cat << 'EOF'
curl -X POST http://localhost:8000/api/admin/masters/doctors \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "doctors": [{
      "firstName": "John",
      "lastName": "Smith",
      "email": "john.smith@example.com",
      "specialization": "Cardiologist",
      "experience": 15,
      "phoneNumber": "555-0123",
      "languages": ["English"]
    }]
  }'
EOF
echo -e "\n"

# 3. Upload labs
echo -e "${GREEN}3. Upload Labs:${NC}"
cat << 'EOF'
curl -X POST http://localhost:8000/api/admin/masters/labs \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "labs": [{
      "name": "Health Lab",
      "email": "health@lab.com",
      "phoneNumber": "555-0100",
      "services": ["Blood Test", "X-Ray"],
      "accreditation": "NABL"
    }]
  }'
EOF
echo -e "\n"

# 4. Upload pharmacies
echo -e "${GREEN}4. Upload Pharmacies:${NC}"
cat << 'EOF'
curl -X POST http://localhost:8000/api/admin/masters/pharmacies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "pharmacies": [{
      "name": "City Pharmacy",
      "email": "city@pharmacy.com",
      "phoneNumber": "555-0200",
      "licenseNumber": "LIC-54321"
    }]
  }'
EOF
echo -e "\n"

# 5. Verify uploads
echo -e "${GREEN}5. Verify Database Records:${NC}"
echo 'mysql -u mediczy -pmediczy2024 mediczy -e "SELECT COUNT(*) as doctors FROM doctors; SELECT COUNT(*) as labs FROM labs; SELECT COUNT(*) as pharmacies FROM pharmacies;"'
echo -e "\n"

# 6. Seed new admin
echo -e "${GREEN}6. Seed Admin User:${NC}"
echo 'cd server && npm run seed:admin'
echo -e "\n"

# Admin credentials
echo -e "${YELLOW}=== Admin Credentials ===${NC}"
echo "Email: admin@mediczy.local"
echo "Password: Admin@1234"
echo -e "\n"

# Frontend URLs
echo -e "${YELLOW}=== Frontend URLs ===${NC}"
echo "Login: http://localhost:5173/admin/login"
echo "Dashboard: http://localhost:5173/admin"
echo -e "\n"

# Valid specializations
echo -e "${YELLOW}=== Valid Doctor Specializations ===${NC}"
echo "Cardiologist, Neurologist, Pediatrician, Dermatologist, Orthopedist,"
echo "Psychiatrist, Psychologist, General Practitioner, ENT Specialist,"
echo "Ophthalmologist, Rheumatologist, Pulmonologist, Physiotherapist,"
echo "Nutritionist, Dietician, Gastroenterologist, General Surgeon, Other"

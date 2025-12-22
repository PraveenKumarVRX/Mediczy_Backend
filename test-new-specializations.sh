#!/bin/bash

echo "🏥 Testing New Medical Specializations in Mediczy"
echo "================================================="

# Array of new specializations to test
specializations=(
    "Ophthalmologist"
    "Rheumatologist"
    "Pulmonologist"
    "Physiotherapist"
    "Occupational Therapist"
    "Nutritionist"
    "Dietician"
    "Psychologist"
    "Nephrologist"
    "Diabetologist"
    "Intensivist"
    "Cardio Thoracic Surgeon"
    "Vascular Surgeon"
    "Neuro Surgeon"
    "Cardio Vascular Surgeon"
    "Gastroenterologist"
    "Gastro Surgeon"
    "General Surgeon"
    "Proctologist"
    "Podiatrician"
)

success_count=0
total_count=${#specializations[@]}

echo "Testing $total_count new specializations..."
echo ""

for i in "${!specializations[@]}"; do
    spec="${specializations[$i]}"
    email="test_${i}_$(date +%s)@example.com"
    phone="+91987654$(printf "%04d" $((3000 + $i)))"
    
    echo "Testing: $spec"
    
    response=$(curl -s -X POST http://localhost:8000/api/doctors/register \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$email\",
            \"password\": \"Doctor123\",
            \"firstName\": \"Test\",
            \"lastName\": \"Doctor\",
            \"phoneNumber\": \"$phone\",
            \"specialization\": \"$spec\",
            \"experience\": 5,
            \"qualifications\": [\"MBBS\", \"Specialization Certificate\"]
        }")
    
    if echo "$response" | grep -q "Doctor registered successfully"; then
        echo "  ✅ $spec: SUCCESS"
        ((success_count++))
    else
        echo "  ❌ $spec: FAILED"
        echo "     Error: $(echo "$response" | head -c 100)"
    fi
    
    sleep 0.5  # Small delay between requests
done

echo ""
echo "================================================="
echo "🎉 Specialization Tests Complete!"
echo "Success Rate: $success_count/$total_count"

if [ $success_count -eq $total_count ]; then
    echo "🎊 All specializations working perfectly!"
else
    echo "⚠️  Some specializations need attention"
fi

echo "================================================="
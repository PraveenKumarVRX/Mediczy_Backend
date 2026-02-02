#!/bin/bash

# Kafka Events Testing & Monitoring Script
# Tests all implemented Kafka event types and monitors consumer activity

echo "======================================"
echo "Mediczy Kafka Events Testing"
echo "======================================"
echo ""

KAFKA_BIN="/opt/kafka/bin"
BROKER="localhost:9092"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}1. Listing all Kafka topics${NC}"
$KAFKA_BIN/kafka-topics.sh --list --bootstrap-server $BROKER
echo ""

echo -e "${BLUE}2. Checking consumer groups${NC}"
$KAFKA_BIN/kafka-consumer-groups.sh --list --bootstrap-server $BROKER
echo ""

echo -e "${BLUE}3. Consumer group details${NC}"
$KAFKA_BIN/kafka-consumer-groups.sh --describe --group mediczy-notification-group --bootstrap-server $BROKER 2>&1 | head -20
echo ""

echo -e "${YELLOW}4. Publishing test events to Kafka...${NC}"

# Test Appointment Event
echo -e "${GREEN}Publishing appointment.created event...${NC}"
echo '{"type":"appointment.created","appointmentId":9999,"userId":1,"patientName":"Test Patient","doctorName":"Dr. Test Doctor","appointmentDate":"2026-02-05","appointmentTime":"14:00","consultationType":"video","status":"scheduled","consultationFee":500}' | \
$KAFKA_BIN/kafka-console-producer.sh --broker-list $BROKER --topic appointment-events

# Test Payment Event
echo -e "${GREEN}Publishing payment.success event...${NC}"
echo '{"type":"payment.success","paymentId":"pay_test123","userId":1,"userName":"Test User","amount":500,"currency":"INR","status":"completed","paymentMethod":"upi"}' | \
$KAFKA_BIN/kafka-console-producer.sh --broker-list $BROKER --topic payment-events

# Test User Event
echo -e "${GREEN}Publishing user.registered event...${NC}"
echo '{"type":"user.registered","userId":9999,"email":"test@example.com","firstName":"Test","lastName":"User","userType":"patient","registrationMethod":"email"}' | \
$KAFKA_BIN/kafka-console-producer.sh --broker-list $BROKER --topic user-events

# Test Doctor Event
echo -e "${GREEN}Publishing doctor.online event...${NC}"
echo '{"type":"doctor.online","doctorId":1,"doctorName":"Dr. John Smith","specialization":"Cardiologist"}' | \
$KAFKA_BIN/kafka-console-producer.sh --broker-list $BROKER --topic doctor-events

# Test Video Event
echo -e "${GREEN}Publishing video_stream_started event...${NC}"
echo '{"type":"consultation.started","appointmentId":9999,"roomId":"room_test123","patientName":"Test Patient","doctorName":"Dr. Test Doctor","consultationType":"video","startTime":"'$(date -Iseconds)'"}' | \
$KAFKA_BIN/kafka-console-producer.sh --broker-list $BROKER --topic video-stream-started

echo ""
echo -e "${YELLOW}5. Monitoring topic activity (last 5 messages per topic)${NC}"

echo -e "${GREEN}Appointment Events:${NC}"
timeout 2 $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic appointment-events --from-beginning --max-messages 5 2>/dev/null || true
echo ""

echo -e "${GREEN}Payment Events:${NC}"
timeout 2 $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic payment-events --from-beginning --max-messages 5 2>/dev/null || true
echo ""

echo -e "${GREEN}User Events:${NC}"
timeout 2 $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic user-events --from-beginning --max-messages 5 2>/dev/null || true
echo ""

echo -e "${GREEN}Video Stream Events:${NC}"
timeout 2 $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic video-stream-started --from-beginning --max-messages 5 2>/dev/null || true
echo ""

echo -e "${BLUE}6. Topic descriptions${NC}"
$KAFKA_BIN/kafka-topics.sh --describe --topic appointment-events --bootstrap-server $BROKER
echo ""

echo -e "${GREEN}======================================"
echo "Kafka Events Test Complete!"
echo "======================================${NC}"
echo ""
echo "Monitor events in real-time:"
echo "  - Appointments: $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic appointment-events"
echo "  - Payments: $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic payment-events"
echo "  - Users: $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic user-events"
echo "  - Doctor: $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic doctor-events"
echo "  - Video: $KAFKA_BIN/kafka-console-consumer.sh --bootstrap-server $BROKER --topic video-stream-started"
echo ""
echo "Check application logs:"
echo "  pm2 logs mediczy-server | grep -i kafka"
echo ""

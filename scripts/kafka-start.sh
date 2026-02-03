#!/bin/bash
# Kafka Startup Script with Port Cleanup
# Ensures Zookeeper (2181) and Kafka (9092) ports are free before starting

set -e

KAFKA_HOME="/opt/kafka"
ZOOKEEPER_PORT=2181
KAFKA_PORT=9092

echo "[$(date)] Kafka pre-start: Checking for stale processes..."

# Kill any process using Zookeeper port
if sudo fuser -k $ZOOKEEPER_PORT/tcp 2>/dev/null; then
    echo "[$(date)] Killed stale process on Zookeeper port $ZOOKEEPER_PORT"
    sleep 2
fi

# Kill any process using Kafka port
if sudo fuser -k $KAFKA_PORT/tcp 2>/dev/null; then
    echo "[$(date)] Killed stale process on Kafka port $KAFKA_PORT"
    sleep 2
fi

# Kill orphaned Kafka/Zookeeper Java processes
for PATTERN in "kafka.Kafka" "org.apache.zookeeper"; do
    for PID in $(pgrep -f "$PATTERN" 2>/dev/null || true); do
        echo "[$(date)] Killing orphaned process ($PATTERN): $PID"
        kill -9 $PID 2>/dev/null || true
    done
done

# Brief pause to ensure ports are released
sleep 3

echo "[$(date)] Starting Zookeeper..."
$KAFKA_HOME/bin/zookeeper-server-start.sh -daemon $KAFKA_HOME/config/zookeeper.properties

# Wait for Zookeeper to be ready
sleep 5

echo "[$(date)] Starting Kafka..."
exec $KAFKA_HOME/bin/kafka-server-start.sh $KAFKA_HOME/config/server.properties

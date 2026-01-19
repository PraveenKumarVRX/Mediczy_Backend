# Video Streaming Events with Kafka

## Overview

Kafka is now integrated with the Mediczy backend for real-time video streaming event processing. This enables analytics, monitoring, and event-driven workflows for video consultations, recordings, and participant tracking.

## System Architecture

- **Kafka Version**: 3.5.1
- **Zookeeper**: Running on default port 2181
- **Kafka Broker**: Running on localhost:9092
- **Process Manager**: PM2
- **Backend Integration**: Automatic Kafka producer/consumer connection on startup

## Kafka Topics

The following topics are automatically created for video streaming events:

1. **video-stream-started** - Video call initiation events
2. **video-stream-ended** - Video call termination events
3. **video-stream-quality** - Real-time quality metrics
4. **video-participant-joined** - Participant join events
5. **video-participant-left** - Participant leave events
6. **video-recording-started** - Recording start events
7. **video-recording-stopped** - Recording stop events
8. **video-stream-error** - Error and issue tracking

## API Endpoints

Base URL: `http://localhost:8000/api/video-events`

### 1. Stream Started

**POST** `/stream/start`

Publish when a video consultation begins.

```json
{
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "userId": "doctor_001",
  "userName": "Dr. Sarah Johnson",
  "userRole": "doctor",
  "streamType": "consultation",
  "quality": "hd",
  "metadata": {
    "appointmentId": "apt_12345",
    "patientId": "patient_67890"
  }
}
```

### 2. Stream Ended

**POST** `/stream/end`

Publish when a video consultation ends.

```json
{
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "userId": "doctor_001",
  "duration": 1800,
  "endReason": "normal",
  "participantCount": 2,
  "metadata": {}
}
```

### 3. Stream Quality

**POST** `/stream/quality`

Publish real-time quality metrics (recommended every 30-60 seconds).

```json
{
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "userId": "doctor_001",
  "quality": "excellent",
  "bitrate": 2500,
  "framerate": 30,
  "resolution": "1920x1080",
  "latency": 45,
  "packetLoss": 0.2,
  "jitter": 5,
  "networkType": "wifi",
  "metadata": {}
}
```

### 4. Participant Joined

**POST** `/participant/joined`

Publish when a user joins the video call.

```json
{
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "userId": "patient_67890",
  "userName": "John Doe",
  "userRole": "patient",
  "audioEnabled": true,
  "videoEnabled": true,
  "device": "mobile",
  "browser": "Chrome",
  "metadata": {}
}
```

### 5. Participant Left

**POST** `/participant/left`

Publish when a user leaves the video call.

```json
{
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "userId": "patient_67890",
  "duration": 1800,
  "leaveReason": "normal",
  "metadata": {}
}
```

### 6. Recording Started

**POST** `/recording/start`

Publish when recording begins.

```json
{
  "recordingId": "rec_12345",
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "initiatedBy": "doctor_001",
  "format": "mp4",
  "quality": "hd",
  "storageLocation": "s3",
  "metadata": {}
}
```

### 7. Recording Stopped

**POST** `/recording/stop`

Publish when recording stops.

```json
{
  "recordingId": "rec_12345",
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "duration": 1800,
  "fileSize": 524288000,
  "filePath": "s3://mediczy-recordings/rec_12345.mp4",
  "stopReason": "normal",
  "metadata": {}
}
```

### 8. Stream Error

**POST** `/stream/error`

Publish when errors occur during streaming.

```json
{
  "streamId": "stream_12345",
  "roomId": "room_consultation_001",
  "userId": "doctor_001",
  "errorType": "bandwidth",
  "errorMessage": "Insufficient bandwidth detected",
  "severity": "medium",
  "recovered": true,
  "metadata": {}
}
```

## Integration Examples

### Frontend Integration (React/TypeScript)

```typescript
// Video streaming event service
class VideoStreamingEventService {
  private baseUrl = 'http://localhost:8000/api/video-events';
  
  async publishStreamStarted(data: {
    streamId: string;
    roomId: string;
    userId: string;
    userName: string;
    userRole: string;
    streamType?: string;
    quality?: string;
    metadata?: any;
  }) {
    await fetch(`${this.baseUrl}/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
  
  async publishQualityMetrics(data: {
    streamId: string;
    roomId: string;
    userId: string;
    quality: string;
    bitrate: number;
    framerate: number;
    resolution: string;
    latency: number;
    packetLoss?: number;
    jitter?: number;
    networkType?: string;
  }) {
    await fetch(`${this.baseUrl}/stream/quality`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
}

// Usage in video call component
const handleStreamStart = async () => {
  await videoEventService.publishStreamStarted({
    streamId: callSession.streamId,
    roomId: callSession.roomId,
    userId: currentUser.id,
    userName: currentUser.name,
    userRole: currentUser.role,
    streamType: 'consultation',
    quality: 'hd',
    metadata: {
      appointmentId: appointment.id,
      patientId: patient.id
    }
  });
};
```

### Quality Monitoring

```typescript
// Monitor and publish quality metrics every 30 seconds
setInterval(async () => {
  const stats = await videoConnection.getStats();
  
  await videoEventService.publishQualityMetrics({
    streamId: callSession.streamId,
    roomId: callSession.roomId,
    userId: currentUser.id,
    quality: determineQuality(stats),
    bitrate: stats.videoBitrate,
    framerate: stats.framerate,
    resolution: `${stats.width}x${stats.height}`,
    latency: stats.roundTripTime,
    packetLoss: stats.packetLoss,
    jitter: stats.jitter,
    networkType: connection.type
  });
}, 30000);
```

## PM2 Management

### View Status
```bash
pm2 list
```

### View Logs
```bash
# All logs
pm2 logs

# Kafka logs only
pm2 logs kafka

# Zookeeper logs only
pm2 logs zookeeper

# Backend logs
pm2 logs mediczy-server
```

### Restart Services
```bash
# Restart all
pm2 restart all

# Restart Kafka only
pm2 restart kafka

# Restart Zookeeper only
pm2 restart zookeeper
```

### Stop Services
```bash
# Stop Kafka
pm2 stop kafka

# Stop Zookeeper
pm2 stop zookeeper
```

## Kafka Command Line Tools

### List Topics
```bash
/home/ubuntu/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092
```

### Describe Topic
```bash
/home/ubuntu/kafka/bin/kafka-topics.sh --describe --topic video-stream-started --bootstrap-server localhost:9092
```

### Consume Messages
```bash
# From beginning
/home/ubuntu/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic video-stream-started \
  --from-beginning

# Latest messages only
/home/ubuntu/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic video-stream-quality
```

### Create Custom Topic
```bash
/home/ubuntu/kafka/bin/kafka-topics.sh \
  --create \
  --topic custom-video-events \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

## Testing

A comprehensive test script is available:

```bash
/home/ubuntu/test-video-streaming-events.sh
```

This script tests all 8 event types and verifies Kafka integration.

## Monitoring & Analytics

Events published to Kafka can be consumed by:

1. **Real-time Dashboards** - Monitor active calls, quality metrics
2. **Analytics Pipeline** - Process events for insights
3. **Alerting Systems** - Trigger alerts on errors or quality issues
4. **Data Warehouse** - Store events for historical analysis
5. **ML Models** - Predict call quality or detect anomalies

## Error Handling

All event publishing is non-blocking. If Kafka is unavailable:
- Events are logged as warnings
- Application continues normally
- No impact on video streaming functionality

## Environment Variables

```env
# Kafka is enabled by default
# To disable: DISABLE_KAFKA=true

KAFKA_CLIENT_ID=mediczy-server
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=mediczy-consumer-group
```

## File Locations

- **Kafka Installation**: `/home/ubuntu/kafka`
- **Kafka Data**: `/home/ubuntu/kafka-data/kafka-logs`
- **Zookeeper Data**: `/home/ubuntu/kafka-data/zookeeper`
- **PM2 Config**: `/home/ubuntu/kafka-ecosystem.config.js`
- **Test Script**: `/home/ubuntu/test-video-streaming-events.sh`
- **Event Service**: `/home/ubuntu/Mediczy/server/services/videoStreamingEvents.js`
- **API Routes**: `/home/ubuntu/Mediczy/server/routes/video-events.route.js`

## Performance

- **Kafka Memory**: 1-2GB allocated
- **Zookeeper Memory**: ~100MB
- **Topic Retention**: Default 7 days (configurable)
- **Partitions**: 1 per topic (increase for higher throughput)

## Best Practices

1. **Batch Quality Metrics**: Send every 30-60 seconds, not continuously
2. **Include Metadata**: Use metadata field for context-specific data
3. **Error Recovery**: Publish error events with recovered=true/false
4. **Unique IDs**: Use UUIDs or timestamp-based IDs for streamId/recordingId
5. **Structured Logging**: All events are logged to PM2 logs for debugging

## Troubleshooting

### Kafka Won't Start
```bash
# Check Java installation
java -version

# Check if port 9092 is available
netstat -tlnp | grep 9092

# View Kafka logs
tail -f /home/ubuntu/kafka-data/kafka-error.log
```

### Connection Issues
```bash
# Test Kafka connectivity
/home/ubuntu/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Restart Kafka
pm2 restart kafka zookeeper
```

### Events Not Publishing
```bash
# Check backend logs
pm2 logs mediczy-server | grep Kafka

# Verify Kafka producer is connected
curl http://localhost:8000/health
```

## Production Considerations

For production deployment:

1. **Multiple Brokers**: Set up Kafka cluster with 3+ brokers
2. **Replication**: Configure topic replication factor ≥ 2
3. **Monitoring**: Use Prometheus + Grafana for Kafka metrics
4. **Retention**: Adjust retention based on storage capacity
5. **Security**: Enable SSL/TLS and SASL authentication
6. **Backups**: Regular snapshots of Zookeeper data

## Support

For issues or questions:
- Check PM2 logs: `pm2 logs`
- Review backend logs: `pm2 logs mediczy-server`
- Test with provided script: `/home/ubuntu/test-video-streaming-events.sh`

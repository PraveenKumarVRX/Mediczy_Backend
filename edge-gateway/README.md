# Mediczy medical-device edge gateway

This is the deployable transport boundary for an approved medical-device adapter.
It signs canonical `device-event/v1` envelopes and publishes them QoS 1 to the
dedicated Mosquitto broker. It intentionally contains **no generic serial, USB,
or vendor protocol implementation**: each OEM/model adapter needs its own
protocol licence, simulator fixtures, hardware-in-loop evidence, and clinical
engineering approval.

Required configuration: `EDGE_GATEWAY_ID`, `MEDICAL_DEVICE_MQTT_URL`, and an
Ed25519 PEM private key in `EDGE_GATEWAY_PRIVATE_KEY`. Provide the paired public
key when enrolling the gateway through `/api/medical-device-gateway/edge-gateways`.

The current runtime accepts newline-delimited canonical events on stdin solely
as an adapter-host seam and test harness. It must run with a protected spool
volume. Production deployments must encrypt that volume, use mutual TLS at
Mosquitto, and run it under a restricted service account.

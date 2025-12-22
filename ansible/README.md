# Mediczy Infrastructure Ansible Suite

This playbook suite provisions the full "Postgres + Citus + PGVector + JSONB" helper combo along with Redis caching and Kafka streaming. It follows a coordinator/worker topology and keeps every extension configurable through group variables.

```
ansible/
├── ansible.cfg
├── inventories/
│   ├── production/
│   │   ├── hosts.yml
│   │   ├── group_vars/
│   │   │   ├── all.yml
│   │   │   ├── pg_coordinators.yml
│   │   │   ├── pg_workers.yml
│   │   │   ├── redis.yml
│   │   │   └── kafka.yml
│   │   └── host_vars/
│   │       ├── pg-coord-1.yml
│   │       └── pg-worker-1.yml
│   └── staging/...
├── playbooks/
│   ├── site.yml
│   ├── postgres.yml
│   ├── extensions.yml
│   └── redis_kafka.yml
└── roles/
    ├── common
    ├── postgres
    ├── citus
    ├── pgvector
    ├── timescale
    ├── columnar
    ├── redis
    └── kafka
```

## Usage

1. Adjust `inventories/<env>/hosts.yml` and group vars for your IPs, disks, and credentials.
2. Run `ansible-playbook -i inventories/production/hosts.yml playbooks/site.yml` for a full rollout.
3. Use tags to deploy specific layers:
   - `ansible-playbook playbooks/extensions.yml -t pgvector`
   - `ansible-playbook playbooks/redis_kafka.yml -l redis`.

## Playbooks at a Glance

| Playbook | Purpose | Example |
| --- | --- | --- |
| `playbooks/site.yml` | Complete run across common, database, and streaming tiers. | `ansible-playbook -i inventories/staging/hosts.yml playbooks/site.yml` |
| `playbooks/postgres.yml` | Only the PostgreSQL + Citus stack (coordinators/workers). | `ansible-playbook playbooks/postgres.yml -t workers` |
| `playbooks/extensions.yml` | Timescale, columnar, and PGVector overlays. | `ansible-playbook playbooks/extensions.yml -t extensions` |
| `playbooks/redis_kafka.yml` | Redis cache + Kafka brokers. | `ansible-playbook playbooks/redis_kafka.yml -l kafka` |

Each role is idempotent and exposes sane defaults for:
- PostgreSQL 16 with `shared_preload_libraries = citus,columnar,timescaledb`.
- Citus worker registration and shard replication.
- PGVector schema bootstrap (dimension, distance metric).
- Timescale hypertable conversions for metrics databases.
- Columnar extension enablement for helper replicas / embeddings.
- Redis 7.x tuned for caching embeddings metadata.
- Kafka 3.x for streaming `embedding-events` and helper replication signals.

See the inline comments inside group vars and role defaults for additional knobs (storage paths, replication slots, TLS toggles, etc.).

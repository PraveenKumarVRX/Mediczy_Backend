# Patches for `ai-engine/` (untracked service code)

`ai-engine/` is excluded by `.gitignore:49`, so the Python AI service —
`doctor_bot/app.py`, the RAG retriever, the medical pipeline — is **not under
version control anywhere**. There is no nested git repo and no separate remote.
A change to that service exists only on the box it was made on, and a rebuild
or disk loss takes it with no history and no review trail.

Until that is fixed, any change made to `ai-engine/` is also saved here as a
patch so it is at least recoverable and reviewable.

Apply one with:

```bash
cd /home/ubuntu/Mediczy
patch -p1 --dry-run < docs/ai/patches/<file>.patch   # check first
patch -p1 < docs/ai/patches/<file>.patch
pm2 restart sib-fastapi
```

## The real fix

Put `ai-engine/` under source control. It almost certainly got ignored because
of `doctor_bot/venv/` and the downloaded model weights, which genuinely should
not be committed — the fix is to ignore those paths specifically rather than
the whole service:

```gitignore
ai-engine/**/venv/
ai-engine/**/__pycache__/
ai-engine/**/*.pt
ai-engine/**/*.bin
```

## Index

| Patch | What it fixes |
|---|---|
| `2026-11-09-sib-pubmedbert-singleton.patch` | `_embed_pubmed()` built a fresh ~400 MB SentenceTransformer per request; RSS grew ~350 MB per question and PM2 killed the service at its 2 GB ceiling after three. Loads the encoder once per process. Verified: 20-question soak flat at ~1634 MB. |

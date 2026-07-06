FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py orthanc_client.py ./
COPY inference ./inference
COPY models ./models
COPY scripts ./scripts

ENV MODEL_WEIGHTS_DIR=/app/models
ENV PYTHONUNBUFFERED=1

EXPOSE 8010
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]

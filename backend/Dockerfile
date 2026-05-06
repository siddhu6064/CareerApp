# ──────────────────────────────────────────────────────────────────────
# AppName backend — production image
# Hosts on Render. Multi-stage to keep final image lean (~280 MB vs ~600 MB).
# ──────────────────────────────────────────────────────────────────────

# ── Stage 1: build wheels ────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

# Build deps for any wheel that compiles from source (pydantic-core, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt


# ── Stage 2: runtime ─────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    APPNAME_MODE=saas \
    PORT=8000

# WeasyPrint native deps:
#   pango/cairo/harfbuzz/gdk-pixbuf — text shaping, vector rendering
#   shared-mime-info, fonts-liberation — MIME + a sane fallback font set
#   libffi — used by some wheels
#   tini — clean signal handling for PID 1
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 \
      libpangoft2-1.0-0 \
      libharfbuzz0b \
      libgdk-pixbuf-2.0-0 \
      libcairo2 \
      libffi8 \
      shared-mime-info \
      fonts-liberation \
      fonts-dejavu-core \
      tini \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — security baseline
RUN useradd --create-home --shell /bin/bash appname
WORKDIR /app

# Install Python deps from prebuilt wheels (no compiler in runtime stage)
COPY --from=builder /wheels /wheels
COPY backend/requirements.txt .
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

# Copy source last for best layer caching
COPY backend/ ./backend/
RUN chown -R appname:appname /app

USER appname

EXPOSE 8000

# Healthcheck — Render uses its own, but this works for Docker Compose / k8s too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

# tini → uvicorn. 1 worker on Render Starter ($7/mo, 512 MB); bump --workers
# via APPNAME_WORKERS env var on a larger plan.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --workers ${APPNAME_WORKERS:-1} --proxy-headers --forwarded-allow-ips='*'"]

FROM ghcr.io/astral-sh/uv:bookworm-slim

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy only the configuration files first to optimize layer caching
COPY pyproject.toml uv.lock /app/

# Install the dependencies without the project itself
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the application code
COPY . /app

# Final sync to include the project code
RUN uv sync --frozen --no-dev

# Set the host to 0.0.0.0 to allow external connections
ENV HOST=0.0.0.0
ENV PORT=8082

EXPOSE 8082

CMD ["uv", "run", "start_proxy.py"]

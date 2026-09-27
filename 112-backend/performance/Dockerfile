FROM python:3.13-slim
WORKDIR /work
COPY performance/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["locust"]

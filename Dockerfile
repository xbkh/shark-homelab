FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY config.json ./config.json
ENV PYTHONUNBUFFERED=1
EXPOSE 7070
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7070"]

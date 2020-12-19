# Budget control system

## About this project

## Quickstart

### Start app

You can start the app on a specific port with the env var `PORT`
```bash
PORT=8080 npm run start
```

## System design

## API endpoints

### POST /start-tracing

Start your big data job by E.g.
```bash
curl -X POST http://localhost:8080/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "https://xxxxxxxx.execute-api.eu-central-1.amazonaws.com/dev/start-job"}'
```

#!/bin/bash
CURRENT_WORKING_DIR=$(pwd)

echo "Starting redis server and budget control app"

redis-server /home/ubuntu/redis-stable/redis.conf &
npm run start --prefix "$CURRENT_WORKING_DIR/budget_control_system-trace_backend"

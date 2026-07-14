#!/usr/bin/env bash
kill $(lsof -ti tcp:3000) 2>/dev/null || true
npm start
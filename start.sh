#!/bin/sh
set -e

npx drizzle-kit migrate
exec node build/index.js

FROM mcr.microsoft.com/playwright:v1.31.0-focal

WORKDIR /app
COPY package.json /app/
COPY pnpm-lock.yaml /app/
COPY src/ /app/src/
COPY tsconfig.json /app/
RUN apt-get update && apt-get -y install libnss3 libatk-bridge2.0-0 libdrm-dev libxkbcommon-dev libgbm-dev libasound-dev libatspi2.0-0 libxshmfence-dev
RUN npm install -g pnpm
RUN pnpm install
RUN npx playwright install chromium

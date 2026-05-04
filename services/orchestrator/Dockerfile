FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/orchestrator/package.json services/orchestrator/

RUN npm ci --workspace=packages/shared --workspace=services/orchestrator && npm install -D typescript

COPY packages/shared/ packages/shared/
COPY services/orchestrator/ services/orchestrator/
COPY tsconfig.json ./

RUN ./node_modules/.bin/tsc -b services/orchestrator/tsconfig.json

CMD ["node", "services/orchestrator/dist/index.js"]

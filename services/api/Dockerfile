FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/

RUN npm ci --workspace=packages/shared --workspace=services/api

COPY packages/shared/ packages/shared/
COPY services/api/ services/api/
COPY tsconfig.json ./

RUN npx tsc -b services/api/tsconfig.json

EXPOSE 3000

CMD ["node", "services/api/dist/app.js"]

FROM node:20.19-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit-dev

COPY . .

RUN npm run build

ENTRYPOINT ["npx", "."]
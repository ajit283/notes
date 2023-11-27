FROM oven/bun

WORKDIR /app

COPY package.json .
COPY bun.lockb .

RUN bun install

COPY src src
COPY tsconfig.json .
COPY tailwind.config.js .
COPY public public

ENV NODE_ENV production
CMD ["bun", "src/index.tsx"]

EXPOSE 3000
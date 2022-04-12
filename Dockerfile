FROM mcr.microsoft.com/playwright:focal

ENV NODE_ENV production
ENV NODE_EXTRA_CA_CERTS /etc/ssl/certs/ca-certificates.crt

RUN npx playwright install chromium chrome msedge firefox webkit && \
    npx playwright install-deps chromium chrome msedge firefox webkit

RUN npm install -g npm@8.6.0
    
WORKDIR /usr/src/app

ADD ./package*.json ./
RUN npm ci --only=production --no-optional --no-audit --no-fund 

ADD ./app.js ./
ADD ./lib ./lib

HEALTHCHECK NONE

USER pwuser

CMD ["node", "app.js"]

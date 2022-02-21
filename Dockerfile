FROM mcr.microsoft.com/playwright:focal

ENV NODE_ENV production
ENV NODE_EXTRA_CA_CERTS /etc/ssl/certs/ca-certificates.crt

RUN update-ca-certificates && \
    npm install -g npm@8.4.1
    
WORKDIR /usr/src/app

ADD ./package*.json ./
RUN npm ci --only=production --no-optional --no-audit --no-fund 

ADD ./app.js ./

HEALTHCHECK NONE

CMD node app.js

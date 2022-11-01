FROM mcr.microsoft.com/playwright:v1.27.0-focal

ENV NODE_ENV production
ENV NODE_EXTRA_CA_CERTS /etc/ssl/certs/ca-certificates.crt

RUN npm install -g npm@8.19.2
    
WORKDIR /usr/src/app

ADD ./package*.json ./
RUN npm ci --only=production --no-optional --no-audit --no-fund 

ARG TARGETPLATFORM
ADD ./install.sh ./
RUN chmod 500 install.sh && ./install.sh

ADD ./app.js ./
ADD ./lib ./lib

HEALTHCHECK NONE

RUN mkdir ./screens && \
    chmod 777 ./screens

USER pwuser

CMD ["node", "app.js"]

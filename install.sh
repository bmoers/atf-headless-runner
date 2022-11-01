#!/bin/sh

if [ "$TARGETPLATFORM" = "linux/amd64" ]
then 
    echo "building for amd64 ($TARGETPLATFORM)"
    # all channels supported for amd64
    npx playwright install chromium chrome msedge firefox webkit 
    npx playwright install-deps chromium chrome msedge firefox webkit 
else 
    echo "building for NON amd64 ($TARGETPLATFORM)" 

    # only default browsers (chromium, firefox, webkit) supported for non-amd64
    npx playwright install 
    npx playwright install-deps
fi

# Alternative Headless Browser for ServiceNow ATF

Reliable drop-in replacement for the [ServiceNow ATF Headless Runner](https://github.com/ServiceNow/atf-headless-runner) with more detailed logging, based on [playwright.dev](https://github.com/microsoft/playwright) from Microsoft.  

Supported Browsers:

- Chrome / Edge (Chromium)
- Firefox
- Safari (Webkit)

To enable, set following sys_property:

- sn_atf.headless.docker_image_name  = `ghcr.io/bmoers/sn/atf-headless-runner:latest`

Works as-is or in combination with [Docker Socket Proxy for ServiceNow ATF Headless Browser Integration](https://github.com/bmoers/sn-docker-socket-proxy) to run the ATF Headless Runner in Azure.  

Screenshots of all the steps to navigate to the ATF runner page are taken and saved in /usr/src/app/screens.

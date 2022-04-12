const playWright = require('playwright');
const fs = require('fs-extra');
const { setInterval: setIntervalPromise } = require('timers/promises');
const axios = require('axios');

const log = require('./lib/logger').topic(module);

const stats = {
    runnerInstanceCount: 0,
    atfRunnerPageCount: 0,
    crashCount: 0,
    loginCount: 0,
    impersonationHangsCount: 0
};

const logStats = (code, name) => {
    if (stats.logged)
        return;
    log.info('-'.repeat(45));
    log.info(' Total number of Test Runner Instances : # %d', stats.runnerInstanceCount);
    log.info(' Total number of Logins                : # %d', stats.loginCount);
    log.info(' Total number of ATF Runners           : # %d', stats.atfRunnerPageCount);
    log.info(' Total number of Impersonation Issues  : # %d', stats.impersonationHangsCount);
    log.info(' Total number of ATF Runner Crash      : # %d', stats.crashCount);
    if (code || name) {
        log.info(' Exit code: %s (%s)', code, name);
    }
    log.info('-'.repeat(45));
    stats.logged = true;
};

const events = ['exit', 'SIGINT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2', 'uncaughtException'];
events.forEach((eventName) => process.on(eventName, logStats.bind(null, eventName)));

if (process.env.DEVELOP && !process.env.AGENT_ID) {
    const crypto = require('crypto');
    process.env.AGENT_ID = crypto.randomBytes(16).toString('hex');
    log.info('DEVELOP MODE : using random AGENT_ID %s', process.env.AGENT_ID);
}

const mandatoryVars = {
    'AGENT_ID': 'The agent ID should be auto-generated from the instance',
    'BROWSER': 'There was no browser type identified in the request',
    'INSTANCE_URL': 'The instance URL was not configured (add or set property: glide.servlet.uri)',
    'SN_USERNAME': 'There was no user specified (add or set property: sn_atf.headless.username)',
    'TIMEOUT_MINS': 'There was no timeout specified in the request (add or set property: sn_atf.headless.timeout_mins)',
    'SECRET_PATH': 'There was no secret file path specified (add or set property: sn_atf.headless.secret_path)',
    'LOGIN_PAGE': 'There was no login page specified in the request (add or set property: sn_atf.headless.login_page)',
    'RUNNER_URL': 'There was no atf client test runner page specified in the request (add or set property: sn_atf.headless.runner_url)',
    'BROWSER_OPTIONS': 'There were no browser options specified in the request (add or set property: sn_atf.headless.browser_options)',
    'LOGIN_BUTTON_ID': 'There was no login button element specified in the request (add or set property: sn_atf.headless.login_button_id)',
    'USER_FIELD_ID': 'There was no username element specified in the request (add or set property: sn_atf.headless.user_field_id)',
    'PASSWORD_FIELD_ID': 'There was no password element specified in the request (add or set property: sn_atf.headless.password_field_id)',
    'HEADLESS_VALIDATION_PAGE': 'There was no validation page specified in the request (add or set property: sn_atf.headless.validation_page)',
    'VP_VALIDATION_ID': 'There was no validation element id specified in the request (add or set property: sn_atf.headless.validation_id)',
    'VP_HAS_ROLE_ID': 'There was no role element id specified in the request (add or set property: sn_atf.headless.vp_has_role_id)',
    'VP_SUCCESS_ID': 'There was no success element id specified in the request (add or set property: sn_atf.headless.vp_success_id)',
    'TEST_RUNNER_BANNER_ID': 'There was no banner element id page specified in the request (add or set property: sn_atf.headless.runner_banner_id)'
};

const validateVariables = async () => {
    const missing = Object.entries(mandatoryVars).reduce((out, [name, description]) => {
        if (process.env[name] == undefined)
            out.push([name, description]);
        return out;
    }, []);


    if (missing.length) {
        log.error('Following variables are missing');

        missing.forEach(([name, description]) => log.error(`\t${name}: ${description}`));
        // eslint-disable-next-line no-process-exit
        process.exit(1);
    }

    log.info('Variables:');
    Object.keys(mandatoryVars).forEach((name) => log.info(`\t${name.padEnd(30)} : ${process.env[name]}`));
    log.info('--');
};

const getLocator = async (page, selector, timeout = 10000) => {
    try {
        const locator = await page.locator(selector);
        await locator.waitFor({ timeout, state: 'attached' });
        return locator;
    } catch (e) {
        throw Error(`Selector '${selector}' not found on page`);
    }
};

const hasLocator = async (page, selector, timeout) => {
    try {
        await getLocator(page, selector, timeout);
        return true;
    } catch (e) {
        return false;
    }
};

const getText = async (page, selector) => {
    try {
        let locator = await getLocator(page, selector);
        const num = locator.count();
        if (num > 1)
            locator = locator.first();

        return locator.innerText();
    } catch (e) {
        log.error(e.message);
        log.info(await page.content());
        await page.screenshot({ path: 'screens/error.png' });
        throw Error(`Text of '${selector}' not found on page`);
    }
};

const getPassword = async () => {
    if (!await fs.pathExists(process.env.SECRET_PATH)) {
        throw Error(`'${process.env.SECRET_PATH}' not found`);
    }
    const text = await fs.readFile(process.env.SECRET_PATH, 'utf8');
    return text.replace(/(\r\n|\n|\r)/gm, '').trim();
};

const isAgentOnline = async () => {
    const password = await getPassword();
    const response = await axios.get(`${process.env.INSTANCE_URL}/${process.env.HEARTBEAT_URI}?id=${process.env.AGENT_ID}`, {
        auth: {
            username: process.env.SN_USERNAME,
            password: password
        }
    });

    if (response.status != 200)
        return false;

    return (response.data?.result?.online == 'true');
};

const getBrowser = async () => {
    const browserNames = {
        'headlesschromium': 'chromium',
        'headlesschrome': 'chromium',
        'headlessfirefox': 'firefox',
        'headlesssafari': 'webkit',
        'headlessedge': 'chromium',

        'chrome': 'chromium',
        'chromium': 'chromium',
        'firefox': 'firefox',
        'safari': 'webkit',
        'edge': 'chromium'
    };

    const defaultBrowser = 'chromium';

    const browserName = browserNames[process.env.BROWSER] || defaultBrowser;
    //{ chromium, webkit, firefox, edge }


    const options = {
        headless: process.env.HEADLESS !== 'false',
        devtools: false
    };

    if (browserName == 'chromium') {
        options.args = ['--disable-dev-shm-usage'];
    }

    if (process.env.BROWSER.endsWith('edge')) {
        options.channel = 'msedge';
    } else if (process.env.BROWSER.endsWith('chrome')) {
        options.channel = 'chrome';
    } else if (process.env.BROWSER.endsWith('chromium')) {
        options.channel = 'chromium';
    }

    log.info('Open Browser');
    if (options.channel) {
        log.info(`\t${browserName.toUpperCase()} on channel '${options.channel.toUpperCase()}'`);
    } else {
        log.info(`\t${browserName.toUpperCase()}`);
    }
    log.info('--');

    return playWright[browserName].launch(options);
};

const closeBrowser = async (context) => {

    log.info('Closing all %s pages', context.pages().length);
    await Promise.all(context.pages().map((page) => page.close()));

    const browser = context.browser();
    log.info('Closing context');
    await context.close();

    log.info('Closing browser');
    await browser.close();

    logStats();

};

const openNewPage = async (context) => {

    const page = await context.newPage();
    page.on('pageerror', exception => {
        log.info(`\tBrowser - Error on Page: Uncaught exception: "${exception}"`);
    });

    log.info('New page opened. Current number of open pages: %s', context.pages().length);

    return page;
};

const openRunnerPage = async (context) => {

    stats.atfRunnerPageCount++;

    if (context.pages().length >= 2) {
        log.info('Reusing runner page');
        return context.pages()[1];

    }

    // create a new page
    const runner = await openNewPage(context);

    // to check if the event handler is already set
    runner._hasEvent = function (eventName) {
        return this?.__events?.[eventName];
    };

    // singleton to set the event handler only once
    runner._setEvent = function (eventName, eventHandler) {
        if (this._hasEvent(eventName)) {
            return;
        }
        this.__events = this.__events || {};
        this.on(eventName, eventHandler.bind(null));
        this.__events[eventName] = true;
    };

    const runnerPage = `${process.env.INSTANCE_URL}/${process.env.RUNNER_URL}&sys_atf_agent=${process.env.AGENT_ID}`;
    log.info(`Goto runner page: ${runnerPage}`);
    await runner.goto(runnerPage);

    log.info(`\tCheck for banner ID on page: ${process.env.TEST_RUNNER_BANNER_ID}`);
    const banner = await hasLocator(runner, `#${process.env.TEST_RUNNER_BANNER_ID}`);
    if (!banner) {
        await runner.screenshot({ path: 'screens/runner-error.png' });
        throw Error('The client test runner page could not load, Property sn_atf.schedule.enabled and sn_atf.runner.enabled must be true. Make sure the ATF Runner is online before we move on');
    }
    log.info('--');

    await runner.screenshot({ path: 'screens/runner-done.png' });

    const ignore = ['.jsdbx', `${process.env.INSTANCE_URL}/styles/`, `${process.env.INSTANCE_URL}/api/now/ui/`, `${process.env.INSTANCE_URL}/scripts/`, `${process.env.INSTANCE_URL}/amb/`, `${process.env.INSTANCE_URL}/xmlhttp.do`, `${process.env.INSTANCE_URL}/images/`];
    runner._setEvent('request', async (request) => {
        const url = request.url();
        if (!ignore.some((str) => url.includes(str))) {
            log.info('runner-request : %s', url);
        }
    });

    runner._setEvent('console', async (msg) => {
        if (msg.type() == 'error') {
            log.warn('console-error  : %s on %s', msg.text(), msg.location().url);
        }
    });

    return runner;
};

const login = async (context) => {

    stats.loginCount++;

    const page = await (async () => {
        if (context.pages().length) {
            // login on the same page (don't to a context.clearCookies() as it might interfere with the atf runner page)
            return context.pages()[0];
        } else {
            return openNewPage(context);
        }
    })();

    const loginPage = `${process.env.INSTANCE_URL}/${process.env.LOGIN_PAGE}`;
    log.info(`Goto Login Page: ${loginPage}`);
    await page.goto(loginPage, { waitUntil: 'networkidle' });
    log.info('Login page is open');
    log.info('--');

    await page.screenshot({ path: 'screens/login-page-open.png' });


    log.info('Fill login form');
    log.info('\tEnter username');
    await page.type(`#${process.env.USER_FIELD_ID}`, process.env.SN_USERNAME, { delay: 10 });
    const password = await getPassword();
    log.info('\tEnter password');
    await page.type(`#${process.env.PASSWORD_FIELD_ID}`, password, { delay: 10 });
    log.info('--');
    await page.screenshot({ path: `screens/${process.env.LOGIN_PAGE}-filled.png` });


    log.info('Submit login form');
    await Promise.all([
        page.waitForNavigation(),
        page.click(`#${process.env.LOGIN_BUTTON_ID}`)
    ]);
    log.info('--');

    await page.screenshot({ path: `screens/${process.env.LOGIN_PAGE}-done.png` });

    if (await hasLocator(page, '.dp-invalid-login-msg', 1000)) {
        throw Error('ATF User credentials invalid!');
    }

    const validationPage = `${process.env.INSTANCE_URL}/${process.env.HEADLESS_VALIDATION_PAGE}`;
    log.info(`Goto access validation page: ${validationPage}`);
    await page.goto(validationPage, { waitUntil: 'load' });

    const validation = await getText(page, `#${process.env.VP_VALIDATION_ID}`);
    if ('Headless Validation' != validation)
        throw Error(`Validation Tag '${process.env.VP_VALIDATION_ID}' text incorrect: ${validation}`);
    log.info(`\t${process.env.VP_VALIDATION_ID.padEnd(22)} : ${validation}`);

    const role = await getText(page, `#${process.env.VP_HAS_ROLE_ID}`);
    if ('Has Valid Role' != role)
        throw Error(`Role Tag '${process.env.VP_HAS_ROLE_ID}' text incorrect: ${role}`);
    log.info(`\t${process.env.VP_HAS_ROLE_ID.padEnd(22)} : ${role}`);

    const success = await getText(page, `#${process.env.VP_SUCCESS_ID}`);
    if ('Success' != success)
        throw Error(`Success Tag '${process.env.VP_SUCCESS_ID}' text incorrect: ${success}`);
    log.info(`\t${process.env.VP_SUCCESS_ID.padEnd(22)} : ${success}`);
    log.info('--');

    await page.screenshot({ path: `screens/${process.env.HEADLESS_VALIDATION_PAGE}-done.png` });
};


const isImpersonationIssue = async (context) => {

    const impersonatedUser = await openNewPage(context);
    await impersonatedUser.goto(`${process.env.INSTANCE_URL}/sys_user.do?sys_id=javascript:gs.getUserID()&XML`);
    await impersonatedUser.screenshot({ path: 'screens/impersonated-user-info-xml.png' });
    const userXML = await impersonatedUser.content();
    await impersonatedUser.close();

    const user = {};
    let m = userXML.match(/<sys_id>(.*)<\/sys_id>/);
    if (m) {
        user.sysId = m[1];
    }
    m = userXML.match(/<user_name>(.*)<\/user_name>/);
    if (m) {
        user.userName = m[1];
    }

    const impersonationHangs = (user.userName && process.env.SN_USERNAME != user.userName);

    if (!user.userName) {
        log.warn('Impersonation user information not found on page: %s', userXML);
    } else if (impersonationHangs) {
        stats.impersonationHangsCount++;
        log.warn('Impersonation hangs in user: \'%s\' (%s)', user.userName, user.sysId);
    } else {
        log.info('Not impersonated - user: \'%s\' (%s)', user.userName, user.sysId);
    }

    return impersonationHangs;
};

const openTestRunner = async (browser) => {

    stats.runnerInstanceCount++;

    // create the current context
    const context = await (async () => {
        if (browser.contexts().length) {
            return browser.contexts()[0];
        } else {
            const context = await browser.newContext({ ignoreHTTPSErrors: true });
            context.setDefaultTimeout(60000);
            return context;
        }
    })();

    const heartBeatMins = 1;
    const heartBeatEnabled = ((process.env.HEARTBEAT_ENABLED || 'true') == 'true');
    const timeOutMins = parseInt(process.env.TIMEOUT_MINS, 10);
    let idleTimer = Date.now();
    const idleTimeoutMins = parseInt(process.env.IDLE_TIMEOUT_MINS || 0, 10);

    if (!heartBeatEnabled) {
        log.warn('Heartbeat is disabled! This can cause the browser to hang (e.g. on failed un-impersonate). Make sure you set the sys_property "sn_atf.headless.heartbeat_enabled" to "true"!');
    }

    log.info(`Setting browser timeout to ${timeOutMins} mins`);

    if (idleTimeoutMins) {
        log.info('Test runner will be stopped if idle for more than %d minutes. ', idleTimeoutMins);
    }
    log.info('--');

    // login to the instance
    await login(context);

    const ac = new AbortController();
    const signal = ac.signal;

    signal.onabort = async () => {
        log.info('Aborting heartbeat iterator.');
    };

    // open new runner page (tab)
    const runner = await openRunnerPage(context);

    // restart the browser if it crashes
    runner._setEvent('crash', async (page) => {
        stats.crashCount++;

        log.error('PAGE CRASH: %s', page.url());
        // abort the checkInterval()
        ac.abort();
        log.warn('Restarting browser.');
        return openTestRunner(context.browser());
    });

    if (idleTimeoutMins) {
        const ignore = [`${process.env.INSTANCE_URL}/api/now/ui/`, `${process.env.INSTANCE_URL}/amb/`, `${process.env.INSTANCE_URL}/xmlhttp.do`];
        // update the idleTimer if the browser is running tests (background requests are ignored)
        runner._setEvent('request', async (request) => {
            const url = request.url();
            if (!ignore.some((str) => url.includes(str))) {
                idleTimer = Date.now();
            }
        });
    }

    const checkInterval = async () => {

        log.info(`Check every ${heartBeatMins} mins for browser status.`);
        log.info('--');

        try {

            const iterator = setIntervalPromise(heartBeatMins * 60 * 1000, Date.now(), { signal });

            for await (const startTime of iterator) {

                const now = Date.now();

                // close the browser after TIMEOUT_MINS
                if ((now - startTime) > (timeOutMins * 60 * 1000)) {
                    log.info(`Browser timeout of ${timeOutMins} mins reached, closing browser now`);
                    await closeBrowser(context);
                    break;
                }

                // close the browser after it becomes idle
                if (idleTimeoutMins && (now - idleTimer) > (idleTimeoutMins * 60 * 1000)) {
                    log.info('Test runner was idle for more than %d minutes. ', idleTimeoutMins);
                    await closeBrowser(context);
                    break;
                }

                if (heartBeatEnabled) {
                    log.info(`Heartbeat enabled. Check agent '${process.env.AGENT_ID}' status`);
                    const online = await isAgentOnline();
                    if (!online) {
                        log.warn(`Agent '${process.env.AGENT_ID}' is flagged as offline in ServiceNow. Restarting the browser session now.`);

                        const impersonationIssue = await isImpersonationIssue(context);
                        if (impersonationIssue) {
                            log.warn('Impersonation Issue detected. Restarting browser session.');
                            return openTestRunner(context.browser());
                        } else {
                            log.warn('Agent is offline due unknown reason, exit.');
                            await closeBrowser(context);
                            break;
                        }

                    } else {
                        log.info(`Agent '${process.env.AGENT_ID}' is online`);
                    }
                }

            }

        } catch (err) {
            if (err.name === 'AbortError') {
                return log.info('Heartbeat iterator aborted');
            }
            return err;
        }

    };

    await checkInterval();

};

const run = async () => {

    const browser = await getBrowser();

    await openTestRunner(browser);

};

const main = async () => {

    log.info('-'.repeat(45));
    log.info(`ATF Test Runner ${require('./package.json').version}`);
    log.info('-'.repeat(45));

    await validateVariables();

    await run();
};

main();


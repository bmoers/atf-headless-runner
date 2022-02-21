//const { chromium } = require('playwright');
const playWright = require('playwright');
const fs = require('fs-extra');
const { setTimeout } = require("timers/promises");

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
}

const validateVariables = async () => {
    const missing = Object.entries(mandatoryVars).reduce((out, [name, description]) => {
        if (process.env[name] == undefined)
            out.push([name, description])
        return out;
    }, [])


    if (missing.length) {
        console.error('Following variables are missing')
        missing.forEach(([name, description]) => console.log(`\t${name}: ${description}`));
        process.exit(1);
    }

    console.log(`Variables:`);
    Object.keys(mandatoryVars).forEach((name) => console.log(`\t${name.padEnd(30)} : ${process.env[name]}`));
    console.log(`--`);
}


const getLocator = async (page, selector) => {
    try {
        const locator = await page.locator(selector);
        await locator.waitFor({ timeout: 200, state: 'attached' });
        return locator;
    } catch (e) {
        throw Error(`Selector '${selector}' not found on page`);
    }
}

const hasLocator = async (page, selector) => {
    try {
        await getLocator(page, selector);
        return true;
    } catch (e) {
        return false;
    }
}

const getText = async (page, selector) => {
    try {
        let locator = await getLocator(page, selector);
        const num = locator.count();
        if (num > 1)
            locator = locator.first();

        return locator.innerText();
    } catch (e) {
        console.error(e.message);
        console.log(await page.content());
        await page.screenshot({ path: `screens/error.png` });
        throw Error(`Text of '${selector}' not found on page`);
    }
}

const getPassword = async () => {
    if (!await fs.pathExists(process.env.SECRET_PATH)) {
        throw Error(`'${process.env.SECRET_PATH}' not found`)
    }
    const text = await fs.readFile(process.env.SECRET_PATH, 'utf8');
    return text.replace(/(\r\n|\n|\r)/gm, "").trim();
}

const getBrowser = async () => {
    const browserNames = {
        'headlesschrome': 'chromium',
        'headlessfirefox': 'firefox',
        'headlesssafari': 'webkit',
        'firefox': 'firefox',
        'chrome': 'chromium',
        'chromium': 'chromium',
        'safari': 'webkit'
    }
    const defaultBrowser = 'chromium';

    const browserName = browserNames[process.env.BROWSER] || defaultBrowser;
    //{ chromium, webkit, firefox }

    console.log(`Open Browser`);
    console.log(`\t${browserName}`);
    console.log(`--`);
    return playWright[browserName].launch();
}

const openTestRunner = async () => {

    const browser = await getBrowser();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    context.setDefaultTimeout(60000);

    const page = await context.newPage();
    page.on('pageerror', exception => {
        console.log(`\tBrowser - Error on Page: Uncaught exception: "${exception}"`);
    });

    const loginPage = `${process.env.INSTANCE_URL}/${process.env.LOGIN_PAGE}`;
    console.log(`Goto Login Page: ${loginPage}`);
    await page.goto(loginPage, { waitUntil: 'networkidle' });
    console.log('Login page is open')
    console.log(`--`);

    await page.screenshot({ path: `screens/login-page-open.png` });


    console.log('Fill login form')
    console.log('\tEnter username')
    await page.type(`#${process.env.USER_FIELD_ID}`, process.env.SN_USERNAME, { delay: 100 });
    const password = await getPassword();
    console.log('\tEnter password')
    await page.type(`#${process.env.PASSWORD_FIELD_ID}`, password, { delay: 100 });
    console.log(`--`);
    await page.screenshot({ path: `screens/${process.env.LOGIN_PAGE}-filled.png` });


    console.log('Submit login form')
    await Promise.all([
        page.waitForNavigation(),
        page.click(`#${process.env.LOGIN_BUTTON_ID}`)
    ])
    console.log(`--`);

    await page.screenshot({ path: `screens/${process.env.LOGIN_PAGE}-done.png` });

    const validationPage = `${process.env.INSTANCE_URL}/${process.env.HEADLESS_VALIDATION_PAGE}`;
    console.log(`Goto access validation page: ${validationPage}`);
    await page.goto(validationPage, { waitUntil: 'load' })

    const validation = await getText(page, `#${process.env.VP_VALIDATION_ID}`);
    if ('Headless Validation' != validation)
        throw Error(`Validation Tag '${process.env.VP_VALIDATION_ID}' text incorrect: ${validation}`)
    console.log(`\t${process.env.VP_VALIDATION_ID.padEnd(22)} : ${validation}`);

    const role = await getText(page, `#${process.env.VP_HAS_ROLE_ID}`);
    if ('Has Valid Role' != role)
        throw Error(`Role Tag '${process.env.VP_HAS_ROLE_ID}' text incorrect: ${role}`)
    console.log(`\t${process.env.VP_HAS_ROLE_ID.padEnd(22)} : ${role}`);

    const success = await getText(page, `#${process.env.VP_SUCCESS_ID}`);
    if ('Success' != success)
        throw Error(`Success Tag '${process.env.VP_SUCCESS_ID}' text incorrect: ${success}`)
    console.log(`\t${process.env.VP_SUCCESS_ID.padEnd(22)} : ${success}`);
    console.log(`--`);

    await page.screenshot({ path: `screens/${process.env.HEADLESS_VALIDATION_PAGE}-done.png` });

    const runnerPage = `${process.env.INSTANCE_URL}/${process.env.RUNNER_URL}&sys_atf_agent=${process.env.AGENT_ID}`;
    console.log(`Goto runner page: ${runnerPage}`);
    await page.goto(runnerPage)
    console.log(`\tCheck for banner ID on page: ${process.env.TEST_RUNNER_BANNER_ID}`);
    const banner = await hasLocator(page, `#${process.env.TEST_RUNNER_BANNER_ID}`);
    if (!banner) {
        await page.screenshot({ path: `screens/runner-error.png` });
        throw Error(`The client test runner page could not load, Property sn_atf.schedule.enabled and sn_atf.runner.enabled must be true. Make sure the ATF Runner is online before we move on`)
    }
    console.log(`--`);

    await page.screenshot({ path: `screens/runner-done.png` });

    const timeOutMins = parseInt(process.env.TIMEOUT_MINS, 10);
    console.log(`Setting browser timeout to ${timeOutMins} mins`);
    setTimeout(timeOutMins * 60 * 1000).then(async () => {
        console.log(`Browser timeout of ${timeOutMins} mins reached, closing browser now`)
        await browser.close();
    });

    const ignore = [`.jsdbx`, `${process.env.INSTANCE_URL}/styles/`, `${process.env.INSTANCE_URL}/api/now/ui/`, `${process.env.INSTANCE_URL}/scripts/`, `${process.env.INSTANCE_URL}/amb/`, `${process.env.INSTANCE_URL}/xmlhttp.do`, `${process.env.INSTANCE_URL}/images/`]
    console.log(`Runner page background requests:`);
    page.on('request', async (request) => {
        const url = request.url();
        if (!ignore.some((str) => url.includes(str))) {
            console.log(`\t${url}`);
        }
    })

}

const main = async () => {

    console.info('-'.repeat(40));
    console.info(`ATF Test Runner ${require('./package.json').version}`);
    console.info('-'.repeat(40));

    await validateVariables();

    await openTestRunner();

}
main();

const { By, until } = require('selenium-webdriver');
const path = require('path');
const fs = require('fs');

const AutoLoginBrowser = require('./browser.js');
const { sendToDiscord } = require('./utils.js');

const COOKIES_PATH = path.join(process.cwd(), 'database', 'cookies_ig.json');

let browser = null;
let isInitialized = false;

async function runInstagram() {
    browser = new AutoLoginBrowser();
    
    try {
        await browser.initialize();
        
        // Try to load saved cookies
        const cookiesLoaded = await browser.loadCookies(COOKIES_PATH);
        if (!cookiesLoaded) {
            await browser.navigateToSite();
        }
        
        // Check if login is required
        if (await browser.isLoginRequired()) {
            console.log('Login required');
            await browser.login();
        } else {
            console.log('Already logged in');
        }

        await browser.driver.sleep(2000); // wait for 2 seconds

        // check button that have include text "save info"
        const saveInfoButton = await browser.driver.findElements(By.xpath("//*[contains(text(), 'Save info')]"));
        if (saveInfoButton.length > 0) {
            console.log('Save Info button found, clicking it...');
            await saveInfoButton[0].click();
            console.log('Page loaded after clicking Save Info button');
        } else {
            console.log('Save Info button not found, skipping...');
        }

        // wait for element that have include text "Profile"
        await browser.waitForElement("//*[contains(text(), 'Profile')]", 30000, async (element) => {
            console.log('Profile button found');
        }, false);

        // wait for element that have include text "Messages"
        await browser.waitForElement("//*[contains(text(), 'Messages')]", 30000, async (element) => {
            console.log('Messages button found');
        }, false);

        // click "a" that have include text "Messages" and wait until url contains "direct/inbox"
        const messagesButton = await browser.driver.findElements(By.xpath("//*[contains(text(), 'Messages')]"));
        if (messagesButton.length > 0) {
            console.log('Messages button found, clicking it...');
            await messagesButton[0].click();
            await browser.driver.wait(until.urlContains('direct/inbox'), 30000);
            console.log('Page loaded after clicking Messages button');
        } else {
            console.log('Messages button not found, skipping...');
        }

        // wait for element that have include text "Messages"
        await browser.waitForElement("//*[contains(text(), 'Your messages')]", 30000, async (element) => {
            console.log('Your messages button found');
        }, false);

        await browser.driver.sleep(2000); // wait for 2 seconds

        // check if has a text contain "turn on notifications"
        const turnOnNotifications = await browser.driver.findElements(By.xpath("//*[contains(text(), 'Turn on Notifications')]"));
        if (turnOnNotifications.length > 0) {
            console.log('Turn on notifications found');
            const notNowButton = await browser.driver.findElements(By.xpath("//*[contains(text(), 'Not Now')]"));
            if (notNowButton.length > 0) {
                console.log('Not now button found, clicking it...');
                await notNowButton[0].click();
                console.log('Page loaded after clicking Not now button');
            } else {
                console.log('Not now button not found, skipping...');
            }
        } else {
            console.log('Turn on notifications not found, skipping...');
        }

        isInitialized = true;

        async function checkRequests() {
            await browser.waitForElementText("//*[contains(text(), 'Request')]", 'Requests', 30000, async (element) => {
                console.log('Requests text found');
                await element.click();
                await browser.driver.wait(until.urlContains('direct/requests'), 30000);
    
                let parentElement = await browser.driver.wait(until.elementLocated(By.xpath('//div[@aria-label="Message requests" and @role="list"]')), 30000);
                if(parentElement) {
                    console.log('Parent element found');
                    let getAllListElements = await parentElement.findElements(By.xpath('.//div[@role="button" and @tabindex]'));
                    console.log(`Found ${getAllListElements.length} list elements`);
                    
                    let allArrayScraped = [];
                    while (true) {
                        if(!getAllListElements[0]) {
                            console.log('No more elements to scrape, breaking...');
                            break;
                        }

                        parentElement = await browser.driver.wait(until.elementLocated(By.xpath('//div[@aria-label="Message requests" and @role="list"]')), 30000);
                        getAllListElements = await parentElement.findElements(By.xpath('.//div[@role="button" and @tabindex]'));

                        element = getAllListElements[0];
                        await element.click();
                        await browser.driver.wait(until.urlContains('direct/t/'), 30000);

                        // wait for element a[contains(@aria-label), "Open the profile page of"]
                        await browser.waitForElement("//*[contains(@aria-label, 'Open the profile page of')]", 30000, async (element) => {
                            console.log('Conversation loaded');
                        }, false);

                        // search profilePic the element is img[alt="User avatar"] and get src
                        const profilePic = await browser.driver.findElements(By.xpath("//*[contains(@alt, 'User avatar')]"));
                        let avatarURL = null;
                        if (profilePic.length > 0) {
                            avatarURL = await profilePic[0].getAttribute('src');
                            console.log('Profile picture found:', avatarURL);
                        } else {
                            console.log('Profile picture not found, skipping...');
                        }

                        // get username that include text "· Instagram"
                        const usernameElement = await browser.driver.findElements(By.xpath("//span[contains(text(), '· Instagram')]"));
                        let username = null;
                        if (usernameElement.length > 0) {
                            username = await usernameElement[0].getText();
                            if(username.includes('· Instagram')) {
                                username = username.replace('· Instagram', '').trim();
                            }
                            console.log('Username found:', username);
                        } else {
                            console.log('Username not found, skipping...');
                        }

                        // scroll to bottom of the page
                        await browser.driver.executeScript("window.scrollTo(0, document.body.scrollHeight);");
                        await browser.driver.sleep(2000); // wait for 2 seconds
                        console.log('Page scrolled to bottom');

                        // find all element div[data-release-focus-from="CLICK" and data-scope="messages_table"]
                        const divElement = await browser.driver.findElements(By.xpath("//*[contains(@aria-label, 'Double tap to like')]"));
                        if (divElement.length > 0) {
                            for(let i = 0; i < divElement.length; i++) {

                                // check is content has "Message unavailable" if yes, skip this element
                                const messageUnavailable = await divElement[i].getText();
                                if (messageUnavailable.includes('Message unavailable')) {
                                    console.log('Message unavailable found, skipping this element...');
                                    continue;
                                }

                                console.log('Div element found, clicking it...');
                                await divElement[i].click();
                                console.log('Page loaded after clicking div element');

                                // take screenshot
                                // const screenshot = await browser.driver.takeScreenshot();
                                // const screenshotPath = path.join(process.cwd(), 'screenshots', `screenshot_${Date.now()}.png`);
                                // fs.writeFileSync(screenshotPath, screenshot, 'base64');
                                // console.log('Screenshot saved:', screenshotPath);

                                // wait svg[aria-label="close"] then get current url and click it
                                await browser.waitForElement("//*[name()='svg' and @aria-label='Close']", 30000, async (element) => {
                                    const getUrlNowBrowserLoaded = await browser.driver.getCurrentUrl();
                                    allArrayScraped.push({ avatarURL, username, file: getUrlNowBrowserLoaded });
                                    console.log('URL loaded:', getUrlNowBrowserLoaded);

                                    console.log('Close button found, clicking it...');
                                    await element.click();
                                    console.log('Page loaded after clicking Close button');
                                }, false);
                                console.log('Page loaded after clicking div element');
                            }
                        } else {
                            console.log('Div element not found, skipping...');
                        }

                        // find element that have include text "Delete" with attribute role="button" and tabindex
                        const deleteButton = await browser.driver.findElements(By.xpath("//*[contains(text(), 'Delete') and @role='button' and @tabindex]"));
                        if (deleteButton.length > 0) {
                            console.log('Delete button found, clicking it...');
                            await deleteButton[0].click();
                            console.log('Page loaded after clicking Delete button');

                            // wait element that have include text "Permanently delete chat?" and find Last element that include text "Delete"
                            await browser.waitForElement("//*[contains(text(), 'Permanently delete chat?')]", 30000, async (element) => {
                                console.log('Permanently delete chat? text found');
                                // click "Delete" button that in the same parent element with "Permanently delete chat?"
                                const deleteButton = await element.findElements(By.xpath("../..//button[contains(text(), 'Delete')]"));
                                if (deleteButton.length > 0) {
                                    console.log('Delete button found in the same parent element, clicking it...');
                                    await deleteButton[0].click();
                                    console.log('Page loaded after clicking Delete button in the same parent element');
                                } else {
                                    console.log('Delete button not found in the same parent element, skipping...');
                                }
                            }, false);
                        } else {
                            console.log('Delete button not found, skipping...');
                        }

                        // wait for element that have include text "These messages are from people you've restricted or don't follow. They won't know you viewed their request until you allow them to message you."
                        await browser.waitForElement("//*[contains(text(), 'These messages are from people you')]", 30000, async (element) => {
                            console.log('These messages are from people you found');
                        }, false);

                        await browser.driver.sleep(2000); // wait for 2 seconds

                        parentElement = await browser.driver.wait(until.elementLocated(By.xpath('//div[@aria-label="Message requests" and @role="list"]')), 30000);
                        getAllListElements = await parentElement.findElements(By.xpath('.//div[@role="button" and @tabindex]'));
                        if(getAllListElements.length > 0 && (await getAllListElements[0].getText()) === 'Hidden Requests') {
                            getAllListElements = []
                        }
                        console.log(`Found ${getAllListElements.length} list elements`);
                    }


                    console.log('All scraped links:', allArrayScraped);
                    if(allArrayScraped.length > 0) {
                        console.log('Sending to Discord...');
                        await sendToDiscord(allArrayScraped);
                    } else {
                        console.log('No scraped links found, skipping...');
                    }
                    
                    allArrayScraped = [];
                }

                await browser.driver.sleep(1000 + Math.floor(Math.random() * 2000)); // Random sleep between 1-2 seconds
    
                // find element that have include text "Back"
                const backButton = await browser.driver.findElements(By.xpath("//*[contains(@aria-label, 'Back')]"));
                if (backButton.length > 0) {
                    console.log('Back button found, clicking it...');
                    await backButton[0].click();
                    console.log('Page loaded after clicking Back button');
    
                    // wait for element that have include text "Messages"
                    await browser.waitForElement("//*[contains(text(), 'Your messages')]", 30000, async (element) => {
                        console.log('Your messages button found');
                    }, false);
                } else {
                    console.log('Back button not found, skipping...');
                }
            }, false);

            checkRequests();
        }

        // checkRequests function to check for new requests
        checkRequests();
    } catch (error) {
        console.error('Error in automation script:', error);
    }
}

setInterval(() => {
    if (browser && isInitialized) {
        browser.saveCookies(COOKIES_PATH);
    }
}, 30000) // Save cookies every 30 seconds

module.exports = {
    runInstagram,
};
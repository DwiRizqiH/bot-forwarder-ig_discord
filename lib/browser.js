const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs');

class AutoLoginBrowser {
    constructor() {
        this.driver = null;
        this.url = process.env.TARGET_URL;
        this.username = process.env.LOGIN_USERNAME;
        this.password = process.env.LOGIN_PASSWORD;
        this.debugging = process.env.DEBUGGING === 'true';
        this.waitLoginPageSelector = process.env.waitLoginPageSelector || '//*[contains(text(), "Log in")]';
        this.loginIndicatorSelector = process.env.loginIndicatorSelector || 'form[action*="login"]';
        this.usernameFieldSelector = process.env.usernameFieldSelector || 'input[name="username"], input[type="email"]';
        this.passwordFieldSelector = process.env.passwordFieldSelector || 'input[name="password"], input[type="password"]';
        this.loginButtonSelector = process.env.loginButtonSelector || 'button[type="submit"], input[type="submit"]';
    }

    async initialize() {
        // Set up Firefox options
        const options = new firefox.Options();
        
        // Toggle headless mode based on debugging environment variable
        if (!this.debugging) {
            options.addArguments("-headless");
            console.log('Running in headless mode');
        } else {
            console.log('Running in visible mode (debugging enabled)');
        }
        
        // Create the WebDriver instance for Firefox
        this.driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();
        
        console.log('Firefox browser started');
    }

    async navigateToSite() {
        // await this.driver.get(this.url); then wait the page to load network idle
        await this.driver.get(this.url);
        console.log(`Navigated to ${this.url}`);
    }

    async loadCookies(COOKIES_PATH) {
        try {
            if (fs.existsSync(COOKIES_PATH)) {
                const cookiesString = fs.readFileSync(COOKIES_PATH);
                const cookies = JSON.parse(cookiesString);
                
                // We need to be on the domain before adding cookies
                await this.navigateToSite();
                
                for (const cookie of cookies) {
                    try {
                        await this.driver.manage().addCookie(cookie);
                    } catch (err) {
                        console.log(`Failed to add cookie: ${err.message}`);
                    }
                }
                
                console.log('Cookies loaded successfully');
                
                // Refresh page to apply cookies
                await this.driver.navigate().refresh();
                return true;
            }
        } catch (error) {
            console.error('Error loading cookies:', error);
        }
        return false;
    }

    async saveCookies(COOKIES_PATH) {
        try {
            const cookies = await this.driver.manage().getCookies();
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
            console.log('Cookies saved successfully');
        } catch (error) {
            console.error('Error saving cookies:', error);
        }
    }

    async isLoginRequired() {
        try {
            await this.driver.wait(until.elementLocated(By.xpath(this.waitLoginPageSelector)), 3000);
            const loginElements = await this.driver.findElements(By.xpath(this.loginIndicatorSelector));
            console.log(`Login elements found: ${loginElements.length}`);
            return loginElements.length > 0;
        } catch (error) {
            // console.error('Error checking if login is required:', error);
            return false;
        }
    }

    async login() {
        try {
            console.log('Attempting to login...');
            await this.driver.sleep(2000);
            
            // Wait for username field to be present
            await this.driver.wait(until.elementLocated(By.xpath(this.usernameFieldSelector)), 10000);
            
            // Fill in username
            await this.driver.findElement(By.xpath(this.usernameFieldSelector)).sendKeys(this.username);
            
            // Fill in password
            await this.driver.findElement(By.xpath(this.passwordFieldSelector)).sendKeys(this.password);
            
            // Click login button
            await this.driver.findElement(By.xpath(this.loginButtonSelector)).click();
            
            // Wait for page to load after login (you may need to customize this)
            await this.driver.sleep(3000);
            
            console.log('Login completed');
        } catch (error) {
            console.error('Error during login process:', error);
            throw error;
        }
    }

    /**
     * Wait for an element to appear and then perform an action
     * @param {string} selector - Xpath selector for the element
     * @param {number} timeout - Maximum time to wait in milliseconds
     * @param {function} callback - Function to execute when element appears (receives element as parameter)
     * @param {boolean} continuous - If true, continues to monitor for new elements
     * @returns {Promise<void>}
     */
    async waitForElement(selector, timeout = 30000, callback = null, continuous = false) {
        console.log(`Waiting for element: ${selector}`);
        
        try {
            if (!continuous) {
                // Simple one-time wait
                const element = await this.driver.wait(until.elementLocated(By.xpath(selector)), timeout);
                console.log(`Element found: ${selector}`);
                
                if (callback && typeof callback === 'function') {
                    await callback(element);
                }
                
                return element;
            } else {
                // Continuous monitoring implementation
                let previousElements = [];
                
                // Initial check
                let currentElements = await this.driver.findElements(By.xpath(selector));
                previousElements = [...currentElements];
                
                // If elements already exist and callback is provided, call it for each
                if (previousElements.length > 0 && callback && typeof callback === 'function') {
                    for (const element of previousElements) {
                        await callback(element);
                    }
                }
                
                // Start the continuous monitoring
                const intervalId = setInterval(async () => {
                    try {
                        currentElements = await this.driver.findElements(By.xpath(selector));
                        
                        // Check for new elements
                        if (currentElements.length > previousElements.length) {
                            console.log(`New elements found matching: ${selector}`);
                            
                            // Get only the new elements
                            const newElements = currentElements.slice(previousElements.length);
                            
                            // Call callback for each new element
                            if (callback && typeof callback === 'function') {
                                for (const element of newElements) {
                                    await callback(element);
                                }
                            }
                        }
                        
                        // Update previous elements count
                        previousElements = [...currentElements];
                    } catch (error) {
                        console.error('Error in continuous element monitoring:', error);
                    }
                }, 1000); // Check every second
                
                // Return the interval ID so it can be cleared when no longer needed
                return intervalId;
            }
        } catch (error) {
            console.error(`Error waiting for element ${selector}:`, error);
            throw error;
        }
    }

    /**
     * Wait for an element text to changed and then perform an action
     * @param {string} selector - Xpath selector for the element
     * @param {string} text - Initial text to check against
     * @param {number} timeout - Maximum time to wait in milliseconds
     * @param {function} callback - Function to execute when element appears (receives element as parameter)
     * @param {boolean} continuous - If true, continues to monitor for new elements
     * @returns {Promise<void>}
     */
    async waitForElementText(selector, text = null, timeout = 30000, callback = null, continuous = false) {
        console.log(`Waiting for element text: ${selector}`);

        let textToCompare = text || '';
        console.log(`Current Text: ${textToCompare}`);
        
        try {
            // Continuous monitoring implementation
            let previousText = textToCompare;
                            
            // Initial check
            const element = await this.driver.wait(until.elementLocated(By.xpath(selector)), timeout);
            console.log(`Element found: ${selector}`);

            // Get the initial text
            if(!text) {
                previousText = await element.getText();
                console.log(`Current Text Change: ${previousText}`);
            }

            let alreadyProcessed = false;

            // Start the continuous monitoring
            return new Promise((resolve, reject) => {
                const intervalId = setInterval(async () => {
                    if(alreadyProcessed && !continuous) {
                        console.log('Stopping monitoring due to already processed...');
                        clearInterval(intervalId);
                        return
                    }

                    try {
                        let currentText = null;
                        try {
                            currentText = await element.getText();
                        } catch (error) {
                            currentText = previousText;
                            if(!continuous) {
                                console.log('Stopping monitoring due to error...');
                                // Clear interval after change detected
                                clearInterval(intervalId);
                                return resolve(null);
                            }
                        }
                        
                        // Check for text change
                        if (currentText !== previousText) {
                            alreadyProcessed = true;
                            console.log(`Text changed from "${previousText}" to "${currentText}"`);

                            // Update previous text
                            previousText = currentText;
                            
                            // Call callback if provided
                            let resultCallback = null;
                            if (callback && typeof callback === 'function') {
                                resultCallback = await callback(element, currentText);
                                if(resultCallback?.changePreviousText) {
                                    previousText = resultCallback.changePreviousText;
                                }
                            }

                            if(!continuous) {
                                console.log('Stopping monitoring after text change...');
                                // Clear interval after change detected
                                clearInterval(intervalId);
                                return resolve(null);
                            }
                        }
                    } catch (error) {
                        console.error('Error in continuous text monitoring:', error);
                        // quit browser and exit process
                        await this.quit();
                        process.exit(1); // Exit the process on error
                    }
                }, 1000); // Check every second

                // Return the interval ID so it can be cleared when no longer needed
                if(continuous) return resolve(intervalId);
            })
        } catch (error) {
            console.error(`Error waiting for element text ${selector}:`, error);
            throw error;
        }
    }
    

    /**
     * Stop a continuous element monitoring process
     * @param {number} intervalId - The interval ID returned by waitForElement
     */
    stopWaitingForElement(intervalId) {
        if (intervalId) {
            clearInterval(intervalId);
            console.log('Element monitoring stopped');
        }
    }

    /**
     * Stops a continuous text monitoring process
     * @param {number} intervalId - The interval ID returned by waitForElementText
     */
    stopWaitingForElementText(intervalId) {
        if (intervalId) {
            clearInterval(intervalId);
            console.log('Text monitoring stopped');
        }
    }

    async quit() {
        if (this.driver) {
            await this.saveCookies();
            await this.driver.quit();
            console.log('Browser closed');
        }
    }
}

module.exports = AutoLoginBrowser;
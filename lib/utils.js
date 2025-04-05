const fs = require('fs');

const { downloadWithCobalt } = require('./down.js');
const { sendMediaMessage } = require('./dc.js');

async function downloadAllFiles(allFilteredLinks) {
    console.log('Downloading all files:', allFilteredLinks);
    try {
        // Use Promise.all to download all files concurrently
        const downloadResults = await Promise.all(
            allFilteredLinks.map(async (link) => {
                const result = await downloadWithCobalt(link, 'auto', '1080', '320', false, false, true)
                return {
                    link: link,
                    result: result
                };
            })
        );
        
        console.log('All files downloaded successfully');
        return downloadResults; // Returns array of objects with link and result
    } catch (error) {
        console.error('Error downloading files:', error);
        throw error;
    }
}

/**
 * description: sendToDiscord function to send media messages to Discord
 * @arrayLink: array of objects with username, avatarURL, and file
 * @return: void
 */
async function sendToDiscord(arrayLink) {
    console.log('Sending to Discord:', arrayLink);

    // delete duplicate file and keep the first one
    const uniqueLinks = new Set();
    arrayLink = arrayLink.filter(all => {
        if (uniqueLinks.has(all.file)) {
            return false; // Skip this entry if the file is already in the set
        } else {
            uniqueLinks.add(all.file);
            return true; // Keep this entry
        }
    })

    const allFilteredLink = arrayLink.map(all => all.file).filter(all => all);
    if(allFilteredLink.length === 0) {
        console.log('No valid links to send to Discord');
        return;
    }

    // use promise All to download all files with downloadWithCobalt
    let allDownload = await downloadAllFiles(allFilteredLink);
    allDownload = allDownload.map(all => {
        if(!all.result || !all.result.filePath) {
            console.log('Download failed for link:', all.link, 'all result:', all.result);
            return null; // Skip this entry if download failed
        }
        const findArrayLink = arrayLink.find(allLink => allLink.file === all.link);
        return {
            username: findArrayLink.username,
            avatarURL: findArrayLink.avatarURL,
            file: all.result.filePath,
        };
    })
    allDownload = allDownload.filter(all => all?.file && all?.file !== '');

    console.log('All download combined:', allDownload);
    allDownload.forEach(async (all) => {
        const sendMessage = await sendMediaMessage(
            "",
            all.file,
            all.username,
            all.avatarURL
        );
        console.log('Send message to discord:', sendMessage);

        all.file.forEach(async (file) => {
            console.log('Deleting file:', file);
            if(fs.existsSync(file)) {
                fs.unlinkSync(file);
                console.log('File deleted:', file);
            } else {
                console.log('File not found:', file);
            }
        })
    })
}

module.exports = {
    sendToDiscord
}
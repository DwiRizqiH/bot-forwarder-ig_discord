const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');

/**
 * Downloads media using the Cobalt API
 * @param {string} url - URL to download from
 * @param {('auto'|'audio'|'mute')} [mode='auto'] - Download mode
 * @param {('144'|'240'|'360'|'480'|'720'|'1080'|'1440'|'2160'|'4320'|'max')} [videoQuality='1080'] - Video quality
 * @param {('320'|'256'|'128'|'96'|'64'|'8')} [audioBitrate='320'] - Audio bitrate
 * @param {boolean} [tiktokFullAudio=false] - Whether to download original TikTok audio
 * @returns {Promise<{success: boolean, message: string, filePath?: string}>}
 */
async function downloadWithCobalt(url, mode = 'auto', videoQuality = '1080', audioBitrate = '320', tiktokFullAudio = false, tiktokIsH265 = false, isEditProgress = false) {
    const COBALT_API = process.env.COBALT_API_URL; // Replace with your API instance
    const API_KEY = process.env.COBALT_API_KEY; // Get API key from environment variable
    const randomIdRequest = Math.floor(Math.random() * 1000000000)

    try {
        if(isEditProgress) console.log("Status: Initializing download...")
        // Validate inputs
        if (!url) throw new Error('URL is required');
        if (!['auto', 'audio', 'mute'].includes(mode)) {
            throw new Error('Invalid mode. Must be auto, audio, or mute');
        }

        if(isEditProgress) console.log("Status: Validating inputs...")
        // Make request to Cobalt API
        let builderBodyCobalt = {
            url,
            downloadMode: mode,
            youtubeVideoCodec: 'h264',
            videoQuality: videoQuality.toString(),
            // audioFormat: 'best',
            audioBitrate: audioBitrate.toString(),
            tiktokFullAudio,
            filenameStyle: 'pretty',
            tiktokH265: tiktokIsH265,
            youtubeHLS: true
        }
        if(url.includes('tiktok.com') && url.includes('photo')) {
            builderBodyCobalt = {
                url,
                downloadMode: mode,
                filenameStyle: 'pretty'
            }
        }
        const response = await axios.post(COBALT_API, builderBodyCobalt, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Api-Key ${API_KEY}`
            }
        });

        let progressEventLoad = {}
        let isDownloadProgress = false
        let timeIntervalEveryUpdateProgress = 1.5 * 1000
        function downloadProgress() {
            if(isDownloadProgress) return
            isDownloadProgress = setInterval(async () => {
                if((progressEventLoad.loaded === progressEventLoad.total) && isDownloadProgress) {
                    clearInterval(isDownloadProgress)
                    isDownloadProgress = undefined
                    return
                }

                if(isEditProgress) {
                    let textEdit = `Download progress: ${((progressEventLoad.loaded / progressEventLoad.total) * 100).toFixed(1)}%`
                    if(!progressEventLoad.total) textEdit = 'Download progress: ' + clacSize_kb(progressEventLoad.loaded) + ' ' + clacSize_kb(progressEventLoad.rate) + '/s'
                    console.log(textEdit)
                }
            }, timeIntervalEveryUpdateProgress)
        }

        // Handle different response types
        switch (response.data.status) {
            case 'redirect':
            case 'tunnel': {
                let { url: downloadUrl, filename } = response.data;
                // add random id in the end of filename before the extension
                const splitFilename = filename.split('.')
                const extension = splitFilename.pop()
                filename = splitFilename.join('.') + `_${randomIdRequest}.${extension}`
                
                if(isEditProgress) console.log("Status: Starting file download...")
                // Download the file with progress tracking
                
                const fileResponse = await axios({
                    method: 'GET',
                    url: downloadUrl,
                    responseType: 'stream',
                    onDownloadProgress: (progressEvent) => {
                        progressEventLoad = progressEvent
                        if(isEditProgress && !isDownloadProgress) {
                            downloadProgress()
                        }
                    }
                });

                // Create downloads directory if it doesn't exist
                const downloadDir = path.join(process.cwd(), 'cache');
                if (!fs.existsSync(downloadDir)) {
                    fs.mkdirSync(downloadDir);
                }

                // Save the file
                const filePath = path.join(downloadDir, filename);
                const writer = fs.createWriteStream(filePath);

                fileResponse.data.pipe(writer);

                return new Promise((resolve, reject) => {
                    writer.on('finish', () => {
                        if(isDownloadProgress) {
                            clearInterval(isDownloadProgress)
                            isDownloadProgress = undefined
                        }
                        if(isEditProgress) console.log("Status: Download completed!")

                        // convert heic to jpg
                        const extension = path.extname(filePath)
                        if(extension.endsWith('.heic')) {
                            if(isEditProgress) console.log("Status: Converting HEIC to JPG...")
                            const convertHeicToJpg = spawn('ffmpeg', ['-i', filePath, '-y', filePath.replace('.heic', '.jpg')])
                            convertHeicToJpg.on('close', () => {
                                fs.unlinkSync(filePath)
                                resolve({
                                    success: true,
                                    message: 'Download completed successfully',
                                    filePath: [filePath.replace('.heic', '.jpg')]
                                })
                            })
                        } else if(!extension.endsWith('.jpg') && !extension.endsWith('.jpeg') && !extension.endsWith('.png') && !extension.endsWith('.webp') && !extension.endsWith('.heic')) {
                            if(isEditProgress) console.log("Status: Fixing video/audio content...")
                            const fixVideoAudioContent = spawn('ffmpeg', ['-i', filePath, '-c', 'copy', '-y', filePath + '.fixed' + extension])
                            fixVideoAudioContent.on('close', () => {
                                if(isEditProgress) console.log("Status: Video/audio content fixed!")
                                fs.unlinkSync(filePath)
                                // fs.renameSync(filePath + '.fixed.mp4', filePath)
                                fs.renameSync(filePath + '.fixed' + extension, filePath)
                                resolve({
                                    success: true,
                                    message: 'Download completed successfully',
                                    filePath: [filePath]
                                })
                            })
                        } else {
                            resolve({
                                success: true,
                                message: 'Download completed successfully',
                                filePath: [filePath]
                            })
                        }
                    });
                    writer.on('error', (error) => {
                        if(isDownloadProgress) {
                            clearInterval(isDownloadProgress)
                            isDownloadProgress = undefined
                        }
                        reject(error);
                    });
                });
            }

            case 'picker': {
                if(isEditProgress) console.log("Status: Processing multiple files...")
                // Handle multiple files
                const downloads = [];
                
                // Download audio if present
                if (response.data.audio) {
                    downloads.push({
                        url: response.data.audio,
                        // filename: response.data.audioFilename add unique id in the end of filename
                        filename: `${Date.now()}_${response.data.audioFilename}`
                    });
                }

                // Add all picker items
                response.data.picker.forEach(item => {
                    downloads.push({
                        url: item.url,
                        filename: `${randomIdRequest}_${Math.floor(Math.random() * 1000000000)}${path.extname(item.url.split('?stp=dst')[0]).split('?')[0]}` // Generate unique filename
                    });
                });

                // Download all files
                const downloadDir = path.join(process.cwd(), 'cache');
                if (!fs.existsSync(downloadDir)) {
                    fs.mkdirSync(downloadDir);
                }

                if(isEditProgress) console.log("Status: Starting multiple file downloads...")
                const downloadPromises = downloads.map(async ({ url, filename }) => {
                    const fileResponse = await axios({
                        method: 'GET',
                        url,
                        responseType: 'stream'
                    });

                    // get filename from response header if available
                    if (fileResponse.headers['content-disposition']) {
                        const contentDisposition = fileResponse.headers['content-disposition'];
                        const filenameMatch = contentDisposition.match(/filename[^*?]=['"]?([^'"]*)['"]?/);
                        if (filenameMatch) {
                            // filename: `${randomIdRequest}_${Math.floor(Math.random() * 1000000000)}${path.extname(item.url.split('?stp=dst')[0]).split('?')[0]}` // Generate unique filename
                            filename = `${randomIdRequest}_${Math.floor(Math.random() * 1000000000)}${decodeURIComponent(filenameMatch[1])}`;
                        }
                    }
                    console.log(`Status: Downloading ${filename}...`)

                    const filePath = path.join(downloadDir, filename);
                    const writer = fs.createWriteStream(filePath);
                    fileResponse.data.pipe(writer);

                    return new Promise((resolve, reject) => {
                        // writer.on('finish', () => resolve(filePath)); fix all type video or music
                        writer.on('finish', () => {
                            const extension = path.extname(filePath)

                            // convert heic to jpg
                            if(extension.endsWith('.heic')) {
                                if(isEditProgress) console.log("Status: Converting HEIC to JPG...")
                                const convertHeicToJpg = spawn('ffmpeg', ['-i', filePath, '-y', filePath.replace('.heic', '.jpg')])
                                
                                convertHeicToJpg.on('close', () => {
                                    fs.unlinkSync(filePath)
                                    resolve(filePath.replace('.heic', '.jpg'))
                                })
                            } else if(!extension.endsWith('.jpg') && !extension.endsWith('.jpeg') && !extension.endsWith('.png') && !extension.endsWith('.webp') && !extension.endsWith('.heic')) {
                                const fixVideoAudioContent = spawn('ffmpeg', ['-i', filePath, '-c', 'copy', '-y', filePath + '.fixed' + extension])
                                fixVideoAudioContent.on('close', () => {
                                    fs.unlinkSync(filePath)
                                    fs.renameSync(filePath + '.fixed' + extension, filePath)
                                    resolve(filePath)
                                })
                            } else {
                                resolve(filePath)
                            }
                        });
                        writer.on('error', reject);
                    });
                });

                const filePaths = await Promise.all(downloadPromises);
                if(isEditProgress) console.log("Status: All files downloaded successfully!")
                return {
                    success: true,
                    message: 'Multiple files downloaded successfully',
                    filePath: filePaths
                };
            }

            case 'error': {
                throw new Error(`Cobalt API Error: ${JSON.stringify(response.data.error)}`);
            }

            default: {
                throw new Error(`Unknown response status: ${response.data.status}`);
            }
        }
    } catch (error) {
        console.error(error);
        return {
            success: false,
            message: error.message
        };
    }
}

// Helper function to calculate size in KB
function clacSize_kb(size) {
    if(size > 1024) {
        return (size / 1024).toFixed(2) + ' MB'
    } else {
        return size.toFixed(2) + ' KB'
    }
}

module.exports = {
    downloadWithCobalt
}
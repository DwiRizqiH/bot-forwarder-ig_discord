require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { runInstagram } = require('./lib/ig.js');

// initialize folder structure
if(!fs.existsSync(path.join(process.cwd(), 'database'))) fs.mkdirSync(path.join(process.cwd(), 'database'));
if(!fs.existsSync(path.join(process.cwd(), 'database', 'channels.json'))) fs.writeFileSync(path.join(process.cwd(), 'database', 'channels.json'), JSON.stringify({ channels: [] }, null, 2));
if(!fs.existsSync(path.join(process.cwd(), 'cache'))) fs.mkdirSync(path.join(process.cwd(), 'cache'));

// initialize discord bot
require('./lib/dc.js')

// initialize instagram
runInstagram();
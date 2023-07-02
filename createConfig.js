const WireGuard = require('./wireGuard')

if (process.env.ENV_CONFIG_PATH != '0') {
    const path = process.env.ENV_CONFIG_PATH ? process.env.ENV_CONFIG_PATH : '.env'
    console.log('path',path)
    require('dotenv').config({path})
}

const wg = new WireGuard()
wg.saveDb(true,false)
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function writeFileAsync(path,data) {
    return new Promise((res,rej)=>{
        fs.writeFile(path,data,(err)=>{
            if (err) rej(err)
            else res()
        })
    })
}
function readFileAsync(path) {
    return new Promise((res,rej)=>{
        fs.readFile(path,'utf8',(err,data)=>{
            if (err) rej(err)
            else res(data)
        })
    })
}


class WireGuard {
    constructor() {
        this.dbHash = undefined
        this.loadDb()
        this.localIP = JSON.parse(process.env.WG_LOCAL_IP) 
    }
    
    ip(id) {
        return `${this.localIP[0]}.${this.localIP[1]}.${this.localIP[2]}.${id}`
    }

    async getWgStatus() {
        const resultString = await new Promise((res,rej)=>{
            const wgShow = spawn('wg',['show'])
            let acc = ''
            wgShow.stdout.on('data',(data)=>{
                const string = data.toString()
                acc += string
            })
            wgShow.once('close',()=>{res(acc)})
            wgShow.once('error',rej)
        })
        const peers = this.processWgStatusString(resultString)
        return peers
    }

    processWgStatusString(wgStatusString) {
        const peerPartsRegExp = {
            public_key: /peer: (.*)(\n|$)/,
            allowed_ips: /allowed ips: (.*)(\n|$)/,
            latest_handshake: /latest handshake: (.*)(\n|$)/,
            transfer: /transfer: (.*)(\n|$)/
        }

        function getParts(peerString) {
            const substrings = peerString.split('\n')
            const peerPartsResult = {}
            substrings.forEach(substring=>{
                for (const [field,reg] of Object.entries(peerPartsRegExp)) {
                    const match = substring.match(reg)
                    if (match) {
                        peerPartsResult[field] = match[1]
                        return
                    }
                }
            })
            return peerPartsResult
        }

        const peerStrings = wgStatusString.split('\n\n')
        const peers = {}
        peerStrings.forEach(peerString=>{
            const peerParts = getParts(peerString)
            if (peerParts.allowed_ips) {
                const id = peerParts.allowed_ips.split(' ')[0].split('/')[0].split('.')[3]
                console.log('ID',id)
                peerParts.id = parseInt(id)
                if (peerParts.transfer) {
                    const transferString = peerParts.transfer
                    const transferMatch = transferString.match(/(.*) received, (.*) sent/)
                    if (transferMatch) peerParts.transfer = {
                        recieved: transferMatch[1],
                        sent: transferMatch[2]
                    }
                }
                
                peers[id] = peerParts
            }
        })
        return peers
    }



    generateWgConfig() {
        const wgConfig = `[Interface]
PrivateKey = ${process.env.WG_SERVER_PRIVATEKEY}
Address = ${this.ip(process.env.WG_SERVER_ID)}/${process.env.WG_SERVER_MASK}
ListenPort = ${process.env.WG_SERVER_PORT}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${process.env.WG_SERVER_INTERFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${process.env.WG_SERVER_INTERFACE} -j MASQUERADE` + Object.values(this.db).reduce((acc,user)=>{
        const userString = `\n[Peer]
PublicKey = ${user.public_key}
AllowedIPs = ${this.ip(user.id)}/${process.env.WG_USER_MASK}`
            return acc + userString 
        },'')
    
    return wgConfig
    }

    generateUserConfig(user) {
        const userConfig = `[Interface]
PrivateKey = ${user.private_key}
Address = ${this.ip(user.id)}/${process.env.WG_USER_MASK}
DNS = 8.8.8.8

[Peer]
PublicKey = ${process.env.WG_SERVER_PUBLICKEY}
Endpoint = ${process.env.WG_SERVER_ADDRESS}:${process.env.WG_SERVER_PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20`
        return userConfig
    }

    findFreeId() {
        const idList = Object.values(this.db).map(el=>{return el.id})
        console.log('Список ID',idList)     
        for (let id = 1; id <= 255;id++) {
            if (id == process.env.WG_SERVER_ID) continue
            if (!idList.includes(id)) {
                return id
            }
        }
        throw new Error('Free ID not found')
    }

    getDbHash(dbString = JSON.stringify(this.db)) {
        return crypto.createHash('md5').update(dbString).digest('hex');
    }

    loadDb(dbPath='data/wgDb.json') {
        try {
            if (!fs.existsSync(dbPath)) {
                console.log('Create empty db config',dbPath)
                fs.writeFileSync(dbPath,JSON.stringify('{}'))
            }
            console.log('Load user list',__dirname,dbPath)
            const dbString = fs.readFileSync(path.join(__dirname,dbPath),'utf8')
            const dbObject = JSON.parse(dbString)
            this.db = dbObject
            this.dbHash = this.getDbHash()
            return dbObject
        }
        catch(e) {
            console.log(`db file invalid (try to load ${path})`,e )
            return undefined
        }
    }
    
    async saveDb(skipCheck=false,restart=true,dbPath='data/wgDb.json',wgConigPath='/etc/wireguard/wg0.conf') {
        const dbString = JSON.stringify(this.db)
        const dbHash = this.getDbHash(dbString) 
        if (!skipCheck && dbHash === this.dbHash) { console.log('Aborting, no changes'); return; }
        this.dbHash = dbHash
        await writeFileAsync(path.join(__dirname,dbPath),dbString)
        
        const wgConfig = this.generateWgConfig()
        await writeFileAsync(wgConigPath,wgConfig)

        if (restart)
            await this.restartWgService()
        
    }

    restartWgService() {
        return new Promise((res,rej)=>{
            console.log('Restart WireGuard service')
            const restartServie = spawn('systemctl',['restart','wg-quick@wg0'])
            restartServie.once('close',()=>{res()})
            restartServie.once('error',rej)
        })
    }

    async genKeys() {
        try {
            const privateKey = await new Promise((res,rej)=>{
                const genKey = spawn('wg',['genkey'])
                let privateKey = ''
                genKey.stdout.on('data',(data)=>{
                    privateKey = data.toString()
                })
                genKey.once('close',()=>{res(privateKey)})
                genKey.once('error',rej)
            })
            console.log('private key',privateKey)
            const publicKey = await new Promise((res,rej)=>{
                const echoPrivateKey = spawn('echo',[privateKey])
                const genKey = spawn('wg',['pubkey'])
                echoPrivateKey.stdout.pipe(genKey.stdin)
                let publicKey = ''
                genKey.stdout.on('data',(data)=>{
                    publicKey = data.toString()
                })
                genKey.once('close',()=>{res(publicKey)})
                genKey.once('error',rej)
            })
            console.log('public key',publicKey)
            return {privateKey,publicKey}
        } catch(e) {
            console.log('Error on gen keys',e)   
            return undefined
        }
    }

    async addUser(name) {
        try {
            const {privateKey,publicKey} = await this.genKeys()
            if (!privateKey || !publicKey) return {status:2}
            const id = this.findFreeId()
            if (!id) return {status: 3,message: 'FREE_ID_NOT_FOUND'}
            const newUser = {
                name,
                public_key: publicKey,
                private_key: privateKey,
                id
            }
            this.db[newUser.id] = newUser
            await this.saveDb()
            return {status:0,message:'OK',user:newUser,client_config:this.generateUserConfig(newUser)}
        } catch(e) {
            console.log('Error on add user',e)
            return {status:1,message:'UNKNOWN_ERROR'}
        }
        
    }

    async removeUser(id) {
        try {
            if (!this.db.hasOwnProperty(id)) {
                console.log(`User with ${id} not found`)
                return {status:2,message:'USER_NOT_FOUND'}
            }
            delete this.db[id]
            await this.saveDb()
            return {status:0,message:'OK'}    
        } catch(e) {
            console.log('Error on remove user',e)
            return {status:1,message:'UNKNOWN_ERROR'}
        }
    }
    
} 

module.exports = WireGuard

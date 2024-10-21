const EventEmitter = require('events')
const express = require('express')
const http = require('http')
const cors = require('cors')
const fs = require('fs')
const NetworkBandwidthMonitor = require("node-network-bandwidth-monitor");

const WireGuard = require('./wireGuard')
const {getMetrics, networkUsage, activeUsersCount} = require('./prometheus')

class WebServer extends EventEmitter{
    constructor()  {
        super()
        this.httpPort = parseInt(process.env.WEBSERVER_PORT)
        this.wg_interface = process.env.WG_SERVER_INTERFACE
        this.network_info_interval = parseInt(process.env.NETWORK_INFO_INTERVAL)
    }

    start() {
        const monitor = new NetworkBandwidthMonitor(this.wg_interface,this.network_info_interval)
        monitor.registerCallback((data) => {
            networkUsage.observe({type:'up'},Number(data.uplink.kbps))
            networkUsage.observe({type:'down'},Number(data.downlink.kbps))
        })
        monitor.start()
        const wireGuard = new WireGuard()
        
        const app = express()
        const httpServer = http.createServer(app)
        this.app = app
        app.use(express.json({ extended: true }))
        app.use(cors())
        app.use((req,res,next)=>{
            try {
                console.log('Headers',req.headers)
                console.log('Body',req.body)
                console.log('Params',req.query)
                console.log('Data',req.data)  
                if (!req.headers.authorization) { 
                    res.status(401).json({message:'NO_AUTHORIZATION_HEADER'})
                    return
                }
                const authorization = req.headers.authorization
                const match = authorization.match(/Bearer (.*)/)
                if (!match?.[1] || match[1] != process.env.WEBSERVER_SECRET_KEY) { 
                    res.status(402).json({message:'WRONG_AUTHORIZATION'})
                    return 
                } 
                next()
            } catch(e) {
                console.log('Auth middleware error',e)
                res.status(500).send('Auth middleware error')
            }
        })

        app.post('/restart_service', async (req,res)=>{
            try {
                console.log("Restarting service")
                await wireGuard.restartWgService()
                res.status(200)
            }
            catch(e) {
                console.log(e)
                res.status(500).send('Restart error')
            }
        })
        
        app.post('/add_user', async (req,res)=>{
            try {
                const {name} = req.body
                console.log('/add_user',name)
                if (!name) {
                    res.status(410).json({message:'BAD_PARAMS'})
                    return   
                }
                const addResult = await wireGuard.addUser(name)
                if (addResult.status !== 0) {
                    console.log('ERROR STATUS',410+addResult.status)
                    res.status(410+addResult.status).json({message:addResult.message})
                    return
                }
                res.status(200).json(addResult)
            }
            catch(e) {
                console.log(e)
                res.status(500).send('Add user error')
            }
        })
        app.get('/remove_user',async (req,res)=>{
            try {
                const {id} = req.query
                console.log('/remove_user',id)
                if (!id) {
                    res.status(410).json({message:'BAD_PARAMS'})
                    return   
                }
                try { id == parseInt(id) } catch(e) {
                    res.status(410).json({message:'BAD_PARAMS'})
                    return
                }
                const removeResult = await wireGuard.removeUser(id)
                if (removeResult.status !== 0) {
                    console.log('ERROR STATUS',410+removeResult.status)
                    res.status(410+removeResult.status).json({message:removeResult.message})
                    return
                }
                res.status(200).json(removeResult)
            }
            catch(e) {
                console.log(e)
                res.status(500).send('Remove user error')
            }
        })
        app.get('/get_users',async (req,res)=>{
            try {
                const wgUserStatus = await wireGuard.getWgStatus()
                const result = {}
                Object.values(wireGuard.db).forEach(user =>{
                    result[user.id] = {...user,...wgUserStatus[user.id]}
                })
                res.status(200).json({users:result})
            }
            catch(e) {
                console.log(e)
                res.status(500).send('Get user list error')
            }
        })
        app.get('/get_user',(req,res)=>{
            try {
                let {id} = req.query
                console.log('/get_user',id)
                if (!id) {
                    res.status(410).json({message:'BAD_PARAMS'})
                    return   
                }
                try { id = parseInt(id) } catch(e) {
                    res.status(410).json({message:'BAD_PARAMS'})
                    return
                }
                if (!wireGuard.db.hasOwnProperty(id)) {
                    res.status(411).json({message:'USER_NOT_FOUND'})
                    return
                }
                const user = wireGuard.db[id]
                const client_config = wireGuard.generateUserConfig(user)
                res.status(200).json({user,client_config})
            }
            catch(e) {
                console.log(e)
                res.status(500).send('Get user error')
            }

        })

        app.get('/metrics',async (req,res)=>{
            const usersCount = await wireGuard.getActiveUsersCount()
            activeUsersCount.set({interface:this.wg_interface}, usersCount)
            const metricsAnswer = await getMetrics()
            networkUsage.reset()
            res.status(200).send(metricsAnswer)
        })

        httpServer.listen(this.httpPort, () => console.log(`WebServer started, on port: ${this.httpPort}`))
    }
}

module.exports = WebServer
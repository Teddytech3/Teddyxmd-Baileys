const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const pino = require('pino')
const fs = require('fs')
const app = express()
app.use(express.json())

let sock
let state, saveCreds

async function start() {
    const { state: s, saveCreds: sc } = await useMultiFileAuthState('./auth')
    state = s; saveCreds = sc
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if(qr) {
            console.log('QR Code:', qr)
        }
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            console.log('Connection closed, reconnecting:', shouldReconnect)
            if(shouldReconnect) start()
        } else if(connection === 'open') {
            console.log('WhatsApp connected successfully')
        }
    })
    sock.ev.on('messages.upsert', (m) => {
        console.log('New message from:', m.messages[0]?.key?.remoteJid)
    })
}

app.post('/send-message', async (req, res) => {
    try {
        const { jid, message } = req.body
        if (!sock) return res.status(503).json({ error: 'WhatsApp not connected yet' })
        await sock.sendMessage(jid, message)
        res.json({ success: true })
    } catch (e) {
        console.log('Send error:', e)
        res.status(500).json({ error: e.toString() })
    }
})

app.get('/session', (req, res) => {
    try {
        const creds = fs.readFileSync('./auth/creds.json')
        res.send('Teddy-xmd~' + creds.toString('base64'))
    } catch (e) {
        res.status(500).send('Session not ready yet. Scan QR first.')
    }
})

app.get('/', (req, res) => res.send('Baileys server running'))

start()
app.listen(process.env.PORT || 3000, () => console.log('Server started on port', process.env.PORT || 3000))

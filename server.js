const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const express = require('express')
const pino = require('pino')
const fs = require('fs')
const app = express()
app.use(express.json())

let sock
let qrCode = null
let state, saveCreds

async function start() {
    const { state: s, saveCreds: sc } = await useMultiFileAuthState('./auth')
    state = s; saveCreds = sc
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Desktop')
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if(qr) {
            qrCode = qr
            console.log('QR Code:', qr)
        }
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            console.log('Connection closed, reconnecting:', shouldReconnect)
            if(shouldReconnect) setTimeout(start, 3000)
        } else if(connection === 'open') {
            qrCode = null
            console.log('WhatsApp connected successfully')
        }
    })

    sock.ev.on('messages.upsert', (m) => {
        console.log('New message from:', m.messages[0]?.key?.remoteJid)
    })
}

// Request pairing code with phone number
app.get('/pair/:phone', async (req, res) => {
    try {
        if (!sock) return res.status(503).send('Socket not initialized yet. Wait 5 sec and try again.')
        if (sock.user) return res.send('Already paired and connected.')

        const phoneNumber = req.params.phone.replace(/[^0-9]/g, '') // strip +, spaces, etc
        if (!phoneNumber) return res.status(400).send('Invalid phone number')

        const code = await sock.requestPairingCode(phoneNumber)
        res.send(`Pairing code for ${phoneNumber}: ${code}<br>Go to WhatsApp > Linked Devices > Link with phone number > Enter this code`)
    } catch (e) {
        console.log('Pair error:', e)
        res.status(500).send('Error: ' + e.toString() + '<br>Make sure you are NOT connected yet. If QR was shown, restart service first.')
    }
})

app.get('/qr', (req, res) => {
    if (qrCode) {
        res.send(`<html><body><h1>Scan QR</h1><p>${qrCode}</p><p>Use https://qr.io to convert this text to image</p></body></html>`)
    } else if (sock?.user) {
        res.send('Already connected as: ' + sock.user.id)
    } else {
        res.send('No QR pending. Restart service if not connected.')
    }
})

app.post('/send-message', async (req, res) => {
    try {
        const { jid, message } = req.body
        if (!sock?.user) return res.status(503).json({ error: 'WhatsApp not connected yet' })
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
        res.status(500).send('Session not ready yet. Pair first.')
    }
})

app.get('/logout', async (req, res) => {
    try {
        if (sock) await sock.logout()
        fs.rmSync('./auth', { recursive: true, force: true })
        res.send('Logged out. Restart Railway service to get new QR or pairing code.')
    } catch (e) {
        res.send('Error: ' + e)
    }
})

app.get('/', (req, res) => res.send('Baileys server running'))

start()
app.listen(process.env.PORT || 3000, () => console.log('Server started on port', process.env.PORT || 3000))

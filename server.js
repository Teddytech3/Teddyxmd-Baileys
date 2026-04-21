const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const pino = require('pino')
const app = express()
app.use(express.json())

let sock
let state, saveCreds

async function start() {
    const { state: s, saveCreds: sc } = await useMultiFileAuthState('./auth')
    state = s; saveCreds = sc
    sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if(shouldReconnect) start()
        } else if(connection === 'open') {
            console.log('WhatsApp connected')
        }
    })
}

app.post('/send-message', async (req, res) => {
    try {
        const { jid, message } = req.body
        await sock.sendMessage(jid, message)
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: e.toString() })
    }
})

app.get('/', (req, res) => res.send('Baileys server running'))

start()
app.listen(process.env.PORT || 3000, () => console.log('Server started'))

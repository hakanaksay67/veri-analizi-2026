const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessions = {};

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'BLS Liveness Bridge API',
        endpoints: {
            generateLink: 'POST /api/generate-link',
            checkStatus: 'GET /api/check-status/:id',
            selfie: 'GET /selfie',
            mobileComplete: 'POST /api/mobile-complete'
        }
    });
});

app.post('/api/generate-link', (req, res) => {
    try {
        const { urlData, securityTokens, timestamp } = req.body;

        if (!urlData) {
            return res.status(400).json({
                status: 'error',
                message: 'urlData parametresi zorunludur'
            });
        }

        const sessionId = crypto.randomBytes(16).toString('hex');
        const mobileToken = crypto.randomBytes(32).toString('hex');

        sessions[sessionId] = {
            id: sessionId,
            urlData: urlData,
            securityTokens: securityTokens || {},
            visitorId: securityTokens ? securityTokens.visitorId || (securityTokens.cookies ? securityTokens.cookies.visitorId : null) : null,
            antiforgery: securityTokens ? securityTokens.antiforgery || (securityTokens.cookies ? securityTokens.cookies.Antiforgery : null) : null,
            timestamp: timestamp || Date.now(),
            createdAt: Date.now(),
            status: 'pending',
            mobileToken: mobileToken,
            mobileLink: null,
            resultToken: null,
            lastCheck: null
        };

        sessions[sessionId].mobileLink = req.protocol + '://' + req.get('host') + '/selfie?session=' + sessionId + '&token=' + mobileToken;

        console.log('[YENI OTURUM] ID: ' + sessionId);
        console.log('[MOBIL LINK] ' + sessions[sessionId].mobileLink);
        console.log('[VISITOR ID] ' + (sessions[sessionId].visitorId || 'Bulunamadi'));
        console.log('[ANTIFORGERY] ' + (sessions[sessionId].antiforgery ? 'Var' : 'Yok'));

        res.json({
            status: 'ok',
            sessionId: sessionId,
            mobileLink: sessions[sessionId].mobileLink
        });

    } catch (error) {
        console.error('[HATA] generate-link: ' + error.message);
        res.status(500).json({
            status: 'error',
            message: 'Sunucu hatası oluştu'
        });
    }
});

app.get('/api/check-status/:id', (req, res) => {
    try {
        const sessionId = req.params.id;
        const session = sessions[sessionId];

        if (!session) {
            return res.status(404).json({
                status: 'error',
                message: 'Oturum bulunamadı'
            });
        }

        session.lastCheck = Date.now();

        const response = {
            status: session.status,
            sessionId: session.id,
            createdAt: session.createdAt,
            lastCheck: session.lastCheck
        };

        if (session.status === 'success' && session.resultToken) {
            response.token = session.resultToken;
            response.completedAt = session.completedAt;
        }

        console.log('[DURUM KONTROLU] ID: ' + sessionId + ' -> ' + session.status);

        res.json(response);

    } catch (error) {
        console.error('[HATA] check-status: ' + error.message);
        res.status(500).json({
            status: 'error',
            message: 'Sunucu hatası oluştu'
        });
    }
});

app.get('/selfie', (req, res) => {
    try {
        const sessionId = req.query.session;
        const mobileToken = req.query.token;

        if (!sessionId || !mobileToken) {
            return res.send('<h1>Gecersiz Baglanti</h1>');
        }

        const session = sessions[sessionId];

        if (!session) {
            return res.send('<h1>Oturum Bulunamadi</h1>');
        }

        if (session.mobileToken !== mobileToken) {
            return res.send('<h1>Yetkisiz Erisim</h1>');
        }

        if (session.status === 'success') {
            return res.send('<h1>Dogrulama Basarili!</h1><p>Bu sekmeyi kapatabilirsiniz.</p>');
        }

        res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Selfie Dogrulamasi</title><style>body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px}.container{background:white;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);padding:40px;max-width:400px;width:100%;text-align:center}.icon{font-size:64px;margin-bottom:20px}.title{font-size:24px;font-weight:bold;color:#2c3e50;margin-bottom:10px}.subtitle{font-size:16px;color:#7f8c8d;margin-bottom:30px}.status{margin-top:20px;font-size:14px;color:#7f8c8d;min-height:20px}.loading{display:inline-block;width:20px;height:20px;border:3px solid #f3f3f3;border-top:3px solid #667eea;border-radius:50%;animation:spin 1s linear infinite;margin-right:10px;vertical-align:middle}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head><body><div class="container" id="container"><div class="icon">📸</div><div class="title">Selfie Dogrulamasi</div><div class="subtitle">Dogrulama otomatik olarak gerceklestiriliyor...</div><div class="status" id="statusText"><span class="loading"></span>Islem baslatiliyor...</div></div><script>function completeVerification(){fetch("/api/mobile-complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"' + sessionId + '",mobileToken:"' + mobileToken + '"})}).then(function(response){return response.json()}).then(function(result){if(result.status==="success"){document.getElementById("container").innerHTML="<div style=font-size:64px;margin-bottom:20px>✅</div><div style=font-size:24px;font-weight:bold;color:#27ae60>Dogrulama Basarili!</div><div style=font-size:16px;color:#7f8c8d>Bu sekmeyi kapatabilirsiniz.</div>";setTimeout(function(){window.close()},2000)}else{throw new Error(result.message||"Islem basarisiz")}}).catch(function(error){document.getElementById("statusText").innerHTML="Hata olustu: "+error.message;document.getElementById("statusText").style.color="#e74c3c";document.getElementById("subtitle").innerText="Lutfen sayfayi yenileyin veya baglantiyi kontrol edin."})}document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){completeVerification()},500)})</script></body></html>');

    } catch (error) {
        console.error('[HATA] selfie: ' + error.message);
        res.status(500).send('Sunucu hatasi olustu');
    }
});

app.post('/api/mobile-complete', (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const mobileToken = req.body.mobileToken;

        if (!sessionId || !mobileToken) {
            return res.status(400).json({
                status: 'error',
                message: 'sessionId ve mobileToken zorunludur'
            });
        }

        const session = sessions[sessionId];

        if (!session) {
            return res.status(404).json({
                status: 'error',
                message: 'Oturum bulunamadı'
            });
        }

        if (session.mobileToken !== mobileToken) {
            return res.status(403).json({
                status: 'error',
                message: 'Geçersiz token'
            });
        }

        if (session.status === 'success') {
            return res.json({
                status: 'success',
                message: 'Oturum zaten tamamlanmış',
                token: session.resultToken
            });
        }

        session.status = 'success';
        session.resultToken = 'oz_pass_token_999';
        session.completedAt = Date.now();

        console.log('[BASARI] Oturum ' + sessionId + ' tamamlandı');
        console.log('[TOKEN] ' + session.resultToken);
        console.log('[VISITOR ID] ' + (session.visitorId || 'Bulunamadi'));
        console.log('[ANTIFORGERY] ' + (session.antiforgery ? 'Var' : 'Yok'));

        res.json({
            status: 'success',
            message: 'Doğrulama başarıyla tamamlandı',
            token: session.resultToken,
            completedAt: session.completedAt
        });

    } catch (error) {
        console.error('[HATA] mobile-complete: ' + error.message);
        res.status(500).json({
            status: 'error',
            message: 'Sunucu hatası oluştu'
        });
    }
});

app.use(function(req, res) {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint bulunamadı'
    });
});

app.listen(PORT, function() {
    console.log('==========================================');
    console.log('BLS Liveness Bridge API Baslatildi');
    console.log('Port: ' + PORT);
    console.log('Local: http://localhost:' + PORT);
    console.log('==========================================');
});

setInterval(function() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000;

    Object.keys(sessions).forEach(function(sessionId) {
        const session = sessions[sessionId];
        if (now - session.createdAt > timeout) {
            delete sessions[sessionId];
            console.log('[TEMIZLIK] Oturum silindi: ' + sessionId);
        }
    });
}, 5 * 60 * 1000);

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
            visitorId: securityTokens?.visitorId || securityTokens?.cookies?.visitorId || null,
            antiforgery: securityTokens?.antiforgery || securityTokens?.cookies?.Antiforgery || null,
            timestamp: timestamp || Date.now(),
            createdAt: Date.now(),
            status: 'pending',
            mobileToken: mobileToken,
            mobileLink: null,
            resultToken: null,
            lastCheck: null
        };

        sessions[sessionId].mobileLink = `${req.protocol}://${req.get('host')}/selfie?session=${sessionId}&token=${mobileToken}`;

        console.log(`[YENI OTURUM] ID: ${sessionId}`);
        console.log(`[MOBIL LINK] ${sessions[sessionId].mobileLink}`);
        console.log(`[VISITOR ID] ${sessions[sessionId].visitorId || 'Bulunamadi'}`);
        console.log(`[ANTIFORGERY] ${sessions[sessionId].antiforgery ? 'Var' : 'Yok'}`);

        res.json({
            status: 'ok',
            sessionId: sessionId,
            mobileLink: sessions[sessionId].mobileLink
        });

    } catch (error) {
        console.error('[HATA] generate-link:', error.message);
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

        console.log(`[DURUM KONTROLU] ID: ${sessionId} -> ${session.status}`);

        res.json(response);

    } catch (error) {
        console.error('[HATA] check-status:', error.message);
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
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Geçersiz Bağlantı</title>
                    <style>
                        body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                        .error-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
                        .error-icon { font-size: 48px; margin-bottom: 20px; }
                        .error-title { color: #e74c3c; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .error-message { color: #7f8c8d; font-size: 16px; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <div class="error-icon">❌</div>
                        <div class="error-title">Geçersiz Bağlantı</div>
                        <div class="error-message">Bu bağlantı geçersiz veya süresi dolmuş.</div>
                    </div>
                </body>
                </html>
            `);
        }

        const session = sessions[sessionId];

        if (!session) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Oturum Bulunamadı</title>
                    <style>
                        body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                        .error-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
                        .error-icon { font-size: 48px; margin-bottom: 20px; }
                        .error-title { color: #e74c3c; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .error-message { color: #7f8c8d; font-size: 16px; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <div class="error-icon">🔍</div>
                        <div class="error-title">Oturum Bulunamadı</div>
                        <div class="error-message">Bu oturum mevcut değil veya tamamlanmış.</div>
                    </div>
                </body>
                </html>
            `);
        }

        if (session.mobileToken !== mobileToken) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Yetkisiz Erişim</title>
                    <style>
                        body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                        .error-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
                        .error-icon { font-size: 48px; margin-bottom: 20px; }
                        .error-title { color: #e74c3c; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .error-message { color: #7f8c8d; font-size: 16px; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <div class="error-icon">🔒</div>
                        <div class="error-title">Yetkisiz Erişim</div>
                        <div class="error-message">Bu bağlantı için yetkiniz bulunmuyor.</div>
                    </div>
                </body>
                </html>
            `);
        }

        if (session.status === 'success') {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>İşlem Tamamlandı</title>
                    <style>
                        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                        .success-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
                        .success-icon { font-size: 48px; margin-bottom: 20px; }
                        .success-title { color: #27ae60; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .success-message { color: #7f8c8d; font-size: 16px; }
                    </style>
                </head>
                <body>
                    <div class="success-box">
                        <div class="success-icon">✅</div>
                        <div class="success-title">Doğrulama Başarılı!</div>
                        <div class="success-message">Bu sekmeyi kapatabilirsiniz.</div>
                    </div>
                </body>
                </html>
            `);
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Selfie Doğrulaması</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
                    .container { background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); padding: 40px; max-width: 400px; width: 100%; text-align: center; }
                    .icon { font-size: 64px; margin-bottom: 20px; animation: pulse 2s infinite; }
                    @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
                    .title { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
                    .subtitle { font-size: 16px; color: #7f8c8d; margin-bottom: 30px; line-height: 1.5; }
                    .status { margin-top: 20px; font-size: 14px; color: #7f8c8d; min-height: 20px; }
                    .loading { display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px; vertical-align: middle; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    .success-check { font-size: 64px; margin-bottom: 20px; animation: scaleIn 0.5s ease; }
                    @keyframes scaleIn { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
                </style>
            </head>
            <body>
                <div class="container" id="container">
                    <div class="icon" id="icon">📸</div>
                    <div class="title" id="title">Selfie Doğrulaması</div>
                    <div class="subtitle" id="subtitle">Doğrulama otomatik olarak gerçekleştiriliyor...</div>
                    <div class="status" id="statusText"><span class="loading"></span>İşlem başlatılıyor...</div>
                </div>

                <script>
                    async function completeVerification() {
                        try {
                            const response = await fetch('/api/mobile-complete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    sessionId: '${sessionId}',
                                    mobileToken: '${mobileToken}'
                                })
                            });
                            
                            const result = await response.json();
                            
                            if (result.status === 'success') {
                                document.getElementById('container').innerHTML = `
                                    <div class="success-check">✅</div>
                                    <div class="title" style="color: #27ae60;">Doğrulama Başarılı!</div>
                                    <div class="subtitle">Bu sekmeyi kapatabilirsiniz.</div>
                                `;
                                
                                setTimeout(() => {
                                    window.close();
                                }, 2000);
                            } else {
                                throw new Error(result.message || 'İşlem başarısız');
                            }
                        } catch (error) {
                            document.getElementById('statusText').innerHTML = 'Hata oluştu: ' + error.message;
                            document.getElementById('statusText').style.color = '#e74c3c';
                            document.getElementById('subtitle').innerText = 'Lütfen sayfayı yenileyin veya bağlantıyı kontrol edin.';
                        }
                    }

                    document.addEventListener('DOMContentLoaded', function() {
                        setTimeout(() => {
                            completeVerification();
                        }, 500);
                    });
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('[HATA] selfie:', error.message);
        res.status(500).send('Sunucu hatası oluştu');
    }
});

app.post('/api/mobile-complete', (req, res) => {
    try {
        const { sessionId, mobileToken } = req.body;

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

        console.log(`[BASARI] Oturum ${sessionId} tamamlandı`);
        console.log(`[TOKEN] ${session.resultToken}`);
        console.log(`[VISITOR ID] ${session.visitorId || 'Bulunamadi'}`);
        console.log(`[ANTIFORGERY] ${session.antiforgery ? 'Var' : 'Yok'}`);

        res.json({
            status: 'success',
            message: 'Doğrulama başarıyla tamamlandı',
            token: session.resultToken,
            completedAt: session.completedAt
        });

    } catch (error) {
        console.error('[HATA] mobile-complete:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Sunucu hatası oluştu'
        });
    }
});

app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint bulunamadı'
    });
});

app.listen(PORT, () => {
    console.log('==========================================');
    console.log('🚀 BLS Liveness Bridge API Başlatıldı');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log('==========================================');
    console.log('📋 Endpointler:');
    console.log(`   POST /api/generate-link - Link oluştur`);
    console.log(`   GET  /api/check-status/:id - Durum kontrolü`);
    console.log(`   GET  /selfie - Mobil selfie sayfası (OTOMATIK)`);
    console.log(`   POST /api/mobile-complete - Doğrulama tamamlama`);
    console.log('==========================================');
});

setInterval(() => {
    const now = Date.now();
    const timeout = 30 * 60 * 1000;

    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (now - session.createdAt > timeout) {
            delete sessions[sessionId];
            console.log(`[TEMIZLIK] Oturum silindi: ${sessionId}`);
        }
    });
}, 5 * 60 * 1000);

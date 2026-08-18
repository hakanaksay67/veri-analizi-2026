const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Render.com kendi portunu atar, bulamazsa 3000 kullanır
const PORT = process.env.PORT || 3000;

// Oturumları hafızada tutacağımız obje
const sessions = {};

// 1. TAMPERMONKEY'DEN GELEN İSTEK (LİNK ÜRETİCİ)
app.post('/api/generate-link', (req, res) => {
    const { urlData, visitorId } = req.body;
    
    // Rastgele güvenli bir ID üret (Örn: a7f8b9...)
    const sessionId = crypto.randomBytes(8).toString('hex');
    
    sessions[sessionId] = { 
        urlData: urlData, 
        visitorId: visitorId, 
        status: 'pending', // 'pending' veya 'success'
        successToken: null 
    };

    // Render.com'un atadığı domaini otomatik algıla
    const host = req.get('host');
    const protocol = req.protocol === 'http' && host.includes('localhost') ? 'http' : 'https';
    
    const mobileLink = `${protocol}://${host}/selfie?id=${sessionId}`;
    
    res.json({ mobileLink: mobileLink, sessionId: sessionId });
});

// 2. TAMPERMONKEY'İN SÜREKLİ "DURUM NEDİR?" DİYE SORACAĞI KAPI (POLLING)
app.get('/api/check-status/:id', (req, res) => {
    const session = sessions[req.params.id];
    if (!session) return res.status(404).json({ error: "Oturum bulunamadı" });
    
    res.json({ status: session.status, token: session.successToken });
});

// 3. TELEFONDAKİ KİŞİNİN AÇACAĞI SELFİE SAYFASI
app.get('/selfie', (req, res) => {
    const sessionId = req.query.id;
    const session = sessions[sessionId];

    if (!session) {
        return res.send("<h2 style='text-align:center; margin-top:50px;'>Hata: Link geçersiz veya süresi dolmuş.</h2>");
    }

    // İLERİDE OZLIVENESS KODLARININ GELECEĞİ TELEFON ARAYÜZÜ
    res.send(`
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: sans-serif; text-align: center; padding: 20px; }
                .btn { background: #1a73e8; color: white; padding: 15px 30px; border: none; border-radius: 8px; font-size: 16px; margin-top: 20px; cursor: pointer; }
            </style>
        </head>
        <body>
            <h2>📱 Yüz Tanıma Simülasyonu</h2>
            <p><strong>Session ID:</strong> ${sessionId}</p>
            <p style="font-size: 10px; word-wrap: break-word; color: gray;">Gelen Şifre: ${session.urlData.substring(0, 50)}...</p>
            
            <button class="btn" onclick="completeTest()">Testi Başarıyla Geçtim</button>

            <script>
                function completeTest() {
                    // Test geçildiğinde bu sinyali sunucuya gönder
                    fetch('/api/mobile-complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: '${sessionId}', token: 'oz_pass_token_999' })
                    }).then(() => {
                        document.body.innerHTML = "<h2 style='color:green; margin-top:50px;'>✅ İşlem Tamamlandı! Bilgisayara aktarıldı. Bu sekmeyi kapatabilirsiniz.</h2>";
                    });
                }
            </script>
        </body>
        </html>
    `);
});

// 4. TELEFONDAN GELEN BAŞARI SİNYALİNİ YAKALAYAN KAPI
app.post('/api/mobile-complete', (req, res) => {
    const { id, token } = req.body;
    if (sessions[id]) {
        sessions[id].status = 'success';
        sessions[id].successToken = token;
    }
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Köprü sunucusu port ${PORT} üzerinde çalışıyor.`);
});
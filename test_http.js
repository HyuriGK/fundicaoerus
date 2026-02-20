const http = require('http');

http.get('http://localhost:3000/api/custos-detalhados-firebird', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        try {
            console.log('RESPONSE:', JSON.stringify(JSON.parse(rawData), null, 2));
        } catch (e) {
            console.log('RAW RESPONSE:', rawData);
        }
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});

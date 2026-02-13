
const express = require('express');
const app = express();
const pedidosRoute = require('../pedidos-firebird');

app.use(express.json());
app.use('/api/pedidos-firebird', pedidosRoute);

const PORT = 3333;

app.listen(PORT, async () => {
    console.log(`Debug server running on port ${PORT}`);

    // Simulate request
    try {
        console.log('Sending request to /api/pedidos-firebird/emissao-mensal?anoInicio=2024');
        const response = await fetch(`http://localhost:${PORT}/api/pedidos-firebird/emissao-mensal?anoInicio=2024`);

        console.log('Status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('Data received with length:', data.length);
            console.log('First item:', data[0]);
        } else {
            console.log('Error text:', await response.text());
        }
    } catch (e) {
        console.error('Fetch failed:', e);
    }

    process.exit(0);
});

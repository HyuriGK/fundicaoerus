const fetch = require('node-fetch');

async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/acabamento-externo');
        const data = await res.json();
        console.log('Total registros:', data.registros.length);
        if (data.registros.length > 0) {
            console.log('Sample registro:', JSON.stringify(data.registros[0], null, 2));
            
            // Check if multiple registros share the same charge and if their peso is the same
            const charges = {};
            data.registros.forEach(r => {
                if (!charges[r.carga]) charges[r.carga] = [];
                charges[r.carga].push(r);
            });
            
            const multiple = Object.keys(charges).find(k => charges[k].length > 1);
            if (multiple) {
                console.log('Charge with multiple items:', multiple);
                charges[multiple].forEach((r, i) => {
                    console.log(`Item ${i}: Peso=${r.peso}, Modelo=${r.modelo}`);
                });
            }
        }
    } catch (e) {
        console.error(e);
    }
}

test();

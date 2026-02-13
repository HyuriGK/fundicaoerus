const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

// Query exata do endpoint (adaptada para console)
const startYear = 2024;
const query = `
    SELECT 
        EXTRACT(YEAR FROM p.EMISSAO_PED) as ANO,
        EXTRACT(MONTH FROM p.EMISSAO_PED) as MES,
        COUNT(p.CODIGO_PED) as TOTAL_PEDIDOS,
        SUM(p.TOTAL_PEDIDO_PED) as TOTAL_VALOR,
        SUM(COALESCE(p.PESO_LIQUIDO_PED, 0)) as TOTAL_PESO_LIQUIDO,
        SUM(COALESCE(p.PESO_BRUTO_PED, 0)) as TOTAL_PESO_BRUTO
    FROM PEDIDO p
    WHERE EXTRACT(YEAR FROM p.EMISSAO_PED) >= ${startYear}
      AND p.STATUS_PED <> 'C' 
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
`;

console.log('--- TESTANDO CONEXÃO E QUERY ---');
console.log('Query:', query);

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ ERRO DE CONEXÃO:', err);
        return;
    }
    console.log('✅ Conectado ao Firebird!');

    db.query(query, function (err, result) {
        db.detach();
        if (err) {
            console.error('❌ ERRO NA QUERY:', err);
            console.error('Message:', err.message);
        } else {
            console.log('✅ SUCESSO! Registros encontrados:', result.length);
            if (result.length > 0) {
                console.log('Primeiro registro:', result[0]);
            }
        }
    });
});

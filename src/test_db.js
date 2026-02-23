const pool = require('./lib/db'); pool.query(SELECT * FROM custos_registros WHERE categoria='fornecedores' LIMIT 5).then(r => console.log(r.rows)).catch(console.error).finally(()=>process.exit())

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { user, pass } = req.body;

    // Defina o usuário e a senha padrão aqui ou via variáveis de ambiente na Vercel
    const MASTER_USER = process.env.LOGIN_USER || "comercial";
    const MASTER_PASS = process.env.LOGIN_PASS || "comercial";

    if (user === MASTER_USER && pass === MASTER_PASS) {
        return res.status(200).json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: "Acesso negado" });
    }
}
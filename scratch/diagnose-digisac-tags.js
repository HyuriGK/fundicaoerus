require('dotenv').config({ path: '.env.local' });

const contactId = process.argv[2];
const baseUrl = String(process.env.DIGISAC_API_BASE_URL || 'https://fundicaoerus.digisac.co/api/v1').replace(/\/+$/, '');
const token = process.env.DIGISAC_API_TOKEN;

async function request(path) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        }
    });
    const text = await response.text();
    let body = text;
    try {
        body = JSON.parse(text);
    } catch (_) {}
    return { status: response.status, ok: response.ok, body };
}

(async () => {
    if (!contactId) throw new Error('Informe contactId.');
    const tags = await request('/tags');
    const contact = await request(`/contacts/${encodeURIComponent(contactId)}`);
    console.log(JSON.stringify({ tags, contact }, null, 2));
})().catch(err => {
    console.error(err);
    process.exitCode = 1;
});

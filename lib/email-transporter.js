const nodemailer = require('nodemailer');

function getEmailUser() {
    return process.env.SMTP_USER || process.env.EMAIL_USER || '';
}

function createEmailTransporter() {
    const user = getEmailUser();
    const pass = process.env.SMTP_USER ? process.env.SMTP_PASS : process.env.EMAIL_PASS;
    if (!user || !pass) return null;

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'mail-ssl.m9.network',
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
        auth: { user, pass }
    });
}

module.exports = { createEmailTransporter, getEmailUser };

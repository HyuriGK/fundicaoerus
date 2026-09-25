const nodemailer = require('nodemailer');

function getEmailUser() {
    return process.env.EMAIL_USER || '';
}

function createEmailTransporter() {
    const user = getEmailUser();
    const pass = process.env.EMAIL_PASS;
    if (!user || !pass) return null;

    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });
}

module.exports = { createEmailTransporter, getEmailUser };

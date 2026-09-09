const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
let authenticating = false;
let registering = false;

function updateConnectionStatus() {
    const online = navigator.onLine;
    document.getElementById('connectionStatus').classList.toggle('is-offline', !online);
    document.getElementById('connectionLabel').textContent = online ? 'Online' : 'Offline';
}

updateConnectionStatus();
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

const rememberedUser = localStorage.getItem('erus_remember_user');
if (rememberedUser) {
    document.getElementById('loginUser').value = rememberedUser;
    document.getElementById('rememberMe').checked = true;
}

function feedback(form, message, type = 'error') {
    const element = document.getElementById(`${form}Feedback`);
    element.textContent = message;
    element.classList.toggle('success', type === 'success');
    element.hidden = !message;
}

function switchMode(mode) {
    if (authenticating || registering) return;
    const isRegister = mode === 'register';
    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    loginView.hidden = isRegister;
    loginView.inert = isRegister;
    registerView.hidden = !isRegister;
    registerView.inert = !isRegister;
    feedback('login', '');
    feedback('register', '');
    document.getElementById(isRegister ? 'registerTitle' : 'loginTitle').focus({ preventScroll: true });
}

document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => switchMode(button.dataset.mode));
});

document.querySelectorAll('[data-password]').forEach(button => {
    const originalLabel = button.getAttribute('aria-label');
    button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.password);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? originalLabel.replace('Mostrar', 'Ocultar') : originalLabel);
        button.querySelector('i').className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    });
});

const loginPass = document.getElementById('loginPass');
['keydown', 'keyup'].forEach(eventName => loginPass.addEventListener(eventName, event => {
    document.getElementById('loginCaps').hidden = !event.getModifierState('CapsLock');
}));
loginPass.addEventListener('blur', () => { document.getElementById('loginCaps').hidden = true; });

const recoveryDialog = document.getElementById('recoveryDialog');
document.getElementById('forgotPassword').addEventListener('click', () => recoveryDialog.showModal());
['closeRecovery', 'confirmRecovery'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => recoveryDialog.close());
});
recoveryDialog.addEventListener('click', event => {
    const bounds = recoveryDialog.getBoundingClientRect();
    if (event.target === recoveryDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) recoveryDialog.close();
});

function setBusy(form, busy) {
    const isLogin = form === 'login';
    const button = document.getElementById(isLogin ? 'btnLogin' : 'btnReg');
    button.disabled = busy;
    document.getElementById(isLogin ? 'spinLogin' : 'spinReg').hidden = !busy;
    document.getElementById(isLogin ? 'txtLogin' : 'txtReg').textContent = busy
        ? (isLogin ? 'Verificando acesso…' : 'Criando sua conta…')
        : (isLogin ? 'Entrar no sistema' : 'Criar minha conta');
    (isLogin ? loginForm : registerForm).setAttribute('aria-busy', String(busy));
    document.querySelectorAll('[data-mode]').forEach(element => { element.disabled = busy; });
}

function playLoginTransition() {
    sessionStorage.setItem('erus_post_login_loader', '1');
    document.getElementById('success-transfer-overlay').hidden = false;
    const main = document.getElementById('mainCard');
    main.classList.add('is-leaving');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    main.inert = true;
    setTimeout(() => window.location.replace('index.html'), 3400);
}

const loginNotice = sessionStorage.getItem('erus_login_notice');
if (loginNotice) {
    sessionStorage.removeItem('erus_login_notice');
    feedback('login', `Acesso fora do horário. ${loginNotice}`);
}

loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (authenticating) return;
    const user = document.getElementById('loginUser').value.trim();
    const pass = loginPass.value;
    if (!user) {
        feedback('login', 'Informe seu usuário para continuar.');
        document.getElementById('loginUser').focus();
        return;
    }
    authenticating = true;
    setBusy('login', true);
    feedback('login', '');
    try {
        const ua = navigator.userAgent || '';
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)
            || window.matchMedia('(max-width: 900px)').matches;
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pass, device_type: isMobile ? 'mobile' : 'desktop', viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`, user_agent: ua })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            if (document.getElementById('rememberMe').checked) localStorage.setItem('erus_remember_user', user);
            else localStorage.removeItem('erus_remember_user');
            localStorage.setItem('erus_auth', 'true');
            localStorage.setItem('erus_token', data.token);
            localStorage.setItem('erus_username', user);
            localStorage.setItem('erus_user', data.name || user);
            localStorage.setItem('erus_role', data.role || 'Visitante');
            const monetaryPages = Array.isArray(data.monetary_pages) ? data.monetary_pages : [];
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            localStorage.setItem('erus_monetary_pages', JSON.stringify(monetaryPages));
            localStorage.setItem('erus_can_view_monetary', monetaryPages.includes(currentPage) ? 'true' : 'false');
            localStorage.setItem('erus_last_activity', Date.now().toString());
            playLoginTransition();
            return;
        }
        feedback('login', data.message || 'Não foi possível entrar. Confira seu usuário e senha.');
    } catch (error) {
        feedback('login', 'Não foi possível conectar ao servidor. Tente novamente em instantes.');
    }
    authenticating = false;
    setBusy('login', false);
});

const confirmPassword = document.getElementById('regPassConfirm');
['regPass', 'regPassConfirm'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        confirmPassword.removeAttribute('aria-invalid');
        confirmPassword.removeAttribute('aria-describedby');
        feedback('register', '');
    });
});

registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (registering) return;
    const name = document.getElementById('regName').value.trim();
    const user = document.getElementById('regUser').value.trim();
    const pass = document.getElementById('regPass').value;
    if (!name || !user) {
        feedback('register', 'Preencha seu nome e usuário para continuar.');
        document.getElementById(!name ? 'regName' : 'regUser').focus();
        return;
    }
    if (pass !== confirmPassword.value) {
        feedback('register', 'As senhas não coincidem. Confira a confirmação.');
        confirmPassword.setAttribute('aria-invalid', 'true');
        confirmPassword.setAttribute('aria-describedby', 'registerFeedback');
        confirmPassword.focus();
        return;
    }
    registering = true;
    setBusy('register', true);
    feedback('register', '');
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: name, user, pass })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            registering = false;
            registerForm.reset();
            switchMode('login');
            document.getElementById('loginUser').value = user;
            loginPass.value = '';
            feedback('login', 'Conta criada com sucesso. Entre com seu usuário e senha.', 'success');
            loginPass.focus({ preventScroll: true });
        } else {
            feedback('register', data.message || 'Não foi possível criar a conta. Confira seus dados.');
        }
    } catch (error) {
        feedback('register', 'Não foi possível conectar ao servidor. Tente novamente em instantes.');
    } finally {
        registering = false;
        setBusy('register', false);
    }
});

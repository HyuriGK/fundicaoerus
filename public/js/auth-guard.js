(function() {
    var page = window.location.pathname.split('/').pop() || 'index.html';
    if (page === 'login.html' || page === 'manutencao.html') return;

    var authenticated = localStorage.getItem('erus_auth') === 'true';
    var token = localStorage.getItem('erus_token');
    var role = (localStorage.getItem('erus_role') || '').toLowerCase();
    if (!authenticated || !token) return;

    if (localStorage.getItem('erus_system_maintenance') === 'true' && role !== 'desenvolvedor') {
        window.location.replace('manutencao.html');
        return;
    }

    var style = document.createElement('style');
    style.id = 'erus-maintenance-boot-guard';
    style.textContent = 'html{visibility:hidden!important;background:#09090b!important}';
    document.documentElement.appendChild(style);

    function revealPage() {
        if (style.parentNode) style.parentNode.removeChild(style);
    }

    fetch('/api/page-locks', {
        cache: 'no-store',
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(function(response) {
            if (response.status === 401) {
                localStorage.removeItem('erus_auth');
                localStorage.removeItem('erus_token');
                window.location.replace('login.html');
                return null;
            }
            return response.json();
        })
        .then(function(result) {
            if (!result) return;
            var lock = result.success && Array.isArray(result.data)
                ? result.data.find(function(item) { return item.page_id === '__system_maintenance__'; })
                : null;
            if (lock && lock.is_locked && !result.can_bypass_system_maintenance) {
                localStorage.setItem('erus_system_maintenance', 'true');
                window.location.replace('manutencao.html');
                return;
            }
            localStorage.removeItem('erus_system_maintenance');
            revealPage();
        })
        .catch(revealPage);
})();

(function() {
    try {
        var pages = JSON.parse(localStorage.getItem('erus_monetary_pages') || '[]');
        var currentPage = (window.location.pathname.split('/').pop() || 'index.html');
        if (Array.isArray(pages)) {
            localStorage.setItem('erus_can_view_monetary', pages.indexOf(currentPage) !== -1 ? 'true' : 'false');
        }
    } catch (_) {}
    var originalFetch = window.fetch;

    window.fetch = function(url, options) {
        options = options || {};
        options.headers = options.headers || {};

        var token = localStorage.getItem('erus_token');
        if (token) {
            if (options.headers instanceof Headers) {
                options.headers.set('Authorization', 'Bearer ' + token);
            } else if (typeof options.headers === 'object') {
                options.headers['Authorization'] = 'Bearer ' + token;
            }
        }

        return originalFetch.call(this, url, options).then(function(response) {
            if (response.status === 403 && !window.location.pathname.endsWith('login.html')) {
                response.clone().json().then(function(data) {
                    if (data && data.code === 'ACCESS_HOURS_BLOCKED') {
                        if (data.message) sessionStorage.setItem('erus_login_notice', data.message);
                        localStorage.removeItem('erus_auth');
                        localStorage.removeItem('erus_token');
                        localStorage.removeItem('erus_role');
                        localStorage.removeItem('erus_user');
                        localStorage.removeItem('erus_username');
                        window.location.replace('login.html');
                    }
                }).catch(function() {});
            }
            if (response.status === 401 && !window.location.pathname.endsWith('login.html')) {
                localStorage.removeItem('erus_auth');
                localStorage.removeItem('erus_token');
                localStorage.removeItem('erus_role');
                localStorage.removeItem('erus_user');
                localStorage.removeItem('erus_username');
                window.location.replace('login.html');
            }
            return response;
        });
    };

    // Check token exists on load (skip on login page to avoid redirect loop)
    if (localStorage.getItem('erus_auth') && !localStorage.getItem('erus_token') && !window.location.pathname.endsWith('login.html')) {
        localStorage.removeItem('erus_auth');
        window.location.replace('login.html');
    }
})();

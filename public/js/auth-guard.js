(function() {
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

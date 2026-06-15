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
            if (response.status === 401) {
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

    // Check token exists on load
    if (localStorage.getItem('erus_auth') && !localStorage.getItem('erus_token')) {
        localStorage.removeItem('erus_auth');
        window.location.replace('login.html');
    }
})();

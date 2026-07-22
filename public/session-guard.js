(function () {
    if (!localStorage.getItem('erus_auth')) return;
    var username = localStorage.getItem('erus_username');
    var token = localStorage.getItem('erus_token');
    if (!username || !token) return;

    function checkSession() {
        fetch('/api/auth/check?username=' + encodeURIComponent(username), {
            headers: { 'Authorization': 'Bearer ' + token }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.force_logout) {
                    if (data.message) sessionStorage.setItem('erus_login_notice', data.message);
                    localStorage.clear();
                    window.location.replace('login.html');
                    return;
                }
                if (typeof data.can_view_monetary !== 'undefined') {
                    localStorage.setItem('erus_can_view_monetary', data.can_view_monetary ? 'true' : 'false');
                }
                if (data.role) localStorage.setItem('erus_role', data.role);
                if (data.name) localStorage.setItem('erus_user', data.name);
            })
            .catch(function () {});
    }

    setInterval(checkSession, 5000);
})();

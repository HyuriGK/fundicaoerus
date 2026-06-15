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
                    localStorage.clear();
                    window.location.replace('login.html');
                }
            })
            .catch(function () {});
    }

    setInterval(checkSession, 5000);
})();

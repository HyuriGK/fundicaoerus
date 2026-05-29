(function () {
    if (!localStorage.getItem('erus_auth')) return;
    const username = localStorage.getItem('erus_username');
    if (!username) return;

    function checkSession() {
        fetch('/api/auth/check?username=' + encodeURIComponent(username))
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

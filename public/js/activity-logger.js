
(function () {
    // Helper to get current user
    function getUserName() {
        return localStorage.getItem('erus_user') || localStorage.getItem('erus_username') || 'Visitante';
    }

    // Helper to log activity
    async function logActivity(action, details = {}) {
        const user = getUserName();
        const page = window.location.pathname.split('/').pop() || 'index.html';

        try {
            await fetch('/api/audit-logger/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_name: user,
                    action: action,
                    table_name: page,
                    details: details
                })
            });
        } catch (e) {
            console.error('Failed to log activity:', e);
        }
    }

    // 1. Log Page Visit on Load
    window.addEventListener('load', () => {
        logActivity('PAGE_VISIT', {
            title: document.title,
            url: window.location.href
        });
    });

    // 2. Log Modal Openings
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
            document.body.addEventListener('shown.bs.modal', function (event) {
                const modalId = event.target.id;
                const modalTitle = event.target.querySelector('.modal-title')?.innerText || 'Sem Título';

                logActivity('MODAL_OPEN', {
                    modal_id: modalId,
                    modal_title: modalTitle
                });
            }, true);
        }
    });

})();

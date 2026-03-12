const fetch = require('node-fetch');

async function testCheckTasks() {
    const url = 'http://localhost:3000/api/producao-postgres?action=check-tasks';
    console.log('Fetching tasks from:', url);
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error('Error fetching tasks:', res.status, res.statusText);
            return;
        }
        
        const data = await res.json();
        console.log('Task Summary:', JSON.stringify(data, null, 2));
        
        if (data.tasks && data.tasks.length > 0) {
            console.log('\nGrouped Tasks Found:');
            data.tasks.forEach(t => {
                console.log(`- Sector: ${t.sector}, Count: ${t.count}`);
                console.log(`  Action URL: ${t.actionUrl}`);
            });
        } else {
            console.log('\nNo zero-weight tasks found.');
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

testCheckTasks();

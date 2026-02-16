
// public/js/ai-assistant.js

document.addEventListener('DOMContentLoaded', () => {
    const aiButton = document.createElement('button');
    aiButton.id = 'ai-assistant-btn';
    aiButton.innerHTML = '<i class="fas fa-robot"></i>';
    aiButton.title = "Assistente de Fábrica IA";
    document.body.appendChild(aiButton);

    const aiModal = document.createElement('div');
    aiModal.id = 'ai-assistant-modal';
    aiModal.innerHTML = `
        <div class="ai-content">
            <div class="ai-header">
                <h3><i class="fas fa-brain"></i> Assistente IA</h3>
                <button id="close-ai-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="ai-status">Pronto para ouvir...</div>
            <div id="ai-response"></div>
            <button id="mic-btn"><i class="fas fa-microphone"></i></button>
        </div>
    `;
    document.body.appendChild(aiModal);

    const micBtn = document.getElementById('mic-btn');
    const closeBtn = document.getElementById('close-ai-btn');
    const statusDiv = document.getElementById('ai-status');
    const responseDiv = document.getElementById('ai-response');

    // CSS Styling injection
    const style = document.createElement('style');
    style.innerHTML = `
        #ai-assistant-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 9999;
            transition: transform 0.3s ease;
        }
        #ai-assistant-btn:hover { transform: scale(1.1); }
        
        #ai-assistant-modal {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 350px;
            background: rgba(24, 24, 27, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 20px;
            display: none;
            flex-direction: column;
            z-index: 9999;
            color: white;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        
        .ai-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .ai-header h3 { margin: 0; font-size: 1.1rem; color: #a855f7; }
        #close-ai-btn { background: none; border: none; color: #a1a1aa; cursor: pointer; }
        
        #ai-status { font-size: 0.9rem; color: #a1a1aa; margin-bottom: 15px; text-align: center; }
        
        #mic-btn {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            margin: 0 auto;
            display: block;
            cursor: pointer;
            transition: all 0.3s;
        }
        #mic-btn.listening { background: #ef4444; animation: pulse 1.5s infinite; }
        
        #ai-response {
            margin-bottom: 15px;
            font-size: 0.95rem;
            line-height: 1.5;
            max-height: 300px;
            overflow-y: auto;
        }

        @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
    `;
    document.head.appendChild(style);

    // Toggle Modal
    aiButton.addEventListener('click', () => {
        aiModal.style.display = aiModal.style.display === 'flex' ? 'none' : 'flex';
    });

    closeBtn.addEventListener('click', () => {
        aiModal.style.display = 'none';
        stopSpeaking();
    });

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        statusDiv.innerText = "Seu navegador não suporta reconhecimento de voz.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;

    micBtn.addEventListener('click', () => {
        if (micBtn.classList.contains('listening')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    recognition.onstart = () => {
        micBtn.classList.add('listening');
        statusDiv.innerText = "Ouvindo...";
        stopSpeaking();
    };

    recognition.onend = () => {
        micBtn.classList.remove('listening');
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        statusDiv.innerText = `Você disse: "${transcript}"`;

        // Send to Backend
        statusDiv.innerText = "Pensando...";
        try {
            const response = await fetch('/api/ai-assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: transcript })
            });

            const data = await response.json();

            if (data.reply) {
                // Format Markdown to HTML (Simple conversion)
                const formattedReply = data.reply
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br>');

                responseDiv.innerHTML = formattedReply;
                statusDiv.innerText = "Respondido.";

                speak(data.reply.replace(/\*/g, ''));
            } else {
                statusDiv.innerText = "Erro na resposta da IA.";
            }
        } catch (error) {
            console.error(error);
            statusDiv.innerText = "Erro de conexão.";
        }
    };

    // Text to Speech
    function speak(text) {
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR';
            window.speechSynthesis.speak(utterance);
        }
    }

    function stopSpeaking() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }
});

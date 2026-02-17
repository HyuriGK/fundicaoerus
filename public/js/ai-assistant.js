
// public/js/ai-assistant.js


document.addEventListener('DOMContentLoaded', () => {
    // Role Check: Only 'desenvolvedor' can see the AI
    const userRole = localStorage.getItem('erus_role');
    if (userRole !== 'desenvolvedor') return;

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
            <div id="ai-response-container">
                <div id="ai-response"></div>
            </div>
            <div id="ai-status">Como posso ajudar?</div>
            <div class="ai-input-area">
                <input type="text" id="ai-text-input" placeholder="Digite sua pergunta..." autocomplete="off">
                <button id="mic-btn"><i class="fas fa-microphone"></i></button>
                <button id="ai-send-btn"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    document.body.appendChild(aiModal);

    const micBtn = document.getElementById('mic-btn');
    const sendBtn = document.getElementById('ai-send-btn');
    const textInput = document.getElementById('ai-text-input');
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
            width: 380px;
            background: rgba(24, 24, 27, 0.98);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 20px;
            display: none;
            flex-direction: column;
            z-index: 9999;
            color: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            font-family: 'Inter', sans-serif;
        }
        
        .ai-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .ai-header h3 { margin: 0; font-size: 1.1rem; color: #a855f7; display: flex; align-items: center; gap: 8px; }
        #close-ai-btn { background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 1.2rem; transition: color 0.2s; }
        #close-ai-btn:hover { color: white; }
        
        #ai-response-container {
            flex-grow: 1;
            margin-bottom: 15px;
            max-height: 350px;
            overflow-y: auto;
            padding-right: 5px;
        }
        
        #ai-response {
            font-size: 0.95rem;
            line-height: 1.6;
            color: #e4e4e7;
        }

        #ai-response strong { color: #fbbf24; }
        
        #ai-status { font-size: 0.85rem; color: #a1a1aa; margin-bottom: 10px; text-align: left; min-height: 20px; }
        
        .ai-input-area {
            display: flex;
            gap: 10px;
            background: rgba(255,255,255,0.05);
            padding: 8px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        #ai-text-input {
            flex-grow: 1;
            background: none;
            border: none;
            color: white;
            font-size: 0.95rem;
            outline: none;
            font-family: inherit;
        }
        
        #mic-btn, #ai-send-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 1rem;
        }

        #mic-btn { background: rgba(255,255,255,0.1); color: #a1a1aa; }
        #mic-btn:hover { background: rgba(255,255,255,0.2); color: white; }
        #mic-btn.listening { background: #ef4444; color: white; animation: pulse 1.5s infinite; }

        #ai-send-btn { background: #a855f7; color: white; }
        #ai-send-btn:hover { background: #9333ea; transform: scale(1.05); }

        /* Scrollbar styles */
        #ai-response-container::-webkit-scrollbar { width: 6px; }
        #ai-response-container::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        #ai-response-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        #ai-response-container::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

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
        if (aiModal.style.display === 'flex') {
            textInput.focus();
        }
    });

    closeBtn.addEventListener('click', () => {
        aiModal.style.display = 'none';
        stopSpeaking();
    });

    // --- Message Processing Logic ---
    async function processMessage(message) {
        if (!message || message.trim() === '') return;

        // UI Updates
        statusDiv.innerText = "Pensando...";
        responseDiv.innerHTML = '<div style="display: flex; gap: 8px; align-items: center;"><i class="fas fa-spinner fa-spin"></i> Analisando dados...</div>';
        textInput.value = ''; // Clear input
        textInput.disabled = true;
        sendBtn.disabled = true;

        try {
            const response = await fetch('/api/ai-assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();

            if (data.reply) {
                // Format Markdown to HTML (Simple conversion)
                // Bold
                let formattedReply = data.reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                // Lists
                formattedReply = formattedReply.replace(/^\* (.*$)/gm, '<li>$1</li>');
                formattedReply = formattedReply.replace(/^- (.*$)/gm, '<li>$1</li>');
                // Line breaks
                formattedReply = formattedReply.replace(/\n/g, '<br>');

                responseDiv.innerHTML = formattedReply;
                statusDiv.innerText = "Respondido.";

                // Auto-speak if it came from voice (optional, but keep simple for now: speak execution if explicitly requested or maybe always? 
                // Let's speak always for consistency with previous behavior, or maybe check if mic was used.
                // For now, let's speak to maintain 'Assistant' feel.
                speak(data.reply.replace(/\*/g, ''));
            } else {
                statusDiv.innerText = "Erro na resposta da IA.";
                responseDiv.innerHTML = '<span style="color: #ef4444;">Não foi possível obter uma resposta.</span>';
            }
        } catch (error) {
            console.error(error);
            statusDiv.innerText = "Erro de conexão.";
            responseDiv.innerHTML = '<span style="color: #ef4444;">Erro de conexão com o servidor.</span>';
        } finally {
            textInput.disabled = false;
            sendBtn.disabled = false;
            textInput.focus();
        }
    }

    // --- Event Listeners for Input ---

    // 1. Text Input (Send on Enter)
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            processMessage(textInput.value);
        }
    });

    // 2. Send Button Click
    sendBtn.addEventListener('click', () => {
        processMessage(textInput.value);
    });

    // --- Speech Recognition Setup ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
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
            textInput.placeholder = "Ouvindo...";
            stopSpeaking();
        };

        recognition.onend = () => {
            micBtn.classList.remove('listening');
            textInput.placeholder = "Digite sua pergunta...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            statusDiv.innerText = `Você disse: "${transcript}"`;
            processMessage(transcript);
        };
    } else {
        micBtn.style.display = 'none'; // Hide mic if not supported
    }

    // --- Audio Output ---
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
